# AgentFS Implementation Specs (MVP)

**Last updated:** 2026-01-27 (Europe/Dublin)

## Metrics (minimum set)
- `agentfs_http_requests_total{route,method,status}`
- `agentfs_http_request_duration_ms_bucket{route,method}`
- `agentfs_embedding_jobs_total{status}`
- `agentfs_quota_denials_total{type}`

(Braces are literal Prometheus label syntax.)

## Path normalization
- must start with `/`
- collapse repeated slashes
- reject `..` and `.` segments

## Delete semantics
Delete is a tombstone version, not physical deletion.

## TTL semantics
Expired entries behave as “not found” on reads; sweeper is best-effort.
