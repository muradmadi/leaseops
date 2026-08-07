import { describe, it, expect } from 'bun:test';
import app from '../index';

describe('Authentication Flow & Route Protection', () => {
  let authToken: string;

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

  it('fails login with invalid credentials on POST /api/auth/login', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrongpassword' }),
      })
    );
    expect(res.status).toBe(401);
  });

  it('logs in successfully with default credentials and returns token + cookie', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'leaseops' }),
      })
    );
    expect(res.status).toBe(200);

    const setCookieHeader = res.headers.get('Set-Cookie');
    expect(setCookieHeader).toContain('leaseops_session=');

    const data: any = await res.json();
    expect(data.success).toBe(true);
    expect(data.user.username).toBe('admin');
    expect(typeof data.token).toBe('string');

    authToken = data.token;
  });

  it('returns authenticated user on GET /api/auth/me with Bearer token', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/auth/me', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
    );
    expect(res.status).toBe(200);

    const data: any = await res.json();
    expect(data.authenticated).toBe(true);
    expect(data.user.username).toBe('admin');
  });

  it('allows access to protected /api/apartments with valid token', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/apartments', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
    );
    expect(res.status).toBe(200);
  });

  it('logs out and revokes session on POST /api/auth/logout', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      })
    );
    expect(res.status).toBe(200);

    const checkRes = await app.fetch(
      new Request('http://localhost/api/auth/me', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
    );
    const data: any = await checkRes.json();
    expect(data.authenticated).toBe(false);
  });
});
