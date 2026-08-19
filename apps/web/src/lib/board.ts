/**
 * What the dashboard shows, and in what order.
 *
 * Pure functions over the array `useApartments()` already holds. There is no
 * server-side search or sort and there should not be: a household tracks tens of
 * listings, every one of them already in memory, so a query parameter for this
 * would be a round trip to re-derive what is on screen.
 *
 * Everything here restates a stored field. A number a listing does not carry is
 * `null`, renders as nothing, and never ranks as though it had a value — an
 * estimated size would put a flat in a position on the board it did not earn.
 */
import type { Apartment, ApartmentWithThread, PipelineStage } from '@leaseops/db';

function asRecord(value: unknown): Record<string, any> {
  return typeof value === 'object' && value !== null ? (value as Record<string, any>) : {};
}

function numOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Epoch ms from whatever a timestamp column survived JSON as. Drizzle types
 * these as `Date`; they arrive over the wire as an ISO string.
 */
export function toMillis(value: unknown): number | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * The portal a listing came from, or null when there is nothing to link to.
 *
 * A listing entered by hand with no URL is stored as `manual:<id>` — a valid URL
 * with no host, which parsed to an empty string and rendered as a link icon
 * pointing at nothing.
 */
export function listingHost(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

/**
 * The listing as entered. `extractedData` is where it lives; rows written before
 * that column nested the same object under `featureScores`.
 */
function listingJson(apartment: Apartment): Record<string, any> {
  const direct = asRecord(apartment.extractedData);
  if (Object.keys(direct).length > 0) return direct;
  return asRecord(asRecord(apartment.featureScores).extractedData);
}

/** The facts two listings are compared on, pulled out of the entered JSON. */
export interface ListingFacts {
  neighborhood: string | null;
  city: string | null;
  /** "Kreuzberg, Berlin" — whichever halves exist, or null for neither. */
  location: string | null;
  areaSqm: number | null;
  rooms: number | null;
  /** Rent over floor size. Null unless both are real numbers; never estimated. */
  pricePerSqm: number | null;
}

/**
 * Reads the entered listing detail off a row.
 *
 * The fallbacks mirror `ApartmentDetailView` exactly: listings entered under an
 * earlier shape kept these fields flat, and a card that could not read them
 * would show a flat as having no size while the detail view showed 68 m².
 */
export function readListingFacts(apartment: Apartment): ListingFacts {
  const ext = listingJson(apartment);
  const metrics = asRecord(ext.unitMetrics);
  const place = asRecord(ext.location);

  const neighborhood = textOrNull(place.neighborhood ?? ext.neighborhood);
  const city = textOrNull(place.city ?? ext.city);
  const rawArea = numOrNull(metrics.floorSizeSqm ?? ext.areaSqm ?? ext.floorSizeSqm);
  const rawRooms = numOrNull(metrics.totalRooms ?? ext.roomsTotal ?? ext.totalRooms ?? ext.bedrooms);

  // A zero is not a measurement, and dividing by it would rank a listing first.
  const areaSqm = rawArea !== null && rawArea > 0 ? rawArea : null;

  return {
    neighborhood,
    city,
    location: [neighborhood, city].filter(Boolean).join(', ') || textOrNull(ext.locationStr),
    areaSqm,
    rooms: rawRooms !== null && rawRooms > 0 ? rawRooms : null,
    pricePerSqm: areaSqm !== null && apartment.price > 0 ? apartment.price / areaSqm : null,
  };
}

export const SORT_OPTIONS = [
  { value: 'added', label: 'Recently added' },
  { value: 'score', label: 'Best match' },
  { value: 'priceAsc', label: 'Cheapest first' },
  { value: 'priceDesc', label: 'Most expensive' },
  { value: 'pricePerSqm', label: 'Best per m²' },
  { value: 'activity', label: 'Latest activity' },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]['value'];

type Ranker = (apartment: ApartmentWithThread) => number | null;

const RANKERS: Record<SortKey, { rank: Ranker; direction: 'asc' | 'desc' }> = {
  added: { rank: (a) => toMillis(a.createdAt), direction: 'desc' },
  score: { rank: (a) => a.mcdaScore, direction: 'desc' },
  priceAsc: { rank: (a) => a.price, direction: 'asc' },
  priceDesc: { rank: (a) => a.price, direction: 'desc' },
  pricePerSqm: { rank: (a) => readListingFacts(a).pricePerSqm, direction: 'asc' },
  activity: { rank: (a) => a.thread.lastSpokeAt, direction: 'desc' },
};

/**
 * A new array in the chosen order.
 *
 * A listing missing the value being sorted on goes last in **either**
 * direction: a flat with no stated size is not the best value per m², and a
 * listing nobody has written to is not the most recently active. The sort is
 * stable, so listings that tie keep the order they arrived in.
 */
export function sortListings(list: ApartmentWithThread[], key: SortKey): ApartmentWithThread[] {
  const { rank, direction } = RANKERS[key];
  return [...list].sort((a, b) => {
    const left = rank(a);
    const right = rank(b);
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return direction === 'asc' ? left - right : right - left;
  });
}

export interface BoardFilters {
  /** Free text over the title and the location, case-insensitive. */
  search: string;
  /** A folded key from `neighborhoodOptions`, or null for every neighbourhood. */
  neighborhood: string | null;
  stage: PipelineStage | null;
  /** Only the listings where the landlord spoke last. */
  waitingOnYou: boolean;
  /** Only the listings you decided to chase. */
  active: boolean;
}

export const NO_FILTERS: BoardFilters = {
  search: '',
  neighborhood: null,
  stage: null,
  waitingOnYou: false,
  active: false,
};

export function hasActiveFilters(filters: BoardFilters): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.neighborhood !== null ||
    filters.stage !== null ||
    filters.waitingOnYou ||
    filters.active
  );
}

