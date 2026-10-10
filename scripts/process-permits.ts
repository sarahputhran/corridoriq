// Fixes and enriches the S5 permits, then derives the synthetic restorations.
import * as turf from "@turf/turf";
import type { FeatureCollection, LineString } from "geojson";
import { CORRIDOR_ID, loadCorridor, metres, readProcessed, readRaw, round, writeProcessed } from "./lib/data";
import { DEPARTMENTS, HERO, PERMIT_FIXES, RESTORATIONS, SIDE_OFFSET_M, SNAP_TOLERANCE_M } from "./fixes/pune";

type RawPermit = {
  permit_id: string;
  department: string;
  purpose: string;
  stretch_start_lat: number;
  stretch_start_lng: number;
  stretch_end_lat: number;
  stretch_end_lng: number;
  proposed_start_date: string;
  proposed_end_date: string;
  trench_depth_m: number;
  trench_width_m: number;
  road_side: string;
  traffic_impact: string;
  status: string;
};

console.log("process-permits");
const corridor = loadCorridor();
const raw = readRaw<RawPermit[]>("s5/corridoriq_synthetic_permits_2026.json");
const short = (id: string) => id.slice(-4);
const rawBy = new Map(raw.map((p) => [short(p.permit_id), p]));
const straightLength = (p: RawPermit) =>
  turf.distance([p.stretch_start_lng, p.stretch_start_lat], [p.stretch_end_lng, p.stretch_end_lat], metres);

// Where each permit sits on the corridor: [chainage_start, chainage_end] plus a note when it had to be moved.
const placement = new Map<string, { from: number; to: number; moved?: string }>();
for (const p of raw) {
  const a = corridor.snap(p.stretch_start_lng, p.stretch_start_lat);
  const b = corridor.snap(p.stretch_end_lng, p.stretch_end_lat);
  if (a.offset_m <= SNAP_TOLERANCE_M && b.offset_m <= SNAP_TOLERANCE_M) {
    placement.set(short(p.permit_id), { from: Math.min(a.chainage_m, b.chainage_m), to: Math.max(a.chainage_m, b.chainage_m) });
  } else if (!(HERO.permits as readonly string[]).includes(short(p.permit_id))) {
    // Off-corridor, non-hero: keep its length and put it at the nearest corridor stretch.
    const from = Math.min(a.chainage_m, corridor.length - straightLength(p));
    placement.set(short(p.permit_id), {
      from,
      to: from + straightLength(p),
      moved: `S5 coordinates were ${round(a.offset_m, 0)}–${round(b.offset_m, 0)} m off Sinhagad Road; moved to the nearest corridor stretch, length kept`,
    });
  }
}
// Hero pair: placed beside the hero hospital, keeping lengths, sides and their offset along the road.
{
  const [lead, follower] = HERO.permits.map((id) => rawBy.get(id)!);
  const leadStart = [lead.stretch_start_lng, lead.stretch_start_lat];
  const followerStart = [follower.stretch_start_lng, follower.stretch_start_lat];
  const axis = turf.bearing(leadStart, [lead.stretch_end_lng, lead.stretch_end_lat]);
  const along =
    turf.distance(leadStart, followerStart, metres) * Math.cos(((turf.bearing(leadStart, followerStart) - axis) * Math.PI) / 180);
  const leadTo = corridor.length - HERO.endMarginM;
  const leadFrom = leadTo - straightLength(lead);
  const note = (p: RawPermit) => {
    const a = corridor.snap(p.stretch_start_lng, p.stretch_start_lat);
    const b = corridor.snap(p.stretch_end_lng, p.stretch_end_lat);
    return `S5 coordinates were ${round(a.offset_m, 0)}–${round(b.offset_m, 0)} m off Sinhagad Road (beside Deenanath Mangeshkar Hospital, which is not on the corridor); moved next to ${HERO.facilityName}, length, side and mutual offset kept`;
  };
  placement.set(HERO.permits[0], { from: leadFrom, to: leadTo, moved: note(lead) });
  placement.set(HERO.permits[1], { from: leadFrom + along, to: leadFrom + along + straightLength(follower), moved: note(follower) });
}

