import type { Stats } from "node:fs";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { parseBbox } from "../firms/bbox";
import { parseFirmsCsv } from "../firms/csv";
import { resolveFirmsProduct } from "../firms/products";
import { FirmsCsvError } from "../firms/types";
import type {
  Bbox,
  CsvRowError,
  FirmsProduct,
  SensorFamily,
} from "../firms/types";
import { detectionDedupeKey } from "../harmonize/dedupe";
import { PLAN_SOURCES } from "./plan";
import type { PlanSource } from "./plan";

/**
 * Read-only preview of historical FIRMS CSV files stored on the local disk.
 *
 * This module only reads files, validates them with the existing parser and
 * reports counts. It never calls FIRMS, the database or the email provider, and
 * it never writes rows. A green preview does not mean that ingestion exists.
 *
 * The manifest is the only authority for the product of each file. Satellite
 * names are never inferred from file names, and only the archived sources
 * (`MODIS_SP` and `VIIRS_SNPP_SP`) are accepted. NOAA-20/21 are reserved for the
 * current-data flow and are rejected here.
 */

export const DEFAULT_MANIFEST_FILE = "manifest.json";

export const LOCAL_PREVIEW_LIMITS = {
  /** Maximum number of CSV files listed in one manifest. */
  maxFiles: 16,
  /** Maximum size of the manifest JSON file in bytes (64 KiB). */
  maxManifestBytes: 64 * 1024,
  /** Maximum size of one CSV file in bytes (8 MiB). */
  maxFileBytes: 8 * 1024 * 1024,
  /** Maximum size of all CSV files together in bytes (32 MiB). */
  maxTotalBytes: 32 * 1024 * 1024,
  /** Maximum number of row errors copied into the JSON report per file. */
  maxErrorSamples: 20,
} as const;

export type LocalPreviewLimits = Record<
  keyof typeof LOCAL_PREVIEW_LIMITS,
  number
>;

export interface LocalPreviewOptions {
  /** Directory that contains the manifest and the CSV files. */
  readonly directory: string;
  /** Manifest file name inside the directory. Defaults to `manifest.json`. */
  readonly manifestFileName?: string;
  /** Overrides for tests or controlled local runs. */
  readonly limits?: Partial<LocalPreviewLimits>;
}

export type LocalPreviewErrorCode =
  | "invalid_input"
  | "invalid_manifest"
  | "unsafe_path"
  | "too_many_files"
  | "file_not_found"
  | "not_a_file"
  | "file_too_large"
  | "total_size_exceeded"
  | "read_failed";

export interface LocalPreviewIssue {
  readonly path: string;
  readonly message: string;
}

export class LocalPreviewError extends Error {
  readonly code: LocalPreviewErrorCode;
  readonly issues: readonly LocalPreviewIssue[];

  constructor(
    code: LocalPreviewErrorCode,
    message: string,
    issues: readonly LocalPreviewIssue[] = [],
  ) {
    super(message);
    this.name = "LocalPreviewError";
    this.code = code;
    this.issues = issues;
  }
}

export interface PreviewFileCounts {
  readonly rowsRead: number;
  readonly rowsAccepted: number;
  readonly rowsRejected: number;
  /** Rows removed by the shared dedupe key, including cross-file repeats. */
  readonly duplicates: number;
  readonly uniqueRows: number;
}

export interface PreviewProductInfo {
  readonly source: PlanSource;
  readonly sensor: SensorFamily;
  readonly isNrt: boolean;
  readonly historicalSeries: boolean;
  readonly allowedSatellites: readonly string[];
}

export interface PreviewFileResult extends PreviewFileCounts {
  readonly file: string;
  readonly source: PlanSource;
  readonly sensor: SensorFamily;
  readonly product: PreviewProductInfo;
  /** `rejected` means the file could not be parsed at all. */
  readonly status: "ok" | "rejected";
  readonly byteSize: number;
  /** True when the CSV starts with a `# ... SYNTHETIC ...` comment. */
  readonly syntheticMarker: boolean;
  readonly satellites: readonly string[];
  readonly firstAcqDate: string | null;
  readonly lastAcqDate: string | null;
  readonly firstAcqAt: string | null;
  readonly lastAcqAt: string | null;
  readonly errors: readonly CsvRowError[];
  readonly errorsTruncated: boolean;
  readonly errorsByCode: Readonly<Record<string, number>>;
  readonly parseError: {
    readonly code: string;
    readonly message: string;
  } | null;
}

