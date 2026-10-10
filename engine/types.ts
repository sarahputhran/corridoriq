// Engine data contracts. Plain JSON in, plain JSON out. Nothing here may import from next, react or the database.

export type DecisionOutput =
  | "ALLOW"
  | "ALLOW_WITH_CONDITIONS"
  | "COORDINATION_REQUIRED"
  | "REVIEW_REQUIRED"
  | "RESCHEDULE"
  | "BLOCK"
  | "EMERGENCY_EXCEPTION";

export type RuleAction =
  | "BLOCK"
  | "BLOCK_OR_ESCALATE"
  | "BLOCK_OR_CHIEF_ENGINEER_REVIEW"
  | "RESCHEDULE_OR_WAIVER"
  | "RESCHEDULE_OR_COMMON_TRENCH"
  | "COORDINATION_REQUIRED"
  | "REVIEW_REQUIRED"
  | "ENGINEERING_REVIEW"
  | "ALLOW_WITH_CONDITIONS";

export type Strategy = "JOINT_EXECUTION" | "DEFER_NEW_PERMIT" | "RESEQUENCE_WORKS" | "SEPARATE_EXECUTION" | "BLOCK_OR_ESCALATE";
export type SpatialClass = "DIRECT_OVERLAP" | "SAME_SEGMENT" | "ADJACENT_SEGMENT" | "NEARBY" | "NO_SPATIAL_CONFLICT";
export type RepeatClass = "REPEAT_SAME_UTILITY" | "REPEAT_CROSS_UTILITY" | "COMMON_TRENCH_CANDIDATE" | "NO_REPEAT_RISK";
export type Feasibility = "PHYSICALLY_FEASIBLE" | "ENGINEERING_REVIEW" | "NOT_FEASIBLE";
export type CriticalityFlag = "hospital_access" | "school_route" | "religious_site" | "commercial" | "bus_corridor" | "major_infrastructure";
export type PermitOutcomeStatus = "auto_approved" | "approved_with_conditions" | "coordination_required" | "review_required" | "blocked";

export interface PermitInput {
  permit_id: string;
  department: string;
  purpose: string;
  work_type: "routine" | "emergency_fault";
  in_annual_programme: boolean;
  fault_sanctioned: boolean;
  /** ISO dates (YYYY-MM-DD). */
  proposed_start: string;
  proposed_end: string;
  trench_depth_m: number;
  trench_width_m: number;
  road_side: "left" | "right" | "center" | "full-width";
  traffic_impact: string;
  status: string;
  /** Null when the trench could not be matched to a managed corridor. */
  corridor_id: string | null;
  chainage_start_m: number;
  chainage_end_m: number;
  trench_length_m: number;
  /** Largest distance from either trench end to the corridor line. */
  snap_offset_m: number;
}

export interface Restoration {
  id: string;
  chainage_start_m: number;
  chainage_end_m: number;
  completed_on: string;
  surface: string;
  protected: boolean;
}

export interface InfraZone {
  id: string;
  project_name: string;
  agency: string;
  status: "active" | "planned" | "ongoing" | "completed";
  start_date: string | null;
  end_date: string | null;
  /** Context zones raise a criticality flag but never count as a schedule conflict. */
  context_only: boolean;
  chainage_start_m: number;
  chainage_end_m: number;
}

export interface NearbyFacility {
  id: string;
  name: string | null;
  type: string;
  /** Distance from the facility to the new permit's trench. */
  distance_m: number;
}

export interface NearbyBusRoute {
  id: string;
  route_name: string;
  distance_m: number;
}

/** Everything the engine needs to know about the corridor, loaded before it runs. */
export interface CorridorState {
  corridor: { id: string; road_name: string; length_m: number };
  /** Other permits on the corridor (not the one being evaluated; rejected ones excluded). */
  permits: PermitInput[];
  restorations: Restoration[];
  infraZones: InfraZone[];
  facilities: NearbyFacility[];
  busRoutes: NearbyBusRoute[];
}

export interface RuleRecord {
  rule_id: string;
  action: RuleAction;
  severity: string;
  trigger_text: string;
  params: unknown;
  enabled: boolean;
}

