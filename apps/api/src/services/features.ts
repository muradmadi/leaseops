/**
 * Canonical feature catalogue and MCDA evaluation builder for LeaseOps.
 *
 * Single source of truth for feature ids -> display names. Both the ingestion
 * pipeline (scraper) and the post-viewing ratings route build their evaluation
 * sets from here so that a listing is scored identically no matter which path
 * produced the score.
 */
import type { FeatureEvaluation } from './mcda';

/** Feature ids mirror `apps/web/src/lib/preferenceMatrixData.ts`. */
export const FEATURE_NAMES: Record<string, string> = {
  // A - Space & Light
  naturalLight: 'Natural Light',
  exteriorFacing: 'Exterior-Facing Windows',
  balcony: 'Balcony or Terrace',
  closetSpace: 'Built-In Wardrobes',
  storageRoom: 'Storage Room or Cellar',
  // B - Transport & Access
  metroProximity: 'Metro or Tram Nearby',
  busProximity: 'Bus Connections',
  centreCommute: 'Commute to the Centre',
  walkability: 'Walkable Daily Errands',
  cyclingAccess: 'Cycling Infrastructure',
  // C - Neighbourhood & Daily Life
  groceryProximity: 'Supermarket Nearby',
  freshMarket: 'Fresh Food Market',
  cafesRestaurants: 'Cafés and Restaurants',
  greenSpace: 'Parks and Green Space',
  streetQuiet: 'Quiet Street',
  neighbourhoodSafety: 'Feeling Safe at Night',
  // D - Kitchen & Laundry
  oven: 'Full-Size Oven',
  hobType: 'Hob Type & Quality',
  extractorHood: 'Extractor Hood',
  refrigerator: 'Full-Size Fridge',
  freezerCapacity: 'Freezer Capacity',
  sinkSize: 'Sink Size',
  counterSpace: 'Worktop Space',
  kitchenStorage: 'Kitchen Cupboards',
  dishwasher: 'Dishwasher',
  washer: 'Washing Machine',
  dryer: 'Dryer or Drying Space',
  // E - Bathroom
  showerQuality: 'Shower Size & Quality',
  showerPressure: 'Water Pressure',
  hotWaterSystem: 'Hot Water Supply',
  bathtub: 'Bathtub',
  bathroomVentilation: 'Bathroom Window or Extraction',
  bidet: 'Bidet',
  // F - Comfort, Climate & Running Costs
  heating: 'Heating Quality',
  airConditioning: 'Air Conditioning',
  doubleGlazing: 'Double-Glazed Windows',
  soundproofing: 'Soundproofing',
  energyRating: 'Energy Rating & Bills',
  ventilation: 'Cross-Ventilation & Damp',
  highSpeedInternet: 'Fibre Internet',
  // G - Building, Rules & Condition
  elevator: 'Elevator Access',
  buildingSecurity: 'Secure Entry',
  bikeStorage: 'Bike Storage',
  secureParking: 'Parking Space',
  communalOutdoor: 'Communal Pool or Courtyard',
  petFriendliness: 'Pets Allowed',
  furnishedStatus: 'Furnished',
  condition: 'Condition & Renovation',

  // Retired from the matrix but kept so profiles and listings saved before the
  // European rework still resolve a display name instead of showing a raw id.
  totalSqFt: 'Total Floor Area',
  bedrooms: 'Number of Bedrooms',
  bathrooms: 'Number of Bathrooms',
  openFloorPlan: 'Open Floor Plan',
  ovenStove: 'Oven & Stovetop Quality',
  kitchenEquipment: 'Equipped Kitchen',
  microwave: 'Microwave Included',
  packageReceiving: 'Package Receiving',
  gymOrPool: 'On-Site Gym or Pool',
  modernFinishes: 'Modern/Updated Finishes',
  hardwoodFlooring: 'Hardwood Flooring',
};

export const DEFAULT_FEATURE_WEIGHT = 3;

/** Weight at or above which a feature participates in automated scoring. */
export const SCORED_WEIGHT_THRESHOLD = 4;

export function featureDisplayName(featureId: string): string {
  return FEATURE_NAMES[featureId] || featureId;
}

