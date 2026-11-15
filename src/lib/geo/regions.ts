import { z } from "zod";
import type { core } from "zod";

/**
 * Validation contract for administrative regions imported as GeoJSON.
 *
 * Scope of this module: validate a GeoJSON `FeatureCollection` of Polygon or
 * MultiPolygon features in WGS84, require provenance metadata (source,
 * license, bbox) and normalize the result for a later database importer.
 *
 * It does NOT calculate geodesic area, run PostGIS `ST_IsValid`, resolve
 * parents against the database, load real boundaries or expose an API route.
 * Those pieces belong to later tasks. See `docs/REGIONES-IMPORTACION.md`.
 */

export const REGION_LEVELS = ["country", "province", "custom"] as const;
export type RegionLevel = (typeof REGION_LEVELS)[number];

/** Maximum difference (degrees) between declared and computed bboxes. */
export const BBOX_TOLERANCE_DEGREES = 1e-6;

/** A linear ring needs the first position repeated at the end. */
export const MIN_RING_POSITIONS = 4;

/** A polygon needs three distinct corners, plus the repeated closing vertex. */
export const MIN_DISTINCT_RING_POSITIONS = 3;

/**
 * Planar area (degrees²) below which a ring is considered degenerate.
 * It only catches collinear or collapsed rings; it is not an area metric.
 */
const DEGENERATE_RING_AREA_EPSILON = 1e-12;

/** Longitude first, latitude second: GeoJSON order, WGS84 (EPSG:4326). */
export type Position = [number, number];
export type LinearRing = Position[];
export type PolygonCoordinates = LinearRing[];
export type MultiPolygonCoordinates = PolygonCoordinates[];

export type RegionGeometry =
  | { type: "Polygon"; coordinates: PolygonCoordinates }
  | { type: "MultiPolygon"; coordinates: MultiPolygonCoordinates };

export interface MultiPolygonGeometry {
  type: "MultiPolygon";
  coordinates: MultiPolygonCoordinates;
}

export interface RegionBbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export type RegionIssueCode =
  | "invalid_collection"
  | "empty_collection"
  | "invalid_feature"
  | "invalid_properties"
  | "invalid_geometry"
  | "invalid_position"
  | "coordinate_out_of_range"
  | "ring_too_short"
  | "ring_not_closed"
  | "degenerate_ring"
  | "bbox_invalid"
  | "bbox_mismatch"
  | "bbox_axis_swap"
  | "duplicate_code"
  | "outside_expected_bbox"
  | "likely_axis_swap";

export interface RegionValidationIssue {
  /** Example: `features[0].properties.code`. */
  path: string;
  code: RegionIssueCode;
  message: string;
}

/** Normalized row ready to be mapped by a database importer. */
export interface ImportedRegion {
  code: string;
  name: string;
  level: RegionLevel;
  parentCode: string | null;
  bbox: RegionBbox;
  geometry: MultiPolygonGeometry;
  source: string;
  license: string;
  attribution: string | null;
  sourceUrl: string | null;
  licenseUrl: string | null;
  retrievedAt: string | null;
  isDemo: boolean;
}

export interface RegionValidationOptions {
  /**
   * Optional ingestion box (for example `INGEST_BBOX`). Features that do not
   * intersect it fail with `outside_expected_bbox`; if swapping their axes
   * would place them inside the box, they fail with `likely_axis_swap`.
   * Passing this option is what makes silent lat/lon swaps detectable for
   * longitudes below 90°, where both orders are technically WGS84-valid.
   */
  expectedBbox?: RegionBbox;
}

export type RegionParseResult =
  | { success: true; regions: ImportedRegion[] }
  | { success: false; issues: RegionValidationIssue[] };

