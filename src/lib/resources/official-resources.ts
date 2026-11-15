/**
 * Catálogo oficial y contexto público de Prevención/Respuesta.
 *
 * Este archivo es la capa de datos de la tarea #28:
 * - valida con zod el catálogo revisado en `src/content/official-resource-catalog.json`;
 * - filtra recursos pendientes, vencidos, de demostración o de otro territorio;
 * - valida el contexto de navegación que llega por la URL (zona y detección);
 * - calcula el perfil estacional de demostración con las funciones puras del
 *   historial existente;
 * - construye una ficha compartible sin datos privados.
 *
 * No consulta red, base de datos ni servicios externos. Todo el perfil es
 * sintético y se identifica como tal en la interfaz.
 */
import { z } from "zod";
import catalogJson from "@/content/official-resource-catalog.json";
import { DEMO_ZONES, type DemoSensor } from "@/content/map-demo";
import {
  createMonthSummary,
  HISTORY_START_YEAR,
} from "@/lib/history/demo-history";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Una revisión se considera vigente durante 180 días. */
export const REVIEW_VALIDITY_DAYS = 180;

/** Territorio admitido por el catálogo del MVP. */
export const OFFICIAL_REGION_CODES = ["DO"] as const;
export type OfficialRegionCode = (typeof OFFICIAL_REGION_CODES)[number];

/** Zonas ficticias compartidas con el resto de la demostración. */
export const DEMO_ZONE_IDS = ["north", "south", "valley"] as const;
export type DemoZoneId = (typeof DEMO_ZONE_IDS)[number];

/** Satélites compatibles con cada familia de sensor. */
export const SENSOR_SATELLITES: Record<DemoSensor, readonly string[]> = {
  MODIS: ["Terra", "Aqua"],
  VIIRS: ["S-NPP"],
};

/**
 * Caja aproximada de República Dominicana con margen. El contexto de una
 * detección solo se acepta si cae dentro de este territorio; no se valida una
 * geometría administrativa exacta.
 */
export const DOMINICAN_REPUBLIC_BBOX = {
  minLon: -72.1,
  maxLon: -68.2,
  minLat: 17.4,
  maxLat: 20.1,
} as const;

// ---------------------------------------------------------------------------
// Catálogo oficial
// ---------------------------------------------------------------------------

export const resourceCategorySchema = z.enum([
  "prevention",
  "reporting",
  "bulletins",
]);
export type ResourceCategory = z.infer<typeof resourceCategorySchema>;

export const reviewStatusSchema = z.enum(["verified_source", "pending"]);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

function isOfficialHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const officialDomain =
      url.hostname === "gob.do" || url.hostname.endsWith(".gob.do");
    return (
      url.protocol === "https:" &&
      officialDomain &&
      url.username === "" &&
      url.password === "" &&
      url.port === ""
    );
  } catch {
    return false;
  }
}

/** Solo HTTPS, dominio oficial `.gob.do` y sin credenciales ni puerto. */
const officialHttpsUrlSchema = z.url().refine(isOfficialHttpsUrl, {
  message:
    "resource URL must be HTTPS on an official .gob.do domain without credentials",
});

/**
 * Un recurso publicado por una institución. `publishedAt` puede ser null
 * cuando la página no muestra una fecha verificable; nunca se estima.
 */
export const officialResourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1),
  organization: z.string().trim().min(1),
  category: resourceCategorySchema,
  url: officialHttpsUrlSchema,
  regionCode: z.enum(OFFICIAL_REGION_CODES),
  publishedAt: z.iso.date().nullable(),
  checkedAt: z.iso.datetime({ offset: true }),
  reviewStatus: reviewStatusSchema,
  notes: z.string().trim().min(1),
  is_demo: z.boolean(),
});
export type OfficialResource = z.infer<typeof officialResourceSchema>;

export const officialResourceCatalogSchema = z.object({
  version: z.literal(1),
  resources: z.array(officialResourceSchema),
});
export type OfficialResourceCatalog = z.infer<
  typeof officialResourceCatalogSchema
>;

export type ResourceExclusionReason = "pending" | "expired" | "demo" | "region";

export type ExcludedResource = {
  id: string;
  reason: ResourceExclusionReason;
};

export type ResourceSelection = {
  visible: OfficialResource[];
  excluded: ExcludedResource[];
};

export type CatalogState =
  | {
      status: "ready";
      resources: OfficialResource[];
      excluded: ExcludedResource[];
    }
  | { status: "error"; error: "invalid_catalog" };

