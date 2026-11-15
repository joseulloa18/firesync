export type SensorFamily = "MODIS" | "VIIRS";

export type ConfidenceClass = "low" | "nominal" | "high";

export interface Bbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface FirmsProduct {
  source: string;
  sensor: SensorFamily;
  isNrt: boolean;
  historicalSeries: boolean;
  allowedSatellites: readonly string[];
}

export interface FirmsDetection {
  source: string;
  sensor: SensorFamily;
  satellite: string;
  instrument: string | null;
  acqAt: string;
  acqDate: string;
  acqTime: string;
  latitude: number;
  longitude: number;
  confidenceRaw: string;
  confidence: ConfidenceClass;
  frp: number | null;
  brightness: number | null;
  brightness2: number | null;
  scan: number | null;
  track: number | null;
  daynight: "D" | "N" | null;
  version: string | null;
  type: string | null;
  isNrt: boolean;
}

export type CsvRowErrorCode =
  | "missing_required_value"
  | "invalid_date"
  | "invalid_time"
  | "invalid_latitude"
  | "invalid_longitude"
  | "invalid_confidence"
  | "invalid_number"
  | "unknown_satellite"
  | "satellite_product_mismatch"
  | "outside_bbox";

export interface CsvRowError {
  line: number;
  code: CsvRowErrorCode;
  message: string;
}

export interface CsvParseOptions {
  source: string;
  bbox?: Bbox;
}

export interface CsvParseResult {
  product: FirmsProduct;
  detections: FirmsDetection[];
  errors: CsvRowError[];
  rowsRead: number;
  rowsAccepted: number;
  rowsRejected: number;
}

export class FirmsCsvError extends Error {
  readonly code:
    "empty_csv" | "missing_header" | "unknown_source" | "unterminated_quote";

  constructor(
    code:
      "empty_csv" | "missing_header" | "unknown_source" | "unterminated_quote",
    message: string,
  ) {
    super(message);
    this.name = "FirmsCsvError";
    this.code = code;
  }
}
