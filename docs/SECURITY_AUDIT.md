# AgentFS Security Audit

**Date:** 2026-01-28  
**Scope:** `packages/api`, `packages/shared`, `packages/worker`, `packages/sdk`  
**Audit baseline (pre-fix):** `12ca262` (phase4)  
**Fix range:** `a396971..99e3af9`

This report is **evidence-based**. Every finding includes exact file paths, line ranges, and concrete exploit/impact descriptions. When an item is a product decision (not a clear bug), it is called out explicitly.

---

## Executive Summary (Top Risks)

1. **SQL injection in `/v1/search` (Critical)** — pre-fix used `sql.unsafe()` with user-controlled interpolation; fixed.
2. **Untrusted upstream error bodies exposed / stored (High)** — pre-fix bubbled OpenAI error bodies to clients or persisted them; fixed.
3. **Missing request size/time limits (Medium)** — pre-fix relied on defaults and had no upstream timeout; fixed.
4. **Wildcard bypass in prefix filters (Medium)** — pre-fix treated `%`/`_` as LIKE wildcards; fixed.
5. **Unauthenticated endpoints (/metrics) and unauthenticated rate limiting (Product decision)** — should be protected by network policy or auth in production.

---

## Threat Model (Concrete)

### Assets
- Tenant data in Postgres (`entries`, `entry_versions`, `embeddings`)
- API keys (`api_keys.secret_hash`) and scopes
- Embeddings + embedding job state (`embeddings`, `embedding_jobs.last_error`)
- Service availability (DoS resilience)

### Actors
- Legitimate client with a valid API key
- Attacker without a key (unauthenticated)
- Attacker with a key (malicious tenant)

### Entry Points
- HTTP API (`packages/api/src/routes/*`)
- Worker loop (`packages/worker/src/loop.ts`)
- Admin bootstrap endpoint (`/v1/admin/create-key`)
- Logs + metrics output

### Trust Boundaries
- **API key boundary:** Bearer token → tenant identity (`packages/api/src/auth.ts`)
- **Tenant boundary:** every query must include `tenant_id` (documented invariant)
- **DB boundary:** Postgres is the source of truth; SQL must remain parameterized
- **Upstream boundary:** OpenAI embeddings responses/errors are untrusted input

---

## Findings Table

| ID | Severity | Area | Description | Evidence | Fixed in |
|---:|:--|:--|:--|:--|:--|
| SEC-001 | Critical | API / Search | SQL injection in `/v1/search` via `sql.unsafe()` and string interpolation | `packages/api/src/routes/memory.ts` (pre-fix) `7956fbc^` `#L359-388` | `7956fbc` |
| SEC-002 | High | API / Embeddings | Upstream error bodies exposed to clients (`details`) | `packages/api/src/embeddings.ts` (pre-fix) `a396971^` `#L23-26` | `a396971` |
| SEC-003 | High | Worker / Embeddings | Upstream error bodies embedded into error message, persisted into `embedding_jobs.last_error` | `packages/worker/src/openai.ts` (pre-fix) `c270879^` `#L20-23` and `packages/worker/src/loop.ts` (pre-fix) `c270879^` `#L66-71` | `c270879` |
| SEC-004 | Medium | API / DoS | Missing explicit body size and request timeouts | `packages/api/src/index.ts` (pre-fix) `a396971^` `#L10-13` | `a396971` |
| SEC-005 | Medium | API / DoS | No upstream request timeout for embeddings call | `packages/api/src/embeddings.ts` (pre-fix) `a396971^` `#L11-21` | `a396971` |
| SEC-006 | Medium | API / Auth | Bearer parsing accepted unbounded/unsanitized token parts (DoS surface) | `packages/api/src/auth.ts` (pre-fix) `a396971^` `#L11-22` | `a396971` |
| SEC-007 | Medium | API / Data correctness | Prefix filters treated `%`/`_` as wildcards (LIKE injection/bypass of intended filter) | `packages/api/src/routes/memory.ts` `#L323-340` and `#L441-472` | `7956fbc` |
| SEC-008 | Medium | API / DoS | Glob patterns unbounded (size/shape), enabling expensive LIKE scans with huge patterns | `packages/api/src/routes/memory.ts` `#L364-399` | `7956fbc` |
| SEC-009 | Low | API / Abuse | Admin bootstrap endpoint lacked explicit rate limit | `packages/api/src/routes/admin.ts` `#L17-23` | `a396971` |
| SEC-010 | Product decision | Ops | `/metrics` unauthenticated | `packages/api/src/index.ts` `#L37-40` | N/A |

---

## Detailed Findings

### SEC-001: SQL Injection in `/v1/search` (Critical) — FIXED

**Impact:** A malicious tenant could execute arbitrary SQL (data loss / data exfiltration / auth bypass), depending on DB permissions.

**Exploit scenario (pre-fix):**
- Send `agent_id` containing a quote and SQL, e.g. `test'; DROP TABLE entries; --`

