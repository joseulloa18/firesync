export type DemoSensor = "MODIS" | "VIIRS";
export type DemoSensorFilter = "all" | DemoSensor;
export type DemoMode = "history" | "recent" | "preview";

export type MapDetection = {
  id: string;
  sensor: DemoSensor;
  satellite: string;
  acquiredAt: string;
  coordinates: [number, number];
  confidence: number | string | null;
  frpMw: number | null;
  is_demo: boolean;
};

export type DemoDetection = MapDetection & {
  confidence: number;
  frpMw: number;
  is_demo: true;
};

export const DEMO_CENTER: [number, number] = [-70.55, 18.75];
export const DEMO_ZOOM = 9;

/** Synthetic points around the Cordillera Central. No official boundary is implied. */
export const mapDemoDetections: readonly DemoDetection[] = [
  {
    id: "demo-modis-01",
    sensor: "MODIS",
    satellite: "Terra",
    acquiredAt: "2025-03-03T14:10:00.000Z",
    coordinates: [-70.61, 18.72],
    confidence: 71,
    frpMw: 8.4,
    is_demo: true,
  },
  {
    id: "demo-viirs-01",
    sensor: "VIIRS",
    satellite: "S-NPP",
    acquiredAt: "2025-03-04T17:45:00.000Z",
    coordinates: [-70.53, 18.78],
    confidence: 82,
    frpMw: 4.1,
    is_demo: true,
  },
  {
    id: "demo-modis-02",
    sensor: "MODIS",
    satellite: "Aqua",
    acquiredAt: "2025-03-05T18:20:00.000Z",
    coordinates: [-70.58, 18.69],
    confidence: 64,
    frpMw: 12.6,
    is_demo: true,
  },
  {
    id: "demo-viirs-02",
    sensor: "VIIRS",
    satellite: "S-NPP",
    acquiredAt: "2025-03-07T16:05:00.000Z",
    coordinates: [-70.48, 18.81],
    confidence: 90,
    frpMw: 2.8,
    is_demo: true,
  },
  {
    id: "demo-modis-03",
    sensor: "MODIS",
    satellite: "Terra",
    acquiredAt: "2025-03-08T14:30:00.000Z",
    coordinates: [-70.64, 18.76],
    confidence: 55,
    frpMw: 15.2,
    is_demo: true,
  },
  {
    id: "demo-viirs-03",
    sensor: "VIIRS",
    satellite: "S-NPP",
    acquiredAt: "2025-03-09T17:20:00.000Z",
    coordinates: [-70.56, 18.73],
    confidence: 76,
    frpMw: 6.7,
    is_demo: true,
  },
  {
    id: "demo-modis-04",
    sensor: "MODIS",
    satellite: "Aqua",
    acquiredAt: "2025-03-11T18:05:00.000Z",
    coordinates: [-70.51, 18.67],
    confidence: 88,
    frpMw: 9.9,
    is_demo: true,
  },
  {
    id: "demo-viirs-04",
    sensor: "VIIRS",
    satellite: "S-NPP",
    acquiredAt: "2025-03-12T16:40:00.000Z",
    coordinates: [-70.6, 18.82],
    confidence: 61,
    frpMw: 3.6,
    is_demo: true,
  },
  {
    id: "demo-modis-05",
    sensor: "MODIS",
    satellite: "Terra",
    acquiredAt: "2025-03-14T14:55:00.000Z",
    coordinates: [-70.55, 18.75],
    confidence: 79,
    frpMw: 22.4,
    is_demo: true,
  },
  {
    id: "demo-viirs-05",
    sensor: "VIIRS",
    satellite: "S-NPP",
    acquiredAt: "2025-03-15T17:10:00.000Z",
    coordinates: [-70.46, 18.74],
    confidence: 93,
    frpMw: 5.3,
    is_demo: true,
  },
  {
    id: "demo-modis-06",
    sensor: "MODIS",
    satellite: "Aqua",
    acquiredAt: "2025-03-17T18:25:00.000Z",
    coordinates: [-70.63, 18.66],
    confidence: 68,
    frpMw: 7.1,
    is_demo: true,
  },
  {
    id: "demo-viirs-06",
    sensor: "VIIRS",
    satellite: "S-NPP",
    acquiredAt: "2025-03-18T16:15:00.000Z",
    coordinates: [-70.52, 18.8],
    confidence: 84,
    frpMw: 11.8,
    is_demo: true,
  },
  {
    id: "demo-modis-07",
    sensor: "MODIS",
    satellite: "Terra",
    acquiredAt: "2025-03-20T14:40:00.000Z",
    coordinates: [-70.59, 18.77],
    confidence: 73,
    frpMw: 14.5,
    is_demo: true,
  },
  {
    id: "demo-viirs-07",
    sensor: "VIIRS",
    satellite: "S-NPP",
    acquiredAt: "2025-03-21T17:35:00.000Z",
    coordinates: [-70.49, 18.7],
    confidence: 95,
    frpMw: 4.9,
    is_demo: true,
  },
  {
    id: "demo-modis-08",
    sensor: "MODIS",
    satellite: "Aqua",
    acquiredAt: "2025-03-23T18:10:00.000Z",
    coordinates: [-70.57, 18.84],
    confidence: 57,
    frpMw: 18.3,
    is_demo: true,
  },
  {
    id: "demo-viirs-08",
    sensor: "VIIRS",
    satellite: "S-NPP",
    acquiredAt: "2025-03-24T16:50:00.000Z",
    coordinates: [-70.45, 18.75],
    confidence: 80,
    frpMw: 6.2,
    is_demo: true,
  },
];

