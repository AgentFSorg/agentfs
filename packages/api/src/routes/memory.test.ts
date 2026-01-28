import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import { memoryRoutes } from "./memory.js";
import { adminRoutes } from "./admin.js";
import { setupTestTenant, createSecondTenant, TestContext } from "../test-utils.js";
import { makeSql } from "@agentfs/shared/src/db/client.js";
import argon2 from "argon2";
import { randomBytes } from "node:crypto";

const BASE_URL = "http://localhost";

describe("Memory Routes", () => {
  let app: ReturnType<typeof Fastify>;
  let ctx: TestContext;
  let ctx2: TestContext;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    app.get("/healthz", async () => ({ ok: true }));
    await memoryRoutes(app);
    await adminRoutes(app);

    // Set up error handler (same as in index.ts)
    app.setErrorHandler((err, _req, reply) => {
      // Detect Zod validation errors (they have an 'issues' array)
      if ((err as any).issues && Array.isArray((err as any).issues)) {
        const zodErr = err as any;
        const firstIssue = zodErr.issues[0];
        const message = firstIssue?.message ?? "Validation error";
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message } });
      }

      const status = (err as any).statusCode ?? 500;
      const code = (err as any).code ?? "INTERNAL";
      const message = (err as any).message ?? "Internal error";
      reply.status(status).send({ error: { code, message } });
    });

    await app.ready();

    ctx = await setupTestTenant();
    ctx2 = await createSecondTenant();
  });

  afterAll(async () => {
    await ctx.cleanup();
    await ctx2.cleanup();
    await app.close();
  });

  const inject = (method: string, url: string, body: object, apiKey?: string) =>
    app.inject({
      method: method as "POST" | "GET",
      url,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      payload: body
    });

  describe("Authentication", () => {
    it("should reject requests without auth", async () => {
      const res = await inject("POST", "/v1/get", { agent_id: "test", path: "/foo" });
      expect(res.statusCode).toBe(401);
    });

    it("should reject requests with invalid auth", async () => {
      const res = await inject("POST", "/v1/get", { agent_id: "test", path: "/foo" }, "invalid.token");
      expect(res.statusCode).toBe(401);
    });

    it("should reject requests with wrong auth scheme", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/get",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from("x:y").toString("base64")}` },
        payload: { agent_id: "test", path: "/foo" }
      });
      expect(res.statusCode).toBe(401);
    });

    it("should reject revoked API keys", async () => {
      const apiKeyId = "revoked_" + randomBytes(8).toString("hex");
      const secret = randomBytes(32).toString("base64url");
      const apiKey = `${apiKeyId}.${secret}`;
      const secretHash = await argon2.hash(secret);

      const sql = makeSql();
      try {
        await sql`
          INSERT INTO api_keys (id, tenant_id, secret_hash, label, revoked_at)
          VALUES (${apiKeyId}, ${ctx.tenantId}::uuid, ${secretHash}, 'revoked-test', now())
        `;
      } finally {
        await sql.end({ timeout: 5 });
      }

      const res = await inject("POST", "/v1/get", { agent_id: "test", path: "/foo" }, apiKey);
      expect(res.statusCode).toBe(401);

      const sql2 = makeSql();
      try {
        await sql2`DELETE FROM api_keys WHERE id = ${apiKeyId}`;
      } finally {
        await sql2.end({ timeout: 5 });
      }
    });
  });

  describe("PUT", () => {
    it("should create an entry and return version_id", async () => {
      const res = await inject("POST", "/v1/put", {
        agent_id: "test",
        path: "/test/put1",
        value: { foo: "bar" }
      }, ctx.apiKey);

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.version_id).toBeDefined();
      expect(body.created_at).toBeDefined();
    });

    it("should create entry with TTL", async () => {
      const res = await inject("POST", "/v1/put", {
        agent_id: "test",
        path: "/test/ttl",
        value: { temp: true },
        ttl_seconds: 3600
      }, ctx.apiKey);

      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);
    });

    it("should create entry with tags and importance", async () => {
      const res = await inject("POST", "/v1/put", {
        agent_id: "test",
        path: "/test/tagged",
        value: { data: 1 },
        tags: ["important", "user"],
        importance: 0.8
      }, ctx.apiKey);

      expect(res.statusCode).toBe(200);
    });

    it("should reject reserved paths", async () => {
      const res = await inject("POST", "/v1/put", {
        agent_id: "test",
        path: "/sys/internal",
        value: { hack: true }
      }, ctx.apiKey);

      expect(res.statusCode).toBe(403);
    });
  });

  describe("GET", () => {
    it("should retrieve an existing entry", async () => {
      // First PUT
      await inject("POST", "/v1/put", {
        agent_id: "test",
        path: "/test/get1",
        value: { hello: "world" }
      }, ctx.apiKey);

      // Then GET
      const res = await inject("POST", "/v1/get", {
        agent_id: "test",
        path: "/test/get1"
      }, ctx.apiKey);

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.found).toBe(true);
      expect(body.value).toEqual({ hello: "world" });
      expect(body.path).toBe("/test/get1");
    });

    it("should return found:false for non-existent path", async () => {
      const res = await inject("POST", "/v1/get", {
        agent_id: "test",
        path: "/nonexistent/path"
      }, ctx.apiKey);

      expect(res.statusCode).toBe(200);
      expect(res.json().found).toBe(false);
    });
  });

  describe("DELETE", () => {
    it("should delete an entry (tombstone)", async () => {
      // PUT
      await inject("POST", "/v1/put", {
        agent_id: "test",
        path: "/test/delete1",
        value: { todelete: true }
      }, ctx.apiKey);

      // DELETE
      const delRes = await inject("POST", "/v1/delete", {
        agent_id: "test",
        path: "/test/delete1"
      }, ctx.apiKey);

      expect(delRes.statusCode).toBe(200);
      expect(delRes.json().deleted).toBe(true);

      // GET should return not found
      const getRes = await inject("POST", "/v1/get", {
        agent_id: "test",
        path: "/test/delete1"
      }, ctx.apiKey);

      expect(getRes.json().found).toBe(false);
    });
  });

  describe("HISTORY", () => {
    it("should return version history", async () => {
      // Create multiple versions
      await inject("POST", "/v1/put", {
        agent_id: "test",
        path: "/test/history1",
        value: { v: 1 }
      }, ctx.apiKey);

      await inject("POST", "/v1/put", {
        agent_id: "test",
        path: "/test/history1",
        value: { v: 2 }
      }, ctx.apiKey);

      await inject("POST", "/v1/put", {
        agent_id: "test",
        path: "/test/history1",
        value: { v: 3 }
      }, ctx.apiKey);

      const res = await inject("POST", "/v1/history", {
        agent_id: "test",
        path: "/test/history1",
        limit: 10
      }, ctx.apiKey);

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.versions).toHaveLength(3);
      // Most recent first
      expect(body.versions[0].value).toEqual({ v: 3 });
      expect(body.versions[2].value).toEqual({ v: 1 });
    });
  });

  describe("LIST", () => {
    it("should list direct children", async () => {
      // Create entries
      await inject("POST", "/v1/put", {
        agent_id: "test",
        path: "/list/a",
        value: { a: 1 }
      }, ctx.apiKey);

      await inject("POST", "/v1/put", {
        agent_id: "test",
        path: "/list/b",
        value: { b: 1 }
      }, ctx.apiKey);

      await inject("POST", "/v1/put", {
        agent_id: "test",
        path: "/list/sub/c",
        value: { c: 1 }
      }, ctx.apiKey);

      const res = await inject("POST", "/v1/list", {
        agent_id: "test",
        prefix: "/list"
      }, ctx.apiKey);

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items).toContainEqual({ path: "/list/a", type: "file" });
      expect(body.items).toContainEqual({ path: "/list/b", type: "file" });
      expect(body.items).toContainEqual({ path: "/list/sub", type: "dir" });
    });
  });

  describe("GLOB", () => {
    it("should match glob patterns", async () => {
      await inject("POST", "/v1/put", {
        agent_id: "test",
        path: "/glob/foo",
        value: { x: 1 }
      }, ctx.apiKey);

      await inject("POST", "/v1/put", {
        agent_id: "test",
        path: "/glob/bar",
        value: { x: 2 }
      }, ctx.apiKey);

      await inject("POST", "/v1/put", {
        agent_id: "test",
        path: "/glob/sub/baz",
        value: { x: 3 }
      }, ctx.apiKey);

      // Test ** pattern
      const res = await inject("POST", "/v1/glob", {
        agent_id: "test",
        pattern: "/glob/**"
      }, ctx.apiKey);

      expect(res.statusCode).toBe(200);
      const paths = res.json().paths;
      expect(paths).toContain("/glob/foo");
      expect(paths).toContain("/glob/bar");
      expect(paths).toContain("/glob/sub/baz");
    });
  });

  describe("Tenant Isolation", () => {
    it("should not allow access to other tenant data", async () => {
      // Tenant 1 creates data
      await inject("POST", "/v1/put", {
        agent_id: "test",
        path: "/isolated/secret",
        value: { secret: "tenant1data" }
      }, ctx.apiKey);

      // Tenant 2 tries to read it
      const res = await inject("POST", "/v1/get", {
        agent_id: "test",
        path: "/isolated/secret"
      }, ctx2.apiKey);

      expect(res.statusCode).toBe(200);
      expect(res.json().found).toBe(false);
    });

    it("should not show other tenant data in list", async () => {
      // Tenant 1 creates data
      await inject("POST", "/v1/put", {
        agent_id: "test",
        path: "/isolated2/data",
        value: { x: 1 }
      }, ctx.apiKey);

      // Tenant 2 lists
      const res = await inject("POST", "/v1/list", {
        agent_id: "test",
        prefix: "/isolated2"
      }, ctx2.apiKey);

      expect(res.statusCode).toBe(200);
      expect(res.json().items).toHaveLength(0);
    });

    it("should not show other tenant data in glob", async () => {
      // Tenant 1 creates data
      await inject("POST", "/v1/put", {
        agent_id: "test",
        path: "/isolated3/item",
        value: { x: 1 }
      }, ctx.apiKey);

      // Tenant 2 globs
      const res = await inject("POST", "/v1/glob", {
        agent_id: "test",
        pattern: "/isolated3/**"
      }, ctx2.apiKey);

      expect(res.statusCode).toBe(200);
      expect(res.json().paths).toHaveLength(0);
    });
  });

  describe("TTL Behavior", () => {
    it("should hide expired entries", async () => {
      // Create entry with 1 second TTL
      await inject("POST", "/v1/put", {
        agent_id: "test",
        path: "/ttl/expire",
        value: { temp: true },
        ttl_seconds: 1
      }, ctx.apiKey);

      // Should be visible immediately
      const res1 = await inject("POST", "/v1/get", {
        agent_id: "test",
        path: "/ttl/expire"
      }, ctx.apiKey);
      expect(res1.json().found).toBe(true);

      // Wait for expiration
      await new Promise(r => setTimeout(r, 1500));

      // Should be hidden now
      const res2 = await inject("POST", "/v1/get", {
        agent_id: "test",
        path: "/ttl/expire"
      }, ctx.apiKey);
      expect(res2.json().found).toBe(false);
    });
  });

  describe("SEARCH (stub)", () => {
    it("should return empty results with note", async () => {
      const res = await inject("POST", "/v1/search", {
        agent_id: "test",
        query: "test query"
      }, ctx.apiKey);

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.results).toEqual([]);
      expect(body.note).toContain("OPENAI_API_KEY");
    });
  });

  describe("Security", () => {
    it("should reject SQL injection attempts in agent_id", async () => {
      const res = await inject("POST", "/v1/search", {
        agent_id: "test'; DROP TABLE entries; --",
        query: "hello"
      }, ctx.apiKey);
      // Should be rejected by validation regex
      expect(res.statusCode).toBe(400);
    });

    it("should reject invalid agent_id characters", async () => {
      const res = await inject("POST", "/v1/search", {
        agent_id: "test<script>alert(1)</script>",
        query: "hello"
      }, ctx.apiKey);
      expect(res.statusCode).toBe(400);
    });

    it("should accept valid agent_id with allowed characters", async () => {
      const res = await inject("POST", "/v1/search", {
        agent_id: "valid-agent_123",
        query: "hello"
      }, ctx.apiKey);
      // Should pass validation (but may return empty results)
      expect(res.statusCode).toBe(200);
    });

    it("should include rate limit headers on responses", async () => {
      const res = await inject("POST", "/v1/get", {
        agent_id: "test",
        path: "/nonexistent"
      }, ctx.apiKey);
      expect(res.statusCode).toBe(200);
      expect(res.headers["x-ratelimit-limit"]).toBeDefined();
      expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
      expect(res.headers["x-ratelimit-reset"]).toBeDefined();
    });

    it("should validate path_prefix length in search", async () => {
      const longPrefix = "/" + "a".repeat(600); // Over 512 char limit
      const res = await inject("POST", "/v1/search", {
        agent_id: "test",
        query: "hello",
        path_prefix: longPrefix
      }, ctx.apiKey);
      expect(res.statusCode).toBe(400);
    });

    it("should validate tags_any array size in search", async () => {
      const tooManyTags = Array(25).fill("tag"); // Over 20 limit
      const res = await inject("POST", "/v1/search", {
        agent_id: "test",
        query: "hello",
        tags_any: tooManyTags
      }, ctx.apiKey);
      expect(res.statusCode).toBe(400);
    });

    it("should reject idempotency key reuse with different request body", async () => {
      const key = "idem_" + Date.now();
      const res1 = await app.inject({
        method: "POST",
        url: "/v1/put",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ctx.apiKey}`,
          "Idempotency-Key": key
        },
        payload: { agent_id: "test", path: "/idem/mismatch", value: { a: 1 } }
      });
      expect(res1.statusCode).toBe(200);

      const res2 = await app.inject({
        method: "POST",
        url: "/v1/put",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ctx.apiKey}`,
          "Idempotency-Key": key
        },
        payload: { agent_id: "test", path: "/idem/mismatch", value: { a: 2 } }
      });
      expect(res2.statusCode).toBe(422);
      expect(res2.json().error?.code).toBe("IDEMPOTENCY_KEY_MISMATCH");
    });

    it("should treat % and _ literally in list prefix filters", async () => {
      await inject("POST", "/v1/put", { agent_id: "test", path: "/weird%prefix/a", value: 1 }, ctx.apiKey);
      await inject("POST", "/v1/put", { agent_id: "test", path: "/weirdXprefix/a", value: 2 }, ctx.apiKey);

      const res = await inject("POST", "/v1/list", { agent_id: "test", prefix: "/weird%prefix" }, ctx.apiKey);
      expect(res.statusCode).toBe(200);
      const paths = res.json().items.map((i: any) => i.path);
      expect(paths).toContain("/weird%prefix/a");
      expect(paths).not.toContain("/weirdXprefix/a");
    });
  });

  describe("Caps", () => {
    it("should cap list results to 500", async () => {
      const prefix = `/caps/list-${Date.now()}`;
      const agentId = "test";

      const sql = makeSql();
      try {
        for (let i = 0; i < 510; i++) {
          const path = `${prefix}/item-${String(i).padStart(4, "0")}`;
          const rows = await sql`
            INSERT INTO entry_versions (tenant_id, agent_id, path, value_json, tags_json, importance, searchable, content_hash)
            VALUES (${ctx.tenantId}::uuid, ${agentId}, ${path}, '{}'::jsonb, '[]'::jsonb, 0, false, 'cap-test')
            RETURNING id
          `;
          const verId = rows[0]!.id;
          await sql`
            INSERT INTO entries (tenant_id, agent_id, path, latest_version_id)
            VALUES (${ctx.tenantId}::uuid, ${agentId}, ${path}, ${verId}::uuid)
            ON CONFLICT (tenant_id, agent_id, path) DO UPDATE SET latest_version_id = EXCLUDED.latest_version_id
          `;
        }
      } finally {
        await sql.end({ timeout: 5 });
      }

      const res = await inject("POST", "/v1/list", { agent_id: agentId, prefix }, ctx.apiKey);
      expect(res.statusCode).toBe(200);
      expect(res.json().items).toHaveLength(500);

      const sql2 = makeSql();
      try {
        await sql2`DELETE FROM entries WHERE tenant_id = ${ctx.tenantId}::uuid AND agent_id = ${agentId} AND path LIKE ${prefix + "/%"} `;
        await sql2`DELETE FROM entry_versions WHERE tenant_id = ${ctx.tenantId}::uuid AND agent_id = ${agentId} AND path LIKE ${prefix + "/%"} `;
      } finally {
        await sql2.end({ timeout: 5 });
      }
    });

    it("should cap glob results to 500", async () => {
      const prefix = `/caps/glob-${Date.now()}`;
      const agentId = "test";

      const sql = makeSql();
      try {
        for (let i = 0; i < 510; i++) {
          const path = `${prefix}/item-${String(i).padStart(4, "0")}`;
          const rows = await sql`
            INSERT INTO entry_versions (tenant_id, agent_id, path, value_json, tags_json, importance, searchable, content_hash)
            VALUES (${ctx.tenantId}::uuid, ${agentId}, ${path}, '{}'::jsonb, '[]'::jsonb, 0, false, 'cap-test')
            RETURNING id
          `;
          const verId = rows[0]!.id;
          await sql`
            INSERT INTO entries (tenant_id, agent_id, path, latest_version_id)
            VALUES (${ctx.tenantId}::uuid, ${agentId}, ${path}, ${verId}::uuid)
            ON CONFLICT (tenant_id, agent_id, path) DO UPDATE SET latest_version_id = EXCLUDED.latest_version_id
          `;
        }
      } finally {
        await sql.end({ timeout: 5 });
      }

      const res = await inject("POST", "/v1/glob", { agent_id: agentId, pattern: `${prefix}/**` }, ctx.apiKey);
      expect(res.statusCode).toBe(200);
      expect(res.json().paths).toHaveLength(500);

      const sql2 = makeSql();
      try {
        await sql2`DELETE FROM entries WHERE tenant_id = ${ctx.tenantId}::uuid AND agent_id = ${agentId} AND path LIKE ${prefix + "/%"} `;
        await sql2`DELETE FROM entry_versions WHERE tenant_id = ${ctx.tenantId}::uuid AND agent_id = ${agentId} AND path LIKE ${prefix + "/%"} `;
      } finally {
        await sql2.end({ timeout: 5 });
      }
    });
  });
});
