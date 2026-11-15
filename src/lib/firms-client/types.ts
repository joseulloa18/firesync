export const FIRMS_AREA_CSV_BASE_URL =
  "https://firms.modaps.eosdis.nasa.gov/api/area/csv";

// Sources accepted by this client. LANDSAT_NRT is intentionally excluded.
export const FIRMS_SOURCES = [
  "MODIS_SP",
  "VIIRS_SNPP_SP",
  "MODIS_NRT",
  "VIIRS_SNPP_NRT",
  "VIIRS_NOAA20_NRT",
  "VIIRS_NOAA21_NRT",
  "VIIRS_NOAA20_SP",
  "VIIRS_NOAA21_SP",
] as const;

export type FirmsSource = (typeof FIRMS_SOURCES)[number];

export function isFirmsSource(value: unknown): value is FirmsSource {
  return (
    typeof value === "string" &&
    (FIRMS_SOURCES as readonly string[]).includes(value)
  );
}

// FIRMS expects west,south,east,north in WGS84 degrees.
export type FirmsBbox = readonly [
  west: number,
  south: number,
  east: number,
  north: number,
];

export interface FirmsAreaRequest {
  readonly source: FirmsSource;
  readonly bbox: FirmsBbox;
  /** Number of days, from 1 to 5. */
  readonly dayRange: number;
  /** Optional start date in YYYY-MM-DD (UTC calendar date). */
  readonly date?: string;
}

export interface FirmsDownloadOptions {
  readonly signal?: AbortSignal;
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type FirmsSleep = (
  milliseconds: number,
  signal?: AbortSignal,
) => Promise<void>;

export interface FirmsClientOptions {
  /** FIRMS map key. The caller supplies it; this module never reads env vars. */
  readonly mapKey: string;
  readonly fetch: FetchLike;
  /** Defaults to 30 seconds per HTTP attempt. */
  readonly timeoutMs?: number;
  /** Defaults to 1000 ms between request starts. Set to 0 to disable. */
  readonly minIntervalMs?: number;
  /** Defaults to 2 retries (3 attempts total). Bounded to 0..5. */
  readonly maxRetries?: number;
  /** Defaults to 500 ms for the first backoff. */
  readonly retryBaseDelayMs?: number;
  /** Defaults to 10000 ms and caps Retry-After/backoff delays. */
  readonly maxRetryDelayMs?: number;
  /** Injectable clock for tests. Defaults to Date.now. */
  readonly now?: () => number;
  /** Injectable sleeper for tests. Defaults to setTimeout. */
  readonly sleep?: FirmsSleep;
}
