import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import { memoryRoutes } from "./memory.js";
import { adminRoutes } from "./admin.js";
import { setupTestTenant, createSecondTenant, TestContext } from "../test-utils.js";

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
});
