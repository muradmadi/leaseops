import { describe, it, expect } from 'bun:test';
import type { ApartmentWithThread } from '@leaseops/db';
import {
  boardCounts,
  foldNeighborhood,
  hasActiveFilters,
  listingHost,
  matchesFilters,
  neighborhoodOptions,
  NO_FILTERS,
  readListingFacts,
  sortListings,
  stageCounts,
} from './board';

/**
 * A listing as the dashboard receives it. Only the fields under test are worth
 * stating; the rest are the column defaults.
 */
function listing(overrides: Partial<ApartmentWithThread> = {}): ApartmentWithThread {
  return {
    id: 'a1',
    householdId: 'h1',
    createdBy: null,
    outreachAuthorId: null,
    url: 'https://www.immoscout24.de/expose/1',
    title: 'Bright two-room flat',
    price: 1200,
    currency: 'EUR',
    status: 'QUALIFIED',
    mcdaScore: 80,
    isActive: false,
    setAsideReason: null,
    pipelineStage: 'NOT_CONTACTED',
    featureScores: null,
    roomScores: null,
    extractedData: null,
    archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    thread: { exchanged: 0, lastSpeaker: null, lastSpokeAt: null, awaitingYou: 0, unsent: 0, undated: 0 },
    ...overrides,
  } as ApartmentWithThread;
}

describe('readListingFacts', () => {
  it('reads the shape listings are entered in', () => {
    const facts = readListingFacts(
      listing({
        price: 1360,
        extractedData: {
          unitMetrics: { floorSizeSqm: 68, totalRooms: 3, bathrooms: 1, floorLevel: '2' },
          location: { neighborhood: 'Kreuzberg', city: 'Berlin' },
        },
      })
    );

    expect(facts.areaSqm).toBe(68);
    expect(facts.rooms).toBe(3);
    expect(facts.location).toBe('Kreuzberg, Berlin');
    expect(facts.pricePerSqm).toBe(20);
  });

  it('reads the flat shape older listings were entered in', () => {
    const facts = readListingFacts(
      listing({ extractedData: { areaSqm: 50, totalRooms: 2, neighborhood: 'Neukölln' } })
    );

    expect(facts.areaSqm).toBe(50);
    expect(facts.rooms).toBe(2);
    expect(facts.neighborhood).toBe('Neukölln');
  });

  it('reads a listing whose detail is still nested under featureScores', () => {
    const facts = readListingFacts(
      listing({
        extractedData: null,
        featureScores: { extractedData: { location: { city: 'Hamburg' } } },
      })
    );

    expect(facts.city).toBe('Hamburg');
    expect(facts.location).toBe('Hamburg');
  });

  it('reports a missing fact as missing rather than as a number', () => {
    const facts = readListingFacts(listing({ extractedData: {} }));

    expect(facts.areaSqm).toBeNull();
    expect(facts.rooms).toBeNull();
    expect(facts.location).toBeNull();
    expect(facts.pricePerSqm).toBeNull();
  });

  it('refuses to divide by a zero floor size', () => {
    const facts = readListingFacts(listing({ extractedData: { unitMetrics: { floorSizeSqm: 0 } } }));

    expect(facts.areaSqm).toBeNull();
    expect(facts.pricePerSqm).toBeNull();
  });
});

describe('listingHost', () => {
  it('names the portal a listing came from', () => {
    expect(listingHost('https://www.immobilienscout24.de/expose/1')).toBe('www.immobilienscout24.de');
  });

  it('has no host for a listing entered by hand', () => {
    // Stored as `manual:<id>`, which parses fine and has an empty hostname —
    // the card used to render a link icon pointing at nothing.
    expect(listingHost('manual:0193f2a1')).toBeNull();
  });

  it('has no host for something that is not a URL', () => {
    expect(listingHost('not a url')).toBeNull();
  });
});

describe('sortListings', () => {
  const cheapSmall = listing({ id: 'cheap', price: 900, mcdaScore: 60, extractedData: { unitMetrics: { floorSizeSqm: 30 } } });
  const dearLarge = listing({ id: 'dear', price: 1800, mcdaScore: 90, extractedData: { unitMetrics: { floorSizeSqm: 120 } } });
  const unmeasured = listing({ id: 'unmeasured', price: 1000, mcdaScore: null });

  it('puts the best match first', () => {
    expect(sortListings([cheapSmall, dearLarge, unmeasured], 'score').map((a) => a.id)).toEqual([
      'dear',
      'cheap',
      'unmeasured',
    ]);
  });

  it('ranks by rent per square metre, not by rent', () => {
    // 900/30 = 30, 1800/120 = 15 — the expensive flat is the better value.
    expect(sortListings([cheapSmall, dearLarge], 'pricePerSqm').map((a) => a.id)).toEqual(['dear', 'cheap']);
  });

  it('sorts an unmeasured listing last whichever way the order runs', () => {
    expect(sortListings([unmeasured, cheapSmall], 'priceAsc').map((a) => a.id)).toEqual(['cheap', 'unmeasured']);
    expect(sortListings([unmeasured, dearLarge], 'priceDesc').map((a) => a.id)).toEqual(['dear', 'unmeasured']);
  });

  it('leaves the input untouched', () => {
    const input = [cheapSmall, dearLarge];
    sortListings(input, 'score');
    expect(input.map((a) => a.id)).toEqual(['cheap', 'dear']);
  });
});

