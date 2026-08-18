import { describe, it, expect } from 'bun:test';
import {
  buildSignOffName,
  buildHouseholdSignOff,
  memberName,
  resolveWritingForm,
  buildWritingForms,
  buildPersonaPeople,
} from './signoff';

describe('Outreach sign-off derivation', () => {
  it('uses a single name unchanged', () => {
    expect(buildSignOffName(['Murad'], 'English')).toBe('Murad');
  });

  it('joins two household members in the target language', () => {
    expect(buildSignOffName(['Murad', 'Paulie'], 'English')).toBe('Murad and Paulie');
    expect(buildSignOffName(['Murad', 'Paulie'], 'Spanish')).toBe('Murad y Paulie');
    expect(buildSignOffName(['Murad', 'Paulie'], 'German')).toBe('Murad und Paulie');
    expect(buildSignOffName(['Murad', 'Paulie'], 'French')).toBe('Murad et Paulie');
    expect(buildSignOffName(['Murad', 'Paulie'], 'Dutch')).toBe('Murad en Paulie');
    expect(buildSignOffName(['Murad', 'Paulie'], 'Swedish')).toBe('Murad och Paulie');
  });

  it('applies the Spanish y/e rule before an i- sound', () => {
    // "y" would be swallowed by the following vowel sound, so Spanish uses "e".
    expect(buildSignOffName(['Murad', 'Irene'], 'Spanish')).toBe('Murad e Irene');
    expect(buildSignOffName(['Murad', 'Higinio'], 'Spanish')).toBe('Murad e Higinio');
    // "hie-" is pronounced "ye", so the exception does not apply.
    expect(buildSignOffName(['Murad', 'Hierro'], 'Spanish')).toBe('Murad y Hierro');
  });

  it('joins Japanese names without surrounding spaces', () => {
    expect(buildSignOffName(['Murad', 'Paulie'], 'Japanese')).toBe('MuradとPaulie');
  });

  it('handles three or more members', () => {
    expect(buildSignOffName(['A', 'B', 'C'], 'English')).toBe('A, B and C');
    expect(buildSignOffName(['A', 'B', 'C'], 'Spanish')).toBe('A, B y C');
  });

  it('falls back to English for an unknown language rather than dropping the conjunction', () => {
    expect(buildSignOffName(['Murad', 'Paulie'], 'Klingon')).toBe('Murad and Paulie');
  });

  it('returns empty rather than inventing a signature when there are no names', () => {
    expect(buildSignOffName([], 'English')).toBe('');
    expect(buildSignOffName(['   ', ''], 'English')).toBe('');
  });

  it('falls back to a username when a member set no display name', () => {
    expect(memberName({ displayName: '  ', username: 'murad' })).toBe('murad');
    expect(memberName({ displayName: 'Murad', username: 'murad' })).toBe('Murad');
    expect(memberName({ displayName: null, username: null })).toBe('');
  });

  it('skips members with no usable name at all', () => {
    const out = buildHouseholdSignOff(
      [
        { displayName: 'Murad', username: 'murad' },
        { displayName: null, username: null },
        { displayName: 'Paulie', username: 'paulie' },
      ],
      'English'
    );
    expect(out).toBe('Murad and Paulie');
  });
});

