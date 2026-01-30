import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { getEnv } from "../env.js";

let _sql: ReturnType<typeof postgres> | null = null;

/**
 * Returns a singleton postgres connection pool.
 * The pool lives for the entire process lifetime — never call sql.end()
 * from route handlers or middleware. Use closeSql() only at shutdown.
 */
export function getSql(): ReturnType<typeof postgres> {
  if (!_sql) {
    const env = getEnv();
    _sql = postgres(env.DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: env.NODE_ENV === "production" ? "require" : false
    });
  }
  return _sql;
}

/** @deprecated Use getSql() instead. Kept for backwards compatibility. */
export function makeSql(): ReturnType<typeof postgres> {
  return getSql();
}

/**
 * Gracefully close the singleton pool. Call only during process shutdown.
 */
export async function closeSql(): Promise<void> {
  if (_sql) {
    await _sql.end({ timeout: 5 });
    _sql = null;
  }
}

export function makeDb(sql = getSql()) {
  return drizzle(sql);
}
