import type { FirmsDetection } from "../firms/types";
import { CELL_SIZE_DEGREES, GRID_HEIGHT, GRID_WIDTH } from "./config";
import type { GridCell, GriddedDetection } from "./types";

const MAX_CELL_ID = GRID_WIDTH * GRID_HEIGHT - 1;

function validateLongitude(longitude: number): void {
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new RangeError(`Invalid longitude: ${longitude}.`);
  }
}

function validateLatitude(latitude: number): void {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RangeError(`Invalid latitude: ${latitude}.`);
  }
}

function indexFor(value: number, offset: number, size: number): number {
  const rawIndex = Math.floor((value + offset) / CELL_SIZE_DEGREES + 1e-9);
  return Math.min(size - 1, Math.max(0, rawIndex));
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function lonLatToCell(longitude: number, latitude: number): GridCell {
  validateLongitude(longitude);
  validateLatitude(latitude);
  const ix = indexFor(longitude, 180, GRID_WIDTH);
  const iy = indexFor(latitude, 90, GRID_HEIGHT);
  return {
    cellId: iy * GRID_WIDTH + ix,
    ix,
    iy,
  };
}

export function cellIdToGridCell(cellId: number): GridCell {
  if (!Number.isSafeInteger(cellId) || cellId < 0 || cellId > MAX_CELL_ID) {
    throw new RangeError(`Invalid cellId: ${cellId}.`);
  }
  const iy = Math.floor(cellId / GRID_WIDTH);
  const ix = cellId - iy * GRID_WIDTH;
  return { cellId, ix, iy };
}

export function cellCentroid(cellOrId: GridCell | number): {
  longitude: number;
  latitude: number;
} {
  const cell =
    typeof cellOrId === "number" ? cellIdToGridCell(cellOrId) : cellOrId;
  return {
    longitude: roundCoordinate(-180 + (cell.ix + 0.5) * CELL_SIZE_DEGREES),
    latitude: roundCoordinate(-90 + (cell.iy + 0.5) * CELL_SIZE_DEGREES),
  };
}

export function cellBounds(cellOrId: GridCell | number): {
  west: number;
  south: number;
  east: number;
  north: number;
} {
  const cell =
    typeof cellOrId === "number" ? cellIdToGridCell(cellOrId) : cellOrId;
  const west = roundCoordinate(-180 + cell.ix * CELL_SIZE_DEGREES);
  const south = roundCoordinate(-90 + cell.iy * CELL_SIZE_DEGREES);
  return {
    west,
    south,
    east: roundCoordinate(west + CELL_SIZE_DEGREES),
    north: roundCoordinate(south + CELL_SIZE_DEGREES),
  };
}

export function assignCellIds(
  detections: readonly FirmsDetection[],
): GriddedDetection[] {
  return detections.map((detection) => ({
    ...detection,
    cellId: lonLatToCell(detection.longitude, detection.latitude).cellId,
  }));
}
