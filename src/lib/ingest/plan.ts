import { z } from "zod";
import type { FirmsAreaRequest, FirmsBbox, FirmsSource } from "../firms-client";

/**
 * Historical ingestion planner.
 *
 * NASA FIRMS accepts area requests of 1 to 5 UTC days. A backfill of several
 * years therefore needs many small requests, each one resumable. This module
 * only builds that list; it never calls FIRMS, the database or reads secrets.
 */

// Only the two archived products feed the historical series.
// See docs/DATOS-Y-ARMONIZACION.md sections 1.2 and 5.2.
export const PLAN_SOURCES = [
  "MODIS_SP",
  "VIIRS_SNPP_SP",
] as const satisfies readonly FirmsSource[];

export type PlanSource = (typeof PLAN_SOURCES)[number];

export const MIN_WINDOW_DAYS = 1;
export const MAX_WINDOW_DAYS = 5;
export const DEFAULT_WINDOW_DAYS = MAX_WINDOW_DAYS;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** One FIRMS area request, ready to pass to the existing client contract. */
export interface IngestWindow {
  /**
   * Stable identifier: source/start/end/bbox. It does not change between runs,
   * so it can be persisted in `job_runs.cursor` to resume a backfill.
   */
  readonly id: string;
  readonly source: PlanSource;
  /** First UTC day of the window (YYYY-MM-DD), inclusive. */
  readonly startDate: string;
  /** Last UTC day of the window (YYYY-MM-DD), inclusive. */
  readonly endDate: string;
  /** Number of UTC days covered: `endDate - startDate + 1`, from 1 to 5. */
  readonly dayRange: number;
  readonly bbox: FirmsBbox;
  /** Same data shaped as the FIRMS client request. */
  readonly request: FirmsAreaRequest;
}

export interface IngestPlanInput {
  /** First UTC day to ingest (YYYY-MM-DD), inclusive. */
  readonly startDate: string;
  /** Last UTC day to ingest (YYYY-MM-DD), inclusive. */
  readonly endDate: string;
  /** Ingest box in WGS84 order: [west, south, east, north]. */
  readonly bbox: readonly [number, number, number, number];
  /** Days per request: integer from 1 to 5. Defaults to 5. */
  readonly windowDays?: number;
  /** Products to plan. Defaults to MODIS_SP and then VIIRS_SNPP_SP. */
  readonly sources?: readonly PlanSource[];
  /** Identifiers of windows that already finished; they are filtered out. */
  readonly completed?: readonly string[];
}

export type IngestPlanErrorCode = "invalid_input" | "invalid_range";

export interface IngestPlanIssue {
  readonly path: string;
  readonly message: string;
}

export class IngestPlanError extends Error {
  readonly code: IngestPlanErrorCode;
  readonly issues: readonly IngestPlanIssue[];

  constructor(
    code: IngestPlanErrorCode,
    message: string,
    issues: readonly IngestPlanIssue[] = [],
  ) {
    super(message);
    this.name = "IngestPlanError";
    this.code = code;
    this.issues = issues;
  }
}

export function isPlanSource(value: unknown): value is PlanSource {
  return (
    typeof value === "string" &&
    (PLAN_SOURCES as readonly string[]).includes(value)
  );
}

// A real UTC calendar date, checked component by component so that rollovers
// such as 2023-02-29 or 2024-04-31 are rejected.
function isRealUtcDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (match === null) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function utcDayMs(value: string): number {
  const match = DATE_PATTERN.exec(value);
  if (match === null) {
    throw new IngestPlanError("invalid_input", "Invalid UTC calendar date.");
  }
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getTime();
}

