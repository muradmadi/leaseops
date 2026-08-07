import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { apartments } from '../schema';

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
  url: z.string().url(),
  title: z.string().min(1).optional(),
  price: z.number().positive().optional(),
  currency: z.string().default('EUR'),
  featureRatings: z.record(z.string(), z.number()).optional(),
  roomScores: z.record(z.string(), z.number()).optional(),
});

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
 * Zod validation schema for the DeepSeek V4 Flash extracted structured JSON.
 * Enforces the global ApartmentListing interface defined in the LLM Extraction Blueprint.
 */
export const ApartmentListingSchema = z.object({
  listingId: z.string(),
  title: z.string(),
  description: z.string(),
  listingType: z.enum(['Rent', 'Sale']),
  price: z.object({
    amount: z.number(),
    currency: z.enum(['EUR', 'USD', 'GBP']),
  }),
  unitMetrics: z.object({
    floorSizeSqm: z.number(),
    totalRooms: z.number().nullable(),
    bathrooms: z.number(),
    floorLevel: z.string(),
  }),
  location: z.object({
    neighborhood: z.string(),
    city: z.string(),
  }),
  features: z.object({
    isFurnished: z.boolean(),
    hasElevator: z.boolean(),
    heatingType: z.string().nullable(),
    buildYear: z.number().nullable(),
  }),
  media: z.object({
    images: z.array(z.string()),
    floorPlans: z.array(z.string()),
  }),
  aiReview: z
    .object({
      pros: z.array(z.string()),
      cons: z.array(z.string()),
      recommendation: z.string(),
      summary: z.string().optional(),
    })
    .optional(),
});

export type ApartmentListing = z.infer<typeof ApartmentListingSchema>;

export const AiReviewSchema = z.object({
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  recommendation: z.string(),
  summary: z.string().optional(),
});

export type AiReview = z.infer<typeof AiReviewSchema>;

