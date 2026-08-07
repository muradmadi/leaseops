import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const userSessions = sqliteTable(
  'user_sessions',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    token: text('token').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => ({
    tokenIdx: index('user_sessions_token_idx').on(table.token),
    usernameIdx: index('user_sessions_username_idx').on(table.username),
    expiresAtIdx: index('user_sessions_expires_at_idx').on(table.expiresAt),
  })
);

export const userSessionsRelations = relations(userSessions, () => ({}));

export type UserSession = typeof userSessions.$inferSelect;
export type NewUserSession = typeof userSessions.$inferInsert;
