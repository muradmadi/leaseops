import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { userSessions, users, GENDERS, GRAMMATICAL_FORMS } from '../schema';

/**
 * Full select validation schema derived from the Drizzle user_sessions table.
 */
export const selectUserSessionSchema = createSelectSchema(userSessions);

/**
 * Full insert validation schema derived from the Drizzle user_sessions table.
 */
export const insertUserSessionSchema = createInsertSchema(userSessions);

export const selectUserSchema = createSelectSchema(users);
export const insertUserSchema = createInsertSchema(users);

/**
 * Usernames are stored lowercase so `Ana` and `ana` cannot become two accounts.
 * Restricted to characters that survive being read aloud and retyped.
 */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Username must be at least 3 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(/^[a-z0-9_.-]+$/, 'Use letters, numbers, dots, dashes or underscores only');

/**
 * 12 characters minimum. This is a self-hosted app with no rate limiting in front
 * of it, so length is the only real defence available here.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(200, 'Password must be at most 200 characters');

/**
 * Asked once, at signup, and editable in Settings. Optional throughout: an
 * account that predates the question, or someone who skipped it, is handled by
 * writing around gendered forms rather than by guessing from their name.
 */
export const genderSchema = z.enum(GENDERS).optional();

/**
 * Only meaningful alongside `gender: 'other'`. For male and female the writing
 * form is derived, so storing it would create two fields that can disagree.
 */
export const grammaticalFormSchema = z.enum(GRAMMATICAL_FORMS).optional();

/**
 * API payload validation schema for user login requests.
 */
export const loginApiSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, 'Password is required'),
});

export type LoginApiPayload = z.infer<typeof loginApiSchema>;

/**
 * Signup either starts a new household or joins an existing one with its code.
 * Exactly one of `householdName` / `joinCode` is meaningful, so the two paths are
 * a discriminated union rather than a bag of optional fields.
 */
export const signupApiSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('create'),
    username: usernameSchema,
    password: passwordSchema,
    displayName: z.string().trim().max(80).default(''),
    gender: genderSchema,
    grammaticalForm: grammaticalFormSchema,
    householdName: z.string().trim().max(80).default(''),
  }),
  z.object({
    mode: z.literal('join'),
    username: usernameSchema,
    password: passwordSchema,
    displayName: z.string().trim().max(80).default(''),
    gender: genderSchema,
    grammaticalForm: grammaticalFormSchema,
    joinCode: z.string().trim().min(1, 'Household code is required'),
  }),
]);

export type SignupApiPayload = z.infer<typeof signupApiSchema>;

/**
 * API payload for redeeming another household's code while already signed in.
 */
export const joinHouseholdApiSchema = z.object({
  joinCode: z.string().trim().min(1, 'Household code is required'),
});

export type JoinHouseholdApiPayload = z.infer<typeof joinHouseholdApiSchema>;

/**
 * API payload for changing your own display name — the name the rest of the
 * household sees, and the one outreach is signed with.
 */
export const updateMeApiSchema = z.object({
  displayName: z.string().trim().max(80),
  gender: genderSchema,
  grammaticalForm: grammaticalFormSchema,
});

export type UpdateMeApiPayload = z.infer<typeof updateMeApiSchema>;

/**
 * API payload for renaming the household from Settings.
 */
export const updateHouseholdApiSchema = z.object({
  name: z.string().trim().max(80),
});

export type UpdateHouseholdApiPayload = z.infer<typeof updateHouseholdApiSchema>;
