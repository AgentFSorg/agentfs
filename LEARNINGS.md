# LEARNINGS.md — AgentOS Project

Hard-won lessons. Read this before deploying, debugging, or architecting.

---

## Deployment (Fly.io)

### Region must match Supabase
- **Supabase free tier runs in US East (Virginia)**
- **API must deploy to `iad` (US East)** to avoid cross-continent latency
- JNB (Johannesburg) → IAD (Virginia) adds ~200ms+ per DB query
- `primary_region = "iad"` in `fly.toml` — do NOT change this

### fly.toml primary_region
- Only affects **new** machine creation, not existing machines
- To migrate an existing machine: clone to new region, then destroy the old one
- Or use `flyctl machines update <id> --region <region>`

### Module Resolution
- Imports like `@agentos/shared/src/*.js` only work with `tsx`
- Production start command: `node --import tsx/esm` + tsx as root dependency
- Don't try to fix this with path aliases — tsx runtime is the solution

### Zod Boolean Coercion Bug
- `z.coerce.boolean()` treats `"false"` as `true` (because `Boolean("false") === true`)
- Fix: unset the env var entirely, or use a custom transform
- Affected: `ENABLE_METRICS` env var

### Auto-stop
- `auto_stop_machines = "off"` — keep it off
- Cold starts add 5-10s to first request, kills dashboard UX
- DB warmup runs on startup (if auto-stop is on, every wake = warmup delay)

### Health Check
- `/healthz` → `{"ok":true}`
- Fly checks: HTTP on port 8080, every 30s, 5s timeout
- The "not listening on expected address" warning during deploy is transient — app starts after DB warmup

### flyctl Path
- Not in default PATH on this machine
- Use: `export PATH="$HOME/.fly/bin:$PATH"` before any fly commands

---

## API Architecture

### Embedding Generation
- Inline via OpenAI API (`text-embedding-3-small`)
- Requires `OPENAI_API_KEY` in Fly secrets
- Without it: writes work, search returns empty results (no error thrown)

### Auth Flow
- Bearer token with argon2 hash verification
- Self-service signup at `/v1/signup`
- Admin bootstrap token for initial setup
- Pre-auth rate limiting + per-tenant rate limiting

### CORS
- Enabled for website domain
- Must update if custom domain changes
- **Dashboard custom domain:** `brain.agentos.software` — MUST be in CORS origin list
- Adding `*.agentos.software` as a pattern would prevent this class of bug
- Vercel `*.vercel.app` subdomains are covered by regex
- CORS failure = dashboard shows "Unable to load memories" with retrying banner

---

## Database (Supabase)

### Free Tier Limits
- Region: US East (Virginia) — cannot change on free tier
- Connection pooling: use connection string from Supabase dashboard
- Pauses after 1 week of inactivity — set up a keep-alive ping

### Migrations
- 2 migration files in the repo
- Run via Supabase CLI or direct SQL
- pgvector extension required for embeddings/search

---

## SDK & Packages

### Monorepo Structure
- `packages/shared` — DB client, types, schemas
- `packages/api` — Fastify server
- `packages/sdk` — TypeScript client SDK
- `packages/eliza-plugin` — ElizaOS v2 integration
- `packages/worker` — background worker (if needed)

### Build Order (matters!)
1. `@agentos/shared` first (everything depends on it)
2. `@agentos/sdk` second
3. `@agentos/api` and `@agentos/eliza-plugin` last

### pnpm
- Uses pnpm workspaces
- `pnpm-lock.yaml` must be committed
- Dockerfile uses `--frozen-lockfile`

---

## Memory Sync (Reggie Integration)

### Script: `scripts/sync-memories.mjs`
- Syncs workspace memory files to AgentOS API
- Agent ID: `reggie`
- API: `https://agentos-api.fly.dev`
- 19 files synced (141.2KB total) on initial run

---

## Memory Sync Architecture

### Current State (MANUAL — needs fixing)
- `scripts/sync-memories.mjs` is a one-shot batch script
- Must be manually triggered: `node scripts/sync-memories.mjs`
- No file watcher, no auto-sync, no daemon, no incremental updates
- Reads ALL files every time (no delta detection)
- This defeats the entire AgentOS value proposition

### What AgentOS MUST Do (product requirements)
1. **Automatic** — agent never has to think about syncing
2. **Live** — changes sync in real-time or near-real-time (<5s)
3. **Always on** — background daemon or integrated into agent lifecycle
4. **Incremental** — only sync changed files, not full re-upload
5. **Bidirectional** (future) — pull memories from DB on cold start

### Implementation Options
- **Option A: File watcher daemon** — chokidar/fs.watch on memory dir, debounced sync
- **Option B: Clawdbot plugin** — hook into file write events natively
- **Option C: Git hook** — post-commit sync (misses uncommitted changes)
- **Option D: Heartbeat integration** — check for file changes during heartbeat polls

### Best approach: Option A + D combined
- File watcher for real-time sync of changed files
- Heartbeat as fallback to catch anything the watcher missed
- SDK provides `watch()` method that handles this automatically

### API Key for Sync
- Dev key: `agfs_dev_sTENQFJmiM8.5NdL31BRWZ7agvsT679QgTyZvBvTxJFxxlsCNFDtD4Q` (tenant: b032a6ed)
- Dashboard key: `agfs_dev_1pKRZspAQiU.IwF3rcrcoSwcPOx5rJ8TmC00dc-ofZxF6OySDY9Co6E` (same tenant)
- Old live key (`agfs_live_9zAB06ylDbk`) — ID was recorded wrong in notes, caused auth failures

### Dashboard
- **Live URL:** brain.agentos.software (Vercel)
- Old `dist-vultr7.vercel.app` domain died — Vercel deployment rotated
- Dashboard uses `fetchAllNodesAllAgents()` → falls back to per-agent `/v1/dump`
- `/v1/dump-all` endpoint doesn't exist yet — dashboard relies on fallback path

---

## General

### Verify Before Claiming Done
- Always `curl` endpoints after deploy
- Always check machine region after region changes
- Always confirm health check passes
- Never trust "deploy succeeded" without verification

### API Field Constraints
- `importance` field is 0-1 scale (float), NOT 0-10
- Values > 1 return 400: "Number must be less than or equal to 1"
- Common mapping: 1.0 = critical identity, 0.7 = user facts, 0.5 = config, 0.4 = thoughts

### Context Loss
- Save decisions and config details to files BEFORE compaction
- CONTEXT.md is working memory — update it after major tasks
- This file (LEARNINGS.md) is for permanent lessons

---

*Last updated: 2026-01-30*
