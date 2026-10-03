import { Redis } from "@upstash/redis";
import { env } from "@/env";

// ---------- Upstash Redis (optional) ----------

let redis: Redis | null = null;

const redisUrl = env.UPSTASH_REDIS_REST_URL;
const redisToken = env.UPSTASH_REDIS_REST_TOKEN;

if (redisUrl && redisToken) {
  redis = new Redis({
    url: redisUrl,
    token: redisToken,
  });
}

// ---------- In-memory fallback ----------

type RateLimitEntry = {
  count: number;
  resetTime: number;
};

const store = new Map<string, RateLimitEntry>();

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now >= entry.resetTime) {
        store.delete(key);
      }
    }
  }, 60_000);
}

function checkRateLimitInMemory({
  key,
  windowMs,
  maxRequests,
}: {
  key: string;
  windowMs: number;
  maxRequests: number;
}): { allowed: true } | { allowed: false; retryAfter: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.resetTime) {
    store.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetTime - now) / 1000) };
  }

  entry.count++;
  return { allowed: true };
}

// ---------- Public API ----------

/**
 * Atomically increments the counter and returns its value plus the remaining TTL.
 *
 * A plain INCR followed by a separate EXPIRE is not safe: if the process dies or
 * the EXPIRE call fails in between, the key survives with no TTL and the caller is
 * locked out permanently. Doing both in one server-side script removes that window
 * and also repairs any pre-existing key that was left without a TTL.
 */
const INCR_WITH_TTL = `
local current = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { current, ttl }
`;

/**
 * Fixed-window rate limiter.
 * Uses Upstash Redis when UPSTASH_REDIS_REST_URL/TOKEN are set,
 * otherwise falls back to an in-memory Map (per-instance).
 */
export async function checkRateLimit({
  key,
  windowMs,
  maxRequests,
}: {
  key: string;
  windowMs: number;
  maxRequests: number;
}): Promise<{ allowed: true } | { allowed: false; retryAfter: number }> {
  if (!redis) {
    return checkRateLimitInMemory({ key, windowMs, maxRequests });
  }

  const windowSec = Math.ceil(windowMs / 1000);

  try {
    const [current, ttl] = (await redis.eval(INCR_WITH_TTL, [key], [windowSec])) as [
      number,
      number,
    ];

    if (current > maxRequests) {
      return { allowed: false, retryAfter: ttl > 0 ? ttl : windowSec };
    }

    return { allowed: true };
  } catch (error) {
    console.warn("[rate-limit] Redis error, falling back to in-memory:", error);
    return checkRateLimitInMemory({ key, windowMs, maxRequests });
  }
}
