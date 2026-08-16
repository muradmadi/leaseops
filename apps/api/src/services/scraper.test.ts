import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import {
  createApartment,
  findApartmentByIdUnscoped,
  findMessagesByApartmentId,
  upsertProfile,
} from '@leaseops/db';
import { processListingAsync, buildListingFromInput } from './scraper';
import { createTestAccount, type TestAccount } from '../test-support';

describe('Scraping & Enrichment Pipeline', () => {
  let account: TestAccount;

  // The budget ceiling is pinned by this suite's own household profile. It used
  // to come from whichever profile the database returned first, so these tests
  // failed whenever the real user's `maxRent` happened to sit below the mock
  // listing's 1350 — a failure that had nothing to do with the pipeline.
  beforeAll(async () => {
    account = await createTestAccount('scraper');
    const now = new Date();
    await upsertProfile({
      id: crypto.randomUUID(),
      householdId: account.householdId,
      targetLocation: 'Madrid',
      targetLanguage: 'Spanish',
      autoDraftMessages: true,
      currency: 'EUR',
      idealRent: 1400,
      maxRent: 2000,
      // Scoring only considers features weighted >= 4, and `deriveSacrifices`
      // only names shortfalls at that weight too, so an empty map would leave
      // every listing with a score of 0 and no compromise to report.
      spaceRequirements: {},
      featureWeights: {
        totalSqFt: 4,
        naturalLight: 5,
        elevator: 5,
        soundproofing: 4,
        dishwasher: 4,
        heating: 4,
      },
      tenantPersona: '',
      createdAt: now,
      updatedAt: now,
    });
  });

  // Deleting the household cascades to its apartments and their messages.
  afterAll(async () => {
    await account.cleanup();
  });

  async function ingest(overrides: { price?: number; featureRatings?: Record<string, number> } = {}) {
    const now = new Date();
    const id = crypto.randomUUID();
    const price = overrides.price ?? 1300;

    // Listings are entered by hand now, so the fixture is a filled-in form rather
    // than a mocked scrape. Nothing here touches the network.
    const listing = buildListingFromInput({
      title: 'Pipeline Test Listing',
      description: 'Estudio de 34 m2 en el centro, exterior, sin ascensor.',
      price,
      currency: 'EUR',
      floorSizeSqm: 34,
      totalRooms: 1,
      bathrooms: 1,
    });

    const created = await createApartment({
      id,
      householdId: account.householdId,
      url: `manual:${id}`,
      title: listing.title,
      price,
      currency: 'EUR',
      status: 'UNPROCESSED',
      extractedData: listing,
      createdAt: now,
      updatedAt: now,
    });

    await processListingAsync(created.id, account.householdId, listing, overrides.featureRatings);

    const record = await findApartmentByIdUnscoped(created.id);
    expect(record).toBeDefined();
    return record!;
  }

  it('exports processListingAsync as an asynchronous function', () => {
    expect(typeof processListingAsync).toBe('function');
  });

  it('completes a successful run without falling through to ERROR', async () => {
    const record = await ingest();

    // Regression guard: the pipeline previously threw a ReferenceError after a
    // successful extraction, so every listing landed on ERROR.
    expect(record.status).not.toBe('ERROR');
    expect(['QUALIFIED', 'DISQUALIFIED']).toContain(record.status);
  });

  it('persists the score and evaluations it computed, not just the status', async () => {
    const record = await ingest();

    expect(typeof record.mcdaScore).toBe('number');
    expect(record.mcdaScore).toBeGreaterThan(0);

    const scores = record.featureScores as any;
    expect(scores).toBeTruthy();
    expect(Array.isArray(scores.evaluations)).toBe(true);
    expect(scores.result).toBeTruthy();
    expect(scores.result.totalScore).toBe(record.mcdaScore);
  });

  it('stores the details that were entered', async () => {
    const record = await ingest();

    const ext = record.extractedData as any;
    expect(ext).toBeTruthy();
    expect(ext.title).toBe('Pipeline Test Listing');
    expect(ext.description).toContain('Estudio');
    expect(ext.unitMetrics.floorSizeSqm).toBe(34);
  });

  it('leaves unstated details null rather than inventing a value', async () => {
    // A blank field means "not stated". Defaulting a bathroom count to 1 would put
    // a fact into the scoring data that nobody supplied.
    const listing = buildListingFromInput({ title: 'Sparse', price: 1000 });
    expect(listing.unitMetrics.bathrooms).toBeNull();
    expect(listing.unitMetrics.floorSizeSqm).toBeNull();
    expect(listing.location.city).toBeNull();
    expect(listing.description).toBe('');
  });

  it('honours user-supplied feature ratings over assumed defaults', async () => {
    const record = await ingest({ featureRatings: { soundproofing: 1 } });

    const scores = record.featureScores as any;
    const soundproofing = scores.evaluations.find((e: any) => e.featureId === 'soundproofing');
    expect(soundproofing).toBeDefined();
    expect(soundproofing.rating).toBe(1);
  });

  it('scores against the price that was entered', async () => {
    // With manual entry the typed price is the only price, so the budget check
    // must use it directly. The suite's household ceiling is 2000.
    const record = await ingest({ price: 9000 });

    expect(record.price).toBe(9000);
    expect((record.featureScores as any).result.exceedsBudget).toBe(true);
    expect(record.status).toBe('DISQUALIFIED');
  });

  it('stays within budget for a listing under the ceiling', async () => {
    const record = await ingest({ price: 1300 });
    expect((record.featureScores as any).result.exceedsBudget).toBe(false);
  });

  it('attaches a data-derived compromise summary to listings that fall short', async () => {
    // Falls short on the user's own ratings — the only thing that moves a score
    // now that nothing is inferred from the listing text.
    const record = await ingest({ featureRatings: { soundproofing: 1, elevator: 1 } });
    const scores = record.featureScores as any;

    expect(record.status).toBe('DISQUALIFIED');
    expect(scores.compromise).toBeTruthy();
    expect(scores.compromise.summary.length).toBeGreaterThan(0);

    // Every sacrifice must trace back to a real shortfall, never generic filler.
    expect(scores.compromise.sacrifices.some((s: string) => s.includes('Soundproofing'))).toBe(true);
  });

  it('auto-drafts outreach for a lead that qualifies at ingestion', async () => {
    const record = await ingest({
      featureRatings: {
        elevator: 5, soundproofing: 5, balcony: 5, dishwasher: 5, furnishedStatus: 5,
        totalSqFt: 5, naturalLight: 5, closetSpace: 5, heating: 5, washer: 5, airConditioning: 5,
      },
    });
    expect(record.status).toBe('QUALIFIED');

    // A greenlit lead should arrive with its outreach message already drafted,
    // rather than waiting for the user to press a button.
    const messages = await findMessagesByApartmentId(record.id);
    expect(messages.length).toBeGreaterThan(0);
    const outreach = messages.find((m) => (m.metadata as any)?.kind === 'outreach');
    expect(outreach).toBeDefined();
    expect(outreach!.sender).toBe('ai_suggestion');
    expect(outreach!.text.length).toBeGreaterThan(0);
  });

  it('leaves a disqualified listing without an outreach draft', async () => {
    const record = await ingest({ featureRatings: { soundproofing: 1, elevator: 1 } });
    expect(record.status).toBe('DISQUALIFIED');
    expect(await findMessagesByApartmentId(record.id)).toHaveLength(0);
  });

  it('omits the compromise summary from a qualifying listing', async () => {
    const record = await ingest({
      featureRatings: {
        elevator: 5, soundproofing: 5, balcony: 5, dishwasher: 5, furnishedStatus: 5,
        totalSqFt: 5, naturalLight: 5, closetSpace: 5, heating: 5, washer: 5, airConditioning: 5,
      },
    });

    expect(record.status).toBe('QUALIFIED');
    expect((record.featureScores as any).compromise).toBeUndefined();
    // A qualified lead gets the AI review that disqualified ones deliberately skip.
    expect((record.extractedData as any).aiReview).toBeTruthy();
  });
});
