import { describe, expect, it } from "vitest";
import {
  parseRegionFeatureCollection,
  type RegionBbox,
  type RegionValidationIssue,
  type RegionValidationOptions,
} from "../../src/lib/geo/regions";

/**
 * SYNTHETIC FIXTURE.
 *
 * The coordinates below are invented squares used only to exercise the
 * validator. They are not real administrative boundaries, do not come from a
 * licensed source and must never be presented as real regions. Every feature
 * carries `is_demo: true` and artificially explicit source/license strings.
 */
const SYNTHETIC_SOURCE =
  "Synthetic square geometry created by the FIRESYNC test suite (not a real dataset)";
const SYNTHETIC_LICENSE =
  "Synthetic test data written for this repository; no real-world license applies";

const INGEST_BBOX: RegionBbox = {
  west: -72.6,
  south: 17.0,
  east: -67.7,
  north: 20.6,
};

const COUNTRY_BBOX = [-70.5, 17.5, -69.5, 19.5] as const;
const PROVINCE_BBOX = [-70.4, 18.0, -69.2, 18.8] as const;

interface RawFeature {
  type: string;
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}

interface RawCollection {
  type: string;
  features: RawFeature[];
}

function validCollection(): RawCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          code: "DEMO-COUNTRY",
          name: "Synthetic Demo Country",
          level: "country",
          bbox: [...COUNTRY_BBOX],
          source: SYNTHETIC_SOURCE,
          license: SYNTHETIC_LICENSE,
          attribution: "Synthetic geometry for automated tests",
          retrieved_at: "2026-11-15",
          is_demo: true,
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-70.5, 17.5],
              [-69.5, 17.5],
              [-69.5, 19.5],
              [-70.5, 19.5],
              [-70.5, 17.5],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: {
          code: "DEMO-PROVINCE-NORTH",
          name: "Synthetic Demo Province North",
          level: "province",
          parent_code: "DEMO-COUNTRY",
          bbox: [...PROVINCE_BBOX],
          source: SYNTHETIC_SOURCE,
          license: SYNTHETIC_LICENSE,
          is_demo: true,
        },
        geometry: {
          type: "MultiPolygon",
          coordinates: [
            [
              [
                [-70.4, 18.0],
                [-69.8, 18.0],
                [-69.8, 18.6],
                [-70.4, 18.6],
                [-70.4, 18.0],
              ],
              [
                [-70.2, 18.2],
                [-70.0, 18.2],
                [-70.0, 18.4],
                [-70.2, 18.4],
                [-70.2, 18.2],
              ],
            ],
            [
              [
                [-69.7, 18.2],
                [-69.2, 18.2],
                [-69.2, 18.8],
                [-69.7, 18.8],
                [-69.7, 18.2],
              ],
            ],
          ],
        },
      },
    ],
  };
}

function featureAt(collection: RawCollection, index = 0): RawFeature {
  const feature = collection.features[index];
  if (!feature) throw new Error(`Missing fixture feature at index ${index}`);
  return feature;
}

function firstRing(feature: RawFeature): unknown {
  const { coordinates } = feature.geometry;
  if (!Array.isArray(coordinates)) {
    throw new Error("Fixture geometry has no coordinates array");
  }
  return coordinates[0];
}

function parseFailure(
  input: unknown,
  options?: RegionValidationOptions,
): RegionValidationIssue[] {
  const result = parseRegionFeatureCollection(input, options);
  if (result.success) throw new Error("Expected invalid collection");
  return result.issues;
}

function codes(issues: RegionValidationIssue[]): string[] {
  return issues.map((issue) => issue.code);
}

