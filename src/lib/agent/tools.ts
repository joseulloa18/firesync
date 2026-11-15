import { readFile } from "node:fs/promises";
import { z } from "zod";
import { mapDemoDetections } from "@/content/map-demo";
import { AgentError, type ToolDefinition } from "./llm";
import { supabaseHeaders } from "./supabase-headers";

export type Actor = { role: "anonymous" | "user" | "coordinator" | "admin" };
export type AgentTool = {
  definition: ToolDefinition;
  roles: Actor["role"][];
  hasSideEffect: boolean;
  validate: (input: unknown) => boolean;
  execute: (input: unknown, signal: AbortSignal) => Promise<unknown>;
};

export function defineTool<I, O>(spec: {
  name: string;
  description: string;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  roles?: Actor["role"][];
  execute: (input: I, signal: AbortSignal) => Promise<O>;
}): AgentTool {
  return {
    definition: {
      name: spec.name,
      description: spec.description,
      inputSchema: z.toJSONSchema(spec.input),
    },
    roles: spec.roles ?? ["anonymous", "user", "coordinator", "admin"],
    hasSideEffect: false,
    validate: (input) => spec.input.safeParse(input).success,
    execute: async (input, signal) =>
      spec.output.parse(await spec.execute(spec.input.parse(input), signal)),
  };
}

const missingSchema = z.object({
  status: z.literal("unavailable"),
  reason: z.string(),
});
const missing = (reason: string): z.infer<typeof missingSchema> => ({
  status: "unavailable",
  reason,
});
const detectionSchema = z.object({
  id: z.union([z.string(), z.number()]),
  acqAt: z.iso.datetime(),
  sensor: z.enum(["MODIS", "VIIRS"]),
  satellite: z.string(),
  confidence: z.union([z.number(), z.enum(["low", "nominal", "high"])]),
  source: z.string(),
  isNrt: z.boolean(),
  is_demo: z.boolean(),
});
const dbDetectionSchema = z.object({
  id: z.union([z.string(), z.number()]),
  acq_at: z.iso.datetime({ offset: true }),
  sensor: z.enum(["MODIS", "VIIRS"]),
  satellite: z.string(),
  confidence: z.enum(["low", "nominal", "high"]),
  source: z.string(),
});
const statsRowSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  harmonized_index: z.number().nullable(),
  is_partial: z.boolean(),
  uses_nrt: z.boolean(),
  method_version: z.string(),
  computed_at: z.iso.datetime({ offset: true }),
});
const resourceSchema = z.object({
  title: z.string(),
  url: z.url(),
  organization: z.string(),
  category: z.string(),
  verified_at: z.iso.datetime({ offset: true }),
});
export const guidanceSchema = z.object({
  topic: z.string(),
  locale: z.enum(["es", "en"]),
  text: z.string().min(1).max(6000),
  sourceUrl: z.url(),
  reviewer: z.string().min(1),
  reviewedAt: z.iso.date(),
});

