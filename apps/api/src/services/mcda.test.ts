import { describe, it, expect } from 'bun:test';
import { calculateMcdaScore } from './mcda';
import type { FeatureEvaluation, ScoringProfile } from './mcda';

describe('MCDA Lead Scoring Engine', () => {
  const profile: ScoringProfile = {
    qualifyingThreshold: 70,
    budgetCeiling: 1500,
  };

  it('qualifies a listing that meets threshold and is within budget', () => {
    const features: FeatureEvaluation[] = [
      { featureId: '1', name: 'Balcony', weight: 3, rating: 4 },
      { featureId: '2', name: 'Elevator', weight: 5, rating: 5 },
      { featureId: '3', name: 'Natural Light', weight: 5, rating: 4 },
    ];
    const price = 1200;

    const result = calculateMcdaScore(features, price, profile);
    expect(result.status).toBe('QUALIFIED');
    expect(result.isSoftDealbreaker).toBe(false);
    expect(result.dealbreakerReasons).toHaveLength(0);
    expect(result.totalScore).toBeGreaterThanOrEqual(70);
  });

  it('flags a Soft Dealbreaker and disqualifies when math score drops below threshold', () => {
    const features: FeatureEvaluation[] = [
      { featureId: '1', name: 'Balcony', weight: 3, rating: 5 },
      { featureId: '2', name: 'Pet Friendly', weight: 5, rating: 1 }, // Soft Dealbreaker
      { featureId: '3', name: 'Natural Light', weight: 5, rating: 5 },
    ];
    const price = 1200;

    const result = calculateMcdaScore(features, price, profile);
    expect(result.status).toBe('DISQUALIFIED');
    expect(result.isSoftDealbreaker).toBe(true);
    expect(result.dealbreakerReasons).toContain(
      'Critical non-negotiable feature "Pet Friendly" scored 1/5.'
    );
  });

  it('allows a listing with a Soft Dealbreaker to remain QUALIFIED if overall math score meets threshold', () => {
    const features: FeatureEvaluation[] = [
      { featureId: '1', name: 'Balcony', weight: 3, rating: 5 },
      { featureId: '2', name: 'Pet Friendly', weight: 5, rating: 1 }, // Soft Dealbreaker
      { featureId: '3', name: 'Natural Light', weight: 5, rating: 5 },
      { featureId: '4', name: 'Elevator', weight: 5, rating: 5 },
      { featureId: '5', name: 'Quiet Neighborhood', weight: 5, rating: 5 },
    ];
    const price = 1200;

    const result = calculateMcdaScore(features, price, profile);
    expect(result.status).toBe('QUALIFIED');
    expect(result.isSoftDealbreaker).toBe(true);
    expect(result.dealbreakerReasons).toContain(
      'Critical non-negotiable feature "Pet Friendly" scored 1/5.'
    );
  });

  it('disqualifies a listing that exceeds budget ceiling even if score is high', () => {
    const features: FeatureEvaluation[] = [
      { featureId: '1', name: 'Elevator', weight: 5, rating: 5 },
      { featureId: '2', name: 'Natural Light', weight: 5, rating: 5 },
    ];
    const price = 1600; // Exceeds 1500 ceiling

    const result = calculateMcdaScore(features, price, profile);
    expect(result.status).toBe('DISQUALIFIED');
    expect(result.exceedsBudget).toBe(true);
    expect(result.dealbreakerReasons).toHaveLength(0);
  });

  it('disqualifies when total score falls below threshold', () => {
    const features: FeatureEvaluation[] = [
      { featureId: '1', name: 'Balcony', weight: 3, rating: 2 },
      { featureId: '2', name: 'Elevator', weight: 5, rating: 2 },
    ];
    const price = 1000;

    const result = calculateMcdaScore(features, price, profile);
    expect(result.status).toBe('DISQUALIFIED');
    expect(result.totalScore).toBeLessThan(70);
  });
});
