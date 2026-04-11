/**
 * In-memory sliding-window rate limiter.
 * Tracks attempts per key (IP address) and blocks after threshold.
 * Memory is automatically cleaned up to prevent leaks.
 */

interface RateLimitEntry {
  attempts: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

const WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS = 5 // max failed attempts per window

/** Periodically purge expired entries (every 5 minutes) */
let cleanupScheduled = false
function scheduleCleanup() {
  if (cleanupScheduled) return
  cleanupScheduled = true
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key)
    }
  }, 5 * 60 * 1000).unref()
}

/**
 * Check if a key (IP) is rate-limited.
 * Returns { limited: false } if under threshold,
 * or { limited: true, retryAfterSeconds } if blocked.
 */
export function checkRateLimit(key: string): {
  limited: boolean
  retryAfterSeconds?: number
} {
  scheduleCleanup()
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    // Window expired or first attempt — start fresh
    store.set(key, { attempts: 1, resetAt: now + WINDOW_MS })
    return { limited: false }
  }

  if (entry.attempts >= MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000)
    return { limited: true, retryAfterSeconds }
  }

  entry.attempts++
  return { limited: false }
}

/**
 * Record a successful login — clears the rate limit for that key.
 */
export function clearRateLimit(key: string) {
  store.delete(key)
}
