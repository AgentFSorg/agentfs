import { describe, it, expect } from "vitest";
import { makeSql } from "@agentos/shared/src/db/client.js";
import { randomUUID } from "node:crypto";
import { runLoop } from "./loop.js";

describe("worker loop", () => {
  it("should not allow two workers to claim the same job", async () => {
    const tenantId = randomUUID();
    const agentId = "worker-test";
    const path = "/worker/test";

    const sql = makeSql();
    let versionId: string;
    try {
      await sql`INSERT INTO tenants (id, name) VALUES (${tenantId}::uuid, ${"worker-test-" + tenantId.slice(0, 8)})`;

      const verRows = await sql`
        INSERT INTO entry_versions (tenant_id, agent_id, path, value_json, tags_json, importance, searchable, content_hash)
        VALUES (${tenantId}::uuid, ${agentId}, ${path}, ${JSON.stringify({ ok: true })}::jsonb, '[]'::jsonb, 0, true, 'worker-test')
        RETURNING id
      `;
      versionId = verRows[0]!.id;

      await sql`
        INSERT INTO embedding_jobs (version_id, tenant_id, agent_id, path, status)
        VALUES (${versionId}::uuid, ${tenantId}::uuid, ${agentId}, ${path}, 'queued')
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }

    const embed = async () => Array(1536).fill(0);
    await Promise.all([
      runLoop({ once: true, embed }),
      runLoop({ once: true, embed })
    ]);

    const sql2 = makeSql();
    try {
      const jobRows = await sql2`
        SELECT status, attempts
        FROM embedding_jobs
        WHERE version_id = ${versionId!}::uuid
        LIMIT 1
      `;
      expect(jobRows).toHaveLength(1);
      expect(jobRows[0]!.status).toBe("succeeded");
      expect(jobRows[0]!.attempts).toBe(1);

      const embRows = await sql2`
        SELECT count(*)::int as c
        FROM embeddings
        WHERE version_id = ${versionId!}::uuid
      `;
      expect(embRows[0]!.c).toBe(1);
    } finally {
      // Cleanup (order matters due to foreign keys)
      await sql2`DELETE FROM embeddings WHERE version_id = ${versionId!}::uuid`;
      await sql2`DELETE FROM embedding_jobs WHERE version_id = ${versionId!}::uuid`;
      await sql2`DELETE FROM entry_versions WHERE id = ${versionId!}::uuid`;
      await sql2`DELETE FROM tenants WHERE id = ${tenantId}::uuid`;
      await sql2.end({ timeout: 5 });
    }
  });
});

