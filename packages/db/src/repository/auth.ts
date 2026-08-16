import { eq } from 'drizzle-orm';
import { db } from '../client';
import { userSessions, type UserSession, type NewUserSession } from '../schema/auth';

/**
 * Creates and persists a new user session in the SQLite database.
 */
export async function createSession(data: NewUserSession): Promise<UserSession> {
  const [created] = await db.insert(userSessions).values(data).returning();
  return created;
}

/**
 * Retrieves a session by its unique token, returning undefined if not found or expired.
 */
export async function findValidSessionByToken(token: string): Promise<UserSession | undefined> {
  const now = new Date();
  const [session] = await db
    .select()
    .from(userSessions)
    .where(eq(userSessions.token, token));

  if (!session || session.expiresAt <= now) {
    if (session) {
      // Clean up expired session asynchronously
      removeSessionByToken(token).catch(() => {});
    }
    return undefined;
  }

  return session;
}

/**
 * Deletes a user session by its token (e.g., on logout).
 */
export async function removeSessionByToken(token: string): Promise<UserSession | undefined> {
  const [deleted] = await db.delete(userSessions).where(eq(userSessions.token, token)).returning();
  return deleted;
}

/**
 * Deletes all active sessions for a user — every device gets logged out.
 */
export async function removeAllSessionsForUser(userId: string): Promise<UserSession[]> {
  return db.delete(userSessions).where(eq(userSessions.userId, userId)).returning();
}
