import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LOCAL_PREVIEW_LIMITS,
  LocalPreviewError,
  isSafeFlatCsvName,
  previewLocalArchive,
} from "../../src/lib/ingest/local-preview";
import type { LocalPreviewOptions } from "../../src/lib/ingest/local-preview";

const MODIS_HEADER =
  "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type";
const VIIRS_HEADER =
  "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type";

const SYNTHETIC = "# SYNTHETIC TEST FIXTURE - NOT REAL NASA FIRMS DATA\n";

function modisRow(
  latitude: number,
  longitude: number,
  date: string,
  time: string,
  satellite: "Terra" | "Aqua",
  confidence: number,
): string {
  return `${latitude},${longitude},330.1,1.1,1.0,${date},${time},${satellite},MODIS synthetic,${confidence},6.1NRT,290.2,12.5,D,0`;
}

function viirsRow(
  latitude: number,
  longitude: number,
  date: string,
  time: string,
  confidence: "l" | "n" | "h",
): string {
  return `${latitude},${longitude},340.1,0.6,0.5,${date},${time},S-NPP,VIIRS synthetic,${confidence},2.0NRT,295.2,6.2,D,0`;
}

function modisCsv(rows: readonly string[]): string {
  return `${SYNTHETIC}${MODIS_HEADER}\n${rows.join("\n")}\n`;
}

function viirsCsv(rows: readonly string[]): string {
  return `${SYNTHETIC}${VIIRS_HEADER}\n${rows.join("\n")}\n`;
}

interface ManifestFile {
  readonly file: string;
  readonly source: string;
}

function manifest(
  files: readonly ManifestFile[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: 1,
    synthetic: true,
    files: [...files],
    ...extra,
  };
}

let directory: string;

