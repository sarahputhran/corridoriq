import { recordStep, type Ctx } from "../context";
import type { DecisionOutput, PermitOutcomeStatus } from "../types";

export interface GateResult {
  requires_planner: boolean;
  gate: { auto_approvable: boolean; reason: string };
  outcome_status: PermitOutcomeStatus;
}

/** Step 11: the coordination gate: nothing with an open case is approved automatically. */
export function plannerGate(ctx: Ctx, decision: DecisionOutput): GateResult {
  let result: GateResult;
  if (ctx.outsideCorridor) {
    result = { requires_planner: true, gate: { auto_approvable: false, reason: "Outside managed corridors: manual review." }, outcome_status: "review_required" };
  } else if (decision === "BLOCK") {
    result = { requires_planner: false, gate: { auto_approvable: false, reason: "Blocked by a hard rule." }, outcome_status: "blocked" };
  } else if (ctx.coordination) {
    result = { requires_planner: true, gate: { auto_approvable: false, reason: "A coordination case is open: the planner decides and a supervisor signs off." }, outcome_status: "coordination_required" };
  } else if (decision === "ALLOW") {
    result = { requires_planner: false, gate: { auto_approvable: true, reason: "No rule fired." }, outcome_status: "auto_approved" };
  } else if (decision === "ALLOW_WITH_CONDITIONS" || decision === "EMERGENCY_EXCEPTION") {
    result = { requires_planner: false, gate: { auto_approvable: true, reason: decision === "EMERGENCY_EXCEPTION" ? "Emergency fault pathway, with conditions." : "Approvable with the listed conditions." }, outcome_status: "approved_with_conditions" };
  } else {
    result = { requires_planner: true, gate: { auto_approvable: false, reason: "A rule requires planner review." }, outcome_status: "review_required" };
  }
  recordStep(ctx, 11, "PLANNER_GATE", "Planner decision", result.gate.auto_approvable ? "pass" : decision === "BLOCK" ? "stop" : "flag", result.gate.reason);
  return result;
}
