import { describe, expect, it } from "vitest";
import {
  buildCalibrationReport,
  calibrationReportToCsv,
  type CalibrationReportOptions,
} from "../../src/lib/reports";
import type { CalibrationMonth } from "../../src/lib/harmonize";

const synthetic: CalibrationReportOptions = { origin: "synthetic" };

function months(
  rows: Array<[number, number, number | null, number | null, boolean?]>,
): CalibrationMonth[] {
  return rows.map(([year, month, modisCellDays, viirsCellDays, isPartial]) => ({
    year,
    month,
    modisCellDays,
    viirsCellDays,
    isPartial,
  }));
}

describe("calibration report", () => {
  it("reports a known factor, period, n and perfect fit metrics", () => {
    const report = buildCalibrationReport(
      months([
        [2012, 1, 10, 5],
        [2012, 2, 20, 10],
        [2012, 3, 30, 15],
      ]),
      { ...synthetic, label: "Demo region" },
    );

    expect(report.status).toBe("ok");
    expect(report.calibrationStatus).toBe("ok");
    expect(report.statusReason).toBeNull();
    expect(report.factor).toBe(2);
    expect(report.method).toBe("ratio_of_totals");
    expect(report.methodVersion).toBe("v1");
    expect(report.nOverlapMonths).toBe(3);
    expect(report.periodStart).toBe("2012-01-01");
    expect(report.periodEnd).toBe("2012-03-01");
    expect(report.r2).toBe(1);
    expect(report.meanBias).toBe(0);
    expect(report.rmse).toBe(0);
    expect(report.meanRelativeError).toBe(0);
    expect(report.isDemo).toBe(true);
    expect(report.jump2012).toBe("not_evaluated");
    expect(report.scientificValidation).toBe("not_performed");

    expect(report.months[0]).toMatchObject({
      period: "2012-01",
      isPartial: false,
      modisCellDays: 10,
      viirsCellDays: 5,
      viirsScaledCellDays: 10,
      residual: 0,
      relativeError: 0,
      modisState: "observed",
      viirsState: "observed",
    });
  });

  it("keeps a negative R2 when the fit is bad instead of hiding it", () => {
    const report = buildCalibrationReport(
      months([
        [2012, 1, 100, 1],
        [2012, 2, 1, 100],
      ]),
      synthetic,
    );

    expect(report.status).toBe("ok");
    expect(report.factor).toBe(1);
    expect(report.nOverlapMonths).toBe(2);
    expect(report.r2).toBeCloseTo(-3, 12);
    expect(report.meanBias).toBe(0);
    expect(report.rmse).toBeCloseTo(99, 12);
    expect(report.meanRelativeError).toBeCloseTo(49.005, 12);
  });

  it("does not fill absent observations with zero", () => {
    const report = buildCalibrationReport(
      months([
        [2012, 1, null, 5],
        [2012, 2, 10, 5],
        [2012, 3, 20, 10],
      ]),
      synthetic,
    );

    expect(report.status).toBe("ok");
    expect(report.factor).toBe(2);
    expect(report.nOverlapMonths).toBe(2);
    expect(report.periodStart).toBe("2012-02-01");
    expect(report.periodEnd).toBe("2012-03-01");

    expect(report.months[0]).toMatchObject({
      period: "2012-01",
      modisCellDays: null,
      viirsCellDays: 5,
      viirsScaledCellDays: 10,
      residual: null,
      relativeError: null,
      modisState: "absent",
      viirsState: "observed",
    });
  });

  it("distinguishes explicit zeros from absent values and from partial months", () => {
    const report = buildCalibrationReport(
      months([
        [2012, 1, 0, 0],
        [2012, 2, 10, 5],
        [2012, 3, null, 15, true],
      ]),
      synthetic,
    );

    expect(report.status).toBe("ok");
    expect(report.factor).toBe(2);
    expect(report.nOverlapMonths).toBe(2);

    expect(report.months[0]).toMatchObject({
      period: "2012-01",
      isPartial: false,
      viirsScaledCellDays: 0,
      residual: 0,
      relativeError: null,
      modisState: "zero",
      viirsState: "zero",
    });
    expect(report.months[1]).toMatchObject({
      residual: 0,
      relativeError: 0,
      modisState: "observed",
      viirsState: "observed",
    });
    expect(report.months[2]).toMatchObject({
      period: "2012-03",
      isPartial: true,
      modisCellDays: null,
      viirsCellDays: 15,
      modisState: "absent",
      viirsState: "observed",
    });

    const inclusive = buildCalibrationReport(
      months([
        [2012, 1, 10, 5],
        [2012, 2, 20, 10, true],
      ]),
      { ...synthetic, includePartial: true },
    );
    expect(inclusive.nOverlapMonths).toBe(2);
    expect(inclusive.factor).toBe(2);
    expect(inclusive.months[1]?.isPartial).toBe(true);
  });

  it("returns an insufficient report when there is no overlap", () => {
    const report = buildCalibrationReport(
      months([[2011, 12, 8, 4]]),
      synthetic,
    );

    expect(report.status).toBe("insufficient");
    expect(report.calibrationStatus).toBe("no_overlap");
    expect(report.statusReason).toMatch(/No matched months/);
    expect(report.factor).toBeNull();
    expect(report.nOverlapMonths).toBe(0);
    expect(report.periodStart).toBeNull();
    expect(report.periodEnd).toBeNull();
    expect(report.r2).toBeNull();
    expect(report.meanBias).toBeNull();
    expect(report.rmse).toBeNull();
    expect(report.meanRelativeError).toBeNull();
    expect(report.months[0]?.viirsScaledCellDays).toBeNull();
  });

  it("does not invent a factor when the VIIRS denominator is zero", () => {
    const report = buildCalibrationReport(months([[2012, 1, 0, 0]]), synthetic);

    expect(report.status).toBe("insufficient");
    expect(report.calibrationStatus).toBe("zero_denominator");
    expect(report.factor).toBeNull();
    expect(report.nOverlapMonths).toBe(1);
    expect(report.r2).toBeNull();
    expect(report.meanBias).toBeNull();
    expect(report.months[0]).toMatchObject({
      modisState: "zero",
      viirsState: "zero",
      viirsScaledCellDays: null,
      residual: null,
      relativeError: null,
    });
  });

  it("reports non-finite and negative monthly values as absent, never as numbers", () => {
    const report = buildCalibrationReport(
      months([
        [2012, 1, Number.NaN, 5],
        [2012, 2, -2, 5],
        [2012, 3, 10, Number.POSITIVE_INFINITY],
        [2012, 4, 10, 5],
      ]),
      synthetic,
    );

    expect(report.status).toBe("ok");
    expect(report.factor).toBe(2);
    expect(report.nOverlapMonths).toBe(1);
    expect(report.months[0]).toMatchObject({
      modisCellDays: null,
      modisState: "absent",
      viirsCellDays: 5,
      viirsScaledCellDays: 10,
      residual: null,
      relativeError: null,
    });
    expect(report.months[1]).toMatchObject({
      modisCellDays: null,
      modisState: "absent",
    });
    expect(report.months[2]).toMatchObject({
      modisCellDays: 10,
      viirsCellDays: null,
      viirsState: "absent",
      viirsScaledCellDays: null,
      residual: null,
    });
    expect(report.months[3]).toMatchObject({
      modisCellDays: 10,
      viirsCellDays: 5,
      viirsScaledCellDays: 10,
      residual: 0,
    });

    const csv = calibrationReportToCsv(report);
    expect(csv).not.toMatch(/NaN|Infinity/);
    expect(csv).not.toContain(",-2,");
  });

  it("neutralizes spreadsheet formulas in text fields but keeps numeric signs", () => {
    const formula = buildCalibrationReport(months([[2012, 1, 10, 5]]), {
      ...synthetic,
      label: '=HYPERLINK("https://example.test")',
    });
    expect(calibrationReportToCsv(formula)).toContain(
      `"'=HYPERLINK(""https://example.test"")",synthetic,true,ok,`,
    );

    const negative = buildCalibrationReport(
      months([
        [2012, 1, 100, 1],
        [2012, 2, 1, 100],
      ]),
      synthetic,
    );
    expect(calibrationReportToCsv(negative)).toContain(
      ",2012-01,2012,1,false,100,1,1,-99,",
    );
  });

  it("marks the origin explicitly as observed or synthetic", () => {
    const observed = buildCalibrationReport(months([[2012, 1, 10, 5]]), {
      origin: "observed",
    });

    expect(observed.origin).toBe("observed");
    expect(observed.isDemo).toBe(false);
    expect(calibrationReportToCsv(observed)).toContain("# is_demo=false");
  });

  it("exports CSV with escaped fields and keeps null separate from zero", () => {
    const label = 'Región "demo", línea\nnueva';
    const report = buildCalibrationReport(
      months([
        [2012, 1, 0, 0],
        [2012, 2, null, 5],
        [2012, 3, 20, 10],
      ]),
      { ...synthetic, label },
    );
    const csv = calibrationReportToCsv(report);

    expect(csv.startsWith("# FIRESYNC calibration report\n")).toBe(true);
    expect(csv).toContain("# is_demo=true");
    expect(csv).toContain("# jump_2012=not_evaluated");
    expect(csv).toContain("# scientific_validation=not_performed");
    expect(csv).toContain('# region=Región "demo", línea nueva');
    expect(csv).toContain(
      "region,origin,is_demo,status,period,year,month,is_partial,modis_cell_days,viirs_cell_days,viirs_scaled_cell_days,residual,relative_error,modis_state,viirs_state",
    );
    expect(csv).toContain(
      '"Región ""demo"", línea\nnueva",synthetic,true,ok,2012-01,2012,1,false,0,0,0,0,,zero,zero',
    );
    expect(csv).toContain(
      '"Región ""demo"", línea\nnueva",synthetic,true,ok,2012-02,2012,2,false,,5,10,,,absent,observed',
    );
    expect(csv).toContain(
      '"Región ""demo"", línea\nnueva",synthetic,true,ok,2012-03,2012,3,false,20,10,20,0,0,observed,observed',
    );
  });
});
