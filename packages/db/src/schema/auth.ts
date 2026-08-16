import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { households } from './households';

/**
 * The gender question and its follow-up, defined once.
 *
 * Both the column enum, the Zod schema and every UI control derive from these,
 * so a value cannot be legal in one layer and rejected by another.
 */
export const GENDERS = ['male', 'female', 'other'] as const;
export const GRAMMATICAL_FORMS = ['masculine', 'feminine', 'neutral'] as const;

export type Gender = (typeof GENDERS)[number];
export type GrammaticalForm = (typeof GRAMMATICAL_FORMS)[number];

/**
 * A login. Credentials are personal; everything else a user can see belongs to
 * their household.
 *
 * `passwordHash` is produced by `Bun.password` (argon2id). The plaintext password
 * is never stored, logged, or returned by any route.
 */
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull().default(''),
    /**
     * Personal, because the outreach draft is written in the first person and
     * Spanish, German and French cannot form "I live alone" or "I am a nurse"
     * without it. Held per user rather than per household: a couple signing
     * jointly needs both values to agree in the plural.
     *
     * Nullable — accounts created before this existed have no answer, and a
     * blank is handled by writing around gendered forms rather than guessing.
     * Never inferred from the display name: "Alexis" is unresolvable, and a
     * wrong guess misgenders a real person in their own letter.
     */
    gender: text('gender', { enum: GENDERS }),
    /**
     * How the message should be worded, asked only when `gender` is 'other'.
     * For 'male' and 'female' it is derived instead of stored, so the two
     * columns cannot contradict each other — see `resolveWritingForm`.
     */
    grammaticalForm: text('grammatical_form', { enum: GRAMMATICAL_FORMS }),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => ({
    usernameIdx: index('users_username_idx').on(table.username),
    householdIdIdx: index('users_household_id_idx').on(table.householdId),
  })
);

export const usersRelations = relations(users, ({ one, many }) => ({
  household: one(households, {
    fields: [users.householdId],
    references: [households.id],
  }),
  sessions: many(userSessions),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/**
 * Server-side sessions, keyed to a user rather than a username so a session
 * survives a display-name change and dies with the account.
 *
 * Sessions are rows, not JWTs, so the same account stays logged in on a phone and
 * a laptop simultaneously — each device holds its own token.
 */
export const userSessions = sqliteTable(
  'user_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => ({
    tokenIdx: index('user_sessions_token_idx').on(table.token),
    userIdIdx: index('user_sessions_user_id_idx').on(table.userId),
    expiresAtIdx: index('user_sessions_expires_at_idx').on(table.expiresAt),
  })
);

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, {
    fields: [userSessions.userId],
    references: [users.id],
  }),
}));

export type UserSession = typeof userSessions.$inferSelect;
export type NewUserSession = typeof userSessions.$inferInsert;
