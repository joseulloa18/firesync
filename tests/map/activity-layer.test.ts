import { describe, expect, it } from "vitest";
import {
  createSyntheticMonthDetections,
  filterDetectionRecords,
  mapDemoDetections,
} from "@/content/map-demo";
import {
  ACTIVITY_PALETTE,
  buildActivityGrid,
  limitDetectionsForDisplay,
  MAX_MAP_POINTS,
} from "@/lib/geo/activity-grid";

describe("map activity layer contract", () => {
  it("counts exactly the records returned by the sensor filter", () => {
    for (const sensor of ["all", "MODIS", "VIIRS"] as const) {
      const filtered = filterDetectionRecords(mapDemoDetections, { sensor });
      const grid = buildActivityGrid(filtered);
      const sum = grid.collection.features.reduce(
        (total, feature) => total + feature.properties.count,
        0,
      );
      expect(grid.total).toBe(filtered.length);
      expect(sum).toBe(filtered.length);
      expect(
        grid.collection.features.every((item) => item.properties.is_demo),
      ).toBe(true);
    }
  });

  it("updates the hot cells and total when the selected sensor changes", () => {
    const modis = buildActivityGrid(
      filterDetectionRecords(mapDemoDetections, { sensor: "MODIS" }),
    );
    const viirs = buildActivityGrid(
      filterDetectionRecords(mapDemoDetections, { sensor: "VIIRS" }),
    );

    expect(modis.total).toBe(8);
    expect(viirs.total).toBe(8);
    expect(
      modis.collection.features.map((item) => item.properties.cell),
    ).not.toEqual(
      viirs.collection.features.map((item) => item.properties.cell),
    );
  });

  it("keeps an exact total and an empty grid for zero/no-data filters", () => {
    const day = filterDetectionRecords(mapDemoDetections, {
      sensor: "VIIRS",
      day: 14,
    });
    const grid = buildActivityGrid(day);

    expect(day).toEqual([]);
    expect(grid).toMatchObject({ total: 0, cellCount: 0, maxCount: 0 });
    expect(grid.collection.features).toEqual([]);
  });

  it("keeps all period records in the aggregate when point DOM is capped", () => {
    const records = createSyntheticMonthDetections(
      2025,
      2,
      Array.from({ length: 31 }, () => 40),
    );
    const filtered = filterDetectionRecords(records, { sensor: "MODIS" });
    const grid = buildActivityGrid(filtered);
    const limited = limitDetectionsForDisplay(filtered);

    expect(filtered.length).toBeGreaterThan(MAX_MAP_POINTS);
    expect(grid.total).toBe(filtered.length);
    expect(limited.visible).toHaveLength(MAX_MAP_POINTS);
    expect(limited.hiddenCount).toBe(filtered.length - MAX_MAP_POINTS);
    expect(limited.visible.length + limited.hiddenCount).toBe(grid.total);
  });

  it("uses the same palette as the calendar and only four steps", () => {
    const grid = buildActivityGrid(
      createSyntheticMonthDetections(2025, 2, [1, 2, 3, 4]),
    );
    expect(ACTIVITY_PALETTE).toEqual([
      "#fbd6d2",
      "#ffb48f",
      "#f77555",
      "#be293b",
    ]);
    expect(
      grid.collection.features.every((item) =>
        [0, 1, 2, 3].includes(item.properties.level),
      ),
    ).toBe(true);
  });
});
