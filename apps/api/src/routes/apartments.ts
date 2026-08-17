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
  findMessagesForApartmentIds,
  createMessage,
  updateMessage,
  removeMessage,
  summariseThread,
  type Apartment,
  type Message,
  type ApartmentWithThread,
} from '@leaseops/db';
import { processListingAsync, buildListingFromInput, DEFAULT_TITLE } from '../services/scraper';
import { rescoreApartment } from '../services/rescore';
import { enrichQualifiedLead, resolveHouseholdPersona } from '../services/qualification';
import { analyseListing, draftOutreachMessage, suggestChatReply } from '../services/llm';
import { resolveLlmConfig } from '../services/anthropic';
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
 * Attaches each listing's conversation state, in one extra query for the batch.
 *
 * Derived on read, never stored. `pipelineStage` is what the user declared; this
 * is what the messages can prove, and the dashboard shows them side by side so a
 * stale stage is visible instead of silently wrong. Nothing here writes back —
 * the stage stays a record of what the user did.
 */
async function withThreads(apartments: Apartment[]): Promise<ApartmentWithThread[]> {
  const messages = await findMessagesForApartmentIds(apartments.map((a) => a.id));

  const byApartment = new Map<string, Message[]>();
  for (const message of messages) {
    const bucket = byApartment.get(message.apartmentId);
    if (bucket) bucket.push(message);
    else byApartment.set(message.apartmentId, [message]);
  }

  return apartments.map((apartment) => ({
    ...apartment,
    thread: summariseThread(byApartment.get(apartment.id) ?? []),
  }));
}

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
    return c.json(await withThreads(results), 200);
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
 * POST /api/apartments/rescore
 *
 * Re-runs the score on every listing this household owns, against the criteria
 * and the scoring code as they are now. Registered above `/:id` so it is not
 * captured as an id.
 *
 * **It re-computes and writes nothing else.** Each listing keeps its ratings,
 * its figures, its AI review, its outreach thread, and all four axes — only
 * `mcdaScore`, `status` and `featureScores` are written, because those are the
 * only things the arithmetic produces. It therefore has no effect at all on a
 * household whose criteria have not changed, which is what makes it safe to
 * press twice.
 *
 * **It spends nothing.** Scoring is arithmetic and the compromise summary is
 * derived, so this is free at any number of listings. It deliberately does *not*
 * call `enrichQualifiedLead` on listings it promotes, which is the one place a
 * bulk operation could quietly become an LLM bill of two calls per listing.
 * Promotion still sets the bucket; releasing the spend stays a per-listing
 * decision made with Activate, exactly as it is for a listing that fell short.
 */
