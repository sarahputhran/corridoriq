// Builds the corridor centerline and its display segments from S1 roads.
import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, LineString, MultiPolygon, Position } from "geojson";
import { CORRIDOR_ID, featureCollection, metres, readRaw, round, roundCoord, writeProcessed } from "./lib/data";

type RoadProps = { osm_id: number | string; name: string | null; highway: string; width_m: number | null; lanes: number | null };
type WardProps = { ward_number: number; ward_name: string; admin_zone: string };

const SEGMENT_TARGET_M = 250;
const DEFAULT_WIDTH_M = 15;
// Endpoint labels come from the nearest PMPML stop names (S3). Rajaram Bridge is mid-corridor, not an end.
const START_LABEL = "Hingne";
const END_LABEL = "Dandekar Bridge";

console.log("build-corridor");
const roads = readRaw<FeatureCollection<LineString, RoadProps>>("s1/corridoriq_pune_roads.geojson");

// At-grade carriageway only. "Sinhagad Road Flyover" is a separate elevated structure; permits are at grade.
const ways = roads.features.filter((f) => /^sinhagad (road|rd\.?)$/i.test((f.properties.name ?? "").trim()));
const key = (c: Position) => `${c[0].toFixed(7)},${c[1].toFixed(7)}`;
const wayLength = new Map(ways.map((w) => [w, turf.length(w, metres)]));
const byStart = new Map<string, Feature<LineString, RoadProps>[]>();
for (const w of ways) {
  const k = key(w.geometry.coordinates[0]);
  byStart.set(k, [...(byStart.get(k) ?? []), w]);
}

// OSM maps the road as two one-way carriageways. Follow each directed chain and keep the longest one
// that runs south-west → north-east, so chainage increases toward Dandekar Bridge.
type Chain = { ways: Feature<LineString, RoadProps>[]; length: number };
function longestFrom(way: Feature<LineString, RoadProps>, seen: Set<unknown>): Chain {
  let best: Chain = { ways: [], length: 0 };
  const end = key(way.geometry.coordinates.at(-1)!);
  for (const next of byStart.get(end) ?? []) {
    if (seen.has(next)) continue;
    const tail = longestFrom(next, new Set([...seen, next]));
    if (tail.length > best.length) best = tail;
  }
  return { ways: [way, ...best.ways], length: wayLength.get(way)! + best.length };
}
const chains = ways
  .map((w) => longestFrom(w, new Set([w])))
  .filter((c) => c.ways.at(-1)!.geometry.coordinates.at(-1)![1] > c.ways[0].geometry.coordinates[0][1])
  .sort((a, b) => b.length - a.length || String(a.ways[0].properties.osm_id).localeCompare(String(b.ways[0].properties.osm_id)));
const chain = chains[0];
if (!chain) throw new Error("No north-east-bound Sinhagad Road chain found in S1");

const coords: Position[] = [];
for (const w of chain.ways) coords.push(...(coords.length ? w.geometry.coordinates.slice(1) : w.geometry.coordinates));
const centerline = turf.lineString(coords.map(roundCoord));
const length = turf.length(centerline, metres);

const widths = chain.ways.map((w) => w.properties.width_m).filter((w): w is number => typeof w === "number");
const width = widths.length ? Math.min(...widths) : DEFAULT_WIDTH_M;

writeProcessed(
  "corridor.geojson",
  featureCollection([
    {
      ...centerline,
      properties: {
        id: CORRIDOR_ID,
        city_id: "pune",
        road_name: "Sinhagad Road",
        start_label: START_LABEL,
        end_label: END_LABEL,
        length_m: round(length, 1),
        carriageway: "north-east bound (one of two one-way OSM carriageways, used as the reference line)",
        osm_way_ids: chain.ways.map((w) => w.properties.osm_id),
        classification: "arterial",
        source: "OpenStreetMap via S1 corridoriq_pune_roads.geojson",
      },
    },
  ]),
);

const wards = readRaw<FeatureCollection<MultiPolygon, WardProps>>("s4/corridoriq_sinhagad_road_wards.geojson");
const count = Math.max(1, Math.round(length / SEGMENT_TARGET_M));
const step = length / count;
const segments = Array.from({ length: count }, (_, i) => {
  const from = i * step;
  const to = i === count - 1 ? length : (i + 1) * step;
  const geom = turf.lineSliceAlong(centerline, from, to, metres).geometry;
  const mid = turf.along(centerline, (from + to) / 2, metres);
  const ward = wards.features.find((w) => turf.booleanPointInPolygon(mid, w));
  return {
    type: "Feature" as const,
    geometry: { type: "LineString" as const, coordinates: geom.coordinates.map(roundCoord) },
    properties: {
      id: `SR-${String(i + 1).padStart(2, "0")}`,
      corridor_id: CORRIDOR_ID,
      seq: i + 1,
      chainage_start_m: round(from, 1),
      chainage_end_m: round(to, 1),
      classification: "arterial",
      width_m: width,
      // S1 has no surface values for these ways; restorations (process-permits) override this default.
      surface: "bituminous",
      surface_source: "default",
      protected: false,
      ward_number: ward?.properties.ward_number ?? null,
      ward_name: ward?.properties.ward_name ?? null,
      admin_zone: ward?.properties.admin_zone ?? null,
    },
  };
});
writeProcessed("segments.geojson", featureCollection(segments));

console.log(
  `  corridor ${round(length, 0)} m, ${chain.ways.length} OSM ways, ${count} segments of ~${round(step, 0)} m, ` +
    `${chains.length} candidate chain(s); start ${coords[0].join(",")} end ${coords.at(-1)!.join(",")}`,
);
