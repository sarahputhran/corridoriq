import { recordStep, type Ctx } from "../context";

/** Step 10: ordinal trade-off ratings per strategy. The AI explanation is written outside the engine. */
export function tradeoff(ctx: Ctx): void {
  if (!ctx.strategies) {
    recordStep(ctx, 10, "TRADEOFF", "Trade-offs", ctx.emergency ? "skipped" : "pass", "No strategies to compare.");
    return;
  }
  const rec = ctx.strategies.find((s) => s.recommended)!;
  const r = rec.ratings;
  recordStep(
    ctx,
    10,
    "TRADEOFF",
    "Trade-offs",
    "flag",
    `Recommended option: repeat excavation avoided ${r.repeat_excavation_avoided.toLowerCase()}, schedule cost ${r.schedule_cost.toLowerCase()}, critical facility exposure ${r.critical_facility_exposure.toLowerCase()}.`,
  );
}
