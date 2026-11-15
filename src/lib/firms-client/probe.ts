import { createHash } from "node:crypto";
import { z } from "zod";
import { parseFirmsCsv } from "../firms/csv";
import {
  FirmsAvailabilityError,
  parseFirmsAvailabilityCsv,
} from "./availability";
import { createBoundedFirmsFetch } from "./bounded-fetch";
import { createFirmsClient } from "./client";
import { FirmsClientError } from "./errors";
import { FIRMS_SOURCES, type FetchLike } from "./types";
import { assertValidCalendarDate, normalizeFirmsRequest } from "./validation";

const DEFAULT_BBOX = [-70.9, 18.6, -70.5, 19] as const;
const INGEST_BBOX = [-72.6, 17, -67.7, 20.6] as const;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bbox = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
const inputSchema = z.strictObject({
  source: z.enum(FIRMS_SOURCES).default("MODIS_SP"),
  bbox: bbox.default([...DEFAULT_BBOX]),
  date: date.optional(),
});

export type FirmsProbeErrorCode =
  | "invalid_input"
  | "missing_key"
  | "invalid_availability"
  | "date_unavailable"
  | "invalid_csv"
  | "upstream_error"
  | "timeout"
  | "aborted";

const messages: Record<FirmsProbeErrorCode, string> = {
  invalid_input: "Invalid source, date or bbox for the FIRMS sample.",
  missing_key: "FIRMS_MAP_KEY is required in the server environment.",
  invalid_availability: "FIRMS returned invalid product availability.",
  date_unavailable: "The requested UTC day is outside product availability.",
  invalid_csv: "FIRMS returned an invalid or inconsistent detection CSV.",
  upstream_error: "The FIRMS request failed. No data was persisted.",
  timeout: "The FIRMS sample exceeded its time limit.",
  aborted: "The FIRMS sample was cancelled.",
};

export class FirmsProbeError extends Error {
  readonly code: FirmsProbeErrorCode;
  constructor(code: FirmsProbeErrorCode) {
    super(messages[code]);
    this.name = "FirmsProbeError";
    this.code = code;
  }
}

export const firmsProbeSummarySchema = z.object({
  status: z.literal("ok"),
  provider: z.literal("NASA FIRMS"),
  origin: z.literal("observed"),
  sampleOnly: z.literal(true),
  persisted: z.literal(false),
  source: z.enum(FIRMS_SOURCES),
  isNrt: z.boolean(),
  bbox,
  dayRange: z.literal(1),
  date,
  availability: z.object({ minDate: date, maxDate: date }),
  downloadedAt: z.iso.datetime(),
  newestAcquiredAt: z.iso.datetime().nullable(),
  lastIngestionAt: z.null(),
  dataThrough: z.null(),
  coverage: z.literal("not_assessed"),
  scientificValidation: z.literal("not_performed"),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  rowsRead: z.number().int().nonnegative(),
  rowsAccepted: z.number().int().nonnegative(),
  rowsRejected: z.literal(0),
  note: z.literal("A satellite detection is not a confirmed fire."),
});

export type FirmsProbeSummary = z.infer<typeof firmsProbeSummarySchema>;

export interface FirmsProbeOptions {
  mapKey: string | undefined;
  fetch: FetchLike;
  signal?: AbortSignal;
  /** Entire operation, including availability, throttle and CSV body. */
  timeoutMs?: number;
  now?: () => Date;
}

// The shared parser normalizes observations but tolerates duplicate headers and
// extra fields. Reject ambiguous CSV structure before using its typed output.
function assertCsvShape(csv: string): void {
  let field = "";
  let fields: string[] = [];
  let headers: string[] | undefined;
  let columns = 0;
  let rows = 0;
  let quoted = false;
  let closedQuote = false;
  let hasContent = false;
  let comment = false;
  const fail = (): never => {
    throw new FirmsProbeError("invalid_csv");
  };
  const endField = () => {
    if (headers === undefined) fields.push(field.trim().toLowerCase());
    columns += 1;
    field = "";
    closedQuote = false;
  };
  const endRow = () => {
    if (hasContent || columns > 0) {
      endField();
      if (headers === undefined) {
        if (
          fields.some((name) => !name) ||
          new Set(fields).size !== fields.length
        )
          fail();
        headers = fields;
      } else if (columns !== headers.length || ++rows > 10_000) fail();
    }
    field = "";
    fields = [];
    columns = 0;
    hasContent = false;
    closedQuote = false;
  };
  const text = csv.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (comment) {
      if (char === "\r" || char === "\n") {
        comment = false;
        field = "";
      }
      continue;
    }
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else field += char;
      continue;
    }
    if (char === ",") {
      endField();
      hasContent = true;
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      endRow();
    } else if (closedQuote) {
      if (char !== " " && char !== "\t") fail();
    } else if (char === '"') {
      if (field !== "") fail();
      quoted = true;
      hasContent = true;
    } else if (char === "#" && columns === 0 && field.trim() === "") {
      comment = true;
      field = "";
    } else {
      field += char;
      if (char.trim()) hasContent = true;
    }
  }
  if (quoted) fail();
  if (!comment) endRow();
  if (headers === undefined) fail();
}

