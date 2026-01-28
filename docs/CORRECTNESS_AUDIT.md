# AgentFS Correctness Audit

**Date:** 2026-01-28  
**Scope:** `packages/api`, `packages/shared`, `packages/worker`, `packages/sdk`  
**Audit baseline (pre-fix):** `12ca262` (phase4)  
**Fix range:** `a396971..99e3af9`

This report focuses on invariants described in `docs/Architecture.md` and the behavior implemented in code. Items that are “by design” are labeled; anything that needs product decision is separated.

---

## Expected Invariants (from Architecture)

1. **Tenant isolation:** every data query must scope by `tenant_id`. (`docs/Architecture.md#L27-L35`)
2. **Versioning:** PUT appends a new `entry_versions` row; `entries.latest_version_id` points to the latest version for `(tenant_id, agent_id, path)`.
3. **Tombstones:** DELETE writes a tombstone version; reads treat tombstoned entries as not found.
4. **TTL:** expired entries behave as not found on reads and should be excluded from list/glob results.
5. **Glob semantics:** `*` within a segment, `**` across segments, `?` single character (documented).

---

## Verified Behaviors (Evidence)

### Tenant isolation in API queries
- `GET`: `packages/api/src/routes/memory.ts#L164-172`
- `LIST`: `packages/api/src/routes/memory.ts#L331-340`
- `GLOB`: `packages/api/src/routes/memory.ts#L386-397`
- `SEARCH`: `packages/api/src/routes/memory.ts#L467-473` and `#L489-495` (both branches)

### TTL + tombstones enforced on reads/lists
- `GET` checks `expires_at` + `deleted_at`: `packages/api/src/routes/memory.ts#L175-189`
- `LIST` and `GLOB` filter out `deleted_at` and `expires_at`: `packages/api/src/routes/memory.ts#L337-340` and `#L392-395`

### Idempotency key mismatch behavior
- Throws `422 IDEMPOTENCY_KEY_MISMATCH`: `packages/api/src/idempotency.ts#L47-53`
- Test: `packages/api/src/routes/memory.test.ts` (“should reject idempotency key reuse with different request body”)

---

## Correctness Issues Found

### COR-001: Worker vector insertion format was incorrect (Fixed)

**Impact:** Embedding writes could fail at runtime depending on how the driver serializes JS arrays, leaving jobs stuck as `failed` without embeddings.

**Evidence (pre-fix):** `packages/worker/src/loop.ts` parent of `c270879` wrote `${vec}::vector` directly: `c270879^#L53-58`.

**Fix (current):**
- Validate vector non-empty and format to a pgvector literal string: `packages/worker/src/loop.ts#L52-61`.

**Fix commit:** `c270879`.

---

### COR-002: Prefix filter semantics were incorrect with `%`/`_` (Fixed)

**Impact:** `list(prefix)` and `search(path_prefix)` could match unintended paths if the literal prefix contained SQL LIKE metacharacters.

**Evidence (fixed):**
- `LIST` escapes `prefixWithSlash` before appending `%`: `packages/api/src/routes/memory.ts#L329-340`
- `SEARCH` escapes `path_prefix` before appending `%`: `packages/api/src/routes/memory.ts#L441-472`

**Fix commit:** `7956fbc`.

---

### COR-003: Glob semantics are an approximation (Needs product decision / doc alignment)

**Impact:** `globToSqlLike` uses `%` for `*`, which can match `/` (segment separators). This can violate the documented rule “`*` within a segment” for certain patterns.

**Evidence:** `packages/shared/src/glob.ts#L21-29` uses `%` for both `*` and `**`.

**Options:**
1. Update docs to explicitly state `*` is implemented as a LIKE approximation and may cross segments.
2. Implement stricter semantics (likely using regex `~` with `[^/]*`), accepting possible performance trade-offs.

---

### COR-004: Quota naming/units are confusing (Needs product decision / docs alignment)

**Impact:** `QUOTA_SEARCHES_PER_MINUTE` is used both as a per-minute limiter and as a basis for a daily counter (`* 60 * 24`). This is consistent code-wise, but confusing operationally.

**Evidence:** `packages/api/src/quotas.ts#L48-52` and `packages/api/src/routes/memory.ts#L408-416`.

**Recommendation:** Split into `RATE_LIMIT_SEARCHES_PER_MINUTE` and `QUOTA_SEARCHES_PER_DAY` (or document current coupling).

---

## Test Plan Improvements (Implemented)

1. **Auth failure cases**
   - Wrong scheme: `packages/api/src/routes/memory.test.ts` (“should reject requests with wrong auth scheme”)
   - Revoked key: `packages/api/src/routes/memory.test.ts` (“should reject revoked API keys”)
2. **Tenant boundary cases**
   - Cross-tenant read/list/glob: existing `Tenant Isolation` tests in `packages/api/src/routes/memory.test.ts`
3. **TTL & tombstone behavior**
   - TTL expiration behavior: `packages/api/src/routes/memory.test.ts` (“TTL Behavior”)
4. **List/glob caps**
   - Max 500 results: `packages/api/src/routes/memory.test.ts` (“Caps”)
5. **Worker job claiming correctness**
   - Two workers cannot claim same job: `packages/worker/src/loop.test.ts`

