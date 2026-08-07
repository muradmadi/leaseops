import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';
import {
  listApartments,
  findApartmentById,
  createApartment,
  updateApartmentStatus,
  updateApartmentRatings,
  removeApartment,
  createApartmentApiSchema,
  updateApartmentStatusApiSchema,
  updateApartmentRatingsApiSchema,
  listApartmentsQuerySchema,
  findProfileByUsername,
  findFirstProfile,
  updateApartmentEnrichment,
  findMessagesByApartmentId,
  createMessage,
  updateMessage,
  removeMessage,
} from '@leaseops/db';
import { processListingAsync, DEFAULT_TITLE } from '../services/scraper';
import { calculateMcdaScore, type FeatureEvaluation } from '../services/mcda';
import { buildFeatureEvaluations } from '../services/features';
import { enrichQualifiedLead, resolvePersona } from '../services/qualification';
import {
  generateAiReview,
  draftOutreachMessage,
  suggestChatReply,
  generateCompromiseSummary,
} from '../services/llm';
import { globalEvents } from '../services/events';
import { z } from 'zod';

type Env = { Variables: { user?: { username: string } } };
const app = new Hono<Env>();

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
    const results = await listApartments(status);
    return c.json(results, 200);
  }
);

/**
 * GET /api/apartments/proxy-image?url=...
 * Proxies remote listing images with proper User-Agent headers to bypass CORS and Referer restrictions.
 */
app.get('/proxy-image', async (c) => {
  const url = c.req.query('url');
  if (!url) {
    return c.json({ message: 'Missing url parameter', statusCode: 400 }, 400);
  }
  try {
    const urlObj = new URL(url);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return c.json({ message: 'Invalid protocol', statusCode: 400 }, 400);
    }
    const hostname = urlObj.hostname;
    // Basic SSRF protection (prevent local network access)
    if (
      hostname === 'localhost' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.endsWith('.local')
    ) {
      return c.json({ message: 'Internal domains are not allowed', statusCode: 403 }, 403);
    }

    const res = await fetch(urlObj.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });
    if (!res.ok) {
      return c.json({ message: `Failed to fetch remote image (${res.status})`, statusCode: 502 }, 502);
    }
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = await res.arrayBuffer();
    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err: any) {
    return c.json({ message: err.message || 'Image proxy error', statusCode: 500 }, 500);
  }
});

/**
 * GET /api/apartments/:id
 * Retrieves a single apartment listing by its ID.
 */
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const apartment = await findApartmentById(id);

  if (!apartment) {
    return c.json({ message: 'Apartment listing not found', statusCode: 404 }, 404);
  }

  return c.json(apartment, 200);
});

/**
 * POST /api/apartments/:id/ai-review
 * Generates or retrieves DeepSeek AI pros/cons analysis for an apartment.
 */
app.post('/:id/ai-review', async (c) => {
  const id = c.req.param('id');
  const apartment = await findApartmentById(id);
  if (!apartment) {
    return c.json({ message: 'Apartment listing not found', statusCode: 404 }, 404);
  }

  const ext = (apartment.extractedData || {}) as any;
  if (ext.aiReview) {
    return c.json(ext.aiReview, 200);
  }

  const user = c.get('user');
  const userProfile = user?.username ? await findProfileByUsername(user.username) : await findFirstProfile();

  const aiReview = await generateAiReview(
    apartment.title || ext.title || 'Property',
    apartment.price || ext.price?.amount || 0,
    ext.description || apartment.rawHtml?.slice(0, 5000),
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
  const apartment = await findApartmentById(id);
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

    const newRecord = {
      id,
      url: data.url,
      title: data.title?.trim() || DEFAULT_TITLE,
      price: data.price || 0,
      currency: data.currency || 'EUR',
      status: 'UNPROCESSED' as const,
      roomScores: data.roomScores,
      createdAt: now,
      updatedAt: now,
    };

    const user = c.get('user');
    const created = await createApartment(newRecord);

    // Trigger background scraping without blocking HTTP request thread
    Promise.resolve().then(() => {
      processListingAsync(
        created.id,
        created.url,
        user?.username,
        data.featureRatings,
        data.roomScores,
        created.price,
        created.title
      ).catch((err) => {
        console.error(`[Background Task Error] ${created.id}:`, err);
      });
    });

    return c.json(created, 202);
  }
);

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

    const existing = await findApartmentById(id);
    if (!existing) {
      return c.json({ message: 'Apartment listing not found', statusCode: 404 }, 404);
    }

    const user = c.get('user');
    const userProfile = user?.username ? await findProfileByUsername(user.username) : await findFirstProfile();

    const oldScores = (existing.featureScores || {}) as any;
    let evaluations = (oldScores.evaluations || []) as FeatureEvaluation[];

    // No evaluation set yet (ingestion failed, or this predates scoring) — build one
    // from the same catalogue the scraper uses so both paths score identically.
    if (evaluations.length === 0) {
      evaluations = buildFeatureEvaluations({
        featureWeights: userProfile?.featureWeights as Record<string, unknown> | undefined,
        featureRatings,
        extractedData: existing.extractedData,
      });
    }

    // Update ratings for evaluated features
    const updatedEvaluations = evaluations.map((evalItem) => {
      if (featureRatings && featureRatings[evalItem.featureId] !== undefined) {
        return {
          ...evalItem,
          rating: Number(featureRatings[evalItem.featureId]),
          notes: `Updated to ${Number(featureRatings[evalItem.featureId])}/5 post-viewing.`,
        };
      }
      return evalItem;
    });

    const profile = {
      qualifyingThreshold: 70,
      budgetCeiling: userProfile?.maxRent || 1500,
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
          ext.description || existing.rawHtml?.slice(0, 5000) || '',
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
  const deleted = await removeApartment(id);

  if (!deleted) {
    return c.json({ message: 'Apartment listing not found', statusCode: 404 }, 404);
  }

  return c.json({ success: true, id }, 200);
});

/**
 * GET /api/apartments/:id/messages
 * Fetches messages for an apartment. Does not generate anything if empty.
 */
app.get('/:id/messages', async (c) => {
  const id = c.req.param('id');
  
  const apartment = await findApartmentById(id);
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
  
  const apartment = await findApartmentById(id);
  if (!apartment) {
    return c.json({ message: 'Apartment listing not found', statusCode: 404 }, 404);
  }

  const existingMessages = await findMessagesByApartmentId(id);
  if (existingMessages.length > 0) {
    return c.json({ message: 'Conversation already initialized', statusCode: 400 }, 400);
  }

  const user = c.get('user');
  const userProfile = user?.username ? await findProfileByUsername(user.username) : await findFirstProfile();
  
  const persona = resolvePersona(userProfile);

  const ext = (apartment.extractedData || {}) as any;
  const description = ext.description || apartment.rawHtml?.slice(0, 5000) || '';
  
  const outreach = await draftOutreachMessage(apartment.title, description, persona, ext.aiReview, apartment.featureScores);

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

    const apartment = await findApartmentById(id);
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

    const apartment = await findApartmentById(id);
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

  const apartment = await findApartmentById(id);
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
  const apartment = await findApartmentById(id);
  
  if (!apartment) {
    return c.json({ message: 'Apartment not found', statusCode: 404 }, 404);
  }

  const messages = await findMessagesByApartmentId(id);
  
  const user = c.get('user');
  const userProfile = user?.username ? await findProfileByUsername(user.username) : await findFirstProfile();
  
  const persona = resolvePersona(userProfile);

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