const REGION_ISSUE_CODES: readonly RegionIssueCode[] = [
  "invalid_collection",
  "empty_collection",
  "invalid_feature",
  "invalid_properties",
  "invalid_geometry",
  "invalid_position",
  "coordinate_out_of_range",
  "ring_too_short",
  "ring_not_closed",
  "degenerate_ring",
  "bbox_invalid",
  "bbox_mismatch",
  "bbox_axis_swap",
  "duplicate_code",
  "outside_expected_bbox",
  "likely_axis_swap",
];

// Codes are lowercase identifiers (`DO-01`, `do.san-juan`, `DO_SAN`).
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/**
 * Adding issues through this helper keeps a machine-readable code in
 * `params.regionIssue` while the message stays readable for logs and tests.
 */
function addRegionIssue(
  ctx: core.$RefinementCtx,
  path: (string | number)[],
  code: RegionIssueCode,
  message: string,
): void {
  ctx.addIssue({
    code: "custom",
    message,
    path,
    params: { regionIssue: code },
  });
}

const coordinateSchema = z.number().finite();

const positionSchema = z
  .tuple([coordinateSchema, coordinateSchema])
  .superRefine(([longitude, latitude], ctx) => {
    if (longitude < -180 || longitude > 180) {
      addRegionIssue(
        ctx,
        [0],
        "coordinate_out_of_range",
        "Longitude must be within [-180, 180].",
      );
    }
    if (latitude < -90 || latitude > 90) {
      addRegionIssue(
        ctx,
        [1],
        "coordinate_out_of_range",
        "Latitude must be within [-90, 90].",
      );
    }
  });

function signedPlanarArea(ring: LinearRing): number {
  let sum = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    if (!current || !next) continue;
    sum += current[0] * next[1] - next[0] * current[1];
  }
  return sum / 2;
}

const linearRingSchema = z.array(positionSchema).superRefine((ring, ctx) => {
  if (ring.length < MIN_RING_POSITIONS) {
    addRegionIssue(
      ctx,
      [],
      "ring_too_short",
      `A linear ring needs at least ${MIN_RING_POSITIONS} positions (three corners plus the repeated first position).`,
    );
    return;
  }

  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last) return;

  if (first[0] !== last[0] || first[1] !== last[1]) {
    addRegionIssue(
      ctx,
      [],
      "ring_not_closed",
      "The first and last positions of a linear ring must be identical.",
    );
    return;
  }

  const distinctPositions = new Set(
    ring.map(([longitude, latitude]) => `${longitude},${latitude}`),
  );
  if (distinctPositions.size < MIN_DISTINCT_RING_POSITIONS) {
    addRegionIssue(
      ctx,
      [],
      "degenerate_ring",
      `A linear ring needs at least ${MIN_DISTINCT_RING_POSITIONS} distinct positions.`,
    );
    return;
  }

  if (Math.abs(signedPlanarArea(ring)) <= DEGENERATE_RING_AREA_EPSILON) {
    addRegionIssue(
      ctx,
      [],
      "degenerate_ring",
      "The linear ring encloses no measurable planar area; check for collapsed or collinear vertices.",
    );
  }
});

const polygonCoordinatesSchema = z
  .array(linearRingSchema)
  .min(1, { message: "A polygon needs at least one linear ring." });

const geometrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("Polygon"),
    coordinates: polygonCoordinatesSchema,
  }),
  z.object({
    type: z.literal("MultiPolygon"),
    coordinates: z
      .array(polygonCoordinatesSchema)
      .min(1, { message: "A MultiPolygon needs at least one polygon." }),
  }),
]);

function validateBboxOrderAndRanges(
  bbox: RegionBbox,
  ctx: core.$RefinementCtx,
  path: (string | number)[],
  label: string,
): void {
  if (
    bbox.west < -180 ||
    bbox.east > 180 ||
    bbox.south < -90 ||
    bbox.north > 90
  ) {
    addRegionIssue(
      ctx,
      path,
      "bbox_invalid",
      `${label} coordinates are outside WGS84 ranges.`,
    );
    return;
  }
  if (bbox.west >= bbox.east) {
    addRegionIssue(
      ctx,
      path,
      "bbox_invalid",
      `${label} must satisfy west < east.`,
    );
  }
  if (bbox.south >= bbox.north) {
    addRegionIssue(
      ctx,
      path,
      "bbox_invalid",
      `${label} must satisfy south < north.`,
    );
  }
}

