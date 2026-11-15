import { describe, expect, it } from "vitest";
import {
  buildAoiGeoJSON,
  DEMO_CENTER,
  filterDemoDetections,
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
});
