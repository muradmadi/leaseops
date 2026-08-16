import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { apartments, PIPELINE_STAGES } from '../schema';

/**
 * Full select validation schema derived from the Drizzle apartments table.
 */
export const selectApartmentSchema = createSelectSchema(apartments);

/**
 * Full insert validation schema derived from the Drizzle apartments table.
 */
export const insertApartmentSchema = createInsertSchema(apartments, {
  url: z.string().url(),
});

/**
 * API payload validation schema for ingesting a new apartment listing.
 */
export const createApartmentApiSchema = z.object({
  /** Reference link back to the portal. Never fetched — kept so you can reopen it. */
  url: z.string().url().optional().or(z.literal('')),
  title: z.string().min(1, 'A title is required'),
  price: z.number().positive('Enter the monthly rent'),
  currency: z.string().default('EUR'),
  /** The listing text, pasted by hand. Still untrusted: it is authored by a landlord. */
  description: z.string().max(20000).default(''),
  floorSizeSqm: z.number().min(0).max(10000).nullish(),
  totalRooms: z.number().min(0).max(50).nullish(),
  bathrooms: z.number().min(0).max(50).nullish(),
  floorLevel: z.string().max(40).default(''),
  neighborhood: z.string().max(120).default(''),
  city: z.string().max(120).default(''),
  featureRatings: z.record(z.string(), z.number()).optional(),
  roomScores: z.record(z.string(), z.number()).optional(),
});

/**
 * Editing an existing listing: every detail plus every rating, in one payload.
 *
 * Mirrors `createApartmentApiSchema` because a viewing can change anything — the
 * advertised size was wrong, the rent excluded bills, the "renovated" bathroom
 * was not. Re-scoring on save is the point: the score has to be allowed to move
 * a long way once you have stood in the flat.
 */
export const updateApartmentApiSchema = createApartmentApiSchema;

export type UpdateApartmentApiPayload = z.infer<typeof updateApartmentApiSchema>;

/**
 * API payload validation schema for updating an apartment's MCDA ratings and room scores post-viewing.
 */
export const updateApartmentRatingsApiSchema = z.object({
  featureRatings: z.record(z.string(), z.number()).optional(),
  roomScores: z.record(z.string(), z.number()).optional(),
});

/**
 * API payload validation schema for updating an apartment's pipeline status.
 */
export const setApartmentActiveApiSchema = z.object({
  isActive: z.boolean(),
});

/**
 * Setting a listing aside, or returning it to the qualified pile.
 *
 * The reason is required when setting aside: it is the entire point, and it is
 * what you will be reading in a fortnight when the flat looks tempting again.
 * `null` clears the override and lets the score speak for itself.
 */
export const setApartmentAsideApiSchema = z.object({
  reason: z.string().trim().min(1, 'Give a reason so you remember why').max(300).nullable(),
});

export type SetApartmentAsidePayload = z.infer<typeof setApartmentAsideApiSchema>;

/**
 * The stage of the conversation with the landlord. Set by hand only — nothing in
 * the app advances it, so it stays a record of what you actually did.
 */
export const setApartmentStageApiSchema = z.object({
  pipelineStage: z.enum(PIPELINE_STAGES),
});

export const updateApartmentStatusApiSchema = z.object({
  status: z.enum(['UNPROCESSED', 'QUALIFIED', 'DISQUALIFIED', 'ARCHIVED']),
});

/**
 * API query parameter validation schema for filtering apartment listings.
 */
export const listApartmentsQuerySchema = z.object({
  status: z.enum(['UNPROCESSED', 'QUALIFIED', 'DISQUALIFIED', 'ARCHIVED']).optional(),
});

/**
 * The single listing analysis.
 *
 * Every array may be empty, and empty is a valid, expected answer — there are no
 * quotas anywhere in this shape. The previous version demanded exactly three cons,
 * which is why it invented trade-offs for flats that had none.
 *
 * This holds **only what the model read from the listing text**. The verdict,
 * strengths and concerns live in `featureScores.highlights`, derived in code from
 * the score — asking a model to reword arithmetic cost a call and bought nothing.
 *
 * A flag must quote the listing verbatim, so a claim with no source in the text
 * cannot be expressed here at all.
 */
export const AiReviewSchema = z.object({
  flags: z.array(z.object({ issue: z.string(), quote: z.string() })).default([]),
  unknowns: z.array(z.object({ feature: z.string(), ask: z.string() })).default([]),
  /** False when no model read the listing, so the UI can say so rather than imply it. */
  analysed: z.boolean().default(true),
});

export type AiReview = z.infer<typeof AiReviewSchema>;

/**
 * Zod validation schema for the DeepSeek V4 Flash extracted structured JSON.
 * Enforces the global ApartmentListing interface defined in the LLM Extraction Blueprint.
 */
export const ApartmentListingSchema = z.object({
  title: z.string(),
  description: z.string().default(''),
  price: z.object({
    amount: z.number(),
    currency: z.string().default('EUR'),
  }),
  unitMetrics: z.object({
    floorSizeSqm: z.number().nullable(),
    totalRooms: z.number().nullable(),
    bathrooms: z.number().nullable(),
    floorLevel: z.string().nullable(),
  }),
  location: z.object({
    neighborhood: z.string().nullable(),
    city: z.string().nullable(),
  }),
  aiReview: AiReviewSchema.optional(),
});

export type ApartmentListing = z.infer<typeof ApartmentListingSchema>;


