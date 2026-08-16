import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { households } from './households';

/**
 * The search criteria: budget, MCDA feature weights, and tenant persona.
 *
 * Keyed to a household rather than a user — partners hunting for one flat share a
 * single set of criteria, so whoever edits it changes it for both. Exactly one
 * profile per household, enforced by the unique constraint.
 */
export const userProfiles = sqliteTable(
  'user_profiles',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .unique()
      .references(() => households.id, { onDelete: 'cascade' }),
    targetLocation: text('target_location').notNull().default(''),
    targetLanguage: text('target_language').notNull().default('English'),
    autoDraftMessages: integer('auto_draft_messages', { mode: 'boolean' }).notNull().default(true),
    currency: text('currency').notNull().default('EUR'),
    idealRent: real('ideal_rent').notNull().default(1200),
    maxRent: real('max_rent').notNull().default(1500),
    /** Score a listing must reach to qualify. Was hardcoded at 70 in two services. */
    qualifyingThreshold: real('qualifying_threshold').notNull().default(70),
    featureWeights: text('feature_weights', { mode: 'json' }).notNull().default('{}'), // JSON Mode for dynamic feature weight evaluation (1-5 scale)
    /**
     * Requirements that have a natural unit and so cannot be expressed as a 1-5
     * weight: floor area is a range because too big is its own problem, and room
     * counts carry both a floor ("fewer than this does not work") and an ideal.
     * Shape: { floorSizeSqm: {min,max}, bedrooms: {minimum,ideal}, bathrooms: {minimum,ideal} }
     */
    spaceRequirements: text('space_requirements', { mode: 'json' }).notNull().default('{}'),
    tenantPersona: text('tenant_persona').notNull().default(''),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => ({
    householdIdIdx: index('user_profiles_household_id_idx').on(table.householdId),
    updatedAtIdx: index('user_profiles_updated_at_idx').on(table.updatedAt),
  })
);

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  household: one(households, {
    fields: [userProfiles.householdId],
    references: [households.id],
  }),
}));

export interface RangeRequirement {
  min?: number | null;
  max?: number | null;
}

export interface CountRequirement {
  minimum?: number | null;
  ideal?: number | null;
}

export interface SpaceRequirements {
  floorSizeSqm?: RangeRequirement;
  bedrooms?: CountRequirement;
  bathrooms?: CountRequirement;
}

export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;
