/**
 * Enrichment pipeline for LeaseOps.
 *
 * Listings are entered by hand — you paste the description and type the figures —
 * so there is no fetching, no anti-bot bypass and no LLM extraction step. What
 * remains is the part that was always the point: score the listing against the
 * household's weighted criteria, route it, and spend LLM budget only where it
 * earns something.
 *
 * The pasted description is still landlord-authored text and is treated as
 * untrusted throughout: it reaches the LLM only inside
 * `<UNTRUSTED_LISTING_CONTENT>` boundaries, and the UI renders it as text.
 */
import { updateApartmentEnrichment, findProfileByHouseholdId, type ApartmentListing } from '@leaseops/db';
import { analyseListing, generateCompromiseSummary } from './llm';
import { resolveLlmConfig } from './anthropic';
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
} from './features';
import { enrichQualifiedLead } from './qualification';
import { globalEvents } from './events';

/** Placeholder title assigned at ingestion when the user does not supply one. */
export const DEFAULT_TITLE = 'Apartment';

/** The listing details typed into the add-listing form. */
export interface ManualListingInput {
  title: string;
  description?: string;
  price: number;
  currency?: string;
  floorSizeSqm?: number | null;
  totalRooms?: number | null;
  bathrooms?: number | null;
  floorLevel?: string | null;
  neighborhood?: string | null;
  city?: string | null;
}

/**
 * Assembles the structured listing from what the user typed.
 *
 * Anything left blank stays `null` rather than becoming a default: a blank
 * bathroom count means "not stated", and inventing a 1 there would put a fact
 * into the scoring data that nobody supplied.
 */
export function buildListingFromInput(input: ManualListingInput): ApartmentListing {
  const nullable = <T>(v: T | null | undefined): T | null => (v === undefined ? null : v);

  return {
    title: input.title,
    description: input.description?.trim() || '',
    price: { amount: input.price, currency: input.currency || 'EUR' },
    unitMetrics: {
      floorSizeSqm: nullable(input.floorSizeSqm),
      totalRooms: nullable(input.totalRooms),
      bathrooms: nullable(input.bathrooms),
      floorLevel: input.floorLevel?.trim() || null,
    },
    location: {
      neighborhood: input.neighborhood?.trim() || null,
      city: input.city?.trim() || null,
    },
  };
}

/**
 * Scores a newly entered listing and runs the post-qualification chain.
 *
 * Fired without awaiting from the route: the scoring itself is instant, but the
 * AI review and outreach draft are several seconds of LLM time, and the dashboard
 * picks the result up over SSE.
 *
 * @param apartmentId The apartment row to enrich
 * @param householdId The household that owns it; supplies the scoring profile
 * @param listing The structured listing assembled from the form
 * @param featureRatings Ratings the user gave while adding the listing
 * @param roomScores Per-room impressions from the add-listing walkthrough
 */
