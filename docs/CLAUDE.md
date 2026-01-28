# Claude Code Guidelines

Rules for working on this repo.

## How to Run

```bash
# Install dependencies
pnpm i

# Start database
pnpm db:up

# Run migrations
pnpm db:migrate

# Seed default tenant
pnpm db:seed

# Create API key
pnpm create:key

# Start API (dev mode)
pnpm dev:api

# Run tests
pnpm test

# Lint
pnpm lint
```

## Repo Rules

1. **MVP-first**: No websockets, Solana, sharing/ACLs, or deep workspace indexing in early phases
2. **Clean working tree**: After each phase, run tests, ensure lint passes, commit
3. **Docs are living**: Update docs when reality changes
4. **No hidden scope creep**: Log feature proposals before implementing

## Commands to Run Without Asking

- `pnpm test` - Run all tests
- `pnpm lint` - Check linting
- `pnpm db:up` - Start database
- `pnpm db:migrate` - Run migrations
- `curl http://localhost:8787/healthz` - Check API health

## Testing Rules

- Unit tests for pure functions (path, glob, quota math)
- Integration tests for API routes (require running Postgres)
- All tests must pass before committing
- Add tests for new functionality

## No-Scope-Creep Reminders

Do NOT add without explicit approval:
- WebSocket support
- Real-time subscriptions
- Cross-tenant sharing
- ACLs/permissions beyond tenant isolation
- Solana/blockchain integration
- Deep workspace/AST indexing
- Additional embedding providers

## Commit Format

```
phase{N}: {short description}

{Optional bullet points}
```

No "authored by Claude" in commits - this is open source.