beforeEach(async () => {
  // The tests create and delete their own temporary directory. No user data is
  // touched.
  directory = await mkdtemp(path.join(tmpdir(), "firesync-preview-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function writeCsv(name: string, content: string): Promise<void> {
  await writeFile(path.join(directory, name), content, "utf8");
}

async function writeManifest(value: unknown | string): Promise<void> {
  const text =
    typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(path.join(directory, "manifest.json"), text, "utf8");
}

async function runPreview(
  overrides: Partial<LocalPreviewOptions> = {},
): Promise<Awaited<ReturnType<typeof previewLocalArchive>>> {
  return previewLocalArchive({ directory, ...overrides });
}

async function expectPreviewError(
  promise: Promise<unknown>,
): Promise<LocalPreviewError> {
  try {
    await promise;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(LocalPreviewError);
    return error as LocalPreviewError;
  }
  throw new Error("Expected previewLocalArchive to throw.");
}

const MODIS_ROWS = [
  // 1: Terra and Aqua share the same cell-day but are different detections.
  modisRow(18.4715, -69.9132, "2024-03-01", "530", "Terra", 85),
  modisRow(18.4715, -69.9132, "2024-03-01", "105", "Aqua", 45),
  // 3: low confidence is still accepted by the parser (the preview does not
  // apply the series confidence filter).
  modisRow(18.4801, -69.9001, "2024-03-02", "530", "Terra", 20),
  modisRow(18.4605, -69.9255, "2024-03-02", "1330", "Aqua", 55),
  // 5 and 6: exact duplicate within the same file.
  modisRow(18.4605, -69.9255, "2024-03-03", "525", "Terra", 90),
  modisRow(18.4605, -69.9255, "2024-03-03", "525", "Terra", 90),
  modisRow(18.4715, -69.9132, "2024-03-07", "110", "Aqua", 60),
] as const;

const VIIRS_ROWS = [
  viirsRow(18.4719, -69.9128, "2024-03-01", "143", "h"),
  viirsRow(18.4725, -69.9121, "2024-03-01", "1432", "h"),
  viirsRow(18.4804, -69.8997, "2024-03-02", "202", "n"),
  viirsRow(18.4605, -69.9255, "2024-03-04", "1430", "n"),
  viirsRow(18.4715, -69.9132, "2024-03-05", "150", "h"),
] as const;

describe("previewLocalArchive manual counts", () => {
  it("counts rows, duplicates, dates, products and satellites per file", async () => {
    await writeCsv("modis.csv", modisCsv(MODIS_ROWS));
    await writeCsv("viirs.csv", viirsCsv(VIIRS_ROWS));
    // Exact copy of the first VIIRS row: a cross-file duplicate.
    await writeCsv("viirs-copy.csv", viirsCsv([VIIRS_ROWS[0]]));
    await writeManifest(
      manifest([
        { file: "modis.csv", source: "MODIS_SP" },
        { file: "viirs.csv", source: "VIIRS_SNPP_SP" },
        { file: "viirs-copy.csv", source: "VIIRS_SNPP_SP" },
      ]),
    );

    const report = await runPreview();

    expect(report.mode).toBe("local_csv_preview");
    expect(report.manifestVersion).toBe(1);
    expect(report.synthetic).toBe(true);
    expect(report.bbox).toBeNull();
    expect(report.files).toHaveLength(3);

    const [modis, viirs, copy] = report.files;
    expect(modis.status).toBe("ok");
    expect(modis.file).toBe("modis.csv");
    expect(modis.source).toBe("MODIS_SP");
    expect(modis.sensor).toBe("MODIS");
    expect(modis.product).toEqual({
      source: "MODIS_SP",
      sensor: "MODIS",
      isNrt: false,
      historicalSeries: true,
      allowedSatellites: ["Terra", "Aqua"],
    });
    // 7 rows, 1 repeated row inside the file.
    expect(modis.rowsRead).toBe(7);
    expect(modis.rowsAccepted).toBe(7);
    expect(modis.rowsRejected).toBe(0);
    expect(modis.duplicates).toBe(1);
    expect(modis.uniqueRows).toBe(6);
    expect(modis.satellites).toEqual(["Aqua", "Terra"]);
    expect(modis.firstAcqDate).toBe("2024-03-01");
    expect(modis.lastAcqDate).toBe("2024-03-07");
    expect(modis.firstAcqAt).toBe("2024-03-01T01:05:00.000Z");
    expect(modis.lastAcqAt).toBe("2024-03-07T01:10:00.000Z");
    expect(modis.errors).toEqual([]);
    expect(modis.parseError).toBeNull();

    expect(viirs.status).toBe("ok");
    expect(viirs.source).toBe("VIIRS_SNPP_SP");
    expect(viirs.sensor).toBe("VIIRS");
    expect(viirs.product.allowedSatellites).toEqual(["S-NPP"]);
    expect(viirs.rowsRead).toBe(5);
    expect(viirs.rowsAccepted).toBe(5);
    expect(viirs.duplicates).toBe(0);
    expect(viirs.uniqueRows).toBe(5);
    expect(viirs.satellites).toEqual(["S-NPP"]);
    expect(viirs.firstAcqDate).toBe("2024-03-01");
    expect(viirs.lastAcqDate).toBe("2024-03-05");

    // The later file contributes no unique row.
    expect(copy.rowsRead).toBe(1);
    expect(copy.rowsAccepted).toBe(1);
    expect(copy.duplicates).toBe(1);
    expect(copy.uniqueRows).toBe(0);
    expect(copy.satellites).toEqual([]);

    expect(report.totals).toMatchObject({
      files: 3,
      filesRejected: 0,
      rowsRead: 13,
      rowsAccepted: 13,
      rowsRejected: 0,
      duplicates: 2,
      uniqueRows: 11,
      satellites: ["Aqua", "S-NPP", "Terra"],
      sensors: ["MODIS", "VIIRS"],
      firstAcqDate: "2024-03-01",
      lastAcqDate: "2024-03-07",
      firstAcqAt: "2024-03-01T01:05:00.000Z",
      lastAcqAt: "2024-03-07T01:10:00.000Z",
      errorsByCode: {},
    });

    expect(report.writes).toEqual({
      database: false,
      network: false,
      email: false,
    });
    expect(report.notice).toContain("sintéticos");
    expect(report.warnings.join(" ")).toContain("Solo vista previa");
    expect(report.warnings.join(" ")).toContain("incendio confirmado");

    // The report is deterministic and does not leak the absolute directory.
    expect(JSON.stringify(report)).not.toContain(directory);
    const second = await runPreview();
    expect(second).toEqual(report);
  });
});

describe("previewLocalArchive parser failures", () => {
  it("isolates corrupt, empty and header-only files", async () => {
    await writeCsv("missing.csv", "not,a,firms,csv\n1,2,3,4\n");
    await writeCsv("empty.csv", "");
    await writeCsv("header-only.csv", `${MODIS_HEADER}\n`);
    await writeCsv(
      "unterminated.csv",
      `${MODIS_HEADER}\n18.5,-69.5,330,1,1,2024-03-01,530,Terra,"open\n`,
    );
    await writeManifest(
      manifest([
        { file: "missing.csv", source: "MODIS_SP" },
        { file: "empty.csv", source: "MODIS_SP" },
        { file: "header-only.csv", source: "MODIS_SP" },
        { file: "unterminated.csv", source: "MODIS_SP" },
      ]),
    );

    const report = await runPreview();
    expect(report.files.map((file) => file.file)).toEqual([
      "missing.csv",
      "empty.csv",
      "header-only.csv",
      "unterminated.csv",
    ]);
    expect(report.files.map((file) => file.status)).toEqual([
      "rejected",
      "rejected",
      "ok",
      "rejected",
    ]);
    expect(report.files[0].parseError?.code).toBe("missing_header");
    expect(report.files[1].parseError?.code).toBe("empty_csv");
    expect(report.files[2].rowsRead).toBe(0);
    expect(report.files[2].rowsAccepted).toBe(0);
    expect(report.files[2].uniqueRows).toBe(0);
    expect(report.files[2].errors).toEqual([]);
    expect(report.files[3].parseError?.code).toBe("unterminated_quote");

    expect(report.totals.filesRejected).toBe(3);
    expect(report.totals.uniqueRows).toBe(0);
    expect(report.warnings.join(" ")).toContain("No hay detecciones únicas");
  });
});

describe("previewLocalArchive bbox", () => {
  it("reuses the parser bbox filter and reports rejected rows", async () => {
    await writeCsv(
      "modis.csv",
      modisCsv([
        modisRow(18.5, -69.5, "2024-03-01", "530", "Terra", 80),
        modisRow(18.5, -71.0, "2024-03-01", "535", "Terra", 80),
        modisRow(20.0, -69.5, "2024-03-01", "540", "Terra", 80),
        modisRow(17.0, -69.5, "2024-03-01", "545", "Terra", 80),
      ]),
    );
    await writeManifest(
      manifest([{ file: "modis.csv", source: "MODIS_SP" }], {
        bbox: [-70, 18, -69, 19],
      }),
    );

    const report = await runPreview();
    expect(report.bbox).toEqual({
      west: -70,
      south: 18,
      east: -69,
      north: 19,
    });
    expect(report.files[0].rowsRead).toBe(4);
    expect(report.files[0].rowsAccepted).toBe(1);
    expect(report.files[0].rowsRejected).toBe(3);
    expect(report.files[0].errorsByCode).toEqual({ outside_bbox: 3 });
    expect(report.files[0].errors).toHaveLength(3);
    expect(report.files[0].firstAcqDate).toBe("2024-03-01");
    expect(report.totals.rowsRejected).toBe(3);
  });

  it("rejects an invalid manifest bbox", async () => {
    await writeManifest(
      manifest([{ file: "modis.csv", source: "MODIS_SP" }], {
        bbox: [-67.7, 17, -72.6, 20.6],
      }),
    );
    const error = await expectPreviewError(runPreview());
    expect(error.code).toBe("invalid_manifest");
    expect(error.issues.some((issue) => issue.path === "bbox")).toBe(true);
  });
});

describe("previewLocalArchive manifest sources", () => {
  it("rejects NOAA-20/21, NRT and unknown sources", async () => {
    for (const source of [
      "VIIRS_NOAA20_SP",
      "VIIRS_NOAA21_SP",
      "MODIS_NRT",
      "VIIRS_SNPP_NRT",
      "modis_sp",
      "LANDSAT_NRT",
    ]) {
      await writeManifest(manifest([{ file: "modis.csv", source }]));
      const error = await expectPreviewError(runPreview());
      expect(error.code).toBe("invalid_manifest");
      expect(
        error.issues.some((issue) => issue.path === "files.0.source"),
      ).toBe(true);
    }
  });
});

describe("previewLocalArchive path safety", () => {
  it("rejects traversal, absolute paths and nested names", async () => {
    for (const unsafe of [
      "../outside.csv",
      "nested/inner.csv",
      "nested\\inner.csv",
      "C:\\temp\\x.csv",
      "/tmp/x.csv",
    ]) {
      await writeManifest(manifest([{ file: unsafe, source: "MODIS_SP" }]));
      const error = await expectPreviewError(runPreview());
      expect(error.code).toBe("unsafe_path");
      expect(error.issues.some((issue) => issue.path === "files.0.file")).toBe(
        true,
      );
    }
  });

  it("rejects a manifest name that leaves the directory", async () => {
    const error = await expectPreviewError(
      runPreview({ manifestFileName: "../manifest.json" }),
    );
    expect(error.code).toBe("unsafe_path");
    expect(error.issues[0]?.path).toBe("manifestFileName");
  });
});

describe("previewLocalArchive limits", () => {
  it("rejects too many manifest entries", async () => {
    await writeManifest(
      manifest([
        { file: "a.csv", source: "MODIS_SP" },
        { file: "b.csv", source: "MODIS_SP" },
        { file: "c.csv", source: "MODIS_SP" },
      ]),
    );
    const error = await expectPreviewError(
      runPreview({ limits: { maxFiles: 2 } }),
    );
    expect(error.code).toBe("too_many_files");
  });

  it("rejects a CSV larger than the per-file limit", async () => {
    await writeCsv("modis.csv", `${MODIS_HEADER}\n${"x".repeat(200)}`);
    await writeManifest(manifest([{ file: "modis.csv", source: "MODIS_SP" }]));
    const error = await expectPreviewError(
      runPreview({ limits: { maxFileBytes: 100 } }),
    );
    expect(error.code).toBe("file_too_large");
    expect(error.issues[0]?.path).toBe("files.0.file");
  });

  it("rejects a total size over the limit", async () => {
    await writeCsv("a.csv", "x".repeat(100));
    await writeCsv("b.csv", "x".repeat(100));
    await writeManifest(
      manifest([
        { file: "a.csv", source: "MODIS_SP" },
        { file: "b.csv", source: "MODIS_SP" },
      ]),
    );
    const error = await expectPreviewError(
      runPreview({ limits: { maxFileBytes: 1000, maxTotalBytes: 150 } }),
    );
    expect(error.code).toBe("total_size_exceeded");
  });

  it("rejects a manifest over the size limit", async () => {
    await writeManifest(
      manifest([{ file: "modis.csv", source: "MODIS_SP" }], {
        description: "x".repeat(300),
      }),
    );
    const error = await expectPreviewError(
      runPreview({ limits: { maxManifestBytes: 80 } }),
    );
    expect(error.code).toBe("file_too_large");
    expect(error.issues[0]?.path).toBe("manifest.json");
  });
});

describe("previewLocalArchive manifest validation", () => {
  it("rejects malformed JSON and invalid schemas", async () => {
    await writeManifest("{not json");
    let error = await expectPreviewError(runPreview());
    expect(error.code).toBe("invalid_manifest");

    const cases: unknown[] = [
      { version: 2, files: [{ file: "x.csv", source: "MODIS_SP" }] },
      { version: 1, files: [] },
      manifest([{ file: "x.csv", source: "MODIS_SP" }], { extra: true }),
    ];
    for (const value of cases) {
      await writeManifest(value);
      error = await expectPreviewError(runPreview());
      expect(error.code).toBe("invalid_manifest");
    }
  });

  it("accepts a UTF-8 BOM in the manifest", async () => {
    await writeCsv("modis.csv", modisCsv([]));
    await writeManifest(
      `\uFEFF${JSON.stringify(
        manifest([{ file: "modis.csv", source: "MODIS_SP" }]),
      )}`,
    );
    const report = await runPreview();
    expect(report.manifestVersion).toBe(1);
    expect(report.files[0].status).toBe("ok");
  });

  it("rejects duplicate file names case-insensitively", async () => {
    await writeManifest(
      manifest([
        { file: "Modis.csv", source: "MODIS_SP" },
        { file: "modis.csv", source: "MODIS_SP" },
      ]),
    );
    const error = await expectPreviewError(runPreview());
    expect(error.code).toBe("invalid_manifest");
    expect(error.issues[0]?.message).toContain("Duplicate");
  });

  it("reports missing directories and manifests", async () => {
    let error = await expectPreviewError(
      runPreview({ directory: path.join(directory, "missing") }),
    );
    expect(error.code).toBe("file_not_found");

    error = await expectPreviewError(
      runPreview({ manifestFileName: "other.json" }),
    );
    expect(error.code).toBe("file_not_found");
  });
});

describe("previewLocalArchive provenance", () => {
  it("warns when a manifest declares synthetic data without the CSV marker", async () => {
    await writeCsv("modis.csv", `${MODIS_HEADER}\n`);
    await writeManifest(manifest([{ file: "modis.csv", source: "MODIS_SP" }]));
    const report = await runPreview();
    expect(report.synthetic).toBe(true);
    expect(report.warnings.join(" ")).toContain("no lleva la marca");
  });

  it("warns when a CSV has the marker but the manifest does not", async () => {
    await writeCsv("modis.csv", modisCsv([]));
    await writeManifest(
      manifest([{ file: "modis.csv", source: "MODIS_SP" }], {
        synthetic: false,
      }),
    );
    const report = await runPreview();
    expect(report.synthetic).toBe(true);
    expect(report.notice).toContain("datos sintéticos");
    expect(report.warnings.join(" ")).toContain("# SYNTHETIC");
  });

  it("exposes only the directory name, never the absolute path", async () => {
    await writeCsv("modis.csv", modisCsv([]));
    await writeManifest(manifest([{ file: "modis.csv", source: "MODIS_SP" }]));
    const report = await runPreview();
    expect(report.directoryName).toBe(path.basename(directory));
    expect(JSON.stringify(report)).not.toContain(directory);
  });
});

describe("constants and helpers", () => {
  it("documents safe limits and flat CSV names", () => {
    expect(LOCAL_PREVIEW_LIMITS.maxFiles).toBeGreaterThan(0);
    expect(LOCAL_PREVIEW_LIMITS.maxFileBytes).toBeGreaterThan(0);
    expect(LOCAL_PREVIEW_LIMITS.maxTotalBytes).toBeGreaterThan(
      LOCAL_PREVIEW_LIMITS.maxFileBytes,
    );

    expect(isSafeFlatCsvName("synthetic-modis.csv")).toBe(true);
    expect(isSafeFlatCsvName("FIRE.CSV")).toBe(true);
    for (const unsafe of [
      "",
      ".",
      "..",
      "../x.csv",
      "a/b.csv",
      "a\\b.csv",
      "C:x.csv",
      "x.txt",
      "x.csv\0",
      `${"a".repeat(252)}.csv`,
    ]) {
      expect(isSafeFlatCsvName(unsafe)).toBe(false);
    }
  });
});
