import { eq, and, desc, inArray, isNull, isNotNull } from 'drizzle-orm';
import { db } from '../client';
import { apartments, type Apartment, type NewApartment } from '../schema/apartments';

/**
 * Retrieves an apartment by ID **without checking who owns it**.
 *
 * Only for background work that already holds a trusted id — the scraper and the
 * post-qualification chain, which are handed an id by the pipeline that created
 * it. Route handlers must never call this: use `findApartmentForHousehold` so one
 * household cannot read another's listing by guessing a UUID.
 */
export async function findApartmentByIdUnscoped(id: string): Promise<Apartment | undefined> {
  const [apartment] = await db.select().from(apartments).where(eq(apartments.id, id));
  return apartment;
}

/**
 * Retrieves an apartment only if it belongs to the given household. This is the
 * ownership check for every route that takes an `:id` parameter — a miss is
 * indistinguishable from "does not exist", which is what the caller should return.
 */
export async function findApartmentForHousehold(
  id: string,
  householdId: string
): Promise<Apartment | undefined> {
  const [apartment] = await db
    .select()
    .from(apartments)
    .where(and(eq(apartments.id, id), eq(apartments.householdId, householdId)));
  return apartment;
}

/**
 * Retrieves a listing by URL within a household. URLs are unique per household,
 * not globally, so the household is part of the lookup.
 */
export async function findApartmentByUrl(
  householdId: string,
  url: string
): Promise<Apartment | undefined> {
  const [apartment] = await db
    .select()
    .from(apartments)
    .where(and(eq(apartments.householdId, householdId), eq(apartments.url, url)));
  return apartment;
}

/**
 * Retrieves multiple apartment listings efficiently in a single query using inArray().
 */
export async function findManyApartmentsByIds(householdId: string, ids: string[]): Promise<Apartment[]> {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(apartments)
    .where(and(eq(apartments.householdId, householdId), inArray(apartments.id, ids)));
}

/**
 * Retrieves a household's listings, optionally filtered by pipeline status,
 * ordered by creation date descending (utilizing the composite household index).
 */
export async function listApartments(
  householdId: string,
  status?: Apartment['status']
): Promise<Apartment[]> {
  // Archived listings are excluded everywhere by default — the dashboard should
  // show what you are working on, not everything you ever pasted in.
  const scope = status
    ? and(
        eq(apartments.householdId, householdId),
        eq(apartments.status, status),
        isNull(apartments.archivedAt)
      )
    : and(eq(apartments.householdId, householdId), isNull(apartments.archivedAt));

  return db.select().from(apartments).where(scope).orderBy(desc(apartments.createdAt));
}

/** The archive, most recently archived first. */
export async function listArchivedApartments(householdId: string): Promise<Apartment[]> {
  return db
    .select()
    .from(apartments)
    .where(and(eq(apartments.householdId, householdId), isNotNull(apartments.archivedAt)))
    .orderBy(desc(apartments.archivedAt));
}

/** Soft delete. Returns the archived record. */
export async function archiveApartment(id: string): Promise<Apartment | undefined> {
  const [updated] = await db
    .update(apartments)
    .set({ archivedAt: new Date(), isActive: false, updatedAt: new Date() })
    .where(eq(apartments.id, id))
    .returning();
  return updated;
}

/** Brings a listing back out of the archive with its score intact. */
export async function restoreApartment(id: string): Promise<Apartment | undefined> {
  const [updated] = await db
    .update(apartments)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(eq(apartments.id, id))
    .returning();
  return updated;
}

/**
 * Creates a new apartment listing and returns the created record in a single roundtrip.
 */
export async function createApartment(data: NewApartment): Promise<Apartment> {
  const [created] = await db.insert(apartments).values(data).returning();
  return created;
}

/**
 * Updates an apartment's pipeline status and timestamps, returning the modified record.
 */
/** Sets whether a listing is being pursued. */
export async function setApartmentActive(
  id: string,
  isActive: boolean
): Promise<Apartment | undefined> {
  const [updated] = await db
    .update(apartments)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(apartments.id, id))
    .returning();
  return updated;
}

/**
 * Records or clears a manual demotion out of the qualified pile. Deliberately
 * touches neither `status` nor `mcdaScore` — the measurement and the judgement
 * are separate facts and both have to survive.
 */
export async function setApartmentAside(
  id: string,
  reason: string | null
): Promise<Apartment | undefined> {
  const [updated] = await db
    .update(apartments)
    .set({ setAsideReason: reason, updatedAt: new Date() })
    .where(eq(apartments.id, id))
    .returning();
  return updated;
}

/**
 * Overrides who this listing's outreach is written as, or clears the override.
 *
 * Deliberately does not touch `createdBy`: who entered the listing is a record
 * of what happened and stays true whoever ends up writing to the landlord.
 */
export async function setApartmentOutreachAuthor(
  id: string,
  outreachAuthorId: string | null
): Promise<Apartment | undefined> {
  const [updated] = await db
    .update(apartments)
    .set({ outreachAuthorId, updatedAt: new Date() })
    .where(eq(apartments.id, id))
    .returning();
  return updated;
}

/** Moves a listing along the outreach pipeline. Never called automatically. */
export async function setApartmentStage(
  id: string,
  pipelineStage: Apartment['pipelineStage']
): Promise<Apartment | undefined> {
  const [updated] = await db
    .update(apartments)
    .set({ pipelineStage, updatedAt: new Date() })
    .where(eq(apartments.id, id))
    .returning();
  return updated;
}

export async function updateApartmentStatus(
  id: string,
  status: Apartment['status']
): Promise<Apartment | undefined> {
  const [updated] = await db
    .update(apartments)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(apartments.id, id))
    .returning();

  return updated;
}

/**
 * Updates enrichment metadata (MCDA score, feature evaluations, scraped title/price)
 * after background worker processing completes.
 */
export async function updateApartmentEnrichment(
  id: string,
  data: Partial<NewApartment>
): Promise<Apartment | undefined> {
  const [updated] = await db
    .update(apartments)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(apartments.id, id))
    .returning();

  return updated;
}

/**
 * Idempotently creates or updates a listing based on the per-household URL
 * constraint, so re-adding a URL refreshes that household's row rather than
 * colliding with another household tracking the same flat.
 */
export async function upsertScrapedApartment(data: NewApartment): Promise<Apartment> {
  const [apartment] = await db
    .insert(apartments)
    .values(data)
    .onConflictDoUpdate({
      target: [apartments.householdId, apartments.url],
      set: {
        title: data.title,
        price: data.price,
        currency: data.currency,
        status: data.status,
        mcdaScore: data.mcdaScore,
        featureScores: data.featureScores,
        roomScores: data.roomScores,
        extractedData: data.extractedData,
        updatedAt: new Date(),
      },
    })
    .returning();

  return apartment;
}

/**
 * Deletes an apartment listing from the database by ID, returning the deleted record.
 */
export async function removeApartment(id: string): Promise<Apartment | undefined> {
  const [deleted] = await db.delete(apartments).where(eq(apartments.id, id)).returning();
  return deleted;
}

/**
 * Updates an apartment's MCDA ratings and room scores, returning the modified record.
 */
export async function updateApartmentRatings(
  id: string,
  data: Partial<NewApartment>
): Promise<Apartment | undefined> {
  const [updated] = await db
    .update(apartments)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(apartments.id, id))
    .returning();

  return updated;
}
