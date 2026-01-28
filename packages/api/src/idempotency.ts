import { makeSql } from "@agentfs/shared/src/db/client.js";
import { createHash } from "node:crypto";

const IDEMPOTENCY_TTL_HOURS = 24;

function hashRequest(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

export type IdempotencyResult<T> =
  | { cached: true; response: T }
  | { cached: false };

/**
 * Check if an idempotency key exists and matches the request hash.
 * If so, return the cached response.
 */
export async function checkIdempotency<T>(
  tenantId: string,
  key: string,
  body: unknown
): Promise<IdempotencyResult<T>> {
  const requestHash = hashRequest(body);
  const sql = makeSql();
  try {
    const rows = await sql`
      SELECT response_json, request_hash, expires_at
      FROM idempotency_keys
      WHERE tenant_id = ${tenantId}::uuid AND key = ${key}
    `;

    if (!rows.length) {
      return { cached: false };
    }

    const row = rows[0]!;
    const expired = row.expires_at && new Date(row.expires_at).getTime() <= Date.now();
    if (expired) {
      // Clean up expired key
      await sql`
        DELETE FROM idempotency_keys
        WHERE tenant_id = ${tenantId}::uuid AND key = ${key}
      `;
      return { cached: false };
    }

    // Check if request hash matches
    if (row.request_hash !== requestHash) {
      throw Object.assign(
        new Error("Idempotency key reused with different request body"),
        { statusCode: 422, code: "IDEMPOTENCY_KEY_MISMATCH" }
      );
    }

    return { cached: true, response: row.response_json as T };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * Store the response for an idempotency key.
 */
export async function storeIdempotency(
  tenantId: string,
  key: string,
  body: unknown,
  response: unknown
): Promise<void> {
  const requestHash = hashRequest(body);
  const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000);
  const responseJson = response as any;
  const sql = makeSql();
  try {
    await sql`
      INSERT INTO idempotency_keys (tenant_id, key, request_hash, response_json, expires_at)
      VALUES (${tenantId}::uuid, ${key}, ${requestHash}, ${responseJson}::jsonb, ${expiresAt})
      ON CONFLICT (tenant_id, key) DO NOTHING
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
