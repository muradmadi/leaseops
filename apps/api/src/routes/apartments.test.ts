import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import app from '../index';
import { createTestAccount, authHeaders, type TestAccount } from '../test-support';

describe('Apartments Route', () => {
  let createdId: string;
  let authToken: string;
  const testUrl = `https://example-real-estate.com/listing-${Date.now()}`;

  // Its own household, so listings created here are invisible to — and cleaned up
  // independently of — whatever the real user has in the pipeline.
  let account: TestAccount;

  beforeAll(async () => {
    account = await createTestAccount('apartments');
    authToken = account.token;
  });

  afterAll(async () => {
    await account.cleanup();
  });

  it('returns 400 Bad Request when the required details are missing', async () => {
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

  it('ingests entered details with 202 Accepted and initializes record as UNPROCESSED', async () => {
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

  it('activates a listing that fell short without moving it out of its bucket', async () => {
    // The archive-digging case: too little is qualifying, so you chase a flat that
    // did not make the cut. Choosing to pursue it must not rewrite the measurement.
    const createRes = await app.fetch(
      new Request('http://localhost/api/apartments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          url: `https://example-real-estate.com/activate-${Date.now()}`,
          title: 'Over Budget But Interesting',
          price: 9000,
        }),
      })
    );
    const created: any = await createRes.json();

    const before = await app.fetch(
      new Request(`http://localhost/api/apartments/${created.id}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
    );
    const beforeData: any = await before.json();
    expect(beforeData.status).toBe('DISQUALIFIED');
    expect(beforeData.isActive).toBe(false);

    const res = await app.fetch(
      new Request(`http://localhost/api/apartments/${created.id}/active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ isActive: true }),
      })
    );
    expect(res.status).toBe(200);
    const updated: any = await res.json();
    expect(updated.isActive).toBe(true);
    // Still disqualified: activation is a decision, not a re-score.
    expect(updated.status).toBe('DISQUALIFIED');

    // And it can be turned back off.
    const off = await app.fetch(
      new Request(`http://localhost/api/apartments/${created.id}/active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ isActive: false }),
      })
    );
    expect(((await off.json()) as any).isActive).toBe(false);

    await app.fetch(
      new Request(`http://localhost/api/apartments/${created.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      })
    );
  });

  it('does not leak activation across households', async () => {
    const stranger = await createTestAccount('activate-stranger');
    try {
      const res = await app.fetch(
        new Request(`http://localhost/api/apartments/${createdId}/active`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stranger.token}` },
          body: JSON.stringify({ isActive: true }),
        })
      );
      expect(res.status).toBe(404);
    } finally {
      await stranger.cleanup();
    }
  });

  it('returns null from GET /:id/ai-review rather than fabricating one', async () => {
    // A listing with no review must report that honestly. Uses a fresh record
    // because the shared one is qualified, and qualifying now auto-generates a review.
    const createRes = await app.fetch(
      new Request('http://localhost/api/apartments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          url: `https://example-real-estate.com/no-review-${Date.now()}`,
          title: 'Listing With No Review',
          // Over the default 1500 ceiling, so it is disqualified and never gets
          // the review that qualifying would generate automatically.
          price: 9000,
        }),
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
    // The analysis holds only what was read from the listing. Verdict, strengths
    // and concerns are derived from the score and live on featureScores.highlights.
    expect(Array.isArray(generated.flags)).toBe(true);
    expect(generated.unknowns).toBeUndefined();
    expect(typeof generated.analysed).toBe('boolean');

    // The generated review must be persisted, not recomputed per request.
    const getRes = await app.fetch(
      new Request(`http://localhost/api/apartments/${createdId}/ai-review`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
    );
    expect(getRes.status).toBe(200);
    const fetched: any = await getRes.json();
    expect(fetched.flags).toEqual(generated.flags);
  });

  it('archives rather than destroys on DELETE, and can restore', async () => {
    expect(createdId).toBeDefined();
    const auth = { Authorization: `Bearer ${authToken}` };

    const res = await app.fetch(
      new Request(`http://localhost/api/apartments/${createdId}`, { method: 'DELETE', headers: auth })
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).archived).toBe(true);

    // Off the dashboard...
    const listRes = await app.fetch(new Request('http://localhost/api/apartments', { headers: auth }));
    const list: any[] = await listRes.json();
    expect(list.find((a) => a.id === createdId)).toBeUndefined();

    // ...but in the archive, with its score intact rather than destroyed.
    const archRes = await app.fetch(
      new Request('http://localhost/api/apartments/archived', { headers: auth })
    );
    const archived: any[] = await archRes.json();
    const found = archived.find((a) => a.id === createdId);
    expect(found).toBeDefined();
    expect(found.archivedAt).toBeTruthy();
    expect(found.status).toBe('QUALIFIED');

    const restoreRes = await app.fetch(
      new Request(`http://localhost/api/apartments/${createdId}/restore`, { method: 'POST', headers: auth })
    );
    expect(restoreRes.status).toBe(200);
    expect(((await restoreRes.json()) as any).archivedAt).toBeNull();

    const backRes = await app.fetch(new Request('http://localhost/api/apartments', { headers: auth }));
    expect(((await backRes.json()) as any[]).find((a) => a.id === createdId)).toBeDefined();
  });

  it('permanently deletes only from the explicit permanent route', async () => {
    const auth = { Authorization: `Bearer ${authToken}` };
    const createRes = await app.fetch(
      new Request('http://localhost/api/apartments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          url: `https://example-real-estate.com/purge-${Date.now()}`,
          title: 'To Be Purged',
          price: 1200,
        }),
      })
    );
    const created: any = await createRes.json();

    const res = await app.fetch(
      new Request(`http://localhost/api/apartments/${created.id}/permanent`, {
        method: 'DELETE',
        headers: auth,
      })
    );
    expect(res.status).toBe(200);

    const getRes = await app.fetch(
      new Request(`http://localhost/api/apartments/${created.id}`, { headers: auth })
    );
    expect(getRes.status).toBe(404);
  });

  it('will not let one household archive another household\'s listing', async () => {
    // This route had no ownership check at all before archiving was added.
    const stranger = await createTestAccount('archive-stranger');
    try {
      const res = await app.fetch(
        new Request(`http://localhost/api/apartments/${createdId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${stranger.token}` },
        })
      );
      expect(res.status).toBe(404);
    } finally {
      await stranger.cleanup();
    }
  });
});


