import type { SensorFamily } from "../firms/types";
import { selectSeriesDetections } from "./filters";
import type {
  CellDayOccupancy,
  GriddedDetection,
  SeriesSelectionOptions,
} from "./types";

export function computeCellDayOccupancy(
  detections: readonly GriddedDetection[],
  options: SeriesSelectionOptions = {},
): CellDayOccupancy[] {
  const selected = selectSeriesDetections(detections, options);
  const byCellDay = new Map<string, CellDayOccupancy>();

  for (const detection of selected) {
    const key = `${detection.cellId}|${detection.acqDate}|${detection.sensor}`;
    const existing = byCellDay.get(key);
    if (existing === undefined) {
      byCellDay.set(key, {
        cellId: detection.cellId,
        day: detection.acqDate,
        sensor: detection.sensor,
        nDetections: 1,
        maxFrp: detection.frp,
      });
      continue;
    }
    existing.nDetections += 1;
    if (detection.frp !== null) {
      existing.maxFrp =
        existing.maxFrp === null
          ? detection.frp
          : Math.max(existing.maxFrp, detection.frp);
    }
  }

  return Array.from(byCellDay.values()).sort((left, right) => {
    if (left.day !== right.day) {
      return left.day.localeCompare(right.day);
    }
    if (left.sensor !== right.sensor) {
      return left.sensor.localeCompare(right.sensor);
    }
    return left.cellId - right.cellId;
  });
}

export function countCellDays(
  occupancy: readonly CellDayOccupancy[],
  sensor?: SensorFamily,
): number {
  if (sensor === undefined) {
    return occupancy.length;
  }
  return occupancy.filter((row) => row.sensor === sensor).length;
}
