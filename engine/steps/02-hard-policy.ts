import { addCondition, fire, recordStep, type Ctx } from "../context";
import { overlapsSeason } from "../dates";

/** Step 2: seasonal restriction, emergency path, staging and annual-programme checks. */
export function hardPolicy(ctx: Ctx): void {
  const { permit } = ctx;
  const notes: string[] = [];
  const monsoon = ctx.rules.get("PMC_MONSOON_5M");
  const inRestrictedSeason = overlapsSeason(permit.proposed_start, permit.proposed_end, monsoon.params.start_mmdd, monsoon.params.end_mmdd);
  const window = { proposed_start: permit.proposed_start, proposed_end: permit.proposed_end, start_mmdd: monsoon.params.start_mmdd, end_mmdd: monsoon.params.end_mmdd };

  if (permit.work_type === "emergency_fault") {
    const limit = ctx.rules.get("PMC_FAULT_MONSOON_5X1");
    const oversize = permit.trench_length_m > limit.params.max_length_m || permit.trench_width_m > limit.params.max_width_m;
    const blocked =
      inRestrictedSeason &&
      !permit.fault_sanctioned &&
      oversize &&
      fire(ctx, "PMC_FAULT_MONSOON_5X1", 2, {
        inputs: { ...window, trench_length_m: permit.trench_length_m, trench_width_m: permit.trench_width_m, ...limit.params, fault_sanctioned: false },
        explanation: "Fault repair in the restricted season is larger than the permitted footprint and has no sanction.",
      });
    if (blocked) {
      ctx.hardBlock = true;
      ctx.escalations.push({ rule_id: "PMC_FAULT_MONSOON_5X1", reason: "Oversize fault excavation in the restricted season needs sanction" });
      notes.push("Blocked: oversize fault excavation in the restricted season without sanction.");
    } else {
      const fault = ctx.rules.get("PMC_FAULT_48H");
      const fired = fire(ctx, "PMC_FAULT_48H", 2, {
        inputs: { work_type: permit.work_type, hours: fault.params.hours },
        explanation: "Emergency fault repair follows the rapid repair and reinstatement pathway.",
      });
      if (fired) {
        ctx.emergency = true;
        addCondition(ctx, `Complete the repair and reinstate the road within ${fault.params.hours} hours.`);
        notes.push("Emergency fault pathway applies.");
      }
    }
  } else {
    const blocked = inRestrictedSeason && fire(ctx, "PMC_MONSOON_5M", 2, { inputs: window, explanation: "Routine excavation is proposed inside the monsoon restriction window." });
    if (blocked) {
      ctx.hardBlock = true;
      notes.push("Blocked: routine work inside the monsoon window.");
    }
    const offProgramme =
      !permit.in_annual_programme &&
      fire(ctx, "PMC_ANNUAL_PROGRAMME", 2, { inputs: { in_annual_programme: false }, explanation: "The work is not in the annual coordinated programme." });
    if (offProgramme) notes.push("Not in the annual programme: needs review.");
  }

  const staging = ctx.rules.get("PMC_100M_STAGING");
  const long =
    permit.trench_length_m > staging.params.max_length_m &&
    fire(ctx, "PMC_100M_STAGING", 2, {
      inputs: { trench_length_m: permit.trench_length_m, max_length_m: staging.params.max_length_m },
      explanation: "The trench is longer than the staging limit.",
    });
  if (long) {
    addCondition(ctx, `Stage the works: open no more than ${staging.params.max_length_m} m at a time and reinstate each section before the next.`);
    notes.push("Long trench: staging condition added.");
  }

  recordStep(ctx, 2, "HARD_POLICY", "Hard policy", ctx.hardBlock ? "stop" : notes.length ? "flag" : "pass", notes.join(" ") || "No seasonal or procedural restriction applies.");
}
