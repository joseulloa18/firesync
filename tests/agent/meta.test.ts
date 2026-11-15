import { describe, expect, it, vi } from "vitest";
import { MetaLLMProvider } from "@/lib/agent/providers/meta";
import { AgentError, type GenerateInput } from "@/lib/agent/llm";
import { parseAgentConfig } from "@/lib/agent/config";
import { readSse } from "@/lib/agent/sse";

export function streamResponse(frames: unknown[], done = true) {
  const text =
    ": keepalive\r\n\r\n" +
    frames.map((frame) => `data: ${JSON.stringify(frame)}\r\n\r\n`).join("") +
    (done ? "data: [DONE]\r\n\r\n" : "");
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        // Deliberately split UTF-8 code points and event boundaries.
        for (let i = 0; i < bytes.length; i += 3)
          controller.enqueue(bytes.slice(i, i + 3));
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}
const input = (): GenerateInput => ({
  system: "Trusted FireSync rules",
  messages: [{ role: "user", content: "Hola" }],
  tools: [],
  maxTokens: 1024,
  signal: new AbortController().signal,
});
async function collect(provider: MetaLLMProvider, request = input()) {
  return Array.fromAsync(provider.generate(request));
}

describe("Meta Model API adapter", () => {
  it("uses the direct Meta API and streams answer text without reasoning or credentials", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      streamResponse([
        {
          choices: [
            {
              index: 0,
              delta: {
                reasoning_content: "private reasoning",
                content: "Detección ",
              },
              finish_reason: null,
            },
          ],
        },
        {
          choices: [
            {
              index: 0,
              delta: { content: "satélital" },
              finish_reason: "stop",
            },
          ],
        },
        { choices: [], usage: { prompt_tokens: 40, completion_tokens: 12 } },
      ]),
    );
    const result = await collect(
      new MetaLLMProvider("muse-spark-1.3", "secret-key", fetcher),
    );
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://api.meta.ai/v1/chat/completions",
    );
    const options = fetcher.mock.calls[0][1]!;
    expect(options.headers).toMatchObject({
      Authorization: "Bearer secret-key",
    });
    expect(JSON.parse(options.body as string)).toMatchObject({
      model: "muse-spark-1.3",
      max_completion_tokens: 1024,
      reasoning_effort: "low",
      store: false,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: "developer", content: "Trusted FireSync rules" },
        { role: "user", content: "Hola" },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("private reasoning");
    expect(JSON.stringify(result)).not.toContain("secret-key");
    expect(result).toContainEqual({
      type: "usage",
      usage: { input: 40, output: 12 },
    });
    expect(result.at(-1)).toEqual({ type: "finish", reason: "stop" });
  });
  it("assembles streamed function arguments and maps tool history back to Meta", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      streamResponse([
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call-1",
                    function: {
                      name: "get_first_aid_guidance",
                      arguments: '{"topic":"humo",',
                    },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  { index: 0, function: { arguments: '"locale":"es"}' } },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        },
      ]),
    );
    const request = input();
    request.messages.push(
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "previous", name: "lookup", arguments: {} }],
      },
      {
        role: "tool",
        toolCallId: "previous",
        content: '{"status":"unavailable"}',
      },
    );
    const result = await collect(
      new MetaLLMProvider("muse-spark-1.3", "key", fetcher),
      request,
    );
    expect(result).toContainEqual({
      type: "tool_call",
      call: {
        id: "call-1",
        name: "get_first_aid_guidance",
        arguments: { topic: "humo", locale: "es" },
      },
    });
    expect(
      JSON.parse(fetcher.mock.calls[0][1]!.body as string).messages,
    ).toContainEqual({
      role: "tool",
      content: '{"status":"unavailable"}',
      tool_call_id: "previous",
    });
  });
  it.each([401, 403, 429, 500])(
    "returns sanitized errors for HTTP %i",
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response("secret-key upstream diagnostics", { status }),
        );
      const promise = collect(
        new MetaLLMProvider("muse-spark-1.3", "secret-key", fetcher),
      );
      await expect(promise).rejects.toBeInstanceOf(AgentError);
      await expect(promise).rejects.not.toThrow("secret-key");
    },
  );
  it("rejects truncated streams and invalid arguments", async () => {
    for (const response of [
      streamResponse(
        [{ choices: [{ index: 0, delta: { content: "Partial" } }] }],
        false,
      ),
      streamResponse([
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "x",
                    function: { name: "lookup", arguments: "invalid-json" },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        },
      ]),
    ]) {
      await expect(
        collect(
          new MetaLLMProvider(
            "muse-spark-1.3",
            "key",
            vi.fn<typeof fetch>().mockResolvedValue(response),
          ),
        ),
      ).rejects.toBeInstanceOf(AgentError);
    }
  });
  it("does not execute truncated function arguments", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      streamResponse([
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "x",
                    function: { name: "lookup", arguments: "{}" },
                  },
                ],
              },
              finish_reason: "length",
            },
          ],
        },
      ]),
    );
    expect(
      await collect(new MetaLLMProvider("muse-spark-1.3", "key", fetcher)),
    ).toEqual([{ type: "finish", reason: "length" }]);
  });
  it("cancels the stream on abort", async () => {
    let cancelled = false;
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const iterator = readSse(body, controller.signal);
    const pending = iterator.next();
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(cancelled).toBe(true);
  });
});

describe("isolated agent configuration", () => {
  it("starts offline and accepts a server-side Meta key alias", () => {
    expect(parseAgentConfig({})).toMatchObject({
      LLM_PROVIDER: "mock",
      AGENT_STORAGE: "memory",
    });
    expect(
      parseAgentConfig({ LLM_PROVIDER: "meta", MODEL_API_KEY: "key" }),
    ).toMatchObject({ apiKey: "key", model: "muse-spark-1.3" });
  });
  it("fails closed for missing keys, unapproved models, partial fallbacks and production memory storage", () => {
    for (const env of [
      { LLM_PROVIDER: "meta" },
      {
        LLM_PROVIDER: "meta",
        LLM_API_KEY: "secret",
        LLM_MODEL: "muse-spark-1.3-contributor",
      },
      { LLM_FALLBACK_PROVIDER: "meta" },
      { NODE_ENV: "production", LLM_PROVIDER: "meta", LLM_API_KEY: "secret" },
      { DEMO_MODE: "false" },
    ]) {
      expect(() => parseAgentConfig(env)).toThrow(AgentError);
      try {
        parseAgentConfig(env);
      } catch (error) {
        expect(String(error)).not.toContain("secret");
      }
    }
  });
});