/**
 * The two axes added for the outreach board: the stage you drive by hand, and
 * editing a listing after a viewing has contradicted the advert.
 */
describe('Pipeline stage and full edit', () => {
  it('defaults to NOT_CONTACTED and only moves when asked', async () => {
    const account = await createTestAccount('stage');
    try {
      const created: any = await (
        await app.fetch(
          new Request('http://localhost/api/apartments', {
            method: 'POST',
            headers: authHeaders(account),
            body: JSON.stringify({ title: 'Stage test', price: 900, description: 'A flat.' }),
          })
        )
      ).json();

      expect(created.pipelineStage).toBe('NOT_CONTACTED');

      const moved = await app.fetch(
        new Request(`http://localhost/api/apartments/${created.id}/stage`, {
          method: 'PATCH',
          headers: authHeaders(account),
          body: JSON.stringify({ pipelineStage: 'OUTREACH_SENT' }),
        })
      );
      expect(moved.status).toBe(200);
      expect((await moved.json()).pipelineStage).toBe('OUTREACH_SENT');
    } finally {
      await account.cleanup();
    }
  });

  it('rejects a stage outside the enum', async () => {
    const account = await createTestAccount('stage_bad');
    try {
      const created: any = await (
        await app.fetch(
          new Request('http://localhost/api/apartments', {
            method: 'POST',
            headers: authHeaders(account),
            body: JSON.stringify({ title: 'Stage enum', price: 900 }),
          })
        )
      ).json();

      const res = await app.fetch(
        new Request(`http://localhost/api/apartments/${created.id}/stage`, {
          method: 'PATCH',
          headers: authHeaders(account),
          body: JSON.stringify({ pipelineStage: 'SENT' }),
        })
      );
      expect(res.status).toBe(400);
    } finally {
      await account.cleanup();
    }
  });

  it('will not let one household move another household\'s listing', async () => {
    const owner = await createTestAccount('stage_owner');
    const stranger = await createTestAccount('stage_stranger');
    try {
      const created: any = await (
        await app.fetch(
          new Request('http://localhost/api/apartments', {
            method: 'POST',
            headers: authHeaders(owner),
            body: JSON.stringify({ title: 'Not yours', price: 900 }),
          })
        )
      ).json();

      const res = await app.fetch(
        new Request(`http://localhost/api/apartments/${created.id}/stage`, {
          method: 'PATCH',
          headers: authHeaders(stranger),
          body: JSON.stringify({ pipelineStage: 'WON' }),
        })
      );
      expect(res.status).toBe(404);
    } finally {
      await stranger.cleanup();
      await owner.cleanup();
    }
  });

  it('re-scores on edit and keeps the review that was already paid for', async () => {
    const account = await createTestAccount('edit');
    try {
      const created: any = await (
        await app.fetch(
          new Request('http://localhost/api/apartments', {
            method: 'POST',
            headers: authHeaders(account),
            body: JSON.stringify({
              title: 'Before edit',
              price: 900,
              description: 'Original text.',
              floorSizeSqm: 80,
            }),
          })
        )
      ).json();

      const res = await app.fetch(
        new Request(`http://localhost/api/apartments/${created.id}`, {
          method: 'PATCH',
          headers: authHeaders(account),
          body: JSON.stringify({
            title: 'After viewing',
            price: 1050,
            description: 'Corrected text.',
            // The advert overstated the size; this is the case the edit exists for.
            floorSizeSqm: 52,
          }),
        })
      );
      expect(res.status).toBe(200);

      const updated: any = await res.json();
      expect(updated.title).toBe('After viewing');
      expect(updated.price).toBe(1050);
      expect((updated.extractedData as any).unitMetrics.floorSizeSqm).toBe(52);
      // Re-scored, not left on the figure the advert produced.
      expect(updated.mcdaScore).not.toBeNull();
    } finally {
      await account.cleanup();
    }
  });

  it('will not let one household edit another household\'s listing', async () => {
    const owner = await createTestAccount('edit_owner');
    const stranger = await createTestAccount('edit_stranger');
    try {
      const created: any = await (
        await app.fetch(
          new Request('http://localhost/api/apartments', {
            method: 'POST',
            headers: authHeaders(owner),
            body: JSON.stringify({ title: 'Private', price: 900 }),
          })
        )
      ).json();

      const res = await app.fetch(
        new Request(`http://localhost/api/apartments/${created.id}`, {
          method: 'PATCH',
          headers: authHeaders(stranger),
          body: JSON.stringify({ title: 'Hijacked', price: 1 }),
        })
      );
      expect(res.status).toBe(404);
    } finally {
      await stranger.cleanup();
      await owner.cleanup();
    }
  });
});

