import Fastify from "fastify";
import { getEnv } from "@agentfs/shared/src/env.js";
import { memoryRoutes } from "./routes/memory.js";
import { adminRoutes } from "./routes/admin.js";
import { register, httpRequests, httpDuration } from "./metrics.js";

async function main() {
  const env = getEnv();

  const app = Fastify({
    logger: true
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
    const status = (err as any).statusCode ?? 500;
    const code = (err as any).code ?? "INTERNAL";
    const message = (err as any).message ?? "Internal error";
    reply.status(status).send({ error: { code, message } });
  });

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
