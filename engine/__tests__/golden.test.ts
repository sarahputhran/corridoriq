// Golden scenario tests, run on the real processed data with DEMO_TODAY = 2026-10-15.
// Each permit is evaluated against the corridor as it stood when that permit was filed, as the seed does.
import { describe, expect, it } from "vitest";
import { evaluatePermit } from "../pipeline";
import { TODAY, city, counterpart, data, evaluate, permit, pid, stateWhenFiled, strategy } from "./helpers";

describe("H: hospital (hero): 0024 filed after 0023, beside Karva Hospital", () => {
  const r = evaluate("0024");
  const other = counterpart(r, "0023");

  it("opens a coordination case and blocks auto-approval", () => {
    expect(r.coordination).toBeDefined();
    expect(r.coordination!.permit_ids).toEqual([pid("0023"), pid("0024")]);
    expect(r.outcome_status).toBe("coordination_required");
    expect(r.gate.auto_approvable).toBe(false);
    expect(r.requires_planner).toBe(true);
    expect(r.noticeDraft).toBeUndefined();
  });
  it("classifies the pair: same segment, cross-utility repeat, engineering review", () => {
    expect(other.spatial).toBe("SAME_SEGMENT");
    expect(other.repeat).toBe("REPEAT_CROSS_UTILITY");
    expect(other.feasibility).toBe("ENGINEERING_REVIEW");
    expect(r.coordination!.spatial_classification).toBe("SAME_SEGMENT");
    expect(r.coordination!.repeat_opening_classification).toBe("REPEAT_CROSS_UTILITY");
    expect(r.coordination!.execution_feasibility).toBe("ENGINEERING_REVIEW");
  });
  it("flags hospital access and the bus corridor (no school is inside the buffer)", () => {
    expect(r.flags).toContain("hospital_access");
    expect(r.flags).toContain("bus_corridor");
    expect(r.flags).not.toContain("school_route");
    const hospital = stateWhenFiled("0024").facilities.find((f) => f.name === "Karva Hospital");
    expect(hospital!.distance_m).toBeLessThanOrEqual(200);
  });
  it("fires the expected rules", () => {
    expect(r.ruleIds).toEqual(
      expect.arrayContaining(["CORRIDOR_SAME_SEGMENT_MULTIWORK", "XPMS_REPEAT_OTHER_3M", "CORRIDOR_FACILITY_CRITICALITY_GATE", "CORRIDOR_EXECUTION_FEASIBILITY"]),
    );
    expect(r.coordination!.rule_ids).toEqual(r.ruleIds);
  });
  it("recommends joint execution with the engineering sign-off condition", () => {
    expect(r.coordination!.recommended_strategy).toBe("JOINT_EXECUTION");
    const joint = strategy(r, "JOINT_EXECUTION");
    expect(joint.recommended).toBe(true);
    expect(joint.feasible).toBe(true);
    expect(joint.conditions).toContain("Engineering sign-off before joint trench.");
    expect(joint.schedule_shift_days).toBe(17); // 0023 starts 26 Oct, 0024 starts 12 Nov
    expect(joint.ratings).toEqual({
      repeat_excavation_avoided: "HIGH",
      schedule_cost: "MODERATE",
      critical_facility_exposure: "MODERATE",
      coordination_complexity: "MODERATE",
      engineering_feasibility: "REVIEW",
    });
    expect(r.strategies!.filter((s) => s.recommended)).toHaveLength(1);
    expect(r.strategies!.map((s) => s.strategy)).toEqual(["JOINT_EXECUTION", "DEFER_NEW_PERMIT", "RESEQUENCE_WORKS", "SEPARATE_EXECUTION", "BLOCK_OR_ESCALATE"]);
  });
  it("asks the counterpart department to respond", () => {
    expect(r.coordination!.department_tasks).toEqual([{ department: "PMC Water Supply", permit_id: pid("0023") }]);
  });
  it("0023 itself, filed first with nothing nearby, was approvable with a staging condition", () => {
    const first = evaluate("0023");
    expect(first.coordination).toBeUndefined();
    expect(first.decision).toBe("ALLOW_WITH_CONDITIONS");
    expect(first.outcome_status).toBe("approved_with_conditions");
    expect(first.noticeDraft).toBeDefined();
  });
});

