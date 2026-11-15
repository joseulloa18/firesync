import {
  CALIBRATION_METHOD,
  HARMONIZATION_METHOD_VERSION,
  HARMONIZATION_START_MONTH,
  HARMONIZATION_START_YEAR,
} from "./config";
import type { MonthlyFamilyTotals } from "./types";

export interface CalibrationMonth {
  year: number;
  month: number;
  modisCellDays: number | null;
  viirsCellDays: number | null;
  isPartial?: boolean;
}

export interface CalibrationPeriod {
  year: number;
  month: number;
}

export interface CalibrationOptions {
  overlapStart?: CalibrationPeriod;
  overlapEnd?: CalibrationPeriod;
  includePartial?: boolean;
  methodVersion?: string;
}

export type CalibrationStatus =
  | "ok"
  | "no_overlap"
  | "zero_denominator"
  | "duplicate_month"
  | "invalid_input";

export interface CalibrationResult {
  factor: number | null;
  method: typeof CALIBRATION_METHOD;
  methodVersion: string;
  nOverlapMonths: number;
  r2: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  totalModis: number;
  totalViirs: number;
  status: CalibrationStatus;
  reason: string | null;
}

export type HarmonizationStrategy = "viirs_from_2012" | "modis_anchor";

export interface HarmonizedIndexInput {
  year: number;
  month: number;
  modisCellDays: number | null;
  viirsCellDays: number | null;
  factor: number | null;
  strategy?: HarmonizationStrategy;
  modisAvailable?: boolean;
}

export interface HarmonizedIndexResult {
  index: number | null;
  sensor: "MODIS" | "VIIRS" | null;
  factorApplied: boolean;
}

const DEFAULT_OVERLAP_START: CalibrationPeriod = {
  year: HARMONIZATION_START_YEAR,
  month: HARMONIZATION_START_MONTH,
};

function monthOrdinal(period: CalibrationPeriod): number {
  return period.year * 12 + period.month - 1;
}

function isValidPeriod(period: CalibrationPeriod): boolean {
  return (
    Number.isInteger(period.year) &&
    Number.isInteger(period.month) &&
    period.month >= 1 &&
    period.month <= 12
  );
}

