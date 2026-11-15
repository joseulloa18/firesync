"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
} from "maplibre-gl";
import {
  buildAoiGeoJSON,
  DEMO_CENTER,
  DEMO_ZOOM,
  filterDemoDetections,
  filterDetectionRecords,
  getDetectionBounds,
  type DemoDetection,
  type DemoMode,
  type DemoSensor,
  type DemoSensorFilter,
} from "@/content/map-demo";
import "maplibre-gl/dist/maplibre-gl.css";
import "./fire-map.css";

export type FireMapLabels = {
  loading: string;
  error: string;
  retry: string;
  unavailable: string;
  zoomIn: string;
  zoomOut: string;
  reset: string;
  draw: string;
  clear: string;
  attribution: string;
  legend: string;
  modis: string;
  viirs: string;
  demo: string;
};

export type FireMapProps = {
  labels: FireMapLabels;
  detections?: readonly DemoDetection[];
  mode?: DemoMode;
  sensor?: DemoSensorFilter;
  day?: number;
  onSelect?: (detection: DemoDetection) => void;
};

type MapModule = typeof import("maplibre-gl");
type MapStatus = "loading" | "ready" | "error" | "unavailable";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

function fitToDetections(
  map: MapLibreMap | null,
  detections: readonly DemoDetection[],
) {
  const bounds = getDetectionBounds(detections);
  if (!map || !bounds) return false;
  map.fitBounds(bounds, { padding: 48, maxZoom: 11, duration: 0 });
  return true;
}

