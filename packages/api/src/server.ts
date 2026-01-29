import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@agentos/shared/src/env.js";
import { register, httpRequests, httpDuration } from "./metrics.js";
import { memoryRoutes } from "./routes/memory.js";
import { adminRoutes } from "./routes/admin.js";
import { adminEmbeddingsRoutes } from "./routes/admin-embeddings.js";
import { signupRoutes } from "./routes/signup.js";
import { checkTokenBucket } from "./preauth-ratelimit.js";

function parseBearerToken(authHeader?: string): string | null {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1]!.trim();
  if (!token) return null;
  return token;
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function createApp(opts: { logger?: boolean } = {}): Promise<{ app: FastifyInstance; env: ReturnType<typeof getEnv> }> {
  const env = getEnv();

  const app = Fastify({
    logger: opts.logger ?? true,
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 1024 * 1024, // 1MB
    connectionTimeout: 30_000,
    requestTimeout: 60_000
  });

  await app.register(cors, {
    origin: [
      "https://agentos.software",
      "https://www.agentos.software",
      /^https?:\/\/localhost(:\d+)?$/,
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  });

  const log = (msg: string, meta?: Record<string, unknown>) => {
    if (typeof (app as any).log?.info === "function") (app as any).log.info(meta ?? {}, msg);
    else console.info(msg, meta ?? {});
  };

  const warn = (msg: string, meta?: Record<string, unknown>) => {
    if (typeof (app as any).log?.warn === "function") (app as any).log.warn(meta ?? {}, msg);
    else console.warn(msg, meta ?? {});
  };

  log("agentos config", {
    node_env: env.NODE_ENV,
    trust_proxy: env.TRUST_PROXY,
    enable_metrics: env.ENABLE_METRICS,
    metrics_token_set: Boolean(env.METRICS_TOKEN),
    preauth_rate_limit_per_minute: env.PREAUTH_RATE_LIMIT_PER_MINUTE
  });

  // Production config lint: best-effort guardrails against accidental insecure deploys.
  if (env.NODE_ENV === "production") {
    if (process.env.TRUST_PROXY === undefined) {
      warn("production config: TRUST_PROXY not explicitly set (defaults to false); verify reverse-proxy IP behavior", {
        trust_proxy_effective: env.TRUST_PROXY
      });
    }

    if (env.ENABLE_METRICS && !env.METRICS_TOKEN) {
      // This is also enforced below (throws). Warn here to make the intent obvious in logs.
      warn("production config: ENABLE_METRICS=true requires METRICS_TOKEN", {});
    }

    if (env.PREAUTH_RATE_LIMIT_PER_MINUTE <= 0) {
      warn("production config: PREAUTH_RATE_LIMIT_PER_MINUTE is disabled; consider enabling pre-auth throttling", {});
    }
  }

  // Minimal pre-auth throttling (per-process). Applies before auth verification and DB access.
  app.addHook("onRequest", async (req, reply) => {
    const url = req.url;
    if (!url.startsWith("/v1/")) return;
    if (env.PREAUTH_RATE_LIMIT_PER_MINUTE <= 0) return;

    const key = `ip:${req.ip}`;
    const result = checkTokenBucket(key, env.PREAUTH_RATE_LIMIT_PER_MINUTE, 60_000);
    reply.header("X-PreAuth-RateLimit-Limit", String(env.PREAUTH_RATE_LIMIT_PER_MINUTE));
    reply.header("X-PreAuth-RateLimit-Remaining", String(result.remaining));
    reply.header("X-PreAuth-RateLimit-Reset", String(Math.ceil(result.resetAtMs / 1000)));

    if (!result.allowed) {
      reply.header("Retry-After", String(Math.max(0, Math.ceil((result.resetAtMs - Date.now()) / 1000))));
      return reply.status(429).send({ error: { code: "PREAUTH_RATE_LIMIT_EXCEEDED", message: "Too many requests" } });
    }
  });

  app.addHook("onResponse", async (req, reply) => {
    const route = req.routeOptions?.url ?? req.url;
    httpRequests.labels(route, req.method, String(reply.statusCode)).inc();
  });

  app.addHook("preHandler", async (req) => {
    const route = req.routeOptions?.url ?? req.url;
    const end = httpDuration.labels(route, req.method).startTimer();
    // @ts-expect-error timer property
    req.__agentosTimerEnd = end;
  });

  app.addHook("onSend", async (req) => {
    // @ts-expect-error timer property
    const end = req.__agentosTimerEnd;
    if (typeof end === "function") end();
  });

  app.get("/healthz", async () => ({ ok: true }));

  if (env.ENABLE_METRICS) {
    if (env.NODE_ENV === "production" && !env.METRICS_TOKEN) {
      throw new Error("ENABLE_METRICS=true requires METRICS_TOKEN in production");
    }

    app.get("/metrics", async (req, reply) => {
      if (env.METRICS_TOKEN) {
        const token = parseBearerToken(req.headers.authorization);
        if (!token || !safeEqual(token, env.METRICS_TOKEN)) {
          return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
        }
      }

      reply.header("Content-Type", register.contentType);
      return reply.send(await register.metrics());
    });
  }

  await memoryRoutes(app);
  await adminRoutes(app);
  await adminEmbeddingsRoutes(app);
  await signupRoutes(app);

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
      code = "INTERNAL";
      message = "Internal error";
    }
    reply.status(status).send({ error: { code, message } });
  });

  return { app, env };
}
