/**
 * Multi-Criteria Decision Analysis (MCDA) Lead Scoring Engine.
 * Implements the mathematical scoring algorithm and Soft Dealbreaker rule for apartment listings.
 */

export interface FeatureEvaluation {
  featureId: string;
  name: string;
  weight: number; // 1 (Low), 3 (Moderate), or 5 (Critical Non-negotiable)
  rating: number; // 0 to 5 rating of how well the listing meets this feature
  notes?: string;
}

export interface McdaScoreResult {
  totalScore: number; // Normalized percentage score (0-100)
  isSoftDealbreaker: boolean;
  exceedsBudget: boolean;
  dealbreakerReasons: string[];
  status: 'QUALIFIED' | 'DISQUALIFIED';
}

export interface ScoringProfile {
  qualifyingThreshold: number; // e.g. 70 (percentage)
  budgetCeiling: number; // e.g. 1500
}

/**
 * Evaluates a listing's feature ratings against weighted criteria and determines pipeline status.
 *
 * @param features List of evaluated features with weights (1-5) and ratings (0-5)
 * @param listingPrice Absolute price of the listing
 * @param profile User's scoring thresholds and budget ceiling
 */
export function calculateMcdaScore(
  features: FeatureEvaluation[],
  listingPrice: number,
  profile: ScoringProfile
): McdaScoreResult {
  const dealbreakerReasons: string[] = [];
  let isSoftDealbreaker = false;

  // 1. Check Soft Dealbreaker Rule (weight === 5 and rating <= 1)
  for (const feat of features) {
    if (feat.weight >= 5 && feat.rating <= 1) {
      isSoftDealbreaker = true;
      dealbreakerReasons.push(
        `Critical non-negotiable feature "${feat.name}" scored ${feat.rating}/5.`
      );
    }
  }

  // 2. Compute Total Score: (sum(rating * weight) / sum(5 * weight)) * 100
  if (features.length === 0) {
    return {
      totalScore: 0,
      isSoftDealbreaker: false,
      exceedsBudget: listingPrice > profile.budgetCeiling,
      dealbreakerReasons: [],
      status: 'DISQUALIFIED',
    };
  }

  let totalWeightedScore = 0;
  let maxPossibleWeightedScore = 0;

  for (const feat of features) {
    totalWeightedScore += feat.rating * feat.weight;
    maxPossibleWeightedScore += 5 * feat.weight;
  }

  const rawScore =
    maxPossibleWeightedScore > 0 ? (totalWeightedScore / maxPossibleWeightedScore) * 100 : 0;
  const totalScore = Math.round(rawScore * 100) / 100; // Round to 2 decimal places

  // 3. Determine Pipeline Routing Status
  const exceedsBudget = listingPrice > profile.budgetCeiling;

  const isQualified =
    !exceedsBudget && totalScore >= profile.qualifyingThreshold;

  return {
    totalScore,
    isSoftDealbreaker,
    exceedsBudget,
    dealbreakerReasons,
    status: isQualified ? 'QUALIFIED' : 'DISQUALIFIED',
  };
}
