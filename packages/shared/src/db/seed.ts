import { makeSql } from "./client.js";
import { randomUUID } from "node:crypto";

async function main() {
  const sql = makeSql();
  try {
    const name = "default";
    const existing = await sql`SELECT id FROM tenants WHERE name=${name} LIMIT 1`;
    if (existing.length) {
      // eslint-disable-next-line no-console
      console.log("Tenant already exists:", existing[0].id);
      return;
    }
    const id = randomUUID();
    await sql`INSERT INTO tenants (id, name) VALUES (${id}::uuid, ${name})`;
    // eslint-disable-next-line no-console
    console.log("Created tenant:", id);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
