import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import {
  findValidSessionByToken,
  findUserById,
  type UserSession,
  type User,
} from '@leaseops/db';

export type AuthEnv = {
  Variables: {
    session: UserSession;
    user: User;
    /**
     * The household the request acts on. Every query that reads or writes user
     * data must scope to this — it comes from the session, never from the request
     * body or a query parameter.
     */
    householdId: string;
  };
};

/**
 * Hashes a password with `Bun.password` (argon2id by default) — native, no
 * dependency, and salted per hash. Plaintext is never stored or logged.
 */
export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password);
}

/**
 * Verifies a password against a stored hash.
 *
 * `Bun.password.verify` throws on a malformed hash rather than returning false,
 * so it is caught here: a corrupt hash must read as "wrong password", not as a
 * 500 that tells an attacker the account exists.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await Bun.password.verify(password, hash);
  } catch {
    return false;
  }
}

/**
 * Extracts the session token from the HTTP-only cookie, falling back to a Bearer
 * header so the PWA works when cookies are unavailable.
 */
export function extractSessionToken(c: {
  req: { header: (name: string) => string | undefined };
}): string | undefined {
  const cookieToken = getCookie(c as any, 'leaseops_session');
  if (cookieToken) return cookieToken;

  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  return undefined;
}

/**
 * Resolves a request to its session, user, and household. Returns undefined when
 * the token is missing, expired, or points at a user that no longer exists.
 */
export async function resolveRequestUser(c: any): Promise<
  { session: UserSession; user: User } | undefined
> {
  const token = extractSessionToken(c);
  if (!token) return undefined;

  const session = await findValidSessionByToken(token);
  if (!session) return undefined;

  const user = await findUserById(session.userId);
  if (!user) return undefined;

  return { session, user };
}

/**
 * Hono middleware enforcing an active session, and attaching the caller's user
 * and household to the context.
 */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const resolved = await resolveRequestUser(c);

  if (!resolved) {
    return c.json({ message: 'Authentication required. Please log in.', statusCode: 401 }, 401);
  }

  c.set('session', resolved.session);
  c.set('user', resolved.user);
  c.set('householdId', resolved.user.householdId);
  await next();
});
