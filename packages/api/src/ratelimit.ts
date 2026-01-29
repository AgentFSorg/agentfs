import { getEnv } from "@agentos/shared/src/env.js";

/**
 * Simple in-memory sliding window rate limiter.
 * For production, replace with Redis-based implementation.
 */

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

// Map of tenantId:endpoint -> rate limit state
const limits = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of limits) {
    if (entry.resetAt <= now) {
      limits.delete(key);
    }
  }
}, 60_000); // Clean every minute

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * Check and increment rate limit for a tenant/endpoint combination.
 * Returns whether the request is allowed and remaining quota.
 */
export function checkRateLimit(
  tenantId: string,
  endpoint: string,
  maxRequests?: number,
  windowMs?: number
): RateLimitResult {
  const env = getEnv();
  const limit = maxRequests ?? env.RATE_LIMIT_REQUESTS_PER_MINUTE ?? 60;
  const window = windowMs ?? 60_000; // Default 1 minute window

  const key = `${tenantId}:${endpoint}`;
  const now = Date.now();

  let entry = limits.get(key);

  // Reset if window expired
  if (!entry || entry.resetAt <= now) {
    entry = {
      count: 0,
      resetAt: now + window
    };
    limits.set(key, entry);
  }

  // Check if over limit
  if (entry.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt
    };
  }

  // Increment and allow
  entry.count++;
  return {
    allowed: true,
    remaining: limit - entry.count,
    resetAt: entry.resetAt
  };
}

/**
 * Apply rate limit headers to response.
 */
export function applyRateLimitHeaders(
  reply: { header: (name: string, value: string) => void },
  result: RateLimitResult,
  limit: number
): void {
  reply.header("X-RateLimit-Limit", String(limit));
  reply.header("X-RateLimit-Remaining", String(result.remaining));
  reply.header("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
}
