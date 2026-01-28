import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { makeSql } from "./client.js";

/**
 * MVP migration runner.
 * - Applies .sql files in lexical order from src/db/migrations.
 * - This is intentionally simple for first-time builds.
 *
 * Later, you can switch to drizzle-kit migrations if you prefer.
 */
async function main() {
  const sql = makeSql();
  try {
    const dir = join(process.cwd(), "src", "db", "migrations");
    const files = readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
    for (const f of files) {
      const full = join(dir, f);
      const text = readFileSync(full, "utf8");
      // eslint-disable-next-line no-console
      console.log("Applying migration:", f);
      await sql.unsafe(text);
    }
    // eslint-disable-next-line no-console
    console.log("Migrations complete.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
