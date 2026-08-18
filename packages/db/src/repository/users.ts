import { eq, sql } from 'drizzle-orm';
import { db } from '../client';
import { users, type User, type NewUser, type WorkProfile } from '../schema/auth';

/**
 * Total accounts on the instance, across every household.
 *
 * Used only to recognise a brand-new deployment: sign-up on a public hostname
 * is closed by default, and the exception is the very first account, which
 * otherwise could never be created without editing the environment first.
 */
export async function countUsers(): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(users);
  return Number(row?.count ?? 0);
}

/** A user with the password hash stripped — the only shape routes should return. */
export type PublicUser = Omit<User, 'passwordHash'>;

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

export async function createUser(data: NewUser): Promise<User> {
  const [created] = await db.insert(users).values(data).returning();
  return created;
}

/**
 * Looks a user up for authentication. Returns the full row including
 * `passwordHash`, so callers must not pass the result straight to `c.json`.
 * Usernames are stored and compared lowercase.
 */
export async function findUserByUsername(username: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.username, username.trim().toLowerCase()));
  return user;
}

export async function findUserById(id: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

/**
 * Moves a user into a different household, used when they redeem another
 * household's join code.
 */
export async function updateUserHousehold(userId: string, householdId: string): Promise<User | undefined> {
  const [updated] = await db
    .update(users)
    .set({ householdId, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return updated;
}

/**
 * Updates a member's own details — the name the household sees and the
 * grammatical form outreach is written in.
 */
export async function updateUserMember(
  userId: string,
  data: Pick<NewUser, 'displayName' | 'gender' | 'grammaticalForm'>
): Promise<User | undefined> {
  const [updated] = await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return updated;
}

/**
 * Records a member's own work details.
 *
 * Writes only this user's row, so both members can fill the work screen in at
 * the same time without either overwriting the other — unlike the household
 * persona, which is one shared row.
 */
export async function updateUserWorkProfile(
  userId: string,
  workProfile: WorkProfile
): Promise<User | undefined> {
  const [updated] = await db
    .update(users)
    .set({ workProfile, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return updated;
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<User | undefined> {
  const [updated] = await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return updated;
}

export async function removeUser(id: string): Promise<User | undefined> {
  const [deleted] = await db.delete(users).where(eq(users.id, id)).returning();
  return deleted;
}
