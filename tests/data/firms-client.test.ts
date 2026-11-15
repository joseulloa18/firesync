import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFirmsClient,
  FIRMS_AREA_CSV_BASE_URL,
  FIRMS_SOURCES,
  FirmsClientError,
} from "../../src/lib/firms-client/index";
import type {
  FetchLike,
  FirmsAreaRequest,
  FirmsClientErrorCode,
  FirmsClientOptions,
  FirmsSource,
} from "../../src/lib/firms-client/index";

const MAP_KEY = "MAPKEY_SECRET_9f8e7d";
const CSV = "latitude,longitude,acq_date\n18.1,-70.2,2024-02-29\n";
const REQUEST: FirmsAreaRequest = {
  source: "VIIRS_SNPP_NRT",
  bbox: [-72.6, 17.0, -67.7, 20.6],
  dayRange: 2,
  date: "2024-02-29",
};

function makeClient(
  fetchImpl: FetchLike,
  overrides: Partial<FirmsClientOptions> = {},
) {
  return createFirmsClient({
    mapKey: MAP_KEY,
    fetch: fetchImpl,
    minIntervalMs: 0,
    timeoutMs: 1000,
    ...overrides,
  });
}

async function getError(promise: Promise<unknown>): Promise<FirmsClientError> {
  try {
    await promise;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(FirmsClientError);
    return error as FirmsClientError;
  }
  throw new Error("Expected the promise to reject.");
}

