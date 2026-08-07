import { describe, it, expect, afterAll } from 'bun:test';
import { createApartment, findApartmentById, removeApartment, findMessagesByApartmentId } from '@leaseops/db';
import { processListingAsync } from './scraper';

describe('Scraping & Enrichment Pipeline', () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    for (const id of createdIds) {
      await removeApartment(id);
    }
  });

  async function ingest(overrides: { price?: number; featureRatings?: Record<string, number> } = {}) {
    const now = new Date();
    const id = crypto.randomUUID();
    // `example-` URLs make the Scrapfly + extractor services return their mocks.
    const created = await createApartment({
      id,
      url: `https://example-real-estate.com/pipeline-${id}`,
      title: 'Pipeline Test Listing',
      price: overrides.price ?? 1300,
      currency: 'EUR',
      status: 'UNPROCESSED',
      createdAt: now,
      updatedAt: now,
    });
    createdIds.push(created.id);

    await processListingAsync(
      created.id,
      created.url,
      undefined,
      overrides.featureRatings,
      undefined,
      created.price
    );

    const record = await findApartmentById(created.id);
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

  it('stores the extracted listing data', async () => {
    const record = await ingest();

    const ext = record.extractedData as any;
    expect(ext).toBeTruthy();
    expect(typeof ext.title).toBe('string');
    expect(record.rawHtml).toContain('Mock Listing Title');
  });

  it('honours user-supplied feature ratings over assumed defaults', async () => {
    const record = await ingest({ featureRatings: { soundproofing: 1 } });

    const scores = record.featureScores as any;
    const soundproofing = scores.evaluations.find((e: any) => e.featureId === 'soundproofing');
    expect(soundproofing).toBeDefined();
    expect(soundproofing.rating).toBe(1);
  });

  it('scores against the extracted price, overriding the price entered at ingestion', async () => {
    // The mock extractor reports 1350 EUR regardless of what the user typed.
    const record = await ingest({ price: 9000 });

    expect(record.price).toBe(1350);
    // Budget evaluation must have used the extracted price, not the entered 9000
    // (the default ceiling is 1500, so 9000 would have flipped this to true).
    expect((record.featureScores as any).result.exceedsBudget).toBe(false);
  });

  it('attaches a data-derived compromise summary to listings that fall short', async () => {
    const record = await ingest({ featureRatings: { soundproofing: 1 } });
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
    const record = await ingest({ featureRatings: { soundproofing: 1 } });
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
