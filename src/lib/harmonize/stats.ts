import { MIN_ACTIVITY_CDO, MIN_REFERENCE_YEARS } from './config';
import type {
  MonthStatus,
  ReferenceObservation,
  ReferenceStats,
} from './types';

export interface LeaveOneOutTarget {
  year: number;
  month: number;
}

export interface LeaveOneOutOptions {
  includePartial?: boolean;
}

export interface MonthClassification {
  status: MonthStatus;
  reference: ReferenceStats;
  percentileRank: number | null;
  ratioToMedian: number | null;
  reason:
    | 'insufficient_reference'
    | 'duplicate_reference_year'
    | 'low_activity'
    | 'missing_value'
    | null;
}

export interface ClassifyMonthInput extends LeaveOneOutTarget {
  value: number | null;
  history: readonly ReferenceObservation[];
  minActivity?: number;
  minReferenceYears?: number;
}

function finiteValues(values: readonly number[]): number[] {
  return values.filter((value) => Number.isFinite(value));
}

export function quantileSorted(sortedValues: readonly number[], probability: number): number | null {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError('Quantile probability must be between 0 and 1.');
  }
  if (sortedValues.length === 0) {
    return null;
  }
  if (sortedValues.length === 1) {
    return sortedValues[0] as number;
  }
  const position = (sortedValues.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sortedValues[lowerIndex] as number;
  const upper = sortedValues[upperIndex] as number;
  const fraction = position - lowerIndex;
  return lower + (upper - lower) * fraction;
}

export function quantile(values: readonly number[], probability: number): number | null {
  return quantileSorted(finiteValues(values).sort((left, right) => left - right), probability);
}

export function computeReferenceStats(values: readonly number[]): ReferenceStats {
  const sorted = finiteValues(values).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return {
      nYears: 0,
      median: null,
      p25: null,
      p75: null,
      p90: null,
      min: null,
      max: null,
    };
  }
  return {
    nYears: sorted.length,
    median: quantileSorted(sorted, 0.5),
    p25: quantileSorted(sorted, 0.25),
    p75: quantileSorted(sorted, 0.75),
    p90: quantileSorted(sorted, 0.9),
    min: sorted[0] as number,
    max: sorted[sorted.length - 1] as number,
  };
}

function dedupedReferenceValues(
  history: readonly ReferenceObservation[],
  target: LeaveOneOutTarget,
  includePartial = false,
): { values: number[]; duplicateYears: number[] } {
  const byYear = new Map<number, number>();
  const duplicateYears = new Set<number>();

  for (const observation of history) {
    if (observation.month !== target.month || observation.year === target.year) {
      continue;
    }
    if (!includePartial && observation.isPartial === true) {
      continue;
    }
    if (observation.value !== null && Number.isFinite(observation.value)) {
      if (byYear.has(observation.year)) {
        duplicateYears.add(observation.year);
      } else {
        byYear.set(observation.year, observation.value);
      }
    }
  }

  return {
    values: Array.from(byYear.values()),
    duplicateYears: Array.from(duplicateYears).sort((left, right) => left - right),
  };
}

export function leaveOneOutReference(
  history: readonly ReferenceObservation[],
  target: LeaveOneOutTarget,
  options: LeaveOneOutOptions = {},
): ReferenceStats {
  return computeReferenceStats(
    dedupedReferenceValues(history, target, options.includePartial === true).values,
  );
}

export function percentileRank(
  value: number,
  referenceValues: readonly number[],
): number | null {
  const values = finiteValues(referenceValues);
  if (values.length === 0) {
    return null;
  }
  let less = 0;
  let equal = 0;
  for (const candidate of values) {
    if (candidate < value) {
      less += 1;
    } else if (candidate === value) {
      equal += 1;
    }
  }
  return (less + equal / 2) / values.length;
}

export function classifyMonthLeaveOneOut(
  input: ClassifyMonthInput,
): MonthClassification {
  const minReferenceYears = input.minReferenceYears ?? MIN_REFERENCE_YEARS;
  const minActivity = input.minActivity ?? MIN_ACTIVITY_CDO;
  const reference = leaveOneOutReference(input.history, input);
  const { values, duplicateYears } = dedupedReferenceValues(input.history, input);
  const hasValue = input.value !== null && Number.isFinite(input.value);
  const rank = hasValue ? percentileRank(input.value as number, values) : null;
  const ratio =
    hasValue && reference.median !== null && reference.median > 0
      ? (input.value as number) / reference.median
      : null;

  if (duplicateYears.length > 0) {
    return {
      status: 'insufficient',
      reference,
      percentileRank: rank,
      ratioToMedian: ratio,
      reason: 'duplicate_reference_year',
    };
  }

  if (!hasValue) {
    return {
      status: 'insufficient',
      reference,
      percentileRank: null,
      ratioToMedian: null,
      reason: 'missing_value',
    };
  }

  if (reference.nYears < minReferenceYears || reference.median === null) {
    return {
      status: 'insufficient',
      reference,
      percentileRank: rank,
      ratioToMedian: ratio,
      reason: 'insufficient_reference',
    };
  }

  if (reference.median < minActivity) {
    return {
      status: 'insufficient',
      reference,
      percentileRank: rank,
      ratioToMedian: ratio,
      reason: 'low_activity',
    };
  }

  const value = input.value as number;
  const p25 = reference.p25 as number;
  const p75 = reference.p75 as number;
  const p90 = reference.p90 as number;
  let status: MonthStatus;
  if (value < p25) {
    status = 'below_usual';
  } else if (value <= p75) {
    status = 'usual';
  } else if (value <= p90) {
    status = 'above_usual';
  } else {
    status = 'exceptional';
  }

  return {
    status,
    reference,
    percentileRank: rank,
    ratioToMedian: ratio,
    reason: null,
  };
}
