import { z } from "zod";
import { AgentError } from "./llm";

const optionalText = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);
const schema = z.object({
  LLM_PROVIDER: z.enum(["mock", "meta"]).default("mock"),
  LLM_MODEL: optionalText,
  LLM_API_KEY: optionalText,
  MODEL_API_KEY: optionalText,
  META_API_KEY: optionalText,
  LLM_FALLBACK_PROVIDER: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.literal("meta").optional(),
  ),
  LLM_FALLBACK_MODEL: optionalText,
  LLM_FALLBACK_API_KEY: optionalText,
  AGENT_STORAGE: z.enum(["memory", "supabase"]).default("memory"),
  AGENT_RATE_LIMIT_SECRET: optionalText,
  NEXT_PUBLIC_SUPABASE_URL: optionalText,
  SUPABASE_SERVICE_ROLE_KEY: optionalText,
  APP_BASE_URL: z.url().default("http://localhost:3000"),
  DEMO_MODE: z.enum(["true", "false"]).default("true"),
  NODE_ENV: z.string().optional(),
});

export function parseAgentConfig(env: Record<string, string | undefined>) {
  const result = schema.safeParse(env);
  if (!result.success) throw new AgentError("AGENT_CONFIG_INVALID");
  const data = result.data;
  const apiKey = data.LLM_API_KEY ?? data.MODEL_API_KEY ?? data.META_API_KEY;
  const model =
    data.LLM_MODEL ??
    (data.LLM_PROVIDER === "meta" ? "muse-spark-1.3" : "firesync-mock-v1");
  // Contributor variants change data handling. Only standard models are enabled.
  const metaModels = [
    "muse-spark-1.3",
    "muse-spark-1.2",
    "muse-spark-1.1",
    "muse-ember-1.0",
    "muse-wonder-1.0",
  ];
  if (data.LLM_PROVIDER === "meta" && (!apiKey || !metaModels.includes(model)))
    throw new AgentError("META_CONFIG_REQUIRED");
  const fallbackSet = [
    data.LLM_FALLBACK_PROVIDER,
    data.LLM_FALLBACK_MODEL,
    data.LLM_FALLBACK_API_KEY,
  ];
  if (
    fallbackSet.some(Boolean) &&
    (!fallbackSet.every(Boolean) ||
      !metaModels.includes(data.LLM_FALLBACK_MODEL!))
  )
    throw new AgentError("FALLBACK_CONFIG_INVALID");
  if (data.AGENT_STORAGE === "supabase") {
    if (!data.NEXT_PUBLIC_SUPABASE_URL || !data.SUPABASE_SERVICE_ROLE_KEY)
      throw new AgentError("AGENT_STORAGE_CONFIG_REQUIRED");
    try {
      const url = new URL(data.NEXT_PUBLIC_SUPABASE_URL);
      if (url.protocol !== "https:" || url.username || url.password)
        throw new Error();
    } catch {
      throw new AgentError("AGENT_STORAGE_CONFIG_REQUIRED");
    }
  }
  const realModel =
    data.LLM_PROVIDER === "meta" || Boolean(data.LLM_FALLBACK_PROVIDER);
  if (
    data.NODE_ENV === "production" &&
    realModel &&
    (data.AGENT_STORAGE !== "supabase" ||
      (data.AGENT_RATE_LIMIT_SECRET?.length ?? 0) < 32)
  )
    throw new AgentError("AGENT_PRODUCTION_STORAGE_REQUIRED");
  if (data.DEMO_MODE === "false" && data.LLM_PROVIDER === "mock")
    throw new AgentError("MOCK_REQUIRES_DEMO_MODE");
  return { ...data, apiKey, model, demo: data.DEMO_MODE === "true" };
}

export type AgentConfig = ReturnType<typeof parseAgentConfig>;
