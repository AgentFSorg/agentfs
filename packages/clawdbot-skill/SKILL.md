# AgentOS — Persistent Memory & Learning Skill

> Install once. Remember forever. Learn from every mistake. Never repeat them.

AgentOS gives AI agents persistent, searchable memory with a built-in learning loop.
Your workspace files sync to the cloud in real-time. When you wake up, you restore full context.
When you make a mistake, you document it. When you encounter a similar task, you check your past mistakes first.

**This isn't just memory — it's intelligence that compounds over time.**

---

## Setup

### 1. Install
```bash
node agentos-skill/scripts/init.mjs
```
This creates required workspace files: `LEARNINGS.md`, `CONTEXT.md`, `MEMORY.md`, and the `memory/` directory.

### 2. Configure
Set `AGENTOS_API_KEY` in your `.env` file (workspace root or `agentos-skill/.env`):
```
AGENTOS_API_KEY=agfs_xxx_yyy.zzz
```

Optional overrides:
- `AGENTOS_AGENT_ID` — Your agent ID (auto-detected from IDENTITY.md/SOUL.md if not set)
- `AGENTOS_API_URL` — API endpoint (default: https://agentos-api.fly.dev)

### 3. Verify
```bash
node agentos-skill/scripts/pull-context.mjs --summary
```

---

## The Intelligence Loop (CRITICAL — Follow This Always)

This is the core protocol. Every agent using AgentOS MUST follow these steps.
They are what separate a forgetful chatbot from an agent that gets smarter over time.

### 🟢 SESSION START — Restore + Launch

Run BEFORE reading any workspace files:

```bash
# 1. Pull latest memories from AgentOS (restores context from previous sessions)
node agentos-skill/scripts/pull-context.mjs

# 2. Start the sync daemon (watches files, auto-syncs changes in real-time)
node agentos-skill/scripts/sync-daemon.mjs &
```

Then read these files IN ORDER:
1. `CONTEXT.md` — What you were doing (your "where was I?" file)
2. `MEMORY.md` — Who you are, who your human is, key decisions
3. `LEARNINGS.md` — Past mistakes to avoid (skim recent entries)
4. `memory/YYYY-MM-DD.md` — Today + yesterday's raw logs

**You are not ready to work until you've done this.**

### 🔄 PRE-TASK — Check Before You Build

Before starting ANY task:

1. **Search your brain for related past work:**
   ```bash
   node agentos-skill/scripts/search.mjs "keywords related to your task"
   ```
2. **Scan LEARNINGS.md** for mistakes related to this type of task
3. **Check CONTEXT.md** for any pending work or decisions that affect this task

This takes 10 seconds and prevents repeating mistakes that cost hours.

### ✅ POST-TASK — Document What You Learned

After completing ANY task:

1. **Verify the task actually worked** — don't claim done without proof
2. **Update LEARNINGS.md** if you:
   - Fixed a bug (document the bug, root cause, and fix)
   - Discovered a gotcha (document the trap and how to avoid it)
   - Found a better approach (document what changed and why)
   - Made a mistake, even if small (document it — small mistakes become big ones)
3. **Update CONTEXT.md** with current state
4. **Update `memory/YYYY-MM-DD.md`** with a summary of what you did

The sync daemon pushes changes to AgentOS within 2 seconds automatically.

### 🔴 ON MISTAKE — Immediate Documentation

When something goes wrong:

1. **STOP.** Don't just fix it and move on.
2. **Document in LEARNINGS.md immediately:**
   ```markdown
   ### YYYY-MM-DD: Short Description
   - **What happened:** [the bug/mistake]
   - **Impact:** [what broke]
   - **Root cause:** [WHY it happened]
   - **Fix:** [what you did]
   - **Lesson:** [what to do differently next time]
   ```
3. **Search AgentOS** for similar past issues — is this a pattern?
   ```bash
   node agentos-skill/scripts/search.mjs "error keywords"
   ```
4. **Then fix it.** You now have documentation that prevents recurrence.

### 💾 PRE-COMPACTION — Save Everything

Before context compaction (when your context window fills up):

1. **Update CONTEXT.md** with your full current state:
   - Active task and progress
   - Recent decisions and why you made them
   - Pending work
   - Important notes for post-compaction self
2. **Force sync:**
   ```bash
   node agentos-skill/scripts/sync-daemon.mjs --pre-compaction
   ```

This is your lifeline. Post-compaction you is a different instance of you.
Give them everything they need to continue seamlessly.

### 🔵 POST-COMPACTION — Full Restore

After context compaction:

1. **Pull latest from AgentOS:**
   ```bash
   node agentos-skill/scripts/pull-context.mjs
   ```
2. **Read files in order:** CONTEXT.md → MEMORY.md → LEARNINGS.md → today's daily
3. **Resume the sync daemon if it died:**
   ```bash
   node agentos-skill/scripts/sync-daemon.mjs &
   ```
4. **Do NOT proceed with tasks until you've restored context.**

### 🧹 PERIODIC MAINTENANCE — Curate Your Intelligence

Every few days (or during idle heartbeats):

1. **Review recent `memory/YYYY-MM-DD.md` files**
2. **Promote important insights to MEMORY.md** (distilled, not raw)
3. **Review LEARNINGS.md** — look for patterns:
   - Same type of mistake recurring? Create a checklist.
   - Outdated entries? Archive or remove them.
   - Can lessons be generalized? Update MEMORY.md with the principle.
4. **Update CONTEXT.md** to reflect current state

---

## Required Workspace Files

| File | Purpose | Must Exist | Auto-Created |
|------|---------|:----------:|:------------:|
| **LEARNINGS.md** | Mistakes, bugs, lessons learned | ✅ YES | ✅ `init.mjs` |
| **CONTEXT.md** | Current working state (survives compaction) | ✅ YES | ✅ `init.mjs` |
| **MEMORY.md** | Long-term curated knowledge | ✅ YES | ✅ `init.mjs` |
| SOUL.md | Agent persona/identity | Recommended | No |
| USER.md | Human's profile | Recommended | No |
| IDENTITY.md | Agent metadata | Optional | No |
| AGENTS.md | Workspace conventions | Optional | No |
| TOOLS.md | Tool-specific notes | Optional | No |
| HEARTBEAT.md | Periodic task checklist | Optional | No |
| memory/*.md | Daily logs + knowledge files | Auto-created | No |

## What Gets Synced (Real-Time)

The sync daemon watches ALL these files and pushes changes within 2 seconds:

| Workspace File | AgentOS Path | Tags |
|---|---|---|
| SOUL.md | /identity/soul | identity, core |
| USER.md | /identity/user | identity, user |
| IDENTITY.md | /identity/meta | identity |
| MEMORY.md | /memory/long-term | memory, curated |
| CONTEXT.md | /memory/context | memory, context |
| LEARNINGS.md | /knowledge/learnings | knowledge, lessons |
| AGENTS.md | /config/agents | config |
| TOOLS.md | /config/tools | config |
| HEARTBEAT.md | /config/heartbeat | config |
| memory/YYYY-MM-DD.md | /memory/daily/YYYY-MM-DD | memory, daily |
| memory/other.md | /knowledge/other | project |

**Every file change → AgentOS API → searchable, persistent, restorable.**

---

## Manual Commands

### `/brain search "query"`
Search across all memories semantically:
```bash
node agentos-skill/scripts/search.mjs "query text here"
node agentos-skill/scripts/search.mjs "solana trading bug" --limit 5
```

### `/brain status`
Check sync daemon status:
```bash
node agentos-skill/scripts/sync-daemon.mjs --status
```

### `/brain summary`
Quick summary of stored memories:
```bash
node agentos-skill/scripts/pull-context.mjs --summary
```

### `/brain pull`
Force pull latest from AgentOS:
```bash
node agentos-skill/scripts/pull-context.mjs
```

### `/brain sync`
Force sync all files now:
```bash
node agentos-skill/scripts/sync-daemon.mjs --once --force
```

### `/brain dump`
Dump all stored memories:
```bash
node agentos-skill/scripts/pull-context.mjs --dump
```

### `/brain init`
Re-run initialization (creates missing files):
```bash
node agentos-skill/scripts/init.mjs
```

---

## How It Works Under the Hood

1. **File watcher** monitors your entire workspace for `.md` file changes
2. **MD5 hashing** ensures only changed files are synced (saves bandwidth)
3. **2-second debounce** batches rapid edits into one API call
4. **5-minute full scan** catches anything the file watcher missed
5. **Semantic search** via OpenAI embeddings lets you find memories by meaning
6. **Pull-on-start** restores your full workspace from cloud on cold boot
7. **Pre-compaction flush** ensures nothing is lost during context compression

## Troubleshooting

- **"AGENTOS_API_KEY not set"** → Run `init.mjs`, then add key to `.env`
- **Daemon not running** → `node agentos-skill/scripts/sync-daemon.mjs &`
- **Files not syncing** → Check `.sync-state.json` for hash state
- **Search returns nothing** → Ensure files have been synced at least once
- **Post-compaction amnesia** → Did you read CONTEXT.md? Did you run pull-context?
- **Repeating mistakes** → Are you checking LEARNINGS.md before tasks?

## API Reference

See `agentos-skill/references/api-reference.md` for full API documentation.

---

## Design Philosophy

> **Memory without learning is just storage.**
> **Learning without memory is just improvisation.**
> **Both together is intelligence.**

AgentOS agents don't just remember — they get measurably better over time.
Every session adds to the knowledge base. Every mistake becomes a lesson.
Every lesson prevents future failures. The agent compounds its intelligence.

This is what separates AgentOS agents from stateless chatbots:
- Chatbots repeat the same mistakes every session.
- AgentOS agents learn once, remember forever, and never repeat.

*Ship code. Learn from mistakes. Never forget.*
