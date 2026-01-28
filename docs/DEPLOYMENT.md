# Deployment Notes (MVP)

**Last updated:** 2026-01-28

This document covers the MVP deployment “gotchas” that matter for security and reliability without introducing new infrastructure.

## 1) Reverse proxy / client IP (`trustProxy`)

AgentFS uses `req.ip` for pre-auth throttling. If you deploy behind a reverse proxy/load balancer, configure Fastify `trustProxy` so `req.ip` reflects the real client IP.

Env:
```bash
TRUST_PROXY=false
```

Guidance:
- **Direct-to-node (no proxy):** keep `TRUST_PROXY=false`.
- **Behind a trusted proxy (Fly/Cloudflare/Nginx):** set `TRUST_PROXY=true` and ensure your proxy overwrites `X-Forwarded-For`.

Risk if misconfigured:
- If `TRUST_PROXY=false` behind a proxy, many clients may collapse into one “IP bucket”.
- If `TRUST_PROXY=true` without a trusted proxy, attackers may spoof forwarded headers (depends on infra).

## 2) Metrics exposure (`/metrics`)

MVP defaults:
- In production, `/metrics` is **disabled** unless `ENABLE_METRICS=true`.
- If `ENABLE_METRICS=true` in production, `/metrics` requires `Authorization: Bearer <METRICS_TOKEN>`.

Env:
```bash
ENABLE_METRICS=true
METRICS_TOKEN=...
```

Production recommendation (still MVP-friendly):
- Do not expose `/metrics` to the public internet.
- Prefer network isolation (private network/VPN/IP allowlist) even if you also require `METRICS_TOKEN`.

## 3) Pre-auth throttling (public API)

AgentFS applies a per-process token bucket before auth for `/v1/*` to reduce brute-force/DoS pressure.

Env:
```bash
PREAUTH_RATE_LIMIT_PER_MINUTE=600
```

Notes:
- This is **best-effort** and **per-process** (multi-instance deployments multiply the budget).
- If you go public, add coarse throttling at the edge (WAF / proxy rules) even if it’s not per-tenant.

## 4) Recommended edge rules (no new infra)

If you already use a proxy/WAF, common patterns:
- Throttle `POST /v1/*` by IP (burst + sustained).
- Separate tighter limits for `/v1/search` (calls external embeddings).
- Block or isolate `/metrics` (internal-only).

## 5) Release checklist

Before public exposure:
- Confirm `TRUST_PROXY` matches your topology.
- Confirm `/metrics` is not publicly reachable.
- Confirm edge throttling exists (even coarse).
- Run `pnpm verify`.

