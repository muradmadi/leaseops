import { describe, it, expect, beforeAll } from 'bun:test';
import app from '../index';

describe('Apartments Route', () => {
  let createdId: string;
  let authToken: string;
  const testUrl = `https://example-real-estate.com/listing-${Date.now()}`;

  beforeAll(async () => {
    const loginRes = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'leaseops' }),
      })
    );
    const authData: any = await loginRes.json();
    authToken = authData.token;
  });

  it('returns 400 Bad Request when POSTing invalid URL payload', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/apartments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ url: 'not-a-valid-url' }),
      })
    );

    expect(res.status).toBe(400);
  });

  it('ingests valid listing URL with 202 Accepted and initializes record as UNPROCESSED', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/apartments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          url: testUrl,
          title: 'Test Sunny Balcony Apartment',
          price: 1300,
        }),
      })
    );

    expect(res.status).toBe(202);
    const data: any = await res.json();
    expect(data.url).toBe(testUrl);
    expect(data.status).toBe('UNPROCESSED');
    expect(typeof data.id).toBe('string');
    createdId = data.id;
  });

  it('retrieves listing by id on GET /api/apartments/:id', async () => {
    expect(createdId).toBeDefined();
    const res = await app.fetch(
      new Request(`http://localhost/api/apartments/${createdId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
    );
    expect(res.status).toBe(200);

    const data: any = await res.json();
    expect(data.id).toBe(createdId);
    expect(data.url).toBe(testUrl);
  });

  it('updates pipeline status via PATCH /api/apartments/:id/status', async () => {
    expect(createdId).toBeDefined();
    const res = await app.fetch(
      new Request(`http://localhost/api/apartments/${createdId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ status: 'QUALIFIED' }),
      })
    );

    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.status).toBe('QUALIFIED');
  });

  it('updates feature ratings and room scores via PATCH /api/apartments/:id/ratings', async () => {
    expect(createdId).toBeDefined();
    const res = await app.fetch(
      new Request(`http://localhost/api/apartments/${createdId}/ratings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          featureRatings: { balcony: 5, elevator: 5 },
          roomScores: { livingRoom: 5, bedroom: 4, kitchen: 3, bathroom: 5, entryway: 4 },
        }),
      })
    );

    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.roomScores).toBeDefined();
    expect(data.roomScores.livingRoom).toBe(5);
  });

  it('retrieves listings filtered by status', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/apartments?status=QUALIFIED', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
    );
    expect(res.status).toBe(200);

    const list: any = await res.json();
    expect(Array.isArray(list)).toBe(true);
    const found = list.find((item: { id: string }) => item.id === createdId);
    expect(found).toBeDefined();
    expect(found.status).toBe('QUALIFIED');
  });

  it('returns null from GET /:id/ai-review rather than fabricating one', async () => {
    // A listing with no review must report that honestly. Uses a fresh record
    // because the shared one is qualified, and qualifying now auto-generates a review.
    const createRes = await app.fetch(
      new Request('http://localhost/api/apartments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ url: `https://example-real-estate.com/no-review-${Date.now()}` }),
      })
    );
    const created: any = await createRes.json();

    const res = await app.fetch(
      new Request(`http://localhost/api/apartments/${created.id}/ai-review`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();

    await app.fetch(
      new Request(`http://localhost/api/apartments/${created.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      })
    );
  });

  it('generates an AI review via POST and then serves it from GET', async () => {
    expect(createdId).toBeDefined();
    const postRes = await app.fetch(
      new Request(`http://localhost/api/apartments/${createdId}/ai-review`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      })
    );
    expect(postRes.status).toBe(200);
    const generated: any = await postRes.json();
    expect(Array.isArray(generated.pros)).toBe(true);
    expect(Array.isArray(generated.cons)).toBe(true);
    expect(typeof generated.recommendation).toBe('string');

    // The generated review must be persisted, not recomputed per request.
    const getRes = await app.fetch(
      new Request(`http://localhost/api/apartments/${createdId}/ai-review`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
    );
    expect(getRes.status).toBe(200);
    const fetched: any = await getRes.json();
    expect(fetched.pros).toEqual(generated.pros);
    expect(fetched.recommendation).toBe(generated.recommendation);
  });

  it('deletes listing cleanly via DELETE /api/apartments/:id', async () => {
    expect(createdId).toBeDefined();
    const res = await app.fetch(
      new Request(`http://localhost/api/apartments/${createdId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      })
    );

    expect(res.status).toBe(200);

    // Verify it is gone
    const getRes = await app.fetch(
      new Request(`http://localhost/api/apartments/${createdId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
    );
    expect(getRes.status).toBe(404);
  });
});

