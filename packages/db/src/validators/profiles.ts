import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { userProfiles } from '../schema';

/**
 * Full select validation schema derived from the Drizzle user_profiles table.
 */
export const selectUserProfileSchema = createSelectSchema(userProfiles);

/**
 * Full insert validation schema derived from the Drizzle user_profiles table.
 */
export const insertUserProfileSchema = createInsertSchema(userProfiles);

/**
 * API payload validation schema for saving or updating an onboarding profile.
 */
/**
 * Note there is no `householdId` here: it comes from the caller's session, never
 * from the request body, so a signed-in user cannot write another household's
 * criteria by supplying an id.
 */
export const upsertProfileApiSchema = z.object({
  targetLocation: z.string().default(''),
  targetLanguage: z.string().default('English'),
  autoDraftMessages: z.boolean().default(true),
  currency: z.string().default('EUR'),
  idealRent: z.number().positive().default(1200),
  maxRent: z.number().positive().default(1500),
  qualifyingThreshold: z.number().min(1).max(100).default(70),
  featureWeights: z.record(z.string(), z.number().min(1).max(5)).default({}),
  spaceRequirements: z
    .object({
      floorSizeSqm: z
        .object({ min: z.number().min(0).max(1000).nullish(), max: z.number().min(0).max(1000).nullish() })
        .optional(),
      bedrooms: z
        .object({ minimum: z.number().min(0).max(20).nullish(), ideal: z.number().min(0).max(20).nullish() })
        .optional(),
      bathrooms: z
        .object({ minimum: z.number().min(0).max(20).nullish(), ideal: z.number().min(0).max(20).nullish() })
        .optional(),
    })
    .default({}),
  tenantPersona: z.string().default(''),
});

export type UpsertProfileApiPayload = z.infer<typeof upsertProfileApiSchema>;
