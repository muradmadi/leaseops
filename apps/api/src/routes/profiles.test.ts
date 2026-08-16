import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import app from '../index';
import { createTestAccount, authHeaders, type TestAccount } from '../test-support';

describe('Household Profiles & Onboarding MCDA Weights API Flow', () => {
  let account: TestAccount;

  // This suite used to delete the live `admin` profile in `beforeAll` and leave
  // its fixture behind, destroying the real user's onboarding on every run. It now
  // works inside a throwaway household that it also tears down.
  beforeAll(async () => {
    account = await createTestAccount('profiles');
  });

  afterAll(async () => {
    await account.cleanup();
  });

  it('blocks unauthenticated access to GET /api/profiles/me with 401', async () => {
    const res = await app.fetch(new Request('http://localhost/api/profiles/me'));
    expect(res.status).toBe(401);
  });

  it('retrieves the default uncreated profile structure on GET /api/profiles/me', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/profiles/me', { headers: authHeaders(account) })
    );
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.exists).toBe(false);
    expect(data.idealRent).toBe(1200);
    expect(data.maxRent).toBe(1500);
  });

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

  it('saves the household profile and MCDA feature weights on PUT /api/profiles/me', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/profiles/me', {
        method: 'PUT',
        headers: authHeaders(account),
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
      new Request('http://localhost/api/profiles/me', { headers: authHeaders(account) })
    );
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.exists).toBe(true);
    expect(data.targetLocation).toBe('Berlin, Mitte');
    expect(data.targetLanguage).toBe('German');
    expect(data.featureWeights.bedrooms).toBe(5);
  });

  it('shares one profile between both members of a household', async () => {
    // The second partner joins with the code and must land on the criteria the
    // first partner already saved — not a blank onboarding.
    const partner = await createTestAccount('profiles-partner');
    try {
      const joinRes = await app.fetch(
        new Request('http://localhost/api/households/join', {
          method: 'POST',
          headers: authHeaders(partner),
          body: JSON.stringify({ joinCode: account.joinCode }),
        })
      );
      expect(joinRes.status).toBe(200);

      const res = await app.fetch(
        new Request('http://localhost/api/profiles/me', { headers: authHeaders(partner) })
      );
      const data: any = await res.json();
      expect(data.exists).toBe(true);
      expect(data.targetLocation).toBe('Berlin, Mitte');
      expect(data.maxRent).toBe(1600);
    } finally {
      await partner.cleanup();
    }
  });

  it('signs outreach with both members once a partner joins, in the target language', async () => {
    // The whole point of deriving the sign-off: nobody types "Murad and Paulie"
    // anywhere, it falls out of who is in the household.
    const partner = await createTestAccount('signoff-partner');
    try {
      await app.fetch(
        new Request('http://localhost/api/households/join', {
          method: 'POST',
          headers: authHeaders(partner),
          body: JSON.stringify({ joinCode: account.joinCode }),
        })
      );

      await app.fetch(
        new Request('http://localhost/api/households/me/member', {
          method: 'PATCH',
          headers: authHeaders(account),
          body: JSON.stringify({ displayName: 'Murad' }),
        })
      );
      await app.fetch(
        new Request('http://localhost/api/households/me/member', {
          method: 'PATCH',
          headers: authHeaders(partner),
          body: JSON.stringify({ displayName: 'Paulie' }),
        })
      );

      // The saved profile targets German, so the conjunction must follow it.
      const res = await app.fetch(
        new Request('http://localhost/api/households/me', { headers: authHeaders(account) })
      );
      const data: any = await res.json();
      expect(data.members).toHaveLength(2);
      expect(data.signOff).toBe('Murad und Paulie');

      // And an explicit language preview overrides the saved one.
      const preview = await app.fetch(
        new Request('http://localhost/api/households/me?language=Spanish', {
          headers: authHeaders(account),
        })
      );
      expect((await preview.json() as any).signOff).toBe('Murad y Paulie');
    } finally {
      await partner.cleanup();
    }
  });

  it('never exposes one household profile to another', async () => {
    const stranger = await createTestAccount('profiles-stranger');
    try {
      const res = await app.fetch(
        new Request('http://localhost/api/profiles/me', { headers: authHeaders(stranger) })
      );
      const data: any = await res.json();
      // A different household starts empty regardless of what anyone else saved.
      expect(data.exists).toBe(false);
      expect(data.targetLocation).toBe('');
    } finally {
      await stranger.cleanup();
    }
  });
});
