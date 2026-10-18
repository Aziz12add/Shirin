import http from 'http';

/** Fixed-window counter per key (IP). Used for login attempts and for scanner/probe throttling. */
export class RateLimiter {
  private hits = new Map<string, { count: number; first: number }>();

  constructor(
    private max: number,
    private windowMs: number,
    private ignoreUnknown = false
  ) {}

  isLimited(key: string): boolean {
    if (this.ignoreUnknown && key === 'unknown') return false;
    const entry = this.hits.get(key);
    if (!entry) return false;
    if (Date.now() - entry.first > this.windowMs) {
      this.hits.delete(key);
      return false;
    }
    return entry.count >= this.max;
  }

  hit(key: string): void {
    if (this.ignoreUnknown && key === 'unknown') return;
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || now - entry.first > this.windowMs) {
      this.hits.set(key, { count: 1, first: now });
    } else {
      entry.count++;
    }
    if (this.hits.size > 500) this.prune(now);
  }

  clear(key: string): void {
    this.hits.delete(key);
  }

  private prune(now: number): void {
    for (const [k, v] of this.hits) {
      if (now - v.first > this.windowMs) this.hits.delete(k);
    }
  }
}

/**
 * Client IP behind a trusted reverse proxy.
 * X-Forwarded-For is client-controlled on its left side, so we take the entry added by the
 * last trusted hop(s): PROXY_HOPS (default 1) counts from the right. PROXY_HOPS=0 ignores the header.
 */
export function getClientIp(req: http.IncomingMessage): string {
  const hops = Number(process.env.PROXY_HOPS ?? 1);
  const forwarded = req.headers['x-forwarded-for'];
  if (hops > 0 && typeof forwarded === 'string') {
    const parts = forwarded.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length) return parts[Math.max(0, parts.length - hops)];
  }
  return req.socket?.remoteAddress || 'unknown';
}
