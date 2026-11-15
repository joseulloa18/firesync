export type ToolCall = { id: string; name: string; arguments: unknown };
export type ChatMessage =
  | { role: "user" | "system"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; content: string; toolCallId: string };

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type TokenUsage = { input: number; output: number };
export type LLMEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "usage"; usage: TokenUsage }
  | { type: "finish"; reason: "stop" | "tool_calls" | "length" };

export type GenerateInput = {
  system: string;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  maxTokens: number;
  temperature?: number;
  signal: AbortSignal;
};

/** Business logic uses this contract, never a vendor SDK. */
export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  generate(input: GenerateInput): AsyncIterable<LLMEvent>;
}

export class AgentError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "AgentError";
  }
}
