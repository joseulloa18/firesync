import { describe, expect, it } from "vitest";
import { parseBbox, parseFirmsCsv } from "../../src/lib/firms";
import {
  assignCellIds,
  computeCellDayOccupancy,
  computeCellMonth,
  computeMonthlyFamilyTotals,
  computeMonthlySensorTotals,
  countCellDays,
  dedupeDetections,
  lonLatToCell,
} from "../../src/lib/harmonize";

/*
 * Integration test for the documented data pipeline:
 *
 *   FIRMS CSV -> parse -> deduplicate -> grid -> cell-day occupancy -> cell-month
 *
 * All rows below are SYNTHETIC. They were invented for this test and are not
 * NASA FIRMS data. The manual counts are explained step by step in
 * tests/data/PIPELINE.md.
 */

const INGEST_BBOX = parseBbox("-72.6,17.0,-67.7,20.6");

// Cells from the documented 0.01 degree grid (docs/DATOS-Y-ARMONIZACION.md 5.1).
const CELL_A = 390503008; // 18.4715, -69.9132
const CELL_B = 390539009; // 18.4801, -69.9001
const CELL_C = 390467007; // 18.4605, -69.9255

const MODIS_CSV = `# SYNTHETIC TEST FIXTURE - NOT REAL NASA FIRMS DATA
# One synthetic week, 2024-03-01 to 2024-03-07 (UTC), used only by pipeline-integration.test.ts.
latitude,longitude,acq_date,acq_time,satellite,instrument,confidence,frp,daynight,type,brightness,bright_t31
18.4715,-69.9132,2024-03-01,530,Terra,MODIS synthetic,85,12.5,D,0,330.1,290.2
18.4750,-69.9150,2024-03-01,105,Aqua,MODIS synthetic,45,4.0,N,0,311.4,285.0
18.4605,-69.9255,2024-03-02,530,Terra,MODIS synthetic,20,2.1,D,0,309.7,284.5
18.4801,-69.9001,2024-03-02,1330,Aqua,MODIS synthetic agricultural burn,55,7.5,D,0,315.0,286.0
18.4605,-69.9255,2024-03-03,525,Terra,MODIS synthetic,90,18.0,D,0,340.0,295.0
18.4605,-69.9255,2024-03-03,525,Terra,MODIS synthetic,90,18.0,D,0,340.0,295.0
18.4715,-69.9132,2024-03-07,110,Aqua,MODIS synthetic,60,3.2,N,0,312.0,285.5
`;

const VIIRS_SNPP_SP_CSV = `# SYNTHETIC TEST FIXTURE - NOT REAL NASA FIRMS DATA
# S-NPP standard product for the same synthetic week.
latitude,longitude,acq_date,acq_time,satellite,instrument,confidence,frp,daynight,type,bright_ti4,bright_ti5
18.4719,-69.9128,2024-03-01,143,S-NPP,VIIRS synthetic,h,6.2,D,0,340.1,295.2
18.4801,-69.9001,2024-03-02,202,S-NPP,VIIRS synthetic agricultural burn,n,1.4,D,0,321.7,288.1
18.4605,-69.9255,2024-03-04,1430,S-NPP,VIIRS synthetic,n,2.5,D,0,325.0,289.0
18.4715,-69.9132,2024-03-05,150,S-NPP,VIIRS synthetic,h,9.1,N,0,345.0,297.0
`;

const VIIRS_SNPP_NRT_CSV = `# SYNTHETIC TEST FIXTURE - NOT REAL NASA FIRMS DATA
# S-NPP near-real-time rows that overlap one SP row and add two NRT-only cell-days.
latitude,longitude,acq_date,acq_time,satellite,instrument,confidence,frp,daynight,type,bright_ti4,bright_ti5
18.4715,-69.9132,2024-03-05,150,S-NPP,VIIRS synthetic NRT,h,9.1,N,0,345.0,297.0
18.4605,-69.9255,2024-03-06,205,S-NPP,VIIRS synthetic NRT,h,5.5,D,0,335.0,292.0
18.4801,-69.9001,2024-03-06,210,S-NPP,VIIRS synthetic NRT,h,4.4,D,0,333.0,291.0
`;

const VIIRS_NOAA20_NRT_CSV = `# SYNTHETIC TEST FIXTURE - NOT REAL NASA FIRMS DATA
# NOAA-20 NRT at the exact time and place of one SP row. It must survive dedupe
# because the dedupe key includes the satellite.
latitude,longitude,acq_date,acq_time,satellite,instrument,confidence,frp,daynight,type,bright_ti4,bright_ti5
18.4715,-69.9132,2024-03-05,150,NOAA-20,VIIRS synthetic NRT,h,7.7,N,0,346.0,298.0
`;

