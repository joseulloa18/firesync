import { describe, expect, it } from "vitest";
import catalogJson from "@/content/official-resource-catalog.json";
import {
  buildContextQuery,
  buildPriorityProfile,
  buildZoneSheet,
  loadOfficialResourceCatalog,
  officialResourceSchema,
  parseResponseContext,
  reviewValidUntil,
  selectOfficialResources,
  type OfficialResource,
} from "@/lib/resources/official-resources";

/** Fecha fija para que las pruebas no dependan del reloj real. */
const NOW = new Date("2026-11-15T20:00:00.000Z");

function catalogWithFirstResource(
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const copy = structuredClone(catalogJson) as {
    version: number;
    resources: Record<string, unknown>[];
  };
  copy.resources[0] = { ...copy.resources[0], ...patch };
  return copy;
}

function resourceFromCatalog(
  patch: Partial<OfficialResource> = {},
): OfficialResource {
  return officialResourceSchema.parse({
    ...catalogJson.resources[0],
    ...patch,
  });
}

const VALID_CONTEXT = {
  zona: "south",
  deteccion: "demo-viirs-01",
  lat: "18.78",
  lon: "-70.53",
  sensor: "VIIRS",
  satelite: "S-NPP",
  adquirido: "2025-03-04T17:45:00.000Z",
};

describe("catálogo oficial: contrato y filtrado", () => {
  it("valida el catálogo integrado y conserva el 9-1-1 revisado", () => {
    const state = loadOfficialResourceCatalog(catalogJson, NOW);
    expect(state.status).toBe("ready");
    if (state.status !== "ready") return;

    expect(state.resources.some((item) => item.id === "911-como-usarlo")).toBe(
      true,
    );
    expect(
      state.resources.every((item) => item.reviewStatus === "verified_source"),
    ).toBe(true);
    expect(state.excluded).toEqual(
      expect.arrayContaining([
        {
          id: "mmarn-estrategia-nacional-manejo-fuego-2016-2025",
          reason: "pending",
        },
      ]),
    );
    expect(
      state.resources.some(
        (item) =>
          item.id === "mmarn-estrategia-nacional-manejo-fuego-2016-2025",
      ),
    ).toBe(false);
  });

  it("solo acepta URLs HTTPS de dominios oficiales .gob.do", () => {
    const base = catalogJson.resources[0];
    expect(
      officialResourceSchema.safeParse({
        ...base,
        url: "http://ambiente.gob.do/nota/",
      }).success,
    ).toBe(false);
    expect(
      officialResourceSchema.safeParse({
        ...base,
        url: "https://example.com/nota/",
      }).success,
    ).toBe(false);
    expect(
      officialResourceSchema.safeParse({
        ...base,
        url: "https://ambiente.gob.do.evil.example/nota/",
      }).success,
    ).toBe(false);
    expect(
      officialResourceSchema.safeParse({
        ...base,
        url: "https://ambiente.gob.do/nota/",
      }).success,
    ).toBe(true);
  });

  it("rechaza fechas inválidas y territorios no compatibles", () => {
    expect(
      loadOfficialResourceCatalog(
        catalogWithFirstResource({ publishedAt: "2026-02-30" }),
        NOW,
      ).status,
    ).toBe("error");
    expect(
      loadOfficialResourceCatalog(
        catalogWithFirstResource({ checkedAt: "ayer" }),
        NOW,
      ).status,
    ).toBe("error");
    expect(
      loadOfficialResourceCatalog(
        catalogWithFirstResource({ regionCode: "US" }),
        NOW,
      ).status,
    ).toBe("error");
  });

  it("excluye pendientes, vencidos y registros de demostración", () => {
    const pending = resourceFromCatalog({
      id: "pending-resource",
      reviewStatus: "pending",
    });
    const expired = resourceFromCatalog({
      id: "expired-resource",
      checkedAt: "2025-01-01T00:00:00.000Z",
    });
    const demo = resourceFromCatalog({
      id: "demo-resource",
      is_demo: true,
    });
    const current = resourceFromCatalog({
      id: "current-resource",
      checkedAt: "2026-11-15T16:12:28.000Z",
    });

    const selection = selectOfficialResources(
      [pending, expired, demo, current],
      { now: NOW },
    );
    expect(selection.visible.map((item) => item.id)).toEqual([
      "current-resource",
    ]);
    expect(selection.excluded).toEqual(
      expect.arrayContaining([
        { id: "pending-resource", reason: "pending" },
        { id: "expired-resource", reason: "expired" },
        { id: "demo-resource", reason: "demo" },
      ]),
    );
  });

  it("calcula la vigencia de una revisión a 180 días", () => {
    const resource = resourceFromCatalog({
      checkedAt: "2026-11-15T16:12:28.000Z",
    });
    expect(reviewValidUntil(resource)).toBe("2027-05-14T16:12:28.000Z");
    expect(
      selectOfficialResources([resource], {
        now: new Date("2027-05-13T00:00:00.000Z"),
      }).visible,
    ).toHaveLength(1);
    expect(
      selectOfficialResources([resource], {
        now: new Date("2027-05-15T00:00:00.000Z"),
      }).visible,
    ).toHaveLength(0);
  });
});

