import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const apartments = sqliteTable(
  'apartments',
  {
    id: text('id').primaryKey(),
    url: text('url').notNull().unique(),
    title: text('title').notNull(),
    price: real('price').notNull(),
    currency: text('currency').default('EUR').notNull(),
    status: text('status', { enum: ['UNPROCESSED', 'QUALIFIED', 'DISQUALIFIED', 'ARCHIVED', 'ERROR'] })
      .default('UNPROCESSED')
      .notNull(),
    mcdaScore: real('mcda_score'),
    featureScores: text('feature_scores', { mode: 'json' }), // JSON Mode for dynamic feature evaluations
    roomScores: text('room_scores', { mode: 'json' }), // JSON Mode for 1-5 room quality ratings
    rawHtml: text('raw_html'), // Raw HTML string from Scrapfly Anti-Bot Bypass
    extractedData: text('extracted_data', { mode: 'json' }), // Extracted structured JSON from DeepSeek V4 Flash
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => ({
    statusIdx: index('apartments_status_idx').on(table.status),
    scoreIdx: index('apartments_score_idx').on(table.mcdaScore),
    createdAtIdx: index('apartments_created_at_idx').on(table.createdAt),
    statusCreatedAtIdx: index('apartments_status_created_at_idx').on(table.status, table.createdAt),
  })
);

export const apartmentsRelations = relations(apartments, () => ({}));

export type Apartment = typeof apartments.$inferSelect;
export type NewApartment = typeof apartments.$inferInsert;

export interface RoomScores {
  livingRoom?: number; // 1-5
  bedroom?: number; // 1-5
  kitchen?: number; // 1-5
  bathroom?: number; // 1-5
  entryway?: number; // 1-5
}

