type Bucket = {
  tokens: number;
  lastRefillMs: number;
};

const buckets = new Map<string, Bucket>();

// Best-effort cleanup to avoid unbounded memory growth.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    // Drop buckets that have been idle for > 2 windows at typical rates.
    if (now - bucket.lastRefillMs > 2 * 60_000) buckets.delete(key);
  }
}, 60_000);

export type TokenBucketResult = {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
};

/**
 * Minimal in-memory token bucket (per-process).
 * - capacity = limit
 * - refill: linear over windowMs
 */
export function checkTokenBucket(key: string, limit: number, windowMs = 60_000): TokenBucketResult {
  const now = Date.now();
  const refillRatePerMs = limit / windowMs;

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: limit, lastRefillMs: now };
    buckets.set(key, bucket);
  }

  const elapsedMs = Math.max(0, now - bucket.lastRefillMs);
  const refilled = elapsedMs * refillRatePerMs;
  bucket.tokens = Math.min(limit, bucket.tokens + refilled);
  bucket.lastRefillMs = now;

  if (bucket.tokens < 1) {
    const missing = 1 - bucket.tokens;
    const waitMs = Math.ceil(missing / refillRatePerMs);
    return { allowed: false, remaining: 0, resetAtMs: now + waitMs };
  }

  bucket.tokens -= 1;
  return { allowed: true, remaining: Math.floor(bucket.tokens), resetAtMs: now + windowMs };
}

