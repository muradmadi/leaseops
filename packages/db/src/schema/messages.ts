import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { apartments } from './apartments';

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    apartmentId: text('apartment_id')
      .notNull()
      .references(() => apartments.id, { onDelete: 'cascade' }),
    sender: text('sender', { enum: ['landlord', 'ai_suggestion', 'user'] }).notNull(),
    text: text('text').notNull(),
    status: text('status').notNull().default('ready'),
    metadata: text('metadata', { mode: 'json' }), // For translated, originalLanguage, personaTuned, etc.
    /**
     * When this message was actually said, stated by the person who logged it.
     *
     * Deliberately not `createdAt`. That column is when the row was written,
     * which is a fact about the record and not about the conversation: you send
     * a message from your own mail client and mark it here a day later, and
     * `createdAt` would claim you wrote it just now. The chat used to render
     * exactly that and it was removed for being wrong.
     *
     * Nullable, and nothing derives it. A message with no time is a message
     * nobody has dated, and every readout treats that as unknown rather than
     * falling back to `createdAt` — the fallback is the bug this column exists
     * to fix.
     */
    sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => ({
    apartmentIdIdx: index('messages_apartment_id_idx').on(table.apartmentId),
    createdAtIdx: index('messages_created_at_idx').on(table.createdAt),
  })
);

export const messagesRelations = relations(messages, ({ one }) => ({
  apartment: one(apartments, {
    fields: [messages.apartmentId],
    references: [apartments.id],
  }),
}));

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
