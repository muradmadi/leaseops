import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const userProfiles = sqliteTable(
  'user_profiles',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull().unique(),
    targetLocation: text('target_location').notNull().default(''),
    targetLanguage: text('target_language').notNull().default('English'),
    autoTranslateListings: integer('auto_translate_listings', { mode: 'boolean' }).notNull().default(true),
    autoDraftMessages: integer('auto_draft_messages', { mode: 'boolean' }).notNull().default(true),
    currency: text('currency').notNull().default('EUR'),
    idealRent: real('ideal_rent').notNull().default(1200),
    maxRent: real('max_rent').notNull().default(1500),
    featureWeights: text('feature_weights', { mode: 'json' }).notNull().default('{}'), // JSON Mode for dynamic feature weight evaluation (1-5 scale)
    tenantPersona: text('tenant_persona').notNull().default(''),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => ({
    usernameIdx: index('user_profiles_username_idx').on(table.username),
    updatedAtIdx: index('user_profiles_updated_at_idx').on(table.updatedAt),
  })
);

export const userProfilesRelations = relations(userProfiles, () => ({}));

export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;
