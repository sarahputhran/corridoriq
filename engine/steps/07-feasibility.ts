import { fire, recordStep, type Ctx } from "../context";
import type { Feasibility } from "../types";

/** Step 7: can the works physically share one trench? Demo heuristics, labelled as such in the UI. */
export function feasibility(ctx: Ctx): void {
  const { permit } = ctx;
  if (ctx.emergency) {
    recordStep(ctx, 7, "EXECUTION_FEASIBILITY", "Execution feasibility", "skipped", "Not applied on the emergency fault pathway.");
    return;
  }
  const rule = ctx.rules.get("CORRIDOR_EXECUTION_FEASIBILITY");
  const { window_days } = ctx.rules.get("CORRIDOR_SAME_SEGMENT_MULTIWORK").params;
  const others = new Map(ctx.input.corridor.permits.map((p) => [p.permit_id, p]));
  const isPair = (a: string, b: string) => rule.params.separation_pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

  for (const c of ctx.counterparts) {
    let result: Feasibility = "PHYSICALLY_FEASIBLE";
    const reasons: string[] = [];
    if (c.kind === "infra") {
      result = "NOT_FEASIBLE";
      reasons.push("A utility trench cannot be shared with a major infrastructure work zone; coordination only.");
    } else if (c.history) {
      reasons.push("Completed work: history only, not a joint-execution candidate.");
    } else {
      const other = others.get(c.id)!;
      const notJoint = rule.params.not_joint_departments.filter((d) => d === other.department || d === permit.department);
      if (notJoint.length) {
        result = "NOT_FEASIBLE";
        reasons.push(`Works by ${notJoint.join(" / ")} cannot share a utility trench; coordination only.`);
      } else {
        const opposite = (permit.road_side === "left" && other.road_side === "right") || (permit.road_side === "right" && other.road_side === "left");
        if (opposite) reasons.push("Trenches are on opposite sides of the road.");
        const depthDiff = Math.round(Math.abs(permit.trench_depth_m - other.trench_depth_m) * 100) / 100;
        if (depthDiff > rule.params.max_depth_diff_m) reasons.push(`Trench depths differ by ${depthDiff} m.`);
        if (isPair(permit.department, other.department)) reasons.push("Gas and electricity need a separation review.");
        if (reasons.length) result = "ENGINEERING_REVIEW";
      }
    }
    c.feasibility = result;
    c.feasibility_reasons = reasons;

    const overlapping = c.spatial === "DIRECT_OVERLAP" || c.spatial === "SAME_SEGMENT";
    const triggered = c.trigger_reasons.length > 0;
    const inWindow = c.temporal_gap_days !== null && c.temporal_gap_days <= window_days;
    c.joint_candidate = c.kind === "permit" && !c.history && triggered && overlapping && inWindow && result !== "NOT_FEASIBLE";

    if (c.kind === "permit" && !c.history && triggered && overlapping && result !== "PHYSICALLY_FEASIBLE") {
      fire(ctx, "CORRIDOR_EXECUTION_FEASIBILITY", 7, {
        counterpart_permit_id: c.id,
        inputs: { result, reasons, heuristic: rule.params.heuristic },
        explanation: `Joint execution with ${c.id} needs engineering review: ${reasons.join(" ")}`,
      });
    }
  }

  const reviewed = ctx.counterparts.filter((c) => c.trigger_reasons.length && c.feasibility !== "PHYSICALLY_FEASIBLE");
  recordStep(
    ctx,
    7,
    "EXECUTION_FEASIBILITY",
    "Execution feasibility",
    reviewed.length ? "flag" : "pass",
    reviewed.length ? reviewed.map((c) => `${c.id}: ${c.feasibility.replace(/_/g, " ").toLowerCase()}`).join("; ") + "." : "No joint-execution constraint found.",
  );
}