/** Two bounded, read-only requests; never writes observations or changes demo. */
export async function probeFirms(
  input: unknown,
  options: FirmsProbeOptions,
): Promise<FirmsProbeSummary> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new FirmsProbeError("invalid_input");
  const request = parsed.data;
  try {
    normalizeFirmsRequest({ ...request, dayRange: 1 });
  } catch {
    throw new FirmsProbeError("invalid_input");
  }
  const [west, south, east, north] = request.bbox;
  if (
    east - west > 1 ||
    north - south > 1 ||
    west < INGEST_BBOX[0] ||
    south < INGEST_BBOX[1] ||
    east > INGEST_BBOX[2] ||
    north > INGEST_BBOX[3]
  ) {
    throw new FirmsProbeError("invalid_input");
  }
  const mapKey = options.mapKey;
  if (typeof mapKey !== "string" || !mapKey.trim()) {
    throw new FirmsProbeError("missing_key");
  }
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new FirmsProbeError("invalid_input");
  }
  if (options.signal?.aborted) throw new FirmsProbeError("aborted");

  let fetch: FetchLike;
  try {
    fetch = createBoundedFirmsFetch(options.fetch, 1_048_576);
  } catch {
    throw new FirmsProbeError("invalid_input");
  }

  const controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([controller.signal, options.signal])
    : controller.signal;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // Race the whole operation as well as passing the signal to real fetch.
  // This also bounds injected transports that ignore cancellation.
  let onAbort: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () =>
      reject(
        new FirmsProbeError(options.signal?.aborted ? "aborted" : "timeout"),
      );
    signal.addEventListener("abort", onAbort, { once: true });
  });
  const assertActive = () => {
    if (signal.aborted) {
      throw new FirmsProbeError(
        options.signal?.aborted ? "aborted" : "timeout",
      );
    }
  };
  const run = async (): Promise<FirmsProbeSummary> => {
    assertActive();
    const url =
      "https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/" +
      encodeURIComponent(mapKey) +
      "/" +
      request.source;
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "text/csv" },
      signal,
    });
    assertActive();
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => {});
      throw new FirmsProbeError("upstream_error");
    }
    const availability = parseFirmsAvailabilityCsv(
      await response.text(),
      request.source,
    );
    const selectedDate = request.date ?? availability.maxDate;
    assertValidCalendarDate(selectedDate);
    if (
      selectedDate < availability.minDate ||
      selectedDate > availability.maxDate
    ) {
      throw new FirmsProbeError("date_unavailable");
    }

    // Leave at least one second between availability and the area request.
    // Only one sample runs per invocation; distributed quotas are a later stage.
    await new Promise<void>((resolve) => {
      const stop = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", stop);
        resolve();
      }, 1_000);
      signal.addEventListener("abort", stop, { once: true });
    });
    assertActive();
    const client = createFirmsClient({
      mapKey,
      fetch,
      maxRetries: 0,
      timeoutMs,
    });
    const csv = await client.download(
      { ...request, date: selectedDate, dayRange: 1 },
      { signal },
    );
    assertActive();
    assertCsvShape(csv);
    let result: ReturnType<typeof parseFirmsCsv>;
    try {
      result = parseFirmsCsv(csv, {
        source: request.source,
        bbox: { west, south, east, north },
      });
    } catch {
      throw new FirmsProbeError("invalid_csv");
    }
    if (
      result.rowsRejected !== 0 ||
      result.rowsRead > 10_000 ||
      result.detections.some(
        (row) =>
          row.acqDate !== selectedDate ||
          [row.frp, row.brightness, row.brightness2, row.scan, row.track].some(
            (value) => value !== null && value < 0,
          ),
      )
    ) {
      throw new FirmsProbeError("invalid_csv");
    }
    const newestAcquiredAt = result.detections.reduce<string | null>(
      (latest, row) =>
        latest === null || row.acqAt > latest ? row.acqAt : latest,
      null,
    );
    return firmsProbeSummarySchema.parse({
      status: "ok",
      provider: "NASA FIRMS",
      origin: "observed",
      sampleOnly: true,
      persisted: false,
      source: request.source,
      isNrt: request.source.endsWith("_NRT"),
      bbox: request.bbox,
      dayRange: 1,
      date: selectedDate,
      availability: {
        minDate: availability.minDate,
        maxDate: availability.maxDate,
      },
      downloadedAt: (options.now ?? (() => new Date()))().toISOString(),
      newestAcquiredAt,
      lastIngestionAt: null,
      dataThrough: null,
      coverage: "not_assessed",
      scientificValidation: "not_performed",
      sha256: createHash("sha256").update(csv).digest("hex"),
      rowsRead: result.rowsRead,
      rowsAccepted: result.rowsAccepted,
      rowsRejected: 0,
      note: "A satellite detection is not a confirmed fire.",
    });
  };
  try {
    return await Promise.race([run(), cancelled]);
  } catch (error: unknown) {
    if (error instanceof FirmsProbeError) throw error;
    if (error instanceof FirmsAvailabilityError) {
      throw new FirmsProbeError("invalid_availability");
    }
    if (
      signal.aborted ||
      (error instanceof FirmsClientError && error.code === "timeout")
    ) {
      throw new FirmsProbeError(
        options.signal?.aborted ? "aborted" : "timeout",
      );
    }
    // Do not expose errors, causes, URLs or response text from upstream code.
    throw new FirmsProbeError("upstream_error");
  } finally {
    clearTimeout(timeout);
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}
