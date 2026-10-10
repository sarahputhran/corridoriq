// Unit tests per step, on small hand-built inputs (not the Pune data).
import { describe, expect, it } from "vitest";
import { addDays, addMonths, daysBetween, overlapsSeason, windowGapDays, windowsWithinMonths } from "../dates";
import { aggregateDecision, mostRestrictive } from "../decision";
import { evaluatePermit } from "../pipeline";
import { rateStrategy, type RatingInputs } from "../ratings";
import type { CorridorState, InfraZone, PermitInput, PipelineResult, Restoration, RuleHit } from "../types";
import { city, counterpart, strategy } from "./helpers";

const TODAY = "2026-10-15";
const base: PermitInput = {
  permit_id: "NEW", department: "Jio Fiber", purpose: "duct", work_type: "routine", in_annual_programme: true, fault_sanctioned: false,
  proposed_start: "2026-11-10", proposed_end: "2026-11-20", trench_depth_m: 0.6, trench_width_m: 0.6, road_side: "left", traffic_impact: "one_lane",
  status: "submitted", corridor_id: "c1", chainage_start_m: 1000, chainage_end_m: 1050, trench_length_m: 50, snap_offset_m: 2,
};
const make = (o: Partial<PermitInput> = {}): PermitInput => ({ ...base, ...o });
const other = (o: Partial<PermitInput> = {}): PermitInput => make({ permit_id: "OTHER", department: "PMC Water Supply", status: "approved", ...o });
const state = (o: Partial<CorridorState> = {}): CorridorState => ({ corridor: { id: "c1", road_name: "Test Road", length_m: 3000 }, permits: [], restorations: [], infraZones: [], facilities: [], busRoutes: [], ...o });
const run = (p: PermitInput, s: Partial<CorridorState> = {}, edits = {}): PipelineResult => evaluatePermit({ permit: p, corridor: state(s), city: city(edits), today: TODAY });
const restoration = (o: Partial<Restoration> = {}): Restoration => ({ id: "RX", chainage_start_m: 990, chainage_end_m: 1060, completed_on: "2026-08-01", surface: "bituminous", protected: false, ...o });
const zone = (o: Partial<InfraZone> = {}): InfraZone => ({ id: "ZX", project_name: "Flyover", agency: "Agency", status: "active", start_date: "2026-01-01", end_date: "2027-12-31", context_only: false, chainage_start_m: 900, chainage_end_m: 1200, ...o });

describe("dates", () => {
  it("counts days and adds days and months without the clock", () => {
    expect(daysBetween("2026-10-26", "2026-11-12")).toBe(17);
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addMonths("2025-11-01", 12)).toBe("2026-11-01");
    expect(addMonths("2026-08-31", 6)).toBe("2027-02-28");
  });
  it("measures the gap between windows", () => {
    expect(windowGapDays("2026-11-01", "2026-11-10", "2026-11-05", "2026-11-20")).toBe(0);
    expect(windowGapDays("2026-11-01", "2026-11-10", "2026-11-21", "2026-11-30")).toBe(11);
    expect(windowGapDays("2026-11-21", "2026-11-30", "2026-11-01", "2026-11-10")).toBe(11);
    expect(windowsWithinMonths("2026-09-01", "2026-09-05", "2026-12-05", "2026-12-10", 3)).toBe(true);
    expect(windowsWithinMonths("2026-09-01", "2026-09-05", "2026-12-06", "2026-12-10", 3)).toBe(false);
  });
  it("finds season overlaps across years", () => {
    expect(overlapsSeason("2027-05-20", "2027-05-26", "04-30", "09-30")).toBe(true);
    expect(overlapsSeason("2026-10-01", "2027-04-29", "04-30", "09-30")).toBe(false);
    expect(overlapsSeason("2026-10-01", "2027-04-30", "04-30", "09-30")).toBe(true);
  });
});

