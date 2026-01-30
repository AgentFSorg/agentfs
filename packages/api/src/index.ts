import { createApp } from "./server.js";
import { makeSql } from "@agentos/shared/src/db/client.js";

async function warmupDb(retries = 5): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const sql = makeSql();
      await sql`SELECT 1`;
      await sql.end({ timeout: 5 });
      console.info(`[warmup] Database connection ready (attempt ${i + 1})`);
      return;
    } catch (err: any) {
      console.warn(`[warmup] Database not ready (attempt ${i + 1}/${retries}): ${err?.message}`);
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  console.warn("[warmup] Database warmup failed after retries — starting anyway");
}

async function main() {
  // Warm up database connection before accepting traffic
  await warmupDb();
  
  const { app, env } = await createApp({ logger: true });
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
