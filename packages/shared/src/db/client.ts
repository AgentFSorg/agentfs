import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { getEnv } from "../env.js";

export function makeSql() {
  const env = getEnv();
  return postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: env.NODE_ENV === "production" ? "require" : false
  });
}

export function makeDb(sql = makeSql()) {
  return drizzle(sql);
}
