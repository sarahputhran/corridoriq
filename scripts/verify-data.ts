// Checks the processed data: counts, snapping, the hero stretch, and the set-up each demo scenario relies on.
// Writes data/processed/_checks.json and exits 1 on any failure.
import * as turf from "@turf/turf";
import type { FeatureCollection, LineString, MultiLineString, Point } from "geojson";
import { loadCorridor, metres, readProcessed, round, writeProcessed } from "./lib/data";
import { HERO, SNAP_TOLERANCE_M } from "./fixes/pune";

type Permit = {
  permit_id: string; department: string; work_type: string; status: string; road_side: string;
  chainage_start_m: number; chainage_end_m: number; trench_length_m: number;
  snap_offset_start_m: number; snap_offset_end_m: number; proposed_start: string; proposed_end: string; geom: LineString;
};
type Range = { id: string; chainage_start_m: number | null; chainage_end_m: number | null };

const corridor = loadCorridor();
const permits = readProcessed<Permit[]>("permits.json");
const restorations = readProcessed<Range[]>("restorations.json");
const zones = readProcessed<Range[]>("infra_zones.json");
const rules = readProcessed<{ rule_id: string; params: unknown }[]>("rules.json");
const facilities = readProcessed<FeatureCollection<Point, { id: string; name: string | null; type: string }>>("facilities.geojson");
const routes = readProcessed<FeatureCollection<MultiLineString, { id: string; route_name: string }>>("bus_routes.geojson");
const segments = readProcessed<FeatureCollection<LineString, { protected: boolean }>>("segments.geojson");
const count = (file: string) => readProcessed<FeatureCollection | unknown[]>(file);
const size = (d: FeatureCollection | unknown[]) => (Array.isArray(d) ? d.length : d.features.length);

const short = (id: string) => id.slice(-4);
const by = new Map(permits.map((p) => [short(p.permit_id), p]));
const overlap = (a: Range | Permit, b: Range | Permit) =>
  a.chainage_start_m != null && b.chainage_start_m != null
    ? Math.min(a.chainage_end_m!, b.chainage_end_m!) - Math.max(a.chainage_start_m, b.chainage_start_m)
    : Number.NEGATIVE_INFINITY;

const results: { check: string; pass: boolean; detail: string }[] = [];
const check = (name: string, pass: boolean, detail: string) => results.push({ check: name, pass, detail });

// Inventory
const inventory = Object.fromEntries(
  ["corridor.geojson", "segments.geojson", "facilities.geojson", "bus_routes.geojson", "bus_stops.geojson", "wards.geojson", "permits.json", "restorations.json", "infra_zones.json", "rules.json", "complaints.json", "departments.json"].map((f) => [f, size(count(f))]),
);
check("25 permits", permits.length === 25, `${permits.length}`);
check("16 rules, all with params", rules.length === 16 && rules.every((r) => r.params && typeof r.params === "object"), `${rules.length}`);

// 5a: corridor length and snapping
check("corridor length 4 km ± 0.5 km", corridor.length >= 3500 && corridor.length <= 4500, `${round(corridor.length, 0)} m`);
const worstSnap = Math.max(...permits.flatMap((p) => [p.snap_offset_start_m, p.snap_offset_end_m]));
check(`all permit ends snap within ${SNAP_TOLERANCE_M} m`, worstSnap <= SNAP_TOLERANCE_M, `worst ${worstSnap} m`);
check("all trenches lie inside the corridor", permits.every((p) => p.chainage_start_m >= 0 && p.chainage_end_m <= corridor.length + 0.1 && p.trench_length_m > 0), "");

// 5b: hero hospital
const hospital = facilities.features.find((f) => f.properties.name === HERO.facilityName);
const heroDistances = HERO.permits.map((id) => round(turf.pointToLineDistance(hospital!.geometry.coordinates, by.get(id)!.geom, metres), 0));
check(`hero permits within 200 m of ${HERO.facilityName}`, !!hospital && heroDistances.every((d) => d <= 200), heroDistances.map((d, i) => `${HERO.permits[i]}: ${d} m`).join(", "));
const [h1, h2] = HERO.permits.map((id) => by.get(id)!);
check("hero permits overlap along the road and sit on opposite sides", overlap(h1, h2) > 0 && h1.road_side !== h2.road_side, `overlap ${round(overlap(h1, h2), 0)} m, ${h1.road_side}/${h2.road_side}`);

// Context around the hero stretch (5e: real bus route names only)
const heroBuffer = turf.buffer(turf.lineString(corridor.slice(Math.min(h1.chainage_start_m, h2.chainage_start_m), Math.max(h1.chainage_end_m, h2.chainage_end_m)).coordinates), 200, metres)!;
const heroFacilities = facilities.features
  .filter((f) => turf.booleanPointInPolygon(f, heroBuffer))
  .map((f) => ({ name: f.properties.name, type: f.properties.type, distance_m: round(Math.min(...[h1, h2].map((h) => turf.pointToLineDistance(f.geometry.coordinates, h.geom, metres))), 0) }))
  .sort((a, b) => a.type.localeCompare(b.type) || a.distance_m - b.distance_m);