const bboxTupleSchema = z
  .tuple([
    coordinateSchema,
    coordinateSchema,
    coordinateSchema,
    coordinateSchema,
  ])
  .superRefine((bbox, ctx) => {
    validateBboxOrderAndRanges(tupleToBbox(bbox), ctx, [], "bbox");
  });

const bboxObjectSchema = z
  .object({
    west: coordinateSchema,
    south: coordinateSchema,
    east: coordinateSchema,
    north: coordinateSchema,
  })
  .superRefine((bbox, ctx) => {
    validateBboxOrderAndRanges(bbox, ctx, [], "expectedBbox");
  });

const regionPropertiesSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, { message: "Region code is required." })
    .max(64, { message: "Region code must be 64 characters or fewer." })
    .regex(CODE_PATTERN, {
      message:
        "Region code must start with a letter or digit and contain only letters, digits, dots, hyphens or underscores.",
    }),
  name: z
    .string()
    .trim()
    .min(1, { message: "Region name is required." })
    .max(200, { message: "Region name must be 200 characters or fewer." }),
  level: z.enum(REGION_LEVELS, {
    message: `Region level must be one of: ${REGION_LEVELS.join(", ")}.`,
  }),
  parent_code: z.string().trim().min(1).max(64).regex(CODE_PATTERN).optional(),
  bbox: bboxTupleSchema,
  source: z
    .string()
    .trim()
    .min(1, {
      message:
        "source is required: name the dataset or institution that produced the boundaries.",
    })
    .max(500),
  license: z
    .string()
    .trim()
    .min(1, {
      message:
        "license is required: record the exact license of the boundary dataset; do not guess it.",
    })
    .max(500),
  attribution: z.string().trim().min(1).max(500).optional(),
  source_url: z.url().optional(),
  license_url: z.url().optional(),
  retrieved_at: z.iso.date().optional(),
  is_demo: z.boolean({
    message: "is_demo is required and must be true for synthetic fixtures.",
  }),
});

const featureShapeSchema = z.object({
  type: z.literal("Feature"),
  properties: regionPropertiesSchema,
  geometry: geometrySchema,
});

type ParsedFeature = z.infer<typeof featureShapeSchema>;

const featureCollectionShapeSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(featureShapeSchema),
});

type ParsedCollection = z.infer<typeof featureCollectionShapeSchema>;

export function computeGeometryBbox(geometry: RegionGeometry): RegionBbox {
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [longitude, latitude] of ring) {
        west = Math.min(west, longitude);
        south = Math.min(south, latitude);
        east = Math.max(east, longitude);
        north = Math.max(north, latitude);
      }
    }
  }

  // The schema guarantees at least one finite position, so no Infinity leaks.
  return { west, south, east, north };
}

export function toMultiPolygon(geometry: RegionGeometry): MultiPolygonGeometry {
  if (geometry.type === "MultiPolygon") {
    return { type: "MultiPolygon", coordinates: geometry.coordinates };
  }
  return { type: "MultiPolygon", coordinates: [geometry.coordinates] };
}

function tupleToBbox(
  bbox: readonly [number, number, number, number],
): RegionBbox {
  const [west, south, east, north] = bbox;
  return { west, south, east, north };
}

function bboxesMatch(a: RegionBbox, b: RegionBbox): boolean {
  return (
    Math.abs(a.west - b.west) <= BBOX_TOLERANCE_DEGREES &&
    Math.abs(a.south - b.south) <= BBOX_TOLERANCE_DEGREES &&
    Math.abs(a.east - b.east) <= BBOX_TOLERANCE_DEGREES &&
    Math.abs(a.north - b.north) <= BBOX_TOLERANCE_DEGREES
  );
}