/**
 * Builds the MCDA evaluation set for a listing.
 *
 * Precedence for each feature's rating:
 *   1. An explicit rating supplied by the user (add-listing modal or post-viewing).
 *   2. `neutralRating` — used only when they did not rate it.
 *
 * There used to be a middle step that derived ratings from amenities ticked on
 * the listing form. It was removed because it could never apply: the modal asks
 * the user to rate every feature weighted 4 or 5, and an explicit rating always
 * won. It covered five features out of the catalogue and only on a card the user
 * skipped, which made scoring inconsistent rather than better informed.
 *
 * `neutralRating` defaults to 3 — the midpoint, meaning "unknown", not "fine".
 * It used to be 4, which read as "assume it passes until we learn otherwise". That
 * made a listing nobody had assessed score 80% and qualify: silence looked like a
 * good lead. At 3, an unrated listing lands around 60% and stays out of the
 * qualified bucket until someone actually rates it.
 *
 * Only features the user weighted at or above `SCORED_WEIGHT_THRESHOLD` are
 * scored, plus any feature the user explicitly rated.
 */
export function buildFeatureEvaluations(options: {
  featureWeights?: Record<string, unknown> | null;
  featureRatings?: Record<string, number> | null;
  neutralRating?: number;
}): FeatureEvaluation[] {
  const { featureWeights, featureRatings, neutralRating = 3 } = options;
  const weights = (featureWeights || {}) as Record<string, unknown>;
  const ratings = featureRatings || {};
  const evaluations: FeatureEvaluation[] = [];

  for (const featureId of Object.keys(FEATURE_NAMES)) {
    const rawWeight = weights[featureId];
    const weight = rawWeight === undefined || rawWeight === null ? DEFAULT_FEATURE_WEIGHT : Number(rawWeight);
    if (!Number.isFinite(weight)) continue;

    const hasUserRating = ratings[featureId] !== undefined && Number.isFinite(Number(ratings[featureId]));
    if (weight < SCORED_WEIGHT_THRESHOLD && !hasUserRating) continue;

    let rating: number;
    let source: string;
    if (hasUserRating) {
      rating = Number(ratings[featureId]);
      source = 'Rated by you.';
    } else {
      rating = neutralRating;
      source = 'Not rated yet — assumed neutral pending viewing.';
    }

    evaluations.push({
      featureId,
      name: featureDisplayName(featureId),
      weight,
      rating: Math.max(0, Math.min(5, rating)),
      notes: source,
    });
  }

  return evaluations;
}

// ---------------------------------------------------------------------------
// Derived criteria
//
// Figures the user gave as numbers rather than 1-5 weights — floor area, room
// counts — and the room-quality impression from the add-listing walkthrough.
// They are turned into ordinary `FeatureEvaluation`s so the scoring engine needs
// no special cases: a size below the stated minimum lands under `CRITICAL_FLOOR`
// and the existing non-negotiable penalty fires on it unchanged.
// ---------------------------------------------------------------------------

/** Weight for size criteria, so falling under a minimum penalises like a non-negotiable. */
export const SPACE_WEIGHT = 5;

/**
 * Room quality is weighted below the penalty threshold on purpose. It is a
 * subjective impression formed from photos or a viewing, not a stated requirement,
 * and an unflattering impression should drag a score down without gutting it the
 * way a declared non-negotiable does.
 */
export const ROOM_QUALITY_WEIGHT = 4;

/**
 * How a measurement below a stated minimum rates.
 *
 * Squared rather than linear, because a minimum is a floor and shortfalls past it
 * get bad fast. Linear decay made 25 m² against a 40 m² minimum rate 1.9 — a
 * middling shortfall — and an otherwise perfect flat still qualified while being
 * 15 m² under a line the user drew themselves. Squaring gives 1.2, which the
 * penalty turns into a drop the listing cannot survive, while a near miss (39
 * against 40) stays the near miss it is.
 */
function belowMinimumRating(actual: number, minimum: number): number {
  if (actual <= 0) return 0;
  const ratio = actual / minimum;
  return Math.max(0, 3 * ratio * ratio);
}

/**
 * Rates floor area against the range the user set.
 *
 * `3` is the hinge: it is exactly `CRITICAL_FLOOR`, so meeting your minimum is a
 * pass with no penalty, and anything under it slides into penalty territory in
 * proportion to how far short it falls.
 *
 *   below minimum   0 … 3   penalised, severity grows as it shrinks
 *   minimum         3       acceptable, no penalty
 *   maximum         5       the size you actually want
 *   above maximum   5 … 3   drifts back down, never penalised
 *
 * The taper above the maximum exists because that is what a maximum means here —
 * more space is more to heat, clean and furnish. It is capped at 3 rather than
 * falling further: a flat larger than you wanted is not a failure, just not ideal.
 */
