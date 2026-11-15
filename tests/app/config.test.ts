import { describe, expect, it } from "vitest";
import { parseConfig, healthSchema } from "../../src/lib/config";
import { GET } from "../../src/app/api/health/route";
import es from "../../messages/es.json";
import en from "../../messages/en.json";
describe("safe configuration", () => {
  it("starts offline without credentials", () => {
    expect(parseConfig({}).DEMO_MODE).toBe(true);
  });
  it("rejects live mode without required keys", () => {
    expect(() => parseConfig({ DEMO_MODE: "false" })).toThrow("FIRMS_MAP_KEY");
  });
  it("does not treat false as truthy or accept malformed booleans", () => {
    expect(() => parseConfig({ DEMO_MODE: "yes" })).toThrow(
      "Invalid configuration",
    );
  });
  it("does not expose secrets in errors", () => {
    expect(() => parseConfig({ APP_BASE_URL: "secret-value" })).toThrow(
      "Invalid configuration: APP_BASE_URL",
    );
    try {
      parseConfig({ APP_BASE_URL: "secret-value" });
    } catch (error) {
      expect(String(error)).not.toContain("secret-value");
    }
  });
  it("reports unconnected dependencies honestly", async () => {
    const result = await GET().json();
    expect(healthSchema.parse(result)).toMatchObject({
      database: "not_connected",
      lastIngestAt: null,
      email: "disabled",
    });
  });
  it("keeps translation contracts aligned", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
    expect(Object.keys(en.nav).sort()).toEqual(Object.keys(es.nav).sort());
    expect(en.months).toHaveLength(12);
    expect(es.months).toHaveLength(12);
  });
});
