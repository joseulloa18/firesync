import type {
  Bbox,
  ConfidenceClass,
  FirmsDetection,
  SensorFamily,
} from "../firms/types";

export interface GriddedDetection extends FirmsDetection {
  cellId: number;
}

export interface GridCell {
  cellId: number;
  ix: number;
  iy: number;
}

export interface SeriesSelectionOptions {
  minConfidence?: ConfidenceClass;
  historical?: boolean;
  includeNrt?: boolean;
  sensor?: SensorFamily;
  bbox?: Bbox;
}

export interface CellDayOccupancy {
  cellId: number;
  day: string;
  sensor: SensorFamily;
  nDetections: number;
  maxFrp: number | null;
}

export interface CellMonth {
  cellId: number;
  year: number;
  month: number;
  sensor: SensorFamily;
  occupiedDays: number;
  nDetections: number;
  frpSum: number | null;
}

export interface MonthlySensorTotals {
  year: number;
  month: number;
  sensor: SensorFamily;
  cellDays: number;
  nDetections: number;
  frpSum: number | null;
}

export interface MonthlyFamilyTotals {
  year: number;
  month: number;
  modisCellDays: number | null;
  viirsCellDays: number | null;
  detectionsModis: number | null;
  detectionsViirs: number | null;
}

export interface DedupeResult<T> {
  unique: T[];
  duplicates: T[];
  duplicateCount: number;
}

export type MonthStatus =
  "below_usual" | "usual" | "above_usual" | "exceptional" | "insufficient";

export interface ReferenceObservation {
  year: number;
  month: number;
  value: number | null;
  isPartial?: boolean;
}

export interface ReferenceStats {
  nYears: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;
  min: number | null;
  max: number | null;
}