describe("decision aggregation", () => {
  const hit = (decision: RuleHit["decision"]): RuleHit => ({ rule_id: "X", step: 1, fired: true, action: "REVIEW_REQUIRED", decision, inputs: {}, explanation: "" });
  it("takes the most restrictive decision", () => {
    expect(mostRestrictive([])).toBe("ALLOW");
    expect(mostRestrictive(["ALLOW_WITH_CONDITIONS", "REVIEW_REQUIRED", "COORDINATION_REQUIRED"])).toBe("COORDINATION_REQUIRED");
    expect(mostRestrictive(["COORDINATION_REQUIRED", "RESCHEDULE"])).toBe("RESCHEDULE");
    expect(mostRestrictive(["RESCHEDULE", "BLOCK", "ALLOW"])).toBe("BLOCK");
  });
  it("turns plain allows into an emergency exception only for valid emergencies", () => {
    expect(aggregateDecision([hit("ALLOW_WITH_CONDITIONS")], true)).toBe("EMERGENCY_EXCEPTION");
    expect(aggregateDecision([hit("ALLOW_WITH_CONDITIONS")], false)).toBe("ALLOW_WITH_CONDITIONS");
    expect(aggregateDecision([hit("BLOCK")], true)).toBe("BLOCK");
  });
});

describe("step 1: jurisdiction", () => {
  it("stops when the trench is beyond the snap tolerance", () => {
    expect(run(make({ snap_offset_m: 31 })).steps[0].status).toBe("stop");
    expect(run(make({ snap_offset_m: 30 })).steps[0].status).toBe("pass");
  });
});

describe("step 2: hard policy", () => {
  it("blocks routine work in the monsoon window but not an emergency fault", () => {
    const dates = { proposed_start: "2027-06-01", proposed_end: "2027-06-03" };
    expect(run(make(dates)).decision).toBe("BLOCK");
    expect(run(make({ ...dates, work_type: "emergency_fault", trench_length_m: 4, trench_width_m: 0.8 })).decision).toBe("EMERGENCY_EXCEPTION");
  });
  it("blocks an oversize, unsanctioned fault repair in the restricted season and escalates", () => {
    const fault = make({ proposed_start: "2027-06-01", proposed_end: "2027-06-03", work_type: "emergency_fault", trench_length_m: 12 });
    const r = run(fault);
    expect(r.ruleIds).toEqual(["PMC_FAULT_MONSOON_5X1"]);
    expect(r.decision).toBe("BLOCK");
    expect(r.escalations).toHaveLength(1);
    expect(run({ ...fault, fault_sanctioned: true }).decision).toBe("EMERGENCY_EXCEPTION");
  });
  it("adds a staging condition above 100 m and a review flag outside the annual programme", () => {
    expect(run(make({ trench_length_m: 100 })).ruleIds).toEqual([]);
    expect(run(make({ trench_length_m: 100.5 })).decision).toBe("ALLOW_WITH_CONDITIONS");
    expect(run(make({ in_annual_programme: false })).decision).toBe("REVIEW_REQUIRED");
  });
});

describe("step 3: road protection", () => {
  it("fires the 12-month rules only inside the window and only when the ranges overlap", () => {
    expect(run(make(), { restorations: [restoration()] }).ruleIds).toEqual(["CORRIDOR_RESTORED_12M", "PMC_CC_DLP_PRIOR_APPROVAL", "PMC_DLP_12M"]);
    expect(run(make(), { restorations: [restoration({ completed_on: "2025-11-09" })] }).ruleIds).toEqual([]);
    expect(run(make(), { restorations: [restoration({ chainage_start_m: 1050, chainage_end_m: 1100 })] }).ruleIds).toEqual([]);
  });
  it("needs prior approval on concrete even after the defect-liability period", () => {
    expect(run(make(), { restorations: [restoration({ completed_on: "2025-01-01", surface: "cement_concrete" })] }).ruleIds).toEqual(["PMC_CC_DLP_PRIOR_APPROVAL"]);
  });
  it("applies the moratorium to protected stretches for 36 months and escalates without a case", () => {
    const r = run(make(), { restorations: [restoration({ completed_on: "2024-06-01", protected: true })] });
    expect(r.ruleIds).toEqual(["CORRIDOR_CRITICAL_MORATORIUM"]);
    expect(r.decision).toBe("REVIEW_REQUIRED");
    expect(r.escalations).toHaveLength(1);
    expect(r.coordination).toBeUndefined();
    expect(run(make(), { restorations: [restoration({ completed_on: "2023-11-09", protected: true })] }).ruleIds).toEqual([]);
  });
});

