import { describe, expect, it } from "vitest";
import {
  ACTIVITY_CELL_SIZE_DEGREES,
  ACTIVITY_PALETTE,
  activityLevel,
  buildActivityGrid,
  limitDetectionsForDisplay,
  MAX_MAP_POINTS,
  type ActivityPoint,
} from "@/lib/geo/activity-grid";

function point(lng: number, lat: number, isDemo = true): ActivityPoint {
  return { coordinates: [lng, lat], is_demo: isDemo ? true : undefined };
}

describe("stable activity grid", () => {
  it("uses the shared calendar palette and a documented default cell size", () => {
    expect(ACTIVITY_CELL_SIZE_DEGREES).toBe(0.01);
    expect(ACTIVITY_PALETTE).toEqual([
      "#fbd6d2",
      "#ffb48f",
      "#f77555",
      "#be293b",
    ]);
  });

  it("groups nearby records into the same stable cell and counts each one", () => {
    const records = [
      point(-70.555, 18.755),
      point(-70.551, 18.759),
      point(-70.553, 18.751),
    ];
    const grid = buildActivityGrid(records);

    expect(grid.total).toBe(3);
    expect(grid.cellCount).toBe(1);
    expect(grid.maxCount).toBe(3);
    expect(grid.collection.features).toHaveLength(1);

    const feature = grid.collection.features[0];
    expect(feature.properties.count).toBe(3);
    expect(feature.properties.level).toBe(3);
    expect(feature.properties.is_demo).toBe(true);
    expect(feature.properties.cell).toBe("10944:10875");
    expect(feature.geometry.type).toBe("Polygon");
  });

  it("keeps a coordinate on a cell edge in the cell that starts there", () => {
    const edge = buildActivityGrid([point(-70.55, 18.75)]);
    const feature = edge.collection.features[0];
    expect(feature.properties.cell).toBe("10945:10875");

    const ring = feature.geometry.coordinates[0];
    expect(ring[0]).toEqual([-70.55, 18.75]);
    expect(ring[2][0]).toBeCloseTo(-70.54, 6);
    expect(ring[2][1]).toBeCloseTo(18.76, 6);
    expect(ring[4]).toEqual(ring[0]);
  });

  it("separates records just across a cell boundary and conserves the total", () => {
    const grid = buildActivityGrid([
      point(-70.5501, 18.7501),
      point(-70.55, 18.7501),
      point(-70.5499, 18.7501),
    ]);

    expect(grid.cellCount).toBe(2);
    expect(grid.total).toBe(3);
    const counts = grid.collection.features.map((item) => item.properties);
    expect(counts.map((item) => item.count)).toEqual([1, 2]);
    expect(counts.every((item) => item.cell.includes(":"))).toBe(true);
  });

  it("changes the hot cells when the input records change", () => {
    const first = buildActivityGrid([
      point(-70.6, 18.7),
      point(-70.6, 18.7),
      point(-70.6, 18.7),
      point(-70.4, 18.8),
    ]);
    const second = buildActivityGrid([
      point(-70.6, 18.7),
      point(-70.4, 18.8),
      point(-70.4, 18.8),
      point(-70.4, 18.8),
      point(-70.4, 18.8),
    ]);

    const hotspot = (grid: typeof first) =>
      grid.collection.features.reduce((best, item) =>
        item.properties.count > best.properties.count ? item : best,
      );
    expect(hotspot(first).properties.cell).not.toBe(
      hotspot(second).properties.cell,
    );
    expect(first.total).toBe(4);
    expect(second.total).toBe(5);
  });

  it("returns an empty grid without inventing a zero cell", () => {
    const grid = buildActivityGrid([]);
    expect(grid).toMatchObject({
      total: 0,
      cellCount: 0,
      maxCount: 0,
    });
    expect(grid.collection).toEqual({
      type: "FeatureCollection",
      features: [],
    });
  });

  it("ignores invalid coordinates instead of drawing a wrong cell", () => {
    const grid = buildActivityGrid([
      point(Number.NaN, 18.7),
      point(-70.6, 91),
      point(181, 18.7),
      point(-70.6, 18.7),
    ]);
    expect(grid.total).toBe(1);
    expect(grid.cellCount).toBe(1);
  });

  it("marks a cell synthetic only when every record in it is synthetic", () => {
    const grid = buildActivityGrid([
      point(-70.6, 18.7, true),
      point(-70.6, 18.7, false),
    ]);
    expect(grid.collection.features[0].properties.is_demo).toBe(false);
  });

  it("is independent of input order and supports another cell size", () => {
    const records = [
      point(-70.62, 18.72),
      point(-70.61, 18.72),
      point(-70.611, 18.719),
    ];
    const forward = buildActivityGrid(records);
    const backward = buildActivityGrid([...records].reverse());
    expect(backward).toEqual(forward);

    const coarse = buildActivityGrid(records, { cellSize: 0.05 });
    expect(coarse.total).toBe(3);
    expect(coarse.cellCount).toBeLessThan(forward.cellCount);
  });

  it("rejects a non-positive cell size", () => {
    expect(() => buildActivityGrid([], { cellSize: 0 })).toThrow(RangeError);
    expect(() => buildActivityGrid([], { cellSize: Number.NaN })).toThrow(
      RangeError,
    );
  });
});

describe("relative activity levels", () => {
  it("maps counts to four relative steps and reserves zero for no count", () => {
    expect(activityLevel(0, 10)).toBe(0);
    expect(activityLevel(1, 10)).toBe(0);
    expect(activityLevel(3, 10)).toBe(1);
    expect(activityLevel(6, 10)).toBe(2);
    expect(activityLevel(10, 10)).toBe(3);
    expect(activityLevel(-1, 10)).toBe(0);
    expect(activityLevel(1, 0)).toBe(0);
  });

  it("gives every cell the strongest step when all counts are equal", () => {
    const grid = buildActivityGrid([point(-70.6, 18.7), point(-70.4, 18.8)]);
    expect(
      grid.collection.features.map((item) => item.properties.level),
    ).toEqual([3, 3]);
  });
});

describe("bounded point rendering", () => {
  const points = Array.from(
    { length: MAX_MAP_POINTS + 25 },
    (_, index) => index,
  );

  it("keeps every item visible below the limit", () => {
    const limited = limitDetectionsForDisplay(points.slice(0, 10));
    expect(limited.visible).toHaveLength(10);
    expect(limited.hiddenCount).toBe(0);
  });

  it("caps only the DOM representation and reports the hidden remainder", () => {
    const limited = limitDetectionsForDisplay(points);
    expect(limited.visible).toHaveLength(MAX_MAP_POINTS);
    expect(limited.visible[0]).toBe(0);
    expect(limited.visible.at(-1)).toBe(MAX_MAP_POINTS - 1);
    expect(limited.hiddenCount).toBe(25);
    expect(points).toHaveLength(MAX_MAP_POINTS + 25);
  });

  it("accepts an explicit limit and validates it", () => {
    expect(limitDetectionsForDisplay(points, 3)).toMatchObject({
      visible: [0, 1, 2],
      hiddenCount: MAX_MAP_POINTS + 22,
    });
    expect(() => limitDetectionsForDisplay(points, -1)).toThrow(RangeError);
    expect(() => limitDetectionsForDisplay(points, 1.5)).toThrow(RangeError);
  });
});
