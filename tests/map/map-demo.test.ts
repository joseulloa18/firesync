import { describe, expect, it } from "vitest";
import {
  buildAoiGeoJSON,
  createSyntheticMonthDetections,
  DEMO_CENTER,
  DEMO_ZONES,
  filterDemoDetections,
  filterDetectionRecords,
  getDetectionBounds,
  isValidWgs84Coordinate,
  mapDemoDetections,
} from "@/content/map-demo";

describe("synthetic map detections", () => {
  it("keeps a deterministic, clearly synthetic March 2025 sample", () => {
    expect(mapDemoDetections).toHaveLength(16);
    expect(new Set(mapDemoDetections.map((item) => item.id)).size).toBe(16);
    expect(mapDemoDetections.every((item) => item.is_demo)).toBe(true);
    expect(
      mapDemoDetections.every((item) => item.acquiredAt.startsWith("2025-03-")),
    ).toBe(true);
    expect(mapDemoDetections.some((item) => item.sensor === "MODIS")).toBe(
      true,
    );
    expect(mapDemoDetections.some((item) => item.sensor === "VIIRS")).toBe(
      true,
    );
    for (const item of mapDemoDetections) {
      expect(Math.abs(item.coordinates[0] - DEMO_CENTER[0])).toBeLessThan(0.2);
      expect(Math.abs(item.coordinates[1] - DEMO_CENTER[1])).toBeLessThan(0.2);
    }
  });

  it("filters by sensor and UTC day without mutating the source", () => {
    const modis = filterDemoDetections({ sensor: "MODIS" });
    expect(modis).toHaveLength(8);
    expect(modis.every((item) => item.sensor === "MODIS")).toBe(true);

    const day = filterDemoDetections({ day: 14 });
    expect(day.map((item) => item.id)).toEqual(["demo-modis-05"]);

    const viirsDay = filterDemoDetections({ sensor: "VIIRS", day: 14 });
    expect(viirsDay).toEqual([]);
    expect(mapDemoDetections).toHaveLength(16);
  });

  it("returns sorted recent and preview windows", () => {
    const recent = filterDemoDetections({ mode: "recent" });
    expect(recent).toHaveLength(5);
    expect(recent.at(-1)?.id).toBe("demo-viirs-08");

    const preview = filterDemoDetections({ mode: "preview" });
    expect(preview).toHaveLength(8);
    expect(preview[0].id).toBe("demo-modis-01");

    const timestamps = filterDemoDetections().map((item) => item.acquiredAt);
    expect(timestamps).toEqual([...timestamps].sort());
  });
});

