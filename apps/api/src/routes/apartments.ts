import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';
import {
  listApartments,
  findApartmentForHousehold,
  createApartment,
  updateApartmentStatus,
  updateApartmentRatings,
  removeApartment,
  createApartmentApiSchema,
  updateApartmentApiSchema,
  updateApartmentStatusApiSchema,
  setApartmentActiveApiSchema,
  setApartmentStageApiSchema,
  setApartmentAsideApiSchema,
  setApartmentActive,
  setApartmentStage,
  setApartmentAside,
  archiveApartment,
  restoreApartment,
  listArchivedApartments,
  updateApartmentRatingsApiSchema,
  listApartmentsQuerySchema,
  findProfileByHouseholdId,
  updateApartmentEnrichment,
  findMessagesByApartmentId,
  createMessage,
  updateMessage,
  removeMessage,
} from '@leaseops/db';
import { processListingAsync, buildListingFromInput, DEFAULT_TITLE } from '../services/scraper';
import {
  calculateMcdaScore,
  deriveHighlights,
  DEFAULT_QUALIFYING_THRESHOLD,
  type FeatureEvaluation,
} from '../services/mcda';
import {
  buildFeatureEvaluations,
  buildSpaceEvaluations,
  buildRoomQualityEvaluation,
  featureDisplayName,
} from '../services/features';
import { enrichQualifiedLead, resolveHouseholdPersona } from '../services/qualification';
import {
  analyseListing,
  draftOutreachMessage,
  suggestChatReply,
  generateCompromiseSummary,
} from '../services/llm';
import { globalEvents } from '../services/events';
import { z } from 'zod';

import type { AuthEnv } from '../services/auth';

// requireAuth is mounted on /api/apartments* in index.ts, so `householdId` is
// always set by the time any handler here runs.
const app = new Hono<AuthEnv>();

/** Heartbeat cadence for the SSE stream, well inside the server idle timeout. */
const SSE_HEARTBEAT_MS = 15_000;

/**
 * GET /api/apartments/sse
 * Server-Sent Events stream for real-time pipeline updates.
 */
app.get('/sse', async (c) => {
  return streamSSE(c, async (stream) => {
    const listener = (data: any) => {
      stream.writeSSE({ data: JSON.stringify(data), event: 'update' });
    };
    globalEvents.on('apartmentUpdated', listener);

    let open = true;
    const close = () => {
      open = false;
      globalEvents.off('apartmentUpdated', listener);
    };
    c.req.raw.signal.addEventListener('abort', close);

    // A silent sleep is not enough: the socket must actually receive bytes or the
    // server's idle timeout closes the stream and live pipeline updates stop.
    // The interval must stay comfortably under SSE_IDLE_TIMEOUT_SECONDS.
    try {
      while (open) {
        await stream.sleep(SSE_HEARTBEAT_MS);
        if (!open) break;
        await stream.writeSSE({ event: 'ping', data: String(Date.now()) });
      }
    } finally {
      close();
    }
  });
});

/**
 * GET /api/apartments
 * Retrieves all apartment listings, optionally filtered by pipeline status.
 */
app.get(
  '/',
  zValidator('query', listApartmentsQuerySchema),
  async (c) => {
    const { status } = c.req.valid('query');
    const results = await listApartments(c.get('householdId'), status);
    return c.json(results, 200);
  }
);

/**
 * GET /api/apartments/archived
 * The archive, surfaced in Settings rather than on the dashboard.
 */
app.get('/archived', async (c) => {
  return c.json(await listArchivedApartments(c.get('householdId')), 200);
});

/**
 * GET /api/apartments/:id
 * Retrieves a single apartment listing by its ID.
 */
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const apartment = await findApartmentForHousehold(id, c.get('householdId'));

  if (!apartment) {
    return c.json({ message: 'Apartment listing not found', statusCode: 404 }, 404);
  }

  return c.json(apartment, 200);
});