function validValue(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function periodDate(period: CalibrationPeriod): string {
  return `${String(period.year).padStart(4, "0")}-${String(period.month).padStart(2, "0")}-01`;
}

function coefficientOfDetermination(
  pairs: ReadonlyArray<{ modis: number; viirs: number }>,
  factor: number,
): number | null {
  if (pairs.length < 2) {
    return null;
  }
  const meanModis =
    pairs.reduce((sum, pair) => sum + pair.modis, 0) / pairs.length;
  const totalSumSquares = pairs.reduce(
    (sum, pair) => sum + (pair.modis - meanModis) ** 2,
    0,
  );
  if (totalSumSquares === 0) {
    return null;
  }
  const residualSumSquares = pairs.reduce(
    (sum, pair) => sum + (pair.modis - factor * pair.viirs) ** 2,
    0,
  );
  return 1 - residualSumSquares / totalSumSquares;
}

export function calibrateViirsToModis(
  months: readonly CalibrationMonth[],
  options: CalibrationOptions = {},
): CalibrationResult {
  const start = options.overlapStart ?? DEFAULT_OVERLAP_START;
  const end = options.overlapEnd ?? null;
  const methodVersion = options.methodVersion ?? HARMONIZATION_METHOD_VERSION;

  if (!isValidPeriod(start) || (end !== null && !isValidPeriod(end))) {
    return {
      factor: null,
      method: CALIBRATION_METHOD,
      methodVersion,
      nOverlapMonths: 0,
      r2: null,
      periodStart: null,
      periodEnd: null,
      totalModis: 0,
      totalViirs: 0,
      status: "invalid_input",
      reason: "Overlap start or end is not a valid year and month.",
    };
  }

  const startOrdinal = monthOrdinal(start);
  const endOrdinal =
    end === null ? Number.POSITIVE_INFINITY : monthOrdinal(end);
  if (startOrdinal > endOrdinal) {
    return {
      factor: null,
      method: CALIBRATION_METHOD,
      methodVersion,
      nOverlapMonths: 0,
      r2: null,
      periodStart: null,
      periodEnd: null,
      totalModis: 0,
      totalViirs: 0,
      status: "invalid_input",
      reason: "Overlap start is after overlap end.",
    };
  }

  const inPeriod = months.filter((month) => {
    if (
      !Number.isInteger(month.year) ||
      !Number.isInteger(month.month) ||
      month.month < 1 ||
      month.month > 12
    ) {
      return false;
    }
    if (options.includePartial !== true && month.isPartial === true) {
      return false;
    }
    const ordinal = monthOrdinal(month);
    return ordinal >= startOrdinal && ordinal <= endOrdinal;
  });

  const seenMonths = new Set<string>();
  for (const month of inPeriod) {
    const key = `${month.year}-${String(month.month).padStart(2, "0")}`;
    if (seenMonths.has(key)) {
      return {
        factor: null,
        method: CALIBRATION_METHOD,
        methodVersion,
        nOverlapMonths: 0,
        r2: null,
        periodStart: null,
        periodEnd: null,
        totalModis: 0,
        totalViirs: 0,
        status: "duplicate_month",
        reason: `Duplicate calibration month ${key}.`,
      };
    }
    seenMonths.add(key);
  }

  const matched = inPeriod
    .filter(
      (month) =>
        validValue(month.modisCellDays) && validValue(month.viirsCellDays),
    )
    .sort((left, right) => monthOrdinal(left) - monthOrdinal(right));

  if (matched.length === 0) {
    return {
      factor: null,
      method: CALIBRATION_METHOD,
      methodVersion,
      nOverlapMonths: 0,
      r2: null,
      periodStart: null,
      periodEnd: null,
      totalModis: 0,
      totalViirs: 0,
      status: "no_overlap",
      reason: "No matched months with valid MODIS and VIIRS CDO values.",
    };
  }

  const totalModis = matched.reduce(
    (sum, month) => sum + (month.modisCellDays as number),
    0,
  );
  const totalViirs = matched.reduce(
    (sum, month) => sum + (month.viirsCellDays as number),
    0,
  );
  const first = matched[0] as CalibrationMonth;
  const last = matched[matched.length - 1] as CalibrationMonth;

  if (totalViirs === 0) {
    return {
      factor: null,
      method: CALIBRATION_METHOD,
      methodVersion,
      nOverlapMonths: matched.length,
      r2: null,
      periodStart: periodDate(first),
      periodEnd: periodDate(last),
      totalModis,
      totalViirs,
      status: "zero_denominator",
      reason: "VIIRS CDO total is zero over the matched overlap months.",
    };
  }

  const factor = totalModis / totalViirs;
  const r2 = coefficientOfDetermination(
    matched.map((month) => ({
      modis: month.modisCellDays as number,
      viirs: month.viirsCellDays as number,
    })),
    factor,
  );

  return {
    factor,
    method: CALIBRATION_METHOD,
    methodVersion,
    nOverlapMonths: matched.length,
    r2,
    periodStart: periodDate(first),
    periodEnd: periodDate(last),
    totalModis,
    totalViirs,
    status: "ok",
    reason: null,
  };
}

export function calibrationMonthsFromFamilyTotals(
  totals: readonly MonthlyFamilyTotals[],
): CalibrationMonth[] {
  return totals.map((total) => ({
    year: total.year,
    month: total.month,
    modisCellDays: total.modisCellDays,
    viirsCellDays: total.viirsCellDays,
  }));
}

export function harmonizeMonthlyIndex(
  input: HarmonizedIndexInput,
): HarmonizedIndexResult {
  const ordinal = monthOrdinal(input);
  const factorReady =
    input.factor !== null && Number.isFinite(input.factor) && input.factor >= 0;
  const strategy = input.strategy ?? "viirs_from_2012";
  const firstHarmonizedOrdinal = monthOrdinal(DEFAULT_OVERLAP_START);

  if (strategy === "modis_anchor") {
    const hasModis =
      input.modisAvailable ??
      (input.modisCellDays !== null && Number.isFinite(input.modisCellDays));
    if (hasModis) {
      return {
        index: input.modisCellDays,
        sensor: "MODIS",
        factorApplied: false,
      };
    }
    if (factorReady && input.viirsCellDays !== null) {
      return {
        index: (input.factor as number) * input.viirsCellDays,
        sensor: "VIIRS",
        factorApplied: true,
      };
    }
    return { index: null, sensor: null, factorApplied: false };
  }

  if (ordinal < firstHarmonizedOrdinal) {
    return {
      index: input.modisCellDays,
      sensor: input.modisCellDays === null ? null : "MODIS",
      factorApplied: false,
    };
  }

  if (!factorReady || input.viirsCellDays === null) {
    return { index: null, sensor: null, factorApplied: false };
  }

  return {
    index: (input.factor as number) * input.viirsCellDays,
    sensor: "VIIRS",
    factorApplied: true,
  };
}
