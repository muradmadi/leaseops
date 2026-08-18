import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  findProfileByHouseholdId,
  upsertProfile,
  updateTenantPersona,
  upsertProfileApiSchema,
  updateTenantPersonaApiSchema,
} from '@leaseops/db';
import type { AuthEnv } from '../services/auth';

const profilesRouter = new Hono<AuthEnv>();

/**
 * GET /api/profiles/me
 * The household's onboarding profile and MCDA weights. Both partners see and
 * edit the same row — the criteria belong to the search, not to a person.
 *
 * `requireAuth` is mounted in `index.ts`, so `householdId` is always present here.
 */
profilesRouter.get('/me', async (c) => {
  const profile = await findProfileByHouseholdId(c.get('householdId'));

  if (!profile) {
    return c.json(
      {
        exists: false,
        targetLocation: '',
        targetLanguage: 'English',
        autoDraftMessages: true,
        currency: 'EUR',
        idealRent: 1200,
        maxRent: 1500,
        qualifyingThreshold: 70,
        featureWeights: {},
        spaceRequirements: {},
        tenantPersona: '',
      },
      200
    );
  }

  return c.json({ exists: true, ...profile }, 200);
});

/**
 * PUT /api/profiles/me
 * Creates or updates the household's profile. The household comes from the
 * session, never the request body, so a caller cannot write another household's
 * criteria by supplying an id.
 */
const upsertHandler = async (c: any) => {
  const householdId = c.get('householdId');
  const data = c.req.valid('json');
  const existing = await findProfileByHouseholdId(householdId);
  const now = new Date();

  const saved = await upsertProfile({
    id: existing?.id || crypto.randomUUID(),
    householdId,
    targetLocation: data.targetLocation,
    targetLanguage: data.targetLanguage,
    autoDraftMessages: data.autoDraftMessages,
    currency: data.currency,
    idealRent: data.idealRent,
    maxRent: data.maxRent,
    qualifyingThreshold: data.qualifyingThreshold,
    featureWeights: data.featureWeights,
    spaceRequirements: data.spaceRequirements,
    tenantPersona: data.tenantPersona,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });

  return c.json({ success: true, exists: true, ...saved }, 200);
};

/**
 * PATCH /api/profiles/me/persona
 * The household's shared tenant facts, and nothing else.
 *
 * Separate from the upsert above because that one takes the whole profile and
 * every field of its payload has a default — a caller sending only the persona
 * through it would reset the location, the budget and all 32 feature weights.
 * The work screen edits the persona without holding any of that.
 */
profilesRouter.patch('/me/persona', zValidator('json', updateTenantPersonaApiSchema), async (c) => {
  const updated = await updateTenantPersona(c.get('householdId'), c.req.valid('json').tenantPersona);
  if (!updated) {
    return c.json({ message: 'This household has no profile yet', statusCode: 404 }, 404);
  }
  return c.json({ success: true, exists: true, ...updated }, 200);
});

profilesRouter.put('/me', zValidator('json', upsertProfileApiSchema), upsertHandler);
profilesRouter.post('/me', zValidator('json', upsertProfileApiSchema), upsertHandler);

export default profilesRouter;
