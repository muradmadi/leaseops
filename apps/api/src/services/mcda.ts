/**
 * Multi-Criteria Decision Analysis (MCDA) lead scoring engine.
 *
 * The score answers two different questions, which is why it is computed in two
 * stages rather than one weighted average.
 *
 * **1. How well does this listing match overall?** A weighted mean across every
 * scored feature. This part is *compensatory*: a great kitchen genuinely can make
 * up for a mediocre bathroom, and it should.
 *
 * **2. Does it fail something declared non-negotiable?** A multiplicative penalty
 * per critical shortfall. This part is *non-compensatory*: nothing else in the
 * flat makes a 0/5 on a weight-5 feature acceptable.
 *
 * A single weighted mean cannot express the second question, and the failure mode
 * is counter-intuitive: because every additional criterion grows the denominator,
 * declaring *more* non-negotiables made each one matter *less*. One weight-5
 * feature rated 0/5 with everything else perfect used to score 66.7% against three
 * non-negotiables and 95% against twenty — the same total failure, quietly
 * forgiven by a longer list.
 *
 * The penalty is multiplicative rather than a subtraction so that it is scale-free
 * (it costs the same fraction whether you weighted five features or fifty),
 * violations compound instead of stacking to a negative number, and the result
 * stays inside 0-100 without clamping.
 *
 * A critical shortfall still does not *force* disqualification. It makes it very
 * hard to survive one, which is the product decision: a flat that is exceptional
 * everywhere else deserves to be shown to you, flagged, rather than hidden.
 */

export interface FeatureEvaluation {
  featureId: string;
  name: string;
  weight: number; // 1 (Low) to 5 (Critical / non-negotiable)
  rating: number; // 0 to 5 rating of how well the listing meets this feature
  notes?: string;
}

/** Weight at which a feature is treated as a non-negotiable. */
export const CRITICAL_WEIGHT = 5;

/**
 * The rating a non-negotiable must reach to count as met. Below this, the listing
 * is failing something the user said they would not compromise on.
 */
export const CRITICAL_FLOOR = 3;

/**
 * Fraction of the score forfeited by a total failure (0/5) on one non-negotiable.
 *
 * This is the tuning knob. At 0.45 a non-negotiable rated 1/5 drops an otherwise
 * near-perfect listing from 92 to 64 — it fails, which is what "non-negotiable"
 * should mean — while a borderline 2/5 lands at 80 and survives if the rest of the
 * flat is genuinely excellent. Raising it makes the matrix stricter; lowering it
 * lets a bad 1/5 through.
 *
 * At the default 70% threshold a 0/5 cannot survive at any list length: it caps
 * even a perfect 100 at 55. That is deliberate. It stays a *penalty* rather than a
 * hard veto so the listing is still scored, still shown, and still carries the
 * reason — rather than vanishing without explanation.
 */
export const MAX_PENALTY_PER_CRITICAL = 0.45;

export interface CriticalShortfall {
  featureId: string;
  name: string;
  rating: number;
  /** 0-1: how far below the floor this fell. 1 means a 0/5. */
  severity: number;
  /** Score points this specific shortfall removed, for honest reporting. */
  pointsLost: number;
}

export interface McdaScoreResult {
  /** Final score after critical penalties. Normalized percentage (0-100). */
  totalScore: number;
  /** Compensatory match before any penalty, kept so the cost is explainable. */
  baseScore: number;
  /** 0-5 rating of rent against your ideal, or null when no ideal is set. */
  valueRating: number | null;
  /** Product of every critical penalty factor. 1 when nothing critical failed. */
  penaltyFactor: number;
  /** baseScore - totalScore. */
  pointsLostToCriticals: number;
  criticalShortfalls: CriticalShortfall[];
  isSoftDealbreaker: boolean;
  exceedsBudget: boolean;
  dealbreakerReasons: string[];
  status: 'QUALIFIED' | 'DISQUALIFIED';
}

export interface ScoringProfile {
  qualifyingThreshold: number; // e.g. 70 (percentage)
  budgetCeiling: number; // e.g. 1500
  /** The rent you actually want to pay. Omit to skip value scoring entirely. */
  idealRent?: number | null;
}

/** The single default threshold. Kept here so no route can hold a second copy. */
export const DEFAULT_QUALIFYING_THRESHOLD = 70;

/**
 * How heavily rent-versus-ideal counts, expressed on the same 1-5 weight scale as
 * a feature. Weight 5 because rent is the criterion you live with every month.
 *
 * It is deliberately **exempt from the critical penalty**: price already has a
 * hard gate in the budget ceiling, and penalising a flat for sitting just under
 * that ceiling would punish it twice for the same fact.
 */
export const VALUE_WEIGHT = 5;

/**
 * Rates rent on the same 0-5 scale as a feature: full marks at or below your
 * ideal, tapering to zero at your ceiling. Returns null when no ideal is set, in
 * which case rent stays a pure pass/fail gate and nothing is invented.
 */