/**
 * PATCH /api/apartments/:id/active
 *
 * Marks a listing as being pursued, or stops pursuing it.
 *
 * Activating is how you chase a flat that fell short: the pipeline withholds the
 * AI review and outreach draft from anything that did not qualify, so activation
 * releases that spend. It deliberately does **not** change `status` — the score is
 * a measurement and the user overriding it does not make the listing qualify, so
 * it stays in the bucket its score put it in, now flagged as active.
 */
/**
 * PATCH /:id/set-aside
 * Pulls a qualifying listing out of the green zone with a written reason, or
 * clears that override with `reason: null`.
 *
 * The score is not rewritten. A listing that scored 78% and smelled of damp is
 * both of those things, and collapsing them into one number loses the half you
 * cannot recompute.
 */
app.patch('/:id/set-aside', zValidator('json', setApartmentAsideApiSchema), async (c) => {
  const id = c.req.param('id');
  const householdId = c.get('householdId');
  const { reason } = c.req.valid('json');

  const apartment = await findApartmentForHousehold(id, householdId);
  if (!apartment) {
    return c.json({ message: 'Apartment listing not found', statusCode: 404 }, 404);
  }

  const updated = await setApartmentAside(id, reason);
  globalEvents.emit('apartmentUpdated', { id });
  return c.json(updated, 200);
});

/**
 * PATCH /:id/stage
 * Moves the listing along the outreach pipeline. Deliberately separate from
 * `/active` and from the score: choosing to chase a flat, how well it scored,
 * and how far the conversation got are three different questions.
 */
app.patch('/:id/stage', zValidator('json', setApartmentStageApiSchema), async (c) => {
  const id = c.req.param('id');
  const householdId = c.get('householdId');
  const { pipelineStage } = c.req.valid('json');

  const apartment = await findApartmentForHousehold(id, householdId);
  if (!apartment) {
    return c.json({ message: 'Apartment listing not found', statusCode: 404 }, 404);
  }

  const updated = await setApartmentStage(id, pipelineStage);
  globalEvents.emit('apartmentUpdated', { id, pipelineStage });
  return c.json(updated, 200);
});

app.patch('/:id/active', zValidator('json', setApartmentActiveApiSchema), async (c) => {
  const id = c.req.param('id');
  const householdId = c.get('householdId');
  const { isActive } = c.req.valid('json');

  const apartment = await findApartmentForHousehold(id, householdId);
  if (!apartment) {
    return c.json({ message: 'Apartment listing not found', statusCode: 404 }, 404);
  }

  const updated = await setApartmentActive(id, isActive);
  const userProfile = await findProfileByHouseholdId(householdId);

  if (isActive) {
    // Not awaited: generating a review and an outreach draft is several seconds of
    // LLM time and the dashboard picks the result up over SSE.
    Promise.resolve()
      .then(() => enrichQualifiedLead(id, userProfile, { requireQualified: false }))
      .catch((err) => console.error(`[Activate] Enrichment failed for ${id}:`, err));
  }

  globalEvents.emit('apartmentUpdated', { id, isActive });
  return c.json(updated, 200);
});

/**
 * POST /api/apartments/:id/ai-review
 * Generates or retrieves DeepSeek AI pros/cons analysis for an apartment.
 */
app.post('/:id/ai-review', async (c) => {
  const id = c.req.param('id');
  const apartment = await findApartmentForHousehold(id, c.get('householdId'));
  if (!apartment) {
    return c.json({ message: 'Apartment listing not found', statusCode: 404 }, 404);
  }

  const ext = (apartment.extractedData || {}) as any;
  if (ext.aiReview) {
    return c.json(ext.aiReview, 200);
  }

  const userProfile = await findProfileByHouseholdId(c.get('householdId'));

  const aiReview = await analyseListing(
    apartment.title || ext.title || 'Property',
    apartment.price || ext.price?.amount || 0,
    ext.description || '',
    ext,
    userProfile,
    apartment.featureScores
  );

  const updatedExt = { ...ext, aiReview };
  await updateApartmentEnrichment(id, { extractedData: updatedExt });

  return c.json(aiReview, 200);
});