app.post('/rescore', async (c) => {
  const householdId = c.get('householdId');
  const userProfile = await findProfileByHouseholdId(householdId);

  // The archive is included: `archivedAt` is an independent axis, and a listing
  // restored later should not come back carrying a score from older criteria.
  const [live, archived] = await Promise.all([
    listApartments(householdId),
    listArchivedApartments(householdId),
  ]);
  const all = [...live, ...archived];

  let scoreChanged = 0;
  let statusChanged = 0;
  const failed: string[] = [];

  // Sequential on purpose. This is microseconds of arithmetic per listing against
  // one SQLite file, so there is nothing to win by racing the writes.
  for (const apartment of all) {
    try {
      const { result, update } = await rescoreApartment(apartment, userProfile);
      await updateApartmentRatings(apartment.id, update);

      if (result.totalScore !== apartment.mcdaScore) scoreChanged++;
      if (result.status !== apartment.status) statusChanged++;
    } catch (err: any) {
      // One bad record must not abandon the rest half-scored.
      console.error(`[Rescore] Failed for ${apartment.id}: ${err.message}`);
      failed.push(apartment.id);
    }
  }

  // One event for the batch. The SSE listener ignores the payload and invalidates
  // the whole list, so emitting per listing would be N identical refetches.
  globalEvents.emit('apartmentUpdated', { id: null, bulk: true });

  return c.json(
    {
      rescored: all.length - failed.length,
      archived: archived.length,
      scoreChanged,
      statusChanged,
      failed: failed.length,
    },
    200
  );
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

  // The chat reads its thread state from here rather than deriving it in the
  // browser: `apps/web` may import types from `@leaseops/db` but never runtime
  // code, and one derivation is what keeps the card and the chat agreeing.
  const [withThread] = await withThreads([apartment]);
  return c.json(withThread, 200);
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

  const aiReview = await analyseListing(
    await resolveLlmConfig(c.get('householdId')),
    ext.description || ''
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

    const { result: newResult, update } = await rescoreApartment(existing, userProfile, {
      featureRatings,
      roomScores: roomScores as Record<string, number> | undefined,
    });

    const updated = await updateApartmentRatings(id, update);

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
  
  const outreach = await draftOutreachMessage(
    await resolveLlmConfig(c.get('householdId')),
    apartment.title,
    description,
    persona,
    ext.aiReview
  );

  const now = new Date();
  const newMessage = await createMessage({
    id: crypto.randomUUID(),
    apartmentId: id,
    sender: 'ai_suggestion',
    // A proposal until you mark it sent. Nothing here is attributed to you before
    // then, and rejecting it removes it entirely.
    status: 'draft',
    text: outreach.body,
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
/**
 * When a message was said, in epoch milliseconds, as stated by the person
 * logging it. Bounded to 1970–2100 so a mistyped year lands as a 400 rather than
 * as a date the readout would then render.
 */
const sentAtSchema = z.number().int().min(0).max(4_102_444_800_000);

const createMessageSchema = z.object({
  sender: z.enum(['landlord', 'ai_suggestion', 'user']),
  text: z.string().min(1),
  status: z.enum(['draft', 'sent']).optional(),
  /** Omitted means undated, which the thread readout reports as unknown. */
  sentAt: sentAtSchema.nullable().optional(),
  metadata: z.any().optional(),
});

/**
 * What a newly logged message means before anyone touches it.
 *
 * A message you typed is one you wrote, so it is sent unless you say otherwise.
 * An AI draft is a proposal until you mark it. The landlord's own messages have
 * no such state — they were sent, by them, or they would not be here.
 */
function defaultStatus(sender: string): string {
  return sender === 'ai_suggestion' ? 'draft' : 'sent';
}

app.post(
  '/:id/messages',
  zValidator('json', createMessageSchema),
  async (c) => {
    const id = c.req.param('id');
    const { sender, text, status, sentAt, metadata } = c.req.valid('json');

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
      status: status ?? defaultStatus(sender),
      // Never defaulted to `now`. `createdAt` below already records when the row
      // was written; a message is dated only by the person who says when it was
      // said, and unknown is a truthful answer where a guess is not.
      sentAt: sentAt == null ? null : new Date(sentAt),
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
const updateMessageSchema = z
  .object({
    text: z.string().min(1).optional(),
    /**
     * `'sent'` marks an AI draft as actually used. Only these count as the
     * tenant's own words when the next reply is drafted, which is what stops a
     * rejected suggestion becoming a promise to the owner.
     */
    status: z.enum(['draft', 'sent']).optional(),
    /**
     * `null` clears the date back to undated; omitting it leaves whatever is
     * stored alone. The two must stay distinct — marking a message sent must not
     * blank a date somebody entered.
     */
    sentAt: sentAtSchema.nullable().optional(),
  })
  .refine((v) => v.text !== undefined || v.status !== undefined || v.sentAt !== undefined, {
    message: 'Provide text, status, sentAt, or a combination',
  });

app.patch(
  '/:id/messages/:messageId',
  zValidator('json', updateMessageSchema),
  async (c) => {
    const id = c.req.param('id');
    const messageId = c.req.param('messageId');
    const patch = c.req.valid('json');

    const apartment = await findApartmentForHousehold(id, c.get('householdId'));
    if (!apartment) return c.json({ error: 'Not found' }, 404);

    const updated = await updateMessage(messageId, {
      ...patch,
      // `undefined` and `null` mean different things here, so the conversion has
      // to preserve both rather than collapse them into a falsy check.
      sentAt: patch.sentAt === undefined ? undefined : patch.sentAt === null ? null : new Date(patch.sentAt),
    });
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

  if (messages.length === 0) {
    return c.json(
      { message: 'Nothing to reply to yet. Draft the outreach message first.', statusCode: 400 },
      400
    );
  }

  const userProfile = await findProfileByHouseholdId(c.get('householdId'));

  const persona = await resolveHouseholdPersona(c.get('householdId'), userProfile);

  const ext = (apartment.extractedData || {}) as any;

  // `status` rides along: it is what tells the draft the tenant actually sent
  // apart from the ones still sitting on screen.
  const chatHistory = messages.map((m) => ({ sender: m.sender, text: m.text, status: m.status }));

  const suggestion = await suggestChatReply(
    await resolveLlmConfig(c.get('householdId')),
    apartment.title,
    chatHistory,
    persona,
    {
      description: ext.description || '',
      analysis: ext.aiReview,
      featureScores: apartment.featureScores as any,
    }
  );

  // Offline is a normal state, not an error — but a reply has to answer what was
  // actually asked, and there is no deterministic version of that. Saying so
  // beats saving invented filler into the thread as though a model wrote it.
  if (!suggestion) {
    return c.json(
      {
        message:
          'No Anthropic key set for this household, so there is no suggestion to make. Add one in Settings → AI & billing, or write the reply yourself.',
        statusCode: 409,
      },
      409
    );
  }

  const now = new Date();
  const newMessage = await createMessage({
    id: crypto.randomUUID(),
    apartmentId: id,
    sender: 'ai_suggestion',
    status: 'draft',
    text: suggestion.text,
    metadata: { generated: true, kind: 'reply', personaTuned: true },
    createdAt: now,
    updatedAt: now,
  });

  return c.json(newMessage, 201);
});

export default app;

