import { describe, it, expect } from 'bun:test';
import {
  FEATURE_NAMES,
  buildFeatureEvaluations,
  buildSpaceEvaluations,
  buildRoomQualityEvaluation,
  rateFloorArea,
  rateRoomCount,
  SPACE_WEIGHT,
  ROOM_QUALITY_WEIGHT,
} from './features';
import { calculateMcdaScore } from './mcda';

/**
 * `FEATURE_NAMES` mirrors `apps/web/src/lib/preferenceMatrixData.ts` by hand, and
 * the two drifted apart the moment the catalogue was reorganised. The web file is
 * read as data rather than imported so this stays a one-way check and does not
 * couple the API build to the web workspace.
 */
const matrixSource = await Bun.file(
  new URL('../../../web/src/lib/preferenceMatrixData.ts', import.meta.url).pathname
).text();

const uiFeatures = [...matrixSource.matchAll(/\{ id: '([^']+)', name: '([^']+)'/g)].map((m) => ({
  id: m[1]!,
  name: m[2]!,
}));

describe('Feature catalogue', () => {
  it('parses the onboarding matrix', () => {
    expect(uiFeatures.length).toBeGreaterThan(30);
  });

  it('has no duplicate feature ids', () => {
    const ids = uiFeatures.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('knows a display name for every feature onboarding can weight', () => {
    const missing = uiFeatures.filter((f) => !(f.id in FEATURE_NAMES)).map((f) => f.id);
    expect(missing).toEqual([]);
  });

  it('uses the same label on both sides of the boundary', () => {
    // Otherwise a compromise summary names a feature differently from the screen
    // the user weighted it on.
    const mismatched = uiFeatures
      .filter((f) => FEATURE_NAMES[f.id] !== f.name)
      .map((f) => `${f.id}: ui="${f.name}" api="${FEATURE_NAMES[f.id]}"`);
    expect(mismatched).toEqual([]);
  });

  it('scores only features weighted 4 or above, plus anything explicitly rated', () => {
    const evaluations = buildFeatureEvaluations({
      featureWeights: { elevator: 5, dishwasher: 4, bidet: 2 },
      featureRatings: { bidet: 5 },
    });
    const ids = evaluations.map((e) => e.featureId);
    expect(ids).toContain('elevator');
    expect(ids).toContain('dishwasher');
    // Weighted 2, so it only appears because it was rated outright.
    expect(ids).toContain('bidet');
    expect(evaluations.find((e) => e.featureId === 'bidet')?.rating).toBe(5);
  });

  it('treats an unrated feature as unknown, not as passing', () => {
    // The default was 4/5, which made a listing nobody had assessed score 80% and
    // qualify. 3 is the midpoint: unknown, and not enough to carry a listing.
    const evaluations = buildFeatureEvaluations({ featureWeights: { elevator: 5 } });
    const elevator = evaluations.find((e) => e.featureId === 'elevator');
    expect(elevator?.rating).toBe(3);
    expect(elevator?.notes).toContain('Not rated yet');
  });

  it('lets an explicit rating decide, since nothing else can', () => {
    const evaluations = buildFeatureEvaluations({
      featureWeights: { elevator: 5 },
      featureRatings: { elevator: 1 },
    });
    const elevator = evaluations.find((e) => e.featureId === 'elevator');
    expect(elevator?.rating).toBe(1);
    expect(elevator?.notes).toContain('Rated by you');
  });
});

describe('Derived space criteria', () => {
  const range = { min: 40, max: 75 };

  it('rises across the range, peaking at the maximum', () => {
    expect(rateFloorArea(40, range.min, range.max)).toBe(3); // minimum met
    expect(rateFloorArea(75, range.min, range.max)).toBe(5); // the size you want
    expect(rateFloorArea(57.5, range.min, range.max)).toBeCloseTo(4, 5);
  });

  it('drops below the penalty floor when under the minimum', () => {
    // Below 3 is what makes the non-negotiable penalty fire, so an undersized flat
    // is punished by the same machinery as a failed dealbreaker.
    expect(rateFloorArea(39, range.min, range.max)).toBeLessThan(3);
    expect(rateFloorArea(0, range.min, range.max)).toBe(0);

    // Squared, not linear: a shortfall gets bad fast past the floor the user drew.
    // Under linear decay a flat 15 m² below a 40 m² minimum still qualified.
    expect(rateFloorArea(20, range.min, range.max)).toBeCloseTo(0.75, 5);
    expect(rateFloorArea(30, range.min, range.max)).toBeLessThan(2);
    // A near miss stays a near miss.
    expect(rateFloorArea(39, range.min, range.max)).toBeGreaterThan(2.5);
  });

  it('tapers above the maximum but never penalises', () => {
    // A maximum exists because more space is more to heat and clean — so oversize
    // stops being ideal. It is not a failure though, so it floors at 3.
    expect(rateFloorArea(90, range.min, range.max)).toBeLessThan(5);
    expect(rateFloorArea(90, range.min, range.max)).toBeGreaterThanOrEqual(3);
    expect(rateFloorArea(500, range.min, range.max)).toBe(3);
  });

  it('scores nothing when the user set no range or the listing states no size', () => {
    expect(rateFloorArea(50, null, null)).toBeNull();
    expect(rateFloorArea(null, 40, 75)).toBeNull();
    expect(rateFloorArea(undefined, 40, 75)).toBeNull();
  });

  it('rates room counts against minimum and ideal, with no taper above ideal', () => {
    expect(rateRoomCount(1, 1, 2)).toBe(3); // minimum met
    expect(rateRoomCount(2, 1, 2)).toBe(5); // ideal
    expect(rateRoomCount(4, 1, 2)).toBe(5); // an extra bedroom is not a burden
    expect(rateRoomCount(0, 1, 2)).toBe(0); // under the minimum
    expect(rateRoomCount(1, 2, 3)).toBeCloseTo(0.75, 5); // half your minimum, punished
  });

  it('penalises an undersized flat through the ordinary critical path', () => {
    const evaluations = buildSpaceEvaluations(
      { floorSizeSqm: { min: 40, max: 75 } },
      { floorSizeSqm: 25 }
    );
    expect(evaluations).toHaveLength(1);
    expect(evaluations[0]!.weight).toBe(SPACE_WEIGHT);

    const result = calculateMcdaScore(evaluations, 1000, {
      qualifyingThreshold: 70,
      budgetCeiling: 1500,
    });
    expect(result.criticalShortfalls).toHaveLength(1);
    expect(result.criticalShortfalls[0]!.name).toBe('Floor Area');
    expect(result.penaltyFactor).toBeLessThan(1);
    // Severe enough that an otherwise flawless listing cannot outrun it.
    expect(result.penaltyFactor).toBeLessThan(0.8);
  });

  it('averages room impressions into one criterion below the penalty threshold', () => {
    const evaluation = buildRoomQualityEvaluation({
      livingRoom: 5,
      bedroom: 4,
      kitchen: 3,
      bathroom: 2,
      entryway: 1,
    });
    expect(evaluation?.rating).toBe(3);
    // Weighted 4, so a poor impression drags the mean but cannot trigger the
    // non-negotiable penalty — it is a judgement, not a stated requirement.
    expect(evaluation?.weight).toBe(ROOM_QUALITY_WEIGHT);
    expect(ROOM_QUALITY_WEIGHT).toBeLessThan(5);
  });

  it('ignores room scores entirely when none were given', () => {
    expect(buildRoomQualityEvaluation(null)).toBeNull();
    expect(buildRoomQualityEvaluation({})).toBeNull();
  });
});
