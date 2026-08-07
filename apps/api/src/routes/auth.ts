import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import { loginApiSchema, createSession, removeSessionByToken, findValidSessionByToken } from '@leaseops/db';
import { verifyCredentials, type AuthEnv } from '../services/auth';

const authRouter = new Hono<AuthEnv>()
  .post('/login', zValidator('json', loginApiSchema), async (c) => {
    const { username, password } = c.req.valid('json');

    if (!verifyCredentials(username, password)) {
      return c.json({ message: 'Invalid username or password', statusCode: 401 }, 401);
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const session = await createSession({
      id: crypto.randomUUID(),
      username,
      token,
      expiresAt,
      createdAt: new Date(),
    });

    setCookie(c, 'leaseops_session', session.token, {
      path: '/',
      httpOnly: true,
      secure: Bun.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 7 * 24 * 60 * 60,
    });

    return c.json({
      success: true,
      user: { username: session.username },
      token: session.token,
    });
  })
  .post('/logout', async (c) => {
    let token = getCookie(c, 'leaseops_session');
    if (!token) {
      const authHeader = c.req.header('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      }
    }

    if (token) {
      await removeSessionByToken(token).catch(() => {});
    }

    deleteCookie(c, 'leaseops_session', { path: '/' });

    return c.json({ success: true, message: 'Logged out successfully' });
  })
  .get('/me', async (c) => {
    let token = getCookie(c, 'leaseops_session');
    if (!token) {
      const authHeader = c.req.header('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      }
    }

    if (!token) {
      return c.json({ authenticated: false }, 200);
    }

    const session = await findValidSessionByToken(token);
    if (!session) {
      return c.json({ authenticated: false }, 200);
    }

    return c.json(
      {
        authenticated: true,
        user: { username: session.username },
      },
      200
    );
  });

export default authRouter;
