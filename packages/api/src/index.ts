import Fastify from "fastify";
import { getEnv } from "@agentfs/shared/src/env.js";
import { memoryRoutes } from "./routes/memory.js";
import { adminRoutes } from "./routes/admin.js";
import { register, httpRequests, httpDuration } from "./metrics.js";

async function main() {
  const env = getEnv();

  const app = Fastify({
    logger: true,
    bodyLimit: 1024 * 1024,      // 1MB max body size
    connectionTimeout: 30000,    // 30s connection timeout
    requestTimeout: 60000        // 60s request timeout
  });

  app.addHook("onResponse", async (req, reply) => {
    const route = req.routeOptions?.url ?? req.url;
    httpRequests.labels(route, req.method, String(reply.statusCode)).inc();
  });

  app.addHook("preHandler", async (req) => {
    const route = req.routeOptions?.url ?? req.url;
    const end = httpDuration.labels(route, req.method).startTimer();
    // @ts-expect-error timer property
    req.__agentfsTimerEnd = end;
  });

  app.addHook("onSend", async (req) => {
    // @ts-expect-error timer property
    const end = req.__agentfsTimerEnd;
    if (typeof end === "function") end();
  });

  app.get("/healthz", async () => ({ ok: true }));

  app.get("/metrics", async (_req, reply) => {
    reply.header("Content-Type", register.contentType);
    return reply.send(await register.metrics());
  });

  await memoryRoutes(app);
  await adminRoutes(app);

  app.setErrorHandler((err, _req, reply) => {
    // Detect Zod validation errors (they have an 'issues' array)
    if ((err as any).issues && Array.isArray((err as any).issues)) {
      const zodErr = err as any;
      const firstIssue = zodErr.issues[0];
      const message = firstIssue?.message ?? "Validation error";
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message } });
    }

    const status = (err as any).statusCode ?? 500;
    let code = (err as any).code ?? "INTERNAL";
    let message = (err as any).message ?? "Internal error";
    if (status >= 500 && env.NODE_ENV === "production") {
      // Avoid leaking internal details (DB errors, stack traces, upstream errors) in production.
      code = "INTERNAL";
      message = "Internal error";
    }
    reply.status(status).send({ error: { code, message } });
  });

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
