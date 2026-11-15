import { describe, expect, it } from "vitest";
import {
  assignCellIds,
  combineMonthlyFamilyTotals,
  computeCellDayOccupancy,
  computeCellMonth,
  computeMonthlyFamilyTotals,
  computeMonthlySensorTotals,
  countCellDays,
} from "../../src/lib/harmonize";
import { makeDetection } from "./helpers";

const dayTwo = {
  acqAt: "2024-03-02T00:00:00.000Z",
  acqDate: "2024-03-02",
} as const;

const april = {
  acqAt: "2024-04-01T00:00:00.000Z",
  acqDate: "2024-04-01",
} as const;

describe("cell-day occupancy (CDO)", () => {
  it("counts one occupied cell per family and day, preserving agricultural burns", () => {
    const detections = assignCellIds([
      makeDetection({ frp: 10 }),
      makeDetection({ frp: 30 }),
      makeDetection({ satellite: "Aqua", frp: 20 }),
      makeDetection({ confidence: "low", confidenceRaw: "10", frp: 99 }),
      makeDetection({
        sensor: "VIIRS",
        source: "VIIRS_NOAA20_NRT",
        satellite: "NOAA-20",
        confidence: "high",
        confidenceRaw: "h",
        isNrt: true,
        frp: 40,
      }),
      makeDetection({
        sensor: "VIIRS",
        source: "VIIRS_SNPP_NRT",
        satellite: "S-NPP",
        confidence: "high",
        confidenceRaw: "h",
        isNrt: true,
        frp: 50,
      }),
      makeDetection({
        sensor: "VIIRS",
        source: "VIIRS_SNPP_SP",
        satellite: "S-NPP",
        confidence: "nominal",
        confidenceRaw: "n",
        frp: 25,
        type: "3",
        ...dayTwo,
      }),
    ]);

    const occupancy = computeCellDayOccupancy(detections);
    expect(occupancy).toHaveLength(3);
    expect(occupancy[0]).toMatchObject({
      day: "2024-03-01",
      sensor: "MODIS",
      nDetections: 3,
      maxFrp: 30,
    });
    expect(occupancy[1]).toMatchObject({
      day: "2024-03-01",
      sensor: "VIIRS",
      nDetections: 1,
      maxFrp: 50,
    });
    expect(occupancy[2]).toMatchObject({
      day: "2024-03-02",
      sensor: "VIIRS",
      nDetections: 1,
      maxFrp: 25,
    });
    expect(countCellDays(occupancy)).toBe(3);
    expect(countCellDays(occupancy, "MODIS")).toBe(1);
    expect(countCellDays(occupancy, "VIIRS")).toBe(2);
  });

  it("adds NOAA-20 only when the historical S-NPP restriction is disabled", () => {
    const detections = assignCellIds([
      makeDetection({
        sensor: "VIIRS",
        source: "VIIRS_NOAA20_NRT",
        satellite: "NOAA-20",
        confidenceRaw: "h",
        isNrt: true,
        frp: 40,
      }),
      makeDetection({
        sensor: "VIIRS",
        source: "VIIRS_SNPP_NRT",
        satellite: "S-NPP",
        confidenceRaw: "h",
        isNrt: true,
        frp: 50,
      }),
    ]);

    expect(computeCellDayOccupancy(detections)).toHaveLength(1);
    const allViirs = computeCellDayOccupancy(detections, { historical: false });
    expect(allViirs).toHaveLength(1);
    expect(allViirs[0]?.nDetections).toBe(2);
    expect(allViirs[0]?.maxFrp).toBe(50);
  });

  it("can exclude NRT from a strict standard-product series", () => {
    const detections = assignCellIds([
      makeDetection({
        sensor: "VIIRS",
        source: "VIIRS_NOAA20_NRT",
        satellite: "NOAA-20",
        confidenceRaw: "h",
        isNrt: true,
      }),
      makeDetection({
        sensor: "VIIRS",
        source: "VIIRS_SNPP_NRT",
        satellite: "S-NPP",
        confidenceRaw: "h",
        isNrt: true,
      }),
      makeDetection({
        sensor: "VIIRS",
        source: "VIIRS_SNPP_SP",
        satellite: "S-NPP",
        confidenceRaw: "h",
        ...dayTwo,
      }),
    ]);

    const strict = computeCellDayOccupancy(detections, {
      historical: false,
      includeNrt: false,
    });
    expect(strict).toHaveLength(1);
    expect(strict[0]?.day).toBe("2024-03-02");
  });
});

