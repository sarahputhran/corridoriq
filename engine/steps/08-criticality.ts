import { fire, recordStep, type Ctx } from "../context";
import type { CriticalityFlag } from "../types";

const FLAG_ORDER: CriticalityFlag[] = ["hospital_access", "school_route", "bus_corridor", "religious_site", "commercial", "major_infrastructure"];

/** Step 8: which community functions sit within the buffer of this trench. */
export function criticality(ctx: Ctx): void {
  const rule = ctx.rules.get("CORRIDOR_FACILITY_CRITICALITY_GATE");
  const { buffer_m, critical_types, include_bus, commercial_min } = rule.params;
  const nearby = ctx.input.corridor.facilities.filter((f) => f.distance_m <= buffer_m);
  const has = (...types: string[]) => nearby.some((f) => types.includes(f.type) && critical_types.includes(f.type));
  const flags = new Set<CriticalityFlag>();
  if (has("hospital", "clinic")) flags.add("hospital_access");
  if (has("school")) flags.add("school_route");
  if (nearby.some((f) => f.type === "place_of_worship")) flags.add("religious_site");
  if (nearby.filter((f) => f.type === "commercial").length >= commercial_min) flags.add("commercial");
  if (include_bus && ctx.input.corridor.busRoutes.some((r) => r.distance_m <= buffer_m)) flags.add("bus_corridor");
  if (ctx.counterparts.some((c) => c.kind === "infra" && c.spatial === "DIRECT_OVERLAP" && !c.history)) flags.add("major_infrastructure");
  ctx.flags = FLAG_ORDER.filter((f) => flags.has(f));

  const opportunity = !ctx.emergency && ctx.counterparts.some((c) => c.trigger_reasons.length > 0);
  if (ctx.flags.length && opportunity) {
    fire(ctx, "CORRIDOR_FACILITY_CRITICALITY_GATE", 8, {
      inputs: { buffer_m, flags: ctx.flags, facility_ids: nearby.map((f) => f.id).sort() },
      explanation: `Critical context within ${buffer_m} m (${ctx.flags.join(", ").replace(/_/g, " ")}) and a coordination opportunity exists.`,
    });
  }
  recordStep(
    ctx,
    8,
    "CITY_CRITICALITY",
    "City criticality",
    ctx.flags.length ? "flag" : "pass",
    ctx.flags.length ? `Flags: ${ctx.flags.join(", ").replace(/_/g, " ")}.` : `No critical facility, bus route or infrastructure zone within ${buffer_m} m.`,
  );
}