describe("parseRegionFeatureCollection: valid synthetic fixture", () => {
  it("accepts a country Polygon and a province MultiPolygon within WGS84", () => {
    const result = parseRegionFeatureCollection(validCollection(), {
      expectedBbox: INGEST_BBOX,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.regions).toHaveLength(2);
    const country = result.regions[0];
    const province = result.regions[1];
    if (!country || !province) throw new Error("Missing parsed regions");

    expect(country.code).toBe("DEMO-COUNTRY");
    expect(country.name).toBe("Synthetic Demo Country");
    expect(country.level).toBe("country");
    expect(country.parentCode).toBeNull();
    expect(country.isDemo).toBe(true);
    expect(country.source).toBe(SYNTHETIC_SOURCE);
    expect(country.license).toBe(SYNTHETIC_LICENSE);
    expect(country.retrievedAt).toBe("2026-11-15");
    expect(country.bbox).toEqual({
      west: -70.5,
      south: 17.5,
      east: -69.5,
      north: 19.5,
    });

    // GeoJSON Polygon is normalized to MultiPolygon for the database column.
    expect(country.geometry.type).toBe("MultiPolygon");
    expect(country.geometry.coordinates).toHaveLength(1);

    expect(province.level).toBe("province");
    expect(province.parentCode).toBe("DEMO-COUNTRY");
    expect(province.geometry.coordinates).toHaveLength(2);
    expect(province.geometry.coordinates[0]).toHaveLength(2);
    expect(province.bbox).toEqual({
      west: -70.4,
      south: 18.0,
      east: -69.2,
      north: 18.8,
    });
  });

  it("ignores unknown feature properties instead of rejecting the file", () => {
    const collection = validCollection();
    featureAt(collection).properties["notes"] = "extra field for a later task";
    featureAt(collection).properties["is_demo"] = true;

    const result = parseRegionFeatureCollection(collection);
    expect(result.success).toBe(true);
  });

  it("does not modify the input object", () => {
    const collection = validCollection();
    const before = JSON.stringify(collection);
    parseRegionFeatureCollection(collection);
    expect(JSON.stringify(collection)).toBe(before);
  });
});

describe("parseRegionFeatureCollection: invalid geometry", () => {
  it("rejects a ring whose first and last positions differ", () => {
    const collection = validCollection();
    const ring = firstRing(featureAt(collection));
    if (!Array.isArray(ring)) throw new Error("Expected a ring");
    ring[ring.length - 1] = [-70.5, 17.6];

    expect(codes(parseFailure(collection))).toContain("ring_not_closed");
  });

  it("rejects a ring with fewer than four positions", () => {
    const collection = validCollection();
    featureAt(collection).geometry.coordinates = [
      [
        [-70.5, 17.5],
        [-69.5, 17.5],
        [-70.5, 17.5],
      ],
    ];

    expect(codes(parseFailure(collection))).toContain("ring_too_short");
  });

  it("rejects non-finite coordinates", () => {
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const collection = validCollection();
      featureAt(collection).geometry.coordinates = [
        [
          [-70.5, 17.5],
          [-69.5, 17.5],
          [-69.5, invalid],
          [-70.5, 17.5],
        ],
      ];

      expect(codes(parseFailure(collection))).toContain("invalid_position");
    }
  });

  it("rejects coordinates outside WGS84 ranges", () => {
    const longitudeOut = validCollection();
    featureAt(longitudeOut).geometry.coordinates = [
      [
        [-181, 17.5],
        [-69.5, 17.5],
        [-69.5, 19.5],
        [-181, 17.5],
      ],
    ];
    expect(codes(parseFailure(longitudeOut))).toContain(
      "coordinate_out_of_range",
    );

    const latitudeOut = validCollection();
    featureAt(latitudeOut).geometry.coordinates = [
      [
        [-70.5, 17.5],
        [-69.5, 17.5],
        [-69.5, 91],
        [-70.5, 17.5],
      ],
    ];
    expect(codes(parseFailure(latitudeOut))).toContain(
      "coordinate_out_of_range",
    );
  });

  it("rejects positions with extra ordinates such as altitude", () => {
    const collection = validCollection();
    featureAt(collection).geometry.coordinates = [
      [
        [-70.5, 17.5, 120],
        [-69.5, 17.5],
        [-69.5, 19.5],
        [-70.5, 17.5],
      ],
    ];

    expect(codes(parseFailure(collection))).toContain("invalid_position");
  });

  it("rejects geometry types other than Polygon and MultiPolygon", () => {
    const collection = validCollection();
    featureAt(collection).geometry = {
      type: "Point",
      coordinates: [-70, 18],
    };

    expect(codes(parseFailure(collection))).toContain("invalid_geometry");
  });

  it("rejects a collapsed or collinear ring", () => {
    const collection = validCollection();
    featureAt(collection).geometry.coordinates = [
      [
        [-70, 18],
        [-69.9, 18.1],
        [-69.8, 18.2],
        [-70, 18],
      ],
    ];
    featureAt(collection).properties["bbox"] = [-70, 18, -69.8, 18.2];

    expect(codes(parseFailure(collection))).toContain("degenerate_ring");
  });

  it("rejects empty polygon coordinate arrays", () => {
    const collection = validCollection();
    featureAt(collection).geometry.coordinates = [];

    expect(codes(parseFailure(collection))).toContain("invalid_geometry");
  });
});

