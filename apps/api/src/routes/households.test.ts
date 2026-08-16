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
import { findHouseholdMembers, findUserById } from '@leaseops/db';
import app from '../index';
import { createTestAccount, authHeaders, TEST_PASSWORD, type TestAccount } from '../test-support';
import { resolveHouseholdPersona } from '../services/qualification';

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
