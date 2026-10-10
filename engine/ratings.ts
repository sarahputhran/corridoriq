// Ordinal trade-off ratings. Levels only: never percentages or forecasts.
import type { Feasibility, RatingLevels, Strategy } from "./types";

export interface RatingInputs {
  strategy: Strategy;
  schedule_shift_days: number;
  /** [low_max, moderate_max] in days, from the city config. */
  schedule_cost_days: [number, number];
  flag_count: number;
  /** Active (not completed) permit counterparts in the case. */
  active_counterparts: number;
  /** Distinct departments across the new permit and its active counterparts. */
  departments: number;
  /** Worst feasibility among the joint-execution candidates; null when there are none. */
  joint_feasibility: Feasibility | null;
  hard_rule: boolean;
}

export function rateStrategy(i: RatingInputs): RatingLevels {
  const repeat_excavation_avoided =
    i.strategy === "JOINT_EXECUTION" ? "HIGH" : i.strategy === "RESEQUENCE_WORKS" || i.strategy === "DEFER_NEW_PERMIT" ? "MODERATE" : "NONE";

  const [lowMax, moderateMax] = i.schedule_cost_days;
  const schedule_cost = i.schedule_shift_days <= 0 ? "NONE" : i.schedule_shift_days <= lowMax ? "LOW" : i.schedule_shift_days <= moderateMax ? "MODERATE" : "HIGH";

  // How many separate times the stretch is disturbed under this strategy.
  const windows =
    i.strategy === "JOINT_EXECUTION" ? 1 : i.strategy === "BLOCK_OR_ESCALATE" ? Math.min(1, i.active_counterparts) : 1 + i.active_counterparts;
  const critical_facility_exposure =
    i.flag_count === 0 || windows === 0 ? "LOW" : windows >= 2 ? "HIGH" : i.strategy === "JOINT_EXECUTION" && i.flag_count === 1 ? "LOW" : "MODERATE";

  const coordination_complexity = i.strategy === "SEPARATE_EXECUTION" || i.departments <= 1 ? "LOW" : i.departments === 2 ? "MODERATE" : "HIGH";

  const engineering_feasibility =
    i.strategy === "JOINT_EXECUTION"
      ? i.joint_feasibility === "PHYSICALLY_FEASIBLE"
        ? "FEASIBLE"
        : i.joint_feasibility === "ENGINEERING_REVIEW"
          ? "REVIEW"
          : "NOT_FEASIBLE"
      : i.hard_rule && i.strategy !== "BLOCK_OR_ESCALATE"
        ? "REVIEW"
        : "FEASIBLE";

  return { repeat_excavation_avoided, schedule_cost, critical_facility_exposure, coordination_complexity, engineering_feasibility };
}
