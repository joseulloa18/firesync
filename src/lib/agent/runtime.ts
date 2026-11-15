import { randomBytes, createHash, createHmac } from "node:crypto";
import { parseAgentConfig, type AgentConfig } from "./config";
import { MemoryAuditStore, type AuditStore } from "./audit";
import { SupabaseAuditStore } from "./supabase-audit";
import { MetaLLMProvider } from "./providers/meta";
import { MockLLMProvider } from "./providers/mock";
import { createSupportTools, PublicDataSource } from "./tools";

let audit: AuditStore | undefined;
let storageSettings: { kind: string; url?: string; key?: string } | undefined;
const localRateSecret = randomBytes(32).toString("hex");

export function getAgentRuntime() {
  const config = parseAgentConfig(process.env);
  if (
    !audit ||
    storageSettings?.kind !== config.AGENT_STORAGE ||
    storageSettings?.url !== config.NEXT_PUBLIC_SUPABASE_URL ||
    storageSettings?.key !== config.supabaseKey
  ) {
    audit =
      config.AGENT_STORAGE === "supabase"
        ? new SupabaseAuditStore(
            config.NEXT_PUBLIC_SUPABASE_URL!,
            config.supabaseKey!,
          )
        : new MemoryAuditStore();
    storageSettings = {
      kind: config.AGENT_STORAGE,
      url: config.NEXT_PUBLIC_SUPABASE_URL,
      key: config.supabaseKey,
    };
  }
  return {
    config,
    audit,
    provider:
      config.LLM_PROVIDER === "meta"
        ? new MetaLLMProvider(config.model, config.apiKey!)
        : new MockLLMProvider(),
    fallback: config.LLM_FALLBACK_PROVIDER
      ? new MetaLLMProvider(
          config.LLM_FALLBACK_MODEL!,
          config.LLM_FALLBACK_API_KEY!,
        )
      : undefined,
    tools: createSupportTools({
      demo: config.demo,
      data: new PublicDataSource(
        config.NEXT_PUBLIC_SUPABASE_URL,
        config.publicKey,
      ),
    }),
  };
}

export function sessionToken(request: Request) {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("firesync_agent="))
    ?.slice("firesync_agent=".length);
  return cookie && /^[a-f0-9]{64}$/.test(cookie)
    ? cookie
    : randomBytes(32).toString("hex");
}
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export function rateLimitKey(request: Request, config: AgentConfig) {
  // Only the platform-owned header is trusted. Self-hosted deployments share a
  // conservative bucket until a trusted proxy integration is configured.
  const ip =
    process.env.VERCEL === "1"
      ? (request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
        "unknown")
      : "local-or-unverified-proxy";
  return createHmac("sha256", config.AGENT_RATE_LIMIT_SECRET ?? localRateSecret)
    .update(`${new Date().toISOString().slice(0, 10)}:${ip}`)
    .digest("hex");
}
