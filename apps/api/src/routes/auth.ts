import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { setCookie, deleteCookie } from 'hono/cookie';
import { unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  loginApiSchema,
  signupApiSchema,
  createSession,
  removeSessionByToken,
  createUser,
  countUsers,
  findUserByUsername,
  toPublicUser,
  toPublicHousehold,
  createHousehold,
  findHouseholdById,
  findHouseholdByJoinCode,
  generateJoinCode,
  looksLikeSqlite,
  validateImportCandidate,
  importDatabaseFile,
  foldWalIntoDatabase,
  type Household,
  type User,
} from '@leaseops/db';
import {
  hashPassword,
  verifyPassword,
  extractSessionToken,
  resolveRequestUser,
  type AuthEnv,
} from '../services/auth';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Upload ceiling for a database import. Generous next to a real pipeline (a few
 * hundred listings is single-digit MB) and small enough that the whole file can
 * be held in memory and written once without a streaming parser.
 */
const MAX_IMPORT_BYTES = 64 * 1024 * 1024;

/**
 * The directory holding the live database, which is where an upload is staged.
 * Mirrors the resolution in `packages/db/src/client.ts` — including its default,
 * so the two cannot disagree about which file is "the" database.
 */
function dbDirectory(): string {
  const configured = Bun.env.DATABASE_URL;
  if (configured) return dirname(resolve(configured));
  return resolve(import.meta.dir, '../../../../packages/db');
}

type StagedUpload =
  | { path: string; cleanup: () => Promise<void> }
  | { error: { message: string; statusCode: number }; status: 400 | 409 | 413 };

/**
 * Shared front half of both import endpoints: enforce the bootstrap gate, read
 * the upload, and lay it out on disk as a database SQLite can open.
 *
 * Accepts an optional `wal` file alongside the database. That is not a nicety —
 * a `.db` grabbed while the app is running is missing every write still sitting
 * in its write-ahead log, which is the single most likely way an import silently
 * brings the wrong data across.
 */
