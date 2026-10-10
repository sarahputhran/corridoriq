// Exports the processed data in the engine's input shape, for the golden tests.
// The database loader (lib/db) must produce this same shape.
import * as turf from "@turf/turf";
import type { FeatureCollection, LineString, MultiLineString, Point } from "geojson";
import { mkdirSync, writeFileSync } from "node:fs";
import { pune } from "../config/cities/pune";
import type { InfraZone, NearbyBusRoute, NearbyFacility, PermitInput, Restoration, RuleRecord } from "../engine/types";
import { loadCorridor, metres, readProcessed, round } from "./lib/data";

type ProcessedPermit = PermitInput & { filed_at: string; snap_offset_start_m: number; snap_offset_end_m: number; geom: LineString };

console.log("export-fixtures");
const corridor = loadCorridor();
const facilities = readProcessed<FeatureCollection<Point, { id: string; name: string | null; type: string }>>("facilities.geojson");
const routes = readProcessed<FeatureCollection<MultiLineString, { id: string; route_name: string }>>("bus_routes.geojson");
const raw = readProcessed<ProcessedPermit[]>("permits.json");

const permits = raw.map((p) => ({
  permit_id: p.permit_id,
  department: p.department,
  purpose: p.purpose,
  work_type: p.work_type,
  in_annual_programme: p.in_annual_programme,
  fault_sanctioned: p.fault_sanctioned,
  proposed_start: p.proposed_start,
  proposed_end: p.proposed_end,
  trench_depth_m: p.trench_depth_m,
  trench_width_m: p.trench_width_m,
  road_side: p.road_side,
  traffic_impact: p.traffic_impact,
  status: p.status,
  corridor_id: p.corridor_id,
  chainage_start_m: p.chainage_start_m,
  chainage_end_m: p.chainage_end_m,
  trench_length_m: p.trench_length_m,
  snap_offset_m: Math.max(p.snap_offset_start_m, p.snap_offset_end_m),
  filed_at: p.filed_at,
}));

const context: Record<string, { facilities: NearbyFacility[]; busRoutes: NearbyBusRoute[] }> = {};
for (const p of raw) {
  const trench = turf.lineString(p.geom.coordinates);
  const near: NearbyFacility[] = facilities.features
    .map((f) => ({ id: f.properties.id, name: f.properties.name, type: f.properties.type, distance_m: round(turf.pointToLineDistance(f.geometry.coordinates, trench, metres), 1) }))
    .filter((f) => f.distance_m <= pune.context_radius_m)
    .sort((a, b) => a.distance_m - b.distance_m || a.id.localeCompare(b.id));
  const area = turf.buffer(trench, pune.context_radius_m, metres)!;
  const busRoutes: NearbyBusRoute[] = routes.features
    .filter((r) => turf.booleanIntersects(r, area))
    .map((r) => {
      // Distance from the trench to the route: the smallest distance from a trench vertex to the route line.
      const line = turf.lineString(r.geometry.coordinates[0]);
      const distance = Math.min(...trench.geometry.coordinates.map((c) => turf.pointToLineDistance(c, line, metres)));
      return { id: r.properties.id, route_name: r.properties.route_name, distance_m: round(distance, 1) };
    })
    .filter((r) => r.distance_m <= pune.context_radius_m)
    .sort((a, b) => a.distance_m - b.distance_m || a.id.localeCompare(b.id));
  context[p.permit_id] = { facilities: near, busRoutes };
}

const restorations: Restoration[] = readProcessed<Restoration[]>("restorations.json").map((r) => ({
  id: r.id, chainage_start_m: r.chainage_start_m, chainage_end_m: r.chainage_end_m, completed_on: r.completed_on, surface: r.surface, protected: r.protected,
}));
const infraZones: InfraZone[] = readProcessed<(InfraZone & { chainage_start_m: number | null })[]>("infra_zones.json")
  .filter((z) => z.chainage_start_m != null)
  .map((z) => ({
    id: z.id, project_name: z.project_name, agency: z.agency, status: z.status, start_date: z.start_date, end_date: z.end_date,
    context_only: z.context_only, chainage_start_m: z.chainage_start_m, chainage_end_m: z.chainage_end_m,
  }));
const rules: RuleRecord[] = readProcessed<RuleRecord[]>("rules.json").map((r) => ({
  rule_id: r.rule_id, action: r.action, severity: r.severity, trigger_text: r.trigger_text, params: r.params, enabled: r.enabled,
}));

const out = {
  generated_by: "scripts/export-fixtures.ts. Do not edit by hand; run `npm run data`",
  corridor: { id: corridor.props.id, road_name: corridor.props.road_name, length_m: corridor.props.length_m },
  permits,
  restorations,
  infraZones,
  rules,
  context,
};
mkdirSync("engine/__tests__/fixtures", { recursive: true });
writeFileSync("engine/__tests__/fixtures/pune.json", JSON.stringify(out, null, 1) + "\n");
console.log(`  wrote engine/__tests__/fixtures/pune.json (${permits.length} permits)`);
