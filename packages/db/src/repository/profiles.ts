import { eq } from 'drizzle-orm';
import { db } from '../client';
import { userProfiles, type UserProfile, type NewUserProfile } from '../schema/profiles';

/**
 * Retrieves a user onboarding profile by their unique username.
 */
export async function findProfileByUsername(username: string): Promise<UserProfile | undefined> {
  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.username, username));
  return profile;
}

/**
 * Retrieves the first available user onboarding profile (useful for self-hosted RevOps background tasks).
 */
export async function findFirstProfile(): Promise<UserProfile | undefined> {
  const [profile] = await db.select().from(userProfiles).limit(1);
  return profile;
}


/**
 * Idempotently creates or updates a user onboarding profile based on the unique username constraint.
 */
export async function upsertProfile(data: NewUserProfile): Promise<UserProfile> {
  const now = new Date();
  const [profile] = await db
    .insert(userProfiles)
    .values({ ...data, updatedAt: now })
    .onConflictDoUpdate({
      target: userProfiles.username,
      set: {
        targetLocation: data.targetLocation,
        targetLanguage: data.targetLanguage,
        autoTranslateListings: data.autoTranslateListings,
        autoDraftMessages: data.autoDraftMessages,
        currency: data.currency,
        idealRent: data.idealRent,
        maxRent: data.maxRent,
        featureWeights: data.featureWeights,
        tenantPersona: data.tenantPersona,
        updatedAt: now,
      },
    })
    .returning();

  return profile;
}

/**
 * Deletes a user profile by username, returning the deleted record.
 */
export async function removeProfileByUsername(username: string): Promise<UserProfile | undefined> {
  const [deleted] = await db.delete(userProfiles).where(eq(userProfiles.username, username)).returning();
  return deleted;
}