/**
 * GET /api/apartments/:id/ai-review
 * Retrieves DeepSeek AI pros/cons analysis for an apartment. Does not generate it.
 */
app.get('/:id/ai-review', async (c) => {
  const id = c.req.param('id');
  const apartment = await findApartmentForHousehold(id, c.get('householdId'));
  if (!apartment) {
    return c.json({ message: 'Apartment listing not found', statusCode: 404 }, 404);
  }

  const ext = (apartment.extractedData || {}) as any;
  if (ext.aiReview) {
    return c.json(ext.aiReview, 200);
  }

  return c.json(null, 200);
});

/**
 * POST /api/apartments
 * Ingests a new apartment listing URL, creates an UNPROCESSED database record,
 * and triggers background scraping and MCDA enrichment asynchronously (202 Accepted).
 */
app.post(
  '/',
  zValidator('json', createApartmentApiSchema),
  async (c) => {
    const data = c.req.valid('json');
    const now = new Date();
    const id = crypto.randomUUID();
    const householdId = c.get('householdId');

    const listing = buildListingFromInput({
      title: data.title.trim() || DEFAULT_TITLE,
      description: data.description,
      price: data.price,
      currency: data.currency,
      floorSizeSqm: data.floorSizeSqm,
      totalRooms: data.totalRooms,
      bathrooms: data.bathrooms,
      floorLevel: data.floorLevel,
      neighborhood: data.neighborhood,
      city: data.city,
    });

    const created = await createApartment({
      id,
      householdId,
      // A listing entered by hand may have no link at all; the row still needs a
      // unique value for the per-household URL index.
      url: data.url?.trim() || `manual:${id}`,
      title: listing.title,
      price: data.price,
      currency: data.currency || 'EUR',
      status: 'UNPROCESSED' as const,
      roomScores: data.roomScores,
      extractedData: listing,
      createdAt: now,
      updatedAt: now,
    });

    // Scoring is instant but the LLM work is not, so the response does not wait.
    Promise.resolve().then(() => {
      processListingAsync(created.id, householdId, listing, data.featureRatings, data.roomScores).catch((err) => {
        console.error(`[Background Task Error] ${created.id}:`, err);
      });
    });

    return c.json(created, 202);
  }
);

/**
 * PATCH /api/apartments/:id
 * Edits a listing in full — every detail and every rating — and re-scores it.
 *
 * A viewing is the point at which the advert stops being the best information
 * you have, so anything on the record has to be correctable: the size was
 * overstated, the rent excluded bills, the bathroom was not what the photo
 * showed. The score is recomputed from the corrected figures and is expected to
 * move, sometimes a long way.
 *
 * Deliberately does **not** re-run the AI review. That reads the description and
 * costs a call, so it is released on demand by Activate rather than spent on
 * every typo fix. Scoring itself is free arithmetic and always runs.
 */
app.patch('/:id', zValidator('json', updateApartmentApiSchema), async (c) => {
  const id = c.req.param('id');
  const householdId = c.get('householdId');
  const data = c.req.valid('json');

  const existing = await findApartmentForHousehold(id, householdId);
  if (!existing) {
    return c.json({ message: 'Apartment listing not found', statusCode: 404 }, 404);
  }

  const listing = buildListingFromInput({
    title: data.title.trim() || DEFAULT_TITLE,
    description: data.description,
    price: data.price,
    currency: data.currency,
    floorSizeSqm: data.floorSizeSqm,
    totalRooms: data.totalRooms,
    bathrooms: data.bathrooms,
    floorLevel: data.floorLevel,
    neighborhood: data.neighborhood,
    city: data.city,
  });

  // The AI review belongs to the listing, not to this edit — carry it over so a
  // correction does not silently wipe a review you already paid for.
  const previous = (existing.extractedData || {}) as any;
  if (previous.aiReview) listing.aiReview = previous.aiReview;

  await updateApartmentEnrichment(id, {
    url: data.url?.trim() || existing.url,
    title: listing.title,
    price: data.price,
    currency: data.currency || existing.currency,
    roomScores: data.roomScores,
    extractedData: listing,
  });

  // Re-score through the same path ingestion uses, so an edited listing and a
  // new one can never be scored by two different implementations.
  await processListingAsync(id, householdId, listing, data.featureRatings, data.roomScores);

  const updated = await findApartmentForHousehold(id, householdId);
  return c.json(updated, 200);
});

