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
  totalSqFt: 'Total Square Footage',
  bedrooms: 'Number of Bedrooms',
  bathrooms: 'Number of Bathrooms',
  naturalLight: 'Natural Light',
  balcony: 'Balcony or Terrace',
  closetSpace: 'Closet & Storage Space',
  openFloorPlan: 'Open Floor Plan',
  refrigerator: 'Full-Size Refrigerator',
  dishwasher: 'Dishwasher',
  ovenStove: 'Oven & Stovetop Quality',
  counterSpace: 'Counter Space',
  microwave: 'Microwave Included',
  washer: 'In-Unit Washer',
  dryer: 'In-Unit Dryer',
  bathtub: 'Bathtub',
  showerPressure: 'Modern Shower/Water Pressure',
  ventilation: 'Window/Ventilation',
  airConditioning: 'Air Conditioning',
  heating: 'Heating Quality',
  highSpeedInternet: 'High-Speed Internet Readiness',
  soundproofing: 'Soundproofing',
  doubleGlazing: 'Double-Glazed Windows',
  elevator: 'Elevator Access',
  secureParking: 'Secure Parking',
  buildingSecurity: 'Building Security',
  packageReceiving: 'Package Receiving',
  petFriendliness: 'Pet Friendliness',
  gymOrPool: 'On-Site Gym or Pool',
  bikeStorage: 'Bike Storage',
  modernFinishes: 'Modern/Updated Finishes',
  furnishedStatus: 'Furnished Status',
  hardwoodFlooring: 'Hardwood Flooring',
};

export const DEFAULT_FEATURE_WEIGHT = 3;

/** Weight at or above which a feature participates in automated scoring. */
export const SCORED_WEIGHT_THRESHOLD = 4;

export function featureDisplayName(featureId: string): string {
  return FEATURE_NAMES[featureId] || featureId;
}

/**
 * Maps extracted listing data onto a 0-5 rating, but only for amenities the
 * listing states outright as present or absent.
 *
 * Deliberately excludes size/room-count heuristics: whether 45 m² or one bedroom
 * is "good" is a judgement about the user's needs, and that judgement is exactly
 * what their own rating expresses. Returns `undefined` when the listing gives no
 * explicit evidence, so the caller falls back instead of guessing.
 */
function ratingFromExtractedData(featureId: string, extractedData: any): number | undefined {
  if (!extractedData) return undefined;
  const feats = extractedData.features || {};

  switch (featureId) {
    case 'elevator':
      return typeof feats.hasElevator === 'boolean' ? (feats.hasElevator ? 5 : 1) : undefined;
    case 'dishwasher':
      return typeof feats.hasDishwasher === 'boolean' ? (feats.hasDishwasher ? 5 : 1) : undefined;
    case 'balcony':
      return typeof feats.hasBalcony === 'boolean' ? (feats.hasBalcony ? 5 : 1) : undefined;
    case 'airConditioning':
      return typeof feats.hasAirConditioning === 'boolean' ? (feats.hasAirConditioning ? 5 : 1) : undefined;
    case 'furnishedStatus':
      return typeof feats.isFurnished === 'boolean' ? (feats.isFurnished ? 5 : 2) : undefined;
    default:
      return undefined;
  }
}

/**
 * Builds the MCDA evaluation set for a listing.
 *
 * Precedence for each feature's rating:
 *   1. An explicit rating supplied by the user (onboarding modal or post-viewing).
 *   2. Evidence found in the extracted listing data.
 *   3. `neutralRating` — used only when we genuinely have no information.
 *
 * `neutralRating` defaults to 4 ("assume it passes until we learn otherwise"),
 * matching the original pipeline's intent. In normal use it rarely applies: the
 * add-listing flow asks the user to rate every feature they weighted 4 or 5, and
 * those ratings take precedence. It only shapes the provisional score shown
 * between ingestion and the user's own rating pass.
 *
 * Only features the user weighted at or above `SCORED_WEIGHT_THRESHOLD` are
 * scored, plus any feature the user explicitly rated.
 */
export function buildFeatureEvaluations(options: {
  featureWeights?: Record<string, unknown> | null;
  featureRatings?: Record<string, number> | null;
  extractedData?: any;
  neutralRating?: number;
}): FeatureEvaluation[] {
  const { featureWeights, featureRatings, extractedData, neutralRating = 4 } = options;
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
      const derived = ratingFromExtractedData(featureId, extractedData);
      if (derived !== undefined) {
        rating = derived;
        source = 'Derived from the listing details.';
      } else {
        rating = neutralRating;
        source = 'Not stated in the listing — assumed neutral pending viewing.';
      }
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