function formatUtcDay(value: number): string {
  const date = new Date(value);
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const calendarDateSchema = z.string().refine(isRealUtcDate, {
  message: "Expected a real UTC calendar date in YYYY-MM-DD format.",
});

const bboxSchema = z
  .array(
    z.number().refine(Number.isFinite, {
      message: "Bbox coordinates must be finite numbers.",
    }),
  )
  .length(4, { message: "Bbox must contain west, south, east and north." })
  .refine(
    (values) =>
      values[0] >= -180 &&
      values[0] <= 180 &&
      values[2] >= -180 &&
      values[2] <= 180,
    { message: "Longitudes must be between -180 and 180." },
  )
  .refine(
    (values) =>
      values[1] >= -90 &&
      values[1] <= 90 &&
      values[3] >= -90 &&
      values[3] <= 90,
    { message: "Latitudes must be between -90 and 90." },
  )
  .refine((values) => values[0] < values[2] && values[1] < values[3], {
    message: "Bbox must satisfy west < east and south < north.",
  });

const planInputSchema = z.object({
  startDate: calendarDateSchema,
  endDate: calendarDateSchema,
  bbox: bboxSchema,
  windowDays: z
    .number()
    .int({ message: "windowDays must be an integer." })
    .min(MIN_WINDOW_DAYS, {
      message: `windowDays must be at least ${MIN_WINDOW_DAYS}.`,
    })
    .max(MAX_WINDOW_DAYS, {
      message: `windowDays cannot exceed ${MAX_WINDOW_DAYS}.`,
    })
    .default(DEFAULT_WINDOW_DAYS),
  sources: z
    .array(z.enum(PLAN_SOURCES), {
      message: "Only MODIS_SP and VIIRS_SNPP_SP are historical sources.",
    })
    .min(1, { message: "At least one source is required." })
    .default([...PLAN_SOURCES]),
  completed: z.array(z.string().min(1)).default([]),
});

function toIssues(error: z.ZodError): IngestPlanIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

function buildWindowId(
  source: PlanSource,
  startDate: string,
  endDate: string,
  bbox: FirmsBbox,
): string {
  return [source, startDate, endDate, bbox.join(",")].join("/");
}

/**
 * Builds the ordered list of pending UTC windows for a historical backfill.
 *
 * Windows are consecutive and inclusive: the last one is cut at `endDate`, so
 * it can cover fewer than `windowDays` days (never zero). Windows whose `id`
 * appears in `completed` are skipped; unknown ids are ignored. The function is
 * deterministic: the same input always returns the same windows and ids.
 */
export function planIngestWindows(input: IngestPlanInput): IngestWindow[] {
  const parsed = planInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new IngestPlanError(
      "invalid_input",
      "Invalid ingest plan input.",
      toIssues(parsed.error),
    );
  }

  const { startDate, endDate, windowDays } = parsed.data;
  if (startDate > endDate) {
    throw new IngestPlanError("invalid_range", "Invalid date range.", [
      {
        path: "endDate",
        message: "endDate must be on or after startDate.",
      },
    ]);
  }

  const bbox: FirmsBbox = [
    parsed.data.bbox[0],
    parsed.data.bbox[1],
    parsed.data.bbox[2],
    parsed.data.bbox[3],
  ];
  const completed = new Set(parsed.data.completed);
  const sources = [...new Set(parsed.data.sources)];
  const startMs = utcDayMs(startDate);
  const endMs = utcDayMs(endDate);
  const stepMs = windowDays * DAY_MS;
  const windows: IngestWindow[] = [];

  for (const source of sources) {
    for (let cursor = startMs; cursor <= endMs; cursor += stepMs) {
      // Never go past the requested end: the final window is shorter.
      const lastMs = Math.min(cursor + (windowDays - 1) * DAY_MS, endMs);
      const windowStart = formatUtcDay(cursor);
      const windowEnd = formatUtcDay(lastMs);
      const dayRange = Math.round((lastMs - cursor) / DAY_MS) + 1;
      const windowBbox: FirmsBbox = [bbox[0], bbox[1], bbox[2], bbox[3]];
      const id = buildWindowId(source, windowStart, windowEnd, windowBbox);

      if (completed.has(id)) continue;

      windows.push({
        id,
        source,
        startDate: windowStart,
        endDate: windowEnd,
        dayRange,
        bbox: windowBbox,
        request: {
          source,
          bbox: windowBbox,
          dayRange,
          date: windowStart,
        },
      });
    }
  }

  return windows;
}