export interface PreviewTotals extends PreviewFileCounts {
  readonly files: number;
  readonly filesRejected: number;
  readonly satellites: readonly string[];
  readonly sensors: readonly SensorFamily[];
  readonly firstAcqDate: string | null;
  readonly lastAcqDate: string | null;
  readonly firstAcqAt: string | null;
  readonly lastAcqAt: string | null;
  readonly errorsByCode: Readonly<Record<string, number>>;
}

export interface LocalPreviewReport {
  readonly mode: "local_csv_preview";
  readonly source: "local_files";
  readonly directoryName: string;
  readonly manifestFile: string;
  readonly manifestVersion: 1;
  readonly synthetic: boolean;
  readonly bbox: Bbox | null;
  readonly limits: LocalPreviewLimits;
  readonly files: readonly PreviewFileResult[];
  readonly totals: PreviewTotals;
  readonly notice: string;
  readonly warnings: readonly string[];
  /** Explicit statement that this command has no side effects. */
  readonly writes: {
    readonly database: false;
    readonly network: false;
    readonly email: false;
  };
}

interface PreviewManifestEntry {
  readonly file: string;
  readonly source: PlanSource;
}

interface ParsedManifest {
  readonly synthetic: boolean;
  readonly bbox: Bbox | null;
  readonly files: readonly PreviewManifestEntry[];
}

/**
 * A file is always a single flat `.csv` name. Rejecting separators and drive
 * letters keeps `../` and absolute paths out before touching the filesystem.
 */
export function isSafeFlatCsvName(value: string): boolean {
  if (value.length === 0 || value.length > 255) return false;
  if (value.includes("\0")) return false;
  if (value === "." || value === "..") return false;
  if (/[\\/]/.test(value)) return false;
  if (/^[A-Za-z]:/.test(value)) return false;
  return value.toLowerCase().endsWith(".csv");
}

function isSafeManifestName(value: string): boolean {
  if (value.length === 0 || value.length > 255) return false;
  if (value.includes("\0")) return false;
  if (value === "." || value === "..") return false;
  if (/[\\/]/.test(value)) return false;
  if (/^[A-Za-z]:/.test(value)) return false;
  return value.toLowerCase().endsWith(".json");
}

function manifestSchema(maxFiles: number) {
  return z
    .object({
      version: z.literal(1),
      synthetic: z.boolean().default(false),
      bbox: z
        .array(
          z.number().refine(Number.isFinite, {
            message: "Bbox coordinates must be finite numbers.",
          }),
        )
        .length(4, {
          message: "Bbox must contain west, south, east and north.",
        })
        .optional(),
      description: z.string().max(500).optional(),
      files: z
        .array(
          z.object({
            file: z
              .string()
              .min(1, { message: "A file name is required." })
              .max(255, {
                message: "File names cannot exceed 255 characters.",
              }),
            source: z.enum(PLAN_SOURCES, {
              message:
                "Only MODIS_SP and VIIRS_SNPP_SP are archived historical sources.",
            }),
          }),
        )
        .min(1, { message: "The manifest needs at least one CSV file." })
        .max(maxFiles, {
          message: `The manifest cannot list more than ${maxFiles} CSV files.`,
        }),
    })
    .strict();
}

function issueFromZod(error: z.ZodError, prefix = ""): LocalPreviewIssue[] {
  return error.issues.map((issue) => ({
    path: [prefix, ...issue.path.map(String)].filter(Boolean).join("."),
    message: issue.message,
  }));
}

function mergeLimits(
  overrides: Partial<LocalPreviewLimits> | undefined,
): LocalPreviewLimits {
  const limits: LocalPreviewLimits = { ...LOCAL_PREVIEW_LIMITS };
  if (overrides !== undefined) {
    for (const key of Object.keys(limits) as Array<keyof LocalPreviewLimits>) {
      const value = overrides[key];
      if (value === undefined) continue;
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new LocalPreviewError(
          "invalid_input",
          "Preview limits must be positive integers.",
          [{ path: `limits.${key}`, message: "Expected a positive integer." }],
        );
      }
      limits[key] = value;
    }
  }
  return limits;
}

