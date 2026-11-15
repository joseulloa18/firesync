import { healthSchema, parseConfig } from "@/lib/config";
export const dynamic = "force-dynamic";
export function GET() {
  const config = parseConfig(process.env);
  return Response.json(
    healthSchema.parse({
      status: "ok",
      mode: config.DEMO_MODE ? "demo" : "unconnected",
      database: "not_connected",
      lastIngestAt: null,
      email: "disabled",
    }),
  );
}
