# MCP Server Audit Report

Scope: src/config.ts, src/api-client.ts, src/server.ts, src/index.ts, src/bin/agentos-mcp.ts

Findings

- [warning] src/server.ts:97-103 — `memory_recall` parses `m.tags` with `JSON.parse` without a guard. If the API returns non-JSON tags (e.g. comma-separated string, plain tag, or malformed JSON), the tool handler throws and the MCP call fails. Suggested fix: wrap in `try/catch`, or accept both `string[]` and `string` and only `JSON.parse` when the string looks like JSON; default to displaying the raw value on parse failure.

- [warning] src/server.ts:145-152, 216-220 — `JSON.stringify` is used on memory values without error handling. If values include circular references or BigInt, `JSON.stringify` throws; in `memory_list` it can also return `undefined`, and `undefined.slice(...)` will throw. Suggested fix: implement a safe stringify helper that catches errors and falls back to `String(value)`, and guard against `undefined` before slicing.

- [warning] src/server.ts:45-46, 83-114, 131-155, 171-180, 202-230 — Tool handlers do not catch API failures. Any `AgentOSClient` error will bubble up and be returned as an MCP error (no user-friendly message and no `isError` content). Suggested fix: wrap each tool handler in `try/catch` and return a text error (or MCP `isError` content) with actionable guidance.

- [warning] src/api-client.ts:41-62 — `request` assumes successful responses always have JSON bodies. If the API returns `204 No Content` or non-JSON success payloads, `res.json()` throws, triggering retries and eventual failure. Suggested fix: handle empty bodies and check `Content-Type` before parsing; fall back to `res.text()` for non-JSON responses.

- [info] src/api-client.ts:41-73 — If `retries` is ever set to `0`, `lastError` remains `undefined` and `throw lastError!` throws `undefined`, obscuring the error path. Suggested fix: guard `retries >= 1` or throw a new `Error("No attempts made")` when `retries < 1`.

- [warning] src/api-client.ts:35-53 — `apiUrl` is taken from CLI/env/config without validation. This allows non-HTTPS endpoints or unexpected hosts if environment variables are manipulated, potentially causing data exfiltration in shared environments. Suggested fix: validate `apiUrl` scheme (https) and optionally enforce an allowlist or warn on non-https.

- [info] src/config.ts:20-34, 59-79 — Config file parsing is unvalidated. Malformed types (e.g., numbers or objects for `apiKey`/`apiUrl`) will pass through and may cause runtime errors later. Suggested fix: validate parsed config with a schema (zod) and coerce to strings.

- [info] src/server.ts:26-33, 75-81 — `memory_store` schema accepts only `string` values, but descriptions say “JSON or structured data”. This is a schema/documentation mismatch and may reject valid client inputs. Suggested fix: allow `z.union([z.string(), z.record(z.any()), z.array(z.any())])` and serialize before sending to the API.

- [info] src/index.ts:8-10 — Re-exports are fine; no issues found in this file.

Summary

Primary risks are tool-handler crashes from unsafe JSON parsing/stringification, and brittle API response handling in the client. These can surface as MCP tool failures without clear user feedback.
