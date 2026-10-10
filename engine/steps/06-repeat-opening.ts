import { fire, recordStep, type Ctx } from "../context";
import { windowsWithinMonths } from "../dates";
import type { Counterpart } from "../types";

const SAME_PLACE = new Set(["DIRECT_OVERLAP", "SAME_SEGMENT"]);
const CLOSE = new Set(["DIRECT_OVERLAP", "SAME_SEGMENT", "ADJACENT_SEGMENT"]);

/** Step 6: repeated-opening analysis, then which counterparts amount to a coordination trigger. */
export function repeatOpening(ctx: Ctx): void {
  const { permit } = ctx;
  if (ctx.emergency) {
    recordStep(ctx, 6, "REPEATED_OPENING", "Repeated opening", "skipped", "Not applied on the emergency fault pathway.");
    return;
  }
  const same = ctx.rules.get("XPMS_REPEAT_SAME_6M");
  const other = ctx.rules.get("XPMS_REPEAT_OTHER_3M");
  const common = ctx.rules.get("XPMS_COMMON_TRENCH_3_6M");
  const multiwork = ctx.rules.get("CORRIDOR_SAME_SEGMENT_MULTIWORK");
  const gate = ctx.rules.get("CORRIDOR_FACILITY_CRITICALITY_GATE");
  const within = (c: Counterpart, months: number) => windowsWithinMonths(permit.proposed_start, permit.proposed_end, c.start!, c.end!, months);

  for (const c of ctx.counterparts) {
    if (c.kind === "permit" && SAME_PLACE.has(c.spatial)) {
      const detail = { counterpart_permit_id: c.id, inputs: { spatial: c.spatial, temporal_gap_days: c.temporal_gap_days, counterpart_status: c.status } };
      const verb = c.history ? "opened" : "plans to open";
      if (c.department === permit.department) {
        const explanation = `The same department ${verb} this location within ${same.params.months} months (${c.id}).`;
        if (within(c, same.params.months) && fire(ctx, "XPMS_REPEAT_SAME_6M", 6, { ...detail, explanation })) c.repeat = "REPEAT_SAME_UTILITY";
      } else if (within(c, other.params.months)) {
        const explanation = `Another department ${verb} this location within ${other.params.months} months (${c.id}).`;
        if (fire(ctx, "XPMS_REPEAT_OTHER_3M", 6, { ...detail, explanation })) c.repeat = "REPEAT_CROSS_UTILITY";
      } else if (within(c, common.params.max_months)) {
        const explanation = `Another department's work at this location falls ${common.params.min_months}–${common.params.max_months} months away (${c.id}).`;
        if (fire(ctx, "XPMS_COMMON_TRENCH_3_6M", 6, { ...detail, explanation })) c.repeat = "COMMON_TRENCH_CANDIDATE";
      }
    }

    // Coordination triggers. Completed works trigger only through the repeat-opening rules.
    if (c.kind === "permit" && CLOSE.has(c.spatial)) {
      const inWindow =
        multiwork.enabled && multiwork.params.window_days > 0 && c.temporal_gap_days !== null && c.temporal_gap_days <= multiwork.params.window_days;
      if (!c.history && inWindow) c.trigger_reasons.push("within_coordination_window");
      if (c.repeat !== "NO_REPEAT_RISK") c.trigger_reasons.push("repeat_opening");
    }
    if (c.kind === "infra" && c.spatial === "DIRECT_OVERLAP" && !c.history && c.temporal_gap_days === 0 && gate.enabled) {
      c.trigger_reasons.push("infrastructure_zone_overlap");
    }
  }

  const repeats = ctx.counterparts.filter((c) => c.repeat !== "NO_REPEAT_RISK");
  recordStep(
    ctx,
    6,
    "REPEATED_OPENING",
    "Repeated opening",
    repeats.length ? "flag" : "pass",
    repeats.length ? repeats.map((c) => `${c.repeat.replace(/_/g, " ").toLowerCase()} with ${c.id}`).join("; ") + "." : "No repeat-opening risk.",
  );
}
