import { z } from "zod";
import { AgentError, type ChatMessage, type TokenUsage } from "./llm";
import type { AuditStore, OpenTurn, RunInfo, ToolAudit } from "./audit";
import { supabaseHeaders } from "./supabase-headers";

const runSchema = z.object({
  id: z.uuid(),
  session_id: z.uuid(),
  provider: z.string(),
  model: z.string(),
});
const historySchema = z
  .array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.object({ text: z.string().max(32_000) }),
    }),
  )
  .max(12);

export class SupabaseAuditStore implements AuditStore {
  readonly kind = "supabase";
  constructor(
    private readonly url: string,
    private readonly key: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request(
    path: string,
    body: unknown,
    method = "POST",
  ): Promise<unknown> {
    try {
      const response = await this.fetcher(
        `${this.url.replace(/\/$/, "")}/rest/v1/${path}`,
        {
          method,
          headers: {
            ...supabaseHeaders(this.key),
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(5000),
          redirect: "error",
          cache: "no-store",
        },
      );
      if (!response.ok) {
        const text = await response.text();
        for (const code of ["RATE_LIMITED", "SESSION_BUSY", "SESSION_MISMATCH"])
          if (text.includes(code)) throw new AgentError(code);
        throw new AgentError("AUDIT_UNAVAILABLE");
      }
      const text = await response.text();
      return text ? (JSON.parse(text) as unknown) : null;
    } catch (error) {
      if (error instanceof AgentError) throw error;
      throw new AgentError("AUDIT_UNAVAILABLE");
    }
  }
  async openTurn(input: OpenTurn): Promise<RunInfo> {
    const value = await this.request("rpc/agent_open_chat", {
      p_token_hash: input.tokenHash,
      p_ip_hash: input.ipHash,
      p_provider: input.provider,
      p_model: input.model,
      p_expected_session_id: input.expectedSessionId ?? null,
    });
    const result = z.array(runSchema).length(1).safeParse(value);
    if (!result.success) throw new AgentError("AUDIT_UNAVAILABLE");
    const row = result.data[0];
    return {
      id: row.id,
      sessionId: row.session_id,
      provider: row.provider,
      model: row.model,
    };
  }
  async history(sessionId: string): Promise<ChatMessage[]> {
    const rows = historySchema.safeParse(
      await this.request("rpc/agent_chat_history", { p_session_id: sessionId }),
    );
    if (!rows.success) throw new AgentError("AUDIT_UNAVAILABLE");
    return rows.data.map((row) => ({
      role: row.role,
      content: row.content.text,
    }));
  }
  async message(run: RunInfo, message: ChatMessage) {
    await this.request("agent_messages", {
      run_id: run.id,
      role: message.role,
      content: {
        text: message.content,
        ...(message.role === "assistant" && message.toolCalls
          ? { toolCalls: message.toolCalls }
          : {}),
        ...(message.role === "tool" ? { toolCallId: message.toolCallId } : {}),
      },
    });
  }
  async tool(run: RunInfo, call: ToolAudit) {
    await this.request("agent_tool_calls", {
      run_id: run.id,
      tool: call.tool,
      input: call.input,
      output: call.output,
      has_side_effect: call.hasSideEffect,
      policy_decision: call.decision,
    });
  }
  async finish(
    run: RunInfo,
    status: "completed" | "failed" | "cancelled",
    usage: TokenUsage,
    code?: string,
  ) {
    await this.request(
      `agent_runs?id=eq.${run.id}`,
      {
        status,
        tokens_in: usage.input,
        tokens_out: usage.output,
        finished_at: new Date().toISOString(),
        error_code: code ?? null,
        provider: run.provider,
        model: run.model,
      },
      "PATCH",
    );
  }
}
