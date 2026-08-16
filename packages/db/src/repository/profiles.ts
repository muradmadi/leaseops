import { eq } from 'drizzle-orm';
import { db } from '../client';
import { userProfiles, type UserProfile, type NewUserProfile } from '../schema/profiles';

/**
 * Retrieves the search criteria for a household. There is at most one profile per
 * household — both partners read and write the same row.
 *
 * This replaced a `findFirstProfile()` helper that returned whichever profile the
 * database happened to hand back first. That was harmless while LeaseOps had one
 * user and actively wrong with two: a background scoring job could score a listing
 * against a different household's budget ceiling.
 */
export async function findProfileByHouseholdId(householdId: string): Promise<UserProfile | undefined> {
  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.householdId, householdId));
  return profile;
}

/**
 * Idempotently creates or updates a household's onboarding profile.
 */
export async function upsertProfile(data: NewUserProfile): Promise<UserProfile> {
  const now = new Date();
  const [profile] = await db
    .insert(userProfiles)
    .values({ ...data, updatedAt: now })
    .onConflictDoUpdate({
      target: userProfiles.householdId,
      set: {
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
        updatedAt: now,
      },
    })
    .returning();

  return profile;
}

/**
 * Deletes a household's profile, returning the deleted record.
 */
export async function removeProfileByHouseholdId(householdId: string): Promise<UserProfile | undefined> {
  const [deleted] = await db
    .delete(userProfiles)
    .where(eq(userProfiles.householdId, householdId))
    .returning();
  return deleted;
}
