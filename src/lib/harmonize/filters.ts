import { meetsMinConfidence } from '../firms/confidence';
import { isWithinBbox } from '../firms/bbox';
import { isViirsSnpp } from '../firms/products';
import type { FirmsDetection } from '../firms/types';
import { DEFAULT_MIN_CONFIDENCE } from './config';
import type { SeriesSelectionOptions } from './types';

export function shouldIncludeInSeries(
  detection: FirmsDetection,
  options: SeriesSelectionOptions = {},
): boolean {
  const minimum = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  if (!meetsMinConfidence(detection.confidence, minimum)) {
    return false;
  }
  if (options.sensor !== undefined && detection.sensor !== options.sensor) {
    return false;
  }
  if (options.includeNrt === false && detection.isNrt) {
    return false;
  }
  if (options.historical !== false && detection.sensor === 'VIIRS' && !isViirsSnpp(detection.satellite)) {
    return false;
  }
  if (options.bbox !== undefined && !isWithinBbox(detection, options.bbox)) {
    return false;
  }
  return true;
}

export function selectSeriesDetections<T extends FirmsDetection>(
  detections: readonly T[],
  options: SeriesSelectionOptions = {},
): T[] {
  return detections.filter((detection) => shouldIncludeInSeries(detection, options));
}
