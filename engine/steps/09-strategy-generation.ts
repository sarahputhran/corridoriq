import { fire, recordStep, type Ctx } from "../context";
import { generateStrategies, worstFeasibility } from "../strategies";
import type { RepeatClass, SpatialClass } from "../types";

const SPATIAL_RANK: SpatialClass[] = ["NO_SPATIAL_CONFLICT", "NEARBY", "ADJACENT_SEGMENT", "SAME_SEGMENT", "DIRECT_OVERLAP"];
const REPEAT_RANK: RepeatClass[] = ["NO_REPEAT_RISK", "COMMON_TRENCH_CANDIDATE", "REPEAT_CROSS_UTILITY", "REPEAT_SAME_UTILITY"];
const worst = <T,>(rank: T[], values: T[]): T => values.reduce((w, v) => (rank.indexOf(v) > rank.indexOf(w) ? v : w), rank[0]);

/** Step 9: if any coordination trigger fired, draft the Coordination Case and its five strategies. */
export function strategyGeneration(ctx: Ctx): void {
  const { permit } = ctx;
  const triggered = ctx.counterparts.filter((c) => c.trigger_reasons.length > 0);
  if (ctx.emergency || !triggered.length) {
    recordStep(ctx, 9, "STRATEGY_GENERATION", "Strategy generation", ctx.emergency ? "skipped" : "pass", ctx.emergency ? "Not applied on the emergency fault pathway." : "No coordination trigger: no case needed.");
    return;
  }

  for (const c of triggered.filter((c) => c.trigger_reasons.includes("within_coordination_window"))) {
    fire(ctx, "CORRIDOR_SAME_SEGMENT_MULTIWORK", 9, {
      counterpart_permit_id: c.id,
      inputs: { spatial: c.spatial, overlap_m: c.overlap_m, gap_m: c.gap_m, temporal_gap_days: c.temporal_gap_days },
      explanation: `Works on the same stretch fall inside the coordination window (${c.id}).`,
    });
  }
  const { groups } = ctx.rules.get("MOHUA_UTILITY_COORDINATION").params;
  const group = groups.find((g) => g.includes(permit.department));
  for (const c of triggered.filter((c) => c.kind === "permit" && !c.history && group?.includes(c.department!))) {
    fire(ctx, "MOHUA_UTILITY_COORDINATION", 9, {
      counterpart_permit_id: c.id,
      inputs: { departments: [permit.department, c.department] },
      explanation: `Compatible utility works are planned on the same road area (${c.id}).`,
    });
  }

  ctx.strategies = generateStrategies(ctx);
  const permitCounterparts = triggered.filter((c) => c.kind === "permit");
  const active = permitCounterparts.filter((c) => !c.history);
  const others = new Map(ctx.input.corridor.permits.map((p) => [p.permit_id, p]));
  const zones = new Map(ctx.input.corridor.infraZones.map((z) => [z.id, z]));
  const ranges = [permit, ...triggered.map((c) => (c.kind === "permit" ? others.get(c.id)! : zones.get(c.id)!))];
  const candidates = triggered.filter((c) => c.joint_candidate);

  ctx.coordination = {
    triggering_permit_id: permit.permit_id,
    corridor_id: permit.corridor_id!,
    permit_ids: [permit.permit_id, ...permitCounterparts.map((c) => c.id)].sort(),
    infra_zone_ids: triggered.filter((c) => c.kind === "infra").map((c) => c.id),
    // The case covers the permits; infrastructure zones can be far longer than the stretch in question.
    chainage_start_m: Math.min(...ranges.filter((r) => "permit_id" in r).map((r) => r.chainage_start_m)),
    chainage_end_m: Math.max(...ranges.filter((r) => "permit_id" in r).map((r) => r.chainage_end_m)),
    spatial_classification: worst(SPATIAL_RANK, triggered.map((c) => c.spatial)),
    repeat_opening_classification: worst(REPEAT_RANK, triggered.map((c) => c.repeat)),
    execution_feasibility: worstFeasibility(candidates) ?? worstFeasibility(triggered.filter((c) => !c.history)) ?? "NOT_FEASIBLE",
    criticality_flags: ctx.flags,
    rule_ids: [], // filled by the pipeline once every rule has had its say
    recommended_strategy: ctx.strategies.find((s) => s.recommended)!.strategy,
    department_tasks: active.map((c) => ({ department: c.department!, permit_id: c.id })),
  };
  recordStep(ctx, 9, "STRATEGY_GENERATION", "Strategy generation", "flag", `Coordination case drafted with ${triggered.length} counterpart${triggered.length === 1 ? "" : "s"}; recommended ${ctx.coordination.recommended_strategy.replace(/_/g, " ").toLowerCase()}.`);
}
