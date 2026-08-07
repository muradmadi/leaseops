/**
 * Scraping Pipeline for LeaseOps.
 * Acts as a secure pipe: URL in -> Scrapfly Bypass -> Raw HTML directly to Database.
 * Zero parsing, structuring, or LLM evaluation is performed at this ingestion step.
 */
import { updateApartmentEnrichment, findProfileByUsername, findFirstProfile } from '@leaseops/db';
import { scrapeListingWithScrapfly } from './scrapfly';
import { extractListingFromHtml } from './extractor';
import { generateAiReview, generateCompromiseSummary } from './llm';
import { calculateMcdaScore, type FeatureEvaluation, type McdaScoreResult } from './mcda';
import { buildFeatureEvaluations } from './features';
import { enrichQualifiedLead } from './qualification';
import { globalEvents } from './events';

const QUALIFYING_THRESHOLD = 70;

/** Placeholder title assigned at ingestion when the user does not supply one. */
export const DEFAULT_TITLE = 'Apartment';

/**
 * Asynchronously fetches a listing's raw HTML via Scrapfly and extracts structured JSON via DeepSeek V4 Flash.
 *
 * The score produced here is provisional: it is derived from whatever the listing
 * itself states, plus any ratings the user supplied up front. The post-viewing
 * `PATCH /:id/ratings` route recomputes the authoritative score once the user has
 * rated the features themselves.
 *
 * @param apartmentId The unique ID of the apartment record in SQLite
 * @param url The URL of the listing to scrape
 * @param username Optional username to attribute the background scraping task
 * @param featureRatings Optional manual 1-5 feature ratings from user onboarding/modal
 * @param roomScores Optional manual 1-5 room evaluation scores
 * @param fallbackPrice Price the user entered at ingestion, used for budget checks when extraction finds none
 * @param userTitle Title the user typed at ingestion; a real one is never overwritten by the extracted title
 */
export async function processListingAsync(
  apartmentId: string,
  url: string,
  username?: string,
  featureRatings?: Record<string, number>,
  roomScores?: Record<string, number>,
  fallbackPrice?: number,
  userTitle?: string
): Promise<void> {
  console.log(`[Background Queue] Starting Scrapfly WAF Bypass pipeline for ${apartmentId} (${url})`);

  try {
    const userProfile = username ? await findProfileByUsername(username) : await findFirstProfile();

    // 1. Route URL through Scrapfly (ASP + render_js enabled) to fetch fully rendered raw HTML
    const rawHtml = await scrapeListingWithScrapfly(url);

    // 2. Invoke DeepSeek V4 Flash extraction to structure the Spanish HTML into our normalized JSON schema
    //    `evaluations` / `mcdaResult` are declared at this scope because step 3 below
    //    persists them alongside the extracted data.
    let extractedData: any = null;
    let evaluations: FeatureEvaluation[] = [];
    let mcdaResult: McdaScoreResult | null = null;
    let compromise: { sacrifices: string[]; summary: string } | null = null;

    const mcdaProfile = {
      qualifyingThreshold: QUALIFYING_THRESHOLD,
      budgetCeiling: userProfile?.maxRent || 1500,
    };

    try {
      extractedData = await extractListingFromHtml(rawHtml);
      console.log(`[Background Queue] Successfully extracted structured JSON for ${apartmentId}`);

      // Calculate the provisional MCDA score, which also decides whether an AI review is worth the API spend.
      evaluations = buildFeatureEvaluations({
        featureWeights: userProfile?.featureWeights as Record<string, unknown> | undefined,
        featureRatings,
        extractedData,
      });

      // Budget checks must never run against a phantom price of 0, or an over-budget
      // listing whose price failed to extract would silently qualify.
      const price = extractedData?.price?.amount || fallbackPrice || 0;
      mcdaResult = calculateMcdaScore(evaluations, price, mcdaProfile);

      if (mcdaResult.status === 'QUALIFIED') {
        try {
          const aiReview = await generateAiReview(
            extractedData.title || `Listing (${new URL(url).hostname})`,
            price,
            extractedData.description || rawHtml.slice(0, 5000),
            extractedData,
            userProfile,
            { evaluations, result: mcdaResult }
          );
          extractedData.aiReview = aiReview;
          console.log(`[Background Queue] Successfully generated AI review for ${apartmentId}`);
        } catch (revErr: any) {
          console.warn(`[Background Queue] AI review generation skipped or failed: ${revErr.message}`);
        }
      } else {
        console.log(`[Background Queue] Skipping AI review for ${apartmentId} as it is DISQUALIFIED (Score: ${mcdaResult.totalScore}, Budget Exceeded: ${mcdaResult.exceedsBudget})`);
      }

      // The compromise summary is what the user sees on a listing that fell short,
      // so it is generated for exactly the listings the AI review skips.
      if (mcdaResult.status !== 'QUALIFIED') {
        try {
          compromise = await generateCompromiseSummary(
            extractedData.title || `Listing (${new URL(url).hostname})`,
            price,
            extractedData.description || rawHtml.slice(0, 5000),
            { evaluations, result: mcdaResult, budgetCeiling: mcdaProfile.budgetCeiling }
          );
        } catch (compErr: any) {
          console.warn(`[Background Queue] Compromise summary generation failed: ${compErr.message}`);
        }
      }
    } catch (extractErr: any) {
      console.warn(`[Background Queue] LLM extraction skipped or failed for ${apartmentId}: ${extractErr.message}`);
    }

    // 3. Save raw HTML, extracted structured data and the score that goes with it
    // Falsy (0 / missing) means extraction found no price — keep whatever the user entered.
    const finalPrice = extractedData?.price?.amount || undefined;
    const finalCurrency = extractedData?.price?.currency || undefined;
    const finalStatus = extractedData && mcdaResult ? mcdaResult.status : 'ERROR';
    // Promote the real listing title, otherwise every card reads "Apartment".
    // A title the user typed themselves always wins.
    const extractedTitle = typeof extractedData?.title === 'string' ? extractedData.title.trim() : '';
    const finalTitle =
      extractedTitle && (!userTitle || userTitle === DEFAULT_TITLE) ? extractedTitle : undefined;

    await updateApartmentEnrichment(apartmentId, {
      rawHtml,
      title: finalTitle,
      extractedData: extractedData ? (extractedData as any) : undefined,
      price: finalPrice,
      currency: finalCurrency,
      status: finalStatus,
      mcdaScore: mcdaResult ? mcdaResult.totalScore : undefined,
      featureScores: mcdaResult
        ? { evaluations, result: mcdaResult, ...(compromise ? { compromise } : {}) }
        : undefined,
      roomScores: roomScores || undefined,
    });

    globalEvents.emit('apartmentUpdated', { id: apartmentId, status: finalStatus });

    console.log(`[Background Queue] Successfully enriched and saved data for ${apartmentId}`);

    // A lead that qualifies straight out of ingestion still needs its outreach draft.
    if (finalStatus === 'QUALIFIED') {
      await enrichQualifiedLead(apartmentId, userProfile);
    }
  } catch (error: any) {
    console.error(`[Background Queue] Fatal error scraping listing ${apartmentId}:`, error.message || error);
    await updateApartmentEnrichment(apartmentId, {
      status: 'ERROR',
    });
    globalEvents.emit('apartmentUpdated', { id: apartmentId, status: 'ERROR' });
  }
}

