import { FirmsClientError } from "./errors";
import {
  isFirmsSource,
  type FirmsAreaRequest,
  type FirmsBbox,
  type FirmsSource,
} from "./types";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface NormalizedFirmsRequest {
  readonly source: FirmsSource;
  readonly bbox: FirmsBbox;
  readonly dayRange: number;
  readonly date?: string;
}

function fail(
  code: "invalid_source" | "invalid_bbox" | "invalid_day_range",
  message: string,
): never {
  throw new FirmsClientError(code, message);
}

export function assertValidMapKey(mapKey: unknown): asserts mapKey is string {
  if (typeof mapKey !== "string" || mapKey.trim().length === 0) {
    throw new FirmsClientError(
      "invalid_map_key",
      "A non-empty FIRMS map key is required.",
    );
  }
}

export function assertValidCalendarDate(date: unknown): asserts date is string {
  if (typeof date !== "string") {
    throw new FirmsClientError(
      "invalid_date",
      "date must be a valid UTC calendar date in YYYY-MM-DD format.",
    );
  }

  const match = DATE_PATTERN.exec(date);
  if (!match) {
    throw new FirmsClientError(
      "invalid_date",
      "date must be a valid UTC calendar date in YYYY-MM-DD format.",
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);

  // Comparing components rejects rollovers such as 2023-02-29 or 2024-04-31.
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new FirmsClientError(
      "invalid_date",
      "date must be a valid UTC calendar date in YYYY-MM-DD format.",
    );
  }
}

export function normalizeFirmsRequest(
  request: FirmsAreaRequest,
): NormalizedFirmsRequest {
  const source: unknown = request.source;
  if (!isFirmsSource(source)) {
    fail("invalid_source", "Unsupported FIRMS source.");
  }

  const bbox: unknown = request.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    fail(
      "invalid_bbox",
      "bbox must contain west, south, east and north coordinates.",
    );
  }

  const [west, south, east, north] = bbox;
  if (
    typeof west !== "number" ||
    typeof south !== "number" ||
    typeof east !== "number" ||
    typeof north !== "number" ||
    !Number.isFinite(west) ||
    !Number.isFinite(south) ||
    !Number.isFinite(east) ||
    !Number.isFinite(north)
  ) {
    fail("invalid_bbox", "bbox must contain four finite WGS84 coordinates.");
  }

  if (
    west < -180 ||
    west > 180 ||
    east < -180 ||
    east > 180 ||
    south < -90 ||
    south > 90 ||
    north < -90 ||
    north > 90
  ) {
    fail("invalid_bbox", "bbox coordinates are outside WGS84 ranges.");
  }

  if (west >= east || south >= north) {
    fail("invalid_bbox", "bbox must be ordered west < east and south < north.");
  }

  const dayRange: unknown = request.dayRange;
  if (
    typeof dayRange !== "number" ||
    !Number.isInteger(dayRange) ||
    dayRange < 1 ||
    dayRange > 5
  ) {
    fail("invalid_day_range", "dayRange must be an integer between 1 and 5.");
  }

  const date = request.date;
  if (date !== undefined) assertValidCalendarDate(date);

  return {
    source,
    bbox: [west, south, east, north],
    dayRange,
    date,
  };
}

export function parseRetryAfterMs(
  value: string | null,
  nowMs: number,
): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isFinite(seconds)) return null;
    return seconds * 1000;
  }

  const timestamp = Date.parse(trimmed);
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, timestamp - nowMs);
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

export function buildAreaCsvUrl(
  mapKey: string,
  request: NormalizedFirmsRequest,
  baseUrl: string,
): string {
  const segments = [
    baseUrl,
    encodeURIComponent(mapKey),
    request.source,
    request.bbox.join(","),
    String(request.dayRange),
  ];
  if (request.date !== undefined) segments.push(request.date);
  return segments.join("/");
}