describe("step 4: spatial classification", () => {
  const at = (start: number, end: number, side: PermitInput["road_side"] = "left") => counterpart(run(make(), { permits: [other({ chainage_start_m: start, chainage_end_m: end, road_side: side })] }), "OTHER").spatial;
  it("separates direct overlap from same segment by road side", () => {
    expect(at(1020, 1080, "left")).toBe("DIRECT_OVERLAP");
    expect(at(1020, 1080, "right")).toBe("SAME_SEGMENT");
    expect(at(1020, 1080, "center")).toBe("DIRECT_OVERLAP");
    expect(at(1020, 1080, "full-width")).toBe("DIRECT_OVERLAP");
  });
  it("uses the gap thresholds: 5 m tolerance, 50 m adjacent, 200 m nearby", () => {
    expect(at(1055, 1100)).toBe("DIRECT_OVERLAP");
    expect(at(1056, 1100)).toBe("ADJACENT_SEGMENT");
    expect(at(1100, 1150)).toBe("ADJACENT_SEGMENT");
    expect(at(1101, 1150)).toBe("NEARBY");
    expect(at(1250, 1300)).toBe("NEARBY");
    expect(run(make(), { permits: [other({ chainage_start_m: 1251, chainage_end_m: 1300 })] }).counterparts).toEqual([]);
  });
});

describe("steps 5 and 6: temporal gap and repeated opening", () => {
  const overlapping = { chainage_start_m: 1010, chainage_end_m: 1060 };
  it("classifies cross-utility repeats, common-trench candidates and no risk by the gap in months", () => {
    const withEnd = (start: string, end: string) => run(make(), { permits: [other({ ...overlapping, proposed_start: start, proposed_end: end })] });
    expect(counterpart(withEnd("2026-08-01", "2026-08-10"), "OTHER").repeat).toBe("REPEAT_CROSS_UTILITY");
    const common = withEnd("2026-06-01", "2026-06-10");
    expect(counterpart(common, "OTHER").repeat).toBe("COMMON_TRENCH_CANDIDATE");
    expect(common.ruleIds).toContain("XPMS_COMMON_TRENCH_3_6M");
    expect(common.coordination).toBeDefined();
    expect(withEnd("2026-03-01", "2026-03-10").coordination).toBeUndefined();
  });
  it("lets completed works trigger only through repeat rules, never through the window alone", () => {
    const adjacentDone = run(make(), { permits: [other({ chainage_start_m: 1070, chainage_end_m: 1100, status: "completed", proposed_start: "2026-10-01", proposed_end: "2026-10-05" })] });
    expect(adjacentDone.coordination).toBeUndefined();
    const adjacentPlanned = run(make(), { permits: [other({ chainage_start_m: 1070, chainage_end_m: 1100, proposed_start: "2026-12-01", proposed_end: "2026-12-05" })] });
    expect(adjacentPlanned.ruleIds).toContain("CORRIDOR_SAME_SEGMENT_MULTIWORK");
  });
  it("does not open a case for adjacent works more than 90 days apart", () => {
    expect(run(make(), { permits: [other({ chainage_start_m: 1070, chainage_end_m: 1100, proposed_start: "2027-02-19", proposed_end: "2027-02-25" })] }).coordination).toBeUndefined();
    expect(run(make(), { permits: [other({ chainage_start_m: 1070, chainage_end_m: 1100, proposed_start: "2027-02-18", proposed_end: "2027-02-25" })] }).coordination).toBeDefined();
  });
});

