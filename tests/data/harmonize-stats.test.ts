import { describe, expect, it } from "vitest";
import {
  classifyMonthLeaveOneOut,
  computeReferenceStats,
  leaveOneOutReference,
  percentileRank,
  quantile,
} from "../../src/lib/harmonize";
import type { ReferenceObservation } from "../../src/lib/harmonize";

const history: ReferenceObservation[] = Array.from(
  { length: 9 },
  (_, index) => ({
    year: 2012 + index,
    month: 3,
    value: index + 1,
  }),
);

describe("quantiles and reference statistics", () => {
  it("uses linear interpolation equivalent to percentile_cont", () => {
    const values = [10, 1, 2, 3, 4, 5, 6, 7, 8, 9];

    expect(quantile(values, 0)).toBe(1);
    expect(quantile(values, 0.25)).toBe(3.25);
    expect(quantile(values, 0.5)).toBe(5.5);
    expect(quantile(values, 0.75)).toBe(7.75);
    expect(quantile(values, 0.9)).toBe(9.1);
    expect(quantile(values, 1)).toBe(10);
  });

  it("handles empty, single-value and non-finite input", () => {
    expect(quantile([], 0.5)).toBeNull();
    expect(quantile([7], 0.9)).toBe(7);
    expect(quantile([1, Number.NaN, 3], 0.5)).toBe(2);
    expect(() => quantile([1, 2], 1.1)).toThrow(RangeError);
  });

  it("computes min, max, median and upper quantiles", () => {
    expect(computeReferenceStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toEqual({
      nYears: 10,
      median: 5.5,
      p25: 3.25,
      p75: 7.75,
      p90: 9.1,
      min: 1,
      max: 10,
    });
    expect(computeReferenceStats([])).toEqual({
      nYears: 0,
      median: null,
      p25: null,
      p75: null,
      p90: null,
      min: null,
      max: null,
    });
  });
});

describe("leave-one-out month classification", () => {
  it("excludes the evaluated year and other months from the reference", () => {
    const extended = [...history, { year: 2021, month: 4, value: 100 }];
    const reference = leaveOneOutReference(extended, { year: 2019, month: 3 });

    expect(reference).toEqual({
      nYears: 8,
      median: 4.5,
      p25: 2.75,
      p75: 6.25,
      p90: 7.6,
      min: 1,
      max: 9,
    });
    expect(percentileRank(5, [1, 2, 3, 4, 5, 6, 7, 9])).toBe(0.5625);
  });

  it("uses the documented percentile thresholds when reference activity is sufficient", () => {
    const activeHistory: ReferenceObservation[] = Array.from(
      { length: 9 },
      (_, index) => ({
        year: 2012 + index,
        month: 3,
        value: 5 + index,
      }),
    );
    const classify = (value: number) =>
      classifyMonthLeaveOneOut({
        year: 2019,
        month: 3,
        value,
        history: activeHistory,
      });

    expect(
      leaveOneOutReference(activeHistory, { year: 2019, month: 3 }),
    ).toMatchObject({
      nYears: 8,
      median: 8.5,
      p25: 6.75,
      p75: 10.25,
      p90: 11.6,
    });
    expect(classify(6)).toMatchObject({
      status: "below_usual",
      reason: null,
      percentileRank: 0.1875,
    });
    expect(classify(6.75).status).toBe("usual");
    expect(classify(8.5)).toMatchObject({ status: "usual", ratioToMedian: 1 });
    expect(classify(10.25).status).toBe("usual");
    expect(classify(11)).toMatchObject({
      status: "above_usual",
      ratioToMedian: 11 / 8.5,
    });
    expect(classify(11.6).status).toBe("above_usual");
    expect(classify(11.61).status).toBe("exceptional");
  });

  it("rejects duplicate reference years instead of counting them as separate years", () => {
    const duplicated = [...history, { year: 2015, month: 3, value: 99 }];
    const reference = leaveOneOutReference(duplicated, {
      year: 2019,
      month: 3,
    });
    const result = classifyMonthLeaveOneOut({
      year: 2019,
      month: 3,
      value: 5,
      history: duplicated,
    });

    expect(reference.nYears).toBe(8);
    expect(result.status).toBe("insufficient");
    expect(result.reason).toBe("duplicate_reference_year");
    expect(result.reference.nYears).toBe(8);
  });

  it("returns insufficient when fewer than eight reference years exist", () => {
    const shortHistory = history.slice(0, 7);
    const result = classifyMonthLeaveOneOut({
      year: 2019,
      month: 3,
      value: 10,
      history: shortHistory,
      minReferenceYears: 8,
    });

    expect(result.status).toBe("insufficient");
    expect(result.reason).toBe("insufficient_reference");
    expect(result.reference.nYears).toBe(7);
  });

  it("returns insufficient when median activity is below MIN_ACTIVITY", () => {
    const quietHistory: ReferenceObservation[] = [1, 1, 2, 2, 3, 3, 4, 4].map(
      (value, index) => ({
        year: 2011 + index,
        month: 3,
        value,
      }),
    );
    const result = classifyMonthLeaveOneOut({
      year: 2019,
      month: 3,
      value: 10,
      history: quietHistory,
      minActivity: 5,
    });

    expect(result.status).toBe("insufficient");
    expect(result.reason).toBe("low_activity");
    expect(result.reference.nYears).toBe(8);
  });

  it("returns insufficient for a missing value", () => {
    const result = classifyMonthLeaveOneOut({
      year: 2019,
      month: 3,
      value: null,
      history,
    });

    expect(result.status).toBe("insufficient");
    expect(result.reason).toBe("missing_value");
    expect(result.percentileRank).toBeNull();
  });

  it("excludes partial reference months by default but can include them explicitly", () => {
    const target = { year: 2019, month: 3 };
    const partialHistory: ReferenceObservation[] = [
      ...history,
      { year: 2008, month: 3, value: 999, isPartial: true },
    ];

    expect(leaveOneOutReference(partialHistory, target).nYears).toBe(8);
    expect(
      leaveOneOutReference(partialHistory, target, { includePartial: true })
        .nYears,
    ).toBe(9);
  });
});
