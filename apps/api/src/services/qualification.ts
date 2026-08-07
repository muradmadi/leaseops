/**
 * Post-qualification enrichment for LeaseOps.
 *
 * When a listing becomes a qualified lead (an MQL), two things are supposed to
 * follow automatically per the product spec: an AI review explaining why it is a
 * good fit, and — when the user has `autoDraftMessages` enabled — a drafted
 * outreach message in the landlord's language.
 *
 * Both the ingestion pipeline and the post-viewing ratings route funnel through
 * here so a lead is enriched identically no matter which one qualified it.
 */
import {
  findApartmentById,
  findMessagesByApartmentId,
  createMessage,
  updateApartmentEnrichment,
  type Apartment,
  type UserProfile,
} from '@leaseops/db';
import { generateAiReview, draftOutreachMessage, type TenantPersona } from './llm';
import { globalEvents } from './events';

/**
 * Resolves the stored tenant persona into the shape the LLM prompts expect.
 *
 * Onboarding writes structured JSON, but profiles can also hold a plain prose
 * persona (older saves, or a hand-edited value — the onboarding form itself
 * tolerates this on read). Treat that prose as free-form notes rather than
 * discarding it, otherwise the user's own description of themselves never
 * reaches the outreach message and every draft comes out generic.
 */
export function resolvePersona(userProfile?: UserProfile | null): TenantPersona {
  let persona: TenantPersona = {};
  const raw = userProfile?.tenantPersona?.trim();

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      persona = parsed && typeof parsed === 'object' ? parsed : { additionalNotes: raw };
    } catch {
      persona = { additionalNotes: raw };
    }
  }

  persona.targetLanguage = userProfile?.targetLanguage || 'English';
  return persona;
}

/**
 * Generates and persists an AI review for a qualified listing if it does not
 * already have one. Returns the review, or undefined if generation failed.
 */
export async function ensureAiReview(
  apartment: Apartment,
  userProfile?: UserProfile | null
): Promise<any | undefined> {
  const ext = (apartment.extractedData || {}) as any;
  if (ext.aiReview) return ext.aiReview;

  try {
    const aiReview = await generateAiReview(
      apartment.title || ext.title || 'Property',
      apartment.price || ext.price?.amount || 0,
      ext.description || apartment.rawHtml?.slice(0, 5000),
      ext,
      userProfile,
      apartment.featureScores
    );
    await updateApartmentEnrichment(apartment.id, { extractedData: { ...ext, aiReview } });
    console.log(`[Qualification] Generated AI review for qualified lead ${apartment.id}`);
    return aiReview;
  } catch (err: any) {
    console.warn(`[Qualification] AI review generation failed for ${apartment.id}: ${err.message}`);
    return undefined;
  }
}

/**
 * Drafts the initial outreach message for a qualified lead, honouring the user's
 * `autoDraftMessages` preference. Never overwrites an existing conversation.
 */
export async function maybeAutoDraftOutreach(
  apartment: Apartment,
  userProfile?: UserProfile | null,
  aiReview?: any
): Promise<boolean> {
  if (userProfile && userProfile.autoDraftMessages === false) {
    console.log(`[Qualification] Auto-draft disabled in profile; skipping outreach for ${apartment.id}`);
    return false;
  }

  const existing = await findMessagesByApartmentId(apartment.id);
  if (existing.length > 0) return false;

  const ext = (apartment.extractedData || {}) as any;
  const description = ext.description || apartment.rawHtml?.slice(0, 5000) || '';

  try {
    const outreach = await draftOutreachMessage(
      apartment.title,
      description,
      resolvePersona(userProfile),
      aiReview || ext.aiReview,
      apartment.featureScores
    );

    const now = new Date();
    await createMessage({
      id: crypto.randomUUID(),
      apartmentId: apartment.id,
      sender: 'ai_suggestion',
      text: outreach.body,
      status: 'ready',
      metadata: { generated: true, kind: 'outreach', language: outreach.language, auto: true },
      createdAt: now,
      updatedAt: now,
    });
    console.log(`[Qualification] Auto-drafted outreach for qualified lead ${apartment.id}`);
    return true;
  } catch (err: any) {
    console.warn(`[Qualification] Outreach auto-draft failed for ${apartment.id}: ${err.message}`);
    return false;
  }
}

/**
 * Runs the full post-qualification chain for a listing that has just become an MQL.
 *
 * Intended to be fired without awaiting from request handlers: it can take several
 * seconds of LLM time, and the UI picks up the result over the SSE stream.
 */
export async function enrichQualifiedLead(
  apartmentId: string,
  userProfile?: UserProfile | null
): Promise<void> {
  const apartment = await findApartmentById(apartmentId);
  if (!apartment || apartment.status !== 'QUALIFIED') return;

  const aiReview = await ensureAiReview(apartment, userProfile);
  const fresh = (await findApartmentById(apartmentId)) || apartment;
  await maybeAutoDraftOutreach(fresh, userProfile, aiReview);

  globalEvents.emit('apartmentUpdated', { id: apartmentId, status: 'QUALIFIED' });
}
