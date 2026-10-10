// The 12-step permit evaluation. Pure and deterministic: same input, same output.
import { createContext, recordStep, type Ctx } from "./context";
import { aggregateDecision } from "./decision";
import { jurisdiction } from "./steps/01-jurisdiction";
import { hardPolicy } from "./steps/02-hard-policy";
import { roadProtection } from "./steps/03-road-protection";
import { spatial } from "./steps/04-spatial";
import { temporal } from "./steps/05-temporal";
import { repeatOpening } from "./steps/06-repeat-opening";
import { feasibility } from "./steps/07-feasibility";
import { criticality } from "./steps/08-criticality";
import { strategyGeneration } from "./steps/09-strategy-generation";
import { tradeoff } from "./steps/10-tradeoff";
import { plannerGate } from "./steps/11-planner-gate";
import { audit } from "./steps/12-audit";
import type { EvaluateInput, PipelineResult } from "./types";

const ANALYSIS_STEPS: [number, string, string, (ctx: Ctx) => void][] = [
  [3, "ROAD_PROTECTION", "Road protection", roadProtection],
  [4, "SPATIAL", "Spatial", spatial],
  [5, "TEMPORAL", "Temporal", temporal],
  [6, "REPEATED_OPENING", "Repeated opening", repeatOpening],
  [7, "EXECUTION_FEASIBILITY", "Execution feasibility", feasibility],
  [8, "CITY_CRITICALITY", "City criticality", criticality],
  [9, "STRATEGY_GENERATION", "Strategy generation", strategyGeneration],
  [10, "TRADEOFF", "Trade-offs", tradeoff],
];

export function evaluatePermit(input: EvaluateInput): PipelineResult {
  const ctx = createContext(input);

  jurisdiction(ctx);
  if (ctx.outsideCorridor) recordStep(ctx, 2, "HARD_POLICY", "Hard policy", "skipped", "Not run: outside managed corridors.");
  else hardPolicy(ctx);

  // A permit that is off-corridor or hard-blocked never reaches coordination.
  const stopped = ctx.outsideCorridor || ctx.hardBlock;
  for (const [step, id, name, run] of ANALYSIS_STEPS) {
    if (stopped) recordStep(ctx, step, id, name, "skipped", ctx.outsideCorridor ? "Not run: outside managed corridors." : "Not run: blocked at hard policy.");
    else run(ctx);
  }

  const decision = ctx.outsideCorridor ? "REVIEW_REQUIRED" : aggregateDecision(ctx.hits, ctx.emergency);
  const ruleIds = [...new Set(ctx.hits.filter((h) => h.fired).map((h) => h.rule_id))].sort();
  if (ctx.coordination) ctx.coordination.rule_ids = ruleIds;

  const gate = plannerGate(ctx, decision);
  audit(ctx, gate.gate.auto_approvable);

  return {
    permit_id: input.permit.permit_id,
    today: input.today,
    steps: ctx.steps,
    ruleHits: ctx.hits,
    ruleIds,
    decision,
    conditions: ctx.conditions,
    flags: ctx.flags,
    counterparts: ctx.counterparts,
    escalations: ctx.escalations,
    ...gate,
    ...(ctx.coordination ? { coordination: ctx.coordination, strategies: ctx.strategies } : {}),
    auditRecord: { action: "permit_evaluated", permit_id: input.permit.permit_id, decision, rule_ids: ruleIds, today: input.today, case_opened: Boolean(ctx.coordination) },
    ...(ctx.noticeDraft ? { noticeDraft: ctx.noticeDraft } : {}),
  };
}
