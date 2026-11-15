/**
 * Historial v2 — generación y resumen puros del prototipo.
 *
 * Todo lo de este archivo es sintético (`is_demo: true`) y determinista: la
 * misma zona, año y mes producen exactamente los mismos registros. No hay
 * observaciones de NASA ni un índice armonizado validado.
 *
 * El archivo no importa React ni ningún componente de cliente para que el
 * calendario, el detalle diario, el mapa, las cifras y el CSV usen la misma
 * fuente de datos.
 */
import {
  DEMO_CENTER,
  DEMO_ZONES,
  isValidWgs84Coordinate,
  type DemoDetection,
  type DemoSensor,
  type DemoSensorFilter,
} from "@/content/map-demo";

/** Primer año del selector. El contrato pide 2000 primero. */
export const HISTORY_START_YEAR = 2000;

/**
 * Límite de puntos que se pasan al mapa en la vista de período. El mapa de
 * main todavía dibuja un marcador DOM por registro; por encima de este límite
 * se muestra una muestra explícita. Las cifras, el detalle y el CSV conservan
 * todos los registros del filtro.
 */
export const MAP_SAMPLE_LIMIT = 500;

const MONTHS_IN_YEAR = 12;

/** Patrón estacional solo ilustrativo, de 0 (bajo) a 3 (alto). */
const ILLUSTRATIVE_SEASON = [0, 0, 1, 1, 2, 2, 3, 3, 2, 1, 1, 0] as const;

/**
 * Disponibilidad nominal de cada satélite. Los meses son 0-based para que la
 * comparación con `Date` sea directa.
 *
 * - MODIS Terra: noviembre de 2000.
 * - MODIS Aqua: julio de 2002.
 * - VIIRS S-NPP: enero de 2012.
 */
const NOMINAL_START: Record<
  DemoSensor,
  Record<string, { year: number; month: number }>
> = {
  MODIS: {
    Terra: { year: 2000, month: 10 },
    Aqua: { year: 2002, month: 6 },
  },
  VIIRS: {
    "S-NPP": { year: 2012, month: 0 },
  },
};

export type HistoryMonthSelection = {
  year: number;
  /** Mes 0-based, como en `Date` y `createMonthSelection` anterior. */
  month: number;
};

export type HistoryMonthSummary = {
  year: number;
  month: number;
  days: number;
  /**
   * Detecciones sintéticas por día con el filtro de sensor aplicado. Siempre
   * tiene `days` posiciones, incluidas las de valor cero.
   */
  daily: number[];
  /** Total del mes con el filtro de sensor aplicado. */
  total: number;
  /** Nivel visual relativo (0 a 3). No es gravedad ni predicción. */
  level: number;
  /** El mes empieza después de hoy: no tiene observaciones simuladas. */
  future: boolean;
  /** Es el mes en curso: los días posteriores a hoy quedan como futuros. */
  partial: boolean;
  /** Último día con observación simulada (1-based). 0 si el mes es futuro. */
  observedDays: number;
  /** Familias de sensor nominalmente disponibles ese mes. */
  sensors: DemoSensor[];
};

export type HistoryRange = {
  fromYear: number;
  toYear: number;
};

export type MonthFactoryOptions = {
  sensor?: DemoSensorFilter;
  zoneIndex?: number;
  /** Fecha de referencia; se inyecta en pruebas para no depender del reloj. */
  now?: Date;
};

function assertYear(year: number) {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new RangeError("year must be an integer between 1 and 9999");
  }
}

function assertMonth(month: number) {
  if (!Number.isInteger(month) || month < 0 || month > 11) {
    throw new RangeError("month must be a 0-based integer between 0 and 11");
  }
}

function assertZone(zoneIndex: number) {
  if (
    !Number.isInteger(zoneIndex) ||
    zoneIndex < 0 ||
    zoneIndex >= DEMO_ZONES.length
  ) {
    throw new RangeError("zoneIndex must identify one of the fictional zones");
  }
}