describe("M: metro: 0012, 0013, 0014 on the stretch with the Metro zone and permit 0020", () => {
  it("0012 opens a case against the active Metro zone, flagged major infrastructure", () => {
    const r = evaluate("0012");
    expect(r.coordination!.infra_zone_ids).toEqual(["METRO-L4-INTERFACE"]);
    expect(r.flags).toContain("major_infrastructure");
    expect(counterpart(r, "METRO-L4-INTERFACE").feasibility).toBe("NOT_FEASIBLE");
    expect(r.coordination!.recommended_strategy).toBe("SEPARATE_EXECUTION");
    expect(strategy(r, "JOINT_EXECUTION").feasible).toBe(false);
  });
  it("0014 is a three-department multiwork; permit 0020 (Metro) cannot share a trench", () => {
    const r = evaluate("0014");
    expect(r.coordination!.permit_ids).toEqual([pid("0012"), pid("0013"), pid("0014"), pid("0020")]);
    expect(r.ruleIds).toContain("CORRIDOR_SAME_SEGMENT_MULTIWORK");
    expect(counterpart(r, "0020").feasibility).toBe("NOT_FEASIBLE");
    expect(counterpart(r, "0020").joint_candidate).toBe(false);
    expect(counterpart(r, "0012").joint_candidate).toBe(true);
    expect(counterpart(r, "0013").joint_candidate).toBe(true);
    expect(strategy(r, "JOINT_EXECUTION").ratings.coordination_complexity).toBe("HIGH");
    expect(r.flags).toContain("major_infrastructure");
  });
  it("0013 pairs MSEDCL and Jio under the MoHUA coordination rule", () => {
    expect(evaluate("0013").ruleIds).toContain("MOHUA_UTILITY_COORDINATION");
  });
});

describe("O: override: 0011 (gas) after 0010 (water, approved), same spot", () => {
  const r = evaluate("0011");
  it("opens a case that recommends joint execution, leaving separate execution available to the planner", () => {
    expect(r.coordination!.permit_ids).toEqual([pid("0010"), pid("0011")]);
    expect(counterpart(r, "0010").spatial).toBe("DIRECT_OVERLAP");
    expect(r.coordination!.recommended_strategy).toBe("JOINT_EXECUTION");
    expect(strategy(r, "SEPARATE_EXECUTION").feasible).toBe(true);
    expect(strategy(r, "SEPARATE_EXECUTION").ratings.repeat_excavation_avoided).toBe("NONE");
  });
});

describe("R: repeat same utility: 0008 (Airtel) beside 0022 (Airtel repair, completed in September)", () => {
  const r = evaluate("0008");
  it("fires XPMS_REPEAT_SAME_6M and reschedules", () => {
    expect(r.ruleIds).toContain("XPMS_REPEAT_SAME_6M");
    expect(counterpart(r, "0022").repeat).toBe("REPEAT_SAME_UTILITY");
    expect(r.decision).toBe("RESCHEDULE");
  });
  it("treats the completed work as history, and joins 0007 as multiwork", () => {
    expect(counterpart(r, "0022").history).toBe(true);
    expect(counterpart(r, "0022").joint_candidate).toBe(false);
    expect(r.coordination!.permit_ids).toEqual([pid("0007"), pid("0008"), pid("0022")]);
    expect(r.ruleIds).toContain("CORRIDOR_SAME_SEGMENT_MULTIWORK");
    expect(r.coordination!.department_tasks.map((t) => t.permit_id)).toEqual([pid("0007")]);
  });
  it("0009 then lands on the same stretch as 0007 and 0008", () => {
    expect(evaluate("0009").coordination!.permit_ids).toEqual([pid("0007"), pid("0008"), pid("0009")]);
  });
});

