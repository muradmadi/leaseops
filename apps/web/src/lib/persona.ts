/**
 * The household half of the tenant story: facts that are true of everyone
 * moving in, whoever happens to be writing to the landlord.
 *
 * Work is deliberately absent. A job, its contract, its income and the right to
 * work behind it belong to one person and live on their own account
 * (`WorkProfile`), so a message entered by Paulie says "I" about Paulie. Anything
 * added here is written into every member's letter, which is the test for
 * whether it belongs: phrase it so it stays true in either person's mouth —
 * "Murad's parents can act as guarantors", never "my parents".
 *
 * Stored as a JSON string in `userProfiles.tenantPersona`, one row per household.
 */
export interface HouseholdPersona {
  moveInTimeline: string;
  householdComposition: string;
  pets: string;
  financialGuarantees: string;
  documentsReady: string;
  intendedLeaseLength: string;
  viewingAvailability: string;
  additionalNotes: string;
}

export const EMPTY_HOUSEHOLD_PERSONA: HouseholdPersona = {
  moveInTimeline: '',
  householdComposition: '',
  pets: '',
  financialGuarantees: '',
  documentsReady: '',
  intendedLeaseLength: '',
  viewingAvailability: '',
  additionalNotes: '',
};

/**
 * Reads the stored persona, tolerating everything that has ever been in the
 * column.
 *
 * A value that is not the structured object is kept as free-form notes rather
 * than discarded: profiles predating onboarding hold plain prose, and dropping
 * it would silently remove the user's own description of themselves from every
 * draft. Job keys written before work moved onto the member row are ignored here
 * — the migration moved them to their owner, and reading them back would put one
 * member's job into everybody's letter again.
 */
export function parseHouseholdPersona(raw: string | null | undefined): HouseholdPersona {
  const text = (raw || '').trim();
  if (!text) return { ...EMPTY_HOUSEHOLD_PERSONA };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ...EMPTY_HOUSEHOLD_PERSONA, additionalNotes: text };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ...EMPTY_HOUSEHOLD_PERSONA, additionalNotes: text };
  }

  const source = parsed as Record<string, unknown>;
  const persona = { ...EMPTY_HOUSEHOLD_PERSONA };
  for (const key of Object.keys(persona) as (keyof HouseholdPersona)[]) {
    const value = source[key];
    if (typeof value === 'string') persona[key] = value;
  }
  return persona;
}

export function serialiseHouseholdPersona(persona: HouseholdPersona): string {
  return JSON.stringify(persona, null, 2);
}

/** True when two personas hold the same answers — used to spot a save by the other member. */
export function personasMatch(a: HouseholdPersona, b: HouseholdPersona): boolean {
  return (Object.keys(EMPTY_HOUSEHOLD_PERSONA) as (keyof HouseholdPersona)[]).every(
    (key) => a[key].trim() === b[key].trim()
  );
}

/**
 * Drops the tenant's own [[notes]] from a value being shown back as prose.
 *
 * A note is an instruction to the drafter, not part of the fact, so a summary
 * that reads it out is showing the reader something that will never appear in a
 * message. Editors keep the raw text — the note is only in the way where the
 * field is being *quoted* rather than typed into.
 *
 * Deliberately a copy of the API's `stripAnnotations` rather than an import:
 * `@leaseops/db` is types-only here and nothing in `apps/api` is importable at
 * all. Both sides are covered by their own tests.
 */
export function stripAnnotations(text: string): string {
  return text
    .replace(/\s*\[\[[\s\S]*?\]\]/g, '')
    .replace(/\[\[|\]\]/g, '')
    .trim();
}