/**
 * PATCH /api/apartments/:id/status
 * Updates an apartment's pipeline status (supports optimistic UI updates from frontend).
 */
app.patch(
  '/:id/status',
  zValidator('json', updateApartmentStatusApiSchema),
  async (c) => {
    const id = c.req.param('id');
    const { status } = c.req.valid('json');

    // Ownership first: without this, any signed-in household could rewrite the
    // status of another household's listing by guessing a UUID. A miss must be
    // indistinguishable from "does not exist".
    const existing = await findApartmentForHousehold(id, c.get('householdId'));
    if (!existing) {
      return c.json({ message: 'Apartment listing not found', statusCode: 404 }, 404);
    }

    const updated = await updateApartmentStatus(id, status);

    if (!updated) {
      return c.json({ message: 'Apartment listing not found', statusCode: 404 }, 404);
    }

    return c.json(updated, 200);
  }
);

/**
 * PATCH /api/apartments/:id/ratings
 * Re-evaluates an apartment's MCDA feature ratings and room scores post-viewing,
 * recalculates the MCDA percentage score and pipeline status, and updates the database record.
 */
app.patch(
  '/:id/ratings',
  zValidator('json', updateApartmentRatingsApiSchema),
  async (c) => {
    const id = c.req.param('id');
    const { featureRatings, roomScores } = c.req.valid('json');

    const existing = await findApartmentForHousehold(id, c.get('householdId'));
    if (!existing) {
      return c.json({ message: 'Apartment listing not found', statusCode: 404 }, 404);
    }

    const userProfile = await findProfileByHouseholdId(c.get('householdId'));

    const oldScores = (existing.featureScores || {}) as any;
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
    const derivedIds = new Set(['__floorArea', '__bedrooms', '__bathrooms', '__roomQuality']);
    for (let i = updatedEvaluations.length - 1; i >= 0; i--) {
      if (derivedIds.has(updatedEvaluations[i]!.featureId)) updatedEvaluations.splice(i, 1);
    }
    updatedEvaluations.push(
      ...buildSpaceEvaluations(userProfile?.spaceRequirements as any, (existing.extractedData as any)?.unitMetrics)
    );
    const newRoomQuality = buildRoomQualityEvaluation(
      (roomScores as Record<string, number>) || (existing.roomScores as Record<string, number>)
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

    const newResult = calculateMcdaScore(updatedEvaluations, existing.price, profile);

    // Keep the compromise summary in step with the score the user just changed.
    const ext = (existing.extractedData || {}) as any;
    let compromise = oldScores.compromise;
    if (newResult.status === 'QUALIFIED') {
      compromise = undefined;
    } else {
      try {
        compromise = await generateCompromiseSummary(
          existing.title || ext.title || 'This property',
          existing.price,
          ext.description || '',
          { evaluations: updatedEvaluations, result: newResult, budgetCeiling: profile.budgetCeiling }
        );
      } catch (err: any) {
        console.warn(`[Ratings] Compromise summary regeneration failed for ${id}: ${err.message}`);
      }
    }

    const updated = await updateApartmentRatings(id, {
      mcdaScore: newResult.totalScore,
      status: newResult.status,
      featureScores: {
        ...oldScores,
        evaluations: updatedEvaluations,
        result: newResult,
        highlights: deriveHighlights(updatedEvaluations, newResult, {
          price: existing.price,
          budgetCeiling: profile.budgetCeiling,
          idealRent: profile.idealRent,
        }),
        compromise,
      },
      roomScores: roomScores || existing.roomScores || undefined,
    });

    // Re-rating can promote a listing to a qualified lead. Enrich it in the
    // background so the response stays fast; the UI picks the result up over SSE.
    if (newResult.status === 'QUALIFIED') {
      Promise.resolve().then(() =>
        enrichQualifiedLead(id, userProfile).catch((err) =>
          console.error(`[Ratings] Post-qualification enrichment failed for ${id}:`, err)
        )
      );
    }

    return c.json(updated, 200);
  }
);

/**
 * DELETE /api/apartments/:id
 * Deletes an apartment listing from the database.
 */
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  // This route had no ownership check at all: any signed-in user could delete
  // another household's listing by guessing its id.
  const apartment = await findApartmentForHousehold(id, c.get('householdId'));
  if (!apartment) {
    return c.json({ message: 'Apartment listing not found', statusCode: 404 }, 404);
  }

  // Archive rather than destroy. Dismissing a flat at 1am should be reversible,
  // and the archive is where you go digging when too little is qualifying.
  const archived = await archiveApartment(id);
  globalEvents.emit('apartmentUpdated', { id, archived: true });
  return c.json({ success: true, id, archived: true, apartment: archived }, 200);
});

