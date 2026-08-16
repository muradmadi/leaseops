/**
 * The grammatical-form question, end to end: signup → storage → the line the
 * outreach prompt actually receives.
 *
 * The unit tests in `signoff.test.ts` cover the resolution rules. This suite
 * covers the wiring between them, which is where this feature can silently
 * break — `findHouseholdMembers` not selecting the new columns would leave
 * every draft ungendered while every unit test still passed.
 */
import { describe, it, expect, afterAll } from 'bun:test';
import {
  findHouseholdMembers,
  findUserById,
  findHouseholdById,
  setHouseholdAnthropicKey,
  toPublicHousehold,
  anthropicApiKeySchema,
} from '@leaseops/db';
import app from '../index';
import { createTestAccount, authHeaders, TEST_PASSWORD, type TestAccount } from '../test-support';
import { resolveHouseholdPersona } from '../services/qualification';
import { resolveLlmConfig } from '../services/anthropic';

const accounts: TestAccount[] = [];
afterAll(async () => {
  for (const a of accounts) await a.cleanup();
});

async function signupInto(joinCode: string, body: Record<string, unknown>) {
  const res = await app.fetch(
    new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'join',
        username: `t_g_${crypto.randomUUID().slice(0, 8)}`.toLowerCase(),
        password: TEST_PASSWORD,
        joinCode,
        ...body,
      }),
    })
  );
  expect(res.status).toBe(201);
  return res.json();
}

