import { describe, it, expect } from 'bun:test';
import app from '../index';

describe('Health Route', () => {
  it('returns status 200 and ok health status on GET /api/health', async () => {
    const res = await app.fetch(new Request('http://localhost/api/health'));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.service).toBe('@leaseops/api');
    expect(typeof data.timestamp).toBe('string');
  });

  it('returns 404 on unknown endpoint', async () => {
    const res = await app.fetch(new Request('http://localhost/api/unknown-route'));
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.statusCode).toBe(404);
  });
});
