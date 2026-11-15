import { z } from "zod";

export const observedSourceSchema = z.enum(["MODIS_NRT", "VIIRS_SNPP_NRT"]);
export const observedDetectionSchema = z.object({
  id: z.string(),
  sensor: z.enum(["MODIS", "VIIRS"]),
  satellite: z.string(),
  acquiredAt: z.iso.datetime(),
  coordinates: z.tuple([
    z.number().min(-180).max(180),
    z.number().min(-90).max(90),
  ]),
  confidence: z.string(),
  frpMw: z.number().nonnegative().nullable(),
  source: observedSourceSchema,
  is_demo: z.literal(false),
});
export const observedSnapshotSchema = z.object({
  origin: z.literal("observed"),
  downloadedAt: z.iso.datetime(),
  persisted: z.literal(false),
  coverage: z.literal("not_assessed"),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  products: z
    .array(
      z.object({
        source: observedSourceSchema,
        status: z.enum(["ok", "unavailable"]),
        from: z.iso.date().nullable(),
        through: z.iso.date().nullable(),
        records: z.number().int().nonnegative(),
      }),
    )
    .length(2),
  records: z.array(observedDetectionSchema).max(5000),
});
export type ObservedSnapshot = z.infer<typeof observedSnapshotSchema>;
export type ObservedDetection = z.infer<typeof observedDetectionSchema>;
