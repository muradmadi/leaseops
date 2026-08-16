import { describe, it, expect, afterEach } from 'bun:test';
import { Hono } from 'hono';
import { rateLimit, clientKey } from './rate-limit';

/**
 * `enabled: true` is passed throughout: the middleware is off under
 * `NODE_ENV=test` by default, because the rest of the suite logs in far more
 * often than any human would.
 */
function appWith(limit: number, windowMs = 60_000, name = 'test') {
  const app = new Hono();
  app.use('*', rateLimit({ name, limit, windowMs, enabled: true }));
  app.get('/', (c) => c.text('ok'));
  return app;
}

/** The limiter buckets on this header only when it is the declared trusted one. */
function get(app: Hono, ip: string) {
  return app.fetch(new Request('http://localhost/', { headers: { 'x-real-ip': ip } }));
}

const ORIGINAL_HEADER = Bun.env.TRUSTED_CLIENT_IP_HEADER;

afterEach(() => {
  if (ORIGINAL_HEADER === undefined) delete Bun.env.TRUSTED_CLIENT_IP_HEADER;
  else Bun.env.TRUSTED_CLIENT_IP_HEADER = ORIGINAL_HEADER;
});

describe('rateLimit', () => {
  it('allows requests up to the limit and rejects the next one with 429', async () => {
    Bun.env.TRUSTED_CLIENT_IP_HEADER = 'x-real-ip';
    const app = appWith(3);

    for (let i = 0; i < 3; i++) {
      expect((await get(app, '1.1.1.1')).status).toBe(200);
    }

    const blocked = await get(app, '1.1.1.1');
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ statusCode: 429 });
  });

  it('sends Retry-After so a client knows when the window reopens', async () => {
    Bun.env.TRUSTED_CLIENT_IP_HEADER = 'x-real-ip';
    const app = appWith(1, 60_000);

    await get(app, '2.2.2.2');
    const blocked = await get(app, '2.2.2.2');

    const retryAfter = Number(blocked.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it('buckets per address, so one attacker cannot lock everyone else out', async () => {
    Bun.env.TRUSTED_CLIENT_IP_HEADER = 'x-real-ip';
    const app = appWith(1);

    expect((await get(app, '3.3.3.3')).status).toBe(200);
    expect((await get(app, '3.3.3.3')).status).toBe(429);

    // A different caller still has its full budget.
    expect((await get(app, '4.4.4.4')).status).toBe(200);
  });

  it('does not share a budget between differently named buckets', async () => {
    Bun.env.TRUSTED_CLIENT_IP_HEADER = 'x-real-ip';
    const login = appWith(1, 60_000, 'login');
    const signup = appWith(1, 60_000, 'signup');

    expect((await get(login, '5.5.5.5')).status).toBe(200);
    expect((await get(login, '5.5.5.5')).status).toBe(429);
    expect((await get(signup, '5.5.5.5')).status).toBe(200);
  });

  it('lets the window expire rather than blocking forever', async () => {
    Bun.env.TRUSTED_CLIENT_IP_HEADER = 'x-real-ip';
    const app = appWith(1, 30);

    expect((await get(app, '6.6.6.6')).status).toBe(200);
    expect((await get(app, '6.6.6.6')).status).toBe(429);

    await Bun.sleep(45);
    expect((await get(app, '6.6.6.6')).status).toBe(200);
  });
});

describe('clientKey', () => {
  it('ignores an IP header that has not been declared trusted', () => {
    delete Bun.env.TRUSTED_CLIENT_IP_HEADER;

    // Without a declared proxy the header is attacker-controlled: honouring it
    // would let one client rotate the value and never hit a limit at all.
    const key = clientKey({
      req: { header: (n: string) => (n === 'x-real-ip' ? '9.9.9.9' : undefined), raw: {} as Request },
    } as any);

    expect(key).not.toBe('9.9.9.9');
  });

  it('takes the first hop of a comma-joined forwarded header', () => {
    Bun.env.TRUSTED_CLIENT_IP_HEADER = 'x-forwarded-for';

    const key = clientKey({
      req: {
        header: (n: string) => (n === 'x-forwarded-for' ? '7.7.7.7, 10.0.0.1, 10.0.0.2' : undefined),
        raw: {} as Request,
      },
    } as any);

    expect(key).toBe('7.7.7.7');
  });

  it('returns an empty key when the caller cannot be identified', () => {
    delete Bun.env.TRUSTED_CLIENT_IP_HEADER;

    // An empty key means "do not limit". A shared fallback bucket would be
    // worse than no limiting: one client would lock out every other.
    const key = clientKey({ req: { header: () => undefined, raw: {} as Request } } as any);

    expect(key).toBe('');
  });
});