/**
 * POST /api/apartments/:id/restore
 * Brings a listing back to the dashboard with its score and history intact.
 */
app.post('/:id/restore', async (c) => {
  const id = c.req.param('id');
  const apartment = await findApartmentForHousehold(id, c.get('householdId'));
  if (!apartment) {
    return c.json({ message: 'Apartment listing not found', statusCode: 404 }, 404);
  }

  const restored = await restoreApartment(id);
  globalEvents.emit('apartmentUpdated', { id, archived: false });
  return c.json(restored, 200);
});

/**
 * DELETE /api/apartments/:id/permanent
 * Actually destroys the row, and its conversation with it. Only reachable from the
 * archive, so a permanent delete is always a second, deliberate action.
 */
app.delete('/:id/permanent', async (c) => {
  const id = c.req.param('id');
  const apartment = await findApartmentForHousehold(id, c.get('householdId'));
  if (!apartment) {
    return c.json({ message: 'Apartment listing not found', statusCode: 404 }, 404);
  }

  await removeApartment(id);
  globalEvents.emit('apartmentUpdated', { id, deleted: true });
  return c.json({ success: true, id }, 200);
});

/**
 * GET /api/apartments/:id/messages
 * Fetches messages for an apartment. Does not generate anything if empty.
 */
app.get('/:id/messages', async (c) => {
  const id = c.req.param('id');
  
  const apartment = await findApartmentForHousehold(id, c.get('householdId'));
  if (!apartment) {
    return c.json({ message: 'Apartment listing not found', statusCode: 404 }, 404);
  }

  const messages = await findMessagesByApartmentId(id);
  return c.json(messages, 200);
});

/**
 * POST /api/apartments/:id/messages/init
 * Explicitly generates the initial AI outreach message.
 */
app.post('/:id/messages/init', async (c) => {
  const id = c.req.param('id');
  
  const apartment = await findApartmentForHousehold(id, c.get('householdId'));
  if (!apartment) {
    return c.json({ message: 'Apartment listing not found', statusCode: 404 }, 404);
  }

  const existingMessages = await findMessagesByApartmentId(id);
  if (existingMessages.length > 0) {
    return c.json({ message: 'Conversation already initialized', statusCode: 400 }, 400);
  }

  const userProfile = await findProfileByHouseholdId(c.get('householdId'));
  
  const persona = await resolveHouseholdPersona(c.get('householdId'), userProfile);

  const ext = (apartment.extractedData || {}) as any;
  const description = ext.description || '';
  
  const outreach = await draftOutreachMessage(apartment.title, description, persona, ext.aiReview);

  const now = new Date();
  const newMessage = await createMessage({
    id: crypto.randomUUID(),
    apartmentId: id,
    sender: 'ai_suggestion',
    text: outreach.body,
    status: 'ready',
    metadata: { generated: true, kind: 'outreach', language: outreach.language },
    createdAt: now,
    updatedAt: now,
  });

  return c.json(newMessage, 201);
});