/**
 * The edit form reads these exact paths out of `extractedData` to prefill itself.
 * Getting them wrong blanked three fields on open and then wrote the blanks back
 * on save — a silent delete disguised as an edit. Pinned here because nothing
 * else connects the stored shape to the form that depends on it.
 */
describe('extractedData shape the edit form prefills from', () => {
  it('keeps floor under unitMetrics and neighbourhood/city under location', async () => {
    const account = await createTestAccount('shape');
    try {
      const created: any = await (
        await app.fetch(
          new Request('http://localhost/api/apartments', {
            method: 'POST',
            headers: authHeaders(account),
            body: JSON.stringify({
              title: 'Shape test',
              price: 1000,
              floorSizeSqm: 61,
              totalRooms: 3,
              bathrooms: 2,
              floorLevel: '4th',
              neighborhood: 'Ruzafa',
              city: 'Valencia',
            }),
          })
        )
      ).json();

      const ext = created.extractedData as any;
      expect(ext.unitMetrics.floorLevel).toBe('4th');
      expect(ext.unitMetrics.floorSizeSqm).toBe(61);
      expect(ext.unitMetrics.totalRooms).toBe(3);
      expect(ext.unitMetrics.bathrooms).toBe(2);
      expect(ext.location.neighborhood).toBe('Ruzafa');
      expect(ext.location.city).toBe('Valencia');
      // The paths the form used to read, which silently yielded undefined.
      expect((ext as any).floorLevel).toBeUndefined();
      expect((ext as any).address).toBeUndefined();
    } finally {
      await account.cleanup();
    }
  });

  it('survives an edit round trip without losing the three fields', async () => {
    const account = await createTestAccount('shape_edit');
    try {
      const created: any = await (
        await app.fetch(
          new Request('http://localhost/api/apartments', {
            method: 'POST',
            headers: authHeaders(account),
            body: JSON.stringify({
              title: 'Round trip',
              price: 1000,
              floorLevel: '2nd',
              neighborhood: 'La Florida',
              city: 'Alicante',
            }),
          })
        )
      ).json();

      // Exactly what the form sends back once correctly prefilled.
      const ext = created.extractedData as any;
      const updated: any = await (
        await app.fetch(
          new Request(`http://localhost/api/apartments/${created.id}`, {
            method: 'PATCH',
            headers: authHeaders(account),
            body: JSON.stringify({
              title: created.title,
              price: 1250,
              floorLevel: ext.unitMetrics.floorLevel,
              neighborhood: ext.location.neighborhood,
              city: ext.location.city,
            }),
          })
        )
      ).json();

      expect(updated.price).toBe(1250);
      expect((updated.extractedData as any).unitMetrics.floorLevel).toBe('2nd');
      expect((updated.extractedData as any).location.neighborhood).toBe('La Florida');
      expect((updated.extractedData as any).location.city).toBe('Alicante');
    } finally {
      await account.cleanup();
    }
  });
});

