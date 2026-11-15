import type { ConfidenceClass, SensorFamily } from "./types";

const CONFIDENCE_RANK: Record<ConfidenceClass, number> = {
  low: 0,
  nominal: 1,
  high: 2,
};

export function confidenceRank(confidence: ConfidenceClass): number {
  return CONFIDENCE_RANK[confidence];
}

export function meetsMinConfidence(
  confidence: ConfidenceClass,
  minimum: ConfidenceClass,
): boolean {
  return confidenceRank(confidence) >= confidenceRank(minimum);
}

export function normalizeModisConfidence(raw: string): ConfidenceClass | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    return null;
  }
  if (value < 30) {
    return "low";
  }
  if (value < 80) {
    return "nominal";
  }
  return "high";
}

export function normalizeViirsConfidence(raw: string): ConfidenceClass | null {
  const value = raw.trim().toLowerCase();
  if (value === "l" || value === "low") {
    return "low";
  }
  if (value === "n" || value === "nominal") {
    return "nominal";
  }
  if (value === "h" || value === "high") {
    return "high";
  }
  return null;
}

export function normalizeConfidence(
  raw: string,
  family: SensorFamily,
): ConfidenceClass | null {
  return family === "MODIS"
    ? normalizeModisConfidence(raw)
    : normalizeViirsConfidence(raw);
}
