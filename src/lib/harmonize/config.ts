import type { ConfidenceClass } from '../firms/types';

export const HARMONIZATION_METHOD_VERSION = 'v1';
export const HARMONIZATION_START_YEAR = 2012;
export const HARMONIZATION_START_MONTH = 1;
export const CELL_SIZE_DEGREES = 0.01;
export const GRID_WIDTH = 36000;
export const GRID_HEIGHT = 18000;
export const MIN_REFERENCE_YEARS = 8;
export const MIN_ACTIVITY_CDO = 5;
export const DEFAULT_MIN_CONFIDENCE: ConfidenceClass = 'nominal';
export const HISTORICAL_VIIRS_SATELLITE = 'S-NPP';
export const CALIBRATION_METHOD = 'ratio_of_totals';
