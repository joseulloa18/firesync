import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadObservedRecent } from "@/lib/firms/observed-recent";

// All upstream responses here are synthetic fixtures, never observed evidence.
const now = new Date("2024-03-03T12:00:00Z");
const key = "a".repeat(32);
const wait = async () => {};
async function csv(name: string) {
  return (await readFile(`tests/data/fixtures/${name}`, "utf8"))
    .split("\n")
    .filter((s) => !s.startsWith("#"))
    .join("\n");
}
describe("observed snapshot contract with synthetic HTTP fixtures", () => {
  it("preserves provenance, missing FRP, product windows and deterministic IDs", async () => {
    const modis = await csv("synthetic-modis.csv");
    const viirs = (await csv("synthetic-viirs-snpp.csv")).replace(
      ",6.2,D,0",
      ",,D,0",
    );
    const calls: string[] = [];
    const result = await loadObservedRecent({
      mapKey: key,
      now,
      wait,
      fetcher: async (input) => {
        const url = String(input);
        calls.push(url);
        const source = url.includes("VIIRS") ? "VIIRS_SNPP_NRT" : "MODIS_NRT";
        return new Response(
          url.includes("data_availability")
            ? `data_id,min_date,max_date\n${source},2024-03-01,2024-03-02`
            : source === "MODIS_NRT"
              ? modis
              : viirs,
        );
      },
    });
    expect(calls).toHaveLength(4);
    expect(result.products.every((p) => p.status === "ok")).toBe(true);
    expect(result.products[0]).toMatchObject({
      from: "2024-03-01",
      through: "2024-03-02",
    });
    expect(result.records).toHaveLength(6);
    expect(result.records.some((r) => r.frpMw === null)).toBe(true);
    expect(
      result.records.every(
        (r) => r.is_demo === false && r.source.endsWith("_NRT"),
      ),
    ).toBe(true);
    expect(result.records.every((r) => /^[a-f0-9]{64}$/.test(r.id))).toBe(true);
    expect(result.persisted).toBe(false);
    expect(JSON.stringify(result)).not.toContain(key);
  });
  it("keeps failures distinct from successful zero results without fixture fallback", async () => {
    const header = (await csv("synthetic-modis.csv")).split("\n")[0];
    const result = await loadObservedRecent({
      mapKey: key,
      now,
      wait,
      fetcher: async (input) => {
        const url = String(input);
        if (url.includes("VIIRS"))
          return new Response("failure", { status: 503 });
        return new Response(
          url.includes("data_availability")
            ? "data_id,min_date,max_date\nMODIS_NRT,2024-03-01,2024-03-02"
            : header,
        );
      },
    });
    expect(result.records).toEqual([]);
    expect(result.products.map((p) => p.status)).toEqual(["ok", "unavailable"]);
    expect(result.products[1].through).toBeNull();
  });
  it("rejects marked fixtures and sanitizes upstream errors", async () => {
    const fixture = await readFile(
      "tests/data/fixtures/synthetic-modis.csv",
      "utf8",
    );
    const result = await loadObservedRecent({
      mapKey: key,
      now,
      wait,
      fetcher: async (input) => {
        const url = String(input);
        const source = url.includes("VIIRS") ? "VIIRS_SNPP_NRT" : "MODIS_NRT";
        if (url.includes("VIIRS") && !url.includes("data_availability"))
          throw new Error(url);
        return new Response(
          url.includes("data_availability")
            ? `data_id,min_date,max_date\n${source},2024-03-01,2024-03-02`
            : fixture,
        );
      },
    });
    expect(result.products.every((p) => p.status === "unavailable")).toBe(true);
    expect(result.records).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(key);
  });
  it("rejects out-of-window rows rather than publishing a partial product", async () => {
    const modis = await csv("synthetic-modis.csv");
    const result = await loadObservedRecent({
      mapKey: key,
      now,
      wait,
      fetcher: async (input) => {
        const url = String(input);
        const source = url.includes("VIIRS") ? "VIIRS_SNPP_NRT" : "MODIS_NRT";
        return new Response(
          url.includes("data_availability")
            ? `data_id,min_date,max_date\n${source},2024-03-02,2024-03-02`
            : modis,
        );
      },
    });
    expect(result.records).toEqual([]);
    expect(result.products.every((p) => p.status === "unavailable")).toBe(true);
  });
});