export function rateValueForMoney(
  price: number,
  idealRent?: number | null,
  budgetCeiling?: number | null
): number | null {
  if (!idealRent || idealRent <= 0) return null;
  if (price <= idealRent) return 5;
  if (!budgetCeiling || budgetCeiling <= idealRent) return price <= idealRent ? 5 : 0;
  if (price >= budgetCeiling) return 0;
  return (5 * (budgetCeiling - price)) / (budgetCeiling - idealRent);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Evaluates a listing's feature ratings against weighted criteria and determines
 * pipeline status.
 *
 * @param features Evaluated features with weights (1-5) and ratings (0-5)
 * @param listingPrice Absolute price of the listing
 * @param profile The household's scoring threshold and budget ceiling
 */
export function calculateMcdaScore(
  features: FeatureEvaluation[],
  listingPrice: number,
  profile: ScoringProfile
): McdaScoreResult {
  const exceedsBudget = listingPrice > profile.budgetCeiling;

  const valueRating = rateValueForMoney(listingPrice, profile.idealRent, profile.budgetCeiling);

  if (features.length === 0) {
    return {
      totalScore: 0,
      baseScore: 0,
      valueRating,
      penaltyFactor: 1,
      pointsLostToCriticals: 0,
      criticalShortfalls: [],
      isSoftDealbreaker: false,
      exceedsBudget,
      dealbreakerReasons: [],
      status: 'DISQUALIFIED',
    };
  }

  // 1. Compensatory match: how well the listing fits, taken as a whole. Rent joins
  //    the weighted mean as a criterion in its own right, so a bargain outranks an
  //    otherwise identical flat scraping the ceiling.
  let totalWeightedScore = 0;
  let maxPossibleWeightedScore = 0;
  for (const feat of features) {
    totalWeightedScore += feat.rating * feat.weight;
    maxPossibleWeightedScore += 5 * feat.weight;
  }
  if (valueRating !== null) {
    totalWeightedScore += valueRating * VALUE_WEIGHT;
    maxPossibleWeightedScore += 5 * VALUE_WEIGHT;
  }
  const baseScore =
    maxPossibleWeightedScore > 0 ? (totalWeightedScore / maxPossibleWeightedScore) * 100 : 0;

  // 2. Non-compensatory penalty: every non-negotiable that came up short costs a
  //    fixed fraction, regardless of how many other criteria exist.
  const dealbreakerReasons: string[] = [];
  const criticalShortfalls: CriticalShortfall[] = [];
  let penaltyFactor = 1;

  for (const feat of features) {
    if (feat.weight < CRITICAL_WEIGHT || feat.rating >= CRITICAL_FLOOR) continue;

    const severity = (CRITICAL_FLOOR - feat.rating) / CRITICAL_FLOOR;
    const factor = 1 - MAX_PENALTY_PER_CRITICAL * severity;
    const before = baseScore * penaltyFactor;
    penaltyFactor *= factor;
    const pointsLost = before - baseScore * penaltyFactor;

    criticalShortfalls.push({
      featureId: feat.featureId,
      name: feat.name,
      rating: feat.rating,
      severity: round2(severity),
      pointsLost: round2(pointsLost),
    });

    dealbreakerReasons.push(
      `Critical non-negotiable feature "${feat.name}" scored ${feat.rating}/5, costing ${round2(
        pointsLost
      )} points.`
    );
  }

  const totalScore = round2(baseScore * penaltyFactor);
  const isQualified = !exceedsBudget && totalScore >= profile.qualifyingThreshold;

  return {
    totalScore,
    baseScore: round2(baseScore),
    valueRating: valueRating === null ? null : round2(valueRating),
    penaltyFactor: round2(penaltyFactor),
    pointsLostToCriticals: round2(baseScore - totalScore),
    criticalShortfalls,
    isSoftDealbreaker: criticalShortfalls.length > 0,
    exceedsBudget,
    dealbreakerReasons,
    status: isQualified ? 'QUALIFIED' : 'DISQUALIFIED',
  };
}

/**
 * The plain-language reading of a score.
 *
 * Derived here, in code, because it is pure restatement of the arithmetic — the
 * model used to be asked for this and its only possible contribution was
 * rewording. Keeping it local makes it free, deterministic, and impossible to
 * embellish, and leaves the LLM call to do the one thing it is actually better at:
 * reading the listing text.
 */
export interface ScoreHighlights {
  verdict: string;
  strengths: string[];
  concerns: string[];
}

export function deriveHighlights(
  features: FeatureEvaluation[],
  result: McdaScoreResult,
  options: { price?: number; budgetCeiling?: number; idealRent?: number | null } = {}
): ScoreHighlights {
  const strengths = features
    .filter((f) => f.weight >= 4 && f.rating >= 4)
    .sort((a, b) => b.weight * b.rating - a.weight * a.rating)
    .slice(0, 5)
    .map((f) => `${f.name} — you rated it ${f.rating}/5 against a weight of ${f.weight}/5.`);

  const concerns: string[] = [];

  if (result.exceedsBudget && options.budgetCeiling && options.price) {
    concerns.push(
      `Rent of ${Math.round(options.price)} is over your ceiling of ${Math.round(options.budgetCeiling)}.`
    );
  }

  for (const shortfall of result.criticalShortfalls) {
    concerns.push(
      `${shortfall.name} — ${shortfall.rating}/5 on a non-negotiable, costing ${shortfall.pointsLost} points.`
    );
  }

  for (const feat of features) {
    if (concerns.length >= 5) break;
    // Criticals are already named above with their exact cost.
    const isCritical = feat.weight >= CRITICAL_WEIGHT && feat.rating < CRITICAL_FLOOR;
    if (feat.weight >= 4 && feat.rating < 4 && !isCritical) {
      concerns.push(`${feat.name} — rated ${feat.rating}/5 against a weight of ${feat.weight}/5.`);
    }
  }

  const parts = [`Scores ${result.totalScore}% against your criteria`];
  if (result.pointsLostToCriticals > 0) {
    parts.push(`after losing ${result.pointsLostToCriticals} points to non-negotiables`);
  }
  if (options.price !== undefined) {
    if (result.exceedsBudget && options.budgetCeiling) {
      parts.push(`and is over your ${Math.round(options.budgetCeiling)} ceiling`);
    } else if (result.valueRating !== null && result.valueRating >= 5 && options.idealRent) {
      parts.push(`and sits at or below your ideal rent`);
    }
  }

  return { verdict: `${parts.join(' ')}.`, strengths, concerns };
}
