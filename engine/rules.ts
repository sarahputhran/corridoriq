// Rule parameters are data. These schemas validate them; the Admin editor reuses them.
import { z } from "zod";
import type { CityConfig, RuleAction, RuleRecord } from "./types";

const mmdd = z.string().regex(/^\d{2}-\d{2}$/);
const months = z.object({ months: z.number().int().min(0).max(120) });

export const ruleParamSchemas = {
  PMC_DLP_12M: months,
  PMC_CC_DLP_PRIOR_APPROVAL: z.object({ surfaces: z.array(z.string()), dlp_months: z.number().int().min(0).max(120).default(12) }),
  PMC_MONSOON_5M: z.object({ start_mmdd: mmdd, end_mmdd: mmdd, applies_to: z.literal("routine") }),
  PMC_FAULT_48H: z.object({ hours: z.number().positive() }),
  PMC_FAULT_MONSOON_5X1: z.object({ max_length_m: z.number().positive(), max_width_m: z.number().positive() }),
  PMC_100M_STAGING: z.object({ max_length_m: z.number().positive() }),
  PMC_ANNUAL_PROGRAMME: z.object({}),
  XPMS_REPEAT_SAME_6M: months,
  XPMS_REPEAT_OTHER_3M: months,
  XPMS_COMMON_TRENCH_3_6M: z.object({ min_months: z.number().int().min(0), max_months: z.number().int().min(0) }),
  MOHUA_UTILITY_COORDINATION: z.object({ groups: z.array(z.array(z.string())) }),
  CORRIDOR_CRITICAL_MORATORIUM: months,
  CORRIDOR_RESTORED_12M: months,
  CORRIDOR_FACILITY_CRITICALITY_GATE: z.object({
    buffer_m: z.number().min(0),
    critical_types: z.array(z.string()),
    include_bus: z.boolean(),
    commercial_min: z.number().int().min(1),
  }),
  CORRIDOR_SAME_SEGMENT_MULTIWORK: z.object({
    window_days: z.number().int().min(0),
    adjacent_m: z.number().min(0),
    nearby_m: z.number().min(0),
    /** Trenches closer than this along the road count as overlapping (absorbs survey and snapping noise). */
    overlap_tolerance_m: z.number().min(0).default(5),
  }),
  CORRIDOR_EXECUTION_FEASIBILITY: z.object({
    max_depth_diff_m: z.number().min(0),
    heuristic: z.boolean(),
    /** Departments whose works cannot share a trench (coordination only). */
    not_joint_departments: z.array(z.string()).default([]),
    /** Department pairs that need a separation review before sharing a trench. */
    separation_pairs: z.array(z.tuple([z.string(), z.string()])).default([]),
  }),
} as const;

export type RuleId = keyof typeof ruleParamSchemas;
export type RuleParams<K extends RuleId> = z.infer<(typeof ruleParamSchemas)[K]>;
export const RULE_IDS = Object.keys(ruleParamSchemas) as RuleId[];

export interface LoadedRule<K extends RuleId> {
  rule_id: K;
  enabled: boolean;
  action: RuleAction;
  trigger_text: string;
  params: RuleParams<K>;
}

export class RuleBook {
  private readonly byId: Map<string, RuleRecord>;

  constructor(city: CityConfig) {
    this.byId = new Map(city.rules.map((r) => [r.rule_id, r]));
  }

  /** The rule with validated params. Throws when a rule is missing or its params are malformed. */
  get<K extends RuleId>(id: K): LoadedRule<K> {
    const record = this.byId.get(id);
    if (!record) throw new Error(`Rule ${id} is not configured for this city`);
    const parsed = ruleParamSchemas[id].safeParse(record.params);
    if (!parsed.success) throw new Error(`Rule ${id} has invalid params: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
    return { rule_id: id, enabled: record.enabled, action: record.action, trigger_text: record.trigger_text, params: parsed.data as RuleParams<K> };
  }
}