describe("parseRegionFeatureCollection: required properties", () => {
  it.each(["code", "name", "level", "bbox", "source", "license", "is_demo"])(
    "rejects a feature without %s",
    (property) => {
      const collection = validCollection();
      delete featureAt(collection).properties[property];

      const issues = parseFailure(collection);
      expect(codes(issues)).toContain("invalid_properties");
      expect(issues.some((issue) => issue.path.includes(property))).toBe(true);
    },
  );

  it("rejects an unsupported level", () => {
    const collection = validCollection();
    featureAt(collection).properties["level"] = "municipality";

    expect(codes(parseFailure(collection))).toContain("invalid_properties");
  });

  it("rejects blank code, name, source or license", () => {
    for (const property of ["code", "name", "source", "license"]) {
      const collection = validCollection();
      featureAt(collection).properties[property] = "   ";

      expect(codes(parseFailure(collection))).toContain("invalid_properties");
    }
  });

  it("rejects a code with spaces or unsupported characters", () => {
    const collection = validCollection();
    featureAt(collection).properties["code"] = "DEMO COUNTRY";

    expect(codes(parseFailure(collection))).toContain("invalid_properties");
  });

  it("rejects malformed source or license URLs", () => {
    const collection = validCollection();
    featureAt(collection).properties["source_url"] = "not a url";

    expect(codes(parseFailure(collection))).toContain("invalid_properties");
  });
});

describe("parseRegionFeatureCollection: bbox checks", () => {
  it("rejects a bbox that does not match the geometry", () => {
    const collection = validCollection();
    featureAt(collection).properties["bbox"] = [-70.6, 17.5, -69.5, 19.5];

    expect(codes(parseFailure(collection))).toContain("bbox_mismatch");
  });

  it("detects a declared bbox with swapped axes", () => {
    const collection = validCollection();
    featureAt(collection).properties["bbox"] = [17.5, -70.5, 19.5, -69.5];

    expect(codes(parseFailure(collection))).toContain("bbox_axis_swap");
  });

  it("rejects a bbox with invalid ordering or ranges", () => {
    const inverted = validCollection();
    featureAt(inverted).properties["bbox"] = [-69.5, 17.5, -70.5, 19.5];
    expect(codes(parseFailure(inverted))).toContain("bbox_invalid");

    const outOfRange = validCollection();
    featureAt(outOfRange).properties["bbox"] = [-70.5, 17.5, 200, 19.5];
    expect(codes(parseFailure(outOfRange))).toContain("bbox_invalid");
  });
});

describe("parseRegionFeatureCollection: collection rules", () => {
  it("rejects an empty FeatureCollection", () => {
    const collection = validCollection();
    collection.features = [];

    expect(codes(parseFailure(collection))).toContain("empty_collection");
  });

  it("rejects a non-FeatureCollection root object", () => {
    const collection = validCollection();
    collection.type = "Feature";

    expect(codes(parseFailure(collection))).toContain("invalid_collection");
  });

  it("rejects duplicate region codes", () => {
    const collection = validCollection();
    featureAt(collection, 1).properties["code"] = "DEMO-COUNTRY";

    const issues = parseFailure(collection);
    expect(codes(issues)).toContain("duplicate_code");
    expect(
      issues.some(
        (issue) =>
          issue.code === "duplicate_code" &&
          issue.path === "features[1].properties.code",
      ),
    ).toBe(true);
  });
});

describe("parseRegionFeatureCollection: expected bbox and axis detection", () => {
  it("detects lat/lon swaps when an expected bbox is provided", () => {
    const collection = validCollection();
    const feature = featureAt(collection);
    // Invert every pair: [-70.5, 17.5] becomes [17.5, -70.5].
    feature.geometry.coordinates = [
      [
        [17.5, -70.5],
        [17.5, -69.5],
        [19.5, -69.5],
        [19.5, -70.5],
        [17.5, -70.5],
      ],
    ];
    feature.properties["bbox"] = [17.5, -70.5, 19.5, -69.5];

    const issues = parseFailure(collection, { expectedBbox: INGEST_BBOX });
    expect(codes(issues)).toContain("likely_axis_swap");
  });

  it("reports a valid region outside the expected bbox", () => {
    const collection = validCollection();
    const feature = featureAt(collection);
    feature.geometry.coordinates = [
      [
        [-20, 5],
        [-19, 5],
        [-19, 6],
        [-20, 6],
        [-20, 5],
      ],
    ];
    feature.properties["bbox"] = [-20, 5, -19, 6];

    const issues = parseFailure(collection, { expectedBbox: INGEST_BBOX });
    expect(codes(issues)).toContain("outside_expected_bbox");
    expect(codes(issues)).not.toContain("likely_axis_swap");
  });

  it("throws a clear error when expectedBbox itself is invalid", () => {
    expect(() =>
      parseRegionFeatureCollection(validCollection(), {
        expectedBbox: { west: 20, south: 17, east: -70, north: 19 },
      }),
    ).toThrow(RangeError);
  });
});
