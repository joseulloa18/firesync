import { describe, expect, it, vi } from "vitest";
import { SupabaseAuditStore } from "@/lib/agent/supabase-audit";
import { PublicDataSource, createSupportTools } from "@/lib/agent/tools";
import { parseAgentConfig } from "@/lib/agent/config";

const runId = "176cb59e-5e72-44bc-a9c3-79d7ab0098f4";
const sessionId = "a9b6a90e-4125-4da8-91f7-b8cef660706a";

describe("Supabase audit transport", () => {
  it("accepts modern server keys without treating them as JWTs", async () => {
    const key = "sb_secret_DEMO_TEST_ONLY";
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json([
        {
          id: runId,
          session_id: sessionId,
          provider: "meta",
          model: "muse-spark-1.3",
        },
      ]),
    );
    const store = new SupabaseAuditStore(
      "https://project.supabase.co",
      key,
      fetcher,
    );
    await store.openTurn({
      tokenHash: "a".repeat(64),
      ipHash: "b".repeat(64),
      provider: "meta",
      model: "muse-spark-1.3",
    });
    expect(fetcher.mock.calls[0][1]!.headers).toMatchObject({ apikey: key });
    expect(fetcher.mock.calls[0][1]!.headers).not.toHaveProperty(
      "Authorization",
    );
  });
  it("normalizes current Supabase environment names and rejects exchanged key scopes", () => {
    const env = {
      NODE_ENV: "production",
      LLM_PROVIDER: "meta",
      LLM_API_KEY: "DEMO-model-key",
      AGENT_STORAGE: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_DEMO_TEST_ONLY",
      SUPABASE_SECRET_KEY: "sb_secret_DEMO_TEST_ONLY",
      AGENT_RATE_LIMIT_SECRET: "d".repeat(32),
    };
    expect(parseAgentConfig(env)).toMatchObject({
      publicKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      supabaseKey: env.SUPABASE_SECRET_KEY,
    });
    expect(() =>
      parseAgentConfig({
        ...env,
        SUPABASE_SECRET_KEY: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      }),
    ).toThrow("AGENT_STORAGE_CONFIG_REQUIRED");
    expect(() =>
      parseAgentConfig({
        ...env,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_SECRET_KEY,
      }),
    ).toThrow("AGENT_STORAGE_CONFIG_REQUIRED");
  });
  it("claims a turn through the atomic server-only RPC and stores audited messages", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json([
          {
            id: runId,
            session_id: sessionId,
            provider: "meta",
            model: "muse-spark-1.3",
          },
        ]),
      )
      .mockResolvedValueOnce(
        Response.json([
          { role: "user", content: { text: "Previous question" } },
          { role: "assistant", content: { text: "Previous answer" } },
        ]),
      )
      .mockResolvedValue(new Response(null, { status: 204 }));
    const store = new SupabaseAuditStore(
      "https://project.supabase.co",
      "server-only-secret",
      fetcher,
    );
    const run = await store.openTurn({
      tokenHash: "t".repeat(64),
      ipHash: "a".repeat(64),
      provider: "meta",
      model: "muse-spark-1.3",
    });
    expect(run).toMatchObject({ id: runId, sessionId });
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://project.supabase.co/rest/v1/rpc/agent_open_chat",
    );
    const options = fetcher.mock.calls[0][1]!;
    expect(options.headers).toMatchObject({
      Authorization: "Bearer server-only-secret",
    });
    expect(JSON.parse(options.body as string)).toMatchObject({
      p_token_hash: "t".repeat(64),
      p_ip_hash: "a".repeat(64),
      p_expected_session_id: null,
    });
    expect(await store.history(sessionId)).toEqual([
      { role: "user", content: "Previous question" },
      { role: "assistant", content: "Previous answer" },
    ]);
    await store.message(run, { role: "assistant", content: "Answer" });
    await store.tool(run, {
      tool: "get_region_context",
      input: {},
      output: { status: "unavailable" },
      hasSideEffect: false,
      decision: "allowed",
    });
    await store.finish(run, "completed", { input: 100, output: 20 });
    expect(
      JSON.parse(fetcher.mock.calls.at(-1)![1]!.body as string),
    ).toMatchObject({ status: "completed", tokens_in: 100, tokens_out: 20 });
  });
  it("does not downgrade durable audit failure to a local success", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("database diagnostics containing server-only-secret", {
        status: 500,
      }),
    );
    const store = new SupabaseAuditStore(
      "https://project.supabase.co",
      "server-only-secret",
      fetcher,
    );
    const promise = store.openTurn({
      tokenHash: "t",
      ipHash: "i",
      provider: "meta",
      model: "muse-spark-1.3",
    });
    await expect(promise).rejects.toThrow("AUDIT_UNAVAILABLE");
    await expect(promise).rejects.not.toThrow("server-only-secret");
  });
  it("accepts a production configuration only with persistent storage and rate-limit secret", () => {
    expect(
      parseAgentConfig({
        NODE_ENV: "production",
        LLM_PROVIDER: "meta",
        LLM_API_KEY: "server-only-secret",
        AGENT_STORAGE: "supabase",
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "db-key",
        AGENT_RATE_LIMIT_SECRET: "x".repeat(32),
      }).AGENT_STORAGE,
    ).toBe("supabase");
  });
});

