-- Migration 0004: Performance indexes and cleanup
-- Addresses audit findings M7, N6

-- M7: Index on embedding_jobs.status for worker query performance
-- The worker queries: WHERE status='queued' ORDER BY created_at ASC FOR UPDATE SKIP LOCKED
CREATE INDEX IF NOT EXISTS idx_embedding_jobs_status_created
  ON embedding_jobs(status, created_at)
  WHERE status IN ('queued', 'running');

-- N6: Cleanup expired idempotency keys (background maintenance)
-- This index enables efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires
  ON idempotency_keys(expires_at)
  WHERE expires_at IS NOT NULL;

-- Additional performance: index on entry_versions for history queries
CREATE INDEX IF NOT EXISTS idx_entry_versions_path_created
  ON entry_versions(tenant_id, agent_id, path, created_at DESC);

-- Additional performance: index on entries for list queries
CREATE INDEX IF NOT EXISTS idx_entries_path_prefix
  ON entries(tenant_id, agent_id, path text_pattern_ops);