describe("P: protected road: 0006 on the concrete stretch R2 with 0004 and 0005 approved", () => {
  const r = evaluate("0006");
  it("fires the moratorium, prior-approval and annual-programme rules", () => {
    expect(r.ruleIds).toEqual(expect.arrayContaining(["CORRIDOR_CRITICAL_MORATORIUM", "PMC_CC_DLP_PRIOR_APPROVAL", "PMC_ANNUAL_PROGRAMME"]));
    expect(r.ruleIds).not.toContain("PMC_DLP_12M"); // R2 was reconstructed more than 12 months before the start
    const hit = r.ruleHits.find((h) => h.rule_id === "CORRIDOR_CRITICAL_MORATORIUM")!;
    expect(hit.decision).toBe("REVIEW_REQUIRED");
    expect(hit.restoration_id).toBe("R2");
  });
  it("raises an escalation and recommends block or escalate", () => {
    expect(r.escalations.map((e) => e.rule_id)).toEqual(["CORRIDOR_CRITICAL_MORATORIUM"]);
    expect(r.coordination!.permit_ids).toEqual([pid("0004"), pid("0005"), pid("0006")]);
    expect(r.coordination!.recommended_strategy).toBe("BLOCK_OR_ESCALATE");
    expect(r.gate.auto_approvable).toBe(false);
  });
});

describe("D: restored stretch: 0001, 0002, 0003 over R1 (restored 2026-08-28)", () => {
  it("0001 trips the restoration rules and the 100 m staging rule", () => {
    const r = evaluate("0001");
    expect(r.ruleIds).toEqual(expect.arrayContaining(["CORRIDOR_RESTORED_12M", "PMC_DLP_12M", "PMC_100M_STAGING"]));
    expect(permit("0001").trench_length_m).toBeGreaterThan(200);
    expect(r.conditions.some((c) => c.startsWith("Stage the works"))).toBe(true);
    expect(r.decision).toBe("REVIEW_REQUIRED");
    expect(r.coordination).toBeUndefined(); // nothing else was filed yet
  });
  it("0002 and 0003 trip the restoration rules too", () => {
    for (const id of ["0002", "0003"]) expect(evaluate(id).ruleIds).toEqual(expect.arrayContaining(["CORRIDOR_RESTORED_12M", "PMC_DLP_12M"]));
  });
  it("0003 completes a multiwork case of the three", () => {
    const r = evaluate("0003");
    expect(r.coordination!.permit_ids).toEqual([pid("0001"), pid("0002"), pid("0003")]);
    expect(r.ruleIds).toContain("CORRIDOR_SAME_SEGMENT_MULTIWORK");
    expect(r.coordination!.recommended_strategy).toBe("JOINT_EXECUTION");
  });
});

describe("B: monsoon block: 0019 (gas, routine, May 2027)", () => {
  const r = evaluate("0019");
  it("is blocked by PMC_MONSOON_5M with no case", () => {
    expect(r.ruleIds).toEqual(["PMC_MONSOON_5M"]);
    expect(r.decision).toBe("BLOCK");
    expect(r.outcome_status).toBe("blocked");
    expect(r.coordination).toBeUndefined();
    expect(r.steps.filter((s) => s.step >= 3 && s.step <= 10).every((s) => s.status === "skipped")).toBe(true);
  });
});

describe("E: emergency: 0018 (water leak repair)", () => {
  const r = evaluate("0018");
  it("takes the emergency pathway with the 48-hour condition and no case", () => {
    expect(r.ruleIds).toEqual(["PMC_FAULT_48H"]);
    expect(r.ruleHits[0].decision).toBe("ALLOW_WITH_CONDITIONS");
    expect(r.decision).toBe("EMERGENCY_EXCEPTION");
    expect(r.conditions[0]).toContain("48 hours");
    expect(r.coordination).toBeUndefined();
    expect(r.outcome_status).toBe("approved_with_conditions");
  });
});