/**
 * POST /api/apartments/:id/messages
 * Logs a new message in the chat
 */
const createMessageSchema = z.object({
  sender: z.enum(['landlord', 'ai_suggestion', 'user']),
  text: z.string().min(1),
  metadata: z.any().optional(),
});

app.post(
  '/:id/messages',
  zValidator('json', createMessageSchema),
  async (c) => {
    const id = c.req.param('id');
    const { sender, text, metadata } = c.req.valid('json');

    const apartment = await findApartmentForHousehold(id, c.get('householdId'));
    if (!apartment) {
      return c.json({ message: 'Apartment listing not found', statusCode: 404 }, 404);
    }

    const now = new Date();
    const newMessage = await createMessage({
      id: crypto.randomUUID(),
      apartmentId: id,
      sender,
      text,
      status: 'ready',
      metadata,
      createdAt: now,
      updatedAt: now,
    });

    return c.json(newMessage, 201);
  }
);

/**
 * PATCH /api/apartments/:id/messages/:messageId
 * Updates the text of a specific message.
 */
app.patch(
  '/:id/messages/:messageId',
  zValidator('json', z.object({ text: z.string().min(1) })),
  async (c) => {
    const id = c.req.param('id');
    const messageId = c.req.param('messageId');
    const { text } = c.req.valid('json');

    const apartment = await findApartmentForHousehold(id, c.get('householdId'));
    if (!apartment) return c.json({ error: 'Not found' }, 404);

    const updated = await updateMessage(messageId, text);
    if (!updated) return c.json({ error: 'Message not found' }, 404);

    return c.json(updated, 200);
  }
);

/**
 * DELETE /api/apartments/:id/messages/:messageId
 * Deletes a specific message.
 */
app.delete('/:id/messages/:messageId', async (c) => {
  const id = c.req.param('id');
  const messageId = c.req.param('messageId');

  const apartment = await findApartmentForHousehold(id, c.get('householdId'));
  if (!apartment) return c.json({ error: 'Not found' }, 404);

  const deleted = await removeMessage(messageId);
  if (!deleted) return c.json({ error: 'Message not found' }, 404);

  return c.json({ success: true, id: deleted.id });
});

/**
 * POST /api/apartments/:id/messages/suggest
 * Generates an AI suggested reply based on chat history
 */
app.post('/:id/messages/suggest', async (c) => {
  const id = c.req.param('id');
  const apartment = await findApartmentForHousehold(id, c.get('householdId'));
  
  if (!apartment) {
    return c.json({ message: 'Apartment not found', statusCode: 404 }, 404);
  }

  const messages = await findMessagesByApartmentId(id);
  
  const userProfile = await findProfileByHouseholdId(c.get('householdId'));
  
  const persona = await resolveHouseholdPersona(c.get('householdId'), userProfile);

  const ext = (apartment.extractedData || {}) as any;
  const chatHistory = messages.map(m => ({ sender: m.sender, text: m.text }));
  const suggestion = await suggestChatReply(apartment.title, chatHistory, persona, ext.aiReview, apartment.featureScores);

  const now = new Date();
  const newMessage = await createMessage({
    id: crypto.randomUUID(),
    apartmentId: id,
    sender: 'ai_suggestion',
    text: suggestion.text,
    status: 'ready',
    metadata: { generated: true, kind: 'reply', personaTuned: true },
    createdAt: now,
    updatedAt: now,
  });

  return c.json(newMessage, 201);
});

export default app;