describe("contexto público de navegación", () => {
  it("acepta una detección completa y normaliza la coordenada [lon, lat]", () => {
    const context = parseResponseContext(VALID_CONTEXT, NOW);
    expect(context.invalidFields).toEqual([]);
    expect(context.zone).toBe("south");
    expect(context.detection).toEqual({
      id: "demo-viirs-01",
      coordinates: [-70.53, 18.78],
      sensor: "VIIRS",
      satellite: "S-NPP",
      acquiredAt: "2025-03-04T17:45:00.000Z",
    });
  });

  it("mantiene la zona sin inventar una detección cuando solo hay zona", () => {
    const context = parseResponseContext({ zona: "north" }, NOW);
    expect(context.zone).toBe("north");
    expect(context.detection).toBeNull();
    expect(context.invalidFields).toEqual([]);
  });

  it("descarta el contexto incompleto, inválido o fuera del territorio", () => {
    const incomplete = parseResponseContext(
      { zona: "south", deteccion: "demo-1" },
      NOW,
    );
    expect(incomplete.detection).toBeNull();
    expect(incomplete.invalidFields).toEqual(
      expect.arrayContaining(["lat", "lon", "sensor", "satelite", "adquirido"]),
    );

    const outside = parseResponseContext(
      { ...VALID_CONTEXT, lat: "0", lon: "0" },
      NOW,
    );
    expect(outside.detection).toBeNull();
    expect(outside.invalidFields).toEqual(
      expect.arrayContaining(["lat", "lon"]),
    );

    const wrongSensor = parseResponseContext(
      { ...VALID_CONTEXT, sensor: "MODIS", satelite: "S-NPP" },
      NOW,
    );
    expect(wrongSensor.detection).toBeNull();
    expect(wrongSensor.invalidFields).toContain("satelite");

    const invalidZone = parseResponseContext(
      { ...VALID_CONTEXT, zona: "unknown" },
      NOW,
    );
    expect(invalidZone.zone).toBeNull();
    expect(invalidZone.invalidFields).toContain("zona");
    expect(invalidZone.detection).not.toBeNull();
  });

  it("rechaza adquisiciones futuras o parámetros repetidos", () => {
    const future = parseResponseContext(
      { ...VALID_CONTEXT, adquirido: "2030-01-01T00:00:00.000Z" },
      NOW,
    );
    expect(future.detection).toBeNull();
    expect(future.invalidFields).toContain("adquirido");

    const repeated = parseResponseContext(
      { ...VALID_CONTEXT, lat: ["18.78", "0"] },
      NOW,
    );
    expect(repeated.detection).toBeNull();
    expect(repeated.invalidFields).toContain("lat");
  });

  it("ignora correos y otros parámetros privados", () => {
    const context = parseResponseContext(
      {
        ...VALID_CONTEXT,
        correo: "private@example.com",
        email: "private@example.com",
        contacto: "+18090000000",
      },
      NOW,
    );
    expect(JSON.stringify(context)).not.toContain("private@example.com");
    expect(JSON.stringify(context)).not.toContain("18090000000");
    expect(context.invalidFields).toEqual([]);
  });

  it("construye una consulta canónica sin campos privados y la vuelve a leer", () => {
    const context = parseResponseContext(VALID_CONTEXT, NOW);
    expect(context.detection).not.toBeNull();
    if (!context.detection || !context.zone) return;

    const query = buildContextQuery({
      zone: context.zone,
      detection: context.detection,
    });
    expect(query).not.toContain("correo");
    expect(query).not.toContain("private");
    expect(query).toContain("zona=south");

    const reparsed = parseResponseContext(
      Object.fromEntries(new URLSearchParams(query)),
      NOW,
    );
    expect(reparsed.zone).toBe("south");
    expect(reparsed.detection).toEqual(context.detection);
    expect(reparsed.invalidFields).toEqual([]);
  });
});

