import { randomUUID } from "node:crypto";
import { AgentError, type ChatMessage, type TokenUsage } from "./llm";

export type RunInfo = {
  id: string;
  sessionId: string;
  provider: string;
  model: string;
};
export type OpenTurn = {
  tokenHash: string;
  ipHash: string;
  provider: string;
  model: string;
  expectedSessionId?: string;
};
export type ToolAudit = {
  tool: string;
  input: unknown;
  output: unknown;
  hasSideEffect: boolean;
  decision: "allowed" | "denied";
};
export interface AuditStore {
  readonly kind: "memory" | "supabase";
  openTurn(input: OpenTurn): Promise<RunInfo>;
  history(sessionId: string): Promise<ChatMessage[]>;
  message(run: RunInfo, message: ChatMessage): Promise<void>;
  tool(run: RunInfo, call: ToolAudit): Promise<void>;
  finish(
    run: RunInfo,
    status: "completed" | "failed" | "cancelled",
    usage: TokenUsage,
    code?: string,
  ): Promise<void>;
}

export type MemoryRun = RunInfo & {
  tokenHash: string;
  ipHash: string;
  startedAt: number;
  status: "running" | "completed" | "failed" | "cancelled";
  messages: ChatMessage[];
  tools: ToolAudit[];
  usage?: TokenUsage;
  errorCode?: string;
};

/** Local/demo only. Bounded, ephemeral; production Muse requires durable Supabase storage. */
export class MemoryAuditStore implements AuditStore {
  readonly kind = "memory";
  readonly runs = new Map<string, MemoryRun>();
  private readonly sessions = new Map<string, { id: string; at: number }>();
  constructor(private readonly now: () => number = Date.now) {}

  async openTurn(input: OpenTurn): Promise<RunInfo> {
    const now = this.now();
    for (const [id, run] of this.runs)
      if (run.startedAt < now - 86_400_000) this.runs.delete(id);
    for (const [hash, session] of this.sessions)
      if (session.at < now - 86_400_000) this.sessions.delete(hash);
    const existing = this.sessions.get(input.tokenHash);
    if (input.expectedSessionId && input.expectedSessionId !== existing?.id)
      throw new AgentError("SESSION_MISMATCH");
    const recent = [...this.runs.values()];
    if (
      recent.filter(
        (run) => run.ipHash === input.ipHash && run.startedAt > now - 60_000,
      ).length >= 10 ||
      recent.filter(
        (run) => run.ipHash === input.ipHash && run.startedAt > now - 3_600_000,
      ).length >= 60 ||
      recent.filter(
        (run) =>
          run.tokenHash === input.tokenHash && run.startedAt > now - 60_000,
      ).length >= 10
    )
      throw new AgentError("RATE_LIMITED");
    if (
      recent.some(
        (run) =>
          run.tokenHash === input.tokenHash &&
          run.status === "running" &&
          run.startedAt > now - 70_000,
      )
    )
      throw new AgentError("SESSION_BUSY");
    if (this.runs.size >= 1000 || (!existing && this.sessions.size >= 100))
      throw new AgentError("RATE_LIMITED");
    const session = existing ?? { id: randomUUID(), at: now };
    for (const previous of recent) {
      if (
        previous.tokenHash === input.tokenHash &&
        previous.status === "running"
      ) {
        previous.status = "failed";
        previous.errorCode = "TURN_INTERRUPTED";
      }
    }
    session.at = now;
    this.sessions.set(input.tokenHash, session);
    const run: MemoryRun = {
      id: randomUUID(),
      sessionId: session.id,
      provider: input.provider,
      model: input.model,
      tokenHash: input.tokenHash,
      ipHash: input.ipHash,
      startedAt: now,
      status: "running",
      messages: [],
      tools: [],
    };
    this.runs.set(run.id, run);
    return {
      id: run.id,
      sessionId: run.sessionId,
      provider: run.provider,
      model: run.model,
    };
  }
  async history(sessionId: string) {
    return [...this.runs.values()]
      .filter(
        (run) => run.sessionId === sessionId && run.status === "completed",
      )
      .flatMap((run) =>
        run.messages.filter(
          (message) =>
            message.role === "user" ||
            (message.role === "assistant" && !message.toolCalls?.length),
        ),
      )
      .slice(-12);
  }
  async message(run: RunInfo, message: ChatMessage) {
    this.runs.get(run.id)!.messages.push(structuredClone(message));
  }
  async tool(run: RunInfo, call: ToolAudit) {
    this.runs.get(run.id)!.tools.push(structuredClone(call));
  }
  async finish(
    run: RunInfo,
    status: "completed" | "failed" | "cancelled",
    usage: TokenUsage,
    code?: string,
  ) {
    Object.assign(this.runs.get(run.id)!, {
      status,
      usage,
      errorCode: code,
      provider: run.provider,
      model: run.model,
    });
  }
}

/** Location context is ephemeral. Structured coordinate inputs never enter audit records. */
export function auditInput(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(auditInput);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            ![
              "location",
              "lat",
              "lon",
              "latitude",
              "longitude",
              "bbox",
              "from",
              "to",
            ].includes(key),
        )
        .map(([key, item]) => [key, auditInput(item)]),
    );
  return value;
}
