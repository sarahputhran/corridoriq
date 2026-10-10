// The fact sheet is the ONLY thing the AI sees. Every fact has an ID the explanation must cite.
// Built from database records; nothing here is estimated or forecast.

export interface FactSheet {
  case_ref: string;
  road_name: string;
  chainage_start_m: number;
  chainage_end_m: number;
  buffer_m: number;
  permits: { id: string; permit_id: string; department: string; purpose: string; starts: string; ends: string; road_side: string; chainage_start_m: number; chainage_end_m: number; role: "triggering" | "counterpart" | "completed_history" }[];
  facilities: { id: string; name: string; type: string; distance_m: number }[];
  bus_routes: { id: string; route_name: string }[];
  infra_zones: { id: string; project_name: string; agency: string; status: string }[];
  rules: { id: string; rule_id: string; trigger: string; action: string }[];
  /** The one or two rules that matter most for this case, most important first. */
  most_important_rule_ids: string[];
  strategies: { id: string; strategy: string; label: string; recommended: boolean; feasible: boolean; schedule_shift_days: number; schedule_shift_weeks: number; ratings: Record<string, string>; conditions: string[] }[];
  recommended_strategy_id: string;
  counts: { permits: number; departments: number; facilities_listed: number; bus_route_shapes_in_buffer: number };
}

export interface FactSheetInput {
  case_ref: string;
  road_name: string;
  chainage_start_m: number;
  chainage_end_m: number;
  buffer_m: number;
  permits: { permit_id: string; department: string; purpose: string; proposed_start: string; proposed_end: string; road_side: string; chainage_start_m: number; chainage_end_m: number; status: string; is_trigger: boolean }[];
  /** Facilities inside the buffer, nearest first. */
  facilities: { name: string | null; type: string; distance_m: number }[];
  busRouteNames: string[];
  infraZones: { project_name: string; agency: string; status: string }[];
  rules: { rule_id: string; trigger_text: string; action: string }[];
  strategies: { strategy: string; recommended: boolean; feasible: boolean; schedule_shift_days: number; ratings: Record<string, string>; conditions: string[] }[];
}

const STRATEGY_LABEL: Record<string, string> = {
  JOINT_EXECUTION: "joint execution",
  DEFER_NEW_PERMIT: "deferring the new permit",
  RESEQUENCE_WORKS: "resequencing the works",
  SEPARATE_EXECUTION: "separate execution",
  BLOCK_OR_ESCALATE: "blocking or escalating",
};
/** Facility types worth a sentence, most important first. Shops and offices are left out of the sheet. */
const FACILITY_ORDER = ["hospital", "clinic", "school", "fire_station", "police", "place_of_worship"];
/** Which fired rule says most about why the works belong in one decision. */
const RULE_PRIORITY = [
  "CORRIDOR_CRITICAL_MORATORIUM",
  "XPMS_REPEAT_SAME_6M",
  "XPMS_REPEAT_OTHER_3M",
  "XPMS_COMMON_TRENCH_3_6M",
  "CORRIDOR_SAME_SEGMENT_MULTIWORK",
  "CORRIDOR_FACILITY_CRITICALITY_GATE",
  "MOHUA_UTILITY_COORDINATION",
];
const MAX_FACILITIES = 5;
const MAX_ROUTES = 3;

export function buildFactSheet(input: FactSheetInput): FactSheet {
  const permits = input.permits.map((p) => ({
    id: `P${p.permit_id.slice(-4)}`,
    permit_id: p.permit_id,
    department: p.department,
    purpose: p.purpose,
    starts: p.proposed_start,
    ends: p.proposed_end,
    road_side: p.road_side,
    chainage_start_m: Math.round(p.chainage_start_m),
    chainage_end_m: Math.round(p.chainage_end_m),
    role: p.status === "completed" ? ("completed_history" as const) : p.is_trigger ? ("triggering" as const) : ("counterpart" as const),
  }));
  const facilities = input.facilities
    .filter((f) => f.name && FACILITY_ORDER.includes(f.type))
    .sort((a, b) => FACILITY_ORDER.indexOf(a.type) - FACILITY_ORDER.indexOf(b.type) || a.distance_m - b.distance_m || a.name!.localeCompare(b.name!))
    .slice(0, MAX_FACILITIES)
    .map((f, i) => ({ id: `F${i + 1}`, name: f.name!, type: f.type.replace(/_/g, " "), distance_m: Math.round(f.distance_m) }));
  // Route shapes come in UP/DOWN pairs; one line per route name is enough.
  const routeNames = [...new Set(input.busRouteNames.map((n) => n.replace(/\s*\((UP|DOWN)\)\s*$/i, "")))].sort();
  const strategies = input.strategies.map((s, i) => ({
    id: `S${i + 1}`,
    strategy: s.strategy,
    label: STRATEGY_LABEL[s.strategy] ?? s.strategy.toLowerCase(),
    recommended: s.recommended,
    feasible: s.feasible,
    schedule_shift_days: s.schedule_shift_days,
    schedule_shift_weeks: Math.round(s.schedule_shift_days / 7),
    ratings: s.ratings,
    conditions: s.conditions,
  }));
  return {
    case_ref: input.case_ref,
    road_name: input.road_name,
    chainage_start_m: Math.round(input.chainage_start_m),
    chainage_end_m: Math.round(input.chainage_end_m),
    buffer_m: input.buffer_m,
    permits,
    facilities,
    bus_routes: routeNames.slice(0, MAX_ROUTES).map((route_name, i) => ({ id: `B${i + 1}`, route_name })),
    infra_zones: input.infraZones.map((z, i) => ({ id: `I${i + 1}`, project_name: z.project_name, agency: z.agency, status: z.status })),
    rules: input.rules.map((r) => ({ id: `R:${r.rule_id}`, rule_id: r.rule_id, trigger: r.trigger_text, action: r.action })),
    most_important_rule_ids: RULE_PRIORITY.filter((id) => input.rules.some((r) => r.rule_id === id)).slice(0, 2).map((id) => `R:${id}`),
    strategies,
    recommended_strategy_id: strategies.find((s) => s.recommended)?.id ?? strategies[0]?.id ?? "S1",
    counts: {
      permits: permits.length,
      departments: new Set(permits.map((p) => p.department)).size,
      facilities_listed: facilities.length,
      bus_route_shapes_in_buffer: input.busRouteNames.length,
    },
  };
}

/** Every citable ID with a short human label, for chips and hover text. */
export function factIndex(sheet: FactSheet): Map<string, { label: string; anchor: string }> {
  const index = new Map<string, { label: string; anchor: string }>();
  for (const p of sheet.permits) index.set(p.id, { label: `${p.permit_id}: ${p.department}, ${p.purpose}, ${p.starts} to ${p.ends}, ${p.road_side} side`, anchor: "permits" });
  for (const f of sheet.facilities) index.set(f.id, { label: `${f.name} (${f.type}), ${f.distance_m} m from the works`, anchor: "rules" });
  for (const b of sheet.bus_routes) index.set(b.id, { label: `PMPML route: ${b.route_name}`, anchor: "rules" });
  for (const z of sheet.infra_zones) index.set(z.id, { label: `${z.project_name} (${z.agency}), ${z.status}`, anchor: "permits" });
  for (const r of sheet.rules) index.set(r.id, { label: `${r.rule_id}: ${r.trigger}`, anchor: "rules" });
  for (const s of sheet.strategies) index.set(s.id, { label: `Strategy: ${s.label}${s.recommended ? " (recommended)" : ""}, schedule shift ${s.schedule_shift_days} days`, anchor: "strategies" });
  return index;
}
