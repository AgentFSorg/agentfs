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

  // New (preferred) env vars with clear units
  WRITE_QUOTA_PER_DAY: z.coerce.number().optional(),
  EMBED_TOKENS_QUOTA_PER_DAY: z.coerce.number().optional(),
  SEARCH_QUOTA_PER_DAY: z.coerce.number().optional(),
  SEARCH_RATE_LIMIT_PER_MINUTE: z.coerce.number().optional(),

  // Back-compat (deprecated)
  QUOTA_WRITES_PER_DAY: z.coerce.number().optional(),
  QUOTA_EMBED_TOKENS_PER_DAY: z.coerce.number().optional(),
  QUOTA_SEARCHES_PER_MINUTE: z.coerce.number().optional(),

  RATE_LIMIT_REQUESTS_PER_MINUTE: z.coerce.number().optional().default(120),
  PREAUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().optional().default(600),

  TRUST_PROXY: z.coerce.boolean().optional().default(false),

  // Metrics gating
  ENABLE_METRICS: z.coerce.boolean().optional(),
  METRICS_TOKEN: z.string().optional().default(""),

  ADMIN_BOOTSTRAP_TOKEN: z.string().optional().default("")
});

type EnvRaw = z.infer<typeof EnvSchema>;

export type Env = Omit<
  EnvRaw,
  "WRITE_QUOTA_PER_DAY" | "EMBED_TOKENS_QUOTA_PER_DAY" | "SEARCH_QUOTA_PER_DAY" | "SEARCH_RATE_LIMIT_PER_MINUTE" | "ENABLE_METRICS"
> & {
  WRITE_QUOTA_PER_DAY: number;
  EMBED_TOKENS_QUOTA_PER_DAY: number;
  SEARCH_QUOTA_PER_DAY: number;
  SEARCH_RATE_LIMIT_PER_MINUTE: number;
  ENABLE_METRICS: boolean;
};

export function getEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
     
    console.error(parsed.error.format());
    throw new Error("Invalid environment variables");
  }

  const data = parsed.data as any;

  const writeQuotaPerDay = data.WRITE_QUOTA_PER_DAY ?? data.QUOTA_WRITES_PER_DAY ?? 5000;
  const embedTokensQuotaPerDay = data.EMBED_TOKENS_QUOTA_PER_DAY ?? data.QUOTA_EMBED_TOKENS_PER_DAY ?? 2_000_000;

  // Historically QUOTA_SEARCHES_PER_MINUTE was used both as a per-minute limiter and as a proxy for a daily quota.
  const legacySearchPerMinute = data.QUOTA_SEARCHES_PER_MINUTE ?? 120;
  const searchRateLimitPerMinute = data.SEARCH_RATE_LIMIT_PER_MINUTE ?? legacySearchPerMinute;
  const searchQuotaPerDay = data.SEARCH_QUOTA_PER_DAY ?? legacySearchPerMinute * 60 * 24;

  const enableMetrics = data.ENABLE_METRICS ?? (data.NODE_ENV !== "production");

  return {
    ...parsed.data,
    WRITE_QUOTA_PER_DAY: writeQuotaPerDay,
    EMBED_TOKENS_QUOTA_PER_DAY: embedTokensQuotaPerDay,
    SEARCH_RATE_LIMIT_PER_MINUTE: searchRateLimitPerMinute,
    SEARCH_QUOTA_PER_DAY: searchQuotaPerDay,
    ENABLE_METRICS: enableMetrics
  } as Env;
}
