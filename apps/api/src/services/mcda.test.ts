import { describe, it, expect } from 'bun:test';
import {
  calculateMcdaScore,
  deriveHighlights,
  rateValueForMoney,
  MAX_PENALTY_PER_CRITICAL,
  CRITICAL_FLOOR,
  VALUE_FEATURE_ID,
} from './mcda';
import type { FeatureEvaluation, ScoringProfile } from './mcda';

describe('MCDA Lead Scoring Engine', () => {
  const profile: ScoringProfile = {
    qualifyingThreshold: 70,
    budgetCeiling: 1500,
  };

  /** N non-negotiables, all perfect except the ones named in `failures`. */
  const criticals = (n: number, failures: Record<number, number> = {}): FeatureEvaluation[] =>
    Array.from({ length: n }, (_, i) => ({
      featureId: String(i),
      name: `Feature ${i}`,
      weight: 5,
      rating: failures[i] ?? 5,
    }));

  it('qualifies a listing that meets threshold and is within budget', () => {
    const features: FeatureEvaluation[] = [
      { featureId: '1', name: 'Balcony', weight: 3, rating: 4 },
      { featureId: '2', name: 'Elevator', weight: 5, rating: 5 },
      { featureId: '3', name: 'Natural Light', weight: 5, rating: 4 },
    ];

    const result = calculateMcdaScore(features, 1200, profile);
    expect(result.status).toBe('QUALIFIED');
    expect(result.isSoftDealbreaker).toBe(false);
    expect(result.dealbreakerReasons).toHaveLength(0);
    expect(result.totalScore).toBeGreaterThanOrEqual(70);
    // Nothing critical failed, so the score is the plain weighted match.
    expect(result.penaltyFactor).toBe(1);
    expect(result.totalScore).toBe(result.baseScore);
  });

  it('does not dilute a critical shortfall as more non-negotiables are added', () => {
    // The defect this engine was rewritten to fix: under a plain weighted mean,
    // one feature rated 0/5 scored 66.7% against three non-negotiables but 95%
    // against twenty, because every extra criterion grew the denominator. The
    // more you declared non-negotiable, the less any single failure mattered.
    const verdicts = [3, 5, 10, 20].map((n) => calculateMcdaScore(criticals(n, { 0: 0 }), 1000, profile));

    for (const result of verdicts) {
      expect(result.status).toBe('DISQUALIFIED');
      expect(result.isSoftDealbreaker).toBe(true);
    }

    // The penalty itself is identical regardless of list length — that is what
    // makes it non-compensatory.
    const factors = verdicts.map((v) => v.penaltyFactor);
    expect(new Set(factors).size).toBe(1);
    expect(factors[0]).toBe(1 - MAX_PENALTY_PER_CRITICAL);
  });

  it('scales the penalty with how badly the non-negotiable was missed', () => {
    const scoreFor = (rating: number) => calculateMcdaScore(criticals(10, { 0: rating }), 1000, profile);

    // A total failure and a near-miss must not cost the same.
    expect(scoreFor(0).totalScore).toBeLessThan(scoreFor(1).totalScore);
    expect(scoreFor(1).totalScore).toBeLessThan(scoreFor(2).totalScore);
    expect(scoreFor(2).totalScore).toBeLessThan(scoreFor(3).totalScore);

    // At or above the floor there is no penalty at all.
    expect(scoreFor(CRITICAL_FLOOR).penaltyFactor).toBe(1);
    expect(scoreFor(CRITICAL_FLOOR).criticalShortfalls).toHaveLength(0);
  });

  it('fails a non-negotiable rated 1/5 even when everything else is perfect', () => {
    // "Non-negotiable" has to mean something: nine perfect scores cannot buy off
    // a feature the user said they would not compromise on.
    const result = calculateMcdaScore(criticals(10, { 0: 1 }), 1000, profile);
    expect(result.baseScore).toBeGreaterThan(90);
    expect(result.status).toBe('DISQUALIFIED');
  });

  it('lets a borderline 2/5 survive on an otherwise excellent listing', () => {
    // Still a penalty, still reported — but not fatal. This is the "soft" in soft
    // dealbreaker, and the reason it is not a hard veto.
    const result = calculateMcdaScore(criticals(10, { 0: 2 }), 1000, profile);
    expect(result.status).toBe('QUALIFIED');
    expect(result.isSoftDealbreaker).toBe(true);
    expect(result.pointsLostToCriticals).toBeGreaterThan(0);
  });

  it('compounds multiple critical shortfalls', () => {
    const one = calculateMcdaScore(criticals(12, { 0: 1 }), 1000, profile);
    const two = calculateMcdaScore(criticals(12, { 0: 1, 1: 1 }), 1000, profile);
    const three = calculateMcdaScore(criticals(12, { 0: 1, 1: 1, 2: 1 }), 1000, profile);

    expect(two.totalScore).toBeLessThan(one.totalScore);
    expect(three.totalScore).toBeLessThan(two.totalScore);
    expect(three.criticalShortfalls).toHaveLength(3);
    // Multiplicative, so the score approaches zero rather than going negative.
    expect(three.totalScore).toBeGreaterThan(0);
  });

  it('reports every point it removed, attributed to a named feature', () => {
    // The compromise summary quotes these, so they must be measured, not narrated.
    const result = calculateMcdaScore(
      [
        { featureId: 'a', name: 'Pet Friendly', weight: 5, rating: 1 },
        { featureId: 'b', name: 'Natural Light', weight: 5, rating: 5 },
        { featureId: 'c', name: 'Balcony', weight: 3, rating: 5 },
      ],
      1200,
      profile
    );

    expect(result.criticalShortfalls).toHaveLength(1);
    const [shortfall] = result.criticalShortfalls;
    expect(shortfall!.name).toBe('Pet Friendly');
    expect(shortfall!.rating).toBe(1);
    expect(shortfall!.pointsLost).toBeGreaterThan(0);
    expect(result.dealbreakerReasons[0]).toContain('Pet Friendly');
    expect(result.dealbreakerReasons[0]).toContain('costing');
    // The arithmetic has to reconcile, or the explanation is fiction.
    expect(result.baseScore - result.totalScore).toBeCloseTo(result.pointsLostToCriticals, 1);
  });

  it('only penalises weight-5 features, leaving weight 4 compensatory', () => {
    // A weight-4 feature is a strong preference, not a non-negotiable: it drags
    // the weighted mean down and nothing more.
    const result = calculateMcdaScore(
      [
        { featureId: 'a', name: 'Dishwasher', weight: 4, rating: 0 },
        { featureId: 'b', name: 'Natural Light', weight: 5, rating: 5 },
      ],
      1200,
      profile
    );
    expect(result.penaltyFactor).toBe(1);
    expect(result.criticalShortfalls).toHaveLength(0);
    expect(result.isSoftDealbreaker).toBe(false);
  });

  it('disqualifies a listing that exceeds budget ceiling even if score is high', () => {
    const result = calculateMcdaScore(criticals(3), 1600, profile);
    expect(result.status).toBe('DISQUALIFIED');
    expect(result.exceedsBudget).toBe(true);
    expect(result.dealbreakerReasons).toHaveLength(0);
  });

  it('disqualifies when the weighted match alone falls below threshold', () => {
    const features: FeatureEvaluation[] = [
      { featureId: '1', name: 'Balcony', weight: 3, rating: 2 },
      { featureId: '2', name: 'Elevator', weight: 5, rating: 2 },
    ];
    const result = calculateMcdaScore(features, 1000, profile);
    expect(result.status).toBe('DISQUALIFIED');
    expect(result.totalScore).toBeLessThan(70);
  });

  describe('value for money', () => {
    const valued: ScoringProfile = { qualifyingThreshold: 70, budgetCeiling: 1500, idealRent: 1200 };
    const feats: FeatureEvaluation[] = [
      { featureId: 'a', name: 'Natural Light', weight: 5, rating: 5 },
      { featureId: 'b', name: 'Elevator', weight: 5, rating: 5 },
    ];

    it('rates rent full marks at or below the ideal, zero at the ceiling', () => {
      expect(rateValueForMoney(700, 1200, 1500)).toBe(5);
      expect(rateValueForMoney(1200, 1200, 1500)).toBe(5);
      expect(rateValueForMoney(1500, 1200, 1500)).toBe(0);
      expect(rateValueForMoney(1350, 1200, 1500)).toBeCloseTo(2.5, 5);
    });

    it('separates flats that used to score identically', () => {
      // The defect: rent was a pass/fail gate, so €700 and €1499 scored the same.
      const cheap = calculateMcdaScore(feats, 700, valued);
      const atCeiling = calculateMcdaScore(feats, 1499, valued);
      expect(cheap.totalScore).toBeGreaterThan(atCeiling.totalScore);
      expect(cheap.valueRating).toBe(5);
      expect(atCeiling.valueRating).toBeLessThan(0.1);
    });

    it('never penalises a flat twice for its price', () => {
      // Rent is exempt from the critical penalty: the budget ceiling is already its
      // hard gate, so a flat just under the ceiling must not also be treated as a
      // failed non-negotiable.
      const atCeiling = calculateMcdaScore(feats, 1499, valued);
      expect(atCeiling.penaltyFactor).toBe(1);
      expect(atCeiling.criticalShortfalls).toHaveLength(0);
    });

    it('skips value scoring entirely when no ideal rent is set', () => {
      const noIdeal: ScoringProfile = { qualifyingThreshold: 70, budgetCeiling: 1500 };
      const a = calculateMcdaScore(feats, 700, noIdeal);
      const b = calculateMcdaScore(feats, 1499, noIdeal);
      expect(a.valueRating).toBeNull();
      // Without an ideal there is nothing to measure value against, so rent stays
      // a pure gate rather than being scored against an invented target.
      expect(a.totalScore).toBe(b.totalScore);
    });
  });

  it('returns a zero score rather than NaN when nothing is scored', () => {
    const result = calculateMcdaScore([], 1000, profile);
    expect(result.totalScore).toBe(0);
    expect(result.baseScore).toBe(0);
    expect(result.penaltyFactor).toBe(1);
    expect(result.status).toBe('DISQUALIFIED');
  });
});

