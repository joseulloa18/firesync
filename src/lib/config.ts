import { z } from "zod";

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);
const schema = z
  .object({
    DEMO_MODE: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    APP_BASE_URL: z.url().default("http://localhost:3000"),
    NEXT_PUBLIC_SUPABASE_URL: optionalSecret,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalSecret,
    SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
    DATABASE_URL: optionalSecret,
    FIRMS_MAP_KEY: optionalSecret,
    CRON_SECRET: optionalSecret,
    AGENT_AUTONOMY: z.enum(["suggest", "auto"]).default("suggest"),
  })
  .superRefine((config, context) => {
    if (!config.DEMO_MODE) {
      for (const key of [
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "DATABASE_URL",
        "FIRMS_MAP_KEY",
        "CRON_SECRET",
      ] as const) {
        if (!config[key])
          context.addIssue({
            code: "custom",
            path: [key],
            message: "Required when DEMO_MODE=false",
          });
      }
    }
  });

// Never include input values in errors: they can contain credentials.
export function parseConfig(env: Record<string, string | undefined>) {
  const result = schema.safeParse(env);
  if (!result.success)
    throw new Error(
      `Invalid configuration: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
    );
  return result.data;
}
export const healthSchema = z.object({
  status: z.literal("ok"),
  mode: z.enum(["demo", "unconnected"]),
  database: z.literal("not_connected"),
  lastIngestAt: z.null(),
  email: z.literal("disabled"),
});
