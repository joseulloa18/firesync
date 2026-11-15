import { z } from "zod";
import {
  AgentError,
  type GenerateInput,
  type LLMEvent,
  type LLMProvider,
  type ToolCall,
} from "../llm";
import { readSse } from "../sse";

const chunkSchema = z.object({
  error: z.unknown().optional(),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative(),
      completion_tokens: z.number().int().nonnegative(),
    })
    .nullish(),
  choices: z
    .array(
      z.object({
        index: z.number().int(),
        finish_reason: z.string().nullish(),
        delta: z.object({
          content: z.string().nullish(),
          tool_calls: z
            .array(
              z.object({
                index: z.number().int().min(0).max(7),
                id: z.string().optional(),
                function: z
                  .object({
                    name: z.string().optional(),
                    arguments: z.string().optional(),
                  })
                  .optional(),
              }),
            )
            .optional(),
        }),
      }),
    )
    .default([]),
});

/** Direct Meta Model API. The endpoint is fixed so a config value cannot exfiltrate a key. */
export class MetaLLMProvider implements LLMProvider {
  readonly name = "meta";
  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async *generate(input: GenerateInput): AsyncGenerator<LLMEvent> {
    input.signal.throwIfAborted();
    const messages = input.messages.map((message) => {
      if (message.role === "tool")
        return {
          role: "tool",
          content: message.content,
          tool_call_id: message.toolCallId,
        };
      if (message.role === "assistant" && message.toolCalls?.length)
        return {
          role: "assistant",
          content: message.content || null,
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: {
              name: call.name,
              arguments: JSON.stringify(call.arguments),
            },
          })),
        };
      return { role: message.role, content: message.content };
    });
    let response: Response;
    try {
      response = await this.fetcher("https://api.meta.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "developer", content: input.system }, ...messages],
          ...(input.tools.length
            ? {
                tools: input.tools.map((tool) => ({
                  type: "function",
                  function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.inputSchema,
                  },
                })),
                tool_choice: "auto",
                parallel_tool_calls: false,
              }
            : {}),
          max_completion_tokens: input.maxTokens,
          reasoning_effort: "low",
          ...(input.temperature === undefined
            ? {}
            : { temperature: input.temperature }),
          stream: true,
          stream_options: { include_usage: true },
          store: false,
        }),
        signal: input.signal,
        redirect: "error",
      });
    } catch {
      if (input.signal.aborted) throw new AgentError("TURN_TIMEOUT");
      throw new AgentError("PROVIDER_UNAVAILABLE");
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new AgentError(
        response.status === 401 || response.status === 403
          ? "PROVIDER_AUTH_FAILED"
          : response.status === 429
            ? "PROVIDER_RATE_LIMITED"
            : "PROVIDER_UNAVAILABLE",
      );
    }
    if (
      !response.body ||
      !response.headers.get("content-type")?.includes("text/event-stream")
    )
      throw new AgentError("PROVIDER_INVALID_RESPONSE");

    const calls = new Map<number, { id: string; name: string; json: string }>();
    let finish: "stop" | "tool_calls" | "length" | undefined;
    let sawDone = false;
    let usageSeen = false;
    try {
      for await (const frame of readSse(response.body, input.signal)) {
        if (frame.data === "[DONE]") {
          sawDone = true;
          break;
        }
        const parsed = chunkSchema.safeParse(JSON.parse(frame.data));
        if (!parsed.success || parsed.data.error)
          throw new AgentError("PROVIDER_INVALID_RESPONSE");
        const chunk = parsed.data;
        if (chunk.usage) {
          if (usageSeen) throw new AgentError("PROVIDER_INVALID_RESPONSE");
          usageSeen = true;
          yield {
            type: "usage",
            usage: {
              input: chunk.usage.prompt_tokens,
              output: chunk.usage.completion_tokens,
            },
          };
        }
        for (const choice of chunk.choices) {
          if (choice.index !== 0) continue;
          // Deliberately discard reasoning_content and other non-answer fields.
          if (choice.delta.content)
            yield { type: "text", text: choice.delta.content };
          for (const delta of choice.delta.tool_calls ?? []) {
            const call = calls.get(delta.index) ?? {
              id: "",
              name: "",
              json: "",
            };
            call.id += delta.id ?? "";
            call.name += delta.function?.name ?? "";
            call.json += delta.function?.arguments ?? "";
            if (
              call.json.length > 16_384 ||
              call.name.length > 100 ||
              call.id.length > 200
            )
              throw new AgentError("PROVIDER_TOOL_LIMIT");
            calls.set(delta.index, call);
          }
          if (choice.finish_reason) {
            if (
              !["stop", "tool_calls", "length"].includes(choice.finish_reason)
            )
              throw new AgentError("PROVIDER_CONTENT_FILTERED");
            finish = choice.finish_reason as typeof finish;
          }
        }
      }
      if (!sawDone || !finish)
        throw new AgentError("PROVIDER_STREAM_INTERRUPTED");
      if (calls.size && finish !== "tool_calls" && finish !== "length")
        throw new AgentError("PROVIDER_INVALID_RESPONSE");
      // Never execute truncated arguments, even when they happen to be valid JSON.
      if (finish === "tool_calls") {
        if (!calls.size) throw new AgentError("PROVIDER_INVALID_RESPONSE");
        const seen = new Set<string>();
        for (const [, call] of [...calls.entries()].sort(([a], [b]) => a - b)) {
          if (!call.id || !call.name || seen.has(call.id))
            throw new AgentError("PROVIDER_INVALID_RESPONSE");
          seen.add(call.id);
          const complete: ToolCall = {
            id: call.id,
            name: call.name,
            arguments: JSON.parse(call.json),
          };
          yield { type: "tool_call", call: complete };
        }
      }
      yield { type: "finish", reason: finish };
    } catch (error) {
      if (input.signal.aborted) throw new AgentError("TURN_TIMEOUT");
      if (error instanceof AgentError) throw error;
      throw new AgentError("PROVIDER_INVALID_RESPONSE");
    }
  }
}