/** Fixed public tables and columns only; no private contacts or user zones. */
export class PublicDataSource {
  constructor(
    private readonly url?: string,
    private readonly anonKey?: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async rows<T>(
    table: "raw_detections" | "region_month_stats" | "prevention_resources",
    query: URLSearchParams,
    row: z.ZodType<T>,
    signal: AbortSignal,
  ): Promise<T[] | null> {
    if (!this.url || !this.anonKey) return null;
    try {
      const response = await this.fetcher(
        `${this.url.replace(/\/$/, "")}/rest/v1/${table}?${query}`,
        {
          headers: supabaseHeaders(this.anonKey),
          signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
          redirect: "error",
          cache: "no-store",
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        return null;
      }
      const result = z
        .array(row)
        .max(100)
        .safeParse(await response.json());
      return result.success ? result.data : null;
    } catch {
      signal.throwIfAborted();
      return null;
    }
  }
}

export function createSupportTools(options: {
  demo: boolean;
  data?: PublicDataSource;
  now?: () => Date;
  loadGuidance?: () => Promise<unknown>;
}): AgentTool[] {
  const data = options.data ?? new PublicDataSource();
  const now = options.now ?? (() => new Date());
  const loadGuidance =
    options.loadGuidance ??
    (async () => {
      try {
        return JSON.parse(
          await readFile("kb/primeros-auxilios/index.json", "utf8"),
        ) as unknown;
      } catch {
        return [];
      }
    });
  return [
    defineTool({
      name: "get_recent_detections",
      description:
        "Read detections in a WGS84 bbox [west,south,east,north]. In demo mode the reference date is 2025-03-25 UTC, not today. A detection is not a confirmed fire.",
      input: z
        .strictObject({
          bbox: z
            .tuple([
              z.number().min(-180).max(180),
              z.number().min(-90).max(90),
              z.number().min(-180).max(180),
              z.number().min(-90).max(90),
            ])
            .optional(),
          incidentId: z.uuid().optional(),
          hours: z.number().int().min(1).max(168).default(72),
        })
        .refine((value) => Boolean(value.bbox) !== Boolean(value.incidentId))
        .refine(
          (value) =>
            !value.bbox ||
            (value.bbox[0] < value.bbox[2] && value.bbox[1] < value.bbox[3]),
        ),
      output: z.union([
        missingSchema,
        z.object({
          status: z.enum(["available", "demo"]),
          is_demo: z.boolean(),
          period: z.object({ from: z.iso.datetime(), to: z.iso.datetime() }),
          truncated: z.boolean(),
          items: z.array(detectionSchema).max(100),
          sourceNote: z.string(),
        }),
      ]),
      execute: async (input, signal) => {
        if (!input.bbox)
          return missing("Incident-to-detection lookup is not connected.");
        const [west, south, east, north] = input.bbox;
        const end = options.demo ? new Date("2025-03-25T00:00:00.000Z") : now();
        const start = new Date(end.getTime() - input.hours * 3_600_000);
        const period = { from: start.toISOString(), to: end.toISOString() };
        let items: z.infer<typeof detectionSchema>[];
        if (options.demo) {
          items = mapDemoDetections
            .filter(
              (item) =>
                item.coordinates[0] >= west &&
                item.coordinates[0] <= east &&
                item.coordinates[1] >= south &&
                item.coordinates[1] <= north &&
                new Date(item.acquiredAt) >= start &&
                new Date(item.acquiredAt) <= end,
            )
            .map((item) => ({
              id: item.id,
              acqAt: item.acquiredAt,
              sensor: item.sensor,
              satellite: item.satellite,
              confidence: item.confidence,
              source: "synthetic-interface-fixture",
              isNrt: false,
              is_demo: true,
            }));
        } else {
          const query = new URLSearchParams({
            select: "id,acq_at,sensor,satellite,confidence,source",
            and: `(longitude.gte.${west},longitude.lte.${east},latitude.gte.${south},latitude.lte.${north},acq_at.gte.${period.from},acq_at.lte.${period.to})`,
            order: "acq_at.desc,id.desc",
            limit: "100",
          });
          const rows = await data.rows(
            "raw_detections",
            query,
            dbDetectionSchema,
            signal,
          );
          if (!rows)
            return missing(
              "Detection storage is not connected or its response could not be validated. This is not evidence of no fires.",
            );
          items = rows.map((row) => ({
            id: row.id,
            acqAt: new Date(row.acq_at).toISOString(),
            sensor: row.sensor,
            satellite: row.satellite,
            confidence: row.confidence,
            source: row.source,
            isNrt: row.source.endsWith("_NRT"),
            is_demo: false,
          }));
        }
        return {
          status: options.demo ? "demo" : "available",
          is_demo: options.demo,
          period,
          truncated: items.length > 20,
          items: items.slice(0, 20),
          sourceNote: options.demo
            ? "Fictitious demonstration records, with a fixed demonstration clock. Not NASA observations or current conditions. A satellite detection is not a confirmed fire."
            : "NASA FIRMS stored observations, not a confirmed fire. Missing ingestion coverage cannot establish no fires. Acquisition time is not ingestion freshness.",
        };
      },
    }),
    defineTool({
      name: "get_region_context",
      description:
        "Read stored monthly history for a real region UUID. Missing history is unavailable, never zero. This does not predict fires or certify scientific calibration.",
      input: z.strictObject({
        regionId: z.uuid(),
        month: z.number().int().min(1).max(12),
      }),
      output: z.union([
        missingSchema,
        z.object({
          status: z.literal("available"),
          is_demo: z.literal(false),
          unit: z.string(),
          observations: z.array(statsRowSchema).max(60),
        }),
      ]),
      execute: async (input, signal) => {
        if (options.demo)
          return missing(
            "No validated regional history is connected in demo mode. The visual calendar is synthetic and has no calibrated physical index.",
          );
        const rows = await data.rows(
          "region_month_stats",
          new URLSearchParams({
            select:
              "year,month,harmonized_index,is_partial,uses_nrt,method_version,computed_at",
            region_id: `eq.${input.regionId}`,
            month: `eq.${input.month}`,
            order: "year.desc",
            limit: "60",
          }),
          statsRowSchema,
          signal,
        );
        return !rows?.length
          ? missing(
              "No validated regional history was returned. Coverage and calibration still require verification.",
            )
          : {
              status: "available",
              is_demo: false,
              unit: "cell-days with detection, MODIS equivalent; see method_version",
              observations: rows,
            };
      },
    }),
    defineTool({
      name: "get_first_aid_guidance",
      description:
        "Fetch ONLY reviewed knowledge-base excerpts with source, reviewer and date. If unavailable, do not substitute medical instructions from model memory.",
      input: z.strictObject({
        topic: z.string().trim().min(1).max(100),
        locale: z.enum(["es", "en"]),
      }),
      output: z.union([
        missingSchema,
        z.object({
          status: z.literal("available"),
          excerpts: z.array(guidanceSchema).max(5),
        }),
      ]),
      execute: async (input) => {
        const parsed = z
          .array(guidanceSchema)
          .max(100)
          .safeParse(await loadGuidance());
        if (!parsed.success)
          return missing(
            "The reviewed knowledge base did not pass validation.",
          );
        const excerpts = parsed.data
          .filter(
            (item) =>
              item.topic === input.topic &&
              item.locale === input.locale &&
              item.reviewedAt <= now().toISOString().slice(0, 10),
          )
          .slice(0, 5);
        return excerpts.length
          ? { status: "available", excerpts }
          : missing(
              "No reviewed first-aid content is loaded for this topic and language. Contact emergency or medical services; in the Dominican Republic call 9-1-1.",
            );
      },
    }),
    defineTool({
      name: "get_prevention_resources",
      description:
        "Read team-loaded, reviewed official prevention resources. Unreviewed rows are excluded. Does not create or confirm events.",
      input: z.strictObject({
        regionId: z.uuid(),
        category: z.enum([
          "prevencion",
          "extincion",
          "reporte",
          "primeros_auxilios",
        ]),
      }),
      output: z.union([
        missingSchema,
        z.object({
          status: z.literal("available"),
          resources: z.array(resourceSchema).max(30),
        }),
      ]),
      execute: async (input, signal) => {
        if (options.demo)
          return missing(
            "No reviewed official resource catalog is connected in demo mode.",
          );
        const rows = await data.rows(
          "prevention_resources",
          new URLSearchParams({
            select: "title,url,organization,category,verified_at",
            region_id: `eq.${input.regionId}`,
            category: `eq.${input.category}`,
            verified_at: "not.is.null",
            limit: "30",
          }),
          resourceSchema,
          signal,
        );
        return rows?.length
          ? { status: "available", resources: rows }
          : missing(
              "Reviewed prevention resources are unavailable for this region/category.",
            );
      },
    }),
  ];
}

/** The model cannot override this policy by naming an action or claiming a role. */
export function checkToolPolicy(
  tool: AgentTool | undefined,
  actor: Actor,
): "allowed" | "denied" {
  if (!tool || tool.hasSideEffect || !tool.roles.includes(actor.role))
    return "denied";
  return "allowed";
}

export function toolError(error: unknown) {
  return {
    status: "error",
    code: error instanceof AgentError ? error.code : "TOOL_UNAVAILABLE",
  };
}
