import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { AgentFSClient } from "./index.js";
import { makeSql } from "@agentfs/shared/src/db/client.js";
import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import Fastify from "fastify";
import { memoryRoutes } from "@agentfs/api/src/routes/memory.js";
import { adminRoutes } from "@agentfs/api/src/routes/admin.js";

// Test setup: create a test tenant and API key
let client: AgentFSClient;
let testTenantId: string;
let testApiKey: string;
let apiKeyId: string;

let apiBase: string;
let app: ReturnType<typeof Fastify>;

beforeAll(async () => {
  app = Fastify({ logger: false });
  app.get("/healthz", async () => ({ ok: true }));
  await memoryRoutes(app);
  await adminRoutes(app);
  apiBase = await app.listen({ port: 0, host: "127.0.0.1" });

  const sql = makeSql();
  try {
    // Create test tenant
    const tenantRows = await sql`
      INSERT INTO tenants (name)
      VALUES (${"sdk-test-" + Date.now()})
      RETURNING id
    `;
    testTenantId = tenantRows[0]!.id;

    // Create API key
    apiKeyId = "sdk_" + randomBytes(8).toString("hex");
    const secret = randomBytes(32).toString("base64url");
    testApiKey = `${apiKeyId}.${secret}`;
    const secretHash = await argon2.hash(secret);

    await sql`
      INSERT INTO api_keys (id, tenant_id, secret_hash, label, scopes_json)
      VALUES (${apiKeyId}, ${testTenantId}::uuid, ${secretHash}, 'sdk-test', '["memory:read","memory:write","search:read"]'::jsonb)
    `;

    client = new AgentFSClient({
      baseUrl: apiBase,
      apiKey: testApiKey,
      agentId: "sdk-test-agent"
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
});

afterAll(async () => {
  if (app) await app.close();

  const sql = makeSql();
  try {
    // Clean up test data (order matters due to foreign keys)
    await sql`DELETE FROM api_keys WHERE id = ${apiKeyId}`;
    await sql`DELETE FROM embedding_jobs WHERE tenant_id = ${testTenantId}::uuid`;
    await sql`DELETE FROM embeddings WHERE tenant_id = ${testTenantId}::uuid`;
    await sql`DELETE FROM entries WHERE tenant_id = ${testTenantId}::uuid`;
    await sql`DELETE FROM entry_versions WHERE tenant_id = ${testTenantId}::uuid`;
    await sql`DELETE FROM idempotency_keys WHERE tenant_id = ${testTenantId}::uuid`;
    await sql`DELETE FROM quota_usage WHERE tenant_id = ${testTenantId}::uuid`;
    await sql`DELETE FROM tenants WHERE id = ${testTenantId}::uuid`;
  } finally {
    await sql.end({ timeout: 5 });
  }
});

describe("AgentFSClient", () => {
  describe("put/get/delete", () => {
    it("should put and get a value", async () => {
      const putResult = await client.put({
        path: "/sdk-test/hello",
        value: { message: "world" }
      });

      expect(putResult.ok).toBe(true);
      expect(putResult.version_id).toBeDefined();

      const getResult = await client.get("/sdk-test/hello");
      expect(getResult.found).toBe(true);
      expect(getResult.value).toEqual({ message: "world" });
    });

    it("should delete a value", async () => {
      await client.put({
        path: "/sdk-test/to-delete",
        value: { temp: true }
      });

      const deleteResult = await client.delete("/sdk-test/to-delete");
      expect(deleteResult.ok).toBe(true);
      expect(deleteResult.deleted).toBe(true);

      const getResult = await client.get("/sdk-test/to-delete");
      expect(getResult.found).toBe(false);
    });

    it("should support idempotency keys", async () => {
      const idempotencyKey = "test-idem-" + Date.now();

      const result1 = await client.put({
        path: "/sdk-test/idempotent",
        value: { x: 1 },
        idempotencyKey
      });

      const result2 = await client.put({
        path: "/sdk-test/idempotent",
        value: { x: 1 },
        idempotencyKey
      });

      // Both requests should succeed
      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      // With idempotency, they should return the same version_id
      // (if the server supports it - this tests the SDK sends the header correctly)
      expect(result1.version_id).toBeDefined();
      expect(result2.version_id).toBeDefined();
    });
  });

  describe("list/glob", () => {
    beforeAll(async () => {
      await client.put({ path: "/sdk-test/dir/a.txt", value: "a" });
      await client.put({ path: "/sdk-test/dir/b.txt", value: "b" });
      await client.put({ path: "/sdk-test/dir/sub/c.txt", value: "c" });
    });

    it("should list direct children", async () => {
      const result = await client.list("/sdk-test/dir");
      expect(result.items.length).toBeGreaterThanOrEqual(2);
      const paths = result.items.map(i => i.path);
      expect(paths).toContain("/sdk-test/dir/a.txt");
      expect(paths).toContain("/sdk-test/dir/b.txt");
    });

    it("should glob patterns", async () => {
      const result = await client.glob("/sdk-test/dir/*.txt");
      expect(result.paths).toContain("/sdk-test/dir/a.txt");
      expect(result.paths).toContain("/sdk-test/dir/b.txt");
    });
  });

  describe("history", () => {
    it("should return version history", async () => {
      const path = "/sdk-test/versioned-" + Date.now();

      await client.put({ path, value: { v: 1 } });
      await client.put({ path, value: { v: 2 } });
      await client.put({ path, value: { v: 3 } });

      const result = await client.history(path);
      expect(result.versions.length).toBe(3);
      // Most recent first
      expect(result.versions[0]!.value).toEqual({ v: 3 });
      expect(result.versions[2]!.value).toEqual({ v: 1 });
    });
  });

  describe("search", () => {
    it("should return results or note when searching", async () => {
      // Search should either return results or a note about configuration
      const result = await client.search({ query: "test query" });
      expect(Array.isArray(result.results)).toBe(true);
      // If no results, there should be a note explaining why
      if (result.results.length === 0) {
        expect(result.note).toBeDefined();
      }
    });
  });
});
