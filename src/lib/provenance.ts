import { z } from "zod";

const isoDateTime = z.iso.datetime({ offset: true });

export const provenanceSchema = z.object({
  source: z.literal("synthetic-fixture"),
  expectedProvider: z.literal("NASA FIRMS"),
  expectedProviderConnected: z.literal(false),
  visibleRecords: z.number().int().nonnegative(),
  newestAcquiredAt: isoDateTime.nullable(),
  lastIngestionAt: isoDateTime.nullable(),
  status: z.enum(["ready", "noData"]),
});

export type Provenance = z.infer<typeof provenanceSchema>;

type AcquiredRecord = { acquiredAt: string };

/** Normaliza una fecha ISO; cualquier valor inválido o ausente queda en null. */
function validIsoOrNull(value: string | null | undefined): string | null {
  if (!value || !isoDateTime.safeParse(value).success) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : null;
}

/** Mayor acquiredAt entre los registros dados, ignorando fechas inválidas. */
export function newestAcquisition(
  records: readonly AcquiredRecord[],
): string | null {
  let newest: number | null = null;
  for (const record of records) {
    if (!isoDateTime.safeParse(record.acquiredAt).success) continue;
    const milliseconds = Date.parse(record.acquiredAt);
    if (!Number.isFinite(milliseconds)) continue;
    if (newest === null || milliseconds > newest) newest = milliseconds;
  }
  return newest === null ? null : new Date(newest).toISOString();
}

/**
 * Procedencia del prototipo: fixture sintético, NASA FIRMS previsto pero no
 * conectado y sin fecha de ingesta real. Nunca usa Date.now como descarga.
 */
export function createSyntheticProvenance(
  records: readonly AcquiredRecord[],
  lastIngestionAt: string | null = null,
): Provenance {
  const newestAcquiredAt = newestAcquisition(records);
  return provenanceSchema.parse({
    source: "synthetic-fixture",
    expectedProvider: "NASA FIRMS",
    expectedProviderConnected: false,
    visibleRecords: records.length,
    newestAcquiredAt,
    lastIngestionAt: validIsoOrNull(lastIngestionAt),
    status: newestAcquiredAt ? "ready" : "noData",
  });
}
