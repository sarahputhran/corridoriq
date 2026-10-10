// AI layer tests: the validator accepts grounded text and rejects percentages, uncited
// sentences and invented numbers; the template always validates; the adapter falls back in order.
import { describe, expect, it } from "vitest";
import { explain, normalise } from "../adapter";
import { buildFactSheet, factIndex, type FactSheetInput } from "../factsheet";
import { templateExplanation } from "../providers/template";
import { validateExplanation } from "../validator";

const hero: FactSheetInput = {
  case_ref: "CC-2026-005",
  road_name: "Sinhagad Road",
  chainage_start_m: 3256.9,
  chainage_end_m: 3454.1,
  buffer_m: 200,
  permits: [
    { permit_id: "PMC/RC/2026/0023", department: "PMC Water Supply", purpose: "200mm water distribution main replacement near Karva Hospital", proposed_start: "2026-10-26", proposed_end: "2026-11-26", road_side: "left", chainage_start_m: 3256.9, chainage_end_m: 3454.1, status: "approved_with_conditions", is_trigger: false },
    { permit_id: "PMC/RC/2026/0024", department: "Jio Fiber", purpose: "OFC duct laying for FTTH near Karva Hospital", proposed_start: "2026-11-12", proposed_end: "2026-11-23", road_side: "right", chainage_start_m: 3302, chainage_end_m: 3421, status: "coordination_required", is_trigger: true },
  ],
  facilities: [
    { name: "Uttam wines", type: "commercial", distance_m: 33 },
    { name: "Karva Hospital", type: "hospital", distance_m: 89 },
    { name: "Maruti mandir", type: "place_of_worship", distance_m: 174 },
    { name: null, type: "hospital", distance_m: 120 },
  ],
  busRouteNames: ["Swargate Natraj Stand to Suncity (DOWN)", "Suncity to Swargate Natraj Stand (UP)", "Sinhgad to Shaniwarwada Stand (UP)"],
  infraZones: [],
  rules: [
    { rule_id: "CORRIDOR_EXECUTION_FEASIBILITY", trigger_text: "spatially overlapping permits proposed for joint execution", action: "ENGINEERING_REVIEW" },
    { rule_id: "CORRIDOR_SAME_SEGMENT_MULTIWORK", trigger_text: "2+ permits overlap spatially on same corridor segment", action: "COORDINATION_REQUIRED" },
    { rule_id: "XPMS_REPEAT_OTHER_3M", trigger_text: "other proponent excavated same location within previous 3 months OR plans work within 3 months", action: "RESCHEDULE_OR_COMMON_TRENCH" },
  ],
  strategies: [
    { strategy: "JOINT_EXECUTION", recommended: true, feasible: true, schedule_shift_days: 17, ratings: { schedule_cost: "MODERATE" }, conditions: ["Engineering sign-off before joint trench."] },
    { strategy: "DEFER_NEW_PERMIT", recommended: false, feasible: true, schedule_shift_days: 21, ratings: { schedule_cost: "MODERATE" }, conditions: [] },
    { strategy: "SEPARATE_EXECUTION", recommended: false, feasible: true, schedule_shift_days: 0, ratings: { schedule_cost: "NONE" }, conditions: [] },
  ],
};
const sheet = buildFactSheet(hero);
const GOOD =
  "This stretch is within 200 m of Karva Hospital [F1] and carries the PMPML route Sinhgad to Shaniwarwada Stand [B1]. " +
  "Doing the water main replacement and the fibre duct laying separately opens the same stretch twice [P0023] [P0024] [R:XPMS_REPEAT_OTHER_3M]. " +
  "The system recommends joint execution, which moves the Jio Fiber start by 2 weeks and needs engineering sign-off [S1].";