function checkedAtMilliseconds(resource: OfficialResource): number {
  return Date.parse(resource.checkedAt);
}

/** Último instante en que la revisión se considera vigente. */
export function reviewValidUntil(resource: OfficialResource): string {
  return new Date(
    checkedAtMilliseconds(resource) + REVIEW_VALIDITY_DAYS * DAY_MS,
  ).toISOString();
}

/**
 * Una revisión vence a los 180 días. Se tolera hasta un día de diferencia de
 * reloj para no descartar una revisión hecha hoy en otro huso horario.
 */
export function isReviewCurrent(
  resource: OfficialResource,
  now: Date = new Date(),
): boolean {
  const checked = checkedAtMilliseconds(resource);
  if (!Number.isFinite(checked)) return false;
  const age = now.getTime() - checked;
  return age >= -DAY_MS && age <= REVIEW_VALIDITY_DAYS * DAY_MS;
}

/**
 * Decide qué recursos se pueden mostrar. Nunca presenta como verificado un
 * recurso pendiente, vencido, de demostración o de otro territorio.
 */
export function selectOfficialResources(
  resources: readonly OfficialResource[],
  {
    categories,
    now = new Date(),
    regionCode = "DO",
  }: {
    categories?: readonly ResourceCategory[];
    now?: Date;
    regionCode?: OfficialRegionCode;
  } = {},
): ResourceSelection {
  const visible: OfficialResource[] = [];
  const excluded: ExcludedResource[] = [];

  for (const resource of resources) {
    if (resource.regionCode !== regionCode) {
      excluded.push({ id: resource.id, reason: "region" });
      continue;
    }
    if (resource.is_demo) {
      excluded.push({ id: resource.id, reason: "demo" });
      continue;
    }
    if (resource.reviewStatus !== "verified_source") {
      excluded.push({ id: resource.id, reason: "pending" });
      continue;
    }
    if (!isReviewCurrent(resource, now)) {
      excluded.push({ id: resource.id, reason: "expired" });
      continue;
    }
    if (categories && !categories.includes(resource.category)) continue;
    visible.push(resource);
  }

  return { visible, excluded };
}

/**
 * Valida el catálogo completo. Si un solo registro no cumple el contrato, la
 * vista muestra un error en lugar de mezclar recursos válidos con datos rotos.
 */
export function loadOfficialResourceCatalog(
  raw: unknown = catalogJson,
  now: Date = new Date(),
): CatalogState {
  const parsed = officialResourceCatalogSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", error: "invalid_catalog" };
  }
  const { visible, excluded } = selectOfficialResources(parsed.data.resources, {
    now,
  });
  return { status: "ready", resources: visible, excluded };
}

// ---------------------------------------------------------------------------
// Contexto público de navegación
// ---------------------------------------------------------------------------

export type ResponseDetectionContext = {
  id: string;
  /** Orden GeoJSON: [lon, lat]. */
  coordinates: [number, number];
  sensor: DemoSensor;
  satellite: string;
  /** ISO 8601 normalizado en UTC. */
  acquiredAt: string;
};

export type ResponseContext = {
  zone: DemoZoneId | null;
  detection: ResponseDetectionContext | null;
  /**
   * Nombres de parámetros que llegaron mal y se ignoraron. Nunca contiene
   * valores, correos ni otro dato privado.
   */
  invalidFields: string[];
};

type RawSearchParams = Record<string, string | string[] | undefined>;

const DETECTION_FIELDS = [
  "deteccion",
  "lat",
  "lon",
  "sensor",
  "satelite",
  "adquirido",
] as const;

const numericParam = z
  .string()
  .trim()
  .min(1)
  .refine((value) => Number.isFinite(Number(value)), {
    message: "coordinate must be a finite number",
  })
  .transform((value) => Number(value));

const detectionContextSchema = z.object({
  deteccion: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/),
  lat: numericParam,
  lon: numericParam,
  sensor: z.enum(["MODIS", "VIIRS"]),
  satelite: z.string().trim().min(1),
  adquirido: z.iso.datetime({ offset: true }),
});

export function isDemoZoneId(value: unknown): value is DemoZoneId {
  return (
    typeof value === "string" &&
    (DEMO_ZONE_IDS as readonly string[]).includes(value)
  );
}

export function isWithinDominicanRepublic(
  coordinates: readonly [number, number],
): boolean {
  const [lon, lat] = coordinates;
  return (
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lon >= DOMINICAN_REPUBLIC_BBOX.minLon &&
    lon <= DOMINICAN_REPUBLIC_BBOX.maxLon &&
    lat >= DOMINICAN_REPUBLIC_BBOX.minLat &&
    lat <= DOMINICAN_REPUBLIC_BBOX.maxLat
  );
}

