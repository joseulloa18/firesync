import { describe, expect, it } from "vitest";
import {
  DEFAULT_WINDOW_DAYS,
  IngestPlanError,
  PLAN_SOURCES,
  isPlanSource,
  planIngestWindows,
} from "../../src/lib/ingest/plan";
import type { IngestPlanInput, IngestWindow } from "../../src/lib/ingest/plan";
import { isFirmsSource } from "../../src/lib/firms-client";
import type { FirmsAreaRequest } from "../../src/lib/firms-client";

const BBOX = [-72.6, 17.0, -67.7, 20.6] as const;

const BASE: IngestPlanInput = {
  startDate: "2024-01-01",
  endDate: "2024-01-10",
  bbox: BBOX,
  sources: ["MODIS_SP"],
};

function datesOf(windows: readonly IngestWindow[]): string[] {
  return windows.map((window) => `${window.startDate}..${window.endDate}`);
}

function expandDates(windows: readonly IngestWindow[]): string[] {
  const days: string[] = [];
  for (const window of windows) {
    const start = Date.parse(`${window.startDate}T00:00:00Z`);
    const end = Date.parse(`${window.endDate}T00:00:00Z`);
    for (let cursor = start; cursor <= end; cursor += 86_400_000) {
      days.push(new Date(cursor).toISOString().slice(0, 10));
    }
  }
  return days;
}

function catchPlanError(input: IngestPlanInput): IngestPlanError {
  try {
    planIngestWindows(input);
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(IngestPlanError);
    return error as IngestPlanError;
  }
  throw new Error("Expected planIngestWindows to throw.");
}

const INVALID_NOAA =
  "VIIRS_NOAA20_SP" as unknown as (typeof PLAN_SOURCES)[number];

