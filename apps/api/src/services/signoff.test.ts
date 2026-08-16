import { describe, it, expect } from 'bun:test';
import {
  buildSignOffName,
  buildHouseholdSignOff,
  memberName,
  resolveWritingForm,
  buildWritingForms,
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
