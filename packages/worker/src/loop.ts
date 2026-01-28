import { makeSql } from "@agentfs/shared/src/db/client.js";
import { embedText } from "./openai.js";

function buildEmbeddingText(path: string, value: unknown, tags: unknown): string {
  // MVP deterministic-ish; avoid huge payloads
  const v = JSON.stringify(value);
  const t = JSON.stringify(tags);
  const joined = `path:${path}\nvalue:${v}\ntags:${t}`;
  return joined.length > 8000 ? joined.slice(0, 8000) : joined;
}

export async function runLoop(opts: { once?: boolean; embed?: (text: string) => Promise<number[]> } = {}) {
  const embed = opts.embed ?? embedText;
  const sql = makeSql();
  try {
    while (true) {
      // Claim a queued job
      const jobs = await sql`
        WITH j AS (
          SELECT version_id
          FROM embedding_jobs
          WHERE status='queued'
          ORDER BY created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE embedding_jobs ej
        SET status='running', attempts=attempts+1, updated_at=now()
        FROM j
        WHERE ej.version_id=j.version_id
        RETURNING ej.version_id, ej.tenant_id, ej.agent_id, ej.path
      `;

      if (!jobs.length) {
        if (opts.once) return;
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      const job = jobs[0]!;
      try {
        const rows = await sql`
          SELECT id, value_json, tags_json
          FROM entry_versions
          WHERE id=${job.version_id}::uuid
          LIMIT 1
        `;
        if (!rows.length) throw new Error("Version not found");

        const ver = rows[0]!;
        const text = buildEmbeddingText(job.path, ver.value_json, ver.tags_json);
        const vec = await embed(text);
        if (!Array.isArray(vec) || vec.length === 0) throw new Error("Invalid embedding vector");
        const vecLiteral = `[${vec.join(",")}]`;

        await sql`
          INSERT INTO embeddings (version_id, tenant_id, agent_id, path, model, embedding)
          VALUES (${job.version_id}::uuid, ${job.tenant_id}::uuid, ${job.agent_id}, ${job.path},
                  ${process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small"},
                  ${vecLiteral}::vector)
          ON CONFLICT (version_id) DO UPDATE SET embedding = EXCLUDED.embedding, created_at=now()
        `;

        await sql`
          UPDATE embedding_jobs
          SET status='succeeded', updated_at=now(), last_error=NULL
          WHERE version_id=${job.version_id}::uuid
        `;
      } catch (err: any) {
        await sql`
          UPDATE embedding_jobs
          SET status='failed', updated_at=now(), last_error=${String(err?.message || err)}
          WHERE version_id=${job.version_id}::uuid
        `;
      }

      if (opts.once) return;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
