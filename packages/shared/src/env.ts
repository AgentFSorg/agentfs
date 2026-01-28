import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

// Load .env from workspace root (walk up until we find it or hit /)
function findEnvFile(): string | undefined {
  let dir = process.cwd();
  while (dir !== "/") {
    const candidate = resolve(dir, ".env");
    if (existsSync(candidate)) return candidate;
    dir = resolve(dir, "..");
  }
  return undefined;
}

const envPath = findEnvFile();
if (envPath) dotenv.config({ path: envPath });

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z.string().optional().default("development"),
  PORT: z.coerce.number().optional().default(8787),

  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_EMBED_MODEL: z.string().optional().default("text-embedding-3-small"),

  QUOTA_WRITES_PER_DAY: z.coerce.number().optional().default(5000),
  QUOTA_EMBED_TOKENS_PER_DAY: z.coerce.number().optional().default(2_000_000),
  QUOTA_SEARCHES_PER_MINUTE: z.coerce.number().optional().default(120),

  RATE_LIMIT_REQUESTS_PER_MINUTE: z.coerce.number().optional().default(120),

  ADMIN_BOOTSTRAP_TOKEN: z.string().optional().default("")
});

export type Env = z.infer<typeof EnvSchema>;

export function getEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
     
    console.error(parsed.error.format());
    throw new Error("Invalid environment variables");
  }
  return parsed.data;
}
