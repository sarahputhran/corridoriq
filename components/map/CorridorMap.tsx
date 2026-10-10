"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";
import type { LayerSpecification, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { theme } from "@/config/theme";
import { MAP_FONT, MAP_FONT_REGULAR, loadBasemapStyle } from "./basemap";

export type MapLayerKey = "buffer" | "corridor" | "segments" | "wards" | "restorations" | "infraZones" | "permits" | "facilities" | "busStops" | "busRoutes";

interface Props {
  layers: Partial<Record<MapLayerKey, FeatureCollection>>;
  bounds: [number, number, number, number];
  /** Layer groups the reader can switch on and off. */
  toggles?: { key: MapLayerKey; label: string; on: boolean }[];
  height?: number;
  /** Height as CSS classes, for maps that grow on wider screens (e.g. "h-[200px] md:h-[440px]"). Replaces `height`. */
  heightClass?: string;
  ariaLabel: string;
}

const INK = theme.ink;

/** Draw order, bottom to top. Each entry belongs to one toggle group (its source key). */
const OVERLAYS: (LayerSpecification & { source: MapLayerKey })[] = [
  { id: "wards-line", source: "wards", type: "line", paint: { "line-color": INK, "line-width": 1, "line-dasharray": [2, 3], "line-opacity": 0.45 } },
  { id: "busRoutes-line", source: "busRoutes", type: "line", paint: { "line-color": INK, "line-width": 1, "line-opacity": 0.12 } },
  { id: "infraZones-band", source: "infraZones", type: "line", layout: { "line-cap": "butt" }, paint: { "line-color": theme.dept.metro, "line-width": 34, "line-opacity": 0.55 } },
  { id: "restorations-band", source: "restorations", type: "line", layout: { "line-cap": "butt" }, paint: { "line-color": ["case", ["get", "protected"], "#6B6B6B", "#A9A59B"], "line-width": 26, "line-opacity": 0.55 } },
  { id: "buffer-fill", source: "buffer", type: "fill", paint: { "fill-color": theme.accent, "fill-opacity": 0.12 } },
  { id: "buffer-line", source: "buffer", type: "line", paint: { "line-color": INK, "line-width": 1.5, "line-dasharray": [4, 3] } },
  { id: "corridor-casing", source: "corridor", type: "line", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": INK, "line-width": 13 } },
  { id: "corridor-fill", source: "corridor", type: "line", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#FFFFFF", "line-width": 9 } },
  { id: "segments-ticks", source: "segments", type: "symbol", layout: { "symbol-placement": "line", "text-field": ["get", "id"], "text-font": MAP_FONT_REGULAR, "text-size": 10, "text-offset": [0, 1.6] }, paint: { "text-color": INK, "text-halo-color": theme.mapLand, "text-halo-width": 1.5 } },
  { id: "permits-casing", source: "permits", type: "line", layout: { "line-cap": "butt" }, paint: { "line-color": INK, "line-width": 9, "line-offset": ["get", "offset"] } },
  { id: "permits-fill", source: "permits", type: "line", layout: { "line-cap": "butt" }, paint: { "line-color": ["get", "color"], "line-width": 5, "line-offset": ["get", "offset"] } },
  { id: "busStops-dot", source: "busStops", type: "circle", paint: { "circle-radius": 5, "circle-color": "#FFFFFF", "circle-stroke-color": INK, "circle-stroke-width": 2 } },
  { id: "facilities-minor", source: "facilities", type: "circle", filter: ["==", ["get", "letter"], ""], paint: { "circle-radius": 2.5, "circle-color": INK, "circle-opacity": 0.45 } },
  { id: "facilities-box", source: "facilities", type: "circle", filter: ["!=", ["get", "letter"], ""], paint: { "circle-radius": 9, "circle-color": "#FFFFFF", "circle-stroke-color": INK, "circle-stroke-width": 2 } },
  { id: "facilities-letter", source: "facilities", type: "symbol", filter: ["!=", ["get", "letter"], ""], layout: { "text-field": ["get", "letter"], "text-font": MAP_FONT, "text-size": 11, "text-allow-overlap": true, "text-ignore-placement": true }, paint: { "text-color": INK } },
  {
    id: "facilities-name", source: "facilities", type: "symbol", filter: ["has", "label"],
    layout: { "text-field": ["get", "label"], "text-font": MAP_FONT, "text-size": 12, "text-anchor": "left", "text-offset": [1.1, 0], "text-max-width": 12, "text-optional": true },
    paint: { "text-color": INK, "text-halo-color": "#FFFFFF", "text-halo-width": 2.5 },
  },
];

const fmtDate = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));

function describe(layerId: string, p: Record<string, unknown>): { title: string; lines: string[] } | null {
  if (layerId.startsWith("permits")) {
    return {
      title: String(p.permit_id),
      lines: [`${p.department} · ${p.purpose}`, `${fmtDate(String(p.proposed_start))} – ${fmtDate(String(p.proposed_end))}`, `${String(p.road_side)} side · chainage ${Math.round(Number(p.chainage_start_m))}–${Math.round(Number(p.chainage_end_m))} m`, `Status: ${String(p.status).replace(/_/g, " ")}`],
    };
  }
  if (layerId.startsWith("facilities")) return { title: String(p.name ?? "Unnamed"), lines: [String(p.type).replace(/_/g, " ")] };
  if (layerId.startsWith("busStops")) return { title: String(p.stop_name), lines: ["PMPML bus stop"] };
  if (layerId.startsWith("restorations")) {
    return { title: `Restored stretch ${p.id}`, lines: [`${String(p.surface).replace(/_/g, " ")} · completed ${fmtDate(String(p.completed_on))}`, p.protected ? "Protected stretch" : "Not protected", "Synthetic record"] };
  }
  if (layerId.startsWith("infraZones")) return { title: String(p.project_name), lines: [`${p.agency}`, `Status: ${p.status}${p.context_only ? " · context only" : ""}`, "Zone position is approximate"] };
  return null;
}

export function CorridorMap({ layers, bounds, toggles = [], height = 520, heightClass, ariaLabel }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>(() => Object.fromEntries(toggles.map((t) => [t.key, t.on])));
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [selected, setSelected] = useState<{ title: string; lines: string[] } | null>(null);
  const initialVisible = useRef(visible);

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | undefined;
    (async () => {
      try {
        const [maplibregl, style] = await Promise.all([import("maplibre-gl"), loadBasemapStyle()]);
        if (cancelled || !container.current) return;
        maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
        const m = new maplibregl.Map({
          container: container.current,
          style,
          bounds: [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
          fitBoundsOptions: { padding: 48 },
          attributionControl: false,
          cooperativeGestures: true,
        });
        map = m;
        mapRef.current = m;
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
        m.on("load", () => {
          for (const [key, data] of Object.entries(layers)) m.addSource(key, { type: "geojson", data });
          for (const layer of OVERLAYS) {
            if (!layers[layer.source]) continue;
            const on = initialVisible.current[layer.source] ?? true;
            m.addLayer({ ...layer, layout: { ...(layer.layout ?? {}), visibility: on ? "visible" : "none" } } as LayerSpecification);
          }
          const clickable = OVERLAYS.filter((l) => /^(permits-fill|facilities-box|busStops|restorations|infraZones)/.test(l.id) && layers[l.source]).map((l) => l.id);
          m.on("click", (e) => {
            const hit = m.queryRenderedFeatures(e.point, { layers: clickable.reverse() })[0];
            setSelected(hit ? describe(hit.layer.id, hit.properties as Record<string, unknown>) : null);
          });
          for (const id of clickable) {
            m.on("mouseenter", id, () => (m.getCanvas().style.cursor = "pointer"));
            m.on("mouseleave", id, () => (m.getCanvas().style.cursor = ""));
          }
          setState("ready");
        });
        m.on("error", (e) => {
          // Tile hiccups are routine; only a failed style or source load leaves the map unusable.
          if (!m.isStyleLoaded() && e.error?.message) setState((s) => (s === "ready" ? s : "error"));
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
    for (const layer of OVERLAYS) {
      if (map.getLayer(layer.id) && layer.source in visible) map.setLayoutProperty(layer.id, "visibility", visible[layer.source] ? "visible" : "none");
    }
  }, [visible, state]);

  return (
    <div>
      {toggles.length > 0 && (
        <fieldset className="flex flex-wrap gap-x-5 gap-y-1 border-b-[2.5px] border-ink px-5 py-2.5 text-[13px]">
          <legend className="sr-only">Map layers</legend>
          {toggles.map((t) => (
            <label key={t.key} className="flex min-h-[32px] cursor-pointer items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-[#111111]" checked={visible[t.key] ?? true} onChange={(e) => setVisible((v) => ({ ...v, [t.key]: e.target.checked }))} />
              {t.label}
            </label>
          ))}
        </fieldset>
      )}
      <div className={`relative ${heightClass ?? ""}`} style={heightClass ? undefined : { height }}>
        <div ref={container} role="application" aria-label={ariaLabel} className="h-full w-full bg-map-land" />
        {state === "loading" && <p className="absolute left-4 top-4 chip">Loading map…</p>}
        {state === "error" && (
          <p role="alert" className="absolute left-4 top-4 max-w-xs border-2 border-ink bg-status-block-tint p-3 text-[13px]">
            The background map could not load. Check your connection and reload the page.
          </p>
        )}
        {selected && (
          <div className="absolute bottom-10 left-4 max-w-[min(320px,calc(100%-2rem))] border-[2.5px] border-ink bg-card p-3 shadow-btn">
            <div className="flex items-start justify-between gap-3">
              <p className="font-mono text-[13px] font-semibold">{selected.title}</p>
              <button type="button" onClick={() => setSelected(null)} className="border-2 border-ink px-1.5 text-xs font-semibold" aria-label="Close details">
                ✕
              </button>
            </div>
            {selected.lines.map((line) => (
              <p key={line} className="mt-1 text-[13px]">
                {line}
              </p>
            ))}
          </div>
        )}
        <p className="absolute bottom-1 left-2 bg-card/85 px-1.5 text-[11px]">
          ©{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap contributors
          </a>{" "}
          ·{" "}
          <a href="https://openfreemap.org" target="_blank" rel="noreferrer">
            OpenFreeMap
          </a>
        </p>
      </div>
    </div>
  );
}
