import { FastifyRequest } from "fastify";
import argon2 from "argon2";
import { getSql } from "@agentos/shared/src/db/client.js";

export type AuthContext = {
  tenantId: string;
  apiKeyId: string;
  scopes: string[];
};

const MAX_BEARER_TOKEN_LEN = 512;
const MAX_API_KEY_ID_LEN = 128;
const MAX_API_KEY_SECRET_LEN = 256;
const API_KEY_PART_RE = /^[a-zA-Z0-9_-]+$/;

// ── Fix 2: Auth result LRU cache ──────────────────────────────────────────
// Avoids running argon2.verify + DB lookup on every single request.
const AUTH_CACHE_TTL_MS = 60_000;   // 60 seconds
const AUTH_CACHE_MAX = 1000;

interface CachedAuth {
  ctx: AuthContext;
  expiresAt: number;
}

const authCache = new Map<string, CachedAuth>();

function getCachedAuth(bearerToken: string): AuthContext | null {
  const entry = authCache.get(bearerToken);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    authCache.delete(bearerToken);
    return null;
  }
  return entry.ctx;
}

function setCachedAuth(bearerToken: string, ctx: AuthContext): void {
  // Evict oldest entries when at capacity
  if (authCache.size >= AUTH_CACHE_MAX) {
    // Delete first (oldest-inserted) entry
    const firstKey = authCache.keys().next().value;
    if (firstKey !== undefined) authCache.delete(firstKey);
  }
  authCache.set(bearerToken, { ctx, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
}

// ── Fix 3: Failed login lockout ───────────────────────────────────────────
// Track failed attempts per API key ID. After 10 failures in 15 minutes → 429.
const LOCKOUT_MAX_ATTEMPTS = 10;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface FailedAttempts {
  count: number;
  firstFailAt: number;
}

const failedAttempts = new Map<string, FailedAttempts>();

function checkLockout(keyId: string): boolean {
  const entry = failedAttempts.get(keyId);
  if (!entry) return false;
  // Window expired — reset
  if (Date.now() - entry.firstFailAt > LOCKOUT_WINDOW_MS) {
    failedAttempts.delete(keyId);
    return false;
  }
  return entry.count >= LOCKOUT_MAX_ATTEMPTS;
}

function recordFailure(keyId: string): void {
  const now = Date.now();
  const entry = failedAttempts.get(keyId);
  if (!entry || now - entry.firstFailAt > LOCKOUT_WINDOW_MS) {
    failedAttempts.set(keyId, { count: 1, firstFailAt: now });
  } else {
    entry.count++;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

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
  if (!parsed) throw Object.assign(new Error("Unauthorized"), { statusCode: 401, code: "UNAUTHORIZED" });

  // Fix 3: Check lockout before doing any work
  if (checkLockout(parsed.id)) {
    throw Object.assign(new Error("Too many failed attempts. Try again later."), { statusCode: 429, code: "AUTH_LOCKOUT" });
  }

  // Fix 2: Check auth cache
  const fullToken = `${parsed.id}.${parsed.secret}`;
  const cached = getCachedAuth(fullToken);
  if (cached) return cached;

  const sql = getSql();
  const rows = await sql`
    SELECT id, tenant_id, secret_hash, scopes_json, revoked_at
    FROM api_keys
    WHERE id=${parsed.id}
    LIMIT 1
  `;
  if (!rows.length) {
    recordFailure(parsed.id);
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401, code: "UNAUTHORIZED" });
  }
  const row = rows[0]!;
  if (row.revoked_at) {
    recordFailure(parsed.id);
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401, code: "UNAUTHORIZED" });
  }

  const ok = await argon2.verify(row.secret_hash, parsed.secret);
  if (!ok) {
    recordFailure(parsed.id);
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401, code: "UNAUTHORIZED" });
  }

  const scopes = Array.isArray(row.scopes_json) ? row.scopes_json : [];
  const ctx: AuthContext = { tenantId: row.tenant_id, apiKeyId: row.id, scopes };

  // Cache successful auth
  setCachedAuth(fullToken, ctx);

  return ctx;
}

export function requireScope(ctx: AuthContext, scope: string) {
  if (!ctx.scopes.includes(scope) && !ctx.scopes.includes("admin")) {
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  }
}
