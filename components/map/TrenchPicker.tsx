"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, LineString } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { theme } from "@/config/theme";
import { MAP_FONT, loadBasemapStyle } from "./basemap";

export interface Point {
  lng: number;
  lat: number;
}

interface Props {
  layers: { corridor: FeatureCollection; permits: FeatureCollection; facilities: FeatureCollection };
  bounds: [number, number, number, number];
  start: Point | null;
  end: Point | null;
  /** The snapped trench returned by the pre-check, drawn on the road line. */
  trench: LineString | null;
  onChange: (start: Point | null, end: Point | null) => void;
}

const INK = theme.ink;
const empty: FeatureCollection = { type: "FeatureCollection", features: [] };

/** Click the start, then the end. A third click starts again. */
export function TrenchPicker({ layers, bounds, start, end, trench, onChange }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const latest = useRef({ start, end, onChange });
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    latest.current = { start, end, onChange };
  });

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | undefined;
    (async () => {
      try {
        const [maplibregl, style] = await Promise.all([import("maplibre-gl"), loadBasemapStyle()]);
        if (cancelled || !container.current) return;
        maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
        // A prefilled trench opens zoomed in on it; otherwise the whole corridor is shown.
        const { start: s0, end: e0 } = latest.current;
        const pad = 0.0035;
        const view: [[number, number], [number, number]] =
          s0 && e0
            ? [[Math.min(s0.lng, e0.lng) - pad, Math.min(s0.lat, e0.lat) - pad], [Math.max(s0.lng, e0.lng) + pad, Math.max(s0.lat, e0.lat) + pad]]
            : [[bounds[0], bounds[1]], [bounds[2], bounds[3]]];
        const m = new maplibregl.Map({ container: container.current, style, bounds: view, fitBoundsOptions: { padding: 40 }, attributionControl: false });
        map = m;
        mapRef.current = m;
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
        m.getCanvas().style.cursor = "crosshair";
        m.on("load", () => {
          m.addSource("corridor", { type: "geojson", data: layers.corridor });
          m.addSource("permits", { type: "geojson", data: layers.permits });
          m.addSource("facilities", { type: "geojson", data: layers.facilities });
          m.addSource("trench", { type: "geojson", data: empty });
          m.addSource("pins", { type: "geojson", data: empty });
          m.addLayer({ id: "corridor-casing", source: "corridor", type: "line", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": INK, "line-width": 15 } });
          m.addLayer({ id: "corridor-fill", source: "corridor", type: "line", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#FFFFFF", "line-width": 11 } });
          m.addLayer({ id: "permits-casing", source: "permits", type: "line", paint: { "line-color": INK, "line-width": 6, "line-offset": ["get", "offset"], "line-opacity": 0.7 } });
          m.addLayer({ id: "permits-fill", source: "permits", type: "line", paint: { "line-color": ["get", "color"], "line-width": 3.5, "line-offset": ["get", "offset"] } });
          m.addLayer({ id: "trench-casing", source: "trench", type: "line", layout: { "line-cap": "butt" }, paint: { "line-color": INK, "line-width": 12 } });
          m.addLayer({ id: "trench-fill", source: "trench", type: "line", layout: { "line-cap": "butt" }, paint: { "line-color": theme.accent, "line-width": 7 } });
          m.addLayer({ id: "facilities-box", source: "facilities", type: "circle", filter: ["in", ["get", "letter"], ["literal", ["H", "C", "S"]]], paint: { "circle-radius": 9, "circle-color": "#FFFFFF", "circle-stroke-color": INK, "circle-stroke-width": 2 } });
          m.addLayer({ id: "facilities-letter", source: "facilities", type: "symbol", filter: ["in", ["get", "letter"], ["literal", ["H", "C", "S"]]], layout: { "text-field": ["get", "letter"], "text-font": MAP_FONT, "text-size": 11, "text-allow-overlap": true }, paint: { "text-color": INK } });
          m.addLayer({ id: "pins-dot", source: "pins", type: "circle", paint: { "circle-radius": 10, "circle-color": theme.accent, "circle-stroke-color": INK, "circle-stroke-width": 3 } });
          m.addLayer({ id: "pins-label", source: "pins", type: "symbol", layout: { "text-field": ["get", "label"], "text-font": MAP_FONT, "text-size": 12, "text-offset": [0, -1.6], "text-allow-overlap": true }, paint: { "text-color": INK, "text-halo-color": "#FFFFFF", "text-halo-width": 2.5 } });
          m.on("click", (e) => {
            const point = { lng: Number(e.lngLat.lng.toFixed(7)), lat: Number(e.lngLat.lat.toFixed(7)) };
            const now = latest.current;
            if (!now.start || now.end) now.onChange(point, null);
            else now.onChange(now.start, point);
          });
          setState("ready");
        });
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [layers, bounds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || state !== "ready") return;
    const pins = [start && { ...start, label: "Start" }, end && { ...end, label: "End" }].filter((p): p is Point & { label: string } => Boolean(p));
    (map.getSource("pins") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: pins.map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.lng, p.lat] }, properties: { label: p.label } })),
    });
    (map.getSource("trench") as GeoJSONSource).setData(trench && start && end ? { type: "Feature", geometry: trench, properties: {} } : empty);
  }, [start, end, trench, state]);

  return (
    <div className="relative h-[360px]">
      <div ref={container} role="application" aria-label="Map of Sinhagad Road. Click the start of the trench, then the end." className="h-full w-full bg-map-land" />
      {state === "loading" && <p className="chip absolute left-4 top-4">Loading map…</p>}
      {state === "error" && (
        <p role="alert" className="absolute left-4 top-4 max-w-xs border-2 border-ink bg-status-block-tint p-3 text-[13px]">
          The map could not load. Check your connection and reload the page.
        </p>
      )}
      <p className="absolute bottom-1 left-2 bg-card/85 px-1.5 text-[11px]">
        © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>
      </p>
    </div>
  );
}
