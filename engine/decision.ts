// Decision aggregation: map each fired rule's action to a decision, then take the most restrictive.
import type { DecisionOutput, RuleAction, RuleHit } from "./types";

export const ACTION_DECISION: Record<RuleAction, DecisionOutput> = {
  BLOCK: "BLOCK",
  BLOCK_OR_ESCALATE: "BLOCK",
  BLOCK_OR_CHIEF_ENGINEER_REVIEW: "REVIEW_REQUIRED",
  RESCHEDULE_OR_WAIVER: "RESCHEDULE",
  RESCHEDULE_OR_COMMON_TRENCH: "RESCHEDULE",
  COORDINATION_REQUIRED: "COORDINATION_REQUIRED",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
  ENGINEERING_REVIEW: "REVIEW_REQUIRED",
  ALLOW_WITH_CONDITIONS: "ALLOW_WITH_CONDITIONS",
};

/** Least to most restrictive. */
const RANK: DecisionOutput[] = ["ALLOW", "ALLOW_WITH_CONDITIONS", "REVIEW_REQUIRED", "COORDINATION_REQUIRED", "RESCHEDULE", "BLOCK"];

export function mostRestrictive(decisions: DecisionOutput[]): DecisionOutput {
  return decisions.reduce<DecisionOutput>((worst, d) => (RANK.indexOf(d) > RANK.indexOf(worst) ? d : worst), "ALLOW");
}

export function aggregateDecision(hits: RuleHit[], validEmergency: boolean): DecisionOutput {
  const decision = mostRestrictive(hits.filter((h) => h.fired).map((h) => h.decision));
  // A valid emergency fault replaces the plain allow outcomes; anything stricter still stands.
  if (validEmergency && (decision === "ALLOW" || decision === "ALLOW_WITH_CONDITIONS")) return "EMERGENCY_EXCEPTION";
  return decision;
}