function readRawValue(
  params: RawSearchParams,
  key: string,
): string | undefined {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Interpreta los parámetros públicos de `/prevencion` y `/respuesta`.
 *
 * - `zona` debe ser una zona ficticia conocida.
 * - La detección requiere los seis campos juntos; si falta uno o alguno es
 *   inválido, no se muestra una ficha inventada.
 * - Parámetros desconocidos (por ejemplo un correo) se ignoran y nunca se
 *   devuelven ni se comparten.
 */
export function parseResponseContext(
  params: RawSearchParams,
  now: Date = new Date(),
): ResponseContext {
  const invalidFields: string[] = [];
  // Los errores de detección se acumulan aparte para que un `zona` inválido no
  // descarte una detección que sí es válida.
  const detectionInvalid: string[] = [];

  const zoneRaw = params.zona;
  let zone: DemoZoneId | null = null;
  if (zoneRaw !== undefined) {
    if (isDemoZoneId(zoneRaw)) {
      zone = zoneRaw;
    } else {
      invalidFields.push("zona");
    }
  }

  const presentFields = DETECTION_FIELDS.filter(
    (field) => params[field] !== undefined,
  );
  let detection: ResponseDetectionContext | null = null;

  if (presentFields.length > 0) {
    if (presentFields.length < DETECTION_FIELDS.length) {
      for (const field of DETECTION_FIELDS) {
        if (params[field] === undefined) detectionInvalid.push(field);
      }
    }

    // Un parámetro repetido llega como arreglo y no es un contexto válido.
    for (const field of presentFields) {
      if (typeof params[field] !== "string") detectionInvalid.push(field);
    }

    if (presentFields.length === DETECTION_FIELDS.length) {
      const parsed = detectionContextSchema.safeParse({
        deteccion: readRawValue(params, "deteccion"),
        lat: readRawValue(params, "lat"),
        lon: readRawValue(params, "lon"),
        sensor: readRawValue(params, "sensor"),
        satelite: readRawValue(params, "satelite"),
        adquirido: readRawValue(params, "adquirido"),
      });

      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          detectionInvalid.push(String(issue.path[0] ?? "deteccion"));
        }
      } else {
        const data = parsed.data;
        const coordinates: [number, number] = [data.lon, data.lat];
        if (!isWithinDominicanRepublic(coordinates)) {
          detectionInvalid.push("lat", "lon");
        }
        if (!SENSOR_SATELLITES[data.sensor].includes(data.satelite)) {
          detectionInvalid.push("satelite");
        }

        const acquired = Date.parse(data.adquirido);
        const earliest = Date.UTC(2000, 0, 1);
        const latest = now.getTime() + DAY_MS;
        if (
          !Number.isFinite(acquired) ||
          acquired < earliest ||
          acquired > latest
        ) {
          detectionInvalid.push("adquirido");
        }

        if (detectionInvalid.length === 0) {
          detection = {
            id: data.deteccion,
            coordinates,
            sensor: data.sensor,
            satellite: data.satelite,
            acquiredAt: new Date(acquired).toISOString(),
          };
        }
      }
    }
  }

  return {
    zone,
    detection,
    invalidFields: [...new Set([...invalidFields, ...detectionInvalid])],
  };
}

/** Consulta canónica para enlaces entre Prevención y Respuesta. */
export function buildContextQuery({
  zone,
  detection = null,
}: {
  zone: DemoZoneId;
  detection?: ResponseDetectionContext | null;
}): string {
  const params = new URLSearchParams({ zona: zone });
  if (detection) {
    params.set("deteccion", detection.id);
    params.set("lat", String(detection.coordinates[1]));
    params.set("lon", String(detection.coordinates[0]));
    params.set("sensor", detection.sensor);
    params.set("satelite", detection.satellite);
    params.set("adquirido", detection.acquiredAt);
  }
  return params.toString();
}

// ---------------------------------------------------------------------------
// Perfil estacional de demostración
// ---------------------------------------------------------------------------

export type PriorityMonthProfile = {
  /** Mes 0-based, igual que el historial existente. */
  month: number;
  totals: number[];
  median: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
  years: number;
  sensors: DemoSensor[];
};

