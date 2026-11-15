/**
 * Stable spatial aggregation for the fire map activity layer.
 *
 * The grid is aligned to fixed WGS84 degree cells, not to the current dataset,
 * so the same coordinate always falls in the same cell. Counts are always the
 * number of input records, never a second sampling or a fitted model.
 */

/** ~1.1 km at the equator: small enough to show clusters, large enough to aggregate. */
export const ACTIVITY_CELL_SIZE_DEGREES = 0.01;

/** Same four-step pink-to-red scale used by the calendar. Low to high only. */
export const ACTIVITY_PALETTE = [
  "#fbd6d2",
  "#ffb48f",
  "#f77555",
  "#be293b",
] as const;

/** Keep the DOM marker/list representation bounded; aggregates keep every record. */
export const MAX_MAP_POINTS = 250;

export type ActivityLevel = 0 | 1 | 2 | 3;

export type ActivityPoint = {
  readonly coordinates: readonly [number, number];
  readonly is_demo?: boolean;
};

export type ActivityCellProperties = {
  /** Stable world-cell identifier, for example "10945:10875". */
  cell: string;
  count: number;
  level: ActivityLevel;
  is_demo: boolean;
};

export type ActivityCellFeature = {
  type: "Feature";
  properties: ActivityCellProperties;
  geometry: {
    type: "Polygon";
    coordinates: [number, number][][];
  };
};

export type ActivityGrid = {
  /** Sum of every valid input record represented by the cells. */
  total: number;
  cellCount: number;
  maxCount: number;
  collection: {
    type: "FeatureCollection";
    features: ActivityCellFeature[];
  };
};

export type ActivityGridOptions = {
  /** Cell side in degrees. Defaults to ACTIVITY_CELL_SIZE_DEGREES. */
  cellSize?: number;
};

const COORDINATE_PRECISION = 6;

function roundCoordinate(value: number): number {
  return Number(value.toFixed(COORDINATE_PRECISION));
}

function isUsableCoordinate(
  coordinate: readonly [number, number],
): coordinate is readonly [number, number] {
  const [lng, lat] = coordinate;
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Converts a coordinate to a stable cell index measured from -180/-90.
 * Rounding the quotient avoids floating-point cases such as -70.55 / 0.01
 * landing just below an integer and leaking into the previous cell.
 */
function cellIndex(value: number, origin: number, cellSize: number): number {
  return Math.floor(
    Number(((value - origin) / cellSize).toFixed(COORDINATE_PRECISION)),
  );
}

/**
 * Four relative steps for the shared palette. Every populated cell has at least
 * one record; the strongest cell always receives the final step. These steps are
 * relative intensity, not severity or a prediction.
 */
export function activityLevel(count: number, maxCount: number): ActivityLevel {
  if (!Number.isFinite(count) || count <= 0) return 0;
  if (!Number.isFinite(maxCount) || maxCount <= 0) return 0;
  const ratio = count / maxCount;
  if (ratio > 0.75) return 3;
  if (ratio > 0.5) return 2;
  if (ratio > 0.25) return 1;
  return 0;
}

/**
 * Groups the supplied records into stable cells and returns GeoJSON polygons.
 * Invalid WGS84 coordinates are ignored and are not counted in `total`.
 */
export function buildActivityGrid(
  points: readonly ActivityPoint[],
  { cellSize = ACTIVITY_CELL_SIZE_DEGREES }: ActivityGridOptions = {},
): ActivityGrid {
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new RangeError("cellSize must be a positive number of degrees");
  }

  const cells = new Map<
    string,
    {
      x: number;
      y: number;
      count: number;
      isDemo: boolean;
    }
  >();

  const xSpan = Math.max(1, Math.ceil(360 / cellSize));
  const ySpan = Math.max(1, Math.ceil(180 / cellSize));

  for (const point of points) {
    if (!isUsableCoordinate(point.coordinates)) continue;
    const [lng, lat] = point.coordinates;
    const x = clamp(cellIndex(lng, -180, cellSize), 0, xSpan - 1);
    const y = clamp(cellIndex(lat, -90, cellSize), 0, ySpan - 1);
    const cell = `${x}:${y}`;
    const current = cells.get(cell);
    if (current) {
      current.count += 1;
      // A cell is synthetic only when every record inside it is synthetic.
      current.isDemo = current.isDemo && point.is_demo === true;
    } else {
      cells.set(cell, {
        x,
        y,
        count: 1,
        isDemo: point.is_demo === true,
      });
    }
  }

  const entries = [...cells.values()].sort((a, b) => a.x - b.x || a.y - b.y);
  const maxCount = entries.reduce((max, cell) => Math.max(max, cell.count), 0);
  const total = entries.reduce((sum, cell) => sum + cell.count, 0);
  const features: ActivityCellFeature[] = entries.map((cell) => {
    const west = roundCoordinate(-180 + cell.x * cellSize);
    const south = roundCoordinate(-90 + cell.y * cellSize);
    const east = roundCoordinate(Math.min(180, west + cellSize));
    const north = roundCoordinate(Math.min(90, south + cellSize));
    return {
      type: "Feature",
      properties: {
        cell: `${cell.x}:${cell.y}`,
        count: cell.count,
        level: activityLevel(cell.count, maxCount),
        is_demo: cell.isDemo,
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south],
          ],
        ],
      },
    };
  });

  return {
    total,
    cellCount: features.length,
    maxCount,
    collection: { type: "FeatureCollection", features },
  };
}

export type LimitedPoints<T> = {
  visible: readonly T[];
  hiddenCount: number;
};

/**
 * Bounds only the point/list rendering. Totals, CSV output and the activity
 * layer must always be built from the complete filtered list.
 */
export function limitDetectionsForDisplay<T>(
  points: readonly T[],
  limit: number = MAX_MAP_POINTS,
): LimitedPoints<T> {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError("limit must be a non-negative integer");
  }
  if (points.length <= limit) {
    return { visible: points, hiddenCount: 0 };
  }
  return {
    visible: points.slice(0, limit),
    hiddenCount: points.length - limit,
  };
}