describe("perfil estacional sintético", () => {
  it("usa los últimos años completos y lo marca como sintético", () => {
    const profile = buildPriorityProfile(0, { now: NOW, years: 10 });
    expect(profile.synthetic).toBe(true);
    expect(profile.fromYear).toBe(2016);
    expect(profile.toYear).toBe(2025);
    expect(profile.months).toHaveLength(12);
    expect(profile.priorityMonths).toHaveLength(3);
  });

  it("mantiene medianas dentro del rango y ordena las prioridades", () => {
    const profile = buildPriorityProfile(1, { now: NOW, years: 10 });
    for (const month of profile.months) {
      expect(month.years).toBe(10);
      expect(month.totals).toHaveLength(10);
      expect(month.median).toBeGreaterThanOrEqual(month.min);
      expect(month.median).toBeLessThanOrEqual(month.max);
      expect(month.p25).toBeLessThanOrEqual(month.p75);
    }
    const [first, second, third] = profile.priorityMonths;
    expect(first.median).toBeGreaterThanOrEqual(second.median);
    expect(second.median).toBeGreaterThanOrEqual(third.median);
    expect(
      new Set(profile.priorityMonths.map((month) => month.month)).size,
    ).toBe(3);
  });

  it("es determinista y rechaza zonas desconocidas", () => {
    expect(buildPriorityProfile(2, { now: NOW, years: 5 })).toEqual(
      buildPriorityProfile(2, { now: NOW, years: 5 }),
    );
    expect(() => buildPriorityProfile(99, { now: NOW })).toThrow(RangeError);
  });
});

describe("ficha compartible", () => {
  it("incluye recursos y no incluye contexto de detección ni datos privados", () => {
    const context = parseResponseContext(
      { ...VALID_CONTEXT, correo: "private@example.com" },
      NOW,
    );
    const profile = buildPriorityProfile(0, { now: NOW, years: 10 });
    const state = loadOfficialResourceCatalog(catalogJson, NOW);
    expect(state.status).toBe("ready");
    if (state.status !== "ready") return;

    const text = buildZoneSheet({
      zoneLabel: "Área de demostración",
      generatedAt: "15 nov 2026",
      periodLabel: `${profile.fromYear}–${profile.toYear}`,
      monthNames: [
        "Ene",
        "Feb",
        "Mar",
        "Abr",
        "May",
        "Jun",
        "Jul",
        "Ago",
        "Sep",
        "Oct",
        "Nov",
        "Dic",
      ],
      profile,
      resources: state.resources,
      labels: {
        title: "FICHA DE ZONA",
        generated: "Generada",
        zone: "Zona",
        period: "Período",
        synthetic: "Datos sintéticos",
        priority: "Meses prioritarios",
        median: "Mediana",
        range: "Rango",
        resources: "Recursos",
        reviewed: "Revisión",
        noPrivate: "Sin datos privados",
        emergency: "Llama al 9-1-1",
      },
    });

    expect(text).toContain("FICHA DE ZONA");
    expect(text).toContain("Recursos");
    expect(text).toContain("https://911.gob.do/como-usarlo/");
    expect(text).not.toContain("private@example.com");
    expect(text).not.toContain("correo");
    if (context.detection) {
      expect(text).not.toContain(context.detection.id);
      expect(text).not.toContain("18.78");
    }
  });
});