function parseManifestJson(
  text: string,
  limits: LocalPreviewLimits,
  manifestFileName: string,
): ParsedManifest {
  // Windows editors often add a UTF-8 BOM; JSON.parse does not accept it.
  const cleanText = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  let raw: unknown;
  try {
    raw = JSON.parse(cleanText);
  } catch {
    throw new LocalPreviewError(
      "invalid_manifest",
      "The manifest is not valid JSON.",
      [{ path: manifestFileName, message: "Expected JSON text." }],
    );
  }

  if (
    typeof raw === "object" &&
    raw !== null &&
    "files" in raw &&
    Array.isArray((raw as { files?: unknown }).files) &&
    (raw as { files: unknown[] }).files.length > limits.maxFiles
  ) {
    throw new LocalPreviewError(
      "too_many_files",
      `The manifest lists more than ${limits.maxFiles} CSV files.`,
      [
        {
          path: "files",
          message: `Found ${(raw as { files: unknown[] }).files.length}; the limit is ${limits.maxFiles}.`,
        },
      ],
    );
  }

  const parsed = manifestSchema(limits.maxFiles).safeParse(raw);
  if (!parsed.success) {
    throw new LocalPreviewError(
      "invalid_manifest",
      "The manifest does not match the expected schema.",
      issueFromZod(parsed.error),
    );
  }

  const seen = new Set<string>();
  parsed.data.files.forEach((entry, index) => {
    if (!isSafeFlatCsvName(entry.file)) {
      throw new LocalPreviewError(
        "unsafe_path",
        "A manifest entry is not a flat .csv file name inside the preview directory.",
        [
          {
            path: `files.${index}.file`,
            message: `Unsafe name "${entry.file}".`,
          },
        ],
      );
    }
    // Windows is case-insensitive, so treat names that only differ in case as
    // the same file to keep counts stable across operating systems.
    const key = entry.file.toLowerCase();
    if (seen.has(key)) {
      throw new LocalPreviewError(
        "invalid_manifest",
        "The manifest lists the same file more than once.",
        [
          {
            path: `files.${index}.file`,
            message: `Duplicate file "${entry.file}".`,
          },
        ],
      );
    }
    seen.add(key);
  });

  let bbox: Bbox | null = null;
  if (parsed.data.bbox !== undefined) {
    try {
      // Reuse the parser's own bbox validation instead of duplicating rules.
      bbox = parseBbox(parsed.data.bbox.join(","));
    } catch (error: unknown) {
      throw new LocalPreviewError(
        "invalid_manifest",
        "The manifest bbox is invalid.",
        [
          {
            path: "bbox",
            message:
              error instanceof Error ? error.message : "Invalid bbox value.",
          },
        ],
      );
    }
  }

  return {
    synthetic: parsed.data.synthetic,
    bbox,
    files: parsed.data.files.map((entry) => ({
      file: entry.file,
      source: entry.source,
    })),
  };
}

function productInfo(product: FirmsProduct): PreviewProductInfo {
  return {
    source: product.source as PlanSource,
    sensor: product.sensor,
    isNrt: product.isNrt,
    historicalSeries: product.historicalSeries,
    allowedSatellites: [...product.allowedSatellites],
  };
}

