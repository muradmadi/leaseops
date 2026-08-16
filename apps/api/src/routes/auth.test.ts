import { describe, it, expect, afterAll } from 'bun:test';
import app from '../index';
import { createTestAccount, TEST_PASSWORD, type TestAccount } from '../test-support';

describe('Authentication Flow & Route Protection', () => {
  const accounts: TestAccount[] = [];

  afterAll(async () => {
    for (const account of accounts) await account.cleanup();
  });

  /**
   * The gate on creating a household. `ALLOW_SIGNUP=false` is exercised rather
   * than the production default ("open until the first account exists") because
   * the suite runs against the developer's database, which already has users —
   * and flipping `NODE_ENV` to production mid-run would also switch the LLM
   * services off their offline stubs.
   */
  describe('ALLOW_SIGNUP gate', () => {
    const original = Bun.env.ALLOW_SIGNUP;
    const restore = () => {
      if (original === undefined) delete Bun.env.ALLOW_SIGNUP;
      else Bun.env.ALLOW_SIGNUP = original;
    };

    it('refuses to create a new household when sign-up is closed', async () => {
      Bun.env.ALLOW_SIGNUP = 'false';
      try {
        const res = await app.fetch(
          new Request('http://localhost/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: 'create',
              username: `t_closed_${crypto.randomUUID().slice(0, 8)}`,
              password: TEST_PASSWORD,
              displayName: 'Stranger',
              gender: 'male',
              householdName: 'Uninvited',
            }),
          })
        );

        expect(res.status).toBe(403);
        expect((await res.json()).statusCode).toBe(403);
      } finally {
        restore();
      }
    });

    it('still lets someone join an existing household, which needs its code', async () => {
      const host = await createTestAccount('gatehost');
      accounts.push(host);

      Bun.env.ALLOW_SIGNUP = 'false';
      try {
        const res = await app.fetch(
          new Request('http://localhost/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: 'join',
              joinCode: host.joinCode,
              username: `t_joiner_${crypto.randomUUID().slice(0, 8)}`,
              password: TEST_PASSWORD,
              displayName: 'Partner',
              gender: 'female',
            }),
          })
        );

        // Closing sign-up must not strand a partner setting up their phone.
        expect(res.status).toBe(201);
        expect((await res.json()).household.id).toBe(host.householdId);
      } finally {
        restore();
      }
    });
  });

  /**
   * The bootstrap import endpoint replaces every row in the database, which is
   * why the only tests here are of the gate that stops it.
   *
   * The happy path is covered in `packages/db/src/repository/import.test.ts`
   * against purpose-built temporary databases. It must never be exercised
   * through the route: this suite runs against the developer's real database,
   * and a successful import would delete their pipeline.
   */
  describe('POST /api/auth/import', () => {
    const upload = (contents: string, filename = 'db.db') => {
      const form = new FormData();
      form.append('database', new File([contents], filename));
      return app.fetch(new Request('http://localhost/api/auth/import', { method: 'POST', body: form }));
    };

    it('is closed once the instance has any account', async () => {
      // This suite always has accounts, which is exactly the condition.
      const account = await createTestAccount('importgate');
      accounts.push(account);

      const res = await upload('SQLite format 3\0');

      expect(res.status).toBe(409);
      expect((await res.json()).message).toContain('already has an account');
    });

    it('refuses a request with no file attached', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/auth/import', { method: 'POST', body: new FormData() })
      );

      // The account gate is checked first and is what answers here; either way
      // the request must not be treated as an import.
      expect([400, 409]).toContain(res.status);
    });
  });

  it('returns unauthenticated on GET /api/auth/me without token', async () => {
    const res = await app.fetch(new Request('http://localhost/api/auth/me'));
    expect(res.status).toBe(200);

    const data: any = await res.json();
    expect(data.authenticated).toBe(false);
  });

  it('blocks unauthenticated access to /api/apartments with 401', async () => {
    const res = await app.fetch(new Request('http://localhost/api/apartments'));
    expect(res.status).toBe(401);

    const data: any = await res.json();
    expect(data.statusCode).toBe(401);
    expect(data.message).toContain('Authentication required');
  });

  it('creates an account and its household on POST /api/auth/signup', async () => {
    const account = await createTestAccount('signup');
    accounts.push(account);

    expect(account.householdId).toBeTruthy();
    // A new household must arrive with a shareable code already issued.
    expect(account.joinCode).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  });

  it('rejects a duplicate username with 409', async () => {
    const account = await createTestAccount('dupe');
    accounts.push(account);

    const res = await app.fetch(
      new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'create',
          username: account.username,
          password: TEST_PASSWORD,
          householdName: 'Second attempt',
        }),
      })
    );
    expect(res.status).toBe(409);
  });

  it('rejects a password shorter than the minimum with 400', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'create',
          username: `t_short_${crypto.randomUUID().slice(0, 8)}`,
          password: 'short',
        }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('never returns the password hash to the client', async () => {
    const account = await createTestAccount('nohash');
    accounts.push(account);

    const res = await app.fetch(
      new Request('http://localhost/api/auth/me', {
        headers: { Authorization: `Bearer ${account.token}` },
      })
    );
    const body = await res.text();
    expect(body).not.toContain('passwordHash');
    expect(body).not.toContain('password_hash');
  });

  it('fails login with the wrong password', async () => {
    const account = await createTestAccount('wrongpass');
    accounts.push(account);

    const res = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: account.username, password: 'definitely-not-it' }),
      })
    );
    expect(res.status).toBe(401);
  });

  it('logs in with the right password and returns token + cookie', async () => {
    const account = await createTestAccount('login');
    accounts.push(account);

    const res = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: account.username, password: account.password }),
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toContain('leaseops_session=');

    const data: any = await res.json();
    expect(data.success).toBe(true);
    expect(data.user.username).toBe(account.username);
    expect(typeof data.token).toBe('string');
  });

  it('keeps earlier sessions alive when the same account logs in again', async () => {
    const account = await createTestAccount('multidevice');
    accounts.push(account);

    // Signing in on a second device must not evict the first — the phone and the
    // laptop each hold their own session row.
    const second = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: account.username, password: account.password }),
      })
    );
    const secondData: any = await second.json();

    for (const token of [account.token, secondData.token]) {
      const res = await app.fetch(
        new Request('http://localhost/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      );
      const data: any = await res.json();
      expect(data.authenticated).toBe(true);
    }
  });

  it('allows access to protected /api/apartments with a valid token', async () => {
    const account = await createTestAccount('protected');
    accounts.push(account);

    const res = await app.fetch(
      new Request('http://localhost/api/apartments', {
        headers: { Authorization: `Bearer ${account.token}` },
      })
    );
    expect(res.status).toBe(200);
  });

  it('logs out and revokes only that session', async () => {
    const account = await createTestAccount('logout');
    accounts.push(account);

    const res = await app.fetch(
      new Request('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${account.token}` },
      })
    );
    expect(res.status).toBe(200);

    const checkRes = await app.fetch(
      new Request('http://localhost/api/auth/me', {
        headers: { Authorization: `Bearer ${account.token}` },
      })
    );
    const data: any = await checkRes.json();
    expect(data.authenticated).toBe(false);
  });
});
