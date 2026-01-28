import { FastifyRequest } from "fastify";
import argon2 from "argon2";
import { makeSql } from "@agentfs/shared/src/db/client.js";

export type AuthContext = {
  tenantId: string;
  apiKeyId: string;
  scopes: string[];
};

const MAX_BEARER_TOKEN_LEN = 512;
const MAX_API_KEY_ID_LEN = 128;
const MAX_API_KEY_SECRET_LEN = 256;
const API_KEY_PART_RE = /^[a-zA-Z0-9_-]+$/;

function parseBearer(authHeader?: string): { id: string; secret: string } | null {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1]!.trim();
  if (token.length === 0 || token.length > MAX_BEARER_TOKEN_LEN) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const id = parts[0]!;
  const secret = parts[1]!;
  if (!id || !secret) return null;
  if (id.length > MAX_API_KEY_ID_LEN || secret.length > MAX_API_KEY_SECRET_LEN) return null;
  if (!API_KEY_PART_RE.test(id) || !API_KEY_PART_RE.test(secret)) return null;
  return { id, secret };
}

export async function authenticate(req: FastifyRequest): Promise<AuthContext> {
  const parsed = parseBearer(req.headers.authorization);
  if (!parsed) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });

  const sql = makeSql();
  try {
    const rows = await sql`
      SELECT id, tenant_id, secret_hash, scopes_json, revoked_at
      FROM api_keys
      WHERE id=${parsed.id}
      LIMIT 1
    `;
    if (!rows.length) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    const row = rows[0]!;
    if (row.revoked_at) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });

    const ok = await argon2.verify(row.secret_hash, parsed.secret);
    if (!ok) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });

    const scopes = Array.isArray(row.scopes_json) ? row.scopes_json : [];
    return { tenantId: row.tenant_id, apiKeyId: row.id, scopes };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export function requireScope(ctx: AuthContext, scope: string) {
  if (!ctx.scopes.includes(scope) && !ctx.scopes.includes("admin")) {
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  }
}