export interface CityConfig {
  city_id: string;
  rules: RuleRecord[];
  snap_tolerance_m: number;
  sla_hours: { department_response: number; planner_decision: number; checker: number };
  /** [low_max, moderate_max] schedule-shift thresholds in days. */
  schedule_cost_days: [number, number];
  defer_buffer_days: number;
}

export interface EvaluateInput {
  permit: PermitInput;
  corridor: CorridorState;
  city: CityConfig;
  /** ISO date; the engine never reads the clock. */
  today: string;
}

export interface RuleHit {
  rule_id: string;
  step: number;
  fired: boolean;
  action: RuleAction;
  decision: DecisionOutput;
  counterpart_permit_id?: string;
  counterpart_infra_id?: string;
  restoration_id?: string;
  inputs: Record<string, unknown>;
  explanation: string;
}

export interface StepResult {
  step: number;
  id: string;
  name: string;
  status: "pass" | "flag" | "stop" | "skipped";
  summary: string;
}

export interface Counterpart {
  kind: "permit" | "infra";
  id: string;
  label: string;
  department: string | null;
  status: string;
  /** Completed works: they count for repeat-opening rules but cannot be executed jointly. */
  history: boolean;
  spatial: SpatialClass;
  overlap_m: number;
  gap_m: number;
  /** 0 when the windows overlap; null when the counterpart has no usable dates. */
  temporal_gap_days: number | null;
  repeat: RepeatClass;
  feasibility: Feasibility;
  feasibility_reasons: string[];
  trigger_reasons: string[];
  joint_candidate: boolean;
  start: string | null;
  end: string | null;
}

export type RatingLevels = {
  repeat_excavation_avoided: "NONE" | "MODERATE" | "HIGH";
  schedule_cost: "NONE" | "LOW" | "MODERATE" | "HIGH";
  critical_facility_exposure: "LOW" | "MODERATE" | "HIGH";
  coordination_complexity: "LOW" | "MODERATE" | "HIGH";
  engineering_feasibility: "FEASIBLE" | "REVIEW" | "NOT_FEASIBLE";
};

export interface StrategyOption {
  strategy: Strategy;
  feasible: boolean;
  recommended: boolean;
  schedule_shift_days: number;
  ratings: RatingLevels;
  conditions: string[];
  rationale: string;
}

export interface CaseDraft {
  triggering_permit_id: string;
  corridor_id: string;
  /** The triggering permit plus every permit counterpart, sorted. */
  permit_ids: string[];
  infra_zone_ids: string[];
  chainage_start_m: number;
  chainage_end_m: number;
  spatial_classification: SpatialClass;
  repeat_opening_classification: RepeatClass;
  execution_feasibility: Feasibility;
  criticality_flags: CriticalityFlag[];
  rule_ids: string[];
  recommended_strategy: Strategy;
  /** Departments that must confirm dates or propose an alternative. */
  department_tasks: { department: string; permit_id: string }[];
}

export interface Escalation {
  rule_id: string;
  reason: string;
}

export interface NoticeDraft {
  corridor_id: string;
  permit_ids: string[];
  chainage_start_m: number;
  chainage_end_m: number;
  starts_on: string;
  ends_on: string;
  traffic_impact: string;
  departments: string[];
}

export interface PipelineResult {
  permit_id: string;
  today: string;
  steps: StepResult[];
  ruleHits: RuleHit[];
  /** IDs of rules that fired, sorted and de-duplicated. */
  ruleIds: string[];
  decision: DecisionOutput;
  conditions: string[];
  flags: CriticalityFlag[];
  counterparts: Counterpart[];
  escalations: Escalation[];
  requires_planner: boolean;
  gate: { auto_approvable: boolean; reason: string };
  outcome_status: PermitOutcomeStatus;
  coordination?: CaseDraft;
  strategies?: StrategyOption[];
  auditRecord: { action: "permit_evaluated"; permit_id: string; decision: DecisionOutput; rule_ids: string[]; today: string; case_opened: boolean };
  noticeDraft?: NoticeDraft;
}