/**
 * Setting a qualifying listing aside by hand.
 *
 * The whole point is that the measurement survives the judgement: a listing that
 * scored 78% and smelled of damp is both of those things. If the demotion
 * rewrote `status` or `mcdaScore` the two could never be compared again, which
 * is the same reason Activate never promotes a listing to QUALIFIED.
 */
describe('Manual set-aside', () => {
  /**
   * Creates a listing and waits for scoring to land. `POST` returns 202 before
   * the pipeline runs, so reading the creation response gives a null score and
   * any before/after comparison against it is meaningless.
   */
  async function qualifying(account: TestAccount) {
    const created: any = await (
      await app.fetch(
        new Request('http://localhost/api/apartments', {
          method: 'POST',
          headers: authHeaders(account),
          body: JSON.stringify({ title: 'Set aside test', price: 700, description: 'A flat.' }),
        })
      )
    ).json();

    for (let i = 0; i < 40; i++) {
      const current: any = await (
        await app.fetch(
          new Request(`http://localhost/api/apartments/${created.id}`, { headers: authHeaders(account) })
        )
      ).json();
      if (current.mcdaScore !== null && current.status !== 'UNPROCESSED') return current;
      await Bun.sleep(25);
    }
    throw new Error('Listing never finished scoring');
  }

  it('records the reason without touching the score or the status', async () => {
    const account = await createTestAccount('aside');
    try {
      const created: any = await qualifying(account);
      const scoreBefore = created.mcdaScore;
      const statusBefore = created.status;

      const res = await app.fetch(
        new Request(`http://localhost/api/apartments/${created.id}/set-aside`, {
          method: 'PATCH',
          headers: authHeaders(account),
          body: JSON.stringify({ reason: 'Stairwell smelled of damp' }),
        })
      );
      expect(res.status).toBe(200);

      const updated: any = await res.json();
      expect(updated.setAsideReason).toBe('Stairwell smelled of damp');
      expect(updated.mcdaScore).toBe(scoreBefore);
      expect(updated.status).toBe(statusBefore);
    } finally {
      await account.cleanup();
    }
  });

  it('clears the override with null', async () => {
    const account = await createTestAccount('aside_clear');
    try {
      const created: any = await qualifying(account);
      await app.fetch(
        new Request(`http://localhost/api/apartments/${created.id}/set-aside`, {
          method: 'PATCH',
          headers: authHeaders(account),
          body: JSON.stringify({ reason: 'Changed my mind' }),
        })
      );

      const cleared: any = await (
        await app.fetch(
          new Request(`http://localhost/api/apartments/${created.id}/set-aside`, {
            method: 'PATCH',
            headers: authHeaders(account),
            body: JSON.stringify({ reason: null }),
          })
        )
      ).json();
      expect(cleared.setAsideReason).toBeNull();
    } finally {
      await account.cleanup();
    }
  });

  it('refuses an empty reason — a demotion you cannot explain is useless', async () => {
    const account = await createTestAccount('aside_empty');
    try {
      const created: any = await qualifying(account);
      for (const reason of ['', '   ']) {
        const res = await app.fetch(
          new Request(`http://localhost/api/apartments/${created.id}/set-aside`, {
            method: 'PATCH',
            headers: authHeaders(account),
            body: JSON.stringify({ reason }),
          })
        );
        expect(res.status).toBe(400);
      }
    } finally {
      await account.cleanup();
    }
  });

  it('will not let one household set aside another household\'s listing', async () => {
    const owner = await createTestAccount('aside_owner');
    const stranger = await createTestAccount('aside_stranger');
    try {
      const created: any = await qualifying(owner);
      const res = await app.fetch(
        new Request(`http://localhost/api/apartments/${created.id}/set-aside`, {
          method: 'PATCH',
          headers: authHeaders(stranger),
          body: JSON.stringify({ reason: 'not mine' }),
        })
      );
      expect(res.status).toBe(404);
    } finally {
      await stranger.cleanup();
      await owner.cleanup();
    }
  });
});

