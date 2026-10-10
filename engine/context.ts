// Mutable working state shared by the 12 steps of one evaluation. Created fresh per call; never leaves the engine.
import { ACTION_DECISION } from "./decision";
import { RuleBook, type RuleId } from "./rules";
import type { CaseDraft, Counterpart, CriticalityFlag, Escalation, EvaluateInput, NoticeDraft, PermitInput, RuleHit, StepResult, StrategyOption } from "./types";

export interface Ctx {
  input: EvaluateInput;
  permit: PermitInput;
  rules: RuleBook;
  steps: StepResult[];
  hits: RuleHit[];
  conditions: string[];
  flags: CriticalityFlag[];
  counterparts: Counterpart[];
  escalations: Escalation[];
  /** Step 1 could not place the permit on a managed corridor. */
  outsideCorridor: boolean;
  /** Step 2 produced a hard block; no coordination case is opened. */
  hardBlock: boolean;
  /** Valid emergency fault: coordination and road-protection rules are recorded but not applied. */
  emergency: boolean;
  coordination?: CaseDraft;
  strategies?: StrategyOption[];
  noticeDraft?: NoticeDraft;
}

export function createContext(input: EvaluateInput): Ctx {
  return {
    input,
    permit: input.permit,
    rules: new RuleBook(input.city),
    steps: [],
    hits: [],
    conditions: [],
    flags: [],
    counterparts: [],
    escalations: [],
    outsideCorridor: false,
    hardBlock: false,
    emergency: false,
  };
}

export function recordStep(ctx: Ctx, step: number, id: string, name: string, status: StepResult["status"], summary: string): void {
  ctx.steps.push({ step, id, name, status, summary });
}

type HitDetail = Pick<RuleHit, "counterpart_permit_id" | "counterpart_infra_id" | "restoration_id"> & {
  inputs: Record<string, unknown>;
  explanation: string;
};

/** Records that a rule's trigger was met. A disabled rule never fires. Returns whether it fired. */
export function fire(ctx: Ctx, id: RuleId, step: number, detail: HitDetail): boolean {
  const rule = ctx.rules.get(id);
  if (!rule.enabled) return false;
  ctx.hits.push({ rule_id: id, step, fired: true, action: rule.action, decision: ACTION_DECISION[rule.action], ...detail });
  return true;
}

export function addCondition(ctx: Ctx, condition: string): void {
  if (!ctx.conditions.includes(condition)) ctx.conditions.push(condition);
}

/** Overlap in metres between two chainage ranges; negative values are the gap between them. */
export function rangeOverlap(a: { chainage_start_m: number; chainage_end_m: number }, b: { chainage_start_m: number; chainage_end_m: number }): number {
  return Math.min(a.chainage_end_m, b.chainage_end_m) - Math.max(a.chainage_start_m, b.chainage_start_m);
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
