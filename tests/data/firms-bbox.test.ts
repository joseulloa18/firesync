import { describe, expect, it } from "vitest";
import {
  filterDetectionsByBbox,
  isWithinBbox,
  parseBbox,
} from "../../src/lib/firms/bbox";

describe("ingestion bbox helpers", () => {
  it("parses and validates west,south,east,north", () => {
    expect(parseBbox("-72.6,17.0,-67.7,20.6")).toEqual({
      west: -72.6,
      south: 17,
      east: -67.7,
      north: 20.6,
    });
  });

  it("rejects malformed or inverted boxes", () => {
    expect(() => parseBbox("1,2,3")).toThrow(RangeError);
    expect(() => parseBbox("a,2,3,4")).toThrow(RangeError);
    expect(() => parseBbox("1,2,3,4")).not.toThrow();
    expect(() => parseBbox("5,2,3,4")).toThrow(RangeError);
    expect(() => parseBbox("1,5,3,4")).toThrow(RangeError);
    expect(() => parseBbox("-181,1,2,3")).toThrow(RangeError);
  });

  it("treats bbox edges as inclusive and splits kept and discarded rows", () => {
    const bbox = parseBbox("-70,18,-69,19");
    const points = [
      { id: "inside", latitude: 18.5, longitude: -69.5 },
      { id: "west-edge", latitude: 18.5, longitude: -70 },
      { id: "outside", latitude: 20, longitude: -69.5 },
    ];

    expect(isWithinBbox(points[1] as (typeof points)[number], bbox)).toBe(true);
    const result = filterDetectionsByBbox(points, bbox);
    expect(result.kept.map((point) => point.id)).toEqual([
      "inside",
      "west-edge",
    ]);
    expect(result.discarded.map((point) => point.id)).toEqual(["outside"]);
  });
});
