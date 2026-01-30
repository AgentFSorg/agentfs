import { createApp } from "./server.js";
import { getSql, closeSql } from "@agentos/shared/src/db/client.js";

async function warmupDb(retries = 5): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const sql = getSql();
      await sql`SELECT 1`;
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

  // N6: Periodic cleanup of expired idempotency keys (every 6 hours)
  const cleanupInterval = setInterval(async () => {
    try {
      const sql = getSql();
      const result = await sql`
        DELETE FROM idempotency_keys
        WHERE expires_at < now()
      `;
      const count = (result as any).count ?? 0;
      if (count > 0) {
        console.info(`[cleanup] Purged ${count} expired idempotency keys`);
      }
    } catch (err: any) {
      console.warn(`[cleanup] Failed to purge idempotency keys: ${err?.message}`);
    }
  }, 6 * 60 * 60 * 1000); // 6 hours

  // Fix 7: Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    console.info(`[shutdown] Received ${signal}, shutting down gracefully...`);
    clearInterval(cleanupInterval);
    try {
      // 1. Stop accepting new requests
      await app.close();
      console.info("[shutdown] Fastify server closed");
    } catch (err: any) {
      console.error("[shutdown] Error closing Fastify:", err?.message);
    }
    try {
      // 2. Close the postgres connection pool
      await closeSql();
      console.info("[shutdown] Database pool closed");
    } catch (err: any) {
      console.error("[shutdown] Error closing database pool:", err?.message);
    }
    // 3. Exit cleanly
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
