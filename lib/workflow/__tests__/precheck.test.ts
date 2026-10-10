// The Pre-check panel's wording, driven by real engine results on the Pune fixtures.
import { describe, expect, it } from "vitest";
import { TODAY, city, evaluate, permit, stateWhenFiled } from "../../../engine/__tests__/helpers";
import { evaluatePermit } from "../../../engine/pipeline";
import { precheckOutcome, precheckRows } from "../precheck";

const rows = (short: string) => precheckRows(evaluate(short), stateWhenFiled(short), 200);

describe("pre-check rows", () => {
  it("hero permit: planned work, critical facility, staging, and a clear season", () => {
    const r = rows("0024");
    expect(r.map((x) => [x.tone, x.title])).toEqual([
      ["warn", "Planned work on this stretch."],
      ["warn", "Critical facility."],
      ["ok", "Outside the monsoon window"],
      ["warn", "Over 100 m."],
    ]);
    expect(r[0].detail).toContain("PMC/RC/2026/0023 (PMC Water Supply) digs 3,257–3,454 m from 26 Oct to 26 Nov");
    expect(r[0].rule_id).toBe("XPMS_REPEAT_OTHER_3M");
    expect(r[1].detail).toBe("Within 200 m of Karva Hospital.");
    expect(precheckOutcome(evaluate("0024"))).toMatch(/coordination case opens/);
  });
  it("monsoon permit: one blocking row and a blocked outcome", () => {
    const r = rows("0019");
    expect(r.filter((x) => x.tone === "block").map((x) => x.rule_id)).toEqual(["PMC_MONSOON_5M"]);
    expect(r.some((x) => x.tone === "ok")).toBe(false);
    expect(precheckOutcome(evaluate("0019"))).toBe("If submitted now: blocked.");
  });
  it("protected stretch: moratorium and annual-programme rows", () => {
    expect(rows("0006").map((x) => x.rule_id).filter(Boolean)).toEqual(expect.arrayContaining(["CORRIDOR_CRITICAL_MORATORIUM", "PMC_ANNUAL_PROGRAMME"]));
  });
  it("completed work nearby is described as recent, not planned", () => {
    expect(rows("0008").find((x) => x.detail.includes("0022"))?.title).toBe("Recent work on this stretch.");
  });
  it("isolated permit: only the all-clear row, auto-approved", () => {
    expect(rows("0017").map((x) => x.tone)).toEqual(["ok"]);
    expect(precheckOutcome(evaluate("0017"))).toBe("If submitted now: approved automatically.");
  });
  it("off-corridor trench: a single row telling the engineer what to do", () => {
    const off = { ...permit("0017"), corridor_id: null, snap_offset_m: 400 };
    const state = stateWhenFiled("0017");
    const r = precheckRows(evaluatePermit({ permit: off, corridor: state, city: city(), today: TODAY }), state, 200);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tone: "block", title: "Not on a managed corridor." });
  });
});
