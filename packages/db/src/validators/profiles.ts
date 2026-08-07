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
export const upsertProfileApiSchema = z.object({
  targetLocation: z.string().default(''),
  targetLanguage: z.string().default('English'),
  autoTranslateListings: z.boolean().default(true),
  autoDraftMessages: z.boolean().default(true),
  currency: z.string().default('EUR'),
  idealRent: z.number().positive().default(1200),
  maxRent: z.number().positive().default(1500),
  featureWeights: z.record(z.string(), z.number().min(1).max(5)).default({}),
  tenantPersona: z.string().default(''),
});

export type UpsertProfileApiPayload = z.infer<typeof upsertProfileApiSchema>;