describe('Member grammatical form', () => {
  it('stores the answer given at signup', async () => {
    const account = await createTestAccount('gender_signup');
    accounts.push(account);

    const joined: any = await signupInto(account.joinCode, {
      displayName: 'Paulie',
      gender: 'female',
    });

    const user = await findUserById(joined.user.id);
    expect(user?.gender).toBe('female');
  });

  it('keeps grammaticalForm only when gender is "other"', async () => {
    const account = await createTestAccount('gender_other');
    accounts.push(account);

    const neutral: any = await signupInto(account.joinCode, {
      displayName: 'Sam',
      gender: 'other',
      grammaticalForm: 'neutral',
    });
    expect((await findUserById(neutral.user.id))?.grammaticalForm).toBe('neutral');

    // A form sent alongside male/female is discarded rather than stored, so the
    // two columns can never contradict each other.
    const male: any = await signupInto(account.joinCode, {
      displayName: 'Tomas',
      gender: 'male',
      grammaticalForm: 'feminine',
    });
    const stored = await findUserById(male.user.id);
    expect(stored?.gender).toBe('male');
    expect(stored?.grammaticalForm).toBeNull();
  });

  it('rejects a value outside the enum', async () => {
    const account = await createTestAccount('gender_invalid');
    accounts.push(account);

    const res = await app.fetch(
      new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'join',
          username: `t_g_${crypto.randomUUID().slice(0, 8)}`.toLowerCase(),
          password: TEST_PASSWORD,
          joinCode: account.joinCode,
          gender: 'Male',
        }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('updates the answer from Settings', async () => {
    const account = await createTestAccount('gender_settings');
    accounts.push(account);

    const res = await app.fetch(
      new Request('http://localhost/api/households/me/member', {
        method: 'PATCH',
        headers: authHeaders(account),
        body: JSON.stringify({ displayName: 'Murad', gender: 'male' }),
      })
    );
    expect(res.status).toBe(200);
    expect((await findUserById(account.userId))?.gender).toBe('male');
  });

  it('carries both members through to the persona the prompt receives', async () => {
    const account = await createTestAccount('gender_persona');
    accounts.push(account);

    await app.fetch(
      new Request('http://localhost/api/households/me/member', {
        method: 'PATCH',
        headers: authHeaders(account),
        body: JSON.stringify({ displayName: 'Murad', gender: 'male' }),
      })
    );
    await signupInto(account.joinCode, { displayName: 'Paulie', gender: 'female' });

    // The query must select the new columns, or the persona silently loses them.
    const members = await findHouseholdMembers(account.householdId);
    expect(members.map((m) => m.gender).sort()).toEqual(['female', 'male']);

    const persona = await resolveHouseholdPersona(account.householdId, {
      targetLanguage: 'Spanish',
    } as any);

    expect(persona.signOffName).toBe('Murad y Paulie');
    expect(persona.writingForms).toBe('- Murad: masculine forms\n- Paulie: feminine forms');
  });

  it('leaves writingForms blank when nobody has answered', async () => {
    const account = await createTestAccount('gender_unset');
    accounts.push(account);

    const persona = await resolveHouseholdPersona(account.householdId, {
      targetLanguage: 'Spanish',
    } as any);

    // Blank is the correct state — the prompt turns it into "avoid gendered
    // wording" rather than picking a form from the name.
    expect(persona.writingForms).toBe('');
  });
});

/**
 * The Anthropic key is the one secret on the `households` row, and it is the one
 * a route can leak by returning the row it already has in hand. These cover the
 * two ways that goes wrong: serialising the key, and billing it to the wrong
 * household.
 *
 * `PUT /llm-key` is deliberately not exercised end to end — it calls Anthropic to
 * verify the key before saving, and the suite must not need the network.
 */
const FAKE_KEY = 'sk-ant-api03-test-key-not-real-0000abcd';

describe('Household API key', () => {
  it('never puts the key on the wire', async () => {
    const account = await createTestAccount('llm_leak');
    accounts.push(account);
    await setHouseholdAnthropicKey(account.householdId, FAKE_KEY, account.userId);

    // Every route that hands back a household, checked as raw text: a nested
    // object or a field added later would still be caught.
    const responses = await Promise.all([
      app.fetch(new Request('http://localhost/api/households/me', { headers: authHeaders(account) })),
      app.fetch(new Request('http://localhost/api/auth/me', { headers: authHeaders(account) })),
      app.fetch(
        new Request('http://localhost/api/households/me', {
          method: 'PATCH',
          headers: authHeaders(account),
          body: JSON.stringify({ name: 'Renamed' }),
        })
      ),
      app.fetch(
        new Request('http://localhost/api/households/me/rotate-code', {
          method: 'POST',
          headers: authHeaders(account),
        })
      ),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(await res.text()).not.toContain(FAKE_KEY);
    }
  });

  it('reports who is paying, and only the last four characters', async () => {
    const account = await createTestAccount('llm_hint');
    accounts.push(account);
    await setHouseholdAnthropicKey(account.householdId, FAKE_KEY, account.userId);

    const household = await findHouseholdById(account.householdId);
    const publicRow = toPublicHousehold(household!);

    expect(publicRow).not.toHaveProperty('anthropicApiKey');
    expect(publicRow.llm.keySet).toBe(true);
    expect(publicRow.llm.keyHint).toBe('abcd');
    expect(publicRow.llm.setBy).toBe(account.userId);
    // Resolved server-side so the client never has to know the default.
    expect(publicRow.llm.model).toBe('claude-opus-5');
  });

  it('rejects a key that is not an Anthropic one', () => {
    expect(anthropicApiKeySchema.safeParse('sk-proj-something-else').success).toBe(false);
    expect(anthropicApiKeySchema.safeParse('sk-ant-api03-with a space').success).toBe(false);
    expect(anthropicApiKeySchema.safeParse('').success).toBe(false);
    expect(anthropicApiKeySchema.safeParse(FAKE_KEY).success).toBe(true);
  });

  it('stays offline in tests even when the household has a key', async () => {
    const account = await createTestAccount('llm_test_offline');
    accounts.push(account);
    await setHouseholdAnthropicKey(account.householdId, FAKE_KEY, account.userId);

    // The whole suite depends on this: a stored key must not make the test run
    // reach the network or spend a real household's credits.
    expect(await resolveLlmConfig(account.householdId)).toBeNull();
  });

  it('offers a model catalogue and refuses an id that is not in it', async () => {
    const account = await createTestAccount('llm_models');
    accounts.push(account);

    const listRes = await app.fetch(
      new Request('http://localhost/api/households/me/llm-models', {
        headers: authHeaders(account),
      })
    );
    expect(listRes.status).toBe(200);
    const catalogue: any = await listRes.json();

    // Offline in tests, so this is the built-in list rather than a live fetch —
    // the point is that the picker is never served an empty catalogue.
    expect(catalogue.source).toBe('fallback');
    expect(catalogue.models.length).toBeGreaterThan(0);
    expect(catalogue.models.map((m: any) => m.id)).toContain('claude-opus-5');

    const patch = (model: string) =>
      app.fetch(
        new Request('http://localhost/api/households/me/llm-model', {
          method: 'PATCH',
          headers: authHeaders(account),
          body: JSON.stringify({ model }),
        })
      );

    const accepted = await patch(catalogue.models[0].id);
    expect(accepted.status).toBe(200);
    expect(((await accepted.json()) as any).llm.model).toBe(catalogue.models[0].id);

    // A model Anthropic does not list would 404 on every later call and present
    // exactly like a broken key, so it is rejected at the point of setting it.
    expect((await patch('claude-does-not-exist-9')).status).toBe(400);
    expect((await patch('gpt-4')).status).toBe(400);
  });

  it('clears the key when the member paying for it leaves', async () => {
    const origin = await createTestAccount('llm_leaver');
    const destination = await createTestAccount('llm_dest');
    accounts.push(origin, destination);

    // A second member so the household survives the owner's departure and can be
    // inspected afterwards.
    await signupInto(origin.joinCode, { displayName: 'Stayer' });
    await setHouseholdAnthropicKey(origin.householdId, FAKE_KEY, origin.userId);

    const res = await app.fetch(
      new Request('http://localhost/api/households/join', {
        method: 'POST',
        headers: authHeaders(origin),
        body: JSON.stringify({ joinCode: destination.joinCode }),
      })
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).llmKeyCleared).toBe(true);

    const left = await findHouseholdById(origin.householdId);
    expect(left?.anthropicApiKey).toBeNull();
    expect(left?.anthropicApiKeySetBy).toBeNull();
  });

  it('keeps the key when someone other than the payer leaves', async () => {
    const origin = await createTestAccount('llm_stayer');
    const destination = await createTestAccount('llm_stayer_dest');
    accounts.push(origin, destination);

    const other: any = await signupInto(origin.joinCode, { displayName: 'Mover' });
    await setHouseholdAnthropicKey(origin.householdId, FAKE_KEY, origin.userId);

    const res = await app.fetch(
      new Request('http://localhost/api/households/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${other.token}` },
        body: JSON.stringify({ joinCode: destination.joinCode }),
      })
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).llmKeyCleared).toBe(false);

    // Whose card is charged has nothing to do with who else comes and goes.
    const left = await findHouseholdById(origin.householdId);
    expect(left?.anthropicApiKey).toBe(FAKE_KEY);
  });
});
