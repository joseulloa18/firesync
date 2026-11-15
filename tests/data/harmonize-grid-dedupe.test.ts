import { describe, expect, it } from 'vitest';
import {
  assignCellIds,
  cellBounds,
  cellCentroid,
  cellIdToGridCell,
  dedupeDetections,
  detectionDedupeKey,
  lonLatToCell,
} from '../../src/lib/harmonize';
import { makeDetection } from './helpers';

describe('0.01 degree grid', () => {
  it('applies the documented cell formula', () => {
    const cell = lonLatToCell(-69.9132, 18.4715);
    expect(cell).toEqual({ ix: 11008, iy: 10847, cellId: 390503008 });
  });

  it('maps the corners to valid grid indexes without overflow collisions', () => {
    expect(lonLatToCell(-180, -90)).toEqual({ ix: 0, iy: 0, cellId: 0 });
    expect(lonLatToCell(180, 90)).toEqual({
      ix: 35999,
      iy: 17999,
      cellId: 647999999,
    });
  });

  it('round-trips cell ids and returns cell bounds and centroids', () => {
    const cell = lonLatToCell(-69.9132, 18.4715);
    expect(cellIdToGridCell(cell.cellId)).toEqual(cell);
    expect(cellCentroid(cell)).toEqual({
      longitude: -69.915,
      latitude: 18.475,
    });
    expect(cellBounds(cell)).toEqual({
      west: -69.92,
      south: 18.47,
      east: -69.91,
      north: 18.48,
    });
  });

  it('rejects invalid coordinates and cell ids', () => {
    expect(() => lonLatToCell(-181, 0)).toThrow(RangeError);
    expect(() => lonLatToCell(0, 91)).toThrow(RangeError);
    expect(() => lonLatToCell(Number.NaN, 0)).toThrow(RangeError);
    expect(() => cellIdToGridCell(-1)).toThrow(RangeError);
    expect(() => cellIdToGridCell(648000000)).toThrow(RangeError);
    expect(() => cellIdToGridCell(1.5)).toThrow(RangeError);
  });

  it('assigns a cell id while preserving the detection', () => {
    const detection = makeDetection();
    const [gridded] = assignCellIds([detection]);
    expect(gridded?.cellId).toBe(lonLatToCell(detection.longitude, detection.latitude).cellId);
    expect(gridded?.acqAt).toBe(detection.acqAt);
  });
});

describe('detection deduplication', () => {
  it('deduplicates by satellite, acquisition time, latitude and longitude', () => {
    const first = makeDetection({ satellite: 'S-NPP', sensor: 'VIIRS', source: 'VIIRS_SNPP_SP' });
    const duplicate = makeDetection({
      satellite: 'NPP',
      sensor: 'VIIRS',
      source: 'VIIRS_SNPP_NRT',
      confidence: 'nominal',
    });
    const differentTime = makeDetection({
      satellite: 'S-NPP',
      sensor: 'VIIRS',
      source: 'VIIRS_SNPP_SP',
      acqAt: '2024-03-01T00:05:00.000Z',
      acqTime: '0005',
    });

    expect(detectionDedupeKey(first)).toBe(detectionDedupeKey(duplicate));
    const result = dedupeDetections([first, duplicate, differentTime]);
    expect(result.unique).toHaveLength(2);
    expect(result.duplicateCount).toBe(1);
    expect(result.duplicates[0]).toBe(duplicate);
    expect(result.unique[0]?.source).toBe('VIIRS_SNPP_SP');
  });

  it('does not merge two satellites observing at the same time and place', () => {
    const terra = makeDetection({ satellite: 'Terra' });
    const aqua = makeDetection({ satellite: 'Aqua' });
    const result = dedupeDetections([terra, aqua]);

    expect(result.unique).toHaveLength(2);
    expect(result.duplicateCount).toBe(0);
  });

  it('normalizes negative zero in the key', () => {
    const zero = makeDetection({ longitude: 0 });
    const negativeZero = makeDetection({ longitude: -0 });
    expect(detectionDedupeKey(zero)).toBe(detectionDedupeKey(negativeZero));
  });
});
