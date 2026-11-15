import { describe, expect, it } from "vitest";
import {
  availableSatellites,
  availableSensors,
  countBySensor,
  createMonthRecords,
  createMonthSummary,
  createPeriodRecords,
  createRangeSummaries,
  daysInMonth,
  defaultHistoryRange,
  filterHistoryRecords,
  HISTORY_START_YEAR,
  historyLevel,
  historyYearOptions,
  isFutureMonth,
  isSensorAvailable,
  sampleForMap,
  utcDayOf,
} from "@/lib/history/demo-history";

/** Fecha fija para que las pruebas no dependan del reloj real. */
const NOW = new Date("2026-11-15T12:00:00.000Z");

describe("historial: años y rango", () => {
  it("ofrece 2000 primero y termina en el año actual dinámico", () => {
    const years = historyYearOptions(NOW);
    expect(years[0]).toBe(2000);
    expect(years.at(-1)).toBe(2026);
    expect(years).toHaveLength(27);
    expect(years).toEqual([...years].sort((a, b) => a - b));
    expect(years.some((year) => year > 2026)).toBe(false);
    expect(historyYearOptions(new Date("2031-01-02T00:00:00Z")).at(-1)).toBe(
      2031,
    );
  });

  it("usa el rango predeterminado 2000–año actual", () => {
    expect(defaultHistoryRange(NOW)).toEqual({
      fromYear: HISTORY_START_YEAR,
      toYear: 2026,
    });
  });

  it("no crea años futuros aunque el rango se invierta", () => {
    const summaries = createRangeSummaries(2027, 2019, { now: NOW });
    expect(summaries[0]).toMatchObject({ year: 2019, month: 0 });
    expect(summaries.at(-1)).toMatchObject({ year: 2027, month: 11 });
    expect(summaries[0].future).toBe(false);
    expect(summaries.at(-1)?.future).toBe(true);
  });
});

describe("historial: disponibilidad nominal de sensores", () => {
  it("no tiene MODIS antes de noviembre de 2000", () => {
    expect(isSensorAvailable("MODIS", 2000, 9)).toBe(false);
    expect(availableSensors(2000, 9)).toEqual([]);
  });

  it("empieza Terra en noviembre de 2000 y Aqua en julio de 2002", () => {
    expect(availableSatellites("MODIS", 2000, 10)).toEqual(["Terra"]);
    expect(availableSatellites("MODIS", 2002, 5)).toEqual(["Terra"]);
    expect(availableSatellites("MODIS", 2002, 6)).toEqual(["Terra", "Aqua"]);
  });

  it("no tiene VIIRS antes de 2012 y solo S-NPP después", () => {
    expect(isSensorAvailable("VIIRS", 2011, 11)).toBe(false);
    expect(availableSensors(2011, 11)).toEqual(["MODIS"]);
    expect(availableSatellites("VIIRS", 2012, 0)).toEqual(["S-NPP"]);
    expect(availableSensors(2020, 0)).toEqual(["MODIS", "VIIRS"]);
  });

  it("no genera registros de un sensor fuera de su disponibilidad", () => {
    const beforeModis = createMonthRecords(2000, 9, 0, NOW);
    expect(beforeModis).toEqual([]);

    const terraOnly = createMonthRecords(2001, 2, 0, NOW);
    expect(terraOnly.length).toBeGreaterThan(0);
    expect(new Set(terraOnly.map((item) => item.sensor))).toEqual(
      new Set(["MODIS"]),
    );
    expect(new Set(terraOnly.map((item) => item.satellite))).toEqual(
      new Set(["Terra"]),
    );

    const beforeViirs = createMonthRecords(2010, 2, 0, NOW);
    expect(beforeViirs.every((item) => item.sensor === "MODIS")).toBe(true);

    const afterViirs = createMonthRecords(2020, 2, 0, NOW);
    expect(afterViirs.some((item) => item.sensor === "VIIRS")).toBe(true);
    expect(
      afterViirs
        .filter((item) => item.sensor === "VIIRS")
        .every((item) => item.satellite === "S-NPP"),
    ).toBe(true);
  });
});

describe("historial: días, ceros y febrero bisiesto", () => {
  it("incluye todos los días, incluso los que tienen cero detecciones", () => {
    const summary = createMonthSummary(2025, 2, { now: NOW });
    const records = createMonthRecords(2025, 2, 0, NOW);
    const byDay = Array.from({ length: summary.days }, () => 0);
    for (const record of records) byDay[utcDayOf(record) - 1] += 1;

    expect(summary.days).toBe(31);
    expect(summary.daily).toHaveLength(31);
    expect(summary.daily).toEqual(byDay);
    expect(summary.daily).toContain(0);
    expect(summary.total).toBe(records.length);
  });

  it("respeta febrero de 28 y de 29 días", () => {
    expect(daysInMonth(2023, 1)).toBe(28);
    expect(daysInMonth(2024, 1)).toBe(29);
    expect(createMonthSummary(2023, 1, { now: NOW }).daily).toHaveLength(28);
    expect(createMonthSummary(2024, 1, { now: NOW }).daily).toHaveLength(29);

    const leap = createMonthRecords(2024, 1, 0, NOW);
    expect(leap.every((item) => item.acquiredAt.startsWith("2024-02-"))).toBe(
      true,
    );
    expect(leap.some((item) => item.acquiredAt.startsWith("2024-02-29"))).toBe(
      leap.some((item) => utcDayOf(item) === 29),
    );
  });

  it("marca el mes en curso y recorta los días futuros", () => {
    const summary = createMonthSummary(2026, 10, { now: NOW });
    expect(summary.partial).toBe(true);
    expect(summary.future).toBe(false);
    expect(summary.observedDays).toBe(15);
    expect(summary.daily.slice(15)).toEqual(Array(15).fill(0));

    const records = createMonthRecords(2026, 10, 0, NOW);
    expect(records.every((item) => utcDayOf(item) <= 15)).toBe(true);
  });

  it("no genera registros para meses futuros y los distingue", () => {
    expect(isFutureMonth(2026, 11, NOW)).toBe(true);
    expect(isFutureMonth(2026, 10, NOW)).toBe(false);
    const future = createMonthSummary(2026, 11, { now: NOW });
    expect(future.future).toBe(true);
    expect(future.observedDays).toBe(0);
    expect(future.total).toBe(0);
    expect(future.daily.every((count) => count === 0)).toBe(true);
    expect(createMonthRecords(2026, 11, 0, NOW)).toEqual([]);
  });
});

