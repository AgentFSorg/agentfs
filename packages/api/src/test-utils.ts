import { makeSql } from "@agentfs/shared/src/db/client.js";
import argon2 from "argon2";
import { randomBytes, randomUUID } from "node:crypto";

function base64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export interface TestContext {
  tenantId: string;
  apiKey: string;
  apiKeyId: string;
  cleanup: () => Promise<void>;
}

export async function setupTestTenant(): Promise<TestContext> {
  const sql = makeSql();

  // Create test tenant
  const tenantId = randomUUID();
  const tenantName = `test-${tenantId.slice(0, 8)}`;
  await sql`INSERT INTO tenants (id, name) VALUES (${tenantId}::uuid, ${tenantName})`;

  // Create API key
  const pub = base64url(randomBytes(8));
  const secret = base64url(randomBytes(32));
  const apiKeyId = `agfs_test_${pub}`;
  const apiKey = `${apiKeyId}.${secret}`;
  const secretHash = await argon2.hash(secret);

  await sql`
    INSERT INTO api_keys (id, tenant_id, secret_hash, label)
    VALUES (${apiKeyId}, ${tenantId}::uuid, ${secretHash}, 'test')
  `;

  const cleanup = async () => {
    // Delete in order respecting foreign keys
    await sql`DELETE FROM embeddings WHERE tenant_id = ${tenantId}::uuid`;
    await sql`DELETE FROM embedding_jobs WHERE tenant_id = ${tenantId}::uuid`;
    await sql`DELETE FROM entries WHERE tenant_id = ${tenantId}::uuid`;
    await sql`DELETE FROM entry_versions WHERE tenant_id = ${tenantId}::uuid`;
    await sql`DELETE FROM quota_usage WHERE tenant_id = ${tenantId}::uuid`;
    await sql`DELETE FROM idempotency_keys WHERE tenant_id = ${tenantId}::uuid`;
    await sql`DELETE FROM api_keys WHERE tenant_id = ${tenantId}::uuid`;
    await sql`DELETE FROM agents WHERE tenant_id = ${tenantId}::uuid`;
    await sql`DELETE FROM tenants WHERE id = ${tenantId}::uuid`;
    await sql.end({ timeout: 5 });
  };

  return { tenantId, apiKey, apiKeyId, cleanup };
}

export async function createSecondTenant(): Promise<TestContext> {
  return setupTestTenant();
}
