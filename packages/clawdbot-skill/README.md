# @agentos/clawdbot-skill

> Persistent memory skill for Clawdbot-powered AI agents. Install once, remember forever.

## What It Does

- **Real-time sync** — File changes push to AgentOS within 2 seconds
- **Intelligence loop** — Automatic mistake tracking via LEARNINGS.md
- **Context preservation** — Pre/post compaction hooks so agents never lose context
- **Semantic search** — Find any memory by meaning, not just filename
- **Auto-discovery** — Any `.md` file in your workspace syncs automatically

## Quick Start

1. Copy this skill into your Clawdbot workspace:
   ```
   cp -r packages/clawdbot-skill /path/to/your/workspace/agentos-skill
   ```

2. Create `.env` in the skill directory:
   ```
   AGENTOS_API_KEY=agfs_xxx_yyy.zzz
   AGENTOS_API_URL=https://agentos-api.fly.dev
   AGENTOS_AGENT_ID=my-agent
   ```

3. Initialize:
   ```bash
   node agentos-skill/scripts/init.mjs
   ```

4. Start syncing:
   ```bash
   node agentos-skill/scripts/pull-context.mjs
   node agentos-skill/scripts/sync-daemon.mjs &
   ```

## Scripts

| Script | Purpose |
|--------|---------|
| `init.mjs` | Creates LEARNINGS.md, CONTEXT.md, MEMORY.md |
| `sync-daemon.mjs` | Watches files, auto-syncs to AgentOS API |
| `pull-context.mjs` | Restores context from AgentOS on cold start |
| `search.mjs` | Semantic search across all memories |

## The Intelligence Loop

See [SKILL.md](./SKILL.md) for the full protocol — session start, pre-task checks, post-task documentation, compaction handling, and maintenance routines.

## Requirements

- Node.js 18+
- AgentOS API key ([get one free](https://agentos.software/api))
- Zero npm dependencies (uses native `fetch`, `fs`, `crypto`)

## License

MIT — built by [MoonstoneLabs](https://moonstonelabs.co.za)