function renderError(error: Error): string {
  return `${error.name}: ${error.message}\n${error.stack ?? ""}`;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("FIRMS area CSV client", () => {
  it("downloads CSV text from the official area URL", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({ input: String(input), init });
        return new Response(CSV, { status: 200 });
      },
    );

    const client = makeClient(fetchMock);
    await expect(client.download(REQUEST)).resolves.toBe(CSV);

    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe(
      `${FIRMS_AREA_CSV_BASE_URL}/${MAP_KEY}/VIIRS_SNPP_NRT/-72.6,17,-67.7,20.6/2/2024-02-29`,
    );
    expect(calls[0].init?.method).toBe("GET");
    expect(calls[0].init?.headers).toEqual({ Accept: "text/csv" });
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("adds the date segment only when a date is supplied", async () => {
    const urls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      urls.push(String(input));
      return new Response(CSV, { status: 200 });
    });
    const client = makeClient(fetchMock);

    await client.download({ ...REQUEST, date: undefined });
    await client.download(REQUEST);

    const withoutDate = urls[0];
    const withDate = urls[1];
    expect(withoutDate.endsWith("/VIIRS_SNPP_NRT/-72.6,17,-67.7,20.6/2")).toBe(
      true,
    );
    expect(withDate.endsWith("/2/2024-02-29")).toBe(true);
  });

  it("accepts only the documented source allowlist", async () => {
    const fetchMock = vi.fn(async () => new Response(CSV, { status: 200 }));
    const client = makeClient(fetchMock);

    for (const source of FIRMS_SOURCES) {
      await expect(client.download({ ...REQUEST, source })).resolves.toBe(CSV);
    }
    expect(fetchMock).toHaveBeenCalledTimes(FIRMS_SOURCES.length);

    const error = await getError(
      client.download({ ...REQUEST, source: "LANDSAT_NRT" as FirmsSource }),
    );
    expect(error.code).toBe("invalid_source");
    expect(fetchMock).toHaveBeenCalledTimes(FIRMS_SOURCES.length);
  });

  it("rejects invalid bbox, day ranges and UTC calendar dates before fetch", async () => {
    const fetchMock = vi.fn(async () => new Response(CSV, { status: 200 }));
    const client = makeClient(fetchMock);
    const cases: Array<{
      request: FirmsAreaRequest;
      code: FirmsClientErrorCode;
    }> = [
      {
        request: { ...REQUEST, bbox: [-181, 17, -67.7, 20.6] },
        code: "invalid_bbox",
      },
      {
        request: { ...REQUEST, bbox: [-72.6, 17, -67.7, 91] },
        code: "invalid_bbox",
      },
      {
        request: { ...REQUEST, bbox: [-67.7, 17, -72.6, 20.6] },
        code: "invalid_bbox",
      },
      {
        request: { ...REQUEST, bbox: [-72.6, 20.6, -67.7, 17] },
        code: "invalid_bbox",
      },
      {
        request: { ...REQUEST, bbox: [-72.6, Number.NaN, -67.7, 20.6] },
        code: "invalid_bbox",
      },
      {
        request: { ...REQUEST, dayRange: 0 },
        code: "invalid_day_range",
      },
      {
        request: { ...REQUEST, dayRange: 6 },
        code: "invalid_day_range",
      },
      {
        request: { ...REQUEST, dayRange: 2.5 },
        code: "invalid_day_range",
      },
      {
        request: { ...REQUEST, date: "2023-02-29" },
        code: "invalid_date",
      },
      {
        request: { ...REQUEST, date: "2024-13-01" },
        code: "invalid_date",
      },
      {
        request: { ...REQUEST, date: "2024-04-31" },
        code: "invalid_date",
      },
      {
        request: { ...REQUEST, date: "29-02-2024" },
        code: "invalid_date",
      },
    ];

    for (const { request, code } of cases) {
      const error = await getError(client.download(request));
      expect(error.code).toBe(code);
      expect(renderError(error)).not.toContain(MAP_KEY);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never calls fetch without a map key", () => {
    const fetchMock = vi.fn(async () => new Response(CSV, { status: 200 }));

    expect(() => createFirmsClient({ mapKey: "", fetch: fetchMock })).toThrow(
      FirmsClientError,
    );
    expect(() =>
      createFirmsClient({ mapKey: "   ", fetch: fetchMock }),
    ).toThrow(FirmsClientError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serializes downloads and applies the configured throttle", async () => {
    let currentTime = 0;
    const sleeps: number[] = [];
    let active = 0;
    let maxActive = 0;
    const fetchMock = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return new Response(CSV, { status: 200 });
    });
    const client = makeClient(fetchMock, {
      minIntervalMs: 1000,
      now: () => currentTime,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
        currentTime += milliseconds;
      },
    });

    await Promise.all([
      client.download(REQUEST),
      client.download({ ...REQUEST, dayRange: 1 }),
    ]);

    expect(maxActive).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([1000]);
  });

  it("honors Retry-After seconds on 429 responses", async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const fetchMock = vi.fn(async () => {
      calls += 1;
      return calls === 1
        ? new Response("rate limited", {
            status: 429,
            headers: { "retry-after": "2" },
          })
        : new Response(CSV, { status: 200 });
    });
    const client = makeClient(fetchMock, {
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    });

    await expect(client.download(REQUEST)).resolves.toBe(CSV);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([2000]);
  });

  it("honors Retry-After HTTP dates using the injected clock", async () => {
    const now = Date.UTC(2026, 0, 1, 0, 0, 0);
    let calls = 0;
    const sleeps: number[] = [];
    const fetchMock = vi.fn(async () => {
      calls += 1;
      return calls === 1
        ? new Response("rate limited", {
            status: 429,
            headers: {
              "retry-after": new Date(now + 3000).toUTCString(),
            },
          })
        : new Response(CSV, { status: 200 });
    });
    const client = makeClient(fetchMock, {
      now: () => now,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    });

    await expect(client.download(REQUEST)).resolves.toBe(CSV);
    expect(sleeps).toEqual([3000]);
  });

  it("retries 5xx responses with bounded exponential backoff", async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const fetchMock = vi.fn(async () => {
      calls += 1;
      return calls === 1
        ? new Response("server error", { status: 500 })
        : new Response(CSV, { status: 200 });
    });
    const client = makeClient(fetchMock, {
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    });

    await expect(client.download(REQUEST)).resolves.toBe(CSV);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([500]);
  });

  it("stops after the configured retries and keeps response bodies out of errors", async () => {
    const bodySecret = "EXTERNAL_RESPONSE_BODY_SECRET";
    const sleeps: number[] = [];
    const fetchMock = vi.fn(
      async () => new Response(bodySecret, { status: 503 }),
    );
    const client = makeClient(fetchMock, {
      maxRetries: 1,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    });

    const error = await getError(client.download(REQUEST));

    expect(error.code).toBe("http_status");
    expect(error.status).toBe(503);
    expect(error.attempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([500]);
    const rendered = renderError(error);
    expect(rendered).not.toContain(MAP_KEY);
    expect(rendered).not.toContain(bodySecret);
    expect(rendered).not.toContain(FIRMS_AREA_CSV_BASE_URL);
  });

  it("does not retry non-retryable HTTP statuses", async () => {
    const fetchMock = vi.fn(
      async () => new Response("bad request body", { status: 400 }),
    );
    const client = makeClient(fetchMock);

    const error = await getError(client.download(REQUEST));

    expect(error.code).toBe("http_status");
    expect(error.status).toBe(400);
    expect(error.attempts).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(renderError(error)).not.toContain("bad request body");
  });

  it("cancels non-200 response bodies without reading them", async () => {
    const cancel = vi.fn(async () => undefined);
    const response = {
      status: 503,
      headers: new Headers(),
      body: { cancel },
    } as unknown as Response;
    const fetchMock = vi.fn(async () => response);
    const client = makeClient(fetchMock, { maxRetries: 0 });

    const error = await getError(client.download(REQUEST));

    expect(error.code).toBe("http_status");
    expect(error.status).toBe(503);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("does not leak fetch errors containing the URL or map key", async () => {
    const fullUrl = `${FIRMS_AREA_CSV_BASE_URL}/${MAP_KEY}/VIIRS_SNPP_NRT/-72.6,17,-67.7,20.6/2`;
    const fetchMock = vi.fn(async () => {
      throw new Error(`network failure at ${fullUrl}`);
    });
    const client = makeClient(fetchMock);

    const error = await getError(client.download(REQUEST));

    expect(error.code).toBe("network_error");
    const rendered = renderError(error);
    expect(rendered).not.toContain(MAP_KEY);
    expect(rendered).not.toContain(fullUrl);
    expect(rendered).not.toContain(FIRMS_AREA_CSV_BASE_URL);
  });

  it("aborts an attempt on timeout with a safe error", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new Error(`aborted ${String(_input)}`));
          });
        }),
    );
    const client = makeClient(fetchMock, { timeoutMs: 25 });

    const settlement = client
      .download(REQUEST)
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(25);
    const error = await settlement;

    expect(error).toBeInstanceOf(FirmsClientError);
    const firmsError = error as FirmsClientError;
    expect(firmsError.code).toBe("timeout");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const rendered = renderError(firmsError);
    expect(rendered).not.toContain(MAP_KEY);
    expect(rendered).not.toContain(FIRMS_AREA_CSV_BASE_URL);
  });

  it("cancels an in-flight request without leaking the URL", async () => {
    const controller = new AbortController();
    let notifyStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    const fetchMock = vi.fn(
      (input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          notifyStarted();
          init?.signal?.addEventListener("abort", () => {
            reject(new Error(`cancelled ${String(input)}`));
          });
        }),
    );
    const client = makeClient(fetchMock);

    const promise = client.download(REQUEST, { signal: controller.signal });
    await started;
    controller.abort();
    const error = await getError(promise);

    expect(error.code).toBe("aborted");
    const rendered = renderError(error);
    expect(rendered).not.toContain(MAP_KEY);
    expect(rendered).not.toContain(FIRMS_AREA_CSV_BASE_URL);
  });

  it("cancels a queued request without starting it", async () => {
    let resolveFirst!: (response: Response) => void;
    let calls = 0;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          calls += 1;
          if (calls === 1) resolveFirst = resolve;
        }),
    );
    const client = makeClient(fetchMock);

    const first = client.download(REQUEST);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const controller = new AbortController();
    const second = client.download(
      { ...REQUEST, dayRange: 1 },
      { signal: controller.signal },
    );
    controller.abort();

    const error = await getError(second);
    expect(error.code).toBe("aborted");

    resolveFirst(new Response(CSV, { status: 200 }));
    await expect(first).resolves.toBe(CSV);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
