import { getEnv } from "@agentfs/shared/src/env.js";
import { makeSql } from "@agentfs/shared/src/db/client.js";

function todayUtc(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function incWriteQuota(tenantId: string, bytes: number) {
  const env = getEnv();
  const day = todayUtc();
  const sql = makeSql();
  try {
    const rows = await sql`
      INSERT INTO quota_usage (tenant_id, day, writes, bytes, embed_tokens, searches)
      VALUES (${tenantId}::uuid, ${day}, 1, ${bytes}, 0, 0)
      ON CONFLICT (tenant_id, day)
      DO UPDATE SET writes = quota_usage.writes + 1, bytes = quota_usage.bytes + ${bytes}
      RETURNING writes
    `;
    const writes = rows[0]!.writes as number;
    if (writes > env.QUOTA_WRITES_PER_DAY) {
      throw Object.assign(new Error("Quota exceeded"), { statusCode: 429, code: "QUOTA_WRITES_PER_DAY" });
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function incSearchQuota(tenantId: string) {
  const env = getEnv();
  const day = todayUtc();
  const sql = makeSql();
  try {
    const rows = await sql`
      INSERT INTO quota_usage (tenant_id, day, writes, bytes, embed_tokens, searches)
      VALUES (${tenantId}::uuid, ${day}, 0, 0, 0, 1)
      ON CONFLICT (tenant_id, day)
      DO UPDATE SET searches = quota_usage.searches + 1
      RETURNING searches
    `;
    const searches = rows[0]!.searches as number;
    // This is a daily counter; per-minute limiting can be added later (Redis or leaky bucket).
    if (searches > env.QUOTA_SEARCHES_PER_MINUTE * 60 * 24) {
      throw Object.assign(new Error("Quota exceeded"), { statusCode: 429, code: "QUOTA_SEARCHES" });
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