describe("step 7: execution feasibility", () => {
  const overlapping = { chainage_start_m: 1010, chainage_end_m: 1060 };
  const feas = (o: Partial<PermitInput>, mine: Partial<PermitInput> = {}) => counterpart(run(make(mine), { permits: [other({ ...overlapping, ...o })] }), "OTHER");
  it("is feasible on the same side at similar depth", () => {
    expect(feas({ trench_depth_m: 1.2 }).feasibility).toBe("PHYSICALLY_FEASIBLE");
    expect(feas({ trench_depth_m: 1.2 }).joint_candidate).toBe(true);
  });
  it("asks for engineering review on opposite sides, on a depth gap over 0.6 m, and for gas with electricity", () => {
    expect(feas({ road_side: "right" }).feasibility).toBe("ENGINEERING_REVIEW");
    expect(feas({ trench_depth_m: 1.3 }).feasibility).toBe("ENGINEERING_REVIEW");
    expect(feas({ department: "MSEDCL (electricity)" }, { department: "Maharashtra Natural Gas Ltd" }).feasibility).toBe("ENGINEERING_REVIEW");
  });
  it("never offers a joint trench with Metro works or an infrastructure zone", () => {
    expect(feas({ department: "Pune Metro Rail" }).feasibility).toBe("NOT_FEASIBLE");
    const r = run(make(), { infraZones: [zone()] });
    expect(counterpart(r, "ZX").feasibility).toBe("NOT_FEASIBLE");
    expect(r.coordination!.infra_zone_ids).toEqual(["ZX"]);
    expect(strategy(r, "JOINT_EXECUTION").feasible).toBe(false);
  });
});

describe("step 8: criticality", () => {
  const fac = (type: string, distance_m: number, id = type + distance_m) => ({ id, name: id, type, distance_m });
  it("maps facility types to flags inside the buffer only", () => {
    const r = run(make(), { facilities: [fac("hospital", 150), fac("school", 201), fac("place_of_worship", 20)], busRoutes: [{ id: "b", route_name: "A to B", distance_m: 0 }] });
    expect(r.flags).toEqual(["hospital_access", "bus_corridor", "religious_site"]);
  });
  it("needs five commercial premises for the commercial flag", () => {
    const shops = (n: number) => Array.from({ length: n }, (_, i) => fac("commercial", 10 + i, `shop${i}`));
    expect(run(make(), { facilities: shops(4) }).flags).toEqual([]);
    expect(run(make(), { facilities: shops(5) }).flags).toEqual(["commercial"]);
  });
  it("flags context-only infrastructure without opening a case", () => {
    const r = run(make(), { infraZones: [zone({ status: "planned", start_date: null, end_date: null, context_only: true })] });
    expect(r.flags).toEqual(["major_infrastructure"]);
    expect(r.coordination).toBeUndefined();
    expect(r.decision).toBe("ALLOW");
  });
  it("fires the criticality gate only when there is also a coordination opportunity", () => {
    const facilities = [fac("hospital", 50)];
    expect(run(make(), { facilities }).ruleIds).toEqual([]);
    expect(run(make(), { facilities, permits: [other({ chainage_start_m: 1010, chainage_end_m: 1060 })] }).ruleIds).toContain("CORRIDOR_FACILITY_CRITICALITY_GATE");
  });
});

