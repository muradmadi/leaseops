/**
 * In-memory fixed-window rate limiting for the unauthenticated endpoints.
 *
 * A single Bun process owns the whole instance, so an in-process map is the
 * honest data structure here: no Redis, no shared state to get wrong. It resets
 * on restart, which is acceptable — the threat is a script grinding passwords
 * over hours, not an attacker who can also restart the container.
 *
 * This exists because `/api/auth/login` is reachable from the public internet
 * once the app is behind a tunnel. argon2id makes each guess expensive, but
 * expensive is not the same as bounded.
 */
import { createMiddleware } from 'hono/factory';

interface Window {
  count: number;
  /** Epoch ms at which this window expires and the count resets. */
  resetAt: number;
}

/**
 * Resolves the caller's address for bucketing.
 *
 * Behind a proxy the socket address is the proxy's, identical for every user,
 * so a header is the only real signal — and a header is trivially forged unless
 * something in front of the app overwrites it. That is why the header name must
 * be named explicitly in `TRUSTED_CLIENT_IP_HEADER` rather than sniffed: an
 * instance that has not declared a proxy never trusts client-supplied input.
 * Behind cloudflared this is `cf-connecting-ip`.
 */
export function clientKey(c: {
  req: { header: (name: string) => string | undefined };
  env?: unknown;
}): string {
  const trusted = Bun.env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (trusted) {
    const value = c.req.header(trusted);
    if (value) return value.split(',')[0]!.trim();
  }

  // Direct exposure (or a misconfigured proxy): fall back to the socket peer.
  // Hono's Bun adapter passes the server as the environment.
  const server = c.env as { requestIP?: (req: Request) => { address: string } | null } | undefined;
  const raw = (c as unknown as { req: { raw: Request } }).req.raw;
  const peer = server?.requestIP?.(raw);
  if (peer?.address) return peer.address;

  // Nothing identified the caller. A single shared bucket would let one client
  // lock out everyone else, so decline to limit rather than cause an outage.
  return '';
}

/**
 * Builds a rate-limiting middleware over a named bucket.
 *
 * Disabled under `NODE_ENV=test` by default — the suite signs up a fresh
 * household per file and logs in repeatedly, which is precisely the pattern this
 * blocks. `enabled` overrides that, which is how the limiter's own test reaches
 * the behaviour it is testing.
 */
export function rateLimit(options: {
  /** Namespace, so login and signup do not consume each other's budget. */
  name: string;
  limit: number;
  windowMs: number;
  enabled?: boolean;
}) {
  const windows = new Map<string, Window>();
  let lastSweep = 0;

  return createMiddleware(async (c, next) => {
    const enabled = options.enabled ?? Bun.env.NODE_ENV !== 'test';
    if (!enabled) return next();

    const key = clientKey(c);
    if (!key) return next();

    const now = Date.now();

    // Amortised cleanup: without it the map grows once per distinct address
    // forever, which on a public hostname is a slow memory leak.
    if (now - lastSweep > options.windowMs) {
      for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
      lastSweep = now;
    }

    const bucket = `${options.name}:${key}`;
    const existing = windows.get(bucket);

    if (!existing || existing.resetAt <= now) {
      windows.set(bucket, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    existing.count += 1;
    if (existing.count > options.limit) {
      const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      return c.json(
        {
          message: `Too many attempts. Try again in ${retryAfter} seconds.`,
          statusCode: 429,
        },
        429
      );
    }

    return next();
  });
}
