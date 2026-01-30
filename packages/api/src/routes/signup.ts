import { FastifyInstance } from "fastify";
import { z } from "zod";
import { getSql } from "@agentos/shared/src/db/client.js";
import { checkRateLimit, applyRateLimitHeaders } from "../ratelimit.js";
import argon2 from "argon2";
import { randomBytes, randomUUID } from "node:crypto";

function base64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function signupRoutes(app: FastifyInstance) {

  // Public endpoint: create a free-tier API key with email
  app.post("/v1/signup", async (req, reply) => {
    // Strict rate limit: 5 signups per minute per IP
    const rateResult = checkRateLimit(`signup:${req.ip}`, "signup", 5);
    applyRateLimitHeaders(reply, rateResult, 5);
    if (!rateResult.allowed) {
      return reply.status(429).send({
        error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many signup attempts. Try again later." }
      });
    }

    const Body = z.object({
      email: z.string().email("Invalid email address").max(255),
      name: z.string().min(1).max(100).optional().default("default"),
    });

    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Validation error";
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: msg } });
    }
    const body = parsed.data;

    const sql = getSql();

    // Check if email already has a tenant
    const existing = await sql`
      SELECT t.id, t.name FROM tenants t WHERE t.name = ${body.email} LIMIT 1
    `;

    if (existing.length) {
      // Fix 6: Generic error to prevent email enumeration
      return reply.status(409).send({
        error: {
          code: "SIGNUP_FAILED",
          message: "Unable to create account. The email may already be registered, or try again later."
        }
      });
    }

    // Create tenant for this email
    const tenantId = randomUUID();
    await sql`
      INSERT INTO tenants (id, name) VALUES (${tenantId}::uuid, ${body.email})
    `;

    // Generate API key
    const env = "live";
    const pub = base64url(randomBytes(8));
    const secret = base64url(randomBytes(32));
    const keyId = `agfs_${env}_${pub}`;
    const fullKey = `${keyId}.${secret}`;
    const secretHash = await argon2.hash(secret);

    await sql`
      INSERT INTO api_keys (id, tenant_id, secret_hash, label)
      VALUES (${keyId}, ${tenantId}::uuid, ${secretHash}, ${body.name})
    `;

    return reply.status(201).send({
      ok: true,
      api_key: fullKey,
      tenant_id: tenantId,
      message: "Save your API key now. It will not be shown again."
    });
  });
}