describe("historial: ambos sensores y coherencia de cifras", () => {
  it("suma MODIS y VIIRS en el filtro Ambos y separa cada familia", () => {
    const all = createMonthSummary(2025, 2, { sensor: "all", now: NOW });
    const modis = createMonthSummary(2025, 2, { sensor: "MODIS", now: NOW });
    const viirs = createMonthSummary(2025, 2, { sensor: "VIIRS", now: NOW });
    expect(modis.total).toBeGreaterThan(0);
    expect(viirs.total).toBeGreaterThan(0);
    expect(modis.total + viirs.total).toBe(all.total);
    expect(all.sensors).toEqual(["MODIS", "VIIRS"]);

    const records = createMonthRecords(2025, 2, 0, NOW);
    expect(countBySensor(records)).toEqual({
      MODIS: modis.total,
      VIIRS: viirs.total,
    });
    expect(filterHistoryRecords(records, "MODIS")).toHaveLength(modis.total);
    expect(filterHistoryRecords(records, "VIIRS")).toHaveLength(viirs.total);
  });

  it("el nivel del calendario sale del total filtrado", () => {
    expect(historyLevel(0)).toBe(0);
    expect(historyLevel(5)).toBe(0);
    expect(historyLevel(6)).toBe(1);
    expect(historyLevel(16)).toBe(2);
    expect(historyLevel(31)).toBe(3);
    const summary = createMonthSummary(2025, 2, { now: NOW });
    expect(summary.level).toBe(historyLevel(summary.total));
  });

  it("cambiar el rango cambia los registros del período", () => {
    const full = createPeriodRecords(2000, 2026, 0, NOW);
    const recent = createPeriodRecords(2020, 2026, 0, NOW);
    expect(recent.length).toBeGreaterThan(0);
    expect(recent.length).toBeLessThan(full.length);
    expect(
      recent.every((record) => Number(record.acquiredAt.slice(0, 4)) >= 2020),
    ).toBe(true);
    expect(full.length).toBe(
      createRangeSummaries(2000, 2026, { now: NOW }).reduce(
        (sum, summary) => sum + summary.total,
        0,
      ),
    );
  });

  it("es determinista y mantiene la zona separada", () => {
    expect(createMonthRecords(2024, 5, 0, NOW)).toEqual(
      createMonthRecords(2024, 5, 0, NOW),
    );
    const zoneA = createMonthRecords(2024, 5, 0, NOW);
    const zoneB = createMonthRecords(2024, 5, 1, NOW);
    expect(zoneA[0].id).not.toBe(zoneB[0].id);
    expect(zoneA[0].coordinates).not.toEqual(zoneB[0].coordinates);
  });

  it("marca todos los datos como sintéticos y usa coordenadas WGS84", () => {
    const records = createPeriodRecords(2023, 2024, 2, NOW);
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((record) => record.is_demo)).toBe(true);
    for (const record of records) {
      expect(record.id.startsWith("demo-history-demo-zone-c-")).toBe(true);
      expect(record.confidence).toBeGreaterThanOrEqual(45);
      expect(record.confidence).toBeLessThanOrEqual(95);
      expect(record.frpMw).toBeGreaterThan(0);
      expect(record.coordinates[0]).toBeGreaterThanOrEqual(-180);
      expect(record.coordinates[0]).toBeLessThanOrEqual(180);
      expect(record.coordinates[1]).toBeGreaterThanOrEqual(-90);
      expect(record.coordinates[1]).toBeLessThanOrEqual(90);
    }
  });
});

describe("historial: muestra explícita para el mapa", () => {
  it("devuelve un subconjunto sin inventar registros", () => {
    const records = createPeriodRecords(2000, 2026, 0, NOW);
    const sample = sampleForMap(records, 100);
    expect(sample).toHaveLength(100);
    const ids = new Set(records.map((record) => record.id));
    expect(sample.every((record) => ids.has(record.id))).toBe(true);
    expect(sample.map((record) => record.acquiredAt)).toEqual(
      [...sample].map((record) => record.acquiredAt).sort(),
    );
    expect(sampleForMap(records.slice(0, 10), 100)).toEqual(
      records.slice(0, 10),
    );
  });
});