describe("public data transport", () => {
  it("uses a publishable key only in the API-key header", async () => {
    const key = "sb_publishable_DEMO_TEST_ONLY";
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([]));
    const source = new PublicDataSource(
      "https://project.supabase.co",
      key,
      fetcher,
    );
    const tool = createSupportTools({ demo: false, data: source }).find(
      (tool) => tool.definition.name === "get_recent_detections",
    )!;
    expect(
      await tool.execute(
        { bbox: [-73, 17, -67, 21], hours: 24 },
        new AbortController().signal,
      ),
    ).toMatchObject({ status: "available", items: [] });
    expect(fetcher.mock.calls[0][1]!.headers).toEqual({ apikey: key });
  });
  it("selects only public detection columns and preserves sensor/time/source/confidence", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json([
        {
          id: 1,
          acq_at: "2026-11-15T12:00:00+00:00",
          sensor: "VIIRS",
          satellite: "S-NPP",
          confidence: "high",
          source: "VIIRS_SNPP_NRT",
          email: "must-not-be-forwarded@example.org",
        },
      ]),
    );
    const source = new PublicDataSource(
      "https://project.supabase.co",
      "public-key",
      fetcher,
    );
    const tool = createSupportTools({
      demo: false,
      data: source,
      now: () => new Date("2026-11-15T13:00:00Z"),
    }).find((tool) => tool.definition.name === "get_recent_detections")!;
    const result = await tool.execute(
      { bbox: [-73, 17, -67, 21], hours: 24 },
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      status: "available",
      is_demo: false,
      items: [
        {
          sensor: "VIIRS",
          acqAt: "2026-11-15T12:00:00.000Z",
          confidence: "high",
          source: "VIIRS_SNPP_NRT",
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("must-not-be-forwarded");
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.searchParams.get("select")).toBe(
      "id,acq_at,sensor,satellite,confidence,source",
    );
    expect(url.searchParams.get("and")).toContain(
      "acq_at.gte.2026-11-14T13:00:00.000Z",
    );
  });
  it("returns unavailable for invalid upstream data, without inventing zero detections", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json([{ sensor: "unknown" }]));
    const source = new PublicDataSource(
      "https://project.supabase.co",
      "public-key",
      fetcher,
    );
    const tool = createSupportTools({ demo: false, data: source }).find(
      (tool) => tool.definition.name === "get_recent_detections",
    )!;
    expect(
      await tool.execute(
        { bbox: [-73, 17, -67, 21], hours: 24 },
        new AbortController().signal,
      ),
    ).toMatchObject({ status: "unavailable" });
  });
});