describe("synthetic month generation", () => {
  it("creates one record per count on the correct UTC days", () => {
    const records = createSyntheticMonthDetections(2025, 2, [0, 2, 1, 0, 3]);

    expect(records).toHaveLength(6);
    expect(new Set(records.map((item) => item.id)).size).toBe(6);
    expect(records.every((item) => item.is_demo)).toBe(true);
    expect(records.map((item) => item.acquiredAt.slice(0, 10))).toEqual([
      "2025-03-02",
      "2025-03-02",
      "2025-03-03",
      "2025-03-05",
      "2025-03-05",
      "2025-03-05",
    ]);
    expect(records.map((item) => item.sensor)).toEqual([
      "MODIS",
      "VIIRS",
      "MODIS",
      "VIIRS",
      "MODIS",
      "VIIRS",
    ]);
    for (const item of records) {
      const date = new Date(item.acquiredAt);
      expect(date.getUTCFullYear()).toBe(2025);
      expect(date.getUTCMonth()).toBe(2);
      expect(Number(item.acquiredAt.slice(8, 10))).toBe(date.getUTCDate());
      expect(isValidWgs84Coordinate(item.coordinates)).toBe(true);
      expect(Math.abs(item.coordinates[0] - DEMO_CENTER[0])).toBeLessThan(0.2);
      expect(Math.abs(item.coordinates[1] - DEMO_CENTER[1])).toBeLessThan(0.2);
    }
  });

  it("ignores non-finite coordinates when validating bounds", () => {
    expect(isValidWgs84Coordinate([Number.NaN, 18.7])).toBe(false);
    expect(isValidWgs84Coordinate([-70.55, 91])).toBe(false);
    const invalid = {
      ...mapDemoDetections[0],
      coordinates: [Number.POSITIVE_INFINITY, 18.7] as [number, number],
    };
    expect(getDetectionBounds([invalid])).toBeNull();
    expect(getDetectionBounds([mapDemoDetections[0]])).toEqual([
      mapDemoDetections[0].coordinates,
      mapDemoDetections[0].coordinates,
    ]);
  });

  it("uses a 0-based month and keeps the three fictional zones separate", () => {
    const january = createSyntheticMonthDetections(2024, 0, [1, 1]);
    expect(january).toHaveLength(2);
    expect(january[0].acquiredAt.startsWith("2024-01-01T")).toBe(true);
    expect(january[1].acquiredAt.startsWith("2024-01-02T")).toBe(true);

    expect(DEMO_ZONES).toHaveLength(3);
    const zones = DEMO_ZONES.map((_, index) =>
      createSyntheticMonthDetections(2025, 2, [1], index),
    );
    expect(
      new Set(zones.map((zone) => zone[0].coordinates.join(","))).size,
    ).toBe(3);
    expect(
      zones.every((zone, index) =>
        zone[0].id.startsWith(`${DEMO_ZONES[index].id}-2025-03-01`),
      ),
    ).toBe(true);
    expect(createSyntheticMonthDetections(2025, 2, [1, 2, 1])).toEqual(
      createSyntheticMonthDetections(2025, 2, [1, 2, 1]),
    );
  });

  it("keeps supplied records exact and filters only by sensor or UTC day", () => {
    const records = createSyntheticMonthDetections(
      2025,
      2,
      Array.from({ length: 31 }, () => 1),
    );
    expect(records).toHaveLength(31);

    const exact = filterDetectionRecords(records);
    expect(exact).toHaveLength(31);
    expect(exact.map((item) => item.id)).toEqual(
      records.map((item) => item.id),
    );

    const modis = filterDetectionRecords(records, { sensor: "MODIS" });
    expect(modis).toHaveLength(16);
    expect(modis.every((item) => item.sensor === "MODIS")).toBe(true);

    const thirdDay = filterDetectionRecords(records, { day: 3 });
    expect(thirdDay).toHaveLength(1);
    expect(thirdDay[0].acquiredAt.startsWith("2025-03-03T")).toBe(true);
  });
});

describe("AOI GeoJSON geometry", () => {
  it("draws an open line until a polygon is finished", () => {
    const points: [number, number][] = [
      [-70.6, 18.7],
      [-70.5, 18.7],
      [-70.5, 18.8],
    ];

    const line = buildAoiGeoJSON(points);
    expect(line.geometry.type).toBe("LineString");
    if (line.geometry.type === "LineString") {
      expect(line.geometry.coordinates).toEqual(points);
    }

    const polygon = buildAoiGeoJSON(points, true);
    expect(polygon.geometry.type).toBe("Polygon");
    if (polygon.geometry.type === "Polygon") {
      expect(polygon.geometry.coordinates[0]).toHaveLength(4);
      expect(polygon.geometry.coordinates[0][0]).toEqual(
        polygon.geometry.coordinates[0][3],
      );
    }
    expect(polygon.properties.is_demo).toBe(true);
  });

  it("ignores duplicate adjacent clicks and does not close short paths", () => {
    const duplicate = buildAoiGeoJSON([
      [-70.6, 18.7],
      [-70.6, 18.7],
      [-70.5, 18.7],
    ]);
    expect(duplicate.geometry.type).toBe("LineString");
    if (duplicate.geometry.type === "LineString") {
      expect(duplicate.geometry.coordinates).toHaveLength(2);
    }

    const short = buildAoiGeoJSON(
      [
        [-70.6, 18.7],
        [-70.5, 18.7],
      ],
      true,
    );
    expect(short.geometry.type).toBe("LineString");
  });

  it("closes only with at least three distinct points and no repeated corner", () => {
    const a: [number, number] = [-70.6, 18.7];
    const b: [number, number] = [-70.5, 18.7];
    const c: [number, number] = [-70.5, 18.8];

    const closed = buildAoiGeoJSON([a, b, c, a], true);
    expect(closed.geometry.type).toBe("Polygon");
    if (closed.geometry.type === "Polygon") {
      const ring = closed.geometry.coordinates[0];
      expect(ring).toEqual([a, b, c, a]);
      expect(
        new Set(ring.slice(0, -1).map((point) => point.join(","))).size,
      ).toBe(3);
    }

    const degenerate = buildAoiGeoJSON([a, b, a], true);
    expect(degenerate.geometry.type).toBe("LineString");

    const invalid = buildAoiGeoJSON([[Number.NaN, 18.7], a, b, c], true);
    expect(invalid.geometry.type).toBe("Polygon");
  });
});