/** Fictitious cluster centers only; these are not official administrative areas. */
export const DEMO_ZONES: readonly {
  id: string;
  offset: readonly [number, number];
}[] = [
  { id: "demo-zone-a", offset: [0, 0] },
  { id: "demo-zone-b", offset: [-0.12, 0.08] },
  { id: "demo-zone-c", offset: [0.14, -0.09] },
];

export function isValidWgs84Coordinate(
  coordinate: readonly [number, number],
): boolean {
  const [lng, lat] = coordinate;
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

/** Deterministic synthetic month aligned to calendar daily counts. Month is 0-based. */
export function createSyntheticMonthDetections(
  year: number,
  month: number,
  dailyCounts: readonly number[],
  zoneIndex = 0,
): DemoDetection[] {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new RangeError("year must be an integer between 1 and 9999");
  }
  if (!Number.isInteger(month) || month < 0 || month > 11) {
    throw new RangeError("month must be a 0-based integer between 0 and 11");
  }
  if (
    !Number.isInteger(zoneIndex) ||
    zoneIndex < 0 ||
    zoneIndex >= DEMO_ZONES.length
  ) {
    throw new RangeError("zoneIndex must identify one of the fictional zones");
  }
  if (dailyCounts.some((count) => !Number.isInteger(count) || count < 0)) {
    throw new RangeError("dailyCounts must contain non-negative integers");
  }

  const zone = DEMO_ZONES[zoneIndex];
  const monthEnd = new Date(0);
  monthEnd.setUTCFullYear(year, month + 1, 0);
  const daysInMonth = monthEnd.getUTCDate();
  const records: DemoDetection[] = [];
  let serial = 0;

  for (let day = 0; day < daysInMonth; day += 1) {
    const count = dailyCounts[day] ?? 0;
    for (let index = 0; index < count; index += 1) {
      const sensor: DemoSensor = serial % 2 === 0 ? "MODIS" : "VIIRS";
      const satellite =
        sensor === "MODIS" ? (serial % 4 === 0 ? "Terra" : "Aqua") : "S-NPP";
      const angle =
        ((serial * 137.508 + day * 29 + zoneIndex * 53) % 360) *
        (Math.PI / 180);
      const radius =
        0.004 + ((serial * 7 + day * 3 + zoneIndex * 5) % 9) * 0.0015;
      const coordinates: [number, number] = [
        Number(
          (DEMO_CENTER[0] + zone.offset[0] + Math.cos(angle) * radius).toFixed(
            5,
          ),
        ),
        Number(
          (DEMO_CENTER[1] + zone.offset[1] + Math.sin(angle) * radius).toFixed(
            5,
          ),
        ),
      ];
      if (!isValidWgs84Coordinate(coordinates)) {
        throw new RangeError("generated coordinate is outside WGS84");
      }

      const acquired = new Date(0);
      acquired.setUTCFullYear(year, month, day + 1);
      acquired.setUTCHours(
        sensor === "MODIS" ? 13 + (serial % 2) : 16 + (serial % 2),
        (serial * 17 + day * 11 + zoneIndex * 7) % 60,
        0,
        0,
      );

      records.push({
        id: `${zone.id}-${year}-${String(month + 1).padStart(2, "0")}-${String(day + 1).padStart(2, "0")}-${String(index + 1).padStart(3, "0")}`,
        sensor,
        satellite,
        acquiredAt: acquired.toISOString(),
        coordinates,
        confidence: 55 + ((serial * 13 + day * 7 + zoneIndex * 11) % 41),
        frpMw: Number(
          (
            2.5 +
            ((serial * 37 + day * 19 + zoneIndex * 23) % 220) / 10
          ).toFixed(1),
        ),
        is_demo: true,
      });
      serial += 1;
    }
  }

  return records;
}