/** Swapping west/south and east/north exposes a common axis-order mistake. */
function swapBboxAxes(bbox: RegionBbox): RegionBbox {
  return {
    west: bbox.south,
    south: bbox.west,
    east: bbox.north,
    north: bbox.east,
  };
}

function isValidBbox(bbox: RegionBbox): boolean {
  return (
    Number.isFinite(bbox.west) &&
    Number.isFinite(bbox.south) &&
    Number.isFinite(bbox.east) &&
    Number.isFinite(bbox.north) &&
    bbox.west >= -180 &&
    bbox.east <= 180 &&
    bbox.south >= -90 &&
    bbox.north <= 90 &&
    bbox.west < bbox.east &&
    bbox.south < bbox.north
  );
}

export function bboxesIntersect(a: RegionBbox, b: RegionBbox): boolean {
  return (
    a.west <= b.east &&
    a.east >= b.west &&
    a.south <= b.north &&
    a.north >= b.south
  );
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(6);
}

function describeBbox(bbox: RegionBbox): string {
  return `[${formatNumber(bbox.west)}, ${formatNumber(bbox.south)}, ${formatNumber(bbox.east)}, ${formatNumber(bbox.north)}]`;
}

function normalizeExpectedBbox(expectedBbox: RegionBbox): RegionBbox {
  const result = bboxObjectSchema.safeParse(expectedBbox);
  if (!result.success) {
    throw new RangeError(
      `Invalid expectedBbox: ${result.error.issues
        .map((issue) => issue.message)
        .join(" ")}`,
    );
  }
  return result.data;
}

function createFeatureSchema(
  expectedBbox: RegionBbox | undefined,
): z.ZodType<ParsedFeature, unknown> {
  return featureShapeSchema.superRefine((feature, ctx) => {
    const declaredBbox = tupleToBbox(feature.properties.bbox);
    const computedBbox = computeGeometryBbox(feature.geometry);

    if (!bboxesMatch(declaredBbox, computedBbox)) {
      if (bboxesMatch(declaredBbox, swapBboxAxes(computedBbox))) {
        addRegionIssue(
          ctx,
          ["properties", "bbox"],
          "bbox_axis_swap",
          `Declared bbox ${describeBbox(declaredBbox)} looks like [south, west, north, east]. The geometry bbox is ${describeBbox(computedBbox)}.`,
        );
      } else {
        addRegionIssue(
          ctx,
          ["properties", "bbox"],
          "bbox_mismatch",
          `Declared bbox ${describeBbox(declaredBbox)} does not match the geometry bbox ${describeBbox(computedBbox)} within ${BBOX_TOLERANCE_DEGREES}°.`,
        );
      }
    }

    if (expectedBbox && !bboxesIntersect(computedBbox, expectedBbox)) {
      const transposedBbox = swapBboxAxes(computedBbox);
      if (
        isValidBbox(transposedBbox) &&
        bboxesIntersect(transposedBbox, expectedBbox)
      ) {
        addRegionIssue(
          ctx,
          ["geometry", "coordinates"],
          "likely_axis_swap",
          `Geometry bbox ${describeBbox(computedBbox)} lies outside the expected bbox ${describeBbox(expectedBbox)}, but swapping lon/lat places it inside. Positions must be [longitude, latitude].`,
        );
      } else {
        addRegionIssue(
          ctx,
          ["geometry", "coordinates"],
          "outside_expected_bbox",
          `Geometry bbox ${describeBbox(computedBbox)} does not intersect the expected bbox ${describeBbox(expectedBbox)}.`,
        );
      }
    }
  });
}