describe("fact sheet", () => {
  it("gives every fact a citable ID and keeps only named, relevant facilities", () => {
    expect(sheet.permits.map((p) => p.id)).toEqual(["P0023", "P0024"]);
    expect(sheet.facilities).toEqual([
      { id: "F1", name: "Karva Hospital", type: "hospital", distance_m: 89 },
      { id: "F2", name: "Maruti mandir", type: "place of worship", distance_m: 174 },
    ]);
    expect(sheet.bus_routes.map((b) => b.route_name)).toEqual(["Sinhgad to Shaniwarwada Stand", "Suncity to Swargate Natraj Stand", "Swargate Natraj Stand to Suncity"]);
    expect(sheet.rules.map((r) => r.id)).toContain("R:XPMS_REPEAT_OTHER_3M");
    expect(sheet.most_important_rule_ids).toEqual(["R:XPMS_REPEAT_OTHER_3M", "R:CORRIDOR_SAME_SEGMENT_MULTIWORK"]);
    expect(sheet.recommended_strategy_id).toBe("S1");
    expect(sheet.strategies[0].schedule_shift_weeks).toBe(2);
    expect([...factIndex(sheet).keys()]).toEqual(expect.arrayContaining(["P0023", "F1", "B1", "R:XPMS_REPEAT_OTHER_3M", "S1"]));
  });
});

describe("validator", () => {
  it("accepts a grounded, fully cited explanation", () => {
    const r = validateExplanation(GOOD, sheet);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.citations).toEqual(["F1", "B1", "P0023", "P0024", "R:XPMS_REPEAT_OTHER_3M", "S1"]);
  });
  it("rejects a percentage", () => {
    expect(validateExplanation(GOOD.replace("opens the same stretch twice", "raises disruption by 40% on the stretch"), sheet).ok).toBe(false);
    expect(validateExplanation(GOOD.replace("twice", "twice, a 40 percent rise"), sheet).errors.join()).toMatch(/percent/);
  });
  it("rejects a sentence without a citation", () => {
    const r = validateExplanation(GOOD.replace(" [S1].", ". Residents will thank you."), sheet);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/no citation/);
  });
  it("rejects an invented number", () => {
    expect(validateExplanation(GOOD.replace("by 2 weeks", "by 5 weeks"), sheet).errors).toContain("number 5 is not in the fact sheet");
    expect(validateExplanation(GOOD.replace("Karva Hospital [F1]", "Karva Hospital, which has 300 beds [F1]"), sheet).ok).toBe(false);
  });
  it("allows numbers from the sheet, including weeks derived from the shift in days", () => {
    expect(validateExplanation(GOOD.replace("by 2 weeks", "by 17 days"), sheet).ok).toBe(true);
    expect(validateExplanation(GOOD.replace("by 2 weeks", "by 3 weeks"), sheet).ok).toBe(true); // 17 days rounds up to 3
  });
  it("checks numbers written as words", () => {
    expect(validateExplanation(GOOD.replace("by 2 weeks", "by seventeen days"), sheet).ok).toBe(true);
    expect(validateExplanation(GOOD.replace("by 2 weeks", "by nine weeks"), sheet).errors).toContain("number nine is not in the fact sheet");
  });
  it("rejects a citation that is not in the fact sheet", () => {
    expect(validateExplanation(GOOD.replace("[F1]", "[F9]"), sheet).errors.join()).toMatch(/unknown fact \[F9\]/);
  });
  it("rejects forecasting language", () => {
    for (const phrase of ["is likely to cause delays", "is expected to affect buses", "we predict congestion", "approximately a month", "many vehicles"]) {
      expect(validateExplanation(GOOD.replace("opens the same stretch twice", phrase), sheet).ok, phrase).toBe(false);
    }
  });
  it("rejects too few or too many sentences, and rambling", () => {
    expect(validateExplanation("Joint execution is recommended [S1].", sheet).ok).toBe(false);
    expect(validateExplanation(Array(7).fill("Joint execution is recommended [S1].").join(" "), sheet).ok).toBe(false);
    expect(validateExplanation(GOOD.replace("opens the same stretch twice", `opens the same stretch twice ${"and again ".repeat(80)}`), sheet).errors.join()).toMatch(/longer than/);
  });
  it("rejects fact IDs written into the prose", () => {
    expect(validateExplanation(GOOD.replace("opens the same stretch twice", "trips XPMS_REPEAT_OTHER_3M"), sheet).errors.join()).toMatch(/fact ID/);
    expect(validateExplanation(GOOD.replace("the water main replacement", "permit P0023"), sheet).ok).toBe(false);
  });
  it("is not confused by digits and full stops inside real names", () => {
    const text = "The 200mm water distribution main replacement near Karva Hospital overlaps the OFC duct laying for FTTH near Karva Hospital [P0023] [P0024]. Joint execution is recommended [S1].";
    expect(validateExplanation(text, sheet).errors).toEqual([]);
  });
});

