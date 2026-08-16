import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { setCookie, deleteCookie } from 'hono/cookie';
import {
  loginApiSchema,
  signupApiSchema,
  createSession,
  removeSessionByToken,
  createUser,
  findUserByUsername,
  toPublicUser,
  createHousehold,
  findHouseholdById,
  findHouseholdByJoinCode,
  generateJoinCode,
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
    household: { id: household.id, name: household.name, joinCode: household.joinCode },
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

  .get('/me', async (c) => {
    const resolved = await resolveRequestUser(c);
    if (!resolved) {
      return c.json({ authenticated: false }, 200);
    }

    const household = await findHouseholdById(resolved.user.householdId);
    if (!household) {
      return c.json({ authenticated: false }, 200);
    }

    return c.json(
      {
        authenticated: true,
        user: toPublicUser(resolved.user),
        household: { id: household.id, name: household.name },
      },
      200
    );
  });

export default authRouter;
