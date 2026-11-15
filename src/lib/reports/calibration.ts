import {
  calibrateViirsToModis,
  type CalibrationMonth,
  type CalibrationPeriod,
  type CalibrationStatus,
} from "../harmonize/calibration";
import {
  HARMONIZATION_START_MONTH,
  HARMONIZATION_START_YEAR,
} from "../harmonize/config";

/**
 * Origin of the paired monthly values. It is required so a synthetic report can
 * never be mistaken for an observed FIRMS report.
 */
export type ReportOrigin = "observed" | "synthetic";

export interface CalibrationReportOptions {
  origin: ReportOrigin;
  overlapStart?: CalibrationPeriod;
  overlapEnd?: CalibrationPeriod;
  includePartial?: boolean;
  methodVersion?: string;
  label?: string;
}

export type CalibrationReportStatus = "ok" | "insufficient";

/**
 * `null` values are absent observations, not zeros. `0` is an observed value
 * that happened to be zero. `isPartial` is tracked separately from both.
 */
export type ReportValueState = "absent" | "zero" | "observed";

export interface CalibrationReportMonth {
  year: number;
  month: number;
  period: string;
  isPartial: boolean;
  modisCellDays: number | null;
  viirsCellDays: number | null;
  /** VIIRS cell-days multiplied by the calibration factor; null when absent. */
  viirsScaledCellDays: number | null;
  /** scaled VIIRS minus MODIS. Positive means scaled VIIRS overestimates MODIS. */
  residual: number | null;
  /** residual / MODIS, only when MODIS > 0. Null otherwise, never Infinity. */
  relativeError: number | null;
  modisState: ReportValueState;
  viirsState: ReportValueState;
}

export interface CalibrationReport {
  status: CalibrationReportStatus;
  calibrationStatus: CalibrationStatus;
  statusReason: string | null;
  origin: ReportOrigin;
  isDemo: boolean;
  label: string | null;
  factor: number | null;
  method: string;
  methodVersion: string;
  nOverlapMonths: number;
  periodStart: string | null;
  periodEnd: string | null;
  r2: number | null;
  /** Mean of (scaled VIIRS - MODIS) over the paired calibration months. */
  meanBias: number | null;
  rmse: number | null;
  /** Mean of residual / MODIS over paired months where MODIS > 0. */
  meanRelativeError: number | null;
  /**
   * This aggregate report does not test for a visible 2012 discontinuity.
   * The field is explicit so callers cannot infer an unobserved finding.
   */
  jump2012: "not_evaluated";
  /** This report is not a scientific validation of the harmonization method. */
  scientificValidation: "not_performed";
  months: CalibrationReportMonth[];
}

interface ReportMetrics {
  meanBias: number | null;
  rmse: number | null;
  meanRelativeError: number | null;
}

function monthOrdinal(month: { year: number; month: number }): number {
  return month.year * 12 + month.month - 1;
}

function isValidPeriod(period: CalibrationPeriod): boolean {
  return (
    Number.isInteger(period.year) &&
    Number.isInteger(period.month) &&
    period.month >= 1 &&
    period.month <= 12
  );
}