describe("template", () => {
  it("always passes its own validation and names the recommendation", () => {
    const text = templateExplanation(sheet);
    expect(validateExplanation(text, sheet).errors).toEqual([]);
    expect(text).toContain("Karva Hospital");
    expect(text).toContain("recommends joint execution");
    expect(text).toContain("2 weeks");
  });
  it("is deterministic", () => {
    expect(templateExplanation(sheet)).toBe(templateExplanation(buildFactSheet(hero)));
  });
  it("validates for a protected-road case with no facilities and no shift", () => {
    const blocked = buildFactSheet({
      ...hero,
      facilities: [],
      busRouteNames: [],
      rules: [...hero.rules, { rule_id: "CORRIDOR_CRITICAL_MORATORIUM", trigger_text: "protected arterial within protection period", action: "BLOCK_OR_CHIEF_ENGINEER_REVIEW" }],
      strategies: [{ strategy: "BLOCK_OR_ESCALATE", recommended: true, feasible: true, schedule_shift_days: 0, ratings: {}, conditions: [] }],
    });
    const text = templateExplanation(blocked);
    expect(validateExplanation(text, blocked).errors).toEqual([]);
    expect(text).toContain("moratorium");
  });
  it("validates for an infrastructure-only case", () => {
    const metro = buildFactSheet({
      ...hero,
      permits: [hero.permits[1]],
      infraZones: [{ project_name: "Pune Metro Line 4 — Kharadi to Khadakwasla", agency: "Maha Metro", status: "active" }],
      rules: [{ rule_id: "CORRIDOR_FACILITY_CRITICALITY_GATE", trigger_text: "critical context and coordination opportunity", action: "COORDINATION_REQUIRED" }],
      strategies: [{ strategy: "SEPARATE_EXECUTION", recommended: true, feasible: true, schedule_shift_days: 0, ratings: {}, conditions: [] }],
    });
    expect(validateExplanation(templateExplanation(metro), metro).errors).toEqual([]);
  });
});

describe("adapter", () => {
  const ok = async () => ({ text: GOOD, model: "test-model" });
  const bad = async () => ({ text: "Disruption will rise by 40%.", model: "test-model" });
  const down = async () => {
    throw new Error("HTTP 429");
  };
  it("uses the primary provider when its answer validates", async () => {
    const r = await explain(sheet, { gemini: ok, groq: down }, ["gemini", "groq"]);
    expect(r).toMatchObject({ provider: "gemini", model: "test-model", validated: true, text: GOOD });
  });
  it("falls back to the second provider when the first fails validation", async () => {
    const r = await explain(sheet, { gemini: bad, groq: ok }, ["gemini", "groq"]);
    expect(r.provider).toBe("groq");
    expect(r.attempts.map((a) => [a.provider, a.ok])).toEqual([["gemini", false], ["groq", true]]);
  });
  it("falls back to the template when both providers fail, without throwing", async () => {
    const r = await explain(sheet, { gemini: down, groq: bad }, ["gemini", "groq"]);
    expect(r).toMatchObject({ provider: "template", model: null, validated: true });
    expect(r.text).toBe(templateExplanation(sheet));
  });
  it("goes straight to the template when no AI provider is configured", async () => {
    const r = await explain(sheet, {}, []);
    expect(r.provider).toBe("template");
    expect(r.attempts).toHaveLength(1);
  });
  it("tidies tags placed after the full stop and repeated tags", () => {
    expect(normalise("Buses run here. [B1] [B1] Joint execution is recommended [S1]. [S1]")).toBe("Buses run here [B1]. Joint execution is recommended [S1].");
  });
});