export type PriorityProfile = {
  synthetic: true;
  fromYear: number;
  toYear: number;
  years: number;
  months: PriorityMonthProfile[];
  /** Los tres meses con mayor mediana; solo una guía de preparación. */
  priorityMonths: PriorityMonthProfile[];
  sensors: DemoSensor[];
};

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function assertZoneIndex(zoneIndex: number) {
  if (
    !Number.isInteger(zoneIndex) ||
    zoneIndex < 0 ||
    zoneIndex >= DEMO_ZONES.length
  ) {
    throw new RangeError("zoneIndex must identify one of the fictional zones");
  }
}

/**
 * Perfil de los últimos años completos. Usa `createMonthSummary`, la misma
 * función pura del calendario, el detalle y el CSV. No calcula un índice
 * armonizado ni presenta los conteos como observaciones reales.
 */
export function buildPriorityProfile(
  zoneIndex: number,
  {
    now = new Date(),
    years = 10,
  }: {
    now?: Date;
    years?: number;
  } = {},
): PriorityProfile {
  assertZoneIndex(zoneIndex);
  if (!Number.isInteger(years) || years < 1) {
    throw new RangeError("years must be a positive integer");
  }

  const lastCompleteYear = Math.max(
    HISTORY_START_YEAR,
    now.getUTCFullYear() - 1,
  );
  const toYear = lastCompleteYear;
  const fromYear = Math.max(HISTORY_START_YEAR, toYear - years + 1);
  const actualYears = toYear - fromYear + 1;

  const months: PriorityMonthProfile[] = [];
  for (let month = 0; month < 12; month += 1) {
    const totals: number[] = [];
    const sensors = new Set<DemoSensor>();
    for (let year = fromYear; year <= toYear; year += 1) {
      const summary = createMonthSummary(year, month, { zoneIndex, now });
      totals.push(summary.total);
      for (const sensor of summary.sensors) sensors.add(sensor);
    }
    const sorted = [...totals].sort((a, b) => a - b);
    months.push({
      month,
      totals,
      median: percentile(sorted, 0.5),
      p25: percentile(sorted, 0.25),
      p75: percentile(sorted, 0.75),
      min: sorted[0] ?? 0,
      max: sorted.at(-1) ?? 0,
      years: actualYears,
      sensors: [...sensors],
    });
  }

  const priorityMonths = [...months]
    .sort((a, b) => b.median - a.median || b.p75 - a.p75 || a.month - b.month)
    .slice(0, 3);

  const allSensors = new Set<DemoSensor>();
  for (const month of months) {
    for (const sensor of month.sensors) allSensors.add(sensor);
  }

  return {
    synthetic: true,
    fromYear,
    toYear,
    years: actualYears,
    months,
    priorityMonths,
    sensors: [...allSensors],
  };
}

// ---------------------------------------------------------------------------
// Ficha compartible
// ---------------------------------------------------------------------------

export type ZoneSheetLabels = {
  title: string;
  generated: string;
  zone: string;
  period: string;
  synthetic: string;
  priority: string;
  median: string;
  range: string;
  resources: string;
  reviewed: string;
  noPrivate: string;
  emergency: string;
};

/**
 * Texto plano de la ficha de zona. No recibe coordenadas, correos, zonas
 * privadas ni contactos: por diseño no puede filtrar datos privados.
 */
export function buildZoneSheet({
  zoneLabel,
  generatedAt,
  periodLabel,
  monthNames,
  profile,
  resources,
  labels,
}: {
  zoneLabel: string;
  generatedAt: string;
  periodLabel: string;
  monthNames: readonly string[];
  profile: PriorityProfile;
  resources: readonly OfficialResource[];
  labels: ZoneSheetLabels;
}): string {
  const lines: string[] = [
    labels.title,
    `${labels.generated}: ${generatedAt}`,
    `${labels.zone}: ${zoneLabel}`,
    `${labels.period}: ${periodLabel}`,
    labels.synthetic,
    "",
    labels.priority,
  ];

  profile.priorityMonths.forEach((month, index) => {
    lines.push(
      `${index + 1}. ${monthNames[month.month] ?? String(month.month + 1)} · ${labels.median} ${month.median} · ${labels.range} ${month.min}–${month.max}`,
    );
  });

  lines.push("", labels.resources);
  for (const resource of resources) {
    lines.push(
      `- ${resource.title}`,
      `  ${resource.organization}`,
      `  ${resource.url}`,
      `  ${labels.reviewed}: ${resource.checkedAt}`,
    );
  }

  lines.push("", labels.noPrivate, labels.emergency);
  return lines.join("\n");
}
