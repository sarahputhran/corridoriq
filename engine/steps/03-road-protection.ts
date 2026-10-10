import { fire, rangeOverlap, recordStep, round1, type Ctx } from "../context";
import { addMonths } from "../dates";

/** Step 3: recent restoration, defect-liability period, protected surface and arterial moratorium. */
export function roadProtection(ctx: Ctx): void {
  const { permit } = ctx;
  if (ctx.emergency) {
    recordStep(ctx, 3, "ROAD_PROTECTION", "Road protection", "skipped", "Not applied on the emergency fault pathway.");
    return;
  }
  const notes: string[] = [];
  const restorations = [...ctx.input.corridor.restorations].sort((a, b) => a.id.localeCompare(b.id));
  for (const r of restorations) {
    const overlap = rangeOverlap(permit, r);
    if (overlap <= 0) continue;
    const base = {
      restoration_id: r.id,
      inputs: { overlap_m: round1(overlap), completed_on: r.completed_on, surface: r.surface, protected: r.protected, proposed_start: permit.proposed_start },
    };
    const within = (months: number) => permit.proposed_start <= addMonths(r.completed_on, months);

    const dlp = ctx.rules.get("PMC_DLP_12M");
    if (within(dlp.params.months) && fire(ctx, "PMC_DLP_12M", 3, { ...base, explanation: `Work starts within ${dlp.params.months} months of restoration ${r.id}.` })) {
      notes.push(`${r.id}: inside the defect-liability period.`);
    }

    const restored = ctx.rules.get("CORRIDOR_RESTORED_12M");
    if (within(restored.params.months) && fire(ctx, "CORRIDOR_RESTORED_12M", 3, { ...base, explanation: `The stretch was restored within the last ${restored.params.months} months (${r.id}).` })) {
      notes.push(`${r.id}: recently restored stretch.`);
    }

    const cc = ctx.rules.get("PMC_CC_DLP_PRIOR_APPROVAL");
    const protectedSurface = cc.params.surfaces.includes(r.surface);
    const explanation = protectedSurface
      ? `The stretch has a ${r.surface.replace(/_/g, " ")} surface (${r.id}); prior approval is needed.`
      : `The stretch is inside its defect-liability period (${r.id}); prior approval is needed.`;
    if ((protectedSurface || within(cc.params.dlp_months)) && fire(ctx, "PMC_CC_DLP_PRIOR_APPROVAL", 3, { ...base, explanation })) {
      notes.push(`${r.id}: prior approval needed.`);
    }

    const moratorium = ctx.rules.get("CORRIDOR_CRITICAL_MORATORIUM");
    const underMoratorium =
      r.protected &&
      within(moratorium.params.months) &&
      fire(ctx, "CORRIDOR_CRITICAL_MORATORIUM", 3, { ...base, explanation: `Protected arterial stretch reconstructed within the last ${moratorium.params.months} months (${r.id}).` });
    if (underMoratorium) {
      ctx.escalations.push({ rule_id: "CORRIDOR_CRITICAL_MORATORIUM", reason: `Chief engineer review: protected stretch ${r.id} is under moratorium` });
      notes.push(`${r.id}: protected stretch under moratorium.`);
    }
  }
  recordStep(ctx, 3, "ROAD_PROTECTION", "Road protection", notes.length ? "flag" : "pass", notes.join(" ") || "No recent restoration or protected surface under the trench.");
}