describe('matchesFilters', () => {
  const kreuzberg = listing({
    title: 'Altbau with a balcony',
    extractedData: { location: { neighborhood: 'Kreuzberg', city: 'Berlin' } },
  });
  const nowhere = listing({ title: 'Flat with no address entered' });

  it('searches the neighbourhood as well as the title', () => {
    expect(matchesFilters(kreuzberg, { ...NO_FILTERS, search: 'kreuz' })).toBe(true);
    expect(matchesFilters(nowhere, { ...NO_FILTERS, search: 'kreuz' })).toBe(false);
  });

  it('searches the title case-insensitively', () => {
    expect(matchesFilters(kreuzberg, { ...NO_FILTERS, search: 'ALTBAU' })).toBe(true);
  });

  it('excludes a listing with no neighbourhood from a neighbourhood filter', () => {
    expect(matchesFilters(kreuzberg, { ...NO_FILTERS, neighborhood: 'kreuzberg' })).toBe(true);
    expect(matchesFilters(nowhere, { ...NO_FILTERS, neighborhood: 'kreuzberg' })).toBe(false);
  });

  it('finds the listings where the landlord spoke last', () => {
    const theirTurn = listing({ thread: { ...listing().thread, exchanged: 2, lastSpeaker: 'landlord', awaitingYou: 1 } });
    expect(matchesFilters(theirTurn, { ...NO_FILTERS, waitingOnYou: true })).toBe(true);
    expect(matchesFilters(kreuzberg, { ...NO_FILTERS, waitingOnYou: true })).toBe(false);
  });

  it('filters on the stage you declared', () => {
    const booked = listing({ pipelineStage: 'VIEWING_BOOKED' });
    expect(matchesFilters(booked, { ...NO_FILTERS, stage: 'VIEWING_BOOKED' })).toBe(true);
    expect(matchesFilters(booked, { ...NO_FILTERS, stage: 'OUTREACH_SENT' })).toBe(false);
  });

  it('passes everything when nothing is set', () => {
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
    expect(matchesFilters(nowhere, NO_FILTERS)).toBe(true);
  });
});

describe('neighborhoodOptions', () => {
  it('groups by case and keeps the spelling first entered', () => {
    const options = neighborhoodOptions([
      listing({ id: '1', extractedData: { location: { neighborhood: 'Kreuzberg' } } }),
      listing({ id: '2', extractedData: { location: { neighborhood: 'kreuzberg ' } } }),
      listing({ id: '3', extractedData: { location: { neighborhood: 'Wedding' } } }),
    ]);

    expect(options).toEqual([
      { key: 'kreuzberg', label: 'Kreuzberg', count: 2 },
      { key: 'wedding', label: 'Wedding', count: 1 },
    ]);
  });

  it('does not merge a near miss into its neighbour', () => {
    const options = neighborhoodOptions([
      listing({ id: '1', extractedData: { location: { neighborhood: 'Kreuzberg' } } }),
      listing({ id: '2', extractedData: { location: { neighborhood: 'Kreuzburg' } } }),
    ]);

    expect(options.map((o) => o.key)).toEqual(['kreuzberg', 'kreuzburg']);
  });

  it('omits listings with no neighbourhood entered', () => {
    expect(neighborhoodOptions([listing()])).toEqual([]);
  });
});

describe('boardCounts and stageCounts', () => {
  it('counts what is worth acting on', () => {
    const board = [
      listing({ id: '1', isActive: true, thread: { ...listing().thread, exchanged: 1, lastSpeaker: 'landlord' } }),
      listing({ id: '2', isActive: true, pipelineStage: 'OUTREACH_SENT' }),
      listing({ id: '3' }),
    ];

    expect(boardCounts(board)).toEqual({ total: 3, waitingOnYou: 1, active: 2 });
    expect(stageCounts(board).get('NOT_CONTACTED')).toBe(2);
    expect(stageCounts(board).get('OUTREACH_SENT')).toBe(1);
    expect(stageCounts(board).get('WON')).toBeUndefined();
  });
});

describe('foldNeighborhood', () => {
  it('is the key the filter is held as', () => {
    expect(foldNeighborhood('  Prenzlauer Berg ')).toBe('prenzlauer berg');
  });
});