function isValidValue(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function periodLabel(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function reportValueState(value: number | null): ReportValueState {
  if (value === null) {
    return "absent";
  }
  return value === 0 ? "zero" : "observed";
}

function matchedCalibrationMonths(
  months: readonly CalibrationMonth[],
  options: CalibrationReportOptions,
): CalibrationMonth[] {
  const start = options.overlapStart ?? {
    year: HARMONIZATION_START_YEAR,
    month: HARMONIZATION_START_MONTH,
  };
  const end = options.overlapEnd ?? null;

  if (!isValidPeriod(start) || (end !== null && !isValidPeriod(end))) {
    return [];
  }

  const startOrdinal = monthOrdinal(start);
  const endOrdinal =
    end === null ? Number.POSITIVE_INFINITY : monthOrdinal(end);
  if (startOrdinal > endOrdinal) {
    return [];
  }

  return months
    .filter((month) => {
      if (!isValidPeriod(month)) {
        return false;
      }
      if (options.includePartial !== true && month.isPartial === true) {
        return false;
      }
      const ordinal = monthOrdinal(month);
      return ordinal >= startOrdinal && ordinal <= endOrdinal;
    })
    .filter(
      (month) =>
        isValidValue(month.modisCellDays) && isValidValue(month.viirsCellDays),
    )
    .sort((left, right) => monthOrdinal(left) - monthOrdinal(right));
}

function computeMetrics(
  matchedMonths: readonly CalibrationMonth[],
  factor: number | null,
): ReportMetrics {
  if (factor === null || matchedMonths.length === 0) {
    return { meanBias: null, rmse: null, meanRelativeError: null };
  }

  let residualSum = 0;
  let squaredResidualSum = 0;
  let relativeErrorSum = 0;
  let relativeErrorCount = 0;

  for (const month of matchedMonths) {
    const modis = month.modisCellDays as number;
    const viirs = month.viirsCellDays as number;
    const residual = factor * viirs - modis;
    residualSum += residual;
    squaredResidualSum += residual ** 2;
    if (modis > 0) {
      relativeErrorSum += residual / modis;
      relativeErrorCount += 1;
    }
  }

  return {
    meanBias: residualSum / matchedMonths.length,
    rmse: Math.sqrt(squaredResidualSum / matchedMonths.length),
    meanRelativeError:
      relativeErrorCount === 0 ? null : relativeErrorSum / relativeErrorCount,
  };
}

/**
 * Builds a calibration report from paired monthly MODIS/VIIRS cell-days.
 *
 * The existing `calibrateViirsToModis` function remains the single source of
 * truth for the factor, overlap period, R² and status. This generator adds the
 * validation metrics and the scaled monthly series without filling gaps.
 */
export function buildCalibrationReport(
  months: readonly CalibrationMonth[],
  options: CalibrationReportOptions,
): CalibrationReport {
  if (options.origin !== "observed" && options.origin !== "synthetic") {
    throw new RangeError(
      'Calibration report origin must be explicitly "observed" or "synthetic".',
    );
  }

  const calibration = calibrateViirsToModis(months, {
    overlapStart: options.overlapStart,
    overlapEnd: options.overlapEnd,
    includePartial: options.includePartial,
    methodVersion: options.methodVersion,
  });
  const factor = calibration.factor;
  const matched =
    calibration.status === "ok"
      ? matchedCalibrationMonths(months, options)
      : [];
  const metrics = computeMetrics(matched, factor);

  const reportMonths: CalibrationReportMonth[] = [...months]
    .sort((left, right) => monthOrdinal(left) - monthOrdinal(right))
    .map((month) => {
      const scaled =
        factor !== null &&
        month.viirsCellDays !== null &&
        Number.isFinite(month.viirsCellDays)
          ? factor * month.viirsCellDays
          : null;
      const residual =
        scaled !== null &&
        month.modisCellDays !== null &&
        Number.isFinite(month.modisCellDays)
          ? scaled - month.modisCellDays
          : null;
      const relativeError =
        residual !== null &&
        month.modisCellDays !== null &&
        Number.isFinite(month.modisCellDays) &&
        month.modisCellDays > 0
          ? residual / month.modisCellDays
          : null;

      return {
        year: month.year,
        month: month.month,
        period: periodLabel(month.year, month.month),
        isPartial: month.isPartial === true,
        modisCellDays: month.modisCellDays,
        viirsCellDays: month.viirsCellDays,
        viirsScaledCellDays: scaled,
        residual,
        relativeError,
        modisState: reportValueState(month.modisCellDays),
        viirsState: reportValueState(month.viirsCellDays),
      };
    });

  return {
    status: calibration.status === "ok" ? "ok" : "insufficient",
    calibrationStatus: calibration.status,
    statusReason: calibration.status === "ok" ? null : calibration.reason,
    origin: options.origin,
    isDemo: options.origin === "synthetic",
    label: options.label ?? null,
    factor,
    method: calibration.method,
    methodVersion: calibration.methodVersion,
    nOverlapMonths: calibration.nOverlapMonths,
    periodStart: calibration.periodStart,
    periodEnd: calibration.periodEnd,
    r2: calibration.r2,
    meanBias: metrics.meanBias,
    rmse: metrics.rmse,
    meanRelativeError: metrics.meanRelativeError,
    jump2012: "not_evaluated",
    scientificValidation: "not_performed",
    months: reportMonths,
  };
}

function commentValue(value: string | number | boolean | null): string {
  if (value === null) {
    return "";
  }
  return String(value).replace(/[\r\n]+/g, " ");
}

function escapeCsvField(value: string | number | boolean | null): string {
  if (value === null) {
    return "";
  }
  const text = String(value);
  if (/[",\r\n]/.test(text) || /^[ \t]|[ \t]$/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

const CSV_COLUMNS = [
  "region",
  "origin",
  "is_demo",
  "status",
  "period",
  "year",
  "month",
  "is_partial",
  "modis_cell_days",
  "viirs_cell_days",
  "viirs_scaled_cell_days",
  "residual",
  "relative_error",
  "modis_state",
  "viirs_state",
] as const;

/**
 * Serializes a report as CSV. Metadata lines start with `#`; data fields with
 * commas, quotes, CR/LF or surrounding spaces are quoted and internal quotes
 * are doubled. Null observations become empty fields, while zeros stay `0`.
 */
export function calibrationReportToCsv(report: CalibrationReport): string {
  const metadata: Array<[string, string | number | boolean | null]> = [
    ["region", report.label],
    ["origin", report.origin],
    ["is_demo", report.isDemo],
    ["status", report.status],
    ["calibration_status", report.calibrationStatus],
    ["factor", report.factor],
    ["method", report.method],
    ["method_version", report.methodVersion],
    ["n_overlap_months", report.nOverlapMonths],
    ["period_start", report.periodStart],
    ["period_end", report.periodEnd],
    ["r2", report.r2],
    ["mean_bias", report.meanBias],
    ["rmse", report.rmse],
    ["mean_relative_error", report.meanRelativeError],
    ["jump_2012", report.jump2012],
    ["scientific_validation", report.scientificValidation],
  ];

  const lines: string[] = ["# FIRESYNC calibration report"];
  for (const [key, value] of metadata) {
    lines.push(`# ${key}=${commentValue(value)}`);
  }
  lines.push(CSV_COLUMNS.join(","));

  for (const month of report.months) {
    lines.push(
      [
        report.label,
        report.origin,
        report.isDemo,
        report.status,
        month.period,
        month.year,
        month.month,
        month.isPartial,
        month.modisCellDays,
        month.viirsCellDays,
        month.viirsScaledCellDays,
        month.residual,
        month.relativeError,
        month.modisState,
        month.viirsState,
      ]
        .map(escapeCsvField)
        .join(","),
    );
  }

  return `${lines.join("\n")}\n`;
}
