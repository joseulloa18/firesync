import { canonicalSatelliteName } from "../firms/products";
import type { FirmsDetection } from "../firms/types";
import type { DedupeResult } from "./types";

function numberKey(value: number): string {
  return Object.is(value, -0) ? "0" : String(value);
}

export function detectionDedupeKey(detection: FirmsDetection): string {
  const satellite =
    canonicalSatelliteName(detection.satellite) ?? detection.satellite.trim();
  return [
    satellite,
    detection.acqAt,
    numberKey(detection.latitude),
    numberKey(detection.longitude),
  ].join("|");
}

export function dedupeDetections<T extends FirmsDetection>(
  detections: readonly T[],
): DedupeResult<T> {
  const seen = new Set<string>();
  const unique: T[] = [];
  const duplicates: T[] = [];

  for (const detection of detections) {
    const key = detectionDedupeKey(detection);
    if (seen.has(key)) {
      duplicates.push(detection);
      continue;
    }
    seen.add(key);
    unique.push(detection);
  }

  return {
    unique,
    duplicates,
    duplicateCount: duplicates.length,
  };
}