export function FireMap({
  labels,
  detections: suppliedDetections,
  mode = "history",
  sensor = "all",
  day,
  onSelect,
}: FireMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const moduleRef = useRef<MapModule | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const labelsRef = useRef(labels);
  const onSelectRef = useRef(onSelect);
  const drawingRef = useRef(false);
  const [status, setStatus] = useState<MapStatus>("loading");
  const [tileError, setTileError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [styleReady, setStyleReady] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [finished, setFinished] = useState(false);
  const [points, setPoints] = useState<[number, number][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const lastFitSignature = useRef<string | null>(null);

  const detections = useMemo(
    () =>
      suppliedDetections
        ? filterDetectionRecords(suppliedDetections, { sensor, day })
        : filterDemoDetections({ mode, sensor, day }),
    [suppliedDetections, mode, sensor, day],
  );
  const suppliedSignature = useMemo(
    () =>
      suppliedDetections
        ? suppliedDetections
            .map(
              (item) =>
                `${item.id}|${item.sensor}|${item.acquiredAt}|${item.coordinates[0]}|${item.coordinates[1]}`,
            )
            .join(";")
        : null,
    [suppliedDetections],
  );

  useEffect(() => {
    labelsRef.current = labels;
  }, [labels]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    drawingRef.current = drawing;
    const map = mapRef.current;
    if (!map) return;
    if (drawing) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
  }, [drawing]);

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let timeout: number | undefined;
    const container = containerRef.current;
    if (!container) return;

    setStatus("loading");
    setTileError(false);

    void (async () => {
      let maplibre: MapModule;
      try {
        maplibre = await import("maplibre-gl");
        maplibre.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
      } catch {
        if (!cancelled) setStatus("error");
        return;
      }
      if (cancelled) return;

      try {
        map = new maplibre.Map({
          container,
          style: STYLE_URL,
          center: DEMO_CENTER,
          zoom: DEMO_ZOOM,
          attributionControl: {
            compact: true,
            customAttribution: labelsRef.current.attribution,
          },
        });
      } catch {
        if (!cancelled) setStatus("unavailable");
        return;
      }

      moduleRef.current = maplibre;
      mapRef.current = map;
      setMapReady(true);
      map.addControl(new maplibre.NavigationControl(), "top-right");

      const setControlLabel = (selector: string, text: string) => {
        const element = container.querySelector<HTMLButtonElement>(selector);
        if (element) {
          element.title = text;
          element.setAttribute("aria-label", text);
        }
      };
      setControlLabel(".maplibregl-ctrl-zoom-in", labelsRef.current.zoomIn);
      setControlLabel(".maplibregl-ctrl-zoom-out", labelsRef.current.zoomOut);

      map.on("load", () => {
        if (cancelled) return;
        setStatus("ready");
        setStyleReady(true);
        setTileError(false);
        if (timeout !== undefined) window.clearTimeout(timeout);
      });
      map.on("error", () => {
        if (cancelled) return;
        setTileError(true);
        setStatus((current) =>
          current === "loading" ? "unavailable" : current,
        );
      });
      map.on("idle", () => {
        if (cancelled) return;
        setTileError(false);
        setStatus((current) => (current === "unavailable" ? "ready" : current));
      });
      map.on("click", (event) => {
        if (!drawingRef.current) return;
        const point: [number, number] = [
          Number(event.lngLat.lng.toFixed(5)),
          Number(event.lngLat.lat.toFixed(5)),
        ];
        setPoints((current) => {
          const last = current[current.length - 1];
          if (last && last[0] === point[0] && last[1] === point[1]) {
            return current;
          }
          return [...current, point];
        });
        setFinished(false);
      });
      map.on("dblclick", (event) => {
        if (!drawingRef.current) return;
        event.preventDefault();
        drawingRef.current = false;
        setDrawing(false);
        setFinished(true);
        map?.doubleClickZoom.enable();
      });

      timeout = window.setTimeout(() => {
        if (!cancelled) {
          setStatus((current) =>
            current === "loading" ? "unavailable" : current,
          );
        }
      }, 12000);

      resizeObserver = new ResizeObserver(() => map?.resize());
      resizeObserver.observe(container);
    })();

    return () => {
      cancelled = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
      resizeObserver?.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      moduleRef.current = null;
      mapRef.current = null;
      setMapReady(false);
      setStyleReady(false);
      try {
        map?.remove();
      } catch {
        // MapLibre can throw when WebGL never initialized.
      }
    };
  }, [retryToken]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const zoomIn = container.querySelector<HTMLButtonElement>(
      ".maplibregl-ctrl-zoom-in",
    );
    const zoomOut = container.querySelector<HTMLButtonElement>(
      ".maplibregl-ctrl-zoom-out",
    );
    if (zoomIn) {
      zoomIn.title = labels.zoomIn;
      zoomIn.setAttribute("aria-label", labels.zoomIn);
    }
    if (zoomOut) {
      zoomOut.title = labels.zoomOut;
      zoomOut.setAttribute("aria-label", labels.zoomOut);
    }
  }, [labels, status]);

  const selectDetection = useCallback((detection: DemoDetection) => {
    setSelectedId(detection.id);
    onSelectRef.current?.(detection);
  }, []);

  useEffect(() => {
    if (!mapReady) {
      lastFitSignature.current = null;
      return;
    }
    if (!suppliedDetections || suppliedSignature === null) return;
    if (lastFitSignature.current === suppliedSignature) return;
    lastFitSignature.current = suppliedSignature;
    fitToDetections(mapRef.current, suppliedDetections);
  }, [mapReady, suppliedDetections, suppliedSignature]);

  useEffect(() => {
    const maplibre = moduleRef.current;
    const map = mapRef.current;
    if (!maplibre || !map || !mapReady) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = detections.map((detection) => {
      const button = document.createElement("button");
      const sensorText =
        detection.sensor === "MODIS" ? labels.modis : labels.viirs;
      button.type = "button";
      button.className = `fmap-marker fmap-${detection.sensor.toLowerCase()}`;
      if (detection.id === selectedId) button.classList.add("is-selected");
      button.setAttribute(
        "aria-label",
        `${sensorText} ${detection.acquiredAt} ${labels.demo}`,
      );
      button.title = `${sensorText} ${detection.acquiredAt}`;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        selectDetection(detection);
      });
      return new maplibre.Marker({ element: button, anchor: "center" })
        .setLngLat(detection.coordinates)
        .addTo(map);
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };
  }, [detections, labels, mapReady, selectDetection, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const data = buildAoiGeoJSON(points, finished) as Parameters<
      GeoJSONSource["setData"]
    >[0];
    const source = map.getSource("demo-aoi") as GeoJSONSource | undefined;
    if (!source) {
      map.addSource("demo-aoi", { type: "geojson", data });
      map.addLayer({
        id: "demo-aoi-fill",
        type: "fill",
        source: "demo-aoi",
        paint: { "fill-color": "#f59e0b", "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: "demo-aoi-line",
        type: "line",
        source: "demo-aoi",
        paint: { "line-color": "#b45309", "line-width": 2 },
      });
    } else {
      source.setData(data);
    }
  }, [finished, points, styleReady]);

  function resetView() {
    if (
      suppliedDetections &&
      fitToDetections(mapRef.current, suppliedDetections)
    ) {
      return;
    }
    mapRef.current?.flyTo({ center: DEMO_CENTER, zoom: DEMO_ZOOM });
  }

  function toggleDraw() {
    const map = mapRef.current;
    if (drawing) {
      drawingRef.current = false;
      setDrawing(false);
      setFinished(points.length >= 3);
      map?.doubleClickZoom.enable();
    } else {
      drawingRef.current = true;
      setDrawing(true);
      setFinished(false);
      setPoints([]);
      map?.doubleClickZoom.disable();
    }
  }

  function clearDrawing() {
    drawingRef.current = false;
    setDrawing(false);
    setFinished(false);
    setPoints([]);
    mapRef.current?.doubleClickZoom.enable();
  }

  const sensorText = (value: DemoSensor) =>
    value === "MODIS" ? labels.modis : labels.viirs;
  const statusText =
    status === "loading"
      ? labels.loading
      : status === "error"
        ? labels.error
        : labels.unavailable;

  return (
    <div className="fmap-shell">
      <div
        ref={containerRef}
        className={`fmap-stage${drawing ? " fmap-drawing" : ""}`}
        aria-label={labels.legend}
      >
        {(status !== "ready" || tileError) && (
          <div
            className="fmap-status"
            role={status === "ready" ? "status" : "alert"}
          >
            <span>{status === "ready" ? labels.unavailable : statusText}</span>
            {status !== "loading" && (
              <button type="button" onClick={() => setRetryToken((n) => n + 1)}>
                {labels.retry}
              </button>
            )}
          </div>
        )}
        <div className="fmap-controls">
          <button type="button" onClick={resetView}>
            {labels.reset}
          </button>
          <button type="button" aria-pressed={drawing} onClick={toggleDraw}>
            {labels.draw}
          </button>
          <button
            type="button"
            onClick={clearDrawing}
            disabled={!points.length && !finished}
          >
            {labels.clear}
          </button>
        </div>
      </div>

      <div className="fmap-legend" aria-label={labels.legend}>
        <span>
          <i className="fmap-swatch fmap-modis" aria-hidden="true" />
          {labels.modis}
        </span>
        <span>
          <i className="fmap-swatch fmap-viirs" aria-hidden="true" />
          {labels.viirs}
        </span>
        <span className="fmap-badge">{labels.demo}</span>
      </div>

      <section className="fmap-list" aria-labelledby="fmap-list-title">
        <h2 id="fmap-list-title">{labels.legend}</h2>
        {detections.length === 0 ? (
          <p>{labels.unavailable}</p>
        ) : (
          <ul>
            {detections.map((detection) => (
              <li key={detection.id}>
                <button
                  type="button"
                  aria-pressed={detection.id === selectedId}
                  aria-label={`${sensorText(detection.sensor)} ${detection.acquiredAt} ${labels.demo}`}
                  onClick={() => {
                    selectDetection(detection);
                    mapRef.current?.flyTo({
                      center: detection.coordinates,
                      zoom: 11,
                    });
                  }}
                >
                  <i
                    className={`fmap-swatch fmap-${detection.sensor.toLowerCase()}`}
                    aria-hidden="true"
                  />
                  <span>{sensorText(detection.sensor)}</span>
                  <span>{detection.satellite}</span>
                  <time dateTime={detection.acquiredAt}>
                    {detection.acquiredAt}
                  </time>
                  <span>{detection.confidence}</span>
                  <span>{detection.frpMw}</span>
                  <span className="fmap-badge">{labels.demo}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