/**
 * The conversation endpoints. Tests run with no household key, so
 * `resolveLlmConfig` resolves to null and the suggest route takes its offline
 * path — which is exactly the branch worth pinning down.
 */
describe('Conversation', () => {
  let account: TestAccount;
  let apartmentId: string;

  beforeAll(async () => {
    account = await createTestAccount('chat');
    const created: any = await (
      await app.fetch(
        new Request('http://localhost/api/apartments', {
          method: 'POST',
          headers: authHeaders(account),
          body: JSON.stringify({ title: 'Chat test flat', price: 800, description: 'A flat.' }),
        })
      )
    ).json();
    apartmentId = created.id;
  });

  afterAll(async () => {
    await account.cleanup();
  });

  async function log(sender: string, text: string) {
    const res = await app.fetch(
      new Request(`http://localhost/api/apartments/${apartmentId}/messages`, {
        method: 'POST',
        headers: authHeaders(account),
        body: JSON.stringify({ sender, text }),
      })
    );
    expect(res.status).toBe(201);
    return res.json() as Promise<any>;
  }

  it('refuses to suggest a reply before there is anything to reply to', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/apartments/${apartmentId}/messages/suggest`, {
        method: 'POST',
        headers: authHeaders(account),
      })
    );
    expect(res.status).toBe(400);
  });

  it('says it is offline rather than saving invented filler as a suggestion', async () => {
    await log('landlord', '¿Cuanto gana al mes?');

    const res = await app.fetch(
      new Request(`http://localhost/api/apartments/${apartmentId}/messages/suggest`, {
        method: 'POST',
        headers: authHeaders(account),
      })
    );
    expect(res.status).toBe(409);
    expect((await res.json()).message).toContain('Settings');

    // Nothing was written to the thread by the failed attempt.
    const messages: any[] = await (
      await app.fetch(
        new Request(`http://localhost/api/apartments/${apartmentId}/messages`, {
          headers: authHeaders(account),
        })
      )
    ).json();
    expect(messages.filter((m) => m.sender === 'ai_suggestion')).toHaveLength(0);
  });

  it('stores a message you wrote as yours and already sent', async () => {
    const mine = await log('user', 'Le escribo yo mismo.');
    expect(mine.sender).toBe('user');
    expect(mine.status).toBe('sent');
    expect(mine.metadata).toBeNull();
  });

  it('marks a draft as sent without touching its text', async () => {
    const draft = await log('ai_suggestion', 'Draft wording.');
    // An AI proposal is a draft until you say otherwise; a message you typed is not.
    expect(draft.status).toBe('draft');

    const res = await app.fetch(
      new Request(`http://localhost/api/apartments/${apartmentId}/messages/${draft.id}`, {
        method: 'PATCH',
        headers: authHeaders(account),
        body: JSON.stringify({ status: 'sent' }),
      })
    );
    expect(res.status).toBe(200);

    const updated: any = await res.json();
    expect(updated.status).toBe('sent');
    expect(updated.text).toBe('Draft wording.');
  });

  it('rejects a patch that changes nothing', async () => {
    const draft = await log('ai_suggestion', 'Another draft.');
    const res = await app.fetch(
      new Request(`http://localhost/api/apartments/${apartmentId}/messages/${draft.id}`, {
        method: 'PATCH',
        headers: authHeaders(account),
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });
});
