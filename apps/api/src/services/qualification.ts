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
  findApartmentByIdUnscoped,
  findHouseholdMembers,
  findMessagesByApartmentId,
  createMessage,
  updateApartmentEnrichment,
  type Apartment,
  type UserProfile,
} from '@leaseops/db';
import { analyseListing, draftOutreachMessage, type TenantPersona } from './llm';
import { resolveLlmConfig } from './anthropic';
import { buildHouseholdSignOff, buildWritingForms, buildPersonaPeople } from './signoff';
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
 * Whose voice a listing's messages are written in, in one place.
 *
 * Three sources in order, and the order is the whole design:
 *
 *   1. `outreachAuthorId` — an explicit choice, when someone has made one.
 *   2. `createdBy` — whoever entered the listing, which is right almost always.
 *   3. neither, on rows that predate both columns → the caller falls through to
 *      the household's oldest member, whose job the shared persona used to hold.
 *
 * Every draft path goes through here so the outreach and the chat reply cannot
 * end up disagreeing about who is writing the same conversation.
 */
export function resolveApartmentAuthorId(
  apartment: Pick<Apartment, 'outreachAuthorId' | 'createdBy'>
): string | null {
  return apartment.outreachAuthorId ?? apartment.createdBy ?? null;
}

/**
 * The persona used for outreach: the household's shared facts, the sign-off, and
 * each member's own work with one of them marked as the author.
 *
 * The author is the member who entered the listing (`apartments.createdBy`),
 * because that is the person sitting on the portal with an account in their own
 * name. Everything downstream follows from it — the draft says "I" about them and
 * names the others for their work. A null author, on a row that predates the
 * column or one whose author has left the household, falls back to the oldest
 * member: that is whose job the shared persona used to carry, so those drafts
 * read as they always did rather than changing owner unannounced.
 *
 * The sign-off is not stored anywhere: it is rebuilt from the members' display
 * names on every draft, so a partner joining or changing their name is reflected
 * immediately instead of leaving a stale name on the letter.
 */
export async function resolveOutreachPersona(
  householdId: string,
  userProfile?: UserProfile | null,
  authorId?: string | null
): Promise<TenantPersona> {
  const persona = resolvePersona(userProfile);

  try {
    const members = await findHouseholdMembers(householdId);
    const signOff = buildHouseholdSignOff(members, persona.targetLanguage);
    if (signOff) persona.signOffName = signOff;

    // Blank when nobody has answered; the prompt then tells the model to write
    // around gendered forms rather than pick one.
    persona.writingForms = buildWritingForms(members);
    persona.people = buildPersonaPeople(members, authorId);
  } catch (err: any) {
    // An unsigned draft is recoverable; a failed draft is not.
    console.warn(`[Qualification] Could not resolve sign-off for household ${householdId}: ${err.message}`);
  }

  return persona;
}

/**
 * Generates and persists an AI review for a qualified listing if it does not
 * already have one. Returns the review, or undefined if generation failed.
 *
 * Billed to the household that owns the listing. That is taken from the
 * apartment row rather than passed in, so background enrichment can never charge
 * the wrong household's key.
 */
export async function ensureAiReview(apartment: Apartment): Promise<any | undefined> {
  const ext = (apartment.extractedData || {}) as any;
  if (ext.aiReview) return ext.aiReview;

  try {
    const aiReview = await analyseListing(
      await resolveLlmConfig(apartment.householdId),
      ext.description || ''
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
  const description = ext.description || '';

  try {
    const outreach = await draftOutreachMessage(
      await resolveLlmConfig(apartment.householdId),
      apartment.title,
      description,
      await resolveOutreachPersona(
        apartment.householdId,
        userProfile,
        resolveApartmentAuthorId(apartment)
      ),
      aiReview || ext.aiReview
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
  userProfile?: UserProfile | null,
  options: { requireQualified?: boolean } = {}
): Promise<void> {
  const { requireQualified = true } = options;
  const apartment = await findApartmentByIdUnscoped(apartmentId);
  if (!apartment) return;
  // Activating a listing that fell short is a deliberate override: the user has
  // decided to chase it anyway, so the AI spend the pipeline withheld is released.
  if (requireQualified && apartment.status !== 'QUALIFIED') return;

  const aiReview = await ensureAiReview(apartment);
  const fresh = (await findApartmentByIdUnscoped(apartmentId)) || apartment;
  await maybeAutoDraftOutreach(fresh, userProfile, aiReview);

  globalEvents.emit('apartmentUpdated', { id: apartmentId, status: apartment.status });
}
