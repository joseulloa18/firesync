import { chatRequestSchema, chatEventSchema } from "@/lib/schemas/agent";
import { AgentError } from "./llm";
import {
  getAgentRuntime,
  hashToken,
  rateLimitKey,
  sessionToken,
} from "./runtime";
import { runSupportTurn } from "./runner";
import { encodeSse } from "./sse";

export function createChatHandler(runtime = getAgentRuntime) {
  return async function POST(request: Request) {
    const headers = {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };
    try {
      const origin = request.headers.get("origin");
      const contentType = request.headers.get("content-type");
      if (!contentType?.includes("application/json"))
        return Response.json(
          { code: "INVALID_CONTENT_TYPE" },
          { status: 415, headers },
        );
      if (Number(request.headers.get("content-length")) > 24_000)
        return Response.json(
          { code: "REQUEST_TOO_LARGE" },
          { status: 413, headers },
        );
      // Bound streamed bodies too, rather than trusting Content-Length.
      const reader = request.body?.getReader();
      if (!reader)
        return Response.json(
          { code: "INVALID_REQUEST" },
          { status: 400, headers },
        );
      let bytes = 0;
      let body = "";
      const decoder = new TextDecoder();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 24_000) {
            await reader.cancel();
            return Response.json(
              { code: "REQUEST_TOO_LARGE" },
              { status: 413, headers },
            );
          }
          body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
      } finally {
        reader.releaseLock();
      }
      let raw: unknown;
      try {
        raw = JSON.parse(body) as unknown;
      } catch {
        return Response.json(
          { code: "INVALID_REQUEST" },
          { status: 400, headers },
        );
      }
      const parsed = chatRequestSchema.safeParse(raw);
      if (!parsed.success)
        return Response.json(
          { code: "INVALID_REQUEST" },
          { status: 400, headers },
        );
      const { config, audit, provider, fallback, tools } = runtime();
      if (
        (origin &&
          origin !== new URL(config.APP_BASE_URL).origin &&
          origin !== new URL(request.url).origin) ||
        request.headers.get("sec-fetch-site") === "cross-site"
      )
        return Response.json(
          { code: "ORIGIN_DENIED" },
          { status: 403, headers },
        );
      const token = sessionToken(request);
      const run = await audit.openTurn({
        tokenHash: hashToken(token),
        ipHash: rateLimitKey(request, config),
        provider: provider.name,
        model: provider.model,
        expectedSessionId: parsed.data.sessionId,
      });
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 60_000);
      const signal = AbortSignal.any([request.signal, abort.signal]);
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            const initial = chatEventSchema.parse({
              type: "session",
              sessionId: run.sessionId,
              runId: run.id,
              provider: provider.name,
              model: provider.model,
              demo: config.demo,
              storage: audit.kind,
            });
            controller.enqueue(encodeSse(initial.type, initial));
            for await (const event of runSupportTurn({
              request: parsed.data,
              run,
              actor: { role: "anonymous" },
              demo: config.demo,
              provider,
              fallback,
              tools,
              audit,
              signal,
            })) {
              if (!signal.aborted)
                controller.enqueue(
                  encodeSse(event.type, chatEventSchema.parse(event)),
                );
            }
          } catch {
            if (!signal.aborted)
              controller.enqueue(
                encodeSse("error", {
                  type: "error",
                  code: "AGENT_UNAVAILABLE",
                }),
              );
          } finally {
            clearTimeout(timeout);
            try {
              controller.close();
            } catch {
              /* Client already disconnected. */
            }
          }
        },
        cancel() {
          clearTimeout(timeout);
          abort.abort();
        },
      });
      return new Response(stream, {
        headers: {
          ...headers,
          "Content-Type": "text/event-stream; charset=utf-8",
          "X-Accel-Buffering": "no",
          "Set-Cookie": `firesync_agent=${token}; HttpOnly; SameSite=Strict; Path=/api/agent; Max-Age=2592000${new URL(config.APP_BASE_URL).protocol === "https:" ? "; Secure" : ""}`,
        },
      });
    } catch (error) {
      const code =
        error instanceof AgentError ? error.code : "AGENT_UNAVAILABLE";
      const status =
        code === "RATE_LIMITED"
          ? 429
          : code === "SESSION_BUSY"
            ? 409
            : code === "SESSION_MISMATCH"
              ? 403
              : 503;
      return Response.json(
        { code },
        {
          status,
          headers: {
            ...headers,
            ...(status === 429 ? { "Retry-After": "60" } : {}),
          },
        },
      );
    }
  };
}
