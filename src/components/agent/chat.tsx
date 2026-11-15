"use client";

import { useEffect, useRef, useState } from "react";
import { chatEventSchema } from "@/lib/schemas/agent";
import { readSse } from "@/lib/agent/sse";
import { agentMessages } from "./messages";
import "./chat.css";

type Entry = { id: number; role: "user" | "assistant"; text: string };
export function AgentChat({ locale }: { locale: "es" | "en" }) {
  const t = agentMessages[locale];
  const [entries, setEntries] = useState<Entry[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<{
    provider: string;
    demo: boolean;
    storage: string;
  }>();
  const session = useRef<string | undefined>(undefined);
  const abort = useRef<AbortController | undefined>(undefined);
  const nextId = useRef(0);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    list.current?.scrollTo({
      top: list.current.scrollHeight,
      behavior: "smooth",
    });
  }, [entries, status]);

  function showError(code: string) {
    if (code === "SESSION_MISMATCH") session.current = undefined;
    setError(
      code === "RATE_LIMITED" || code === "PROVIDER_RATE_LIMITED"
        ? t.rateLimited
        : code === "SESSION_BUSY"
          ? t.busy
          : code === "PROVIDER_AUTH_FAILED"
            ? t.auth
            : /CONFIG|STORAGE|AUDIT/.test(code)
              ? t.configuration
              : t.error,
    );
  }
  async function send(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text || busy) return;
    const userId = nextId.current++;
    const assistantId = nextId.current++;
    setEntries((old) => [
      ...old,
      { id: userId, role: "user", text },
      { id: assistantId, role: "assistant", text: "" },
    ]);
    setMessage("");
    setError("");
    setStatus(t.loading);
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    let terminal = false;
    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          locale,
          sessionId: session.current,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const value: unknown = await response.json();
        showError(
          value &&
            typeof value === "object" &&
            "code" in value &&
            typeof value.code === "string"
            ? value.code
            : "REQUEST_FAILED",
        );
        return;
      }
      if (
        !response.body ||
        !response.headers.get("content-type")?.includes("text/event-stream")
      )
        throw new Error("INVALID_RESPONSE");
      for await (const frame of readSse(response.body, controller.signal)) {
        const parsed = chatEventSchema.safeParse(JSON.parse(frame.data));
        if (!parsed.success) throw new Error("INVALID_RESPONSE");
        const data = parsed.data;
        if (data.type === "session") {
          session.current = data.sessionId;
          setMode(data);
        }
        if (data.type === "text_delta")
          setEntries((old) =>
            old.map((entry) =>
              entry.id === assistantId
                ? { ...entry, text: entry.text + data.text }
                : entry,
            ),
          );
        if (data.type === "tool")
          setStatus(
            data.decision === "denied"
              ? t.denied
              : `${t.tool}: ${t.tools[data.name as keyof typeof t.tools] ?? t.assistant}`,
          );
        if (data.type === "fallback") setStatus(t.fallback);
        if (data.type === "error") {
          showError(data.code);
          terminal = true;
        }
        if (data.type === "done") {
          terminal = true;
          if (data.reason === "length") setError(t.truncated);
        }
      }
      if (!terminal) showError("STREAM_INTERRUPTED");
    } catch {
      setError(controller.signal.aborted ? t.cancelled : t.network);
    } finally {
      setStatus("");
      setBusy(false);
      abort.current = undefined;
    }
  }
  return (
    <section className="agent-chat" aria-label={t.title}>
      <p className="agent-notice">{t.emergency}</p>
      {mode && (
        <p className="agent-mode">
          {mode.provider === "mock" ? t.mock : t.meta}
          {mode.demo && <> · {t.demo}</>}
        </p>
      )}
      {mode?.storage === "memory" && <p className="agent-hint">{t.memory}</p>}
      <div
        ref={list}
        className="agent-transcript"
        role="log"
        aria-label={t.title}
        aria-live="polite"
        aria-relevant="additions text"
        aria-busy={busy}
      >
        {!entries.length && <p className="agent-empty">{t.empty}</p>}
        {entries.map(
          (entry) =>
            entry.text && (
              <article
                className={`agent-message agent-message-${entry.role}`}
                key={entry.id}
              >
                <strong>{entry.role === "user" ? t.you : t.assistant}</strong>
                <p>{entry.text}</p>
              </article>
            ),
        )}
      </div>
      <p className="agent-status" role="status">
        {status}
      </p>
      {error && (
        <p className="agent-error" role="alert">
          {error}
        </p>
      )}
      <form onSubmit={send} className="agent-form">
        <label htmlFor="agent-input">{t.label}</label>
        <textarea
          id="agent-input"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={t.placeholder}
          maxLength={4000}
          rows={3}
          required
          disabled={busy}
        />
        <div className="agent-actions">
          {busy ? (
            <button
              type="button"
              className="button secondary"
              onClick={() => abort.current?.abort()}
            >
              {t.stop}
            </button>
          ) : (
            <button
              className="button primary"
              type="submit"
              disabled={!message.trim()}
            >
              {t.send}
            </button>
          )}
        </div>
      </form>
      <p className="agent-hint">{t.privacy}</p>
    </section>
  );
}
