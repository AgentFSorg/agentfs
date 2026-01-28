# AgentFS Documentation Index

**Last updated:** 2026-01-27 (Europe/Dublin)

This project uses an MVP-first approach. If you are building, follow the “Start Building” path.

---

## 📚 Document Map

| Document | Purpose | Read When... |
|----------|---------|--------------|
| **README.md** | Overview + local quick start | Starting here |
| **Buildplan.md** | Phased build plan with DoD + test gates | Planning execution |
| **Architecture.md** | Technical architecture + invariants | Designing/implementing |
| **API.md** | HTTP API specification | Implementing API/SDK |
| **DataModel.md** | Postgres schema + indexing strategy | Writing migrations |
| **SERVICES.md** | External services + env vars | Setting up environments |
| **Security.md** | Threat model + controls | Hardening / review |
| **Testing.md** | Test strategy + CI gates | Building reliably |
| **Context.md** | Competitive landscape + positioning | Strategy / differentiation |
| **ProjectStatus.md** | Status template + metrics | Tracking progress |
| **DecisionLog.md** | Key decisions (and why) | Avoiding re-litigation |
| **AUDIT.md** | Risk register + “what we cut” rationale | Sanity checking scope |
| **FIXES.md** | Implementation specs for MVP primitives | Building core modules |

---

## 🎯 Quick Paths

### “I want to start building AgentFS”
1. Read **Buildplan.md**
2. Read **Architecture.md**
3. Read **DataModel.md**
4. Set up via **SERVICES.md**
5. Implement API per **API.md**
6. Use **Testing.md** to keep CI green

### “I want to evaluate whether this is a good idea”
1. Read **Context.md**
2. Read **AUDIT.md**
3. Skim **Architecture.md**

---

## 🧭 MVP scope reminder

MVP explicitly excludes:
- WebSockets/subscriptions
- Sharing/ACLs across tenants
- Solana/on-chain ownership
- Deep workspace indexing

Those are roadmap items only after the MVP is stable and adopted.


## Added integration docs

- **USERFLOW.md** — layman explanation + runtime flows
- **TELEGRAM_INTEGRATION.md** — Telegram bot integration patterns
- **PHASE_FILE_MAP.md** — which files belong to which build phase
