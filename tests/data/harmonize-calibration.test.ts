import { describe, expect, it } from 'vitest';
import {
  calibrationMonthsFromFamilyTotals,
  calibrateViirsToModis,
  harmonizeMonthlyIndex,
} from '../../src/lib/harmonize';
import type { CalibrationMonth } from '../../src/lib/harmonize';

const matchedMonths: CalibrationMonth[] = [
  { year: 2011, month: 12, modisCellDays: 8, viirsCellDays: 4 },
  { year: 2012, month: 1, modisCellDays: 10, viirsCellDays: 5 },
  { year: 2012, month: 2, modisCellDays: 20, viirsCellDays: 10 },
  { year: 2012, month: 3, modisCellDays: 30, viirsCellDays: 15 },
  { year: 2012, month: 4, modisCellDays: 1000, viirsCellDays: 500, isPartial: true },
  { year: 2012, month: 5, modisCellDays: 50, viirsCellDays: null },
];

describe('VIIRS to MODIS calibration', () => {
  it('uses the ratio of totals over matched, non-partial overlap months', () => {
    const result = calibrateViirsToModis(matchedMonths);

    expect(result.status).toBe('ok');
    expect(result.factor).toBe(2);
    expect(result.method).toBe('ratio_of_totals');
    expect(result.methodVersion).toBe('v1');
    expect(result.nOverlapMonths).toBe(3);
    expect(result.periodStart).toBe('2012-01-01');
    expect(result.periodEnd).toBe('2012-03-01');
    expect(result.totalModis).toBe(60);
    expect(result.totalViirs).toBe(30);
    expect(result.r2).toBe(1);
    expect(result.reason).toBeNull();
  });

  it('honors the configured overlap end', () => {
    const result = calibrateViirsToModis(matchedMonths, {
      overlapEnd: { year: 2012, month: 2 },
    });

    expect(result.factor).toBe(2);
    expect(result.nOverlapMonths).toBe(2);
    expect(result.periodEnd).toBe('2012-02-01');
  });

  it('includes partial months only when explicitly requested', () => {
    const result = calibrateViirsToModis(matchedMonths, {
      overlapEnd: { year: 2012, month: 4 },
      includePartial: true,
    });

    expect(result.nOverlapMonths).toBe(4);
    expect(result.totalViirs).toBe(530);
    expect(result.factor).toBeCloseTo(1060 / 530, 12);
  });

  it('returns no_overlap when there are no matched months', () => {
    const result = calibrateViirsToModis([
      { year: 2011, month: 12, modisCellDays: 8, viirsCellDays: 4 },
    ]);

    expect(result.status).toBe('no_overlap');
    expect(result.factor).toBeNull();
    expect(result.nOverlapMonths).toBe(0);
    expect(result.periodStart).toBeNull();
  });

  it('does not calibrate a month when one family is absent', () => {
    const result = calibrateViirsToModis([
      { year: 2012, month: 1, modisCellDays: 10, viirsCellDays: null },
      { year: 2012, month: 2, modisCellDays: 20, viirsCellDays: 10 },
    ]);

    expect(result.status).toBe('ok');
    expect(result.nOverlapMonths).toBe(1);
    expect(result.periodStart).toBe('2012-02-01');
    expect(result.periodEnd).toBe('2012-02-01');
    expect(result.factor).toBe(2);
  });

  it('rejects duplicate year/month rows in the calibration overlap', () => {
    const result = calibrateViirsToModis([
      { year: 2012, month: 1, modisCellDays: 10, viirsCellDays: 5 },
      { year: 2012, month: 1, modisCellDays: 12, viirsCellDays: 6 },
    ]);

    expect(result.status).toBe('duplicate_month');
    expect(result.factor).toBeNull();
    expect(result.nOverlapMonths).toBe(0);
  });

  it('returns zero_denominator instead of infinity when the VIIRS total is zero', () => {
    const result = calibrateViirsToModis([
      { year: 2012, month: 1, modisCellDays: 10, viirsCellDays: 0 },
    ]);

    expect(result.status).toBe('zero_denominator');
    expect(result.factor).toBeNull();
    expect(result.nOverlapMonths).toBe(1);
    expect(result.totalModis).toBe(10);
    expect(result.totalViirs).toBe(0);
    expect(result.r2).toBeNull();
  });

  it('keeps a zero factor when MODIS is zero but VIIRS is not', () => {
    const result = calibrateViirsToModis([
      { year: 2012, month: 1, modisCellDays: 0, viirsCellDays: 10 },
    ]);

    expect(result.status).toBe('ok');
    expect(result.factor).toBe(0);
    expect(result.r2).toBeNull();
  });

  it('reports a null R2 when MODIS has no variance', () => {
    const result = calibrateViirsToModis([
      { year: 2012, month: 1, modisCellDays: 10, viirsCellDays: 1 },
      { year: 2012, month: 2, modisCellDays: 10, viirsCellDays: 2 },
      { year: 2012, month: 3, modisCellDays: 10, viirsCellDays: 3 },
    ]);

    expect(result.status).toBe('ok');
    expect(result.factor).toBe(5);
    expect(result.r2).toBeNull();
  });

  it('rejects invalid overlap periods instead of guessing', () => {
    const invalidMonth = calibrateViirsToModis(matchedMonths, {
      overlapStart: { year: 2012, month: 13 },
    });
    expect(invalidMonth.status).toBe('invalid_input');
    expect(invalidMonth.factor).toBeNull();

    const inverted = calibrateViirsToModis(matchedMonths, {
      overlapStart: { year: 2013, month: 1 },
      overlapEnd: { year: 2012, month: 12 },
    });
    expect(inverted.status).toBe('invalid_input');
  });

  it('maps aligned monthly family totals into calibration input', () => {
    expect(
      calibrationMonthsFromFamilyTotals([
        {
          year: 2012,
          month: 1,
          modisCellDays: 10,
          viirsCellDays: 5,
          detectionsModis: 100,
          detectionsViirs: 50,
        },
        {
          year: 2012,
          month: 2,
          modisCellDays: 20,
          viirsCellDays: null,
          detectionsModis: 200,
          detectionsViirs: null,
        },
      ]),
    ).toEqual([
      { year: 2012, month: 1, modisCellDays: 10, viirsCellDays: 5 },
      { year: 2012, month: 2, modisCellDays: 20, viirsCellDays: null },
    ]);
  });
});