describe("planIngestWindows", () => {
  it("plans default 5-day windows and cuts the last one at the end", () => {
    const windows = planIngestWindows(BASE);

    expect(windows).toHaveLength(2);
    expect(datesOf(windows)).toEqual([
      "2024-01-01..2024-01-05",
      "2024-01-06..2024-01-10",
    ]);
    expect(windows.map((window) => window.dayRange)).toEqual([5, 5]);
    expect(windows.every((window) => window.source === "MODIS_SP")).toBe(true);

    const shortened = planIngestWindows({ ...BASE, endDate: "2024-01-08" });
    expect(datesOf(shortened)).toEqual([
      "2024-01-01..2024-01-05",
      "2024-01-06..2024-01-08",
    ]);
    expect(shortened[1].dayRange).toBe(3);
  });

  it("uses 5 days by default and accepts 1 to 5 day windows", () => {
    expect(DEFAULT_WINDOW_DAYS).toBe(5);
    expect(planIngestWindows(BASE)[0].dayRange).toBe(5);

    const single = planIngestWindows({ ...BASE, windowDays: 1 });
    expect(single).toHaveLength(10);
    expect(single.every((window) => window.dayRange === 1)).toBe(true);

    const three = planIngestWindows({
      startDate: "2024-01-01",
      endDate: "2024-01-07",
      bbox: BBOX,
      windowDays: 3,
      sources: ["MODIS_SP"],
    });
    expect(datesOf(three)).toEqual([
      "2024-01-01..2024-01-03",
      "2024-01-04..2024-01-06",
      "2024-01-07..2024-01-07",
    ]);
    expect(three.map((window) => window.dayRange)).toEqual([3, 3, 1]);
  });

  it("treats endDate as inclusive and covers every day exactly once", () => {
    const windows = planIngestWindows({
      startDate: "2024-01-01",
      endDate: "2024-01-11",
      bbox: BBOX,
      windowDays: 4,
      sources: ["MODIS_SP"],
    });

    const covered = expandDates(windows);
    expect(new Set(covered).size).toBe(covered.length);
    expect(covered[0]).toBe("2024-01-01");
    expect(covered[covered.length - 1]).toBe("2024-01-11");
    expect(covered).toHaveLength(11);
    expect(windows.every((window) => window.dayRange <= 4)).toBe(true);

    const oneDay = planIngestWindows({
      startDate: "2024-01-01",
      endDate: "2024-01-01",
      bbox: BBOX,
      sources: ["MODIS_SP"],
    });
    expect(datesOf(oneDay)).toEqual(["2024-01-01..2024-01-01"]);
    expect(oneDay[0].dayRange).toBe(1);
  });

  it("crosses month and year boundaries without losing days", () => {
    const monthEnd = planIngestWindows({
      startDate: "2024-01-30",
      endDate: "2024-02-02",
      bbox: BBOX,
      windowDays: 2,
      sources: ["MODIS_SP"],
    });
    expect(datesOf(monthEnd)).toEqual([
      "2024-01-30..2024-01-31",
      "2024-02-01..2024-02-02",
    ]);

    const yearEnd = planIngestWindows({
      startDate: "2024-12-30",
      endDate: "2025-01-02",
      bbox: BBOX,
      windowDays: 2,
      sources: ["MODIS_SP"],
    });
    expect(datesOf(yearEnd)).toEqual([
      "2024-12-30..2024-12-31",
      "2025-01-01..2025-01-02",
    ]);
    expect(expandDates(yearEnd)).toEqual([
      "2024-12-30",
      "2024-12-31",
      "2025-01-01",
      "2025-01-02",
    ]);
  });

  it("includes 29 February only in leap years", () => {
    const leap = planIngestWindows({
      startDate: "2024-02-28",
      endDate: "2024-03-01",
      bbox: BBOX,
      windowDays: 1,
      sources: ["MODIS_SP"],
    });
    expect(expandDates(leap)).toEqual([
      "2024-02-28",
      "2024-02-29",
      "2024-03-01",
    ]);

    const nonLeap = planIngestWindows({
      startDate: "2023-02-28",
      endDate: "2023-03-01",
      bbox: BBOX,
      windowDays: 1,
      sources: ["MODIS_SP"],
    });
    expect(expandDates(nonLeap)).toEqual(["2023-02-28", "2023-03-01"]);

    // 2000 is a leap year; 1900 is not (century rule).
    const leap2000 = planIngestWindows({
      startDate: "2000-02-28",
      endDate: "2000-03-01",
      bbox: BBOX,
      windowDays: 1,
      sources: ["MODIS_SP"],
    });
    expect(expandDates(leap2000)).toEqual([
      "2000-02-28",
      "2000-02-29",
      "2000-03-01",
    ]);

    const nonLeap1900 = planIngestWindows({
      startDate: "1900-02-28",
      endDate: "1900-03-01",
      bbox: BBOX,
      windowDays: 1,
      sources: ["MODIS_SP"],
    });
    expect(expandDates(nonLeap1900)).toEqual(["1900-02-28", "1900-03-01"]);
  });

  it("plans both historical sources by default and rejects others", () => {
    const windows = planIngestWindows({
      startDate: "2024-01-01",
      endDate: "2024-01-07",
      bbox: BBOX,
    });

    expect(windows).toHaveLength(4);
    expect(windows.map((window) => window.source)).toEqual([
      "MODIS_SP",
      "MODIS_SP",
      "VIIRS_SNPP_SP",
      "VIIRS_SNPP_SP",
    ]);
    expect(new Set(windows.map((window) => window.id)).size).toBe(4);

    const reversed = planIngestWindows({
      startDate: "2024-01-01",
      endDate: "2024-01-07",
      bbox: BBOX,
      sources: ["VIIRS_SNPP_SP", "MODIS_SP"],
    });
    expect(reversed[0].source).toBe("VIIRS_SNPP_SP");
    expect(reversed[reversed.length - 1].source).toBe("MODIS_SP");

    for (const source of [
      "VIIRS_SNPP_NRT",
      "MODIS_NRT",
      "LANDSAT_NRT",
      "VIIRS_NOAA21_SP",
      "modis_sp",
    ]) {
      const error = catchPlanError({
        ...BASE,
        sources: [source as unknown as (typeof PLAN_SOURCES)[number]],
      });
      expect(error.code).toBe("invalid_input");
      expect(
        error.issues.some((issue) => issue.path.startsWith("sources")),
      ).toBe(true);
    }

    expect(catchPlanError({ ...BASE, sources: [INVALID_NOAA] }).code).toBe(
      "invalid_input",
    );
  });

  it("resumes by filtering stable completed identifiers", () => {
    const full = planIngestWindows({
      startDate: "2024-02-01",
      endDate: "2024-02-20",
      bbox: BBOX,
    });
    expect(full).toHaveLength(8);

    // Same input produces the same ids, so a persisted cursor stays valid.
    const rerun = planIngestWindows({
      startDate: "2024-02-01",
      endDate: "2024-02-20",
      bbox: BBOX,
    });
    expect(rerun.map((window) => window.id)).toEqual(
      full.map((window) => window.id),
    );

    const completed = full.slice(0, 3).map((window) => window.id);
    const resumed = planIngestWindows({
      startDate: "2024-02-01",
      endDate: "2024-02-20",
      bbox: BBOX,
      completed,
    });
    expect(resumed.map((window) => window.id)).toEqual(
      full.slice(3).map((window) => window.id),
    );

    // Unknown ids do not remove pending windows.
    const withUnknown = planIngestWindows({
      startDate: "2024-02-01",
      endDate: "2024-02-20",
      bbox: BBOX,
      completed: ["MODIS_SP/1999-01-01/1999-01-05/-72.6,17,-67.7,20.6"],
    });
    expect(withUnknown).toHaveLength(8);

    const done = planIngestWindows({
      startDate: "2024-02-01",
      endDate: "2024-02-20",
      bbox: BBOX,
      completed: full.map((window) => window.id),
    });
    expect(done).toEqual([]);
  });

  it("keeps identifiers stable but distinct per source and bbox", () => {
    const [modis] = planIngestWindows({
      startDate: "2024-01-01",
      endDate: "2024-01-05",
      bbox: BBOX,
      sources: ["MODIS_SP"],
    });
    const [viirs] = planIngestWindows({
      startDate: "2024-01-01",
      endDate: "2024-01-05",
      bbox: BBOX,
      sources: ["VIIRS_SNPP_SP"],
    });

    expect(modis.id).toBe("MODIS_SP/2024-01-01/2024-01-05/-72.6,17,-67.7,20.6");
    expect(viirs.id).toBe(
      "VIIRS_SNPP_SP/2024-01-01/2024-01-05/-72.6,17,-67.7,20.6",
    );

    const moved = planIngestWindows({
      startDate: "2024-01-01",
      endDate: "2024-01-05",
      bbox: [-80, 10, -70, 20],
      sources: ["MODIS_SP"],
    });
    expect(moved[0].id).not.toBe(modis.id);
  });

  it("rejects inverted ranges but accepts a single day", () => {
    const error = catchPlanError({
      startDate: "2024-01-10",
      endDate: "2024-01-01",
      bbox: BBOX,
    });
    expect(error.code).toBe("invalid_range");
    expect(error.issues[0].path).toBe("endDate");

    expect(() =>
      planIngestWindows({
        startDate: "2024-01-01",
        endDate: "2024-01-01",
        bbox: BBOX,
      }),
    ).not.toThrow();
  });

  it("validates dates with zod (format, real days, leap years)", () => {
    for (const invalid of [
      "2023-02-29",
      "2024-04-31",
      "2024-13-01",
      "2024-00-10",
      "2024-01-00",
      "2024-1-01",
      "24-01-01",
      "2024/01/01",
      "",
      "not-a-date",
    ]) {
      const error = catchPlanError({ ...BASE, startDate: invalid });
      expect(error.code).toBe("invalid_input");
      expect(error.issues.some((issue) => issue.path === "startDate")).toBe(
        true,
      );
    }

    const error = catchPlanError({ ...BASE, endDate: "2024-02-30" });
    expect(error.code).toBe("invalid_input");
    expect(error.issues.some((issue) => issue.path === "endDate")).toBe(true);
  });

  it("validates the bbox with zod (length, ranges, order, finiteness)", () => {
    const cases: unknown[] = [
      [-72.6, 17, -67.7],
      [-72.6, 17, -67.7, 20.6, 1],
      [-181, 17, -67.7, 20.6],
      [-72.6, -91, -67.7, 20.6],
      [-67.7, 17, -72.6, 20.6],
      [-72.6, 20.6, -67.7, 17],
      [-72.6, 17, -67.7, Number.NaN],
      [-72.6, 17, -67.7, Number.POSITIVE_INFINITY],
      "not-a-bbox",
    ];

    for (const bbox of cases) {
      const error = catchPlanError({
        ...BASE,
        bbox: bbox as unknown as IngestPlanInput["bbox"],
      });
      expect(error.code).toBe("invalid_input");
      expect(error.issues.some((issue) => issue.path.startsWith("bbox"))).toBe(
        true,
      );
    }
  });

  it("validates windowDays and the source list with zod", () => {
    for (const windowDays of [0, 6, 2.5, Number.NaN]) {
      const error = catchPlanError({ ...BASE, windowDays });
      expect(error.code).toBe("invalid_input");
      expect(error.issues.some((issue) => issue.path === "windowDays")).toBe(
        true,
      );
    }

    const error = catchPlanError({ ...BASE, sources: [] });
    expect(error.code).toBe("invalid_input");
    expect(error.issues.some((issue) => issue.path === "sources")).toBe(true);
  });

  it("produces requests compatible with the existing FIRMS client", () => {
    const windows = planIngestWindows({
      startDate: "2024-02-26",
      endDate: "2024-03-01",
      bbox: BBOX,
      windowDays: 4,
      sources: ["VIIRS_SNPP_SP"],
    });

    expect(windows).toHaveLength(2);
    const [first, second] = windows;

    // The inferred request type must satisfy FirmsAreaRequest.
    const request: FirmsAreaRequest = first.request;
    expect(request).toEqual({
      source: "VIIRS_SNPP_SP",
      bbox: [-72.6, 17, -67.7, 20.6],
      dayRange: 4,
      date: "2024-02-26",
    });
    expect(isFirmsSource(first.request.source)).toBe(true);
    expect(isPlanSource(first.request.source)).toBe(true);
    expect(first.request.bbox).toEqual(first.bbox);

    // The final window is cut at the inclusive end date.
    expect(second.request).toEqual({
      source: "VIIRS_SNPP_SP",
      bbox: [-72.6, 17, -67.7, 20.6],
      dayRange: 1,
      date: "2024-03-01",
    });
  });

  it("never plans more than five days nor leaves gaps", () => {
    const windows = planIngestWindows({
      startDate: "2012-01-01",
      endDate: "2012-01-31",
      bbox: BBOX,
      windowDays: 5,
      sources: ["MODIS_SP"],
    });

    expect(windows).toHaveLength(7);
    expect(windows.every((window) => window.dayRange >= 1)).toBe(true);
    expect(windows.every((window) => window.dayRange <= 5)).toBe(true);

    const covered = expandDates(windows);
    expect(covered).toHaveLength(31);
    expect(new Set(covered).size).toBe(31);
    expect(covered[0]).toBe("2012-01-01");
    expect(covered[30]).toBe("2012-01-31");
  });
});