const heroRoutes = [...new Set(routes.features.filter((r) => turf.booleanIntersects(r, heroBuffer)).map((r) => r.properties.route_name))].sort();
check("hero buffer has a hospital and at least one real bus route", heroFacilities.some((f) => f.type === "hospital") && heroRoutes.length > 0, `${heroFacilities.length} facilities, ${heroRoutes.length} route names`);

// Scenario set-ups
const R = (id: string) => restorations.find((r) => r.id === id)!;
const Z = (id: string) => zones.find((z) => z.id === id)!;
check("D: R1 overlaps 0001, 0002, 0003", ["0001", "0002", "0003"].every((id) => overlap(by.get(id)!, R("R1")) > 0), ["0001", "0002", "0003"].map((id) => `${id}: ${round(overlap(by.get(id)!, R("R1")), 0)} m`).join(", "));
check("P: R2 covers 0004, 0005, 0006", ["0004", "0005", "0006"].every((id) => overlap(by.get(id)!, R("R2")) >= by.get(id)!.trench_length_m - 0.2), "");
check("P: R2 marks segments protected", segments.features.some((s) => s.properties.protected), `${segments.features.filter((s) => s.properties.protected).length} segments`);
check("R3 matches 0025", Math.abs(overlap(by.get("0025")!, R("R3")) - by.get("0025")!.trench_length_m) < 0.2, "");
check("M: Metro zone overlaps 0012, 0013, 0014, 0020", ["0012", "0013", "0014", "0020"].every((id) => overlap(by.get(id)!, Z("METRO-L4-INTERFACE")) > 0), ["0012", "0013", "0014"].map((id) => `${id}: ${round(overlap(by.get(id)!, Z("METRO-L4-INTERFACE")), 0)} m`).join(", "));
check("H: hero stretch is clear of restorations and the Metro zone", [...restorations, Z("METRO-L4-INTERFACE")].every((r) => overlap(h1, r) <= 0 && overlap(h2, r) <= 0), "");

// Monsoon: only 0019 should be a routine, not-yet-done work inside 30 Apr – 30 Sep.
const inMonsoon = (p: Permit) => {
  for (let y = +p.proposed_start.slice(0, 4); y <= +p.proposed_end.slice(0, 4); y++)
    if (p.proposed_start <= `${y}-09-30` && p.proposed_end >= `${y}-04-30`) return true;
  return false;
};
const monsoon = permits.filter((p) => p.work_type === "routine" && !["completed", "in_progress"].includes(p.status) && inMonsoon(p)).map((p) => short(p.permit_id));
check("B: only 0019 is routine work inside the monsoon window", monsoon.join() === "0019", monsoon.join(", ") || "none");

// I: 0017 has no neighbour that is both within 50 m and within 90 days.
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;
const p17 = by.get("0017")!;
const neighbours17 = permits
  .filter((p) => p !== p17)
  .map((p) => ({ id: short(p.permit_id), gap_m: round(Math.max(0, -overlap(p, p17)), 0), gap_days: Math.max(0, days(p.proposed_end, p17.proposed_start), days(p17.proposed_end, p.proposed_start)) }))
  .filter((n) => n.gap_m <= 50 && n.gap_days <= 90);
check("I: 0017 has no neighbour within 50 m and 90 days, and no restoration under it", neighbours17.length === 0 && restorations.every((r) => overlap(p17, r) <= 0), JSON.stringify(neighbours17));

const permitTable = permits.map((p) => ({
  id: short(p.permit_id), department: p.department, side: p.road_side, status: p.status,
  chainage: `${round(p.chainage_start_m, 0)}–${round(p.chainage_end_m, 0)}`, length_m: round(p.trench_length_m, 0),
  snap_m: Math.max(p.snap_offset_start_m, p.snap_offset_end_m), dates: `${p.proposed_start} → ${p.proposed_end}`,
}));

writeProcessed("_checks.json", {
  corridor: { length_m: round(corridor.length, 0), start_label: corridor.props.start_label, end_label: corridor.props.end_label },
  inventory, results, permitTable, hero: { hospital: HERO.facilityName, distances_m: heroDistances, facilities: heroFacilities, bus_route_names: heroRoutes },
  restorations: restorations.map((r) => ({ id: r.id, chainage: `${round(r.chainage_start_m!, 0)}–${round(r.chainage_end_m!, 0)}` })),
  zones: zones.map((z) => ({ id: z.id, chainage: z.chainage_start_m == null ? "off corridor" : `${round(z.chainage_start_m, 0)}–${round(z.chainage_end_m!, 0)}` })),
});

console.log("\nverify-data");
for (const r of results) console.log(`  ${r.pass ? "✓" : "✗"} ${r.check}${r.detail ? `: ${r.detail}` : ""}`);
const failed = results.filter((r) => !r.pass).length;
console.log(failed ? `\n${failed} check(s) failed.` : `\nAll ${results.length} checks pass.`);
process.exit(failed ? 1 : 0);