describe("I: isolated: 0017 (MSEDCL, January 2027)", () => {
  const r = evaluate("0017");
  it("is allowed, auto-approved and gets a notice draft", () => {
    expect(r.ruleIds).toEqual([]);
    expect(r.decision).toBe("ALLOW");
    expect(r.outcome_status).toBe("auto_approved");
    expect(r.gate.auto_approvable).toBe(true);
    expect(r.noticeDraft).toMatchObject({ permit_ids: [pid("0017")], starts_on: "2027-01-11", ends_on: "2027-01-18" });
  });
});

describe("J: jurisdiction: a permit 1 km off the corridor", () => {
  const off = { ...permit("0017"), permit_id: "TEST/OFF-CORRIDOR", corridor_id: null, snap_offset_m: 1000 };
  const r = evaluatePermit({ permit: off, corridor: stateWhenFiled("0017"), city: city(), today: TODAY });
  it("goes to review as outside managed corridors and stops", () => {
    expect(r.decision).toBe("REVIEW_REQUIRED");
    expect(r.steps[0]).toMatchObject({ step: 1, status: "stop" });
    expect(r.steps[0].summary).toMatch(/outside managed corridors/i);
    expect(r.steps.slice(1, 10).every((s) => s.status === "skipped")).toBe(true);
    expect(r.ruleHits).toEqual([]);
    expect(r.outcome_status).toBe("review_required");
  });
});

describe("Determinism", () => {
  it("gives identical output when any permit is evaluated twice", () => {
    for (const p of data.permits) {
      const id = p.permit_id.slice(-4);
      expect(evaluate(id)).toEqual(evaluate(id));
    }
  });
  it("does not depend on the order of the input lists", () => {
    const state = stateWhenFiled("0014");
    const shuffled = { ...state, permits: [...state.permits].reverse(), infraZones: [...state.infraZones].reverse(), restorations: [...state.restorations].reverse() };
    const a = evaluatePermit({ permit: permit("0014"), corridor: state, city: city(), today: TODAY });
    const b = evaluatePermit({ permit: permit("0014"), corridor: shuffled, city: city(), today: TODAY });
    expect(b).toEqual(a);
  });
  it("always returns all 12 steps in order", () => {
    for (const p of data.permits) expect(evaluate(p.permit_id.slice(-4)).steps.map((s) => s.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe("Rules are data: editing params changes outcomes", () => {
  it("window_days = 0 stops the multiwork rule firing for the hero case", () => {
    const r = evaluate("0024", { CORRIDOR_SAME_SEGMENT_MULTIWORK: { params: { window_days: 0 } } });
    expect(r.ruleIds).not.toContain("CORRIDOR_SAME_SEGMENT_MULTIWORK");
    expect(r.ruleIds).toContain("XPMS_REPEAT_OTHER_3M"); // the repeat-opening rule still holds the case open
  });
  it("with the window at 0 and the cross-utility repeat rule off, the hero case disappears", () => {
    const r = evaluate("0024", { CORRIDOR_SAME_SEGMENT_MULTIWORK: { params: { window_days: 0 } }, XPMS_REPEAT_OTHER_3M: { enabled: false } });
    expect(r.coordination).toBeUndefined();
    expect(r.outcome_status).toBe("approved_with_conditions");
  });
  it("shrinking adjacent_m below the 25 m gap removes the 0021 case", () => {
    expect(evaluate("0021").coordination).toBeDefined();
    expect(evaluate("0021", { CORRIDOR_SAME_SEGMENT_MULTIWORK: { params: { adjacent_m: 20 } } }).coordination).toBeUndefined();
  });
  it("a smaller facility buffer drops the hospital flag from the hero case", () => {
    expect(evaluate("0024", { CORRIDOR_FACILITY_CRITICALITY_GATE: { params: { buffer_m: 50 } } }).flags).not.toContain("hospital_access");
  });
  it("moving the monsoon window unblocks 0019", () => {
    expect(evaluate("0019", { PMC_MONSOON_5M: { params: { start_mmdd: "06-15" } } }).decision).not.toBe("BLOCK");
  });
  it("rejects malformed params instead of guessing", () => {
    expect(() => evaluate("0024", { PMC_MONSOON_5M: { params: { start_mmdd: "April" } } })).toThrow(/PMC_MONSOON_5M/);
  });
});
