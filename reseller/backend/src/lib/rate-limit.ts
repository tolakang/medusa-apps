// Per-IP request limits for the customer auth routes (TASKS P1-21). In the
// backend rather than in Traefik: Dokploy regenerates each app's Traefik file
// when its domains change, so a hand-added Traefik limit could silently
// disappear; this one is versioned and tested with the code.
// In memory: the plan runs ONE server replica (BUILD_PLAN §5), and a restart
// only resets the counters.

type Window = { count: number; resetAt: number }

const MAX_KEYS = 50_000

export class FixedWindowLimiter {
  private windows = new Map<string, Window>()

  // Counts one request; false when the key is over `limit` in this window.
  hit(key: string, limit: number, windowMs: number, now = Date.now()) {
    if (this.windows.size > MAX_KEYS) this.prune(now)
    const current = this.windows.get(key)
    const window = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs }
    window.count += 1
    this.windows.set(key, window)
    return {
      allowed: window.count <= limit,
      retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
    }
  }

  private prune(now: number) {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key)
    }
  }
}
