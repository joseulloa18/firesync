import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { createFirmsClient } from "../firms-client/client";
import { createBoundedFirmsFetch } from "../firms-client/bounded-fetch";
import { parseFirmsAvailabilityCsv } from "../firms-client/availability";
import type { FetchLike } from "../firms-client/types";
import { parseFirmsCsv } from "./csv";
import {
  observedSnapshotSchema,
  type ObservedSnapshot,
} from "./observed-schema";

// Fixed acquisition area, never a user-supplied URL or unbounded public query.
export const OBSERVED_BBOX = [-72.1, 17.4, -68.2, 20.1] as const;
const SOURCES = ["MODIS_NRT", "VIIRS_SNPP_NRT"] as const;
const DAY = 86400000;

export async function loadObservedRecent({
  mapKey,
  fetcher = fetch,
  now = new Date(),
  wait = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
}: {
  mapKey: string;
  fetcher?: FetchLike;
  now?: Date;
  wait?: (ms: number) => Promise<void>;
}): Promise<ObservedSnapshot> {
  const signal = AbortSignal.timeout(45000);
  const bounded = createBoundedFirmsFetch(fetcher, 2 * 1024 * 1024);
  let previous = 0;
  const paced: FetchLike = async (url, init) => {
    const delay = Math.max(0, 1000 - (Date.now() - previous));
    if (delay) await wait(delay);
    signal.throwIfAborted();
    previous = Date.now();
    return bounded(url, { ...init, signal });
  };
  const products: ObservedSnapshot["products"] = [];
  const records: ObservedSnapshot["records"] = [];
  for (const source of SOURCES) {
    try {
      const client = createFirmsClient({
        mapKey,
        fetch: paced,
        maxRetries: 0,
        timeoutMs: 45000,
      });
      const response = await paced(
        `https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/${encodeURIComponent(mapKey)}/${source}`,
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error();
      }
      const availability = parseFirmsAvailabilityCsv(
        await response.text(),
        source,
      );
      const through = [
        availability.maxDate,
        now.toISOString().slice(0, 10),
      ].sort()[0];
      if (through < availability.minDate) throw new Error();
      const end = Date.parse(`${through}T00:00:00Z`);
      const start = Math.max(
        end - 6 * DAY,
        Date.parse(`${availability.minDate}T00:00:00Z`),
      );
      const productRecords: ObservedSnapshot["records"] = [];
      // At most two requests of <=5 days per product; no automatic retry.
      for (let cursor = start; cursor <= end; cursor += 5 * DAY) {
        const days = Math.min(5, Math.floor((end - cursor) / DAY) + 1);
        const csv = await client.download(
          {
            source,
            bbox: OBSERVED_BBOX,
            dayRange: days,
            date: new Date(cursor).toISOString().slice(0, 10),
          },
          { signal },
        );
        if (/^\s*#.*synthetic/im.test(csv)) throw new Error();
        const parsed = parseFirmsCsv(csv, {
          source,
          bbox: {
            west: OBSERVED_BBOX[0],
            south: OBSERVED_BBOX[1],
            east: OBSERVED_BBOX[2],
            north: OBSERVED_BBOX[3],
          },
        });
        if (parsed.rowsRejected || parsed.rowsRead > 10000) throw new Error();
        for (const row of parsed.detections) {
          const acquired = Date.parse(row.acqAt);
          if (
            acquired < cursor ||
            acquired >= cursor + days * DAY ||
            acquired > now.getTime()
          )
            throw new Error();
          productRecords.push({
            id: createHash("sha256")
              .update(
                [
                  source,
                  row.satellite,
                  row.acqAt,
                  row.longitude,
                  row.latitude,
                ].join(":"),
              )
              .digest("hex"),
            sensor: row.sensor,
            satellite: row.satellite,
            acquiredAt: row.acqAt,
            coordinates: [row.longitude, row.latitude],
            confidence: row.confidenceRaw,
            frpMw: row.frp,
            source,
            is_demo: false,
          });
        }
      }
      const unique = [
        ...new Map(productRecords.map((row) => [row.id, row])).values(),
      ];
      if (unique.length > 2500) throw new Error();
      // Validate before committing a product; failures never leave partial rows.
      observedSnapshotSchema.shape.records.parse(unique);
      records.push(...unique);
      products.push({
        source,
        status: "ok",
        from: new Date(start).toISOString().slice(0, 10),
        through,
        records: unique.length,
      });
    } catch {
      // Never log upstream errors or URLs: FIRMS embeds the secret in the path.
      products.push({
        source,
        status: "unavailable",
        from: null,
        through: null,
        records: 0,
      });
    }
  }
  return observedSnapshotSchema.parse({
    origin: "observed",
    downloadedAt: new Date().toISOString(),
    persisted: false,
    coverage: "not_assessed",
    bbox: OBSERVED_BBOX,
    products,
    records: records.sort((a, b) => b.acquiredAt.localeCompare(a.acquiredAt)),
  });
}

export async function getObservedRecent(): Promise<ObservedSnapshot | null> {
  const mapKey = process.env.FIRMS_MAP_KEY;
  if (!mapKey) return null;
  const fingerprint = createHash("sha256").update(mapKey).digest("hex");
  // Next data cache reuses bounded snapshots for 15 minutes; not a distributed quota.
  // No credentials, arbitrary area or refresh parameter is exposed to clients.
  return unstable_cache(
    () => loadObservedRecent({ mapKey }),
    ["observed-recent-v1", fingerprint],
    { revalidate: 900 },
  )();
}
