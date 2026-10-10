// Strategy generation: all five strategies, which are feasible, and one recommendation.
import type { Ctx } from "./context";
import { daysBetween } from "./dates";
import { rateStrategy } from "./ratings";
import type { Counterpart, Feasibility, Strategy, StrategyOption } from "./types";

const ORDER: Strategy[] = ["JOINT_EXECUTION", "DEFER_NEW_PERMIT", "RESEQUENCE_WORKS", "SEPARATE_EXECUTION", "BLOCK_OR_ESCALATE"];
const FEASIBILITY_RANK: Feasibility[] = ["PHYSICALLY_FEASIBLE", "ENGINEERING_REVIEW", "NOT_FEASIBLE"];

export function worstFeasibility(list: Counterpart[]): Feasibility | null {
  if (!list.length) return null;
  return list.reduce<Feasibility>((worst, c) => (FEASIBILITY_RANK.indexOf(c.feasibility) > FEASIBILITY_RANK.indexOf(worst) ? c.feasibility : worst), "PHYSICALLY_FEASIBLE");
}

export function generateStrategies(ctx: Ctx): StrategyOption[] {
  const { permit, input } = ctx;
  const triggered = ctx.counterparts.filter((c) => c.trigger_reasons.length > 0);
  const active = triggered.filter((c) => c.kind === "permit" && !c.history);
  const candidates = triggered.filter((c) => c.joint_candidate);
  const concurrent = active.filter((c) => c.temporal_gap_days === 0);
  const unstarted = active.filter((c) => c.start! > input.today);
  const infra = triggered.filter((c) => c.kind === "infra");
  const hardRule = ctx.escalations.length > 0;
  const jointFeasibility = worstFeasibility(candidates);

  // A repeat opening the planner could avoid by swapping the order: the counterpart has not started and is due after this work.
  const swappable = unstarted.filter((c) => c.repeat !== "NO_REPEAT_RISK" && c.start! > permit.proposed_end);

  const recommended: Strategy = hardRule
    ? "BLOCK_OR_ESCALATE"
    : candidates.length
      ? "JOINT_EXECUTION"
      : concurrent.length
        ? "DEFER_NEW_PERMIT"
        : swappable.length
          ? "RESEQUENCE_WORKS"
          : "SEPARATE_EXECUTION";

  const earliest = (list: Counterpart[]) => list.map((c) => c.start!).sort()[0];
  const latestEnd = (list: Counterpart[]) => list.map((c) => c.end!).sort().at(-1)!;
  const primary = [...unstarted].sort((a, b) => b.overlap_m - a.overlap_m || a.id.localeCompare(b.id))[0];

  const shift: Record<Strategy, number> = {
    JOINT_EXECUTION: candidates.length ? Math.abs(daysBetween(earliest(candidates), permit.proposed_start)) : 0,
    DEFER_NEW_PERMIT: active.length ? Math.max(0, daysBetween(permit.proposed_start, latestEnd(active))) + input.city.defer_buffer_days : 0,
    RESEQUENCE_WORKS: primary
      ? Math.min(Math.max(0, daysBetween(primary.start!, permit.proposed_end)), Math.max(0, daysBetween(permit.proposed_start, primary.end!)))
      : 0,
    SEPARATE_EXECUTION: 0,
    BLOCK_OR_ESCALATE: 0,
  };
  const feasible: Record<Strategy, boolean> = {
    JOINT_EXECUTION: candidates.length > 0,
    DEFER_NEW_PERMIT: active.length > 0,
    RESEQUENCE_WORKS: unstarted.length > 0,
    SEPARATE_EXECUTION: true,
    BLOCK_OR_ESCALATE: true,
  };
  const ids = (list: Counterpart[]) => list.map((c) => c.id).join(", ");
  const rationale: Record<Strategy, string> = {
    JOINT_EXECUTION: candidates.length
      ? `Open the road once for this work and ${ids(candidates)}: the trenches overlap and the dates fall inside the coordination window.`
      : "No overlapping active work can share a trench with this permit.",
    DEFER_NEW_PERMIT: active.length ? `Start this work after ${ids(active)} finish${active.length === 1 ? "es" : ""}, plus the buffer.` : "There is no active work to wait for.",
    RESEQUENCE_WORKS: primary ? `Swap the order with ${primary.id}, which has not started, so the works run back to back.` : "No counterpart is still unstarted, so the order cannot be changed.",
    SEPARATE_EXECUTION: "Each work proceeds on its own dates; the road is opened separately for each.",
    BLOCK_OR_ESCALATE: hardRule ? `A road-protection rule prevents normal processing: ${ctx.escalations.map((e) => e.reason).join("; ")}.` : "No hard rule applies; escalate only if the planner sees a reason to.",
  };
  const departments = new Set([permit.department, ...active.map((c) => c.department!)]).size;

  return ORDER.map((strategy) => {
    const conditions: string[] = [];
    if (strategy === "JOINT_EXECUTION" && jointFeasibility === "ENGINEERING_REVIEW") conditions.push("Engineering sign-off before joint trench.");
    if (strategy !== "BLOCK_OR_ESCALATE") {
      for (const zone of infra) conditions.push(`Coordinate method and timing with ${zone.department} (${zone.label}).`);
      if (hardRule) conditions.push("Needs chief engineer approval before any excavation.");
    }
    return {
      strategy,
      feasible: feasible[strategy],
      recommended: strategy === recommended,
      schedule_shift_days: shift[strategy],
      ratings: rateStrategy({
        strategy,
        schedule_shift_days: shift[strategy],
        schedule_cost_days: input.city.schedule_cost_days,
        flag_count: ctx.flags.length,
        active_counterparts: active.length,
        departments,
        joint_feasibility: jointFeasibility,
        hard_rule: hardRule,
      }),
      conditions,
      rationale: rationale[strategy],
    };
  });
}
