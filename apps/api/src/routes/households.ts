import { Hono } from 'hono';
import { zValidator } from '../services/validate';
import {
  joinHouseholdApiSchema,
  updateHouseholdApiSchema,
  updateLlmKeyApiSchema,
  updateLlmModelApiSchema,
  updateMeApiSchema,
  updateWorkProfileApiSchema,
  findHouseholdById,
  findHouseholdByJoinCode,
  findHouseholdMembers,
  rotateJoinCode,
  updateHouseholdName,
  updateUserHousehold,
  updateUserMember,
  updateUserWorkProfile,
  toPublicUser,
  toPublicHousehold,
  removeHousehold,
  findProfileByHouseholdId,
  listApartments,
  setHouseholdAnthropicKey,
  clearHouseholdAnthropicKey,
  setHouseholdAnthropicModel,
} from '@leaseops/db';
import type { AuthEnv } from '../services/auth';
import { buildHouseholdSignOff } from '../services/signoff';
import {
  forgetAnthropicKey,
  verifyAnthropicKey,
  listAvailableModels,
  isSelectableModel,
} from '../services/anthropic';

const householdsRouter = new Hono<AuthEnv>()
  /**
   * GET /api/households/me
   * The household panel in Settings: name, the shareable code, and who is in it.
   */
  .get('/me', async (c) => {
    const householdId = c.get('householdId');
    const household = await findHouseholdById(householdId);
    if (!household) {
      return c.json({ message: 'Household not found', statusCode: 404 }, 404);
    }

    const members = await findHouseholdMembers(householdId);

    // The sign-off is computed here rather than in the client so there is exactly
    // one implementation of it — a preview that disagreed with the real signature
    // would be worse than no preview. `?language=` lets onboarding preview a
    // language the user has selected but not yet saved.
    const profile = await findProfileByHouseholdId(householdId);
    const language = c.req.query('language') || profile?.targetLanguage || 'English';

    // `toPublicHousehold` strips the Anthropic key; the `llm` block it returns is
    // metadata only. `envKeyAvailable` offers the one-time import below without
    // the key itself ever reaching the browser.
    return c.json({
      ...toPublicHousehold(household),
      members,
      signOff: buildHouseholdSignOff(members, language),
      envKeyAvailable: Boolean(Bun.env.ANTHROPIC_API_KEY?.trim()),
    });
  })

  /**
   * PATCH /api/households/me/member
   * Changes your own display name. This is what the household sees and what
   * outreach drafts are signed with, so it has to be editable after signup —
   * it was optional there.
   */
  .patch('/me/member', zValidator('json', updateMeApiSchema), async (c) => {
    const { displayName, gender, grammaticalForm, avatarStyle } = c.req.valid('json');
    const updated = await updateUserMember(c.get('user').id, {
      displayName,
      gender,
      grammaticalForm: gender === 'other' ? grammaticalForm : null,
      // Omitted means "unchanged", not "clear it" — unlike the writing form,
      // which is derived from gender and so must be wiped when gender moves off
      // 'other'. Drizzle drops undefined keys from the SET clause.
      avatarStyle,
    });
    if (!updated) {
      return c.json({ message: 'Account not found', statusCode: 404 }, 404);
    }
    return c.json(toPublicUser(updated));
  })

  /**
   * PATCH /api/households/me/work
   * Your own work: what you do, your contract, your income, your right to work.
   *
   * Separate from the household's shared persona because it writes your user row
   * and nobody else's — both partners can fill the work screen in at the same
   * moment without either overwriting the other. Saving it is also what closes
   * the work gate for this account, which is why `employmentStatus` is required:
   * an answer everyone can give, so nobody is trapped on the screen.
   */
  .patch('/me/work', zValidator('json', updateWorkProfileApiSchema), async (c) => {
    const updated = await updateUserWorkProfile(c.get('user').id, c.req.valid('json'));
    if (!updated) {
      return c.json({ message: 'Account not found', statusCode: 404 }, 404);
    }
    return c.json(toPublicUser(updated));
  })

  .patch('/me', zValidator('json', updateHouseholdApiSchema), async (c) => {
    const { name } = c.req.valid('json');
    const updated = await updateHouseholdName(c.get('householdId'), name);
    if (!updated) {
      return c.json({ message: 'Household not found', statusCode: 404 }, 404);
    }
    return c.json(toPublicHousehold(updated));
  })

  /**
   * POST /api/households/me/rotate-code
   * Issues a new code and invalidates the old one, for when a code has been
   * shared more widely than intended. Existing members keep their access.
   */
  .post('/me/rotate-code', async (c) => {
    const updated = await rotateJoinCode(c.get('householdId'));
    if (!updated) {
      return c.json({ message: 'Household not found', statusCode: 404 }, 404);
    }
    return c.json(toPublicHousehold(updated));
  })

  /**
   * PUT /api/households/me/llm-key
   * Installs the Anthropic key that pays for the whole household's AI features.
   *
   * The key is checked against Anthropic before it is stored. Saving an unusable
   * key would not error anywhere — every AI feature would just start returning
   * offline output, which is indistinguishable from a bug.
   *
   * There are no per-member permissions in LeaseOps, so any member can replace
   * the key. The response names who it now bills so that is never a surprise.
   */
  .put('/me/llm-key', zValidator('json', updateLlmKeyApiSchema), async (c) => {
    const { apiKey } = c.req.valid('json');

    const verified = await verifyAnthropicKey(apiKey);
    if (!verified.ok) {
      return c.json({ message: verified.message, statusCode: 400 }, 400);
    }

    const householdId = c.get('householdId');
    const previous = await findHouseholdById(householdId);
    const updated = await setHouseholdAnthropicKey(householdId, apiKey, c.get('user').id);
    if (!updated) {
      return c.json({ message: 'Household not found', statusCode: 404 }, 404);
    }

    // The replaced key must not survive in the client cache, or in-flight work
    // would keep billing a credential the household has just stopped using.
    if (previous?.anthropicApiKey && previous.anthropicApiKey !== apiKey) {
      forgetAnthropicKey(previous.anthropicApiKey);
    }

    return c.json(toPublicHousehold(updated));
  })

  /**
   * POST /api/households/me/llm-key/import-env
   * Adopts the server's `ANTHROPIC_API_KEY` as this household's key, once.
   *
   * This exists only so an instance that predates per-household keys is one
   * click away from working again. The env var is **not** a runtime fallback —
   * after this the household's stored key is the only thing consulted, and the
   * key never crosses to the browser.
   */
  .post('/me/llm-key/import-env', async (c) => {
    const envKey = Bun.env.ANTHROPIC_API_KEY?.trim();
    if (!envKey) {
      return c.json({ message: 'The server has no ANTHROPIC_API_KEY set', statusCode: 404 }, 404);
    }

    const verified = await verifyAnthropicKey(envKey);
    if (!verified.ok) {
      return c.json({ message: verified.message, statusCode: 400 }, 400);
    }

    const updated = await setHouseholdAnthropicKey(c.get('householdId'), envKey, c.get('user').id);
    if (!updated) {
      return c.json({ message: 'Household not found', statusCode: 404 }, 404);
    }
    return c.json(toPublicHousehold(updated));
  })

  /**
   * DELETE /api/households/me/llm-key
   * Stops the household's AI spend. Every AI feature drops to offline output
   * immediately — deliberately visible rather than silent.
   */
  .delete('/me/llm-key', async (c) => {
    const householdId = c.get('householdId');
    const previous = await findHouseholdById(householdId);
    const updated = await clearHouseholdAnthropicKey(householdId);
    if (!updated) {
      return c.json({ message: 'Household not found', statusCode: 404 }, 404);
    }
    if (previous?.anthropicApiKey) forgetAnthropicKey(previous.anthropicApiKey);
    return c.json(toPublicHousehold(updated));
  })

  /**
   * GET /api/households/me/llm-models
   * The models this household's key can actually use, from Anthropic's Models
   * API — so a newly released model appears here without a code change.
   *
   * Filtered to models that support the structured outputs and effort settings
   * every LLM call in this app sends; anything else would fail on first use.
   * Falls back to a built-in list when there is no key yet or Anthropic cannot
   * be reached, and says which of the two it is.
   */
  .get('/me/llm-models', async (c) => {
    const household = await findHouseholdById(c.get('householdId'));
    if (!household) {
      return c.json({ message: 'Household not found', statusCode: 404 }, 404);
    }
    return c.json(await listAvailableModels(household.anthropicApiKey));
  })

  /**
   * PATCH /api/households/me/llm-model
   * The cost lever, next to the person paying for it. Separate from the key so
   * switching models does not mean re-entering a credential.
   *
   * The id is checked against the live catalogue first. Storing one Anthropic
   * does not serve would 404 on every later call and look exactly like a broken
   * key — the same failure the key check exists to prevent.
   */
  .patch('/me/llm-model', zValidator('json', updateLlmModelApiSchema), async (c) => {
    const { model } = c.req.valid('json');
    const householdId = c.get('householdId');

    const household = await findHouseholdById(householdId);
    if (!household) {
      return c.json({ message: 'Household not found', statusCode: 404 }, 404);
    }

    if (!(await isSelectableModel(household.anthropicApiKey, model))) {
      return c.json(
        { message: `Anthropic does not offer "${model}" to this key`, statusCode: 400 },
        400
      );
    }

    const updated = await setHouseholdAnthropicModel(householdId, model);
    if (!updated) {
      return c.json({ message: 'Household not found', statusCode: 404 }, 404);
    }
    return c.json(toPublicHousehold(updated));
  })

  /**
   * POST /api/households/join
   * Moves the signed-in user into another household using its code.
   *
   * A user belongs to exactly one household, so this is a move, not an addition.
   * A household left with no members is removed **only when it holds nothing** —
   * no criteria, no listings. If the leaver had already done onboarding or added
   * flats, that data is kept rather than silently destroyed by what looks like a
   * navigation action. Cleaning up genuine leftovers is worth it; deleting
   * someone's search because they typed a code is not.
   *
   * Leaving also takes your API key with you. If the departing member is the one
   * paying, the household they left drops to offline output rather than carrying
   * on spending a credential its owner no longer controls — which is exactly the
   * moment nobody would notice. The remaining members see the "no key" state in
   * Settings; the leaver is told in the response.
   */
  .post('/join', zValidator('json', joinHouseholdApiSchema), async (c) => {
    const user = c.get('user');
    const { joinCode } = c.req.valid('json');

    const target = await findHouseholdByJoinCode(joinCode);
    if (!target) {
      return c.json({ message: 'That household code is not valid', statusCode: 404 }, 404);
    }

    if (target.id === user.householdId) {
      return c.json({ message: 'You are already in that household', statusCode: 409 }, 409);
    }

    const previousHouseholdId = user.householdId;
    const previousHousehold = await findHouseholdById(previousHouseholdId);
    const moved = await updateUserHousehold(user.id, target.id);
    if (!moved) {
      return c.json({ message: 'Could not join that household', statusCode: 500 }, 500);
    }

    // Only the payer's departure clears the key — another member leaving has no
    // bearing on whose card is being charged.
    let llmKeyCleared = false;
    if (previousHousehold?.anthropicApiKey && previousHousehold.anthropicApiKeySetBy === user.id) {
      await clearHouseholdAnthropicKey(previousHouseholdId);
      forgetAnthropicKey(previousHousehold.anthropicApiKey);
      llmKeyCleared = true;
    }

    const remaining = await findHouseholdMembers(previousHouseholdId);
    let abandonedHouseholdRemoved = false;
    if (remaining.length === 0) {
      const [strandedProfile, strandedListings] = await Promise.all([
        findProfileByHouseholdId(previousHouseholdId),
        listApartments(previousHouseholdId),
      ]);
      if (!strandedProfile && strandedListings.length === 0) {
        await removeHousehold(previousHouseholdId);
        abandonedHouseholdRemoved = true;
      }
    }

    return c.json({
      success: true,
      household: toPublicHousehold(target),
      abandonedHouseholdRemoved,
      /** True when your key stayed behind with the household you just left. */
      llmKeyCleared,
    });
  });

export default householdsRouter;