export async function processListingAsync(
  apartmentId: string,
  householdId: string,
  listing: ApartmentListing,
  featureRatings?: Record<string, number>,
  roomScores?: Record<string, number>
): Promise<void> {
  console.log(`[Enrichment] Scoring ${apartmentId}`);

  // Declared at function scope because the persist step below reads them after
  // the try. A previous version declared these inside the try and every listing
  // landed on ERROR with a ReferenceError; `scraper.test.ts` guards that.
  // The initialiser is the guard: this variable is read after the try, and
  // leaving it undeclared is what made every listing land on ERROR.
  // eslint-disable-next-line no-useless-assignment
  let evaluations: FeatureEvaluation[] = [];
  let mcdaResult: McdaScoreResult | null = null;
  let compromise: { sacrifices: string[]; summary: string } | null = null;
  // Once the score is persisted, a later failure must not replace it with ERROR:
  // the listing is scored, and only the optional enrichment failed.
  let scored = false;

  try {
    const userProfile = await findProfileByHouseholdId(householdId);

    const mcdaProfile = {
      qualifyingThreshold: userProfile?.qualifyingThreshold ?? DEFAULT_QUALIFYING_THRESHOLD,
      budgetCeiling: userProfile?.maxRent || 1500,
      idealRent: userProfile?.idealRent,
    };

    evaluations = buildFeatureEvaluations({
      featureWeights: userProfile?.featureWeights as Record<string, unknown> | undefined,
      featureRatings,
    });

    // The figures the user gave as numbers, scored against the listing's stated
    // measurements, plus the room impressions. Appended as ordinary evaluations so
    // the penalty applies to an undersized flat with no special-casing.
    evaluations.push(
      ...buildSpaceEvaluations(userProfile?.spaceRequirements as any, listing.unitMetrics)
    );
    const roomQuality = buildRoomQualityEvaluation(roomScores);
    if (roomQuality) evaluations.push(roomQuality);

    const price = listing.price?.amount || 0;
    mcdaResult = calculateMcdaScore(evaluations, price, mcdaProfile);

    // The score is arithmetic and already final here, so it is written and
    // broadcast BEFORE any LLM work. It used to share one write with the AI
    // review at the end of the chain, which meant a qualifying listing sat
    // unscored on the dashboard for as long as that call took — the calculation
    // looked slow when what you were actually waiting for was a model.
    await updateApartmentEnrichment(apartmentId, {
      status: mcdaResult.status,
      // Qualifying already spends LLM budget on a review and an outreach draft, so
      // the listing is being pursued by definition.
      isActive: mcdaResult.status === 'QUALIFIED',
      mcdaScore: mcdaResult.totalScore,
      extractedData: listing,
      featureScores: {
        evaluations,
        result: mcdaResult,
        // Derived in code and stored with the score, so it is recomputed whenever
        // the score is and can never describe an out-of-date evaluation.
        highlights: deriveHighlights(evaluations, mcdaResult, {
          price,
          budgetCeiling: mcdaProfile.budgetCeiling,
          idealRent: mcdaProfile.idealRent,
        }),
      },
    });
    globalEvents.emit('apartmentUpdated', { id: apartmentId });
    scored = true;

    if (mcdaResult.status === 'QUALIFIED') {
      try {
        listing.aiReview = await analyseListing(
          await resolveLlmConfig(householdId),
          listing.description
        );
      } catch (revErr: any) {
        console.warn(`[Enrichment] AI review failed for ${apartmentId}: ${revErr.message}`);
      }
    } else {
      // The compromise summary is what a listing that fell short shows instead,
      // so it is generated for exactly the listings the AI review skips.
      try {
        compromise = await generateCompromiseSummary(listing.title, price, listing.description, {
          evaluations,
          result: mcdaResult,
          budgetCeiling: mcdaProfile.budgetCeiling,
        });
      } catch (compErr: any) {
        console.warn(`[Enrichment] Compromise summary failed for ${apartmentId}: ${compErr.message}`);
      }
    }

    // Second write: only what the model produced. The score is already on the
    // record and must not be recomputed here — `status` and `mcdaScore` are
    // deliberately absent so a failed review can never blank a good score.
    if (listing.aiReview || compromise) {
      await updateApartmentEnrichment(apartmentId, {
        extractedData: listing,
        featureScores: {
          evaluations,
          result: mcdaResult,
          highlights: deriveHighlights(evaluations, mcdaResult, {
            price,
            budgetCeiling: mcdaProfile.budgetCeiling,
            idealRent: mcdaProfile.idealRent,
          }),
          ...(compromise ? { compromise } : {}),
        },
      });
    }

    console.log(`[Enrichment] ${apartmentId} -> ${mcdaResult.status} (${mcdaResult.totalScore}%)`);
  } catch (err: any) {
    console.error(`[Enrichment] Failed for ${apartmentId}:`, err.message);
    if (!scored) {
      await updateApartmentEnrichment(apartmentId, { status: 'ERROR' }).catch(() => {});
    }
  }

  globalEvents.emit('apartmentUpdated', { id: apartmentId });

  if (mcdaResult?.status === 'QUALIFIED') {
    const userProfile = await findProfileByHouseholdId(householdId);
    await enrichQualifiedLead(apartmentId, userProfile).catch((err) =>
      console.warn(`[Enrichment] Post-qualification chain failed for ${apartmentId}: ${err.message}`)
    );
  }
}
