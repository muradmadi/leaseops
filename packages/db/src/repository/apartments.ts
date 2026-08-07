import { eq, desc, inArray } from 'drizzle-orm';
import { db } from '../client';
import { apartments, type Apartment, type NewApartment } from '../schema/apartments';

/**
 * Retrieves a single apartment listing by its unique database ID.
 */
export async function findApartmentById(id: string): Promise<Apartment | undefined> {
  const [apartment] = await db.select().from(apartments).where(eq(apartments.id, id));
  return apartment;
}

/**
 * Retrieves a single apartment listing by its unique listing URL.
 */
export async function findApartmentByUrl(url: string): Promise<Apartment | undefined> {
  const [apartment] = await db.select().from(apartments).where(eq(apartments.url, url));
  return apartment;
}

/**
 * Retrieves multiple apartment listings efficiently in a single query using inArray().
 */
export async function findManyApartmentsByIds(ids: string[]): Promise<Apartment[]> {
  if (ids.length === 0) return [];
  return db.select().from(apartments).where(inArray(apartments.id, ids));
}

/**
 * Retrieves all apartment listings, optionally filtered by pipeline status,
 * ordered by creation date descending (utilizing the createdAt database index).
 */
export async function listApartments(status?: Apartment['status']): Promise<Apartment[]> {
  if (status) {
    return db
      .select()
      .from(apartments)
      .where(eq(apartments.status, status))
      .orderBy(desc(apartments.createdAt));
  }
  return db.select().from(apartments).orderBy(desc(apartments.createdAt));
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
 * Idempotently creates or updates an apartment listing based on URL unique constraint,
 * as mandated by GEMINI.md Section 5 repository query patterns.
 */
export async function upsertScrapedApartment(data: NewApartment): Promise<Apartment> {
  const [apartment] = await db
    .insert(apartments)
    .values(data)
    .onConflictDoUpdate({
      target: apartments.url,
      set: {
        title: data.title,
        price: data.price,
        currency: data.currency,
        status: data.status,
        mcdaScore: data.mcdaScore,
        featureScores: data.featureScores,
        roomScores: data.roomScores,
        rawHtml: data.rawHtml,
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