function sortedCounts(
  counts: ReadonlyMap<string, number>,
): Record<string, number> {
  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function hasSyntheticMarker(text: string): boolean {
  // The marker only matters in the first comment lines; reading 2 KiB is enough
  // and avoids scanning a large file twice.
  return /^\s*#.*synthetic/im.test(text.slice(0, 2048));
}

function emptyCounts(): PreviewFileCounts {
  return {
    rowsRead: 0,
    rowsAccepted: 0,
    rowsRejected: 0,
    duplicates: 0,
    uniqueRows: 0,
  };
}

interface DetectionAccumulator {
  readonly uniqueKeys: Set<string>;
  readonly satellites: Set<string>;
  readonly sensors: Set<SensorFamily>;
  duplicates: number;
  uniqueRows: number;
  firstAcqDate: string | null;
  lastAcqDate: string | null;
  firstAcqAt: string | null;
  lastAcqAt: string | null;
}

function createAccumulator(): DetectionAccumulator {
  return {
    uniqueKeys: new Set<string>(),
    satellites: new Set<string>(),
    sensors: new Set<SensorFamily>(),
    duplicates: 0,
    uniqueRows: 0,
    firstAcqDate: null,
    lastAcqDate: null,
    firstAcqAt: null,
    lastAcqAt: null,
  };
}

function countErrors(errors: readonly CsvRowError[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const error of errors) {
    counts.set(error.code, (counts.get(error.code) ?? 0) + 1);
  }
  return counts;
}

/**
 * Reads and validates a local archive preview.
 *
 * Order of work:
 * 1. validate options, manifest name and manifest JSON with zod;
 * 2. resolve the directory and reject unsafe or excessive files before reading
 *    any CSV;
 * 3. parse each CSV with `parseFirmsCsv` (bbox and confidence validation
 *    included);
 * 4. dedupe across files with the shared `detectionDedupeKey`;
 * 5. return a deterministic JSON report (no timestamps, no absolute paths).
 */
export async function previewLocalArchive(
  options: LocalPreviewOptions,
): Promise<LocalPreviewReport> {
  if (
    typeof options.directory !== "string" ||
    options.directory.trim() === ""
  ) {
    throw new LocalPreviewError("invalid_input", "A directory is required.", [
      { path: "directory", message: "Expected a non-empty path." },
    ]);
  }

  const limits = mergeLimits(options.limits);
  const manifestFileName = options.manifestFileName ?? DEFAULT_MANIFEST_FILE;
  if (!isSafeManifestName(manifestFileName)) {
    throw new LocalPreviewError(
      "unsafe_path",
      "The manifest name must be a flat .json file inside the preview directory.",
      [
        {
          path: "manifestFileName",
          message: `Unsafe name "${manifestFileName}".`,
        },
      ],
    );
  }

  const requestedDirectory = path.resolve(options.directory);
  let directoryReal: string;
  try {
    const stats = await lstat(requestedDirectory);
    if (!stats.isDirectory()) {
      throw new LocalPreviewError(
        "not_a_file",
        "The preview path is not a directory.",
        [{ path: "directory", message: requestedDirectory }],
      );
    }
    // Resolve symlinks once so the containment check uses real paths.
    directoryReal = await realpath(requestedDirectory);
  } catch (error: unknown) {
    if (error instanceof LocalPreviewError) throw error;
    throw new LocalPreviewError(
      "file_not_found",
      "The preview directory does not exist or cannot be read.",
      [{ path: "directory", message: requestedDirectory }],
    );
  }

  const manifestPath = path.join(directoryReal, manifestFileName);
  let manifestStats: Stats;
  try {
    manifestStats = await lstat(manifestPath);
  } catch {
    throw new LocalPreviewError(
      "file_not_found",
      "The manifest file was not found.",
      [{ path: manifestFileName, message: "Expected a readable JSON file." }],
    );
  }
  if (manifestStats.isSymbolicLink()) {
    throw new LocalPreviewError(
      "unsafe_path",
      "The manifest cannot be a symbolic link.",
      [{ path: manifestFileName, message: "Symbolic links are not allowed." }],
    );
  }
  if (!manifestStats.isFile()) {
    throw new LocalPreviewError(
      "not_a_file",
      "The manifest path is not a regular file.",
      [{ path: manifestFileName, message: "Expected a regular file." }],
    );
  }
  if (manifestStats.size > limits.maxManifestBytes) {
    throw new LocalPreviewError(
      "file_too_large",
      "The manifest exceeds the configured size limit.",
      [
        {
          path: manifestFileName,
          message: `${manifestStats.size} bytes > ${limits.maxManifestBytes} bytes.`,
        },
      ],
    );
  }

  let manifestText: string;
  try {
    manifestText = await readFile(manifestPath, "utf8");
  } catch {
    throw new LocalPreviewError(
      "read_failed",
      "The manifest could not be read.",
      [{ path: manifestFileName, message: "Read failed." }],
    );
  }
  const manifest = parseManifestJson(manifestText, limits, manifestFileName);

  interface PreflightFile {
    readonly entry: PreviewManifestEntry;
    readonly absolutePath: string;
    readonly byteSize: number;
  }

  const preflight: PreflightFile[] = [];
  let totalBytes = 0;
  for (const [index, entry] of manifest.files.entries()) {
    const safeIssuePath = `files.${index}.file`;
    const absolutePath = path.resolve(directoryReal, entry.file);

    // Defense in depth: the name validator already rejects separators, but the
    // resolved parent must also be exactly the preview directory.
    if (path.dirname(absolutePath) !== directoryReal) {
      throw new LocalPreviewError(
        "unsafe_path",
        "A manifest entry points outside the preview directory.",
        [
          {
            path: safeIssuePath,
            message: `"${entry.file}" leaves the preview directory.`,
          },
        ],
      );
    }

    let stats: Stats;
    try {
      stats = await lstat(absolutePath);
    } catch {
      throw new LocalPreviewError(
        "file_not_found",
        "A CSV file listed in the manifest does not exist.",
        [{ path: safeIssuePath, message: `Missing "${entry.file}".` }],
      );
    }
    if (stats.isSymbolicLink()) {
      throw new LocalPreviewError(
        "unsafe_path",
        "Symbolic links are not accepted in a local preview.",
        [
          {
            path: safeIssuePath,
            message: `"${entry.file}" is a symbolic link.`,
          },
        ],
      );
    }
    if (!stats.isFile()) {
      throw new LocalPreviewError(
        "not_a_file",
        "A manifest entry is not a regular file.",
        [{ path: safeIssuePath, message: `"${entry.file}" is not a file.` }],
      );
    }
    if (stats.size > limits.maxFileBytes) {
      throw new LocalPreviewError(
        "file_too_large",
        "A CSV file exceeds the per-file size limit.",
        [
          {
            path: safeIssuePath,
            message: `"${entry.file}" has ${stats.size} bytes; the limit is ${limits.maxFileBytes}.`,
          },
        ],
      );
    }
    totalBytes += stats.size;
    if (totalBytes > limits.maxTotalBytes) {
      throw new LocalPreviewError(
        "total_size_exceeded",
        "The CSV files exceed the total size limit.",
        [
          {
            path: "files",
            message: `Total size is at least ${totalBytes} bytes; the limit is ${limits.maxTotalBytes}.`,
          },
        ],
      );
    }
    preflight.push({ entry, absolutePath, byteSize: stats.size });
  }

  const global = createAccumulator();
  const globalErrors = new Map<string, number>();
  const results: PreviewFileResult[] = [];

  for (const item of preflight) {
    const product = resolveFirmsProduct(item.entry.source);
    const info = productInfo(product);

    let text: string;
    try {
      text = await readFile(item.absolutePath, "utf8");
    } catch {
      throw new LocalPreviewError(
        "read_failed",
        "A CSV file could not be read.",
        [{ path: item.entry.file, message: "Read failed." }],
      );
    }
    const syntheticMarker = hasSyntheticMarker(text);

    let parsed;
    try {
      parsed = parseFirmsCsv(text, {
        source: item.entry.source,
        ...(manifest.bbox === null ? {} : { bbox: manifest.bbox }),
      });
    } catch (error: unknown) {
      if (!(error instanceof FirmsCsvError)) throw error;
      results.push({
        ...emptyCounts(),
        file: item.entry.file,
        source: item.entry.source,
        sensor: product.sensor,
        product: info,
        status: "rejected",
        byteSize: item.byteSize,
        syntheticMarker,
        satellites: [],
        firstAcqDate: null,
        lastAcqDate: null,
        firstAcqAt: null,
        lastAcqAt: null,
        errors: [],
        errorsTruncated: false,
        errorsByCode: {},
        parseError: { code: error.code, message: error.message },
      });
      continue;
    }

    // Deduplication is global: a row repeated in a later file is counted as a
    // duplicate of that later file, so per-file counts add up to the totals.
    let duplicates = 0;
    let uniqueRows = 0;
    const fileSatellites = new Set<string>();
    let firstAcqDate: string | null = null;
    let lastAcqDate: string | null = null;
    let firstAcqAt: string | null = null;
    let lastAcqAt: string | null = null;

    for (const detection of parsed.detections) {
      const key = detectionDedupeKey(detection);
      if (global.uniqueKeys.has(key)) {
        duplicates += 1;
        global.duplicates += 1;
        continue;
      }

      global.uniqueKeys.add(key);
      global.uniqueRows += 1;
      global.satellites.add(detection.satellite);
      global.sensors.add(detection.sensor);
      if (
        global.firstAcqDate === null ||
        detection.acqDate < global.firstAcqDate
      ) {
        global.firstAcqDate = detection.acqDate;
      }
      if (
        global.lastAcqDate === null ||
        detection.acqDate > global.lastAcqDate
      ) {
        global.lastAcqDate = detection.acqDate;
      }
      if (global.firstAcqAt === null || detection.acqAt < global.firstAcqAt) {
        global.firstAcqAt = detection.acqAt;
      }
      if (global.lastAcqAt === null || detection.acqAt > global.lastAcqAt) {
        global.lastAcqAt = detection.acqAt;
      }

      uniqueRows += 1;
      fileSatellites.add(detection.satellite);
      if (firstAcqDate === null || detection.acqDate < firstAcqDate) {
        firstAcqDate = detection.acqDate;
      }
      if (lastAcqDate === null || detection.acqDate > lastAcqDate) {
        lastAcqDate = detection.acqDate;
      }
      if (firstAcqAt === null || detection.acqAt < firstAcqAt) {
        firstAcqAt = detection.acqAt;
      }
      if (lastAcqAt === null || detection.acqAt > lastAcqAt) {
        lastAcqAt = detection.acqAt;
      }
    }

    const errorsByCode = countErrors(parsed.errors);
    for (const [code, count] of errorsByCode) {
      globalErrors.set(code, (globalErrors.get(code) ?? 0) + count);
    }

    results.push({
      rowsRead: parsed.rowsRead,
      rowsAccepted: parsed.rowsAccepted,
      rowsRejected: parsed.rowsRejected,
      duplicates,
      uniqueRows,
      file: item.entry.file,
      source: item.entry.source,
      sensor: product.sensor,
      product: info,
      status: "ok",
      byteSize: item.byteSize,
      syntheticMarker,
      satellites: [...fileSatellites].sort(),
      firstAcqDate,
      lastAcqDate,
      firstAcqAt,
      lastAcqAt,
      errors: parsed.errors.slice(0, limits.maxErrorSamples),
      errorsTruncated: parsed.errors.length > limits.maxErrorSamples,
      errorsByCode: sortedCounts(errorsByCode),
      parseError: null,
    });
  }

  const totals: PreviewTotals = {
    files: results.length,
    filesRejected: results.filter((file) => file.status === "rejected").length,
    rowsRead: results.reduce((sum, file) => sum + file.rowsRead, 0),
    rowsAccepted: results.reduce((sum, file) => sum + file.rowsAccepted, 0),
    rowsRejected: results.reduce((sum, file) => sum + file.rowsRejected, 0),
    duplicates: results.reduce((sum, file) => sum + file.duplicates, 0),
    uniqueRows: results.reduce((sum, file) => sum + file.uniqueRows, 0),
    satellites: [...global.satellites].sort(),
    sensors: [...global.sensors].sort(),
    firstAcqDate: global.firstAcqDate,
    lastAcqDate: global.lastAcqDate,
    firstAcqAt: global.firstAcqAt,
    lastAcqAt: global.lastAcqAt,
    errorsByCode: sortedCounts(globalErrors),
  };

  const warnings: string[] = [
    "Solo vista previa: no descarga datos, no escribe en la base de datos y no envía correos.",
    "Una detección satelital no es un incendio confirmado; muestra siempre fecha, hora y sensor.",
  ];
  if (manifest.synthetic) {
    warnings.push(
      "Datos sintéticos de fixtures: no son detecciones reales de NASA FIRMS.",
    );
    if (results.some((file) => !file.syntheticMarker)) {
      warnings.push(
        "El manifiesto declara datos sintéticos, pero algún CSV no lleva la marca # SYNTHETIC.",
      );
    }
  } else if (results.some((file) => file.syntheticMarker)) {
    warnings.push(
      "Algún CSV lleva la marca # SYNTHETIC pero el manifiesto no lo declara como sintético.",
    );
  }
  if (manifest.bbox === null) {
    warnings.push(
      "Sin bbox en el manifiesto: se aceptan todas las coordenadas WGS84 válidas.",
    );
  }
  if (totals.filesRejected > 0) {
    warnings.push(
      `${totals.filesRejected} archivo(s) no se pudieron parsear; revisa parseError.`,
    );
  }
  if (totals.rowsRejected > 0) {
    warnings.push(
      `${totals.rowsRejected} fila(s) rechazadas por el parser; revisa errorsByCode.`,
    );
  }
  if (totals.uniqueRows === 0) {
    warnings.push("No hay detecciones únicas; el informe no prueba ingesta.");
  }

  const directoryName = path.basename(directoryReal) || ".";

  return {
    mode: "local_csv_preview",
    source: "local_files",
    directoryName,
    manifestFile: manifestFileName,
    manifestVersion: 1,
    synthetic: manifest.synthetic,
    bbox: manifest.bbox,
    limits,
    files: results,
    totals,
    notice: manifest.synthetic
      ? "Vista previa de datos sintéticos. No son datos reales de NASA FIRMS."
      : "Vista previa de archivos locales. No es una ingesta y no confirma incendios.",
    warnings,
    writes: { database: false, network: false, email: false },
  };
}
