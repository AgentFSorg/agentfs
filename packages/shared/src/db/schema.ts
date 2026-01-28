import { pgTable, text, timestamp, boolean, jsonb, real, integer, primaryKey, uuid } from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core"; // drizzle supports pgvector via `vector` type in recent versions

// Tenants kept minimal in MVP (you can expand later)
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(), // public id, e.g. agfs_live_abcd123
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  secretHash: text("secret_hash").notNull(),
  label: text("label").notNull().default("default"),
  scopesJson: jsonb("scopes_json").notNull().default(["memory:read","memory:write","search:read"]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true })
});

export const agents = pgTable("agents", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  agentId: text("agent_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  pk: primaryKey({ columns: [t.tenantId, t.agentId] })
}));

export const entryVersions = pgTable("entry_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  agentId: text("agent_id").notNull(),
  path: text("path").notNull(),
  valueJson: jsonb("value_json").notNull(),
  tagsJson: jsonb("tags_json").notNull().default([]),
  importance: real("importance").notNull().default(0),
  searchable: boolean("searchable").notNull().default(false),
  contentHash: text("content_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true })
});

export const entries = pgTable("entries", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  agentId: text("agent_id").notNull(),
  path: text("path").notNull(),
  latestVersionId: uuid("latest_version_id").notNull().references(() => entryVersions.id)
}, (t) => ({
  pk: primaryKey({ columns: [t.tenantId, t.agentId, t.path] })
}));

export const embeddings = pgTable("embeddings", {
  versionId: uuid("version_id").primaryKey().references(() => entryVersions.id),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  agentId: text("agent_id").notNull(),
  path: text("path").notNull(),
  model: text("model").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const embeddingJobs = pgTable("embedding_jobs", {
  versionId: uuid("version_id").primaryKey().references(() => entryVersions.id),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  agentId: text("agent_id").notNull(),
  path: text("path").notNull(),
  status: text("status").notNull().default("queued"), // queued|running|succeeded|failed
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const idempotencyKeys = pgTable("idempotency_keys", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  key: text("key").notNull(),
  requestHash: text("request_hash").notNull(),
  responseJson: jsonb("response_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
}, (t) => ({
  pk: primaryKey({ columns: [t.tenantId, t.key] })
}));

export const quotaUsage = pgTable("quota_usage", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  day: text("day").notNull(), // YYYY-MM-DD
  writes: integer("writes").notNull().default(0),
  bytes: integer("bytes").notNull().default(0),
  embedTokens: integer("embed_tokens").notNull().default(0),
  searches: integer("searches").notNull().default(0)
}, (t) => ({
  pk: primaryKey({ columns: [t.tenantId, t.day] })
}));
