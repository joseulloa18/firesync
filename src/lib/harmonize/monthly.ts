import { selectSeriesDetections } from './filters';
import type {
  CellMonth,
  GriddedDetection,
  MonthlyFamilyTotals,
  MonthlySensorTotals,
  SeriesSelectionOptions,
} from './types';

interface DateParts {
  year: number;
  month: number;
}

function dateParts(day: string): DateParts {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(day);
  if (match === null) {
    throw new RangeError(`Invalid acquisition date: ${day}.`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
  };
}

function addFrp(current: number | null, frp: number | null): number | null {
  if (frp === null) {
    return current;
  }
  return (current ?? 0) + frp;
}

export function computeCellMonth(
  detections: readonly GriddedDetection[],
  options: SeriesSelectionOptions = {},
): CellMonth[] {
  const selected = selectSeriesDetections(detections, options);
  const groups = new Map<
    string,
    { row: CellMonth; days: Set<string> }
  >();

  for (const detection of selected) {
    const { year, month } = dateParts(detection.acqDate);
    const key = `${detection.cellId}|${year}|${month}|${detection.sensor}`;
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, {
        row: {
          cellId: detection.cellId,
          year,
          month,
          sensor: detection.sensor,
          occupiedDays: 0,
          nDetections: 1,
          frpSum: detection.frp,
        },
        days: new Set([detection.acqDate]),
      });
      continue;
    }
    existing.row.nDetections += 1;
    existing.row.frpSum = addFrp(existing.row.frpSum, detection.frp);
    existing.days.add(detection.acqDate);
  }

  return Array.from(groups.values())
    .map(({ row, days }) => ({ ...row, occupiedDays: days.size }))
    .sort((left, right) => {
      if (left.year !== right.year) {
        return left.year - right.year;
      }
      if (left.month !== right.month) {
        return left.month - right.month;
      }
      if (left.sensor !== right.sensor) {
        return left.sensor.localeCompare(right.sensor);
      }
      return left.cellId - right.cellId;
    });
}

export function computeMonthlySensorTotals(
  detections: readonly GriddedDetection[],
  options: SeriesSelectionOptions = {},
): MonthlySensorTotals[] {
  const selected = selectSeriesDetections(detections, options);
  const groups = new Map<
    string,
    { row: MonthlySensorTotals; cellDays: Set<string> }
  >();

  for (const detection of selected) {
    const { year, month } = dateParts(detection.acqDate);
    const key = `${year}|${month}|${detection.sensor}`;
    const cellDay = `${detection.cellId}|${detection.acqDate}`;
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, {
        row: {
          year,
          month,
          sensor: detection.sensor,
          cellDays: 0,
          nDetections: 1,
          frpSum: detection.frp,
        },
        cellDays: new Set([cellDay]),
      });
      continue;
    }
    existing.row.nDetections += 1;
    existing.row.frpSum = addFrp(existing.row.frpSum, detection.frp);
    existing.cellDays.add(cellDay);
  }

  return Array.from(groups.values())
    .map(({ row, cellDays }) => ({ ...row, cellDays: cellDays.size }))
    .sort((left, right) => {
      if (left.year !== right.year) {
        return left.year - right.year;
      }
      if (left.month !== right.month) {
        return left.month - right.month;
      }
      return left.sensor.localeCompare(right.sensor);
    });
}

export function combineMonthlyFamilyTotals(
  totals: readonly MonthlySensorTotals[],
): MonthlyFamilyTotals[] {
  const groups = new Map<string, MonthlyFamilyTotals>();

  for (const total of totals) {
    const key = `${total.year}|${total.month}`;
    const existing = groups.get(key);
    const row: MonthlyFamilyTotals =
      existing ?? {
        year: total.year,
        month: total.month,
        modisCellDays: null,
        viirsCellDays: null,
        detectionsModis: null,
        detectionsViirs: null,
      };

    if (total.sensor === 'MODIS') {
      row.modisCellDays = total.cellDays;
      row.detectionsModis = total.nDetections;
    } else {
      row.viirsCellDays = total.cellDays;
      row.detectionsViirs = total.nDetections;
    }

    if (existing === undefined) {
      groups.set(key, row);
    }
  }

  return Array.from(groups.values()).sort((left, right) => {
    if (left.year !== right.year) {
      return left.year - right.year;
    }
    return left.month - right.month;
  });
}

export function computeMonthlyFamilyTotals(
  detections: readonly GriddedDetection[],
  options: SeriesSelectionOptions = {},
): MonthlyFamilyTotals[] {
  return combineMonthlyFamilyTotals(computeMonthlySensorTotals(detections, options));
}
