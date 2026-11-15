import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FirmsCsvError,
  normalizeModisConfidence,
  normalizeViirsConfidence,
  parseFirmsCsv,
  parseBbox,
} from "../../src/lib/firms";

const modisCsv = readFileSync(
  new URL("./fixtures/synthetic-modis.csv", import.meta.url),
  "utf8",
);
const viirsCsv = readFileSync(
  new URL("./fixtures/synthetic-viirs-snpp.csv", import.meta.url),
  "utf8",
);

const minimalHeader =
  "latitude,longitude,acq_date,acq_time,satellite,confidence\n";

describe("FIRMS CSV parser", () => {
  it("parses the synthetic MODIS fixture, including quoted fields and HHMM without leading zeros", () => {
    const result = parseFirmsCsv(modisCsv, { source: "MODIS_SP" });

    expect(result.rowsRead).toBe(3);
    expect(result.rowsAccepted).toBe(3);
    expect(result.rowsRejected).toBe(0);
    expect(result.product.sensor).toBe("MODIS");

    const first = result.detections[0];
    expect(first).toMatchObject({
      source: "MODIS_SP",
      sensor: "MODIS",
      satellite: "Terra",
      instrument: 'MODIS, synthetic "instrument"',
      acqDate: "2024-03-01",
      acqTime: "0530",
      acqAt: "2024-03-01T05:30:00.000Z",
      confidence: "high",
      confidenceRaw: "85",
      frp: 12.5,
      brightness: 330.1,
      brightness2: 290.2,
      scan: 1.1,
      track: 1,
      daynight: "D",
      type: "0",
      isNrt: false,
    });

    expect(result.detections[1]?.acqTime).toBe("0005");
    expect(result.detections[1]?.acqAt).toBe("2024-03-01T00:05:00.000Z");
    expect(result.detections[1]?.confidence).toBe("nominal");
    expect(result.detections[2]?.confidence).toBe("low");
    expect(result.detections[2]?.frp).toBe(2.1);
  });

  it("parses the synthetic VIIRS fixture with categorical confidence and brightness aliases", () => {
    const result = parseFirmsCsv(viirsCsv, { source: "VIIRS_SNPP_SP" });

    expect(result.rowsAccepted).toBe(3);
    expect(result.detections[0]).toMatchObject({
      sensor: "VIIRS",
      satellite: "S-NPP",
      acqTime: "0143",
      acqAt: "2024-03-01T01:43:00.000Z",
      confidence: "high",
      brightness: 340.1,
      brightness2: 295.2,
      scan: 0.6,
      track: 0.5,
      isNrt: false,
    });
    expect(result.detections[2]?.confidence).toBe("nominal");
    expect(result.detections[2]?.acqTime).toBe("0202");
  });

  it("accepts a UTF-8 BOM, comments before the header and CRLF line endings", () => {
    const csv = `\uFEFF# SYNTHETIC\n${minimalHeader.replace("\n", "\r\n")}18.1,-69.1,2024-03-01,5,Terra,90\r\n`;
    const result = parseFirmsCsv(csv, { source: "MODIS_SP" });

    expect(result.rowsAccepted).toBe(1);
    expect(result.detections[0]?.acqTime).toBe("0005");
  });

  it("keeps a quoted comma and escaped quotes inside a field", () => {
    const csv = [
      "latitude,longitude,acq_date,acq_time,satellite,instrument,confidence",
      '18.1,-69.1,2024-03-01,5,Terra,"MODIS, ""quoted"" sensor",80',
    ].join("\n");
    const result = parseFirmsCsv(csv, { source: "MODIS_SP" });

    expect(result.rowsAccepted).toBe(1);
    expect(result.detections[0]?.instrument).toBe('MODIS, "quoted" sensor');
  });

  it("parses HHMM values with zero, one, three and four digits", () => {
    const rows = [
      ["18.1", "-69.1", "2024-03-01", "0", "Terra", "80"],
      ["18.2", "-69.2", "2024-03-01", "5", "Terra", "80"],
      ["18.3", "-69.3", "2024-03-01", "530", "Terra", "80"],
      ["18.4", "-69.4", "2024-03-01", "2359", "Terra", "80"],
    ].map((row) => row.join(","));
    const result = parseFirmsCsv(`${minimalHeader}${rows.join("\n")}`, {
      source: "MODIS_SP",
    });

    expect(result.detections.map((detection) => detection.acqTime)).toEqual([
      "0000",
      "0005",
      "0530",
      "2359",
    ]);
    expect(result.detections[3]?.acqAt).toBe("2024-03-01T23:59:00.000Z");
  });

  it("reports row errors and continues with valid rows", () => {
    const rows = [
      "18.1,-69.1,2024-02-30,5,Terra,80",
      "18.2,-69.2,2024-03-01,2460,Terra,80",
      "91,-69.3,2024-03-01,5,Terra,80",
      "18.4,-181,2024-03-01,5,Terra,80",
      "18.5,-69.5,2024-03-01,5,Terra,101",
      "18.6,-69.6,2024-03-01,5,Sentinel,80",
      "18.7,-69.7,2024-03-01,5,S-NPP,80",
      "18.8,-69.8,2024-03-01,5,Terra,",
      "18.9,-69.9,2024-03-01,5,Terra,80",
    ].join("\n");
    const result = parseFirmsCsv(`${minimalHeader}${rows}`, {
      source: "MODIS_SP",
    });

    expect(result.rowsRead).toBe(9);
    expect(result.rowsAccepted).toBe(1);
    expect(result.rowsRejected).toBe(8);
    expect(result.errors.map((error) => error.code)).toEqual([
      "invalid_date",
      "invalid_time",
      "invalid_latitude",
      "invalid_longitude",
      "invalid_confidence",
      "unknown_satellite",
      "satellite_product_mismatch",
      "missing_required_value",
    ]);
  });

  it("rejects invalid scan, track or FRP values instead of silently dropping them", () => {
    const csv = [
      "latitude,longitude,acq_date,acq_time,satellite,confidence,scan,track,frp",
      "18.1,-69.1,2024-03-01,5,Terra,80,nope,1,2",
      "18.2,-69.2,2024-03-01,5,Terra,80,1,nope,2",
      "18.3,-69.3,2024-03-01,5,Terra,80,1,1,nope",
    ].join("\n");
    const result = parseFirmsCsv(csv, { source: "MODIS_SP" });

    expect(result.rowsAccepted).toBe(0);
    expect(result.errors.map((error) => error.code)).toEqual([
      "invalid_number",
      "invalid_number",
      "invalid_number",
    ]);
  });

  it("requires an explicit known product and does not infer the sensor family", () => {
    expect(() => parseFirmsCsv(modisCsv, { source: "UNKNOWN" })).toThrow(
      FirmsCsvError,
    );
    const mismatched = parseFirmsCsv(viirsCsv, { source: "MODIS_SP" });
    expect(mismatched.rowsAccepted).toBe(0);
    expect(
      mismatched.errors.every(
        (error) => error.code === "satellite_product_mismatch",
      ),
    ).toBe(true);
  });

  it("throws clear fatal errors for empty, malformed or unterminated CSV input", () => {
    expect(() => parseFirmsCsv("", { source: "MODIS_SP" })).toThrowError(
      expect.objectContaining({ code: "empty_csv" }),
    );
    expect(() =>
      parseFirmsCsv("latitude,longitude\n1,2\n", { source: "MODIS_SP" }),
    ).toThrowError(expect.objectContaining({ code: "missing_header" }));
    expect(() =>
      parseFirmsCsv(`${minimalHeader}18.1,-69.1,2024-03-01,5,"Terra,80\n`, {
        source: "MODIS_SP",
      }),
    ).toThrowError(expect.objectContaining({ code: "unterminated_quote" }));
  });

  it("applies an ingestion bbox without discarding the rest of the file", () => {
    const result = parseFirmsCsv(modisCsv, {
      source: "MODIS_SP",
      bbox: parseBbox("-70,18.45,-69.5,18.475"),
    });

    expect(result.rowsAccepted).toBe(2);
    expect(result.errors.map((error) => error.code)).toEqual(["outside_bbox"]);
  });

  it("normalizes MODIS and VIIRS confidence independently", () => {
    expect(normalizeModisConfidence("0")).toBe("low");
    expect(normalizeModisConfidence("29")).toBe("low");
    expect(normalizeModisConfidence("30")).toBe("nominal");
    expect(normalizeModisConfidence("79")).toBe("nominal");
    expect(normalizeModisConfidence("80")).toBe("high");
    expect(normalizeModisConfidence("100")).toBe("high");
    expect(normalizeModisConfidence("101")).toBeNull();
    expect(normalizeModisConfidence("")).toBeNull();
    expect(normalizeModisConfidence("   ")).toBeNull();
    expect(normalizeModisConfidence("n/a")).toBeNull();

    expect(normalizeViirsConfidence("l")).toBe("low");
    expect(normalizeViirsConfidence("N")).toBe("nominal");
    expect(normalizeViirsConfidence("high")).toBe("high");
    expect(normalizeViirsConfidence("85")).toBeNull();
  });
});
