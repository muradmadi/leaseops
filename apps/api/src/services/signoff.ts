/**
 * Turns a household's members into the parts of a draft that are about people:
 * the sign-off, the grammatical form to write each member in, and who does what
 * for a living.
 *
 * The name is derived, never typed: it comes from what each member is already
 * called in the household, so it cannot drift out of sync with the account. Two
 * partners hunting together sign jointly ("Murad and Paulie"), and the
 * conjunction follows the target language, since the whole message is written in
 * the landlord's language and an English "and" in the middle of a Spanish letter
 * reads as a template.
 */
import type { Gender, GrammaticalForm, EmploymentStatus, WorkProfile } from '@leaseops/db';
import type { PersonaPerson } from './llm';

/** Conjunction used to join the final two names, keyed by onboarding language. */
const CONJUNCTIONS: Record<string, string> = {
  English: 'and',
  German: 'und',
  Spanish: 'y',
  French: 'et',
  Italian: 'e',
  Portuguese: 'e',
  Dutch: 'en',
  Japanese: 'と',
  Swedish: 'och',
};

/** Languages written without spaces around a joining particle. */
const UNSPACED_LANGUAGES = new Set(['Japanese']);

/**
 * Spanish turns "y" into "e" before a word beginning with an i- sound, so it is
 * "Murad e Irene" but "Murad y Hierro" — the exception does not apply to "hie-",
 * which is pronounced "ye".
 */
function spanishConjunction(nextName: string): string {
  const next = nextName.trim().toLowerCase();
  if (/^hie/.test(next)) return 'y';
  if (/^i/.test(next) || /^hi/.test(next)) return 'e';
  return 'y';
}

export interface SignOffMember {
  id?: string;
  displayName?: string | null;
  username?: string | null;
  gender?: Gender | null;
  grammaticalForm?: GrammaticalForm | null;
  workProfile?: WorkProfile | null;
}

/**
 * How each employment status is put to a landlord.
 *
 * Prose rather than the stored token, because the token is a database value and
 * "student_working" is not a sentence. Stated plainly and without softening:
 * `not_working` says so, since an owner finds out anyway and rule 2a wants the
 * true position said in a few words rather than hidden.
 */
const EMPLOYMENT_STATUS_PHRASES: Record<EmploymentStatus, string> = {
  employed: 'employed',
  self_employed: 'self-employed',
  student: 'a student',
  student_working: 'a student who also works',
  retired: 'retired',
  not_working: 'not currently working',
};

/** How the draft must inflect first-person wording about a member. */
export type WritingForm = GrammaticalForm;

/**
 * Resolves the grammatical form to write about a member in.
 *
 * 'male' and 'female' map straight through, so the stored `grammaticalForm` is
 * only ever read for 'other' — the two columns therefore cannot disagree. An
 * unanswered question returns null, which the prompt turns into "write around
 * gendered forms", never into a guess. This is deliberately not inferred from
 * the display name: "Alexis" is genuinely ambiguous, and the cost of being wrong
 * is a letter that misgenders the person sending it.
 */
export function resolveWritingForm(member: SignOffMember): WritingForm | null {
  if (member.gender === 'male') return 'masculine';
  if (member.gender === 'female') return 'feminine';
  if (member.gender === 'other') return member.grammaticalForm ?? 'neutral';
  return null;
}

/**
 * Describes, per member, how to write about them — the line handed to the model.
 *
 * Returns an empty string when nobody has answered, so the prompt can omit the
 * section entirely rather than carry an empty heading.
 */
export function buildWritingForms(members: SignOffMember[]): string {
  const lines = members
    .map((m) => ({ name: memberName(m), form: resolveWritingForm(m) }))
    .filter((m) => m.name && m.form)
    .map(({ name, form }) =>
      form === 'neutral'
        ? `- ${name}: use wording that avoids grammatical gender`
        : `- ${name}: ${form} forms`
    );

  return lines.join('\n');
}

/**
 * Describes who is moving in and what each of them does, with exactly one of
 * them marked as the person writing.
 *
 * `authorId` is the member who entered the listing. An id that matches nobody —
 * an older listing with no author recorded, or an author who has since left the
 * household — falls back to the first member, who is the oldest account and
 * therefore the one whose job the shared persona used to hold. The fallback is
 * never "nobody": a draft with no author marked has no first person at all, and
 * the model would pick one.
 *
 * Members with no name are dropped for the same reason they are dropped from the
 * sign-off — there is nothing truthful to call them in a letter.
 */
export function buildPersonaPeople(
  members: SignOffMember[],
  authorId?: string | null
): PersonaPerson[] {
  const named = members.filter((m) => memberName(m));
  if (named.length === 0) return [];

  const author = named.find((m) => m.id && m.id === authorId) ?? named[0];

  return named.map((member) => {
    const work = member.workProfile || {};
    return {
      name: memberName(member),
      isAuthor: member === author,
      employmentStatus: work.employmentStatus
        ? EMPLOYMENT_STATUS_PHRASES[work.employmentStatus]
        : undefined,
      occupation: work.occupation?.trim() || undefined,
      contractDetails: work.contractDetails?.trim() || undefined,
      income: work.income?.trim() || undefined,
      rightToWork: work.rightToWork?.trim() || undefined,
    };
  });
}

/**
 * Resolves what a member should be called: their display name, falling back to
 * their username. Never invents a name — a member with neither is skipped.
 */
export function memberName(member: SignOffMember): string {
  return (member.displayName?.trim() || member.username?.trim() || '').trim();
}

/**
 * Joins names into a sign-off for the given language.
 * Returns an empty string when there is nothing real to sign with, so the caller
 * can leave the draft unsigned rather than inventing a signature.
 */
export function buildSignOffName(names: string[], language = 'English'): string {
  const clean = names.map((n) => n.trim()).filter((n) => n.length > 0);

  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0];

  const conjunction = CONJUNCTIONS[language] ?? CONJUNCTIONS.English;

  if (UNSPACED_LANGUAGES.has(language)) {
    return clean.join(conjunction);
  }

  const last = clean[clean.length - 1]!;
  const leading = clean.slice(0, -1).join(', ');
  const finalConjunction = language === 'Spanish' ? spanishConjunction(last) : conjunction;

  return `${leading} ${finalConjunction} ${last}`;
}

/**
 * Convenience wrapper: household members in, sign-off out.
 * Members are expected in a stable order (oldest first) so the same household
 * always signs the same way.
 */
export function buildHouseholdSignOff(members: SignOffMember[], language = 'English'): string {
  return buildSignOffName(members.map(memberName), language);
}