describe('Grammatical form resolution', () => {
  it('maps male and female straight through', () => {
    expect(resolveWritingForm({ gender: 'male' })).toBe('masculine');
    expect(resolveWritingForm({ gender: 'female' })).toBe('feminine');
  });

  it('reads the stored form only for "other"', () => {
    expect(resolveWritingForm({ gender: 'other', grammaticalForm: 'feminine' })).toBe('feminine');
    expect(resolveWritingForm({ gender: 'other', grammaticalForm: 'neutral' })).toBe('neutral');
    expect(resolveWritingForm({ gender: 'other' })).toBe('neutral');
  });

  it('ignores a stale grammaticalForm when gender is not "other"', () => {
    // The columns cannot contradict each other: a leftover value from an earlier
    // answer must never override the explicit one.
    expect(resolveWritingForm({ gender: 'male', grammaticalForm: 'feminine' })).toBe('masculine');
  });

  it('returns null when the question was never answered', () => {
    expect(resolveWritingForm({})).toBeNull();
    expect(resolveWritingForm({ gender: null })).toBeNull();
  });

  it('never infers a form from the display name', () => {
    // "Alexis" is genuinely ambiguous, and guessing misgenders the sender in
    // their own letter. An unanswered question stays unanswered.
    expect(resolveWritingForm({ displayName: 'Alexis' })).toBeNull();
    expect(resolveWritingForm({ displayName: 'Paula' })).toBeNull();
    expect(resolveWritingForm({ displayName: 'Murad' })).toBeNull();
  });

  it('describes each member for the prompt', () => {
    const out = buildWritingForms([
      { displayName: 'Murad', gender: 'male' },
      { displayName: 'Paulie', gender: 'female' },
    ]);
    expect(out).toBe('- Murad: masculine forms\n- Paulie: feminine forms');
  });

  it('spells out the neutral instruction rather than naming a form', () => {
    const out = buildWritingForms([{ displayName: 'Sam', gender: 'other', grammaticalForm: 'neutral' }]);
    expect(out).toBe('- Sam: use wording that avoids grammatical gender');
  });

  it('omits members who have not answered, and is blank when nobody has', () => {
    expect(buildWritingForms([{ displayName: 'Murad', gender: 'male' }, { displayName: 'Paulie' }])).toBe(
      '- Murad: masculine forms'
    );
    expect(buildWritingForms([{ displayName: 'Murad' }])).toBe('');
    expect(buildWritingForms([])).toBe('');
  });

  it('skips a member with a form but no usable name', () => {
    expect(buildWritingForms([{ displayName: null, username: null, gender: 'male' }])).toBe('');
  });
});

describe('buildPersonaPeople', () => {
  const murad = {
    id: 'u_murad',
    displayName: 'Murad',
    workProfile: {
      employmentStatus: 'employed' as const,
      occupation: 'MarTech Specialist at LeadTech, remote',
      contractDetails: 'permanent, 30h',
      rightToWork: 'student visa changing to a work visa',
    },
  };
  const paulie = {
    id: 'u_paulie',
    displayName: 'Paulie',
    workProfile: { employmentStatus: 'student' as const, occupation: 'Nursing degree, final year' },
  };

  it('marks the member who entered the listing as the writer', () => {
    const people = buildPersonaPeople([murad, paulie], 'u_paulie');

    expect(people.map((p) => p.name)).toEqual(['Murad', 'Paulie']);
    expect(people.find((p) => p.name === 'Paulie')?.isAuthor).toBe(true);
    expect(people.find((p) => p.name === 'Murad')?.isAuthor).toBe(false);
  });

  it('keeps each member\'s work on their own line', () => {
    const people = buildPersonaPeople([murad, paulie], 'u_paulie');

    // The bug this exists to prevent: Paulie's letter narrating Murad's job in
    // the first person, because the facts had no owner.
    const author = people.find((p) => p.isAuthor)!;
    expect(author.occupation).toBe('Nursing degree, final year');
    expect(author.contractDetails).toBeUndefined();
    expect(author.rightToWork).toBeUndefined();
    expect(people.find((p) => !p.isAuthor)?.rightToWork).toBe('student visa changing to a work visa');
  });

  it('states the employment status in prose rather than the stored token', () => {
    const people = buildPersonaPeople([murad, paulie], 'u_paulie');
    expect(people.map((p) => p.employmentStatus)).toEqual(['employed', 'a student']);
  });

  it('falls back to the oldest member when the author is unknown', () => {
    // Listings entered before authorship was recorded, and listings whose author
    // has since left. The oldest account is whose job the shared persona held, so
    // those drafts keep reading as they always did.
    expect(buildPersonaPeople([murad, paulie], null)[0].isAuthor).toBe(true);
    expect(buildPersonaPeople([murad, paulie], 'u_departed')[0].isAuthor).toBe(true);
  });

  it('never leaves a household without an author', () => {
    // A draft with nobody marked has no first person, and the model picks one.
    for (const authorId of [null, undefined, '', 'nobody']) {
      expect(buildPersonaPeople([murad, paulie], authorId).filter((p) => p.isAuthor)).toHaveLength(1);
    }
  });

  it('reports a member with no work rather than dropping them from the household', () => {
    const people = buildPersonaPeople([murad, { id: 'u_x', displayName: 'Alex' }], 'u_murad');
    expect(people).toHaveLength(2);
    expect(people[1]).toMatchObject({ name: 'Alex', isAuthor: false, occupation: undefined });
  });

  it('skips a member with no usable name, as the sign-off does', () => {
    expect(buildPersonaPeople([{ id: 'u_x', displayName: null, username: null }], 'u_x')).toEqual([]);
    expect(buildPersonaPeople([], null)).toEqual([]);
  });
});
