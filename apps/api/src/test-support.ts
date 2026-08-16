/**
 * Test fixtures for suites that need an authenticated caller.
 *
 * Tests share the development database (see `CLAUDE.md`), so every suite
 * provisions its **own** household rather than reusing a real account. Nothing a
 * test does can then reach the data belonging to whoever is actually using the
 * app — which is exactly what went wrong before households existed, when
 * `profiles.test.ts` deleted the live `admin` profile on every run.
 *
 * `cleanup()` deletes the household, and the foreign keys cascade from there:
 * users → sessions, and apartments → messages. One delete, nothing stranded.
 */
import { removeHousehold, removeUser } from '@leaseops/db';
import app from './index';

export interface TestAccount {
  token: string;
  userId: string;
  username: string;
  password: string;
  householdId: string;
  joinCode: string;
  cleanup: () => Promise<void>;
}

export const TEST_PASSWORD = 'correct-horse-battery';

/**
 * Signs up a throwaway user owning a fresh household, and returns a bearer token
 * for it. `label` only makes failures easier to read.
 */
export async function createTestAccount(label: string): Promise<TestAccount> {
  const username = `t_${label}_${crypto.randomUUID().slice(0, 8)}`.toLowerCase();

  const res = await app.fetch(
    new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'create',
        username,
        password: TEST_PASSWORD,
        displayName: label,
        householdName: `Test household ${label}`,
      }),
    })
  );

  if (res.status !== 201) {
    throw new Error(`Test signup failed (${res.status}): ${await res.text()}`);
  }

  const data: any = await res.json();
  const householdId: string = data.household.id;
  const userId: string = data.user.id;

  return {
    token: data.token,
    userId,
    username,
    password: TEST_PASSWORD,
    householdId,
    joinCode: data.household.joinCode,
    cleanup: async () => {
      // The user is deleted explicitly, not just via the household cascade: a test
      // that redeems a join code moves this user into someone else's household, so
      // deleting only the household they started in would strand them there and
      // silently add a member to an unrelated test's household.
      await removeUser(userId);
      // Deliberately unguarded. This swallowed a foreign-key error for a while and
      // the suite quietly accumulated hundreds of orphaned rows in the dev
      // database. A cleanup that cannot clean up must fail loudly.
      await removeHousehold(householdId);
    },
  };
}

/** Authorization header for a test account. */
export function authHeaders(account: TestAccount): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${account.token}`,
  };
}