export function rateFloorArea(
  sqm: number | null | undefined,
  min?: number | null,
  max?: number | null
): number | null {
  if (sqm === null || sqm === undefined || !Number.isFinite(sqm)) return null;
  if (!min && !max) return null;

  if (min && sqm < min) return belowMinimumRating(sqm, min);
  if (!max) return 5;
  if (!min) return sqm <= max ? 5 : Math.max(3, 5 - (2 * (sqm - max)) / max);

  const span = max - min;
  if (span <= 0) return sqm >= min ? 5 : 3;
  if (sqm <= max) return 3 + (2 * (sqm - min)) / span;
  return Math.max(3, 5 - (2 * (sqm - max)) / span);
}

/**
 * Rates a room count against a stated minimum and ideal. Same hinge at 3: the
 * minimum is a pass, the ideal is full marks, below the minimum penalises.
 *
 * Unlike floor area there is no taper above the ideal — an extra bedroom is not
 * the burden that fifty extra square metres are.
 */
export function rateRoomCount(
  count: number | null | undefined,
  minimum?: number | null,
  ideal?: number | null
): number | null {
  if (count === null || count === undefined || !Number.isFinite(count)) return null;
  if (!minimum && !ideal) return null;

  if (minimum && count < minimum) return belowMinimumRating(count, minimum);
  if (!ideal || count >= ideal) return 5;
  if (!minimum) return 5;

  const span = ideal - minimum;
  if (span <= 0) return 5;
  return 3 + (2 * (count - minimum)) / span;
}

export interface SpaceRequirementsInput {
  floorSizeSqm?: { min?: number | null; max?: number | null };
  bedrooms?: { minimum?: number | null; ideal?: number | null };
  bathrooms?: { minimum?: number | null; ideal?: number | null };
}

export interface UnitMetricsInput {
  floorSizeSqm?: number | null;
  totalRooms?: number | null;
  bathrooms?: number | null;
}

/**
 * Builds evaluations for the size figures. Returns an empty list when the user set
 * no requirements or the listing states no measurements — nothing is scored
 * against a target that does not exist.
 */
export function buildSpaceEvaluations(
  requirements?: SpaceRequirementsInput | null,
  metrics?: UnitMetricsInput | null
): FeatureEvaluation[] {
  if (!requirements || !metrics) return [];
  const evaluations: FeatureEvaluation[] = [];

  const area = rateFloorArea(metrics.floorSizeSqm, requirements.floorSizeSqm?.min, requirements.floorSizeSqm?.max);
  if (area !== null) {
    evaluations.push({
      featureId: '__floorArea',
      name: 'Floor Area',
      weight: SPACE_WEIGHT,
      rating: Math.max(0, Math.min(5, area)),
      notes: `${metrics.floorSizeSqm} m² against your range.`,
    });
  }

  const beds = rateRoomCount(metrics.totalRooms, requirements.bedrooms?.minimum, requirements.bedrooms?.ideal);
  if (beds !== null) {
    evaluations.push({
      featureId: '__bedrooms',
      name: 'Bedrooms',
      weight: SPACE_WEIGHT,
      rating: Math.max(0, Math.min(5, beds)),
      notes: `${metrics.totalRooms} against your minimum and ideal.`,
    });
  }

  const baths = rateRoomCount(metrics.bathrooms, requirements.bathrooms?.minimum, requirements.bathrooms?.ideal);
  if (baths !== null) {
    evaluations.push({
      featureId: '__bathrooms',
      name: 'Bathrooms',
      weight: SPACE_WEIGHT,
      rating: Math.max(0, Math.min(5, baths)),
      notes: `${metrics.bathrooms} against your minimum and ideal.`,
    });
  }

  return evaluations;
}

/**
 * Folds the per-room impressions into one criterion.
 *
 * Averaged rather than scored room by room: the user never weighted the rooms
 * against each other, so five separate criteria would quietly let a decorative
 * impression outvote the eighteen features they did weight.
 */
export function buildRoomQualityEvaluation(
  roomScores?: Record<string, number> | null
): FeatureEvaluation | null {
  if (!roomScores) return null;

  const scores = Object.values(roomScores)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (scores.length === 0) return null;

  const average = scores.reduce((sum, v) => sum + v, 0) / scores.length;

  return {
    featureId: '__roomQuality',
    name: 'Room Quality',
    weight: ROOM_QUALITY_WEIGHT,
    rating: Math.max(0, Math.min(5, average)),
    notes: `Average of ${scores.length} room ${scores.length === 1 ? 'rating' : 'ratings'}.`,
  };
}