describe("steps 9 and 10: strategies and ratings", () => {
  it("recommends deferring when a concurrent adjacent work cannot share the trench", () => {
    const r = run(make(), { permits: [other({ chainage_start_m: 1070, chainage_end_m: 1100, proposed_start: "2026-11-01", proposed_end: "2026-11-25" })] });
    expect(r.coordination!.recommended_strategy).toBe("DEFER_NEW_PERMIT");
    expect(strategy(r, "DEFER_NEW_PERMIT").schedule_shift_days).toBe(15 + 7); // 10 Nov → 25 Nov, plus the 7-day buffer
  });
  it("recommends resequencing around a later, unstarted repeat opening that cannot be joined", () => {
    const r = run(make(), { permits: [other({ chainage_start_m: 1010, chainage_end_m: 1060, department: "Pune Metro Rail", proposed_start: "2026-12-01", proposed_end: "2026-12-10" })] });
    expect(r.coordination!.recommended_strategy).toBe("RESEQUENCE_WORKS");
  });
  it("recommends separate execution when adjacent works are already sequential", () => {
    const r = run(make(), { permits: [other({ chainage_start_m: 1070, chainage_end_m: 1100, proposed_start: "2026-10-20", proposed_end: "2026-11-01" })] });
    expect(r.coordination!.recommended_strategy).toBe("SEPARATE_EXECUTION");
  });
  const rate = (o: Partial<RatingInputs>) => rateStrategy({ strategy: "JOINT_EXECUTION", schedule_shift_days: 0, schedule_cost_days: [14, 42], flag_count: 0, active_counterparts: 1, departments: 2, joint_feasibility: "PHYSICALLY_FEASIBLE", hard_rule: false, ...o });
  it("rates schedule cost by the day thresholds", () => {
    expect([0, 14, 15, 42, 43].map((d) => rate({ schedule_shift_days: d }).schedule_cost)).toEqual(["NONE", "LOW", "MODERATE", "MODERATE", "HIGH"]);
  });
  it("rates exposure by flags and the number of separate disturbance windows", () => {
    expect(rate({ flag_count: 0 }).critical_facility_exposure).toBe("LOW");
    expect(rate({ flag_count: 1 }).critical_facility_exposure).toBe("LOW");
    expect(rate({ flag_count: 2 }).critical_facility_exposure).toBe("MODERATE");
    expect(rate({ flag_count: 2, strategy: "SEPARATE_EXECUTION" }).critical_facility_exposure).toBe("HIGH");
    expect(rate({ flag_count: 2, strategy: "SEPARATE_EXECUTION", active_counterparts: 0 }).critical_facility_exposure).toBe("MODERATE");
  });
  it("rates complexity by departments, and separate execution as low", () => {
    expect([1, 2, 3].map((d) => rate({ departments: d }).coordination_complexity)).toEqual(["LOW", "MODERATE", "HIGH"]);
    expect(rate({ departments: 3, strategy: "SEPARATE_EXECUTION" }).coordination_complexity).toBe("LOW");
  });
  it("rates repeat excavation avoided and engineering feasibility", () => {
    expect((["JOINT_EXECUTION", "DEFER_NEW_PERMIT", "RESEQUENCE_WORKS", "SEPARATE_EXECUTION", "BLOCK_OR_ESCALATE"] as const).map((s) => rate({ strategy: s }).repeat_excavation_avoided)).toEqual(["HIGH", "MODERATE", "MODERATE", "NONE", "NONE"]);
    expect(rate({ joint_feasibility: "ENGINEERING_REVIEW" }).engineering_feasibility).toBe("REVIEW");
    expect(rate({ joint_feasibility: null }).engineering_feasibility).toBe("NOT_FEASIBLE");
    expect(rate({ strategy: "DEFER_NEW_PERMIT", hard_rule: true }).engineering_feasibility).toBe("REVIEW");
  });
});

describe("a disabled rule never fires", () => {
  it("skips the monsoon block when the rule is switched off", () => {
    expect(run(make({ proposed_start: "2027-06-01", proposed_end: "2027-06-03" }), {}, { PMC_MONSOON_5M: { enabled: false } }).decision).toBe("ALLOW");
  });
});