function parseWeek() {
  return {
    modis: parseFirmsCsv(MODIS_CSV, {
      source: "MODIS_SP",
      bbox: INGEST_BBOX,
    }),
    snppSp: parseFirmsCsv(VIIRS_SNPP_SP_CSV, {
      source: "VIIRS_SNPP_SP",
      bbox: INGEST_BBOX,
    }),
    snppNrt: parseFirmsCsv(VIIRS_SNPP_NRT_CSV, {
      source: "VIIRS_SNPP_NRT",
      bbox: INGEST_BBOX,
    }),
    noaa20Nrt: parseFirmsCsv(VIIRS_NOAA20_NRT_CSV, {
      source: "VIIRS_NOAA20_NRT",
      bbox: INGEST_BBOX,
    }),
  };
}

function buildPipeline() {
  const parsed = parseWeek();
  const combined = [
    ...parsed.modis.detections,
    ...parsed.snppSp.detections,
    ...parsed.snppNrt.detections,
    ...parsed.noaa20Nrt.detections,
  ];
  const deduped = dedupeDetections(combined);
  const gridded = assignCellIds(deduped.unique);
  return { ...parsed, combined, deduped, gridded };
}

function santoDomingoDate(isoInstant: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(isoInstant));
  const value = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

describe("CSV to occupancy to month pipeline", () => {
  it("parses the synthetic week without rejecting rows and keeps acquisition times in UTC", () => {
    const parsed = parseWeek();

    expect(parsed.modis.rowsRead).toBe(7);
    expect(parsed.modis.rowsAccepted).toBe(7);
    expect(parsed.modis.rowsRejected).toBe(0);
    expect(parsed.modis.errors).toEqual([]);

    expect(parsed.snppSp.rowsRead).toBe(4);
    expect(parsed.snppSp.rowsAccepted).toBe(4);
    expect(parsed.snppSp.rowsRejected).toBe(0);

    expect(parsed.snppNrt.rowsRead).toBe(3);
    expect(parsed.snppNrt.rowsAccepted).toBe(3);
    expect(parsed.snppNrt.rowsRejected).toBe(0);

    expect(parsed.noaa20Nrt.rowsRead).toBe(1);
    expect(parsed.noaa20Nrt.rowsAccepted).toBe(1);
    expect(parsed.noaa20Nrt.rowsRejected).toBe(0);

    // HHMM is interpreted as UTC, including values without a leading zero.
    expect(parsed.modis.detections[0]?.acqAt).toBe("2024-03-01T05:30:00.000Z");
    expect(parsed.modis.detections[1]?.acqAt).toBe("2024-03-01T01:05:00.000Z");
    expect(parsed.modis.detections[6]?.acqAt).toBe("2024-03-07T01:10:00.000Z");
    expect(parsed.snppSp.detections[0]?.acqAt).toBe("2024-03-01T01:43:00.000Z");
    expect(parsed.snppNrt.detections[1]?.acqAt).toBe(
      "2024-03-06T02:05:00.000Z",
    );
    expect(parsed.noaa20Nrt.detections[0]?.acqAt).toBe(
      "2024-03-05T01:50:00.000Z",
    );

    expect(lonLatToCell(-69.9132, 18.4715).cellId).toBe(CELL_A);
    expect(lonLatToCell(-69.9001, 18.4801).cellId).toBe(CELL_B);
    expect(lonLatToCell(-69.9255, 18.4605).cellId).toBe(CELL_C);
  });

  it("deduplicates exact repeats and SP/NRT overlaps without merging other satellites or cells", () => {
    const { combined, deduped } = buildPipeline();

    expect(combined).toHaveLength(15);
    expect(deduped.duplicateCount).toBe(2);
    expect(deduped.unique).toHaveLength(13);
    expect(deduped.duplicates.map((detection) => detection.source)).toEqual([
      "MODIS_SP",
      "VIIRS_SNPP_NRT",
    ]);

    // The exact Terra repeat is removed, leaving one cell C day 3 detection.
    const terraCellCDay3 = deduped.unique.filter(
      (detection) =>
        detection.satellite === "Terra" &&
        detection.acqAt === "2024-03-03T05:25:00.000Z",
    );
    expect(terraCellCDay3).toHaveLength(1);

    // SP is parsed before NRT, so the shared S-NPP instant keeps the SP row.
    const snppCellADay5 = deduped.unique.filter(
      (detection) =>
        detection.satellite === "S-NPP" &&
        detection.acqAt === "2024-03-05T01:50:00.000Z",
    );
    expect(snppCellADay5).toHaveLength(1);
    expect(snppCellADay5[0]?.source).toBe("VIIRS_SNPP_SP");
    expect(snppCellADay5[0]?.isNrt).toBe(false);

    // Same instant and place, different satellite: NOAA-20 is not a duplicate.
    const noaa20 = deduped.unique.filter(
      (detection) => detection.satellite === "NOAA-20",
    );
    expect(noaa20).toHaveLength(1);
    expect(noaa20[0]?.isNrt).toBe(true);

    // NRT-only cell-days survive deduplication.
    const snppNrtOnly = deduped.unique.filter(
      (detection) => detection.satellite === "S-NPP" && detection.isNrt,
    );
    expect(
      snppNrtOnly.map(
        (detection) =>
          `${detection.acqDate}|${detection.latitude}|${detection.longitude}`,
      ),
    ).toEqual(["2024-03-06|18.4605|-69.9255", "2024-03-06|18.4801|-69.9001"]);
  });

  it("counts Terra/Aqua and SP/NRT overlaps once per cell-day and keeps agricultural burns", () => {
    const { gridded } = buildPipeline();
    const occupancy = computeCellDayOccupancy(gridded);

    expect(occupancy).toHaveLength(10);
    expect(countCellDays(occupancy, "MODIS")).toBe(4);
    expect(countCellDays(occupancy, "VIIRS")).toBe(6);

    // Terra and Aqua in the same cell-day produce one MODIS cell-day with two detections.
    const modisCellADay1 = occupancy.find(
      (row) =>
        row.sensor === "MODIS" &&
        row.cellId === CELL_A &&
        row.day === "2024-03-01",
    );
    expect(modisCellADay1).toMatchObject({ nDetections: 2, maxFrp: 12.5 });

    // Low confidence is stored by the parser but excluded from the series.
    const lowConfidenceOnly = occupancy.find(
      (row) =>
        row.sensor === "MODIS" &&
        row.cellId === CELL_C &&
        row.day === "2024-03-02",
    );
    expect(lowConfidenceOnly).toBeUndefined();

    // Agricultural burns are not filtered by land use or by the FIRMS "type" field.
    const agriculturalBurnDetections = gridded.filter((detection) =>
      detection.instrument?.includes("agricultural burn"),
    );
    expect(agriculturalBurnDetections).toHaveLength(2);
    expect(
      agriculturalBurnDetections.map((detection) => detection.sensor).sort(),
    ).toEqual(["MODIS", "VIIRS"]);

    const modisAgriculturalBurnDay = occupancy.find(
      (row) =>
        row.sensor === "MODIS" &&
        row.cellId === CELL_B &&
        row.day === "2024-03-02",
    );
    const viirsAgriculturalBurnDay = occupancy.find(
      (row) =>
        row.sensor === "VIIRS" &&
        row.cellId === CELL_B &&
        row.day === "2024-03-02",
    );
    expect(modisAgriculturalBurnDay).toMatchObject({ nDetections: 1 });
    expect(viirsAgriculturalBurnDay).toMatchObject({ nDetections: 1 });

    // The SP row wins over its NRT twin: one detected cell-day, one detection.
    const viirsCellADay5 = occupancy.find(
      (row) =>
        row.sensor === "VIIRS" &&
        row.cellId === CELL_A &&
        row.day === "2024-03-05",
    );
    expect(viirsCellADay5).toMatchObject({ nDetections: 1, maxFrp: 9.1 });

    // NRT-only cell-days are not erased when SP rows are present.
    expect(
      occupancy.find(
        (row) =>
          row.sensor === "VIIRS" &&
          row.cellId === CELL_B &&
          row.day === "2024-03-06",
      ),
    ).toMatchObject({ nDetections: 1, maxFrp: 4.4 });
    expect(
      occupancy.find(
        (row) =>
          row.sensor === "VIIRS" &&
          row.cellId === CELL_C &&
          row.day === "2024-03-06",
      ),
    ).toMatchObject({ nDetections: 1, maxFrp: 5.5 });

    // NOAA-20 is excluded by the historical S-NPP restriction, not by dedupe.
    // Disabling that restriction proves the NOAA-20 NRT row is still present.
    const allViirs = computeCellDayOccupancy(gridded, { historical: false });
    expect(allViirs).toHaveLength(10);
    const viirsCellADay5All = allViirs.find(
      (row) =>
        row.sensor === "VIIRS" &&
        row.cellId === CELL_A &&
        row.day === "2024-03-05",
    );
    expect(viirsCellADay5All).toMatchObject({ nDetections: 2, maxFrp: 9.1 });
  });

  it("aggregates the synthetic week into cell-month and monthly family totals", () => {
    const { gridded } = buildPipeline();
    const cellMonths = computeCellMonth(gridded);

    expect(cellMonths).toHaveLength(6);

    const modisCellA = cellMonths.find(
      (row) => row.sensor === "MODIS" && row.cellId === CELL_A,
    );
    expect(modisCellA).toMatchObject({
      year: 2024,
      month: 3,
      occupiedDays: 2,
      nDetections: 3,
    });
    expect(modisCellA?.frpSum).toBeCloseTo(19.7, 10);

    const modisCellB = cellMonths.find(
      (row) => row.sensor === "MODIS" && row.cellId === CELL_B,
    );
    expect(modisCellB).toMatchObject({
      year: 2024,
      month: 3,
      occupiedDays: 1,
      nDetections: 1,
    });
    expect(modisCellB?.frpSum).toBeCloseTo(7.5, 10);

    const modisCellC = cellMonths.find(
      (row) => row.sensor === "MODIS" && row.cellId === CELL_C,
    );
    expect(modisCellC).toMatchObject({
      year: 2024,
      month: 3,
      occupiedDays: 1,
      nDetections: 1,
    });
    expect(modisCellC?.frpSum).toBeCloseTo(18.0, 10);

    const viirsCellA = cellMonths.find(
      (row) => row.sensor === "VIIRS" && row.cellId === CELL_A,
    );
    expect(viirsCellA).toMatchObject({
      year: 2024,
      month: 3,
      occupiedDays: 2,
      nDetections: 2,
    });
    expect(viirsCellA?.frpSum).toBeCloseTo(15.3, 10);

    const viirsCellB = cellMonths.find(
      (row) => row.sensor === "VIIRS" && row.cellId === CELL_B,
    );
    expect(viirsCellB).toMatchObject({
      year: 2024,
      month: 3,
      occupiedDays: 2,
      nDetections: 2,
    });
    expect(viirsCellB?.frpSum).toBeCloseTo(5.8, 10);

    const viirsCellC = cellMonths.find(
      (row) => row.sensor === "VIIRS" && row.cellId === CELL_C,
    );
    expect(viirsCellC).toMatchObject({
      year: 2024,
      month: 3,
      occupiedDays: 2,
      nDetections: 2,
    });
    expect(viirsCellC?.frpSum).toBeCloseTo(8.0, 10);

    const sensorTotals = computeMonthlySensorTotals(gridded);
    expect(sensorTotals).toHaveLength(2);
    expect(sensorTotals[0]).toMatchObject({
      year: 2024,
      month: 3,
      sensor: "MODIS",
      cellDays: 4,
      nDetections: 5,
    });
    expect(sensorTotals[0]?.frpSum).toBeCloseTo(45.2, 10);
    expect(sensorTotals[1]).toMatchObject({
      year: 2024,
      month: 3,
      sensor: "VIIRS",
      cellDays: 6,
      nDetections: 6,
    });
    expect(sensorTotals[1]?.frpSum).toBeCloseTo(29.1, 10);

    expect(computeMonthlyFamilyTotals(gridded)).toEqual([
      {
        year: 2024,
        month: 3,
        modisCellDays: 4,
        viirsCellDays: 6,
        detectionsModis: 5,
        detectionsViirs: 6,
      },
    ]);
  });

  it("keeps acquisition days in UTC even when the local date in Santo Domingo differs", () => {
    const csv = [
      "latitude,longitude,acq_date,acq_time,satellite,confidence",
      "18.4715,-69.9132,2024-03-01,2359,Terra,85",
      "18.4715,-69.9132,2024-03-02,5,Terra,85",
    ].join("\n");

    const parsed = parseFirmsCsv(csv, { source: "MODIS_SP" });
    expect(parsed.detections.map((detection) => detection.acqAt)).toEqual([
      "2024-03-01T23:59:00.000Z",
      "2024-03-02T00:05:00.000Z",
    ]);

    // Both UTC instants are still 2024-03-01 in America/Santo_Domingo (UTC-4).
    expect(santoDomingoDate("2024-03-01T23:59:00.000Z")).toBe("2024-03-01");
    expect(santoDomingoDate("2024-03-02T00:05:00.000Z")).toBe("2024-03-01");

    // The pipeline groups by the UTC acquisition date, not by the local date.
    const occupancy = computeCellDayOccupancy(assignCellIds(parsed.detections));
    expect(occupancy.map((row) => row.day)).toEqual([
      "2024-03-01",
      "2024-03-02",
    ]);
  });
});
