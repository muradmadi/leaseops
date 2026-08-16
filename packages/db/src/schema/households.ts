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
 *
 * The Anthropic credential lives here too, because the member who supplies it is
 * paying for everyone in the household. It is stored in plaintext: encrypting it
 * would need a decryption key reachable by background enrichment, which means
 * `.env` — exactly what putting the key here removes. The threat model is
 * therefore the same as `.env`'s, but the sensitive file is now the SQLite
 * database, so treat `.db` backups as secret. Never serialise this column: use
 * `toPublicHousehold`.
 */
export const households = sqliteTable(
  'households',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().default(''),
    joinCode: text('join_code').notNull().unique(),
    /** Null means every AI feature falls back to its deterministic offline output. */
    anthropicApiKey: text('anthropic_api_key'),
    /**
     * Who is paying. A plain user id rather than a foreign key — `users` already
     * references `households`, and a cycle buys nothing here since the key is
     * cleared when its owner leaves.
     */
    anthropicApiKeySetBy: text('anthropic_api_key_set_by'),
    anthropicApiKeySetAt: integer('anthropic_api_key_set_at', { mode: 'timestamp_ms' }),
    /** Null uses the built-in default. The household's cost lever. */
    anthropicModel: text('anthropic_model'),
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

/**
 * A model id, e.g. `claude-opus-5`.
 *
 * Deliberately not a union. The set of models is Anthropic's to change, so it is
 * read from their Models API at request time rather than frozen in this repo —
 * a union here would mean a code change and a deploy every time a model ships.
 * What stops a typo reaching the API is `apps/api/src/services/anthropic.ts`,
 * which checks the submitted id against the live catalogue before saving.
 */
export type AnthropicModelId = string;

/** Used whenever a household has not chosen one. */
export const DEFAULT_ANTHROPIC_MODEL: AnthropicModelId = 'claude-opus-5';
