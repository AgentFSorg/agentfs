-- AgentOS wallet authentication (0003)
-- Adds wallet-based auth for token-gated API access

-- Add wallet fields to tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wallet_address text UNIQUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wallet_verified_at timestamptz;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS token_balance bigint NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'free';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tier_downgrade_warning_at timestamptz;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS last_balance_check timestamptz;

-- Backfill email from name for existing tenants (name was used as email in signup)
UPDATE tenants SET email = name WHERE email IS NULL AND name LIKE '%@%';

-- Index for wallet lookups
CREATE INDEX IF NOT EXISTS idx_tenants_wallet ON tenants (wallet_address) WHERE wallet_address IS NOT NULL;

-- Index for balance check cron (find wallets needing re-check)
CREATE INDEX IF NOT EXISTS idx_tenants_balance_check ON tenants (last_balance_check) WHERE wallet_address IS NOT NULL;

-- Table to track tier changes for audit
CREATE TABLE IF NOT EXISTS tier_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  old_tier text NOT NULL,
  new_tier text NOT NULL,
  token_balance bigint NOT NULL DEFAULT 0,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tier_history_tenant ON tier_history (tenant_id, created_at DESC);
