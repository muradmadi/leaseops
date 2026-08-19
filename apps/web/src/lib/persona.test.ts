import { describe, it, expect } from 'bun:test';
import { stripAnnotations, parseHouseholdPersona, EMPTY_HOUSEHOLD_PERSONA } from './persona';

/**
 * The same cases the API asserts on its own copy (`services/llm.test.ts`).
 * Kept in step by hand because this package cannot import runtime code from
 * `apps/api`; a divergence would show a note in one place and hide it in the
 * other, which is exactly the confusion the convention exists to avoid.
 */
describe('stripAnnotations', () => {
  it('removes a note and the space in front of it', () => {
    expect(stripAnnotations('31,500 EUR gross [[do not volunteer this]]')).toBe('31,500 EUR gross');
  });

  it('removes a note that spans lines', () => {
    expect(stripAnnotations('Indefinite contract [[always keep\nthe 30h limit with it]] since August')).toBe(
      'Indefinite contract since August'
    );
  });

  it('removes several notes in one field', () => {
    expect(stripAnnotations('A [[one]] B [[two]] C')).toBe('A B C');
  });

  it('removes a stray unpaired marker', () => {
    expect(stripAnnotations('Guarantors available [[ but only if asked')).toBe(
      'Guarantors available  but only if asked'
    );
  });

  it('leaves ordinary text alone, including single brackets', () => {
    expect(stripAnnotations('Salary is 2.400 € [net] per month')).toBe('Salary is 2.400 € [net] per month');
  });
});

describe('parseHouseholdPersona keeps notes intact', () => {
  it('does not strip on read — the editor shows what the user typed', () => {
    const raw = JSON.stringify({
      ...EMPTY_HOUSEHOLD_PERSONA,
      financialGuarantees: "Two months up front [[don't volunteer the amount]]",
    });
    expect(parseHouseholdPersona(raw).financialGuarantees).toContain('[[');
  });
});