describe('Derived highlights', () => {
  const profile: ScoringProfile = { qualifyingThreshold: 70, budgetCeiling: 1500, idealRent: 1200 };

  it('states the score and what the non-negotiables cost, without a model', () => {
    const features: FeatureEvaluation[] = [
      { featureId: 'a', name: 'Natural Light', weight: 5, rating: 5 },
      { featureId: 'b', name: 'Heating Quality', weight: 5, rating: 1 },
      { featureId: 'c', name: 'Dishwasher', weight: 4, rating: 2 },
    ];
    const result = calculateMcdaScore(features, 1100, profile);
    const highlights = deriveHighlights(features, result, {
      price: 1100,
      budgetCeiling: profile.budgetCeiling,
      idealRent: profile.idealRent,
    });

    expect(highlights.verdict).toContain(String(result.totalScore));
    expect(highlights.verdict).toContain('non-negotiables');
    expect(highlights.strengths).toHaveLength(1);
    expect(highlights.strengths[0]).toContain('Natural Light');
    // The critical shortfall is named with its cost; the weight-4 miss is listed
    // separately and not duplicated.
    expect(highlights.concerns[0]).toContain('Heating Quality');
    expect(highlights.concerns.some((c) => c.includes('Dishwasher'))).toBe(true);
    expect(highlights.concerns.filter((c) => c.includes('Heating Quality'))).toHaveLength(1);
  });

  it('reports an over-budget listing first', () => {
    const features: FeatureEvaluation[] = [{ featureId: 'a', name: 'Light', weight: 5, rating: 5 }];
    const result = calculateMcdaScore(features, 1600, profile);
    const highlights = deriveHighlights(features, result, {
      price: 1600,
      budgetCeiling: profile.budgetCeiling,
    });
    expect(highlights.concerns[0]).toContain('over your ceiling');
    expect(highlights.verdict).toContain('ceiling');
  });

  it('says nothing about strengths or concerns when there are none', () => {
    const features: FeatureEvaluation[] = [{ featureId: 'a', name: 'Light', weight: 3, rating: 3 }];
    const result = calculateMcdaScore(features, 1000, profile);
    const highlights = deriveHighlights(features, result, { price: 1000, budgetCeiling: 1500 });
    expect(highlights.strengths).toEqual([]);
    expect(highlights.concerns).toEqual([]);
  });

  /**
   * The rows are only worth showing if they add up to the score printed beside
   * them. These three identities are the whole contract — break one and the card
   * is explaining a number the engine did not produce.
   */
  describe('per-criterion rows reconcile against the score', () => {
    const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

    it('accounts for every point between 100 and the final score', () => {
      const features: FeatureEvaluation[] = [
        { featureId: 'a', name: 'Natural Light', weight: 5, rating: 5 },
        { featureId: 'b', name: 'Heating Quality', weight: 5, rating: 1 },
        { featureId: 'c', name: 'Dishwasher', weight: 4, rating: 2 },
        { featureId: 'd', name: 'Balcony', weight: 2, rating: 3 },
      ];
      const result = calculateMcdaScore(features, 1300, profile);
      const { rows } = deriveHighlights(features, result, {
        price: 1300,
        budgetCeiling: profile.budgetCeiling,
        idealRent: profile.idealRent,
      });

      expect(sum(rows.map((r) => r.pointsEarned))).toBeCloseTo(result.baseScore, 1);
      expect(sum(rows.map((r) => r.pointsForfeited))).toBeCloseTo(100 - result.baseScore, 1);
      expect(sum(rows.map((r) => r.penaltyPoints))).toBeCloseTo(
        result.pointsLostToCriticals,
        1
      );
    });

    it('includes rent as a criterion, since the score does', () => {
      const features: FeatureEvaluation[] = [
        { featureId: 'a', name: 'Light', weight: 5, rating: 5 },
      ];
      const result = calculateMcdaScore(features, 1350, profile);
      const { rows } = deriveHighlights(features, result, {
        price: 1350,
        budgetCeiling: profile.budgetCeiling,
        idealRent: profile.idealRent,
      });

      const value = rows.find((r) => r.featureId === VALUE_FEATURE_ID);
      expect(value?.isValue).toBe(true);
      expect(result.valueRating).not.toBeNull();
      expect(value?.rating).toBe(result.valueRating as number);
      // Rent is exempt from the non-negotiable penalty even rated below the
      // floor — the budget ceiling is already price's hard gate.
      expect(value?.penaltyPoints).toBe(0);
      expect(sum(rows.map((r) => r.pointsEarned))).toBeCloseTo(result.baseScore, 1);
    });

    it('omits rent entirely when no ideal is set, rather than inventing a target', () => {
      const features: FeatureEvaluation[] = [
        { featureId: 'a', name: 'Light', weight: 5, rating: 4 },
      ];
      const noIdeal: ScoringProfile = { qualifyingThreshold: 70, budgetCeiling: 1500 };
      const result = calculateMcdaScore(features, 1200, noIdeal);
      const { rows } = deriveHighlights(features, result, { price: 1200, budgetCeiling: 1500 });

      expect(rows.some((r) => r.isValue)).toBe(false);
      expect(rows).toHaveLength(1);
      expect(sum(rows.map((r) => r.pointsEarned))).toBeCloseTo(result.baseScore, 1);
    });

    it('attributes the penalty to the feature that caused it', () => {
      const features: FeatureEvaluation[] = [
        { featureId: 'a', name: 'Light', weight: 5, rating: 5 },
        { featureId: 'b', name: 'Lift', weight: 5, rating: 0 },
      ];
      const result = calculateMcdaScore(features, 1200, profile);
      const { rows } = deriveHighlights(features, result, {
        price: 1200,
        budgetCeiling: profile.budgetCeiling,
        idealRent: profile.idealRent,
      });

      const lift = rows.find((r) => r.featureId === 'b');
      expect(lift?.penaltyPoints).toBeGreaterThan(0);
      expect(lift?.pointsEarned).toBe(0);
      expect(rows.find((r) => r.featureId === 'a')?.penaltyPoints).toBe(0);
    });
  });
});
