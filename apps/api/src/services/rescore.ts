/**
 * Re-running the score against inputs that are already stored.
 *
 * This is the arithmetic half of the ingestion pipeline with nothing else
 * attached: it reads the evaluations, the profile and the figures already on the
 * record, and returns what the score *would* be now. It performs no I/O, calls
 * no model, and decides nothing about pursuit — the caller writes the result and
 * the caller alone decides whether anything else should follow.
 *
 * It exists because two callers need to agree exactly. `PATCH /:id/ratings`
 * rescores one listing after a viewing, and `POST /rescore` rescores the whole
 * household after the criteria change. When that logic lived in the route
 * handler there was no way to add the second caller without copying 130 lines of
 * scoring into a second place and letting them drift.
 */

import type { Apartment, NewApartment, UserProfile } from '@leaseops/db';
import {
  calculateMcdaScore,
  deriveHighlights,
  DEFAULT_QUALIFYING_THRESHOLD,
  type FeatureEvaluation,
  type McdaScoreResult,
} from './mcda';
import {
  buildFeatureEvaluations,
  buildSpaceEvaluations,
  buildRoomQualityEvaluation,
  featureDisplayName,
} from './features';
import { generateCompromiseSummary } from './llm';

/** The derived criteria, which are always recomputed rather than carried over. */
const DERIVED_FEATURE_IDS = new Set([
  '__floorArea',
  '__bedrooms',
  '__bathrooms',
  '__roomQuality',
]);

export interface RescoreOverrides {
  /** Ratings the user just supplied, typically post-viewing. */
  featureRatings?: Record<string, number>;
  /** Room impressions the user just supplied. */
  roomScores?: Record<string, number>;
}

export interface RescoreOutcome {
  result: McdaScoreResult;
  evaluations: FeatureEvaluation[];
  /**
   * Exactly the columns a re-score is allowed to write. Notably absent:
   * `isActive`, `pipelineStage`, `setAsideReason`, `archivedAt` and
   * `extractedData` — the four axes and the AI review are not the score's to
   * touch, and a re-score that quietly reset any of them would destroy a record
   * of what the user did.
   */
  update: Partial<NewApartment>;
}

/**
 * Recomputes one listing's score from what is already stored on it.
 *
 * With no overrides this is a pure refresh: same ratings, same figures, current
 * profile and current scoring code. That is what makes it safe to run across
 * every listing at once.
 */
export async function rescoreApartment(
  apartment: Apartment,
  userProfile: UserProfile | undefined,
  overrides: RescoreOverrides = {}
): Promise<RescoreOutcome> {
  const { featureRatings, roomScores } = overrides;

  const oldScores = (apartment.featureScores || {}) as any;
  let evaluations = (oldScores.evaluations || []) as FeatureEvaluation[];

  // No evaluation set yet (ingestion failed, or this predates scoring) — build one
  // from the same catalogue the scraper uses so both paths score identically.
  if (evaluations.length === 0) {
    evaluations = buildFeatureEvaluations({
      featureWeights: userProfile?.featureWeights as Record<string, unknown> | undefined,
      featureRatings,
    });
  }

  // Apply the new ratings. A rating for a feature that was never in the
  // evaluation set used to be dropped on the floor by this map — you could rate
  // three things after a viewing, see no error, and have two silently ignored
  // because they had been weighted below the scoring threshold. Rating something
  // explicitly is itself a statement that it matters, so it now joins the set.
  const updatedEvaluations: FeatureEvaluation[] = evaluations.map((evalItem) => {
    if (featureRatings && featureRatings[evalItem.featureId] !== undefined) {
      return {
        ...evalItem,
        rating: Number(featureRatings[evalItem.featureId]),
        notes: `Updated to ${Number(featureRatings[evalItem.featureId])}/5 post-viewing.`,
      };
    }
    return evalItem;
  });

  // Derived criteria are recomputed rather than carried over: the room scores may
  // have just changed, and stale size ratings would contradict the listing.
  for (let i = updatedEvaluations.length - 1; i >= 0; i--) {
    if (DERIVED_FEATURE_IDS.has(updatedEvaluations[i]!.featureId)) updatedEvaluations.splice(i, 1);
  }
  updatedEvaluations.push(
    ...buildSpaceEvaluations(
      userProfile?.spaceRequirements as any,
      (apartment.extractedData as any)?.unitMetrics
    )
  );
  const newRoomQuality = buildRoomQualityEvaluation(
    (roomScores as Record<string, number>) || (apartment.roomScores as Record<string, number>)
  );
  if (newRoomQuality) updatedEvaluations.push(newRoomQuality);

  if (featureRatings) {
    const weights = (userProfile?.featureWeights || {}) as Record<string, unknown>;
    for (const [featureId, rawRating] of Object.entries(featureRatings)) {
      if (updatedEvaluations.some((e) => e.featureId === featureId)) continue;
      const rating = Number(rawRating);
      if (!Number.isFinite(rating)) continue;

      const rawWeight = weights[featureId];
      const weight = rawWeight === undefined || rawWeight === null ? 3 : Number(rawWeight);
      if (!Number.isFinite(weight)) continue;

      updatedEvaluations.push({
        featureId,
        name: featureDisplayName(featureId),
        weight,
        rating: Math.max(0, Math.min(5, rating)),
        notes: `Rated ${rating}/5 post-viewing.`,
      });
    }
  }

  const profile = {
    qualifyingThreshold: userProfile?.qualifyingThreshold ?? DEFAULT_QUALIFYING_THRESHOLD,
    budgetCeiling: userProfile?.maxRent || 1500,
    idealRent: userProfile?.idealRent,
  };

  const result = calculateMcdaScore(updatedEvaluations, apartment.price, profile);

  // Keep the compromise summary in step with the score. This costs nothing —
  // `generateCompromiseSummary` is pure arithmetic and takes no credentials.
  const ext = (apartment.extractedData || {}) as any;
  let compromise = oldScores.compromise;
  if (result.status === 'QUALIFIED') {
    compromise = undefined;
  } else {
    try {
      compromise = await generateCompromiseSummary(
        apartment.title || ext.title || 'This property',
        apartment.price,
        ext.description || '',
        {
          evaluations: updatedEvaluations,
          result,
          budgetCeiling: profile.budgetCeiling,
        }
      );
    } catch (err: any) {
      console.warn(`[Rescore] Compromise summary failed for ${apartment.id}: ${err.message}`);
    }
  }

  return {
    result,
    evaluations: updatedEvaluations,
    update: {
      mcdaScore: result.totalScore,
      status: result.status,
      featureScores: {
        ...oldScores,
        evaluations: updatedEvaluations,
        result,
        highlights: deriveHighlights(updatedEvaluations, result, {
          price: apartment.price,
          budgetCeiling: profile.budgetCeiling,
          idealRent: profile.idealRent,
        }),
        compromise,
      },
      roomScores: roomScores || (apartment.roomScores as Record<string, number>) || undefined,
    },
  };
}
