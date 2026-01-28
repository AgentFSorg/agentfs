import { FastifyInstance } from "fastify";
import { z } from "zod";
import { normalizePath, isReservedPath } from "@agentfs/shared/src/path.js";
import { globToSqlLike } from "@agentfs/shared/src/glob.js";
import { makeSql } from "@agentfs/shared/src/db/client.js";
import { authenticate, requireScope } from "../auth.js";
import { incWriteQuota, incSearchQuota } from "../quotas.js";
import { createHash } from "node:crypto";

function stableJson(value: unknown): string {
  // MVP deterministic stringify (simple). For deeper determinism, sort keys recursively.
  return JSON.stringify(value);
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function memoryRoutes(app: FastifyInstance) {
  app.post("/v1/put", async (req, reply) => {
    const ctx = await authenticate(req);
    requireScope(ctx, "memory:write");

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

    const path = normalizePath(body.path);
    if (isReservedPath(path)) throw Object.assign(new Error("Reserved path"), { statusCode: 403 });

    const valueText = stableJson(body.value);
    const contentHash = sha256(`${path}:${valueText}`);

    const bytes = Buffer.byteLength(valueText, "utf8");
    await incWriteQuota(ctx.tenantId, bytes);

    const expiresAt = body.ttl_seconds ? new Date(Date.now() + body.ttl_seconds * 1000) : null;

    const sql = makeSql();
    try {
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

      // Enqueue embedding job only if searchable=true AND we have an embeddings provider configured.
      if (body.searchable) {
        await sql`
          INSERT INTO embedding_jobs (version_id, tenant_id, agent_id, path, status)
          VALUES (${ver.id}::uuid, ${ctx.tenantId}::uuid, ${body.agent_id}, ${path}, 'queued')
          ON CONFLICT (version_id) DO NOTHING
        `;
      }

      return reply.send({ ok: true, version_id: ver.id, created_at: ver.created_at });
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  app.post("/v1/get", async (req, reply) => {
    const ctx = await authenticate(req);
    requireScope(ctx, "memory:read");

    const Body = z.object({
      agent_id: z.string().min(1),
      path: z.string().min(1)
    });
    const body = Body.parse(req.body);
    const path = normalizePath(body.path);

    const sql = makeSql();
    try {
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
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  app.post("/v1/delete", async (req, reply) => {
    const ctx = await authenticate(req);
    requireScope(ctx, "memory:write");

    const Body = z.object({
      agent_id: z.string().min(1),
      path: z.string().min(1)
    });
    const body = Body.parse(req.body);
    const path = normalizePath(body.path);

    const sql = makeSql();
    try {
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
      return reply.send({ ok: true, deleted: true, version_id: ver.id, created_at: ver.created_at });
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  app.post("/v1/history", async (req, reply) => {
    const ctx = await authenticate(req);
    requireScope(ctx, "memory:read");

    const Body = z.object({
      agent_id: z.string().min(1),
      path: z.string().min(1),
      limit: z.number().int().min(1).max(100).optional().default(20)
    });
    const body = Body.parse(req.body);
    const path = normalizePath(body.path);

    const sql = makeSql();
    try {
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
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  app.post("/v1/list", async (req, reply) => {
    const ctx = await authenticate(req);
    requireScope(ctx, "memory:read");

    const Body = z.object({
      agent_id: z.string().min(1),
      prefix: z.string().min(1)
    });
    const body = Body.parse(req.body);
    const prefix = normalizePath(body.prefix);

    const sql = makeSql();
    try {
      // List direct children under prefix. We'll do a simple approach:
      // fetch paths that start with prefix + '/' and then slice next segment.
      const prefixWithSlash = prefix === "/" ? "/" : `${prefix}/`;
      const rows = await sql`
        SELECT e.path
        FROM entries e
        JOIN entry_versions ev ON ev.id = e.latest_version_id
        WHERE e.tenant_id=${ctx.tenantId}::uuid
          AND e.agent_id=${body.agent_id}
          AND e.path LIKE ${prefixWithSlash + "%"}
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
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  app.post("/v1/glob", async (req, reply) => {
    const ctx = await authenticate(req);
    requireScope(ctx, "memory:read");

    const Body = z.object({
      agent_id: z.string().min(1),
      pattern: z.string().min(1)
    });
    const body = Body.parse(req.body);
    const { like } = globToSqlLike(body.pattern);

    const sql = makeSql();
    try {
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
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  // Search is stubbed until worker is running + embeddings are populated.
  app.post("/v1/search", async (req, reply) => {
    const ctx = await authenticate(req);
    requireScope(ctx, "search:read");
    await incSearchQuota(ctx.tenantId);

    const Body = z.object({
      agent_id: z.string().min(1),
      query: z.string().min(1).max(2000),
      limit: z.number().int().min(1).max(50).optional().default(10),
      path_prefix: z.string().optional(),
      tags_any: z.array(z.string()).optional()
    });
    const body = Body.parse(req.body);

    // MVP: require worker to create embeddings. For now, return empty with guidance.
    return reply.send({
      results: [],
      note: "Search requires embeddings. Run worker and write entries with searchable=true."
    });
  });
}
