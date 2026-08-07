import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { findValidSessionByToken, type UserSession } from '@leaseops/db';

export type AuthEnv = {
  Variables: {
    session: UserSession;
    user: { username: string };
  };
};

/**
 * Verifies username and password against configured environment variables.
 */
export function verifyCredentials(username?: string, password?: string): boolean {
  if (!username || !password) return false;
  const expectedUser = Bun.env.AUTH_USERNAME || 'admin';
  const expectedPass = Bun.env.AUTH_PASSWORD || 'leaseops';

  // Use timing-safe comparison if possible, or standard equality in single-tenant self-hosted dev
  return username === expectedUser && password === expectedPass;
}

/**
 * Hono middleware that enforces active session authentication via HTTP-only cookie or Bearer token.
 * Attaches validated session and user payload to context variables.
 */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  let token = getCookie(c, 'leaseops_session');
  
  if (!token) {
    const authHeader = c.req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }
  }

  if (!token) {
    return c.json({ message: 'Authentication required. Please log in.', statusCode: 401 }, 401);
  }

  const session = await findValidSessionByToken(token);
  if (!session) {
    return c.json({ message: 'Invalid or expired session. Please log in again.', statusCode: 401 }, 401);
  }

  c.set('session', session);
  c.set('user', { username: session.username });
  await next();
});
