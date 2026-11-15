import { z } from "zod";

export const chatRequestSchema = z.strictObject({
  sessionId: z.uuid().optional(),
  message: z.string().trim().min(1).max(4000),
  locale: z.enum(["es", "en"]).default("es"),
  context: z
    .strictObject({
      regionId: z.uuid().optional(),
      incidentId: z.uuid().optional(),
      location: z
        .strictObject({
          lat: z.number().min(-90).max(90),
          lon: z.number().min(-180).max(180),
        })
        .optional(),
    })
    .optional(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("session"),
    sessionId: z.uuid(),
    runId: z.uuid(),
    provider: z.string(),
    model: z.string(),
    demo: z.boolean(),
    storage: z.enum(["memory", "supabase"]),
  }),
  z.object({ type: z.literal("text_delta"), text: z.string() }),
  z.object({
    type: z.literal("tool"),
    name: z.string(),
    decision: z.enum(["allowed", "denied"]),
  }),
  z.object({
    type: z.literal("fallback"),
    provider: z.string(),
    model: z.string(),
  }),
  z.object({
    type: z.literal("done"),
    runId: z.uuid(),
    reason: z.enum(["stop", "length"]),
    usage: z.object({ input: z.number(), output: z.number() }),
  }),
  z.object({ type: z.literal("error"), code: z.string() }),
]);
export type ChatEvent = z.infer<typeof chatEventSchema>;
