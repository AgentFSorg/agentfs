import { makeSql } from "../db/client.js";
import argon2 from "argon2";
import { randomBytes } from "node:crypto";

function base64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function main() {
  const sql = makeSql();
  try {
    const [{ id: tenantId }] = await sql`SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1`;
    if (!tenantId) throw new Error("No tenant found. Run: pnpm db:seed");

    const env = process.env.NODE_ENV === "production" ? "live" : "dev";
    const pub = base64url(randomBytes(8));
    const secret = base64url(randomBytes(32));
    const id = `agfs_${env}_${pub}`;
    const full = `${id}.${secret}`;

    const secretHash = await argon2.hash(secret);

    await sql`
      INSERT INTO api_keys (id, tenant_id, secret_hash, label)
      VALUES (${id}, ${tenantId}::uuid, ${secretHash}, 'default')
    `;

     
    console.log("API Key created:");
     
    console.log(full);
     
    console.log("Store this somewhere safe. It will not be shown again.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
   
  console.error(err);
  process.exit(1);
});
