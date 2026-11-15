import { FirmsCsvError } from "./types";
import type { FirmsProduct } from "./types";

const MODIS_SATELLITES = ["Terra", "Aqua"] as const;

const PRODUCTS: readonly FirmsProduct[] = [
  {
    source: "MODIS_SP",
    sensor: "MODIS",
    isNrt: false,
    historicalSeries: true,
    allowedSatellites: MODIS_SATELLITES,
  },
  {
    source: "MODIS_NRT",
    sensor: "MODIS",
    isNrt: true,
    historicalSeries: false,
    allowedSatellites: MODIS_SATELLITES,
  },
  {
    source: "VIIRS_SNPP_SP",
    sensor: "VIIRS",
    isNrt: false,
    historicalSeries: true,
    allowedSatellites: ["S-NPP"],
  },
  {
    source: "VIIRS_SNPP_NRT",
    sensor: "VIIRS",
    isNrt: true,
    historicalSeries: true,
    allowedSatellites: ["S-NPP"],
  },
  {
    source: "VIIRS_NOAA20_SP",
    sensor: "VIIRS",
    isNrt: false,
    historicalSeries: false,
    allowedSatellites: ["NOAA-20"],
  },
  {
    source: "VIIRS_NOAA20_NRT",
    sensor: "VIIRS",
    isNrt: true,
    historicalSeries: false,
    allowedSatellites: ["NOAA-20"],
  },
  {
    source: "VIIRS_NOAA21_SP",
    sensor: "VIIRS",
    isNrt: false,
    historicalSeries: false,
    allowedSatellites: ["NOAA-21"],
  },
  {
    source: "VIIRS_NOAA21_NRT",
    sensor: "VIIRS",
    isNrt: true,
    historicalSeries: false,
    allowedSatellites: ["NOAA-21"],
  },
];

const PRODUCT_BY_SOURCE = new Map(
  PRODUCTS.map((product) => [product.source, product]),
);

const SATELLITE_ALIASES = new Map<string, string>([
  ["terra", "Terra"],
  ["aqua", "Aqua"],
  ["snpp", "S-NPP"],
  ["s-npp", "S-NPP"],
  ["npp", "S-NPP"],
  ["n", "S-NPP"],
  ["noaa20", "NOAA-20"],
  ["noaa-20", "NOAA-20"],
  ["noaa_20", "NOAA-20"],
  ["n20", "NOAA-20"],
  ["noaa21", "NOAA-21"],
  ["noaa-21", "NOAA-21"],
  ["noaa_21", "NOAA-21"],
  ["n21", "NOAA-21"],
]);

export function resolveFirmsProduct(source: string): FirmsProduct {
  const normalized = source.trim().toUpperCase();
  const product = PRODUCT_BY_SOURCE.get(normalized);
  if (product === undefined) {
    throw new FirmsCsvError(
      "unknown_source",
      `Unknown FIRMS source "${source}". Provide an explicit product such as MODIS_SP or VIIRS_SNPP_SP.`,
    );
  }
  return product;
}

export function canonicalSatelliteName(
  satellite: string | null | undefined,
): string | null {
  if (satellite === null || satellite === undefined) {
    return null;
  }
  const key = satellite.trim().toLowerCase().replace(/\s+/g, "");
  return SATELLITE_ALIASES.get(key) ?? null;
}

export function isViirsSnpp(satellite: string): boolean {
  return canonicalSatelliteName(satellite) === "S-NPP";
}

export function listFirmsProducts(): readonly FirmsProduct[] {
  return PRODUCTS;
}
