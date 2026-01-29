import { describe, it, expect } from "vitest";
import { createApp } from "./server.js";

function withEnv<T>(patch: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(patch)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return fn().finally(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

describe("server", () => {
  it("should disable /metrics by default in production", async () => {
    await withEnv(
      { NODE_ENV: "production", ENABLE_METRICS: undefined, METRICS_TOKEN: "secret" },
      async () => {
        const { app } = await createApp({ logger: false });
        try {
          const res = await app.inject({ method: "GET", url: "/metrics" });
          expect(res.statusCode).toBe(404);
        } finally {
          await app.close();
        }
      }
    );
  });

  it("should require METRICS_TOKEN when ENABLE_METRICS=true in production", async () => {
    await withEnv(
      { NODE_ENV: "production", ENABLE_METRICS: "true", METRICS_TOKEN: "" },
      async () => {
        await expect(createApp({ logger: false })).rejects.toThrow(/METRICS_TOKEN/);
      }
    );
  });

  it("should gate /metrics with Bearer token when configured", async () => {
    await withEnv(
      { NODE_ENV: "production", ENABLE_METRICS: "true", METRICS_TOKEN: "secret-token" },
      async () => {
        const { app } = await createApp({ logger: false });
        try {
          const noAuth = await app.inject({ method: "GET", url: "/metrics" });
          expect(noAuth.statusCode).toBe(401);

          const ok = await app.inject({
            method: "GET",
            url: "/metrics",
            headers: { Authorization: "Bearer secret-token" }
          });
          expect(ok.statusCode).toBe(200);
          expect(ok.body).toContain("agentos_http_requests_total");
        } finally {
          await app.close();
        }
      }
    );
  });

  it("should apply pre-auth rate limiting before auth verification", async () => {
    await withEnv(
      { NODE_ENV: "development", PREAUTH_RATE_LIMIT_PER_MINUTE: "2" },
      async () => {
        const { app } = await createApp({ logger: false });
        try {
          const req = () =>
            app.inject({
              method: "POST",
              url: "/v1/get",
              remoteAddress: "203.0.113.10",
              headers: { "Content-Type": "application/json" },
              payload: { agent_id: "x", path: "/x" }
            });

          const r1 = await req();
          const r2 = await req();
          const r3 = await req();

          expect(r1.statusCode).toBe(401);
          expect(r2.statusCode).toBe(401);
          expect(r3.statusCode).toBe(429);
          expect(r3.json().error?.code).toBe("PREAUTH_RATE_LIMIT_EXCEEDED");
        } finally {
          await app.close();
        }
      }
    );
  });
});