**Evidence (pre-fix code):** `packages/api/src/routes/memory.ts` in the parent of `7956fbc`.  
The query was built using `sql.unsafe()` and string interpolation:

```ts
// packages/api/src/routes/memory.ts (pre-fix) 7956fbc^#L359-L388
pathFilter = prefix === "/" ? "" : ` AND emb.path LIKE '${prefix.replace(/'/g, "''")}%'`;
const rows = await sql.unsafe(`
  ...
  WHERE emb.tenant_id = '${ctx.tenantId}'::uuid
    AND emb.agent_id = '${body.agent_id}'
  ...
  LIMIT ${body.limit}
`);
```

**Fix:** Replaced `sql.unsafe()` with parameterized `postgres.js` tagged templates and validated `agent_id`.  
**Why it prevents the exploit:** user-controlled input is bound as parameters, not concatenated into SQL.  
**Fix commit:** `7956fbc`.

---

### SEC-002: Upstream error bodies exposed to clients (High) — FIXED

**Impact:** Potential leakage of internal upstream details (request IDs, provider error payloads, policy details) to arbitrary API callers; also expands the attack surface for error-driven probing.

**Evidence (pre-fix code):** `packages/api/src/embeddings.ts` in the parent of `a396971`:

```ts
// packages/api/src/embeddings.ts (pre-fix) a396971^#L23-L26
const body = await res.text();
throw Object.assign(new Error(`Embeddings API error: ${res.status}`), {
  statusCode: 502, code: "EMBEDDINGS_API_ERROR", details: body
});
```

**Fix:** Do not return upstream body to clients; log it server-side instead; add upstream timeout.  
**Fix commit:** `a396971`.

---

### SEC-003: Upstream error bodies persisted in DB (High) — FIXED

**Impact:** Pre-fix, OpenAI error bodies could be stored in `embedding_jobs.last_error`. If a future API endpoint exposes job errors (or DB is shared with support tooling), this becomes a persistent data leak channel.

**Evidence (pre-fix code):**

```ts
// packages/worker/src/openai.ts (pre-fix) c270879^#L20-L23
const body = await res.text();
throw new Error(`Embeddings API error: ${res.status} ${body}`);
```

```ts
// packages/worker/src/loop.ts (pre-fix) c270879^#L66-L71
UPDATE embedding_jobs
SET status='failed', updated_at=now(), last_error=${String(err?.message || err)}
```

**Fix:** Log upstream body, but throw/persist only status-level messages; add upstream timeout.  
**Fix commit:** `c270879`.

---

### SEC-004: Missing explicit request size/time limits (Medium) — FIXED

**Impact:** Increases DoS risk from large payloads or slow clients.

**Evidence (pre-fix code):** `packages/api/src/index.ts` parent of `a396971` shows Fastify created without limits:

```ts
// packages/api/src/index.ts (pre-fix) a396971^#L10-L13
const app = Fastify({
  logger: true
});
```

**Fix:** Configure `bodyLimit`, `connectionTimeout`, `requestTimeout`.  
**Fix commit:** `a396971`.

---

### SEC-007: Prefix filters treated `%`/`_` as wildcards (Medium) — FIXED

**Impact:** A caller can bypass *intended* prefix filters (e.g., list/search under a specific prefix) by including `%`/`_` in the prefix. This is not cross-tenant, but it violates the API contract and can expand query cost.

**Evidence (fixed code):** list now escapes LIKE metacharacters.  
`packages/api/src/routes/memory.ts#L323-340`.

```ts
const like = `${escapeSqlLikeLiteral(prefixWithSlash)}%`;
...
AND e.path LIKE ${like} ESCAPE '\\'
```

**Fix commit:** `7956fbc`.

---

### SEC-008: Glob patterns unbounded (Medium) — FIXED

**Impact:** Very large patterns can drive CPU/memory overhead and expensive DB scans.

**Evidence (fixed code):** `packages/api/src/routes/memory.ts#L364-399` adds `max(512)` and normalizes/validates segments before translation.

**Fix commit:** `7956fbc`.

---

## Items Requiring Product Decision (Not Clear Bugs)

1. **Unauthenticated `/metrics`** (`packages/api/src/index.ts#L37-40`)  
   - If the API is public, protect via network policy, basic auth, or an internal-only listener.
2. **Unauthenticated rate limiting**  
   - Current limiter keys on `tenantId`, which is only known after auth. If the API is public-facing, add a coarse IP-based or global limiter in front of auth to reduce brute-force/DoS risk.

---

## Fixed In This Patch Set

- `a396971` — harden auth token parsing, add Fastify request limits/timeouts, sanitize validation errors, and rate-limit admin bootstrap.
- `7956fbc` — parameterize `/v1/search`, escape LIKE prefix filters, validate/normalize glob patterns, validate idempotency keys.
- `c270879` — add embeddings timeout and avoid persisting third-party error bodies in worker; also harden vector insert path.
- `4f16476` — add security/caps tests + worker claim test coverage.
- `719b699` — make SDK contract tests self-contained by running an in-process API.
- `99e3af9` — schema hardening migration for constraints and indexes.