async function stageUpload(c: {
  req: { parseBody: () => Promise<Record<string, unknown>> };
}): Promise<StagedUpload> {
  if ((await countUsers()) > 0) {
    return {
      error: {
        message:
          'This instance already has an account, so importing is closed. Restore from a backup on the server instead.',
        statusCode: 409,
      },
      status: 409,
    };
  }

  let body: Record<string, unknown>;
  try {
    body = await c.req.parseBody();
  } catch {
    return { error: { message: 'Could not read the upload.', statusCode: 400 }, status: 400 };
  }

  const file = body.database;
  if (!(file instanceof File)) {
    return { error: { message: 'Attach a .db file in the "database" field.', statusCode: 400 }, status: 400 };
  }
  if (file.size === 0) {
    return { error: { message: 'That file is empty.', statusCode: 400 }, status: 400 };
  }

  const wal = body.wal instanceof File && body.wal.size > 0 ? body.wal : undefined;
  const total = file.size + (wal?.size ?? 0);
  if (total > MAX_IMPORT_BYTES) {
    return {
      error: {
        message: `That is ${Math.round(total / 1024 / 1024)} MB; the limit is ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`,
        statusCode: 413,
      },
      status: 413,
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeSqlite(bytes)) {
    return { error: { message: 'That is not a SQLite database file.', statusCode: 400 }, status: 400 };
  }

  // Staged next to the live database rather than in /tmp: the production
  // container mounts /tmp as a small tmpfs, and ATTACH needs the file reachable
  // by this process anyway.
  const path = `${dbDirectory()}/.import-${crypto.randomUUID()}.db`;
  const cleanup = async () => {
    // The -shm is written by SQLite itself when the log is replayed.
    await Promise.all(
      [path, `${path}-wal`, `${path}-shm`].map((p) => unlink(p).catch(() => {}))
    );
  };

  try {
    await Bun.write(path, bytes);
    if (wal) {
      // SQLite pairs a log with its database purely by filename.
      await Bun.write(`${path}-wal`, new Uint8Array(await wal.arrayBuffer()));
      foldWalIntoDatabase(path);
    }
  } catch {
    await cleanup();
    return { error: { message: 'Could not stage the upload.', statusCode: 400 }, status: 400 };
  }

  return { path, cleanup };
}

/**
 * Decides whether a stranger may start a **new** household on this instance.
 *
 * Joining an existing one is deliberately not gated: it already requires the
 * household's join code, which is the secret this app is built around, and the
 * endpoint is rate limited. Gating it too would mean editing the environment
 * every time a partner sets up their phone.
 *
 * `ALLOW_SIGNUP=true` opens it. Left unset, a production instance allows exactly
 * one creation — the first account on an empty database — and closes itself
 * afterwards, so a fresh deploy is usable without being an open registration
 * form on the public internet.
 */
async function canCreateHousehold(): Promise<boolean> {
  if (Bun.env.ALLOW_SIGNUP === 'true') return true;
  if (Bun.env.ALLOW_SIGNUP === 'false') return false;
  if (Bun.env.NODE_ENV !== 'production') return true;
  return (await countUsers()) === 0;
}

/**
 * Issues a session and sets the cookie. Sessions are rows rather than JWTs, so
 * the same account can be signed in on a phone and a laptop at once — each
 * device holds its own token.
 */
async function startSession(c: any, user: User) {
  const session = await createSession({
    id: crypto.randomUUID(),
    userId: user.id,
    token: crypto.randomUUID(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    createdAt: new Date(),
  });

  setCookie(c, 'leaseops_session', session.token, {
    path: '/',
    httpOnly: true,
    secure: Bun.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: SESSION_TTL_MS / 1000,
  });

  return session;
}

function authPayload(user: User, household: Household, token: string) {
  return {
    success: true,
    user: toPublicUser(user),
    // `toPublicHousehold`, never the raw row — that row holds the household's
    // Anthropic key.
    household: toPublicHousehold(household),
    token,
  };
}

const authRouter = new Hono<AuthEnv>()
  /**
   * POST /api/auth/signup
   * Either starts a new household or joins an existing one with its code. The
   * first account on a fresh install necessarily takes the `create` path.
   */
  .post('/signup', zValidator('json', signupApiSchema), async (c) => {
    const data = c.req.valid('json');

    const existing = await findUserByUsername(data.username);
    if (existing) {
      return c.json({ message: 'That username is already taken', statusCode: 409 }, 409);
    }

    let household: Household | undefined;
    const now = new Date();

    if (data.mode === 'join') {
      household = await findHouseholdByJoinCode(data.joinCode);
      if (!household) {
        // Deliberately vague: this endpoint is unauthenticated, so a precise
        // error would let someone probe for valid household codes.
        return c.json({ message: 'That household code is not valid', statusCode: 404 }, 404);
      }
    } else {
      if (!(await canCreateHousehold())) {
        return c.json(
          {
            message:
              'This instance is not accepting new households. Ask an existing member for the household code and join instead.',
            statusCode: 403,
          },
          403
        );
      }
      household = await createHousehold({
        id: crypto.randomUUID(),
        name: data.householdName,
        joinCode: generateJoinCode(),
        createdAt: now,
        updatedAt: now,
      });
    }

    const user = await createUser({
      id: crypto.randomUUID(),
      username: data.username,
      passwordHash: await hashPassword(data.password),
      displayName: data.displayName,
      gender: data.gender,
      // Only stored for 'other'; derived otherwise, so the two cannot disagree.
      grammaticalForm: data.gender === 'other' ? data.grammaticalForm : null,
      householdId: household.id,
      createdAt: now,
      updatedAt: now,
    });

    const session = await startSession(c, user);
    return c.json(authPayload(user, household, session.token), 201);
  })

  .post('/login', zValidator('json', loginApiSchema), async (c) => {
    const { username, password } = c.req.valid('json');

    const user = await findUserByUsername(username);
    // Verify against a dummy hash when the user is unknown so a missing account
    // and a wrong password take comparable time.
    const stored = user?.passwordHash ?? (await hashPassword('unused-placeholder'));
    const ok = await verifyPassword(password, stored);

    if (!user || !ok) {
      return c.json({ message: 'Invalid username or password', statusCode: 401 }, 401);
    }

    const household = await findHouseholdById(user.householdId);
    if (!household) {
      return c.json({ message: 'Your household no longer exists', statusCode: 409 }, 409);
    }

    const session = await startSession(c, user);
    return c.json(authPayload(user, household, session.token));
  })

  .post('/logout', async (c) => {
    const token = extractSessionToken(c);
    if (token) {
      await removeSessionByToken(token).catch(() => {});
    }
    deleteCookie(c, 'leaseops_session', { path: '/' });
    return c.json({ success: true, message: 'Logged out successfully' });
  })

  /**
   * POST /api/auth/import
   * Adopts an entire database file from another instance — how a laptop's
   * pipeline reaches a server without being retyped.
   *
   * Unauthenticated, because the whole point is that no account exists yet.
   * That makes the gate below the only thing standing between a stranger and
   * this instance's data, so it is deliberately narrow: the endpoint exists
   * ONLY while the database has zero users, which is the same window in which
   * anyone could simply sign up and own the instance anyway. The moment an
   * account exists — including one created BY this import — it is a 409
   * forever. There is no flag to reopen it.
   */
  /**
   * POST /api/auth/import/inspect
   * Reads an uploaded database and reports what is in it. Changes nothing.
   *
   * This step exists because the one mistake validation cannot catch is a `.db`
   * copied without its `-wal`: SQLite keeps recent writes in that sibling file,
   * so the database alone is a structurally perfect but *stale* snapshot. It
   * passes the integrity check and the schema fingerprint identically. Only a
   * person looking at "2 households, one of them called Test household scraper"
   * can tell — so the names are put in front of them before anything is replaced.
   */
  .post('/import/inspect', async (c) => {
    const staged = await stageUpload(c);
    if ('error' in staged) return c.json(staged.error, staged.status);

    try {
      const validation = validateImportCandidate(staged.path);
      if (!validation.ok) {
        return c.json({ message: validation.message ?? 'That database was rejected.', statusCode: 400 }, 400);
      }
      return c.json({
        ok: true,
        counts: validation.counts,
        households: validation.households,
        accounts: validation.accounts,
      });
    } finally {
      await staged.cleanup();
    }
  })

  .post('/import', async (c) => {
    const staged = await stageUpload(c);
    if ('error' in staged) return c.json(staged.error, staged.status);

    try {
      const validation = validateImportCandidate(staged.path);
      if (!validation.ok) {
        return c.json({ message: validation.message ?? 'That database was rejected.', statusCode: 400 }, 400);
      }

      // Re-checked inside the same request: the gate in `stageUpload` ran before
      // an upload that may have taken a while, and this must never run against
      // an instance someone signed up on in the meantime.
      if ((await countUsers()) > 0) {
        return c.json({ message: 'An account was created while this uploaded.', statusCode: 409 }, 409);
      }

      const imported = importDatabaseFile(staged.path);
      console.log('[Import] Adopted a database:', imported);

      return c.json({ success: true, imported }, 200);
    } catch (error) {
      console.error('[Import] Failed:', error);
      return c.json({ message: 'The import failed and nothing was changed.', statusCode: 500 }, 500);
    } finally {
      await staged.cleanup();
    }
  })

  .get('/me', async (c) => {
    const resolved = await resolveRequestUser(c);
    if (!resolved) {
      // Tells the login screen whether to offer the import affordance. It is
      // only ever true on a brand-new instance, and says nothing a stranger
      // could not learn by trying to sign up.
      return c.json({ authenticated: false, canImport: (await countUsers()) === 0 }, 200);
    }

    const household = await findHouseholdById(resolved.user.householdId);
    if (!household) {
      return c.json({ authenticated: false }, 200);
    }

    return c.json(
      {
        authenticated: true,
        user: toPublicUser(resolved.user),
        household: toPublicHousehold(household),
      },
      200
    );
  });

export default authRouter;
