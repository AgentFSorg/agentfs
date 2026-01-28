import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { makeSql } from "./client.js";

/**
 * MVP migration runner.
 * - Applies .sql files in lexical order from src/db/migrations.
 * - Applies each migration at most once via schema_migrations table.
 *
 * Later, you can switch to drizzle-kit migrations if you prefer.
 */
async function main() {
  const sql = makeSql();
  try {
    const dir = join(process.cwd(), "src", "db", "migrations");
    const files = readdirSync(dir).filter(f => f.endsWith(".sql")).sort();

    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    const appliedRows = await sql`SELECT version FROM schema_migrations`;
    const applied = new Set<string>(appliedRows.map((r: any) => r.version as string));

    for (const f of files) {
      if (applied.has(f)) continue;
      const full = join(dir, f);
      const text = readFileSync(full, "utf8");
       
      console.log("Applying migration:", f);
      await sql.begin(async (tx) => {
        // Migration SQL is local, versioned code (not user input).
        await tx.unsafe(text);
        await tx`INSERT INTO schema_migrations (version) VALUES (${f})`;
      });
    }
     
    console.log("Migrations complete.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
   
  console.error(err);
  process.exit(1);
});
