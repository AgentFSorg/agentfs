import { FastifyInstance } from "fastify";
import { z } from "zod";
import { getEnv } from "@agentfs/shared/src/env.js";
import { makeSql } from "@agentfs/shared/src/db/client.js";
import { checkRateLimit, applyRateLimitHeaders } from "../ratelimit.js";
import argon2 from "argon2";
import { randomBytes } from "node:crypto";

function base64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function adminRoutes(app: FastifyInstance) {
  const env = getEnv();
  if (!env.ADMIN_BOOTSTRAP_TOKEN) return;

  app.post("/v1/admin/create-key", async (req, reply) => {
    // Rate limiting for admin endpoints (stricter limit)
    const rateResult = checkRateLimit("admin", "create-key", 10); // 10 per minute max
    applyRateLimitHeaders(reply, rateResult, 10);
    if (!rateResult.allowed) {
      return reply.status(429).send({ error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many requests" } });
    }

    const Body = z.object({
      token: z.string().min(1),
      label: z.string().optional().default("default")
    });
    const body = Body.parse(req.body);
    if (body.token !== env.ADMIN_BOOTSTRAP_TOKEN) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Invalid token" } });
    }

    const sql = makeSql();
    try {
      const rows = await sql`SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1`;
      if (!rows.length) return reply.status(400).send({ error: { code: "NO_TENANT", message: "Run seed first" } });
      const tenantId = rows[0]!.id;

      const pub = base64url(randomBytes(8));
      const secret = base64url(randomBytes(32));
      const id = `agfs_dev_${pub}`;
      const full = `${id}.${secret}`;
      const secretHash = await argon2.hash(secret);

      await sql`
        INSERT INTO api_keys (id, tenant_id, secret_hash, label)
        VALUES (${id}, ${tenantId}::uuid, ${secretHash}, ${body.label})
      `;

      return reply.send({ ok: true, api_key: full });
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
}
