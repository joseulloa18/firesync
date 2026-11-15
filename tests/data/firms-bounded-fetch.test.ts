import { describe, expect, it, vi } from "vitest";
import { createBoundedFirmsFetch } from "../../src/lib/firms-client/bounded-fetch";
import { FirmsClientError } from "../../src/lib/firms-client/errors";
import type { FetchLike } from "../../src/lib/firms-client/types";

// Synthetic URL and CSV: no NASA data or real credentials are used here.
const SECRET = "SYNTHETIC_MAP_KEY";
const URL = `https://firms.invalid/${SECRET}`;
const encoder = new TextEncoder();

function streamResponse(chunks: string[], headers?: HeadersInit) {
  const cancel = vi.fn();
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index++]));
      } else {
        controller.close();
      }
    },
    cancel,
  });
  return { response: new Response(body, { headers }), cancel };
}

async function captureError(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(FirmsClientError);
    const safe = error as FirmsClientError;
    expect(`${safe.message}\n${safe.stack}`).not.toContain(SECRET);
    expect(`${safe.message}\n${safe.stack}`).not.toContain(URL);
    expect(safe.cause).toBeUndefined();
    return safe;
  }
  throw new Error("Expected a safe transport error.");
}

describe("bounded FIRMS fetch (synthetic responses)", () => {
  it("rejects invalid byte budgets without calling fetch", () => {
    const fetchMock = vi.fn();
    for (const limit of [
      0,
      -1,
      1.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() => createBoundedFirmsFetch(fetchMock, limit)).toThrow(
        FirmsClientError,
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forces private, non-redirecting, uncached requests", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => new Response("ok"));
    const signal = new AbortController().signal;
    const result = await createBoundedFirmsFetch(fetchMock)(URL, {
      redirect: "follow",
      credentials: "include",
      cache: "force-cache",
      method: "GET",
      headers: { Accept: "text/csv" },
      signal,
    });
    expect(await result.text()).toBe("ok");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      method: "GET",
      signal,
      headers: { Accept: "text/csv" },
    });
  });

  it("checks streamed bytes when Content-Length is absent", async () => {
    const { response, cancel } = streamResponse(["123", "456", "789"]);
    const error = await captureError(
      createBoundedFirmsFetch(async () => response, 5)(URL),
    );
    expect(error.code).toBe("network_error");
    expect(error.message).toContain("byte limit");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("does not trust an understated Content-Length", async () => {
    const { response } = streamResponse(["1234", "5678"], {
      "Content-Length": "1",
    });
    expect(
      (
        await captureError(
          createBoundedFirmsFetch(async () => response, 5)(URL),
        )
      ).message,
    ).toContain("byte limit");
  });

  it("cancels immediately when declared size exceeds the budget", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), {
      headers: { "Content-Length": "1000" },
    });
    await captureError(createBoundedFirmsFetch(async () => response, 5)(URL));
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("counts UTF-8 bytes rather than string length", async () => {
    const bytes = encoder.encode("á🔥");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 3));
        controller.enqueue(bytes.slice(3));
        controller.close();
      },
    });
    const response = await createBoundedFirmsFetch(
      async () =>
        new Response(body, { headers: { "Content-Type": "text/csv" } }),
      bytes.length,
    )(URL);
    expect(await response.text()).toBe("á🔥");
    expect(response.headers.get("content-type")).toBe("text/csv");
    expect(response.headers.get("content-length")).toBe(String(bytes.length));
    await captureError(
      createBoundedFirmsFetch(
        async () => new Response("á🔥"),
        bytes.length - 1,
      )(URL),
    );
  });

  it("returns non-200 responses unread for client status handling", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), {
      status: 429,
      headers: { "Retry-After": "3", "Content-Length": "99999" },
    });
    const result = await createBoundedFirmsFetch(async () => response, 1)(URL);
    expect(result).toBe(response);
    expect(result.bodyUsed).toBe(false);
    expect(result.headers.get("retry-after")).toBe("3");
    expect(cancel).not.toHaveBeenCalled();
    await result.body?.cancel();
  });

  it("cancels a stalled body even when its source ignores the signal", async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    let markReading: () => void = () => {};
    const reading = new Promise<void>((resolve) => {
      markReading = resolve;
    });
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull() {
          markReading();
          return new Promise<void>(() => {});
        },
        cancel,
      }),
    );
    const result = createBoundedFirmsFetch(async () => response)(URL, {
      signal: controller.signal,
    });
    await reading;
    controller.abort(new Error(`${URL}: external secret`));
    expect((await captureError(result)).code).toBe("aborted");
    expect(cancel).toHaveBeenCalled();
  });

  it("removes its abort listener on success", async () => {
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const result = await createBoundedFirmsFetch(
      async () => new Response("ok"),
    )(URL, { signal: controller.signal });
    await result.text();
    expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]);
  });

  it("removes its abort listener when streaming exceeds the limit", async () => {
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    await captureError(
      createBoundedFirmsFetch(async () => new Response("too long"), 1)(URL, {
        signal: controller.signal,
      }),
    );
    expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]);
  });

  it("redacts fetch and stream exceptions including their causes", async () => {
    const fetchFailure: FetchLike = async () => {
      throw new Error(`${URL}: ${SECRET}`, { cause: SECRET });
    };
    expect(
      (await captureError(createBoundedFirmsFetch(fetchFailure)(URL))).code,
    ).toBe("network_error");
    const response = new Response(
      new ReadableStream({
        pull(controller) {
          controller.error(new Error(`${URL}: ${SECRET}`));
        },
      }),
    );
    expect(
      (await captureError(createBoundedFirmsFetch(async () => response)(URL)))
        .code,
    ).toBe("network_error");
  });

  it("does not call fetch for an already cancelled request", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn();
    expect(
      (
        await captureError(
          createBoundedFirmsFetch(fetchMock)(URL, {
            signal: controller.signal,
          }),
        )
      ).code,
    ).toBe("aborted");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
