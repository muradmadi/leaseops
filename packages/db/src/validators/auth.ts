import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { userSessions } from '../schema';

/**
 * Full select validation schema derived from the Drizzle user_sessions table.
 */
export const selectUserSessionSchema = createSelectSchema(userSessions);

/**
 * Full insert validation schema derived from the Drizzle user_sessions table.
 */
export const insertUserSessionSchema = createInsertSchema(userSessions);

/**
 * API payload validation schema for user login requests.
 */
export const loginApiSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginApiPayload = z.infer<typeof loginApiSchema>;
