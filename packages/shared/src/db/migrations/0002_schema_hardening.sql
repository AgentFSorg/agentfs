-- AgentOS schema hardening (0002)
-- Adds CHECK constraints and performance indexes

-- Add CHECK constraint for embedding_jobs.status
-- Note: DROP IF EXISTS syntax varies by Postgres version, so we use a safe approach
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'embedding_jobs_status_check'
  ) THEN
    ALTER TABLE embedding_jobs
      ADD CONSTRAINT embedding_jobs_status_check
      CHECK (status IN ('queued', 'running', 'succeeded', 'failed'));
  END IF;
END $$;

-- Add index for idempotency key cleanup queries
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires
  ON idempotency_keys (expires_at);

-- Add CHECK constraint for importance range (0-1)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'entry_versions_importance_check'
  ) THEN
    ALTER TABLE entry_versions
      ADD CONSTRAINT entry_versions_importance_check
      CHECK (importance >= 0 AND importance <= 1);
  END IF;
END $$;
