import { describe, it, expect, afterAll } from 'bun:test';
import app from '../index';
import { createTestAccount, authHeaders, type TestAccount } from '../test-support';

const accounts: TestAccount[] = [];
afterAll(async () => {
  for (const a of accounts) await a.cleanup();
});

/**
 * A rejected payload has to say what was wrong with it.
 *
 * Hono's default rejection is the raw ZodError, which has no `message` field —
 * the web client reads `message` then `error` and rendered "[object Object]".
 * The work screen refused to save a 685-character answer against a 300-character
 * cap and gave no way to find that out.
 */
describe('Validation failures are readable', () => {
  it('names the field and the rule instead of returning a raw ZodError', async () => {
    const account = await createTestAccount('val');
    accounts.push(account);

    const res = await app.fetch(
      new Request('http://localhost/api/households/me/work', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(account) },
        body: JSON.stringify({ employmentStatus: 'employed', occupation: 'x'.repeat(5000) }),
      })
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { message?: string; statusCode?: number };
    expect(typeof body.message).toBe('string');
    expect(body.message).toContain('occupation');
    expect(body.statusCode).toBe(400);
    // What the client would have shown before: the object had no `message` at all.
    expect(String(body.message)).not.toBe('[object Object]');
  });

  it('accepts the long prose answers these boxes actually get', async () => {
    const account = await createTestAccount('val');
    accounts.push(account);

    const res = await app.fetch(
      new Request('http://localhost/api/households/me/work', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(account) },
        body: JSON.stringify({
          employmentStatus: 'employed',
          // The real stored value that could no longer be saved back, plus a note.
          occupation: 'x'.repeat(685) + " [[good position, worth leading with]]",
          contractDetails: 'y'.repeat(402),
        }),
      })
    );

    expect(res.status).toBe(200);
  });
});
