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
 * The look of a member's monogram.
 *
 * LeaseOps stores no images: an avatar is the first letter of the display name
 * over one of these treatments, so it costs a single short string and travels
 * with the database file like everything else. Closed set for the same reason
 * the gender enum is — the column, the Zod schema and the CSS all read from
 * this list, so a style cannot be storable but unrenderable.
 *
 * Null means never chosen, and is resolved to a colour derived from the user id
 * rather than to a fixed default: two members who have never opened Settings
 * still get different monograms.
 */
export const AVATAR_STYLES = ['emerald', 'blue', 'violet', 'amber', 'rose', 'slate'] as const;

export type AvatarStyle = (typeof AVATAR_STYLES)[number];

/**
 * What the person does, as a landlord screens for it.
 *
 * Closed set, because every option a real applicant needs is here and a free
 * text box produces "engineer", "SWE" and "trabajo en tecnología" for the same
 * fact. It is the one work answer everybody can give, which is why it — and only
 * it — gates entry to the app.
 */
export const EMPLOYMENT_STATUSES = [
  'employed',
  'self_employed',
  'student',
  'student_working',
  'retired',
  'not_working',
] as const;

export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

/**
 * One member's working life — the only part of the tenant story that belongs to
 * a person rather than to the household.
 *
 * Everything a landlord screens on is shared (documents, guarantees, pets, dates)
 * except this: a job, its contract, its income and the right to work that
 * underwrites it are facts about one body. Kept per user so an outreach message
 * can say "I" about its actual author and name the other members for their own
 * work, instead of silently assigning one member's job to whoever sent it.
 *
 * `contractDetails` is free text on purpose. A dropdown offering "permanent"
 * becomes "contrato indefinido" in a Spanish draft, which is a term the owner
 * checks against the document — see rule 3d in `OUTREACH_RULES`. The user's own
 * wording has to survive into the letter.
 */
export interface WorkProfile {
  employmentStatus?: EmploymentStatus | null;
  /** Role, employer, and whether it is remote — "MarTech Specialist at LeadTech, remote". */
  occupation?: string;
  /** In the member's own words. Never normalised into a legal term. */
  contractDetails?: string;
  income?: string;
  /**
   * Visa, permit or residency status, and anything pending on it.
   *
   * Personal rather than household because it is per-body, and because a
   * condition must travel with the income it qualifies (rule 3c). Held in the
   * shared persona it would attach a member's visa transition to the other
   * member's letter.
   */
  rightToWork?: string;
}

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
    /**
     * This member's work, in `WorkProfile` shape.
     *
     * Nullable, and the null is load-bearing: it means the question has never
     * been put to this account, which is what sends an existing member to the
     * work screen after this shipped. An object — even one whose text fields are
     * all blank — means they answered, so someone with nothing to add is asked
     * once and never again.
     */
    workProfile: text('work_profile', { mode: 'json' }).$type<WorkProfile>(),
    /**
     * Which monogram treatment this member picked, from `AVATAR_STYLES`.
     *
     * Nullable, and the null carries the same meaning as everywhere else here:
     * never chosen. The client derives a colour from the user id in that case,
     * so an account that has never opened Settings still looks like itself
     * rather than like everybody else.
     */
    avatarStyle: text('avatar_style', { enum: AVATAR_STYLES }),
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
