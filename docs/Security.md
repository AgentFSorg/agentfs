# AgentFS Security (MVP)

**Last updated:** 2026-01-27 (Europe/Dublin)

MVP security goals: **strong tenant isolation**, safe API keys, predictable behavior.

---

## Threat model (MVP)
We defend against:
- API key leakage / brute force attempts
- Cross-tenant data access bugs
- Abuse: embedding/search cost blowups
- Injection / unsafe path parsing
- Log leakage (secrets, PII)

We defer:
- on-chain ownership semantics
- enterprise SSO / OAuth
- complex shared ACLs

---

## API keys
- Store only a **hash** of the secret (argon2 or bcrypt).
- Support rotation and revocation.

---

## Tenant isolation
Hard rules:
- `tenant_id` required in every query predicate.
- Unique constraints scoped by `tenant_id`.
- Automated integration tests for isolation.

---

## Rate limiting + quotas
- Rate limit by `(tenant_id, endpoint)`.
- Enforce quotas before enqueuing embeddings.
- Return explicit errors for denials.

---

## Logging
- Do not log request bodies by default.
- Redact authorization headers.
- Use request IDs for correlation.

---

## Backups
- Daily backups in production.
- Restore drill documented and executed periodically.
