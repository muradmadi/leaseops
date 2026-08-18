import { describe, it, expect } from 'bun:test';
import { resolvePersona } from './qualification';
import type { UserProfile } from '@leaseops/db';

function profile(overrides: Partial<UserProfile>): UserProfile {
  return { tenantPersona: '', targetLanguage: 'English', ...overrides } as UserProfile;
}

describe('resolvePersona', () => {
  it('reads the structured persona written by onboarding', () => {
    const persona = resolvePersona(
      profile({
        tenantPersona: JSON.stringify({
          documentsReady: 'Payslips, contract, passport',
          pets: 'No pets',
        }),
        targetLanguage: 'German',
      })
    );

    expect(persona.documentsReady).toBe('Payslips, contract, passport');
    expect(persona.pets).toBe('No pets');
    expect(persona.targetLanguage).toBe('German');
  });

  it('keeps a plain-text persona as notes instead of discarding it', () => {
    const prose = 'Senior Software Engineer moving to Berlin. Stable income, non-smoker.';
    const persona = resolvePersona(profile({ tenantPersona: prose }));

    // Regression guard: this used to fail JSON.parse and silently yield an empty
    // persona, so the user's own description never reached the outreach prompt.
    expect(persona.additionalNotes).toBe(prose);
    expect(persona.targetLanguage).toBe('English');
  });

  it('falls back to notes when the stored value is valid JSON but not an object', () => {
    const persona = resolvePersona(profile({ tenantPersona: '"just a quoted string"' }));
    expect(persona.additionalNotes).toBe('"just a quoted string"');
  });

  it('returns only the language for an empty persona', () => {
    const persona = resolvePersona(profile({ tenantPersona: '   ', targetLanguage: 'Spanish' }));
    expect(persona.additionalNotes).toBeUndefined();
    expect(persona.targetLanguage).toBe('Spanish');
  });

  it('defaults the language to English when the profile is missing', () => {
    expect(resolvePersona(undefined).targetLanguage).toBe('English');
  });
});
