import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { users } from './auth';
import { userProfiles } from './profiles';
import { apartments } from './apartments';

/**
 * A household is the unit that owns everything in LeaseOps: the search criteria,
 * the pipeline, and the outreach threads. Users are only credentials pointing at
 * one — two partners hunting for the same flat share a household and therefore
 * see an identical dashboard from any device.
 *
 * `joinCode` is the shareable secret that grants access, so it is rotatable from
 * Settings rather than fixed at creation.
 */
export const households = sqliteTable(
  'households',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().default(''),
    joinCode: text('join_code').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => ({
    joinCodeIdx: index('households_join_code_idx').on(table.joinCode),
  })
);

export const householdsRelations = relations(households, ({ many, one }) => ({
  members: many(users),
  apartments: many(apartments),
  profile: one(userProfiles, {
    fields: [households.id],
    references: [userProfiles.householdId],
  }),
}));

export type Household = typeof households.$inferSelect;
export type NewHousehold = typeof households.$inferInsert;