/** Hash entero estable: no usa `Math.random` para que todo sea reproducible. */
function hash32(...values: number[]): number {
  let hash = 2166136261;
  for (const value of values) {
    hash ^= value | 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function daysInMonth(year: number, month: number): number {
  assertYear(year);
  assertMonth(month);
  // `Date.UTC(year, month + 1, 0)` devuelve el último día del mes, incluido
  // febrero bisiesto. Se usa `setUTCFullYear` para evitar el año 0/1900.
  const end = new Date(0);
  end.setUTCFullYear(year, month + 1, 0);
  return end.getUTCDate();
}

function monthIndexValue(year: number, month: number): number {
  return year * MONTHS_IN_YEAR + month;
}

/** ¿El mes empieza después del mes de `now` (UTC)? */
export function isFutureMonth(
  year: number,
  month: number,
  now: Date = new Date(),
): boolean {
  return (
    monthIndexValue(year, month) >
    monthIndexValue(now.getUTCFullYear(), now.getUTCMonth())
  );
}

/** ¿El año es posterior al año actual (UTC)? */
export function isFutureYear(year: number, now: Date = new Date()): boolean {
  return year > now.getUTCFullYear();
}

/** Años del selector: 2000 primero y luego hasta el año actual inclusive. */
export function historyYearOptions(now: Date = new Date()): number[] {
  const currentYear = now.getUTCFullYear();
  const lastYear = Math.max(HISTORY_START_YEAR, currentYear);
  return Array.from(
    { length: lastYear - HISTORY_START_YEAR + 1 },
    (_, index) => HISTORY_START_YEAR + index,
  );
}

/** Rango por defecto: 2000 hasta el año actual. */
export function defaultHistoryRange(now: Date = new Date()): HistoryRange {
  return {
    fromYear: HISTORY_START_YEAR,
    toYear: Math.max(HISTORY_START_YEAR, now.getUTCFullYear()),
  };
}

function startsAtOrBefore(
  year: number,
  month: number,
  start: { year: number; month: number },
): boolean {
  return (
    monthIndexValue(year, month) >= monthIndexValue(start.year, start.month)
  );
}

/** Satélites nominalmente disponibles para una familia y un mes. */
export function availableSatellites(
  sensor: DemoSensor,
  year: number,
  month: number,
): string[] {
  return Object.entries(NOMINAL_START[sensor])
    .filter(([, start]) => startsAtOrBefore(year, month, start))
    .map(([satellite]) => satellite);
}

/** Familias disponibles nominalmente en un mes. */
export function availableSensors(year: number, month: number): DemoSensor[] {
  return (["MODIS", "VIIRS"] as const).filter(
    (sensor) => availableSatellites(sensor, year, month).length > 0,
  );
}

/** ¿La familia tiene datos nominales ese mes? */
export function isSensorAvailable(
  sensor: DemoSensor,
  year: number,
  month: number,
): boolean {
  return availableSatellites(sensor, year, month).length > 0;
}

/**
 * Cantidad de detecciones sintéticas de una familia en un día. La probabilidad
 * depende del patrón estacional ilustrativo; no representa una temporada real.
 */
function familyCount(
  year: number,
  month: number,
  day: number,
  zoneIndex: number,
  sensor: DemoSensor,
): number {
  if (!isSensorAvailable(sensor, year, month)) return 0;
  const season = ILLUSTRATIVE_SEASON[month];
  const sensorSeed = sensor === "MODIS" ? 1 : 2;
  const roll = hash32(year, month + 1, day, zoneIndex + 1, sensorSeed) % 100;

  if (season === 0) return roll < 7 ? 1 : 0;
  if (season === 1) {
    if (roll < 85) return 0;
    return roll < 98 ? 1 : 2;
  }
  if (season === 2) {
    if (roll < 70) return 0;
    return roll < 93 ? 1 : 2;
  }
  if (roll < 50) return 0;
  if (roll < 85) return 1;
  return roll < 97 ? 2 : 3;
}

/** Conteos por familia para todos los días del mes (incluidos los ceros). */
function monthlyFamilyCounts(
  year: number,
  month: number,
  zoneIndex: number,
): Record<DemoSensor, number[]> {
  const days = daysInMonth(year, month);
  const counts: Record<DemoSensor, number[]> = {
    MODIS: Array.from({ length: days }, () => 0),
    VIIRS: Array.from({ length: days }, () => 0),
  };
  for (let day = 0; day < days; day += 1) {
    counts.MODIS[day] = familyCount(year, month, day + 1, zoneIndex, "MODIS");
    counts.VIIRS[day] = familyCount(year, month, day + 1, zoneIndex, "VIIRS");
  }
  return counts;
}

/**
 * Nivel visual a partir del total. Es una escala relativa del prototipo, no
 * una medida de gravedad. Los umbrales dejan los meses de temporada baja en el
 * nivel 0 incluso cuando tienen una o dos detecciones.
 */
export function historyLevel(total: number): number {
  if (!Number.isFinite(total) || total <= 5) return 0;
  if (total <= 15) return 1;
  if (total <= 30) return 2;
  return 3;
}

function matchesSensor(item: DemoDetection, sensor: DemoSensorFilter) {
  return sensor === "all" || item.sensor === sensor;
}

/** Filtra registros por familia conservando el orden original. */
export function filterHistoryRecords(
  records: readonly DemoDetection[],
  sensor: DemoSensorFilter,
): DemoDetection[] {
  return records.filter((record) => matchesSensor(record, sensor));
}

/** Cuenta registros por familia. */
export function countBySensor(
  records: readonly DemoDetection[],
): Record<DemoSensor, number> {
  return records.reduce<Record<DemoSensor, number>>(
    (counts, record) => {
      counts[record.sensor] += 1;
      return counts;
    },
    { MODIS: 0, VIIRS: 0 },
  );
}

/** Día UTC (1-based) de un registro ISO. */
export function utcDayOf(record: Pick<DemoDetection, "acquiredAt">): number {
  return Number(record.acquiredAt.slice(8, 10));
}

function observedDaysFor(
  year: number,
  month: number,
  now: Date,
  days: number,
): number {
  if (isFutureMonth(year, month, now)) return 0;
  const isCurrent =
    year === now.getUTCFullYear() && month === now.getUTCMonth();
  return isCurrent ? Math.min(days, now.getUTCDate()) : days;
}

function dailyTotals(
  counts: Record<DemoSensor, number[]>,
  sensor: DemoSensorFilter,
): number[] {
  return counts.MODIS.map((modis, day) =>
    sensor === "VIIRS"
      ? counts.VIIRS[day]
      : sensor === "MODIS"
        ? modis
        : modis + counts.VIIRS[day],
  );
}

/**
 * Resumen de un mes con el mismo filtro de sensor que el calendario, las
 * cifras, el mapa y el CSV. Incluye todos los días, también los ceros.
 */
export function createMonthSummary(
  year: number,
  month: number,
  { sensor = "all", zoneIndex = 0, now = new Date() }: MonthFactoryOptions = {},
): HistoryMonthSummary {
  assertYear(year);
  assertMonth(month);
  assertZone(zoneIndex);

  const days = daysInMonth(year, month);
  const counts = monthlyFamilyCounts(year, month, zoneIndex);
  const observedDays = observedDaysFor(year, month, now, days);
  const daily = dailyTotals(counts, sensor).map((count, day) =>
    day < observedDays ? count : 0,
  );
  const total = daily.reduce((sum, count) => sum + count, 0);

  return {
    year,
    month,
    days,
    daily,
    total,
    level: historyLevel(total),
    future: isFutureMonth(year, month, now),
    partial: year === now.getUTCFullYear() && month === now.getUTCMonth(),
    observedDays,
    sensors: availableSensors(year, month),
  };
}

function pad(value: number, size = 2): string {
  return String(value).padStart(size, "0");
}

/** Hora UTC de paso según sensor y satélite (solo ilustrativa). */
function acquisitionHour(sensor: DemoSensor, satellite: string): number {
  if (sensor === "VIIRS") return 16;
  return satellite === "Aqua" ? 18 : 13;
}

function buildRecord(
  year: number,
  month: number,
  day: number,
  zoneIndex: number,
  sensor: DemoSensor,
  satellite: string,
  index: number,
): DemoDetection {
  const zone = DEMO_ZONES[zoneIndex];
  const serial = hash32(year, month + 1, day, zoneIndex + 1, index + 1);
  const angle = ((serial % 360) * Math.PI) / 180;
  const radius = 0.004 + ((serial >>> 8) % 9) * 0.0015;
  const coordinates: [number, number] = [
    Number(
      (DEMO_CENTER[0] + zone.offset[0] + Math.cos(angle) * radius).toFixed(5),
    ),
    Number(
      (DEMO_CENTER[1] + zone.offset[1] + Math.sin(angle) * radius).toFixed(5),
    ),
  ];
  if (!isValidWgs84Coordinate(coordinates)) {
    throw new RangeError("generated coordinate is outside WGS84");
  }

  const acquired = new Date(0);
  acquired.setUTCFullYear(year, month, day);
  acquired.setUTCHours(
    acquisitionHour(sensor, satellite),
    (serial >>> 5) % 60,
    0,
    0,
  );

  return {
    id: `demo-history-${zone.id}-${year}${pad(month + 1)}${pad(day)}-${sensor.toLowerCase()}-${pad(index + 1, 3)}`,
    sensor,
    satellite,
    acquiredAt: acquired.toISOString(),
    coordinates,
    confidence: 45 + ((serial >>> 11) % 51),
    frpMw: Number((1.5 + ((serial >>> 3) % 236) / 10).toFixed(1)),
    is_demo: true,
  };
}

/**
 * Registros sintéticos del mes. Respeta la disponibilidad nominal (sin VIIRS
 * antes de 2012, sin Aqua antes de julio de 2002 y sin MODIS antes de
 * noviembre de 2000), no genera días futuros y conserva el orden cronológico.
 */
export function createMonthRecords(
  year: number,
  month: number,
  zoneIndex = 0,
  now: Date = new Date(),
): DemoDetection[] {
  assertYear(year);
  assertMonth(month);
  assertZone(zoneIndex);
  if (isFutureMonth(year, month, now)) return [];

  const days = daysInMonth(year, month);
  const observedDays = observedDaysFor(year, month, now, days);
  const counts = monthlyFamilyCounts(year, month, zoneIndex);
  const records: DemoDetection[] = [];

  for (let day = 1; day <= observedDays; day += 1) {
    for (const sensor of ["MODIS", "VIIRS"] as const) {
      const satellites = availableSatellites(sensor, year, month);
      if (satellites.length === 0) continue;
      const count = counts[sensor][day - 1];
      for (let index = 0; index < count; index += 1) {
        const satellite = satellites[(day + index) % satellites.length];
        records.push(
          buildRecord(year, month, day, zoneIndex, sensor, satellite, index),
        );
      }
    }
  }

  return records;
}

/** Registros sintéticos de un rango de años, con el mismo generador puro. */
export function createPeriodRecords(
  fromYear: number,
  toYear: number,
  zoneIndex = 0,
  now: Date = new Date(),
): DemoDetection[] {
  assertYear(fromYear);
  assertYear(toYear);
  assertZone(zoneIndex);
  const start = Math.min(fromYear, toYear);
  const end = Math.max(fromYear, toYear);
  const records: DemoDetection[] = [];
  for (let year = start; year <= end; year += 1) {
    for (let month = 0; month < MONTHS_IN_YEAR; month += 1) {
      records.push(...createMonthRecords(year, month, zoneIndex, now));
    }
  }
  return records;
}

/** Resúmenes de todos los meses del rango, listos para el calendario. */
export function createRangeSummaries(
  fromYear: number,
  toYear: number,
  options: MonthFactoryOptions = {},
): HistoryMonthSummary[] {
  const start = Math.min(fromYear, toYear);
  const end = Math.max(fromYear, toYear);
  const summaries: HistoryMonthSummary[] = [];
  for (let year = start; year <= end; year += 1) {
    for (let month = 0; month < MONTHS_IN_YEAR; month += 1) {
      summaries.push(createMonthSummary(year, month, options));
    }
  }
  return summaries;
}

/**
 * Muestra determinista y ordenada para la representación de puntos. Devuelve
 * siempre un subconjunto de los registros recibidos; nunca inventa puntos.
 */
export function sampleForMap(
  records: readonly DemoDetection[],
  limit = MAP_SAMPLE_LIMIT,
): DemoDetection[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("limit must be a positive integer");
  }
  if (records.length <= limit) return records.slice();
  const step = records.length / limit;
  return Array.from(
    { length: limit },
    (_, index) => records[Math.floor(index * step)],
  );
}
