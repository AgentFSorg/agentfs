# USERFLOW (MVP)

**Last updated:** 2026-01-27 (Europe/Dublin)


AgentFS gives agents a **filesystem-like memory**:
- stable paths (like files)
- JSON values
- version history
- optional expiration (TTL)
- optional semantic search (opt-in)

This doc explains how developers and agents use AgentFS in practice, especially for Telegram bots.

---

## Mental model

AgentFS is an **organized memory cabinet** for an agent.

Instead of “hoping the agent remembers,” you store facts under predictable paths:

- `/user/preferences/tone` -> `{"tone":"direct"}`
- `/project/status` -> `{"phase":2}`
- `/tg/chat/<chat_id>/allowlists/tokens` -> `{"tokens":["SOL","USDC"]}`

Agents can:
- save a value (PUT)
- read it later (GET)
- browse memory (LIST/GLOB)
- audit changes (HISTORY)
- optionally search “by meaning” (SEARCH) for curated entries

---

## Telegram bot fit

Telegram bots need durable:
- per-user preferences
- per-group config
- multi-step flow state (TTL)
- a simple inspectable store

AgentFS MVP provides that with minimal infra (Postgres).

---

## Recommended path conventions

### Per-user
- `/tg/user/<uid>/prefs/*`
- `/tg/user/<uid>/profile/*`
- `/tg/user/<uid>/state/*` (TTL)

### Per-chat / group
- `/tg/chat/<cid>/config/*`
- `/tg/chat/<cid>/allowlists/*`
- `/tg/chat/<cid>/moderation/*`

---

## Standard runtime flow (per message)

1) **Read** needed prefs/config/state  
2) **Respond** using retrieved memory  
3) **Write back** durable facts (preferences, configs, summaries)  
4) **Use TTL** for short-lived flows (pending steps, cooldowns)

---

## What to store

Store:
- preferences, allowlists, thresholds, toggles
- verified facts and summaries
- operational state (cooldowns, last seen ids)

Avoid:
- raw chats (store summaries instead)
- secrets
- sensitive personal data without a policy
