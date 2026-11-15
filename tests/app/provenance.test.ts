import { describe, expect, it } from "vitest";
import {
  createSyntheticProvenance,
  newestAcquisition,
  provenanceSchema,
} from "../../src/lib/provenance";

const records = [
  { sensor: "MODIS", acquiredAt: "2026-11-15T17:42:00Z" },
  { sensor: "VIIRS", acquiredAt: "2026-11-15T16:18:00Z" },
  { sensor: "MODIS", acquiredAt: "2026-11-13T15:48:00Z" },
];

describe("provenance", () => {
  it("uses the newest acquiredAt among the exact visible records", () => {
    expect(newestAcquisition(records)).toBe("2026-11-15T17:42:00.000Z");
  });

  it("reflects the record subset produced by a sensor filter", () => {
    const viirs = createSyntheticProvenance(
      records.filter((record) => record.sensor === "VIIRS"),
    );
    expect(viirs.visibleRecords).toBe(1);
    expect(viirs.newestAcquiredAt).toBe("2026-11-15T16:18:00.000Z");
    expect(viirs.status).toBe("ready");
  });

  it("keeps the real ingestion date unavailable when none is provided", () => {
    const provenance = createSyntheticProvenance(records);
    expect(provenance.lastIngestionAt).toBeNull();
    expect(provenance.source).toBe("synthetic-fixture");
    expect(provenance.expectedProviderConnected).toBe(false);
  });

  it("ignores invalid acquisition dates and invalid ingestion metadata", () => {
    const provenance = createSyntheticProvenance(
      [{ acquiredAt: "not-a-date" }, { acquiredAt: "2026-11-15T16:18:00Z" }],
      "yesterday",
    );
    expect(provenance.newestAcquiredAt).toBe("2026-11-15T16:18:00.000Z");
    expect(provenance.lastIngestionAt).toBeNull();
    expect(
      provenanceSchema.safeParse({
        ...provenance,
        newestAcquiredAt: "not-a-date",
      }).success,
    ).toBe(false);
  });

  it("marks zero visible records as noData", () => {
    const provenance = createSyntheticProvenance([]);
    expect(provenance.status).toBe("noData");
    expect(provenance.newestAcquiredAt).toBeNull();
    expect(provenance.visibleRecords).toBe(0);
  });
});
