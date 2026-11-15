import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirmsProbeError, probeFirms } from "../../src/lib/firms-client/probe";
import type { FetchLike } from "../../src/lib/firms-client/types";

// All observations and credentials in this suite are synthetic fixtures.
const key = "SYNTHETIC-PRIVATE-KEY";
const availability = "data_id,min_date,max_date\nMODIS_SP,2025-01-01,2025-01-31\n";
const header = "latitude,longitude,acq_date,acq_time,satellite,confidence,frp\n";
const csv = header + "18.8,-70.7,2025-01-31,1230,Terra,80,2\n";
const fixedNow = () => new Date("2026-11-15T17:00:00.000Z");

function mockFetch(area = csv, dates = availability) {
  return vi.fn<FetchLike>()
    .mockResolvedValueOnce(new Response(dates))
    .mockResolvedValueOnce(new Response(area));
}

async function sample(area = csv) {
  const fetch = mockFetch(area);
  const result = probeFirms({}, { mapKey: key, fetch, now: fixedNow });
  await vi.runAllTimersAsync();
  return { result: await result, fetch };
}

afterEach(() => vi.useRealTimers());

describe("bounded FIRMS sample (synthetic HTTP)", () => {
  it("checks availability then requests exactly one day; emits no rows or key", async () => {
    vi.useFakeTimers();
    const { result, fetch } = await sample();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[0][0])).toContain("/data_availability/csv/");
    expect(String(fetch.mock.calls[1][0]).endsWith(
      "/MODIS_SP/-70.9,18.6,-70.5,19/1/2025-01-31",
    )).toBe(true);
    expect(result).toMatchObject({
      status: "ok", source: "MODIS_SP", date: "2025-01-31",
      rowsRead: 1, rowsAccepted: 1, rowsRejected: 0,
      persisted: false, coverage: "not_assessed", dataThrough: null,
      newestAcquiredAt: "2025-01-31T12:30:00.000Z",
      downloadedAt: fixedNow().toISOString(),
      sha256: createHash("sha256").update(csv).digest("hex"),
    });
    expect(JSON.stringify(result)).not.toContain(key);
    expect(JSON.stringify(result)).not.toContain("latitude");
  });

  it("accepts a header-only result without claiming complete coverage", async () => {
    vi.useFakeTimers();
    const { result } = await sample(header);
    expect(result.rowsAccepted).toBe(0);
    expect(result.newestAcquiredAt).toBeNull();
    expect(result.coverage).toBe("not_assessed");
    expect(result.lastIngestionAt).toBeNull();
  });

  it.each([
    { source: "UNKNOWN" },
    { date: "2025-02-29" },
    { bbox: [-72, 17, -68, 20] },
    { bbox: [18, -71, 19, -70] },
    { bbox: [-70, 19, -71, 18] },
    { bbox: [NaN, 18, -70, 19] },
    { extra: "unexpected" },
  ])("rejects invalid input before consuming quota: %j", async (input) => {
    const fetch = mockFetch();
    await expect(probeFirms(input, { mapKey: key, fetch })).rejects.toMatchObject({
      code: "invalid_input",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not request data without a key or outside availability", async () => {
    const fetch = mockFetch();
    await expect(probeFirms({}, { mapKey: undefined, fetch })).rejects.toMatchObject({
      code: "missing_key",
    });
    expect(fetch).not.toHaveBeenCalled();
    await expect(probeFirms({ date: "2000-01-01" }, { mapKey: key, fetch }))
      .rejects.toMatchObject({ code: "date_unavailable" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid availability without starting an area request", async () => {
    const fetch = mockFetch(csv, "<html>" + key + "</html>");
    await expect(probeFirms({}, { mapKey: key, fetch }))
      .rejects.toMatchObject({ code: "invalid_availability" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    "<html>not a CSV</html>",
    header + "18.8,-70.7,2025-01-30,1230,Terra,80,2\n",
    header + "18.8,-70.7,2025-01-31,1230,NOAA-20,80,2\n",
    header + "18.8,-70.7,2025-01-31,1230,Terra,80,-2\n",
    header + "20,-70.7,2025-01-31,1230,Terra,80,2\n",
    header + "18.8,-70.7,2025-01-31,2530,Terra,80,2\n",
    "latitude,latitude,longitude,acq_date,acq_time,satellite,confidence,frp\n" +
      "18.8,0,-70.7,2025-01-31,1230,Terra,80,2\n",
    header + "18.8,-70.7,2025-01-31,1230,Terra,80,2,extra\n",
    header + "18.8,-70.7,2025-01-31,1230,Terra,80\n",
  ])("fails instead of returning a misleading empty result", async (badCsv) => {
    vi.useFakeTimers();
    const pending = probeFirms({}, { mapKey: key, fetch: mockFetch(badCsv) });
    const rejected = expect(pending).rejects.toMatchObject({ code: "invalid_csv" });
    await vi.runAllTimersAsync();
    await rejected;
  });

  it.each([401, 429, 500])("never retries upstream status %i", async (status) => {
    const fetch = vi.fn<FetchLike>().mockResolvedValue(new Response(key, { status }));
    await expect(probeFirms({}, { mapKey: key, fetch }))
      .rejects.toMatchObject({ code: "upstream_error" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("bounds availability even when injected fetch ignores its AbortSignal", async () => {
    vi.useFakeTimers();
    const fetch: FetchLike = () => new Promise(() => {});
    const rejected = expect(probeFirms({}, {
      mapKey: key, fetch, timeoutMs: 5,
    })).rejects.toMatchObject({ code: "timeout" });
    await vi.runAllTimersAsync();
    await rejected;
  });

  it("cancels between availability and area without an extra request", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetch = mockFetch();
    const pending = probeFirms({}, { mapKey: key, fetch, signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await vi.runAllTimersAsync();
    await rejected;
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sanitizes thrown errors, including arbitrary URLs and response text", async () => {
    const fetch: FetchLike = async () => { throw new Error("https://host/" + key); };
    const error = await probeFirms({}, { mapKey: key, fetch }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(FirmsProbeError);
    expect(String(error)).not.toContain(key);
    expect((error as Error).cause).toBeUndefined();
    expect((error as Error).stack).not.toContain(key);
  });
});

describe("FIRMS smoke CLI before authentication", () => {
  const script = "scripts/firms-smoke.mjs";
  const env = { ...process.env, FIRMS_MAP_KEY: "" };
  it("prints help without credentials or network", () => {
    const result = spawnSync(process.execPath, [script, "--help"], { env, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage:");
  });
  it("fails clearly without a key", () => {
    const result = spawnSync(process.execPath, [script], { env, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("missing_key");
  });
  it("does not echo unknown or repeated arguments", () => {
    for (const args of [["--map-key", key], ["--source", "MODIS_SP", "--source", key]]) {
      const result = spawnSync(process.execPath, [script, ...args], { env, encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stderr).code).toBe("invalid_input");
      expect(result.stderr).not.toContain(key);
    }
  });
});
