import { describe, it, expect, beforeAll } from 'bun:test';
import { removeProfileByUsername } from '@leaseops/db';
import app from '../index';

describe('User Profiles & Onboarding MCDA Weights API Flow', () => {
  let authToken: string;

  beforeAll(async () => {
    await removeProfileByUsername('admin');
  });

  it('blocks unauthenticated access to GET /api/profiles/me with 401', async () => {
    const res = await app.fetch(new Request('http://localhost/api/profiles/me'));
    expect(res.status).toBe(401);
  });

  it('logs in to obtain an auth token for profile testing', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'leaseops' }),
      })
    );
    expect(res.status).toBe(200);
    const data: any = await res.json();
    authToken = data.token;
    expect(typeof authToken).toBe('string');
  });

  it('retrieves default uncreated profile structure on GET /api/profiles/me', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/profiles/me', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
    );
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.exists).toBe(false);
    expect(data.username).toBe('admin');
    expect(data.idealRent).toBe(1200);
    expect(data.maxRent).toBe(1500);
  });

  it('saves onboarding profile and 32 MCDA feature weights on PUT /api/profiles/me', async () => {
    const payload = {
      targetLocation: 'Berlin, Mitte',
      targetLanguage: 'German',
      autoTranslateListings: true,
      autoDraftMessages: true,
      currency: 'EUR',
      idealRent: 1350,
      maxRent: 1600,
      featureWeights: {
        totalSqFt: 4,
        bedrooms: 5,
        bathrooms: 3,
        naturalLight: 5,
        balcony: 2,
        refrigerator: 3,
        dishwasher: 4,
        airConditioning: 3,
        elevator: 5,
        soundproofing: 4,
      },
      tenantPersona: 'Senior Software Engineer moving to Berlin. Stable income, non-smoker.',
    };

    const res = await app.fetch(
      new Request('http://localhost/api/profiles/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      })
    );
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.success).toBe(true);
    expect(data.exists).toBe(true);
    expect(data.targetLocation).toBe('Berlin, Mitte');
    expect(data.maxRent).toBe(1600);
    expect(data.featureWeights.elevator).toBe(5);
  });

  it('verifies profile persistence on subsequent GET /api/profiles/me', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/profiles/me', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
    );
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.exists).toBe(true);
    expect(data.targetLocation).toBe('Berlin, Mitte');
    expect(data.targetLanguage).toBe('German');
    expect(data.featureWeights.bedrooms).toBe(5);
  });
});
