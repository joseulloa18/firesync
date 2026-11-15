import { describe, expect, it } from "vitest";
import {
  FirmsAvailabilityError,
  parseFirmsAvailabilityCsv,
} from "../../src/lib/firms-client/availability";
import { FIRMS_SOURCES, type FirmsSource } from "../../src/lib/firms-client/types";

// Synthetic date ranges for contract tests; not observed NASA availability.
const HEADER = "data_id,min_date,max_date";
const SYNTHETIC_ROW = "MODIS_SP,2024-02-29,2024-03-01";
const SYNTHETIC_CSV = `${HEADER}\n${SYNTHETIC_ROW}\n`;

describe("FIRMS availability CSV (synthetic fixtures)", () => {
  it("returns the requested product and validated inclusive date bounds", () => {
    expect(parseFirmsAvailabilityCsv(SYNTHETIC_CSV, "MODIS_SP")).toEqual({
      source: "MODIS_SP",
      minDate: "2024-02-29",
      maxDate: "2024-03-01",
    });
  });

  it("accepts BOM, CRLF, quoted fields and reordered columns", () => {
    const csv =
      '\uFEFF"max_date", "data_id", "min_date"\r\n' +
      '"2024-03-01", "MODIS_SP", "2024-02-29"\r\n\r\n';
    expect(parseFirmsAvailabilityCsv(csv, "MODIS_SP")).toEqual({
      source: "MODIS_SP",
      minDate: "2024-02-29",
      maxDate: "2024-03-01",
    });
  });

  it.each(FIRMS_SOURCES)("accepts allowlisted product %s", (source) => {
    const csv = `${HEADER}\n${source},2024-01-01,2024-01-01`;
    expect(parseFirmsAvailabilityCsv(csv, source)).toEqual({
      source,
      minDate: "2024-01-01",
      maxDate: "2024-01-01",
    });
  });

  it.each([
    ["empty body", ""],
    ["HTML instead of CSV", "<html>upstream error</html>"],
    ["missing data", `${HEADER}\n`],
    ["missing header", `${SYNTHETIC_ROW}\n`],
    ["missing column", "data_id,min_date\nMODIS_SP,2024-02-29"],
    ["extra column", `${HEADER},note\n${SYNTHETIC_ROW},unknown`],
    ["duplicate header", "data_id,min_date,min_date\nMODIS_SP,2024-01-01,2024-02-01"],
    ["extra data field", `${HEADER}\n${SYNTHETIC_ROW},unknown`],
    ["missing data field", `${HEADER}\nMODIS_SP,2024-02-29`],
    ["duplicate record", `${SYNTHETIC_CSV}${SYNTHETIC_ROW}\n`],
    ["additional product", `${SYNTHETIC_CSV}VIIRS_SNPP_SP,2024-01-01,2024-02-01`],
    ["source mismatch", `${HEADER}\nVIIRS_SNPP_SP,2024-01-01,2024-02-01`],
    ["unknown source", `${HEADER}\nLANDSAT_NRT,2024-01-01,2024-02-01`],
    ["invalid leap day", `${HEADER}\nMODIS_SP,2023-02-29,2024-03-01`],
    ["invalid max date", `${HEADER}\nMODIS_SP,2024-02-29,2024-04-31`],
    ["non-ISO date", `${HEADER}\nMODIS_SP,2024-2-29,2024-03-01`],
    ["timestamp instead of date", `${HEADER}\nMODIS_SP,2024-02-29T00:00:00Z,2024-03-01`],
    ["inverted range", `${HEADER}\nMODIS_SP,2024-03-01,2024-02-29`],
    ["empty date", `${HEADER}\nMODIS_SP,,2024-03-01`],
    ["unclosed quote", `${HEADER}\n"MODIS_SP,2024-02-29,2024-03-01`],
    ["quote in unquoted field", `${HEADER}\nMO"DIS_SP,2024-02-29,2024-03-01`],
    ["characters after quoted field", `${HEADER}\n"MODIS_SP"oops,2024-02-29,2024-03-01`],
    ["escaped quote in product", `${HEADER}\n"MO""DIS_SP",2024-02-29,2024-03-01`],
    ["blank quoted record", `${SYNTHETIC_CSV}""\n`],
    ["oversized body", `${SYNTHETIC_CSV}${" ".repeat(16_384)}`],
  ])("rejects %s with a safe typed error", (_name, csv) => {
    expect(() => parseFirmsAvailabilityCsv(csv, "MODIS_SP")).toThrow(
      FirmsAvailabilityError,
    );
  });

  it("rejects a runtime source outside the allowlist", () => {
    expect(() =>
      parseFirmsAvailabilityCsv(SYNTHETIC_CSV, "ALL" as FirmsSource),
    ).toThrow(FirmsAvailabilityError);
  });

  it("never retains upstream text, a URL, key or cause on errors", () => {
    const secret = "SYNTHETIC_SECRET_NOT_A_REAL_KEY";
    const upstream = `https://example.invalid/${secret}`;
    try {
      parseFirmsAvailabilityCsv(`<html>${upstream}</html>`, "MODIS_SP");
      throw new Error("Expected parsing to fail.");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(FirmsAvailabilityError);
      const safeError = error as FirmsAvailabilityError;
      expect(safeError.code).toBe("invalid_availability");
      expect(safeError.cause).toBeUndefined();
      const rendered = `${safeError.message}\n${safeError.stack ?? ""}`;
      expect(rendered).not.toContain(secret);
      expect(rendered).not.toContain(upstream);
      expect(rendered).not.toContain("<html>");
    }
  });
});
