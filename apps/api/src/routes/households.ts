import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  joinHouseholdApiSchema,
  updateHouseholdApiSchema,
  updateMeApiSchema,
  findHouseholdById,
  findHouseholdByJoinCode,
  findHouseholdMembers,
  rotateJoinCode,
  updateHouseholdName,
  updateUserHousehold,
  updateUserMember,
  toPublicUser,
  removeHousehold,
  findProfileByHouseholdId,
  listApartments,
} from '@leaseops/db';
import type { AuthEnv } from '../services/auth';
import { buildHouseholdSignOff } from '../services/signoff';

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

    return c.json({
      id: household.id,
      name: household.name,
      joinCode: household.joinCode,
      members,
      signOff: buildHouseholdSignOff(members, language),
      createdAt: household.createdAt,
    });
  })

  /**
   * PATCH /api/households/me/member
   * Changes your own display name. This is what the household sees and what
   * outreach drafts are signed with, so it has to be editable after signup —
   * it was optional there.
   */
  .patch('/me/member', zValidator('json', updateMeApiSchema), async (c) => {
    const { displayName, gender, grammaticalForm } = c.req.valid('json');
    const updated = await updateUserMember(c.get('user').id, {
      displayName,
      gender,
      grammaticalForm: gender === 'other' ? grammaticalForm : null,
    });
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
    return c.json({ id: updated.id, name: updated.name, joinCode: updated.joinCode });
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
    return c.json({ id: updated.id, name: updated.name, joinCode: updated.joinCode });
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
    const moved = await updateUserHousehold(user.id, target.id);
    if (!moved) {
      return c.json({ message: 'Could not join that household', statusCode: 500 }, 500);
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
      household: { id: target.id, name: target.name, joinCode: target.joinCode },
      abandonedHouseholdRemoved,
    });
  });

export default householdsRouter;
