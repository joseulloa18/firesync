export type DemoSensor = "MODIS" | "VIIRS";
export type DemoSensorFilter = "all" | DemoSensor;
export type DemoMode = "history" | "recent" | "preview";

export type DemoDetection = {
  id: string;
  sensor: DemoSensor;
  satellite: string;
  acquiredAt: string;
  coordinates: [number, number];
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

export type DemoFilter = {
  mode?: DemoMode;
  sensor?: DemoSensorFilter;
  day?: number;
};

/** Pure filter used by the map and its accessible data list. */
export function filterDemoDetections({
  mode = "history",
  sensor = "all",
  day,
}: DemoFilter = {}): DemoDetection[] {
  const matches = mapDemoDetections
    .filter((item) => sensor === "all" || item.sensor === sensor)
    .filter(
      (item) =>
        day === undefined || Number(item.acquiredAt.slice(8, 10)) === day,
    )
    .slice()
    .sort((a, b) => a.acquiredAt.localeCompare(b.acquiredAt));

  if (mode === "recent") return matches.slice(-5);
  if (mode === "preview") return matches.slice(0, 8);
  return matches;
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
  for (const [lng, lat] of points) {
    const last = clean[clean.length - 1];
    if (!last || last[0] !== lng || last[1] !== lat) clean.push([lng, lat]);
  }

  if (closed && clean.length >= 3) {
    return {
      type: "Feature",
      properties: { is_demo: true },
      geometry: {
        type: "Polygon",
        coordinates: [[...clean, [clean[0][0], clean[0][1]]]],
      },
    };
  }

  return {
    type: "Feature",
    properties: { is_demo: true },
    geometry: { type: "LineString", coordinates: clean },
  };
}
