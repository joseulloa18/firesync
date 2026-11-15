import { describe, expect, it } from "vitest";
import { createChatHandler } from "@/lib/agent/handler";
import { MemoryAuditStore } from "@/lib/agent/audit";
import { MockLLMProvider } from "@/lib/agent/providers/mock";
import { parseAgentConfig } from "@/lib/agent/config";
import { createSupportTools } from "@/lib/agent/tools";
import { readSse } from "@/lib/agent/sse";
import { chatEventSchema } from "@/lib/schemas/agent";
import es from "../../messages/agent.es.json";
import en from "../../messages/agent.en.json";

function setup() {
  const audit = new MemoryAuditStore();
  const handler = createChatHandler(() => ({
    config: parseAgentConfig({}),
    audit,
    provider: new MockLLMProvider(),
    fallback: undefined,
    tools: createSupportTools({ demo: true }),
  }));
  return { audit, handler };
}
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
async function events(response: Response) {
  const result = [];
  for await (const frame of readSse(response.body!))
    result.push(chatEventSchema.parse(JSON.parse(frame.data)));
  return result;
}

describe("public chat endpoint", () => {
  it("streams a turn, sets a private cookie, and reuses only that session's history", async () => {
    const { handler, audit } = setup();
    const first = await handler(request({ message: "Hola", locale: "es" }));
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(first.headers.get("set-cookie")).toContain(
      "HttpOnly; SameSite=Strict",
    );
    const initial = (await events(first))[0];
    expect(initial.type).toBe("session");
    if (initial.type !== "session") throw new Error();
    const cookie = first.headers.get("set-cookie")!.split(";")[0];
    const second = await handler(
      request({ message: "Sigue", sessionId: initial.sessionId }, { cookie }),
    );
    const messages = await events(second);
    expect(messages[0]).toMatchObject({ sessionId: initial.sessionId });
    expect(messages.at(-1)?.type).toBe("done");
    expect(audit.runs.size).toBe(2);
    const attacker = await handler(
      request({
        message: "Read someone else's chat",
        sessionId: initial.sessionId,
      }),
    );
    expect(attacker.status).toBe(403);
    expect(await attacker.json()).toEqual({ code: "SESSION_MISMATCH" });
  });
  it.each([
    { message: "" },
    { message: "x", role: "admin" },
    { message: "x", context: { location: { lat: 200, lon: 20 } } },
    { message: "x".repeat(4001) },
  ])("rejects malformed requests before opening a run", async (body) => {
    const { handler, audit } = setup();
    expect((await handler(request(body))).status).toBe(400);
    expect(audit.runs.size).toBe(0);
  });
  it("rejects cross-site requests and oversized bodies without trusting Content-Length", async () => {
    const { handler, audit } = setup();
    expect(
      (
        await handler(
          request({ message: "x" }, { origin: "https://attacker.example" }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handler(
          request({ message: "x" }, { "sec-fetch-site": "cross-site" }),
        )
      ).status,
    ).toBe(403);
    expect(
      (await handler(request({ message: "x".repeat(25000) }))).status,
    ).toBe(413);
    expect(audit.runs.size).toBe(0);
  });
  it("limits IP use across new anonymous sessions", async () => {
    const { handler } = setup();
    for (let i = 0; i < 10; i++) {
      const response = await handler(request({ message: "Hola" }));
      expect(response.status).toBe(200);
      await events(response);
    }
    const rejected = await handler(
      request({ message: "Hola" }, { "x-forwarded-for": "forged-ip" }),
    );
    expect(rejected.status).toBe(429);
    expect(rejected.headers.get("retry-after")).toBe("60");
  });
  it("prevents concurrent turns in one session", async () => {
    const audit = new MemoryAuditStore();
    await audit.openTurn({
      tokenHash: "token",
      ipHash: "ip",
      provider: "mock",
      model: "test",
    });
    await expect(
      audit.openTurn({
        tokenHash: "token",
        ipHash: "another-ip",
        provider: "mock",
        model: "test",
      }),
    ).rejects.toThrow("SESSION_BUSY");
  });
  it("keeps UI translation keys aligned", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(es.tools).sort()).toEqual(Object.keys(en.tools).sort());
  });
});
