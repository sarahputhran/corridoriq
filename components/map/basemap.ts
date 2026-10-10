// OpenFreeMap's free, key-less vector style, recoloured to the design tokens.
import type { StyleSpecification } from "maplibre-gl";
import { theme } from "@/config/theme";

export const BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
export const MAP_FONT = ["Noto Sans Bold"];
export const MAP_FONT_REGULAR = ["Noto Sans Regular"];

const HIDDEN = /^(railway|aeroway|boundary|highway-shield|road_shield|airport|label_country|label_state|park|landcover|landuse)/;

export async function loadBasemapStyle(): Promise<StyleSpecification> {
  const style = (await (await fetch(BASEMAP_STYLE_URL)).json()) as StyleSpecification;
  // The raster relief source is only used at low zoom; this map never goes there.
  delete (style.sources as Record<string, unknown>).ne2_shaded;
  style.layers = style.layers
    .filter((l) => !("source" in l && l.source === "ne2_shaded") && !HIDDEN.test(l.id))
    .map((layer) => {
      const l = structuredClone(layer) as typeof layer & { paint?: Record<string, unknown> };
      l.paint ??= {};
      if (l.type === "background") l.paint["background-color"] = theme.mapLand;
      else if (l.type === "fill") {
        l.paint["fill-color"] = l.id === "water" ? theme.mapMinor : l.id === "building" ? theme.mapMinor : theme.mapLand;
        if (l.id === "building") l.paint["fill-opacity"] = 0.35;
        delete l.paint["fill-outline-color"];
        delete l.paint["fill-pattern"];
      } else if (l.type === "line") {
        l.paint["line-color"] = l.id.includes("casing") ? theme.mapLand : theme.mapMinor;
      } else if (l.type === "symbol") {
        l.paint["text-color"] = theme.ink;
        l.paint["text-halo-color"] = theme.mapLand;
        l.paint["text-halo-width"] = 1.5;
        l.paint["text-opacity"] = 0.75;
      }
      return l;
    });
  return style;
}