/** The landlord spoke last, so the next move is yours. */
export function isWaitingOnYou(apartment: ApartmentWithThread): boolean {
  return apartment.thread.lastSpeaker === 'landlord';
}

/**
 * Neighbourhoods are typed by hand, so they are grouped by case and nothing
 * else. "Kreuzburg" stays its own entry beside "Kreuzberg" — a typo you can see
 * and fix, rather than a merge the app performed quietly on data it has no way
 * to verify.
 */
export function foldNeighborhood(value: string): string {
  return value.trim().toLowerCase();
}

export function matchesFilters(apartment: ApartmentWithThread, filters: BoardFilters): boolean {
  if (filters.waitingOnYou && !isWaitingOnYou(apartment)) return false;
  if (filters.active && !apartment.isActive) return false;
  if (filters.stage && apartment.pipelineStage !== filters.stage) return false;

  const facts = readListingFacts(apartment);

  // A listing with no neighbourhood entered is not in any neighbourhood, so it
  // is excluded rather than treated as matching whatever is being asked for.
  if (filters.neighborhood) {
    if (!facts.neighborhood) return false;
    if (foldNeighborhood(facts.neighborhood) !== filters.neighborhood) return false;
  }

  const query = filters.search.trim().toLowerCase();
  if (query === '') return true;

  return [apartment.title, facts.neighborhood, facts.city, facts.location].some((field) =>
    field?.toLowerCase().includes(query)
  );
}

export interface NeighborhoodOption {
  /** Folded, and what `BoardFilters.neighborhood` holds. */
  key: string;
  /** The first spelling entered, shown as it was typed. */
  label: string;
  count: number;
}

/** The neighbourhoods actually present, commonest first. */
export function neighborhoodOptions(list: Apartment[]): NeighborhoodOption[] {
  const byKey = new Map<string, NeighborhoodOption>();

  for (const apartment of list) {
    const name = readListingFacts(apartment).neighborhood;
    if (!name) continue;
    const key = foldNeighborhood(name);
    const existing = byKey.get(key);
    if (existing) existing.count += 1;
    else byKey.set(key, { key, label: name, count: 1 });
  }

  return [...byKey.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * How many listings sit at each stage. Returned as a map rather than an ordered
 * list because the stage order and its labels live in `StageControl`, which is
 * the one place they are defined for the UI.
 */
export function stageCounts(list: Apartment[]): Map<PipelineStage, number> {
  const counts = new Map<PipelineStage, number>();
  for (const apartment of list) {
    counts.set(apartment.pipelineStage, (counts.get(apartment.pipelineStage) ?? 0) + 1);
  }
  return counts;
}

/** The state of the board, in the only numbers worth acting on. */
export interface BoardCounts {
  total: number;
  waitingOnYou: number;
  active: number;
}

export function boardCounts(list: ApartmentWithThread[]): BoardCounts {
  return {
    total: list.length,
    waitingOnYou: list.filter(isWaitingOnYou).length,
    active: list.filter((apartment) => apartment.isActive).length,
  };
}
