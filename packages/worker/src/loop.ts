import { makeSql } from "@agentos/shared/src/db/client.js";
import { embedText } from "./openai.js";

const MAX_ATTEMPTS = 5;

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
      // Claim a queued job (skip jobs that have failed too many times)
      const jobs = await sql`
        WITH j AS (
          SELECT version_id
          FROM embedding_jobs
          WHERE status='queued' AND attempts < ${MAX_ATTEMPTS}
          ORDER BY created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE embedding_jobs ej
        SET status='running', attempts=attempts+1, updated_at=now()
        FROM j
        WHERE ej.version_id=j.version_id
        RETURNING ej.version_id, ej.tenant_id, ej.agent_id, ej.path, ej.attempts
      `;

      if (!jobs.length) {
        if (opts.once) return;
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      const job = jobs[0]!;
      const attempts = (job.attempts as number) || 1;

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

        // Track embed token usage (approximate: ~tokens ≈ chars/4)
        const approxTokens = Math.ceil(text.length / 4);
        await sql`
          INSERT INTO quota_usage (tenant_id, day, writes, bytes, embed_tokens, searches)
          VALUES (${job.tenant_id}::uuid, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'), 0, 0, ${approxTokens}, 0)
          ON CONFLICT (tenant_id, day)
          DO UPDATE SET embed_tokens = quota_usage.embed_tokens + ${approxTokens}
        `;

        await sql`
          UPDATE embedding_jobs
          SET status='done', updated_at=now(), last_error=NULL
          WHERE version_id=${job.version_id}::uuid
        `;
      } catch (err: any) {
        const isFinal = attempts >= MAX_ATTEMPTS;
        await sql`
          UPDATE embedding_jobs
          SET status=${isFinal ? 'failed' : 'queued'}, updated_at=now(), last_error=${String(err?.message || err)}
          WHERE version_id=${job.version_id}::uuid
        `;

        // Exponential backoff on failure: wait 2^attempts seconds (2s, 4s, 8s, 16s, 32s)
        if (!isFinal && !opts.once) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempts), 32_000);
          console.warn(`[worker] Job ${job.version_id} failed (attempt ${attempts}/${MAX_ATTEMPTS}), retrying in ${backoffMs}ms: ${err?.message}`);
          await new Promise(r => setTimeout(r, backoffMs));
        }
      }

      if (opts.once) return;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
