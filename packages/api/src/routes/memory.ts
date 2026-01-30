import { FastifyInstance } from "fastify";
import { z } from "zod";
import { normalizePath, isReservedPath } from "@agentos/shared/src/path.js";
import { globToSqlLike } from "@agentos/shared/src/glob.js";
import { getSql } from "@agentos/shared/src/db/client.js";
import { authenticate, requireScope } from "../auth.js";
import { incWriteQuota, incSearchQuota } from "../quotas.js";
import { embedQuery } from "../embeddings.js";
import { checkIdempotency, storeIdempotency } from "../idempotency.js";
import { checkRateLimit, applyRateLimitHeaders } from "../ratelimit.js";
import { getEnv } from "@agentos/shared/src/env.js";
import { createHash } from "node:crypto";

// Simple in-memory cache for dump endpoint (avoids repeated slow Supabase queries)
const dumpCache = new Map<string, { data: any; ts: number }>();
const DUMP_CACHE_TTL = 60_000; // 60 seconds

function getCachedDump(key: string): any | null {
  const entry = dumpCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > DUMP_CACHE_TTL) {
    dumpCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedDump(key: string, data: any): void {
  dumpCache.set(key, { data, ts: Date.now() });
  // Evict old entries
  if (dumpCache.size > 100) {
    const oldest = [...dumpCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < 50; i++) dumpCache.delete(oldest[i]![0]);
  }
}

function stableJson(value: unknown): string {
  // MVP deterministic stringify (simple). For deeper determinism, sort keys recursively.
  return JSON.stringify(value);
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function escapeSqlLikeLiteral(input: string): string {
  // Escape LIKE metacharacters to ensure prefix filters behave as "startsWith" on literal strings.
  return input.replace(/[\\%_]/g, "\\$&");
}

function normalizeGlobPattern(input: string): string {
  if (!input || typeof input !== "string") throw new Error("Invalid glob pattern");
  if (!input.startsWith("/")) throw new Error("Glob pattern must start with '/'");
  if (input.length > 512) throw new Error("Glob pattern too long");
  let p = input.replace(/\/+/g, "/");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  const segs = p.split("/").slice(1);
  for (const s of segs) {
    if (s.length === 0) throw new Error("Empty glob segment");
    if (s === "." || s === "..") throw new Error("Invalid glob segment");
  }
  return p;
}

function getIdempotencyKey(req: { headers: Record<string, unknown> }): string | undefined {
  const raw = req.headers["idempotency-key"];
  if (typeof raw !== "string") return undefined;
  const key = raw.trim();
  if (!key) return undefined;
  if (key.length > 128) throw new Error("Invalid Idempotency-Key");
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) throw new Error("Invalid Idempotency-Key");
  return key;
}

export async function memoryRoutes(app: FastifyInstance) {
  app.post("/v1/put", async (req, reply) => {
    const ctx = await authenticate(req);
    requireScope(ctx, "memory:write");

    // Rate limiting
    const env = getEnv();
    const rateResult = checkRateLimit(ctx.tenantId, "put", env.RATE_LIMIT_REQUESTS_PER_MINUTE);
    applyRateLimitHeaders(reply, rateResult, env.RATE_LIMIT_REQUESTS_PER_MINUTE);
    if (!rateResult.allowed) {
      throw Object.assign(new Error("Rate limit exceeded"), { statusCode: 429, code: "RATE_LIMIT_EXCEEDED" });
    }

    const Body = z.object({
      agent_id: z.string().min(1),
      path: z.string().min(1),
      value: z.any(),
      ttl_seconds: z.number().int().positive().optional(),
      tags: z.array(z.string()).optional().default([]),
      importance: z.number().min(0).max(1).optional().default(0),
      searchable: z.boolean().optional().default(false)
    });
    const body = Body.parse(req.body);

    // Check idempotency key if provided
    let idempotencyKey: string | undefined;
    try {
      idempotencyKey = getIdempotencyKey(req as any);
    } catch {
      throw Object.assign(new Error("Invalid Idempotency-Key"), { statusCode: 400, code: "INVALID_IDEMPOTENCY_KEY" });
    }
    if (idempotencyKey) {
      const cached = await checkIdempotency<{ ok: boolean; version_id: string; created_at: string }>(
        ctx.tenantId,
        idempotencyKey,
        body
      );
      if (cached.cached) {
        return reply.send(cached.response);
      }
    }

    const path = normalizePath(body.path);
    if (isReservedPath(path)) throw Object.assign(new Error("Reserved path"), { statusCode: 403 });

    const valueText = stableJson(body.value);
    const contentHash = sha256(`${path}:${valueText}`);

    const bytes = Buffer.byteLength(valueText, "utf8");
    await incWriteQuota(ctx.tenantId, bytes);

    const expiresAt = body.ttl_seconds ? new Date(Date.now() + body.ttl_seconds * 1000) : null;

    const sql = getSql();
    const rows = await sql`
      INSERT INTO entry_versions
        (tenant_id, agent_id, path, value_json, tags_json, importance, searchable, content_hash, expires_at)
      VALUES
        (${ctx.tenantId}::uuid, ${body.agent_id}, ${path}, ${body.value}::jsonb, ${JSON.stringify(body.tags)}::jsonb,
         ${body.importance}, ${body.searchable}, ${contentHash}, ${expiresAt})
      RETURNING id, created_at
    `;
    const ver = rows[0]!;
    await sql`
      INSERT INTO entries (tenant_id, agent_id, path, latest_version_id)
      VALUES (${ctx.tenantId}::uuid, ${body.agent_id}, ${path}, ${ver.id}::uuid)
      ON CONFLICT (tenant_id, agent_id, path)
      DO UPDATE SET latest_version_id = ${ver.id}::uuid
    `;

    // Generate embedding inline if searchable=true AND we have an embeddings provider configured.
    if (body.searchable) {
      const env = getEnv();
      if (env.OPENAI_API_KEY) {
        try {
          const textToEmbed = typeof body.value === "string" ? body.value : JSON.stringify(body.value);
          const vec = await embedQuery(textToEmbed);
          const vecLiteral = `[${vec.join(",")}]`;
          const model = env.OPENAI_EMBED_MODEL || "text-embedding-3-small";
          await sql`
            INSERT INTO embeddings (version_id, tenant_id, agent_id, path, model, embedding)
            VALUES (${ver.id}::uuid, ${ctx.tenantId}::uuid, ${body.agent_id}, ${path}, ${model}, ${vecLiteral}::vector)
            ON CONFLICT (version_id) DO UPDATE SET embedding = ${vecLiteral}::vector
          `;
          // Mark job as done
          await sql`
            INSERT INTO embedding_jobs (version_id, tenant_id, agent_id, path, status)
            VALUES (${ver.id}::uuid, ${ctx.tenantId}::uuid, ${body.agent_id}, ${path}, 'done')
            ON CONFLICT (version_id) DO UPDATE SET status = 'done', updated_at = now()
          `;
        } catch (embErr: any) {
          // Don't fail the write if embedding fails — queue for retry
          console.error("Inline embedding failed, queueing for retry", { error: embErr?.message });
          await sql`
            INSERT INTO embedding_jobs (version_id, tenant_id, agent_id, path, status, last_error)
            VALUES (${ver.id}::uuid, ${ctx.tenantId}::uuid, ${body.agent_id}, ${path}, 'queued', ${embErr?.message ?? 'unknown'})
            ON CONFLICT (version_id) DO NOTHING
          `;
        }
      } else {
        // No API key — just queue for later
        await sql`
          INSERT INTO embedding_jobs (version_id, tenant_id, agent_id, path, status)
          VALUES (${ver.id}::uuid, ${ctx.tenantId}::uuid, ${body.agent_id}, ${path}, 'queued')
          ON CONFLICT (version_id) DO NOTHING
        `;
      }
    }

    const response = { ok: true, version_id: ver.id, created_at: ver.created_at };

    // Invalidate dump cache for this agent
    for (const key of dumpCache.keys()) {
      if (key.startsWith(`${ctx.tenantId}:${body.agent_id}:`)) dumpCache.delete(key);
    }

    // Store idempotency key if provided
    if (idempotencyKey) {
      await storeIdempotency(ctx.tenantId, idempotencyKey, body, response);
    }

    return reply.send(response);
  });

  app.post("/v1/get", async (req, reply) => {
    const ctx = await authenticate(req);
    requireScope(ctx, "memory:read");

    // Rate limiting
    const env = getEnv();
    const rateResult = checkRateLimit(ctx.tenantId, "get", env.RATE_LIMIT_REQUESTS_PER_MINUTE);
    applyRateLimitHeaders(reply, rateResult, env.RATE_LIMIT_REQUESTS_PER_MINUTE);
    if (!rateResult.allowed) {
      throw Object.assign(new Error("Rate limit exceeded"), { statusCode: 429, code: "RATE_LIMIT_EXCEEDED" });
    }

    const Body = z.object({
      agent_id: z.string().min(1),
      path: z.string().min(1)
    });
    const body = Body.parse(req.body);
    const path = normalizePath(body.path);

    const sql = getSql();
    const rows = await sql`
      SELECT ev.id as version_id, ev.value_json, ev.created_at, ev.expires_at, ev.deleted_at, ev.tags_json
      FROM entries e
      JOIN entry_versions ev ON ev.id = e.latest_version_id
      WHERE e.tenant_id=${ctx.tenantId}::uuid AND e.agent_id=${body.agent_id} AND e.path=${path}
      LIMIT 1
    `;
    if (!rows.length) return reply.send({ found: false });

    const r = rows[0]!;
    const expired = r.expires_at && new Date(r.expires_at).getTime() <= Date.now();
    const deleted = !!r.deleted_at;
    if (expired || deleted) return reply.send({ found: false });

    return reply.send({
      found: true,
      path,
      value: r.value_json,
      version_id: r.version_id,
      created_at: r.created_at,
      expires_at: r.expires_at,
      tags: r.tags_json
    });
  });

  app.post("/v1/delete", async (req, reply) => {
    const ctx = await authenticate(req);
    requireScope(ctx, "memory:write");

    // Rate limiting
    const env = getEnv();
    const rateResult = checkRateLimit(ctx.tenantId, "delete", env.RATE_LIMIT_REQUESTS_PER_MINUTE);
    applyRateLimitHeaders(reply, rateResult, env.RATE_LIMIT_REQUESTS_PER_MINUTE);
    if (!rateResult.allowed) {
      throw Object.assign(new Error("Rate limit exceeded"), { statusCode: 429, code: "RATE_LIMIT_EXCEEDED" });
    }

    const Body = z.object({
      agent_id: z.string().min(1),
      path: z.string().min(1)
    });
    const body = Body.parse(req.body);

    // Check idempotency key if provided
    let idempotencyKey: string | undefined;
    try {
      idempotencyKey = getIdempotencyKey(req as any);
    } catch {
      throw Object.assign(new Error("Invalid Idempotency-Key"), { statusCode: 400, code: "INVALID_IDEMPOTENCY_KEY" });
    }
    if (idempotencyKey) {
      const cached = await checkIdempotency<{ ok: boolean; deleted: boolean; version_id: string; created_at: string }>(
        ctx.tenantId,
        idempotencyKey,
        body
      );
      if (cached.cached) {
        return reply.send(cached.response);
      }
    }

    const path = normalizePath(body.path);

    const sql = getSql();
    // Tombstone version
    const rows = await sql`
      INSERT INTO entry_versions
        (tenant_id, agent_id, path, value_json, tags_json, importance, searchable, content_hash, deleted_at)
      VALUES
        (${ctx.tenantId}::uuid, ${body.agent_id}, ${path}, '{}'::jsonb, '[]'::jsonb, 0, false, 'tombstone', now())
      RETURNING id, created_at
    `;
    const ver = rows[0]!;
    await sql`
      INSERT INTO entries (tenant_id, agent_id, path, latest_version_id)
      VALUES (${ctx.tenantId}::uuid, ${body.agent_id}, ${path}, ${ver.id}::uuid)
      ON CONFLICT (tenant_id, agent_id, path)
      DO UPDATE SET latest_version_id = ${ver.id}::uuid
    `;

    const response = { ok: true, deleted: true, version_id: ver.id, created_at: ver.created_at };

    // Store idempotency key if provided
    if (idempotencyKey) {
      await storeIdempotency(ctx.tenantId, idempotencyKey, body, response);
    }

    return reply.send(response);
  });

  app.post("/v1/history", async (req, reply) => {
    const ctx = await authenticate(req);
    requireScope(ctx, "memory:read");

    // Rate limiting
    const env = getEnv();
    const rateResult = checkRateLimit(ctx.tenantId, "history", env.RATE_LIMIT_REQUESTS_PER_MINUTE);
    applyRateLimitHeaders(reply, rateResult, env.RATE_LIMIT_REQUESTS_PER_MINUTE);
    if (!rateResult.allowed) {
      throw Object.assign(new Error("Rate limit exceeded"), { statusCode: 429, code: "RATE_LIMIT_EXCEEDED" });
    }

    const Body = z.object({
      agent_id: z.string().min(1),
      path: z.string().min(1),
      limit: z.number().int().min(1).max(100).optional().default(20)
    });
    const body = Body.parse(req.body);
    const path = normalizePath(body.path);

    const sql = getSql();
    const rows = await sql`
      SELECT id as version_id, created_at, value_json, expires_at, deleted_at
      FROM entry_versions
      WHERE tenant_id=${ctx.tenantId}::uuid AND agent_id=${body.agent_id} AND path=${path}
      ORDER BY created_at DESC
      LIMIT ${body.limit}
    `;
    return reply.send({
      versions: rows.map(r => ({
        version_id: r.version_id,
        created_at: r.created_at,
        value: r.value_json,
        expires_at: r.expires_at,
        deleted_at: r.deleted_at
      }))
    });
  });

  app.post("/v1/list", async (req, reply) => {
    const ctx = await authenticate(req);
    requireScope(ctx, "memory:read");

    // Rate limiting
    const env = getEnv();
    const rateResult = checkRateLimit(ctx.tenantId, "list", env.RATE_LIMIT_REQUESTS_PER_MINUTE);
    applyRateLimitHeaders(reply, rateResult, env.RATE_LIMIT_REQUESTS_PER_MINUTE);
    if (!rateResult.allowed) {
      throw Object.assign(new Error("Rate limit exceeded"), { statusCode: 429, code: "RATE_LIMIT_EXCEEDED" });
    }

    const Body = z.object({
      agent_id: z.string().min(1),
      prefix: z.string().min(1)
    });
    const body = Body.parse(req.body);
    const prefix = normalizePath(body.prefix);

    const sql = getSql();
    // List direct children under prefix. We'll do a simple approach:
    // fetch paths that start with prefix + '/' and then slice next segment.
    const prefixWithSlash = prefix === "/" ? "/" : `${prefix}/`;
    const like = `${escapeSqlLikeLiteral(prefixWithSlash)}%`;
    const rows = await sql`
      SELECT e.path
      FROM entries e
      JOIN entry_versions ev ON ev.id = e.latest_version_id
      WHERE e.tenant_id=${ctx.tenantId}::uuid
        AND e.agent_id=${body.agent_id}
        AND e.path LIKE ${like} ESCAPE '\\'
        AND (ev.deleted_at IS NULL)
        AND (ev.expires_at IS NULL OR ev.expires_at > now())
      LIMIT 500
    `;

    const seen = new Set<string>();
    const items: { path: string; type: "file" | "dir" }[] = [];

    for (const r of rows) {
      const p: string = r.path;
      const rest = p.slice(prefixWithSlash.length);
      const seg = rest.split("/")[0]!;
      const childPath = prefixWithSlash === "/" ? `/${seg}` : `${prefixWithSlash}${seg}`;
      if (!seen.has(childPath)) {
        seen.add(childPath);
        const isDir = rest.includes("/");
        items.push({ path: childPath, type: isDir ? "dir" : "file" });
      }
    }

    return reply.send({ items });
  });

  // Bulk fetch: returns all entries for an agent in a single query (used by dashboard)
  // List all agent IDs for a tenant
  app.post("/v1/agents", async (req, reply) => {
    const ctx = await authenticate(req);
    requireScope(ctx, "memory:read");

    const env = getEnv();
    const rateResult = checkRateLimit(ctx.tenantId, "agents", env.RATE_LIMIT_REQUESTS_PER_MINUTE);
    applyRateLimitHeaders(reply, rateResult, env.RATE_LIMIT_REQUESTS_PER_MINUTE);
    if (!rateResult.allowed) {
      throw Object.assign(new Error("Rate limit exceeded"), { statusCode: 429, code: "RATE_LIMIT_EXCEEDED" });
    }

    const sql = getSql();
    const rows = await sql`
      SELECT DISTINCT e.agent_id, COUNT(*)::int as memory_count
      FROM entries e
      JOIN entry_versions ev ON ev.id = e.latest_version_id
      WHERE e.tenant_id=${ctx.tenantId}::uuid
        AND (ev.deleted_at IS NULL)
        AND (ev.expires_at IS NULL OR ev.expires_at > now())
      GROUP BY e.agent_id
      ORDER BY e.agent_id ASC
    `;
    return reply.send({
      agents: rows.map(r => ({ id: r.agent_id, memory_count: r.memory_count }))
    });
  });

  app.post("/v1/dump", async (req, reply) => {
    const ctx = await authenticate(req);
    requireScope(ctx, "memory:read");

    const env = getEnv();
    const rateResult = checkRateLimit(ctx.tenantId, "dump", env.RATE_LIMIT_REQUESTS_PER_MINUTE);
    applyRateLimitHeaders(reply, rateResult, env.RATE_LIMIT_REQUESTS_PER_MINUTE);
    if (!rateResult.allowed) {
      throw Object.assign(new Error("Rate limit exceeded"), { statusCode: 429, code: "RATE_LIMIT_EXCEEDED" });
    }

    const Body = z.object({
      agent_id: z.string().min(1),
      limit: z.number().int().min(1).max(500).optional().default(200)
    });
    const body = Body.parse(req.body);

    // Check cache first (60s TTL)
    const cacheKey = `${ctx.tenantId}:${body.agent_id}:${body.limit}`;
    const cached = getCachedDump(cacheKey);
    if (cached) {
      reply.header("X-Cache", "HIT");
      return reply.send(cached);
    }

    const sql = getSql();
    const rows = await sql`
      SELECT e.path, ev.id as version_id, ev.value_json, ev.tags_json, ev.created_at
      FROM entries e
      JOIN entry_versions ev ON ev.id = e.latest_version_id
      WHERE e.tenant_id=${ctx.tenantId}::uuid
        AND e.agent_id=${body.agent_id}
        AND (ev.deleted_at IS NULL)
        AND (ev.expires_at IS NULL OR ev.expires_at > now())
      ORDER BY ev.created_at DESC
      LIMIT ${body.limit}
    `;

    const entries = rows.map(r => ({
      path: r.path,
      value: r.value_json,
      tags: r.tags_json,
      version_id: r.version_id,
      created_at: r.created_at,
      agent_id: body.agent_id
    }));

    const response = { entries, count: entries.length };
    setCachedDump(cacheKey, response);
    reply.header("X-Cache", "MISS");
    return reply.send(response);
  });

  app.post("/v1/glob", async (req, reply) => {
    const ctx = await authenticate(req);
    requireScope(ctx, "memory:read");

    // Rate limiting
    const env = getEnv();
    const rateResult = checkRateLimit(ctx.tenantId, "glob", env.RATE_LIMIT_REQUESTS_PER_MINUTE);
    applyRateLimitHeaders(reply, rateResult, env.RATE_LIMIT_REQUESTS_PER_MINUTE);
    if (!rateResult.allowed) {
      throw Object.assign(new Error("Rate limit exceeded"), { statusCode: 429, code: "RATE_LIMIT_EXCEEDED" });
    }

    const Body = z.object({
      agent_id: z.string().min(1),
      pattern: z.string().min(1).max(512).startsWith("/")
    });
    const body = Body.parse(req.body);
    const pattern = normalizeGlobPattern(body.pattern);
    const { like } = globToSqlLike(pattern);

    const sql = getSql();
    const rows = await sql`
      SELECT e.path
      FROM entries e
      JOIN entry_versions ev ON ev.id = e.latest_version_id
      WHERE e.tenant_id=${ctx.tenantId}::uuid
        AND e.agent_id=${body.agent_id}
        AND e.path LIKE ${like} ESCAPE '\\'
        AND (ev.deleted_at IS NULL)
        AND (ev.expires_at IS NULL OR ev.expires_at > now())
      ORDER BY e.path ASC
      LIMIT 500
    `;
    return reply.send({ paths: rows.map(r => r.path) });
  });

  app.post("/v1/search", async (req, reply) => {
    const ctx = await authenticate(req);
    requireScope(ctx, "search:read");

    // Rate limiting for search (more restrictive since it uses external APIs)
    const env = getEnv();
    const rateResult = checkRateLimit(ctx.tenantId, "search", env.SEARCH_RATE_LIMIT_PER_MINUTE);
    applyRateLimitHeaders(reply, rateResult, env.SEARCH_RATE_LIMIT_PER_MINUTE);
    if (!rateResult.allowed) {
      throw Object.assign(new Error("Rate limit exceeded"), { statusCode: 429, code: "RATE_LIMIT_EXCEEDED" });
    }

    await incSearchQuota(ctx.tenantId);

    const Body = z.object({
      agent_id: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/, "agent_id must be alphanumeric with hyphens/underscores"),
      query: z.string().min(1).max(2000),
      limit: z.number().int().min(1).max(50).optional().default(10),
      path_prefix: z.string().max(512).optional(),
      tags_any: z.array(z.string().max(64)).max(20).optional()
    });
    const body = Body.parse(req.body);

    if (!env.OPENAI_API_KEY) {
      return reply.send({
        results: [],
        note: "Search requires OPENAI_API_KEY to be configured."
      });
    }

    // Embed the query
    const queryVec = await embedQuery(body.query);
    // Format vector as PostgreSQL array literal for pgvector
    const vecLiteral = `[${queryVec.join(",")}]`;

    const sql = getSql();
    // Build path pattern for optional prefix filter (parameterized)
    let pathPattern: string | null = null;
    if (body.path_prefix) {
      const prefix = normalizePath(body.path_prefix);
      if (prefix !== "/") {
        pathPattern = `${escapeSqlLikeLiteral(prefix)}%`;
      }
    }

    // Vector similarity search using pgvector cosine distance
    // Use parameterized queries to prevent SQL injection
    const rows = pathPattern
      ? await sql`
          SELECT
            emb.path,
            emb.version_id,
            ev.value_json,
            ev.tags_json,
            ev.created_at,
            1 - (emb.embedding <=> ${vecLiteral}::vector) as similarity
          FROM embeddings emb
          JOIN entry_versions ev ON ev.id = emb.version_id
          JOIN entries e ON e.tenant_id = emb.tenant_id
            AND e.agent_id = emb.agent_id
            AND e.path = emb.path
            AND e.latest_version_id = emb.version_id
          WHERE emb.tenant_id = ${ctx.tenantId}::uuid
            AND emb.agent_id = ${body.agent_id}
            AND (ev.deleted_at IS NULL)
            AND (ev.expires_at IS NULL OR ev.expires_at > now())
            AND emb.path LIKE ${pathPattern} ESCAPE '\\'
          ORDER BY emb.embedding <=> ${vecLiteral}::vector ASC
          LIMIT ${body.limit}
        `
      : await sql`
          SELECT
            emb.path,
            emb.version_id,
            ev.value_json,
            ev.tags_json,
            ev.created_at,
            1 - (emb.embedding <=> ${vecLiteral}::vector) as similarity
          FROM embeddings emb
          JOIN entry_versions ev ON ev.id = emb.version_id
          JOIN entries e ON e.tenant_id = emb.tenant_id
            AND e.agent_id = emb.agent_id
            AND e.path = emb.path
            AND e.latest_version_id = emb.version_id
          WHERE emb.tenant_id = ${ctx.tenantId}::uuid
            AND emb.agent_id = ${body.agent_id}
            AND (ev.deleted_at IS NULL)
            AND (ev.expires_at IS NULL OR ev.expires_at > now())
          ORDER BY emb.embedding <=> ${vecLiteral}::vector ASC
          LIMIT ${body.limit}
        `;

    // Filter by tags if specified
    let results = rows.map((r: any) => ({
      path: r.path,
      value: r.value_json,
      tags: r.tags_json,
      similarity: r.similarity,
      version_id: r.version_id,
      created_at: r.created_at
    }));

    if (body.tags_any && body.tags_any.length > 0) {
      results = results.filter((r: any) => {
        const tags = Array.isArray(r.tags) ? r.tags : [];
        return body.tags_any!.some(t => tags.includes(t));
      });
    }

    return reply.send({ results });
  });
}