const permits = raw.map((p) => {
  const id = short(p.permit_id);
  const fix = PERMIT_FIXES[id];
  if (!fix) throw new Error(`No demo fix entry for permit ${id}`);
  const dept = DEPARTMENTS.find((d) => d.name === p.department);
  if (!dept) throw new Error(`Unknown department "${p.department}" on permit ${id}`);
  const place = placement.get(id)!;
  const [proposed_start, proposed_end] = fix.dates ?? [p.proposed_start_date, p.proposed_end_date];

  let start = [p.stretch_start_lng, p.stretch_start_lat];
  let end = [p.stretch_end_lng, p.stretch_end_lat];
  if (place.moved) {
    const offset = SIDE_OFFSET_M[p.road_side] ?? 0;
    start = corridor.pointBeside(place.from, offset);
    end = corridor.pointBeside(place.to, offset);
  }
  const snapStart = corridor.snap(start[0], start[1]);
  const snapEnd = corridor.snap(end[0], end[1]);

  const changes: string[] = [];
  if (fix.dates) changes.push(`dates ${p.proposed_start_date}→${p.proposed_end_date} changed to ${proposed_start}→${proposed_end}`);
  if (fix.status !== p.status) changes.push(`status ${p.status} changed to ${fix.status}`);
  if (fix.work_type) changes.push("work_type set to emergency_fault");
  if (fix.in_annual_programme === false) changes.push("in_annual_programme set to false");
  if (fix.purpose) changes.push(`purpose reworded (was "${p.purpose}")`);
  if (place.moved) changes.push(place.moved);

  return {
    permit_id: p.permit_id,
    department: p.department,
    department_id: dept.id,
    purpose: fix.purpose ?? p.purpose,
    work_type: fix.work_type ?? "routine",
    in_annual_programme: fix.in_annual_programme ?? true,
    fault_sanctioned: false,
    start_lat: round(start[1], 7),
    start_lng: round(start[0], 7),
    end_lat: round(end[1], 7),
    end_lng: round(end[0], 7),
    corridor_id: CORRIDOR_ID,
    chainage_start_m: round(place.from, 1),
    chainage_end_m: round(place.to, 1),
    trench_length_m: round(place.to - place.from, 1),
    snap_offset_start_m: round(snapStart.offset_m, 1),
    snap_offset_end_m: round(snapEnd.offset_m, 1),
    proposed_start,
    proposed_end,
    filed_at: fix.filed_at,
    trench_depth_m: p.trench_depth_m,
    trench_width_m: p.trench_width_m,
    road_side: p.road_side,
    traffic_impact: p.traffic_impact,
    status: fix.status,
    synthetic: true,
    demo_role: fix.role,
    changes_from_s5: changes,
    geom: corridor.slice(place.from, place.to),
  };
});
writeProcessed("permits.json", permits);

// ── Restorations (all synthetic) ──────────────────────────────────────────────
const by = new Map(permits.map((p) => [short(p.permit_id), p]));
const restorations = Object.entries(RESTORATIONS).map(([id, r]) => {
  const sources = ("sourcePermits" in r ? [...r.sourcePermits] : [r.sourcePermit]).map((s) => by.get(s)!);
  const from = Math.max(0, Math.min(...sources.map((s) => s.chainage_start_m)) - r.padM);
  const to = Math.min(corridor.length, Math.max(...sources.map((s) => s.chainage_end_m)) + r.padM);
  return {
    id,
    corridor_id: CORRIDOR_ID,
    chainage_start_m: round(from, 1),
    chainage_end_m: round(to, 1),
    completed_on: r.completed_on,
    surface: r.surface,
    protected: r.protected,
    kind: r.kind,
    synthetic: true,
    derived_from: sources.map((s) => s.permit_id),
    pad_m: r.padM,
    geom: corridor.slice(from, to),
  };
});
writeProcessed("restorations.json", restorations);

// Segments inherit surface and protected status from the restorations that cover them.
type SegProps = { chainage_start_m: number; chainage_end_m: number; surface: string; surface_source: string; protected: boolean };
const segments = readProcessed<FeatureCollection<LineString, SegProps>>("segments.geojson");
for (const seg of segments.features) {
  const s = seg.properties;
  const overlap = (r: (typeof restorations)[number]) =>
    Math.max(0, Math.min(s.chainage_end_m, r.chainage_end_m) - Math.max(s.chainage_start_m, r.chainage_start_m));
  s.protected = restorations.some((r) => r.protected && overlap(r) > 0);
  const main = restorations.filter((r) => overlap(r) > (s.chainage_end_m - s.chainage_start_m) / 2).sort((a, b) => overlap(b) - overlap(a))[0];
  s.surface = main?.surface ?? "bituminous";
  s.surface_source = main ? `restoration ${main.id} (synthetic)` : "default";
}
writeProcessed("segments.geojson", segments);
