import type { Bbox } from "./types";

export interface BboxFilterResult<T> {
  kept: T[];
  discarded: T[];
}

export function parseBbox(raw: string): Bbox {
  const parts = raw.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    throw new RangeError(
      "Bbox must contain four numeric values: west,south,east,north.",
    );
  }
  const [west, south, east, north] = parts as [number, number, number, number];
  if (west < -180 || east > 180 || south < -90 || north > 90) {
    throw new RangeError("Bbox coordinates are outside WGS84 bounds.");
  }
  if (west >= east || south >= north) {
    throw new RangeError("Bbox must satisfy west < east and south < north.");
  }
  return { west, south, east, north };
}

export function isWithinBbox(
  point: Pick<
    { latitude: number; longitude: number },
    "latitude" | "longitude"
  >,
  bbox: Bbox,
): boolean {
  return (
    point.longitude >= bbox.west &&
    point.longitude <= bbox.east &&
    point.latitude >= bbox.south &&
    point.latitude <= bbox.north
  );
}

export function filterDetectionsByBbox<
  T extends { latitude: number; longitude: number },
>(detections: readonly T[], bbox: Bbox): BboxFilterResult<T> {
  const kept: T[] = [];
  const discarded: T[] = [];
  for (const detection of detections) {
    if (isWithinBbox(detection, bbox)) {
      kept.push(detection);
    } else {
      discarded.push(detection);
    }
  }
  return { kept, discarded };
}
