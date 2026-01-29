-- AgentOS MVP schema (0001)
-- Requires pgvector extension

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  secret_hash text NOT NULL,
  label text NOT NULL DEFAULT 'default',
  scopes_json jsonb NOT NULL DEFAULT '["memory:read","memory:write","search:read"]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS agents (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  agent_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, agent_id)
);

CREATE TABLE IF NOT EXISTS entry_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  agent_id text NOT NULL,
  path text NOT NULL,
  value_json jsonb NOT NULL,
  tags_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  importance real NOT NULL DEFAULT 0,
  searchable boolean NOT NULL DEFAULT false,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_entry_versions_path_time
  ON entry_versions (tenant_id, agent_id, path, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_entry_versions_expires
  ON entry_versions (tenant_id, agent_id, expires_at);

CREATE TABLE IF NOT EXISTS entries (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  agent_id text NOT NULL,
  path text NOT NULL,
  latest_version_id uuid NOT NULL REFERENCES entry_versions(id),
  PRIMARY KEY (tenant_id, agent_id, path)
);

CREATE TABLE IF NOT EXISTS embeddings (
  version_id uuid PRIMARY KEY REFERENCES entry_versions(id),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  agent_id text NOT NULL,
  path text NOT NULL,
  model text NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_embeddings_tenant_agent
  ON embeddings (tenant_id, agent_id);

-- Optional ANN index can be added later once data exists:
-- CREATE INDEX idx_embeddings_hnsw ON embeddings USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS embedding_jobs (
  version_id uuid PRIMARY KEY REFERENCES entry_versions(id),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  agent_id text NOT NULL,
  path text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  attempts int NOT NULL DEFAULT 0,
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  key text NOT NULL,
  request_hash text NOT NULL,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS quota_usage (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  day text NOT NULL,
  writes int NOT NULL DEFAULT 0,
  bytes int NOT NULL DEFAULT 0,
  embed_tokens int NOT NULL DEFAULT 0,
  searches int NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, day)
);
