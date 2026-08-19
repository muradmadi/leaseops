import { eq, asc } from 'drizzle-orm';
import { db } from '../client';
import {
  households,
  DEFAULT_ANTHROPIC_MODEL,
  type Household,
  type NewHousehold,
  type AnthropicModelId,
} from '../schema/households';
import { users, type User } from '../schema/auth';

/**
 * Crockford base32 without I, L, O and U — the characters people misread when
 * copying a code off one screen and typing it into another.
 */
const JOIN_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const JOIN_CODE_LENGTH = 8;

/**
 * Generates a shareable household join code, formatted in two groups for legibility
 * (e.g. `7F3K-92QX`). ~10^12 possibilities, drawn from a CSPRNG because this code
 * is the only secret standing between a stranger and a household's data.
 */
export function generateJoinCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(JOIN_CODE_LENGTH));
  let code = '';
  for (const byte of bytes) {
    code += JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * Normalizes user-entered codes so case and the optional dash never cause a
 * spurious "invalid code" — `7f3k92qx` and `7F3K-92QX` are the same household.
 */
export function normalizeJoinCode(raw: string): string {
  const stripped = raw.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (stripped.length !== JOIN_CODE_LENGTH) return stripped;
  return `${stripped.slice(0, 4)}-${stripped.slice(4)}`;
}

export async function createHousehold(data: NewHousehold): Promise<Household> {
  const [created] = await db.insert(households).values(data).returning();
  return created;
}

export async function findHouseholdById(id: string): Promise<Household | undefined> {
  const [household] = await db.select().from(households).where(eq(households.id, id));
  return household;
}

export async function findHouseholdByJoinCode(joinCode: string): Promise<Household | undefined> {
  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.joinCode, normalizeJoinCode(joinCode)));
  return household;
}

/**
 * Issues a fresh join code, invalidating the previous one. Used when a code has
 * been shared too widely — existing members are unaffected.
 */
export async function rotateJoinCode(householdId: string): Promise<Household | undefined> {
  const [updated] = await db
    .update(households)
    .set({ joinCode: generateJoinCode(), updatedAt: new Date() })
    .where(eq(households.id, householdId))
    .returning();
  return updated;
}

export async function updateHouseholdName(householdId: string, name: string): Promise<Household | undefined> {
  const [updated] = await db
    .update(households)
    .set({ name, updatedAt: new Date() })
    .where(eq(households.id, householdId))
    .returning();
  return updated;
}

/**
 * Lists a household's members. Never returns `passwordHash` — this feeds the
 * Settings screen, where the whole row would otherwise cross the wire.
 */
export async function findHouseholdMembers(
  householdId: string
): Promise<
  Pick<
    User,
    | 'id'
    | 'username'
    | 'displayName'
    | 'gender'
    | 'grammaticalForm'
    | 'avatarStyle'
    | 'workProfile'
    | 'createdAt'
  >[]
> {
  return db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      gender: users.gender,
      grammaticalForm: users.grammaticalForm,
      avatarStyle: users.avatarStyle,
      // Shared with the household on purpose: outreach names each member's work,
      // so both partners can see what the letter will say about them. There are
      // no per-member permissions in LeaseOps by design.
      workProfile: users.workProfile,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.householdId, householdId))
    // Oldest first, so the sign-off reads in the order people joined rather than
    // in whatever order SQLite happens to return rows.
    .orderBy(asc(users.createdAt));
}

export async function removeHousehold(id: string): Promise<Household | undefined> {
  const [deleted] = await db.delete(households).where(eq(households.id, id)).returning();
  return deleted;
}

/** What Settings shows about the household's Anthropic credential. Never the key. */
export interface PublicHouseholdLlm {
  /** False means every AI feature is producing deterministic offline output. */
  keySet: boolean;
  /** Last four characters, for recognising which key is installed. */
  keyHint: string | null;
  /** The member paying for the household's usage. */
  setBy: string | null;
  setAt: Date | null;
  /** Resolved, so the client never has to know the default. */
  model: AnthropicModelId;
}

export interface PublicHousehold {
  id: string;
  name: string;
  joinCode: string;
  createdAt: Date;
  llm: PublicHouseholdLlm;
}

/**
 * The only safe way to put a household on the wire.
 *
 * `households` now holds an API key, so hand-picking fields at each of the five
 * call sites is one forgotten `c.json(household)` away from shipping a live
 * credential to the browser. This is the `toPublicUser` of households and every
 * route must go through it.
 */
export function toPublicHousehold(household: Household): PublicHousehold {
  const key = household.anthropicApiKey;
  return {
    id: household.id,
    name: household.name,
    joinCode: household.joinCode,
    createdAt: household.createdAt,
    llm: {
      keySet: Boolean(key),
      keyHint: key ? key.slice(-4) : null,
      setBy: household.anthropicApiKeySetBy,
      setAt: household.anthropicApiKeySetAt,
      model: household.anthropicModel || DEFAULT_ANTHROPIC_MODEL,
    },
  };
}

/**
 * Installs the household's Anthropic key and records who supplied it.
 *
 * `setBy` is the billing relationship made explicit: that member's account pays
 * for every LLM call the household makes until the key is replaced.
 */
export async function setHouseholdAnthropicKey(
  householdId: string,
  apiKey: string,
  setBy: string
): Promise<Household | undefined> {
  const now = new Date();
  const [updated] = await db
    .update(households)
    .set({
      anthropicApiKey: apiKey,
      anthropicApiKeySetBy: setBy,
      anthropicApiKeySetAt: now,
      updatedAt: now,
    })
    .where(eq(households.id, householdId))
    .returning();
  return updated;
}

/**
 * Removes the key and everything identifying its owner. Called from Settings and
 * whenever the member who set it leaves, so nobody keeps spending a key they no
 * longer control. The household drops to offline output until someone adds one.
 */
export async function clearHouseholdAnthropicKey(
  householdId: string
): Promise<Household | undefined> {
  const [updated] = await db
    .update(households)
    .set({
      anthropicApiKey: null,
      anthropicApiKeySetBy: null,
      anthropicApiKeySetAt: null,
      updatedAt: new Date(),
    })
    .where(eq(households.id, householdId))
    .returning();
  return updated;
}

export async function setHouseholdAnthropicModel(
  householdId: string,
  model: AnthropicModelId
): Promise<Household | undefined> {
  const [updated] = await db
    .update(households)
    .set({ anthropicModel: model, updatedAt: new Date() })
    .where(eq(households.id, householdId))
    .returning();
  return updated;
}