function createCollectionSchema(
  expectedBbox: RegionBbox | undefined,
): z.ZodType<ParsedCollection, unknown> {
  const featureSchema = createFeatureSchema(expectedBbox);
  return featureCollectionShapeSchema
    .extend({ features: z.array(featureSchema) })
    .superRefine((collection, ctx) => {
      if (collection.features.length === 0) {
        addRegionIssue(
          ctx,
          ["features"],
          "empty_collection",
          "The FeatureCollection must contain at least one feature.",
        );
        return;
      }

      const seenCodes = new Set<string>();
      collection.features.forEach((feature, index) => {
        const { code } = feature.properties;
        if (seenCodes.has(code)) {
          addRegionIssue(
            ctx,
            ["features", index, "properties", "code"],
            "duplicate_code",
            `Duplicate region code "${code}".`,
          );
          return;
        }
        seenCodes.add(code);
      });
    });
}

/** Schema without an expected bbox; use `parseRegionFeatureCollection` for options. */
export const regionFeatureCollectionSchema = createCollectionSchema(undefined);

export type RegionFeatureCollection = z.infer<
  typeof regionFeatureCollectionSchema
>;

function toImportedRegion(feature: ParsedFeature): ImportedRegion {
  const { properties } = feature;
  return {
    code: properties.code,
    name: properties.name,
    level: properties.level,
    parentCode: properties.parent_code ?? null,
    bbox: computeGeometryBbox(feature.geometry),
    geometry: toMultiPolygon(feature.geometry),
    source: properties.source,
    license: properties.license,
    attribution: properties.attribution ?? null,
    sourceUrl: properties.source_url ?? null,
    licenseUrl: properties.license_url ?? null,
    retrievedAt: properties.retrieved_at ?? null,
    isDemo: properties.is_demo,
  };
}

type ZodIssue = z.ZodError["issues"][number];

function isRegionIssueCode(value: string): value is RegionIssueCode {
  return (REGION_ISSUE_CODES as readonly string[]).includes(value);
}

function issueRegionCode(issue: ZodIssue): RegionIssueCode {
  const params = "params" in issue ? issue.params : undefined;
  const customCode = params?.["regionIssue"];
  if (typeof customCode === "string" && isRegionIssueCode(customCode)) {
    return customCode;
  }

  const segments = issue.path.map(String);
  if (segments.includes("properties")) return "invalid_properties";
  if (segments.includes("coordinates")) {
    // A Position is a two-number tuple. Extra/missing ordinates or a non-number
    // ordinate are position errors; invalid ring/polygon structure is geometry.
    if (
      issue.code === "invalid_type" ||
      (issue.code === "too_big" &&
        "origin" in issue &&
        issue.origin === "array")
    ) {
      return "invalid_position";
    }
    return "invalid_geometry";
  }
  if (segments.includes("geometry")) return "invalid_geometry";
  if (segments.includes("features")) return "invalid_feature";
  return "invalid_collection";
}

function formatIssuePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "(root)";
  return path.reduce<string>((formatted, segment) => {
    if (typeof segment === "number") return `${formatted}[${segment}]`;
    return formatted.length === 0
      ? String(segment)
      : `${formatted}.${String(segment)}`;
  }, "");
}

function toValidationIssues(error: z.ZodError): RegionValidationIssue[] {
  return error.issues.map((issue) => ({
    path: formatIssuePath(issue.path),
    code: issueRegionCode(issue),
    message: issue.message,
  }));
}

/**
 * Parse and normalize a GeoJSON region collection.
 *
 * Returns `issues` instead of throwing so an importer can report every problem
 * in a file. The input object is not mutated.
 */
export function parseRegionFeatureCollection(
  input: unknown,
  options: RegionValidationOptions = {},
): RegionParseResult {
  const expectedBbox = options.expectedBbox
    ? normalizeExpectedBbox(options.expectedBbox)
    : undefined;
  const schema = createCollectionSchema(expectedBbox);
  const result = schema.safeParse(input);

  if (!result.success) {
    return { success: false, issues: toValidationIssues(result.error) };
  }

  return {
    success: true,
    regions: result.data.features.map((feature) =>
      toImportedRegion(feature as ParsedFeature),
    ),
  };
}
