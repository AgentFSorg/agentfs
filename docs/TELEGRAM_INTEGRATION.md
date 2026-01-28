# TELEGRAM_INTEGRATION (MVP)

**Last updated:** 2026-01-27 (Europe/Dublin)


This document shows how to integrate AgentFS into a Telegram bot using a clean “memory middleware” pattern.

---

## Path templates

### Per-user
- `/tg/user/<uid>/prefs/tone`
- `/tg/user/<uid>/prefs/language`
- `/tg/user/<uid>/prefs/risk`
- `/tg/user/<uid>/state/active_flow` (TTL)

### Per-chat / group
- `/tg/chat/<cid>/config/features`
- `/tg/chat/<cid>/allowlists/tokens`
- `/tg/chat/<cid>/moderation/rules`

### Bot operational
- `/tg/bot/state/last_update_id`
- `/tg/bot/state/deploy_version`

---

## Middleware pattern

For each Telegram update:
1) derive `uid` + `cid`
2) load memory snapshot (prefs/config/flow)
3) generate response + actions
4) write back:
   - durable updates (prefs/config)
   - TTL state (flows/cooldowns)
   - optional summaries (searchable)

---

## Minimal TypeScript sketch

```ts
import { AgentFSClient } from "@agentfs/sdk";

const fs = new AgentFSClient({
  baseUrl: process.env.AGENTFS_URL!,
  apiKey: process.env.AGENTFS_KEY!,
  agentId: "tg-bot"
});

async function loadMemory(uid: string, cid: string) {
  const [tone, lang, allow, flow] = await Promise.all([
    fs.get(`/tg/user/${uid}/prefs/tone`),
    fs.get(`/tg/user/${uid}/prefs/language`),
    fs.get(`/tg/chat/${cid}/allowlists/tokens`),
    fs.get(`/tg/user/${uid}/state/active_flow`)
  ]);

  return {
    user: {
      tone: tone.found ? tone.value : { tone: "neutral" },
      language: lang.found ? lang.value : { language: "en" }
    },
    chat: {
      allowlist: allow.found ? allow.value : { tokens: [] }
    },
    flow: flow.found ? flow.value : null
  };
}
```

---

## Common command flows

### /tone direct
- `put("/tg/user/<uid>/prefs/tone", { tone: "direct" })`

### /set_alert (multi-step flow)
- set flow state with TTL (e.g. 600s)
- advance steps as user replies
- clear flow when done

---

## Semantic search (optional)

Only index curated summaries:
- `/tg/user/<uid>/profile/summary` (searchable=true)
- `/tg/chat/<cid>/config/summary` (searchable=true)

Avoid indexing raw messages.
