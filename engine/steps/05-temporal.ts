import { recordStep, type Ctx } from "../context";
import { windowGapDays } from "../dates";

/** Step 5: days between the new permit's window and each counterpart's (0 = concurrent). */
export function temporal(ctx: Ctx): void {
  const { permit } = ctx;
  const zones = new Map(ctx.input.corridor.infraZones.map((z) => [z.id, z]));
  for (const c of ctx.counterparts) {
    const contextOnly = c.kind === "infra" && zones.get(c.id)!.context_only;
    c.temporal_gap_days = c.start && c.end && !contextOnly ? windowGapDays(permit.proposed_start, permit.proposed_end, c.start, c.end) : null;
  }
  const concurrent = ctx.counterparts.filter((c) => c.temporal_gap_days === 0).length;
  recordStep(
    ctx,
    5,
    "TEMPORAL",
    "Temporal",
    concurrent ? "flag" : "pass",
    ctx.counterparts.length ? `${concurrent} of ${ctx.counterparts.length} nearby works overlap this permit's dates.` : "Nothing to compare dates against.",
  );
}
