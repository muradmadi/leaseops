import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getCookie } from 'hono/cookie';
import {
  findProfileByUsername,
  upsertProfile,
  upsertProfileApiSchema,
  findValidSessionByToken,
} from '@leaseops/db';

const profilesRouter = new Hono();

/**
 * Helper to extract authenticated user session from request.
 */
async function getAuthenticatedUser(c: any) {
  const ctxUser = c.get('user' as any);
  if (ctxUser?.username) return { username: ctxUser.username };
  const ctxSession = c.get('session' as any);
  if (ctxSession?.username) return { username: ctxSession.username };

  let token = getCookie(c, 'leaseops_session');
  if (!token) {
    const authHeader = c.req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }
  }
  if (!token) return undefined;
  return await findValidSessionByToken(token);
}

/**
 * GET /api/profiles/me
 * Retrieves the current authenticated user's onboarding profile and MCDA weights.
 */
profilesRouter.get('/me', async (c) => {
  const session = await getAuthenticatedUser(c);
  if (!session) {
    return c.json({ message: 'Unauthorized', statusCode: 401 }, 401);
  }

  const profile = await findProfileByUsername(session.username);
  if (!profile) {
    return c.json(
      {
        exists: false,
        username: session.username,
        targetLocation: '',
        targetLanguage: 'English',
        autoTranslateListings: true,
        autoDraftMessages: true,
        currency: 'EUR',
        idealRent: 1200,
        maxRent: 1500,
        featureWeights: {},
        tenantPersona: '',
      },
      200
    );
  }

  return c.json({ exists: true, ...profile }, 200);
});

/**
 * PUT /api/profiles/me
 * Creates or updates the authenticated user's onboarding profile and MCDA weights.
 */
const upsertHandler = async (c: any) => {
  const session = await getAuthenticatedUser(c);
  if (!session) {
    return c.json({ message: 'Unauthorized', statusCode: 401 }, 401);
  }

  const data = c.req.valid('json');
  const existing = await findProfileByUsername(session.username);
  const now = new Date();

  const saved = await upsertProfile({
    id: existing?.id || crypto.randomUUID(),
    username: session.username,
    targetLocation: data.targetLocation,
    targetLanguage: data.targetLanguage,
    autoTranslateListings: data.autoTranslateListings,
    autoDraftMessages: data.autoDraftMessages,
    currency: data.currency,
    idealRent: data.idealRent,
    maxRent: data.maxRent,
    featureWeights: data.featureWeights,
    tenantPersona: data.tenantPersona,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });

  return c.json({ success: true, exists: true, ...saved }, 200);
};

profilesRouter.put('/me', zValidator('json', upsertProfileApiSchema), upsertHandler);
profilesRouter.post('/me', zValidator('json', upsertProfileApiSchema), upsertHandler);

export default profilesRouter;
