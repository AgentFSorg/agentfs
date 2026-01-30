import { FastifyInstance } from "fastify";
import { z } from "zod";
import { getSql } from "@agentos/shared/src/db/client.js";
import { checkRateLimit, applyRateLimitHeaders } from "../ratelimit.js";
import argon2 from "argon2";
import { randomBytes, randomUUID } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";

function base64url(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * Determine tier from token balance.
 */
function tierFromBalance(balance: number): string {
  if (balance >= 100_000) return "unlimited";
  if (balance >= 10_000) return "pro";
  return "free";
}

export async function walletSignupRoutes(app: FastifyInstance) {
  /**
   * POST /v1/signup/wallet
   *
   * Authenticate via Solana wallet signature.
   * - Verifies the signed message matches the wallet's public key.
   * - Creates or returns existing tenant + API key.
   * - Sets tier based on $AOS token holdings (balance passed separately or checked server-side).
   */
  app.post("/v1/signup/wallet", async (req, reply) => {
    // Rate limit: 5 wallet signups per minute per IP
    const rateResult = checkRateLimit(
      `signup-wallet:${req.ip}`,
      "signup-wallet",
      5
    );
    applyRateLimitHeaders(reply, rateResult, 5);
    if (!rateResult.allowed) {
      return reply.status(429).send({
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many signup attempts. Try again later.",
        },
      });
    }

    const Body = z.object({
      wallet: z
        .string()
        .min(32)
        .max(64)
        .refine(
          (val) => {
            try {
              new PublicKey(val);
              return true;
            } catch {
              return false;
            }
          },
          { message: "Invalid Solana wallet address" }
        ),
      message: z.array(z.number()).min(1, "Message is required"),
      signature: z.array(z.number()).min(64, "Signature is required"),
    });

    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Validation error";
      return reply
        .status(400)
        .send({ error: { code: "VALIDATION_ERROR", message: msg } });
    }

    const { wallet, message, signature } = parsed.data;

    // Verify the signature
    const pubkey = new PublicKey(wallet);
    const messageBytes = new Uint8Array(message);
    const signatureBytes = new Uint8Array(signature);

    const valid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      pubkey.toBytes()
    );

    if (!valid) {
      return reply.status(401).send({
        error: {
          code: "INVALID_SIGNATURE",
          message:
            "Signature verification failed. Please try signing again.",
        },
      });
    }

    // Verify the message contains the expected wallet address and is recent (within 5 min)
    const msgText = new TextDecoder().decode(messageBytes);
    if (!msgText.includes(wallet)) {
      return reply.status(400).send({
        error: {
          code: "MESSAGE_MISMATCH",
          message: "Signed message does not contain the expected wallet address.",
        },
      });
    }

    const timestampMatch = msgText.match(/Timestamp:\s*(\d+)/);
    if (timestampMatch) {
      const msgTimestamp = parseInt(timestampMatch[1], 10);
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;
      if (Math.abs(now - msgTimestamp) > fiveMinutes) {
        return reply.status(400).send({
          error: {
            code: "MESSAGE_EXPIRED",
            message: "Signed message has expired. Please try again.",
          },
        });
      }
    }

    const sql = getSql();

    // Check if wallet already has a tenant
    const existing = await sql`
      SELECT t.id, t.tier, k.id as key_id
      FROM tenants t
      LEFT JOIN api_keys k ON k.tenant_id = t.id AND k.revoked_at IS NULL
      WHERE t.wallet_address = ${wallet}
      LIMIT 1
    `;

    if (existing.length && existing[0].key_id) {
      // Wallet already registered — tell user
      return reply.status(409).send({
        error: {
          code: "WALLET_EXISTS",
          message:
            "An API key already exists for this wallet. Contact support if you need a new key.",
        },
        tier: existing[0].tier,
      });
    }

    // Create tenant for this wallet
    const tenantId = existing.length ? existing[0].id : randomUUID();
    const tier = "free"; // Tier will be updated by the balance check cron

    if (!existing.length) {
      await sql`
        INSERT INTO tenants (id, name, wallet_address, wallet_verified_at, tier)
        VALUES (
          ${tenantId}::uuid,
          ${`wallet-signup`},
          ${wallet},
          now(),
          ${tier}
        )
      `;
    } else {
      // Update existing tenant with wallet verification
      await sql`
        UPDATE tenants
        SET wallet_verified_at = now()
        WHERE id = ${tenantId}::uuid
      `;
    }

    // Generate API key
    const env = "live";
    const pub = base64url(randomBytes(8));
    const secret = base64url(randomBytes(32));
    const keyId = `agfs_${env}_${pub}`;
    const fullKey = `${keyId}.${secret}`;
    const secretHash = await argon2.hash(secret);

    await sql`
      INSERT INTO api_keys (id, tenant_id, secret_hash, label)
      VALUES (${keyId}, ${tenantId}::uuid, ${secretHash}, ${"wallet"})
    `;

    return reply.status(201).send({
      ok: true,
      api_key: fullKey,
      tenant_id: tenantId,
      wallet: wallet,
      tier: tier,
      message:
        "Save your API key now. It will not be shown again. Your tier will be updated once we verify your $AOS balance.",
    });
  });

  /**
   * GET /v1/wallet/tier?wallet=<address>
   *
   * Public endpoint to check a wallet's current tier.
   */
  app.get("/v1/wallet/tier", async (req, reply) => {
    const Query = z.object({
      wallet: z.string().min(32).max(64),
    });

    const parsed = Query.safeParse(req.query);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: { code: "VALIDATION_ERROR", message: "Invalid wallet address" } });
    }

    const sql = getSql();
    const rows = await sql`
      SELECT tier, token_balance, last_balance_check
      FROM tenants
      WHERE wallet_address = ${parsed.data.wallet}
      LIMIT 1
    `;

    if (!rows.length) {
      return reply.send({
        wallet: parsed.data.wallet,
        tier: "free",
        token_balance: 0,
        registered: false,
      });
    }

    return reply.send({
      wallet: parsed.data.wallet,
      tier: rows[0].tier,
      token_balance: Number(rows[0].token_balance),
      last_balance_check: rows[0].last_balance_check,
      registered: true,
    });
  });
}