describe("monthly aggregation", () => {
  const detections = assignCellIds([
    makeDetection({ frp: 10 }),
    makeDetection({ frp: 20 }),
    makeDetection({ frp: 5, ...dayTwo }),
    makeDetection({ latitude: 18.4, longitude: -69.8, frp: 7 }),
    makeDetection({
      sensor: "VIIRS",
      source: "VIIRS_SNPP_SP",
      satellite: "S-NPP",
      confidenceRaw: "h",
      frp: 8,
    }),
    makeDetection({
      confidence: "low",
      confidenceRaw: "10",
      frp: 99,
      ...april,
    }),
    makeDetection({
      sensor: "VIIRS",
      source: "VIIRS_NOAA20_SP",
      satellite: "NOAA-20",
      confidenceRaw: "h",
      frp: 99,
    }),
    makeDetection({ frp: 10, ...april }),
  ]);

  it("builds cell-month rows with distinct occupied days and FRP sums", () => {
    const rows = computeCellMonth(detections);

    expect(rows).toHaveLength(4);
    expect(
      rows.find(
        (row) =>
          row.year === 2024 &&
          row.month === 3 &&
          row.sensor === "MODIS" &&
          row.nDetections === 3,
      ),
    ).toMatchObject({
      occupiedDays: 2,
      frpSum: 35,
    });
    expect(
      rows.find(
        (row) =>
          row.year === 2024 &&
          row.month === 3 &&
          row.sensor === "MODIS" &&
          row.nDetections === 1,
      ),
    ).toMatchObject({
      occupiedDays: 1,
      frpSum: 7,
    });
    expect(
      rows.find(
        (row) => row.year === 2024 && row.month === 3 && row.sensor === "VIIRS",
      ),
    ).toMatchObject({
      occupiedDays: 1,
      nDetections: 1,
      frpSum: 8,
    });
    expect(
      rows.find((row) => row.year === 2024 && row.month === 4),
    ).toMatchObject({
      sensor: "MODIS",
      occupiedDays: 1,
      nDetections: 1,
      frpSum: 10,
    });
  });

  it("aggregates monthly CDO and detections by sensor", () => {
    const totals = computeMonthlySensorTotals(detections);

    expect(totals).toEqual([
      {
        year: 2024,
        month: 3,
        sensor: "MODIS",
        cellDays: 3,
        nDetections: 4,
        frpSum: 42,
      },
      {
        year: 2024,
        month: 3,
        sensor: "VIIRS",
        cellDays: 1,
        nDetections: 1,
        frpSum: 8,
      },
      {
        year: 2024,
        month: 4,
        sensor: "MODIS",
        cellDays: 1,
        nDetections: 1,
        frpSum: 10,
      },
    ]);
  });

  it("combines MODIS and VIIRS into aligned family totals", () => {
    const family = computeMonthlyFamilyTotals(detections);
    expect(family).toEqual([
      {
        year: 2024,
        month: 3,
        modisCellDays: 3,
        viirsCellDays: 1,
        detectionsModis: 4,
        detectionsViirs: 1,
      },
      {
        year: 2024,
        month: 4,
        modisCellDays: 1,
        viirsCellDays: null,
        detectionsModis: 1,
        detectionsViirs: null,
      },
    ]);

    expect(combineMonthlyFamilyTotals([])).toEqual([]);
  });

  it("uses null for an absent family and preserves an explicit zero", () => {
    expect(
      combineMonthlyFamilyTotals([
        {
          year: 2024,
          month: 5,
          sensor: "MODIS",
          cellDays: 0,
          nDetections: 0,
          frpSum: null,
        },
      ]),
    ).toEqual([
      {
        year: 2024,
        month: 5,
        modisCellDays: 0,
        viirsCellDays: null,
        detectionsModis: 0,
        detectionsViirs: null,
      },
    ]);
  });
});
