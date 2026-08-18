import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { households } from './households';

/**
 * The outreach pipeline, defined once. `WON`/`LOST` are the two ends of the
 * single "decided" stage, stored separately so the outcome cannot go missing.
 */
export const PIPELINE_STAGES = [
  'NOT_CONTACTED',
  'OUTREACH_SENT',
  'IN_CONVERSATION',
  'VIEWING_BOOKED',
  'WON',
  'LOST',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const apartments = sqliteTable(
  'apartments',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    /**
     * The member who entered this listing, and therefore the person whose voice
     * the outreach is written in.
     *
     * Both partners share one pipeline, but only one of them is sitting on the
     * portal with an account of their own, writing to this landlord. Whoever
     * added the listing is that person, so the draft says "I" about them and
     * names the others for their own work — see `resolveOutreachPersona`.
     *
     * A plain user id rather than a foreign key, matching
     * `households.anthropicApiKeySetBy`: it avoids an import cycle between the
     * two schema files, and a departed member must not take the household's
     * listings with them. Null — every row that predates this column, or an
     * author who has since left — falls back to the household's oldest member,
     * which is how those drafts already read.
     */
    createdBy: text('created_by'),
    /**
     * Who this listing's outreach is written as, when that is not simply whoever
     * entered it.
     *
     * A separate column from `createdBy` rather than an edit to it, for the same
     * reason `isActive` is separate from `status`: they answer two questions and
     * collapsing them loses the half you cannot recover. `createdBy` is a record
     * of what happened; this is a choice you can change. One partner logging in
     * on the other's phone, or picking up a listing the other entered, changes
     * who is writing without rewriting who added it.
     *
     * **Null means "follow `createdBy`"**, which is why it is nullable rather
     * than backfilled: an untouched listing keeps tracking its creator, and every
     * row that predates the whole idea keeps falling through to the household's
     * oldest member. Setting it is an override and nothing writes it
     * automatically — see `resolveApartmentAuthorId`.
     */
    outreachAuthorId: text('outreach_author_id'),
    url: text('url').notNull(),
    title: text('title').notNull(),
    price: real('price').notNull(),
    currency: text('currency').default('EUR').notNull(),
    status: text('status', { enum: ['UNPROCESSED', 'QUALIFIED', 'DISQUALIFIED', 'ARCHIVED', 'ERROR'] })
      .default('UNPROCESSED')
      .notNull(),
    mcdaScore: real('mcda_score'),
    /**
     * Whether you are actually pursuing this listing, which is a separate question
     * from whether it scored well. Qualifying sets it automatically because the
     * pipeline already spends LLM budget there; a listing that fell short stays
     * inactive until you decide it is worth chasing anyway. It never changes which
     * dashboard bucket the listing sits in — the score decides that.
     */
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
    /**
     * Why you pulled this listing out of the qualified pile by hand.
     *
     * A score answers "does it match your stated criteria". It cannot answer
     * "the stairwell smelled of damp" or "the landlord dodged three questions".
     * Setting a listing aside records that judgement **without touching
     * `status` or `mcdaScore`** — exactly as Activate never promotes a listing
     * to QUALIFIED. If a human verdict silently rewrote the measurement, the
     * percentage would stop meaning anything and the two facts could never be
     * compared again.
     *
     * The reason is the flag: non-null means set aside, so there is no boolean
     * that can drift out of step with the text, and a reason is mandatory —
     * a demotion you cannot explain is one you will not understand next week.
     */
    setAsideReason: text('set_aside_reason'),
    /**
     * How far the conversation with this landlord has actually got — the fourth
     * and only user-driven axis. `status` is what the score measured, `isActive`
     * is whether you decided to chase it, `archivedAt` is whether it is still on
     * the board; this is progress, and nothing computes it. It never changes on
     * its own, because a pipeline that advances itself stops being a record of
     * what you did.
     *
     * `WON` and `LOST` are the two ends of the single "decided" stage, stored as
     * separate values so the outcome cannot go missing.
     */
    pipelineStage: text('pipeline_stage', { enum: PIPELINE_STAGES })
      .default('NOT_CONTACTED')
      .notNull(),
    featureScores: text('feature_scores', { mode: 'json' }), // JSON Mode for dynamic feature evaluations
    roomScores: text('room_scores', { mode: 'json' }), // JSON Mode for 1-5 room quality ratings
    extractedData: text('extracted_data', { mode: 'json' }), // The listing details as entered, in ApartmentListing shape
    /**
     * Set when the listing is archived. Deleting from the dashboard archives rather
     * than destroys, so a flat you dismissed at 1am is recoverable. Null means live.
     * Kept separate from `status` so archiving does not erase the score's verdict.
     */
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => ({
    statusIdx: index('apartments_status_idx').on(table.status),
    scoreIdx: index('apartments_score_idx').on(table.mcdaScore),
    createdAtIdx: index('apartments_created_at_idx').on(table.createdAt),
    householdIdIdx: index('apartments_household_id_idx').on(table.householdId),
    archivedAtIdx: index('apartments_archived_at_idx').on(table.archivedAt),
    // Every dashboard query filters by household first, so the existing
    // status/createdAt indexes are only useful with it as the leading column.
    householdStatusCreatedAtIdx: index('apartments_household_status_created_at_idx').on(
      table.householdId,
      table.status,
      table.createdAt
    ),
    // A URL is unique *within* a household, not globally: two households hunting
    // the same city will legitimately track the same listing.
    householdUrlIdx: uniqueIndex('apartments_household_url_idx').on(table.householdId, table.url),
  })
);

export const apartmentsRelations = relations(apartments, ({ one }) => ({
  household: one(households, {
    fields: [apartments.householdId],
    references: [households.id],
  }),
}));

export type Apartment = typeof apartments.$inferSelect;
export type NewApartment = typeof apartments.$inferInsert;

export interface RoomScores {
  livingRoom?: number; // 1-5
  bedroom?: number; // 1-5
  kitchen?: number; // 1-5
  bathroom?: number; // 1-5
  entryway?: number; // 1-5
}