describe('harmonized monthly index', () => {
  it('uses MODIS before 2012 and calibrated VIIRS from 2012', () => {
    expect(
      harmonizeMonthlyIndex({
        year: 2011,
        month: 12,
        modisCellDays: 4,
        viirsCellDays: 10,
        factor: 2,
      }),
    ).toEqual({ index: 4, sensor: 'MODIS', factorApplied: false });

    expect(
      harmonizeMonthlyIndex({
        year: 2012,
        month: 1,
        modisCellDays: 4,
        viirsCellDays: 10,
        factor: 2,
      }),
    ).toEqual({ index: 20, sensor: 'VIIRS', factorApplied: true });
  });

  it('returns no index when the factor is unavailable', () => {
    expect(
      harmonizeMonthlyIndex({
        year: 2024,
        month: 3,
        modisCellDays: 40,
        viirsCellDays: 10,
        factor: null,
      }),
    ).toEqual({ index: null, sensor: null, factorApplied: false });
  });

  it('supports the modis_anchor strategy while honoring explicit availability', () => {
    expect(
      harmonizeMonthlyIndex({
        year: 2024,
        month: 3,
        modisCellDays: 40,
        viirsCellDays: 10,
        factor: 2,
        strategy: 'modis_anchor',
        modisAvailable: true,
      }),
    ).toEqual({ index: 40, sensor: 'MODIS', factorApplied: false });

    expect(
      harmonizeMonthlyIndex({
        year: 2024,
        month: 3,
        modisCellDays: 40,
        viirsCellDays: 10,
        factor: 2,
        strategy: 'modis_anchor',
        modisAvailable: false,
      }),
    ).toEqual({ index: 20, sensor: 'VIIRS', factorApplied: true });
  });
});