export type DemoFilter = {
  mode?: DemoMode;
  sensor?: DemoSensorFilter;
  day?: number;
};

function matchesFilter(
  item: MapDetection,
  sensor: DemoSensorFilter,
  day: number | undefined,
) {
  return (
    (sensor === "all" || item.sensor === sensor) &&
    (day === undefined || Number(item.acquiredAt.slice(8, 10)) === day)
  );
}

/** Pure filter used by the map and its accessible data list. */
export function filterDemoDetections({
  mode = "history",
  sensor = "all",
  day,
}: DemoFilter = {}): DemoDetection[] {
  const matches = mapDemoDetections
    .filter((item) => matchesFilter(item, sensor, day))
    .slice()
    .sort((a, b) => a.acquiredAt.localeCompare(b.acquiredAt));

  if (mode === "recent") return matches.slice(-5);
  if (mode === "preview") return matches.slice(0, 8);
  return matches;
}

/** Supplied records keep their exact membership and order; only sensor/day filter. */
export function filterDetectionRecords<T extends MapDetection>(
  detections: readonly T[],
  { sensor = "all", day }: { sensor?: DemoSensorFilter; day?: number } = {},
): T[] {
  return detections.filter((item) => matchesFilter(item, sensor, day));
}

export type DemoBounds = [[number, number], [number, number]];

export function getDetectionBounds(
  detections: readonly MapDetection[],
): DemoBounds | null {
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  for (const detection of detections) {
    if (!isValidWgs84Coordinate(detection.coordinates)) continue;
    const [lng, lat] = detection.coordinates;
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }

  return Number.isFinite(minLng)
    ? [
        [minLng, minLat],
        [maxLng, maxLat],
      ]
    : null;
}

export type DemoAoiGeoJSON = {
  type: "Feature";
  properties: { is_demo: true };
  geometry:
    | { type: "LineString"; coordinates: [number, number][] }
    | { type: "Polygon"; coordinates: [number, number][][] };
};

/** Builds the drawing layer. A closed polygon needs at least three distinct points. */
export function buildAoiGeoJSON(
  points: readonly (readonly [number, number])[],
  closed = false,
): DemoAoiGeoJSON {
  const clean: [number, number][] = [];
  for (const point of points) {
    const coordinate: [number, number] = [point[0], point[1]];
    if (!isValidWgs84Coordinate(coordinate)) continue;
    const last = clean[clean.length - 1];
    if (!last || last[0] !== coordinate[0] || last[1] !== coordinate[1]) {
      clean.push(coordinate);
    }
  }

  const ring = clean.slice();
  if (ring.length > 1) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) ring.pop();
  }
  const distinct = new Set(ring.map(([lng, lat]) => `${lng},${lat}`));

  if (closed && distinct.size >= 3) {
    return {
      type: "Feature",
      properties: { is_demo: true },
      geometry: {
        type: "Polygon",
        coordinates: [[...ring, [ring[0][0], ring[0][1]]]],
      },
    };
  }

  return {
    type: "Feature",
    properties: { is_demo: true },
    geometry: { type: "LineString", coordinates: clean },
  };
}
