import { describe, expect, it } from "vitest";
import { NOTICE_LANGS, renderNotice } from "../render";
import type { NoticeData } from "../types";

const combined: NoticeData = {
  id: "n1",
  reference: "CC-2026-005",
  road_name: "Sinhagad Road",
  chainage_start_m: 3257,
  chainage_end_m: 3454,
  starts_on: "2026-10-26",
  ends_on: "2026-11-26",
  traffic_impact: "partial_closure",
  departments: ["PMC Water Supply", "Jio Fiber"],
  joint: true,
  works: [
    { permit_id: "PMC/RC/2026/0023", department: "PMC Water Supply", purpose: "200mm water distribution main replacement near Karva Hospital", road_side: "left" },
    { permit_id: "PMC/RC/2026/0024", department: "Jio Fiber", purpose: "OFC duct laying for FTTH near Karva Hospital", road_side: "right" },
  ],
  facility: "Karva Hospital",
  nearest_stop: "Dandekar Pul Sinhagad Road",
};
const single: NoticeData = { ...combined, reference: "PMC/RC/2026/0017", joint: false, departments: ["MSEDCL (electricity)"], works: [combined.works[0]], facility: null, nearest_stop: "Rajaram Pul", traffic_impact: "full_closure" };

describe("notice rendering", () => {
  it("writes a combined notice in English", () => {
    const n = renderNotice(combined, "en");
    expect(n.badge).toBe("One dig for two works");
    expect(n.headline).toBe("Sinhagad Road, near Karva Hospital");
    expect(n.summary).toBe("Two works will share one trench here, so this stretch is dug once instead of two times.");
    expect(Object.fromEntries(n.rows.map((r) => [r.label, r.value]))).toEqual({
      Dates: "26 Oct – 26 Nov 2026",
      Traffic: "Part of the road closed",
      Diversion: "No diversion. Traffic keeps moving past the works. Access to Karva Hospital stays open.",
      Responsible: "PMC Water Supply with Jio Fiber",
      Reference: "CC-2026-005",
    });
    expect(n.draftNote).toBeNull();
  });
  it("writes the same notice in Hindi and Marathi, marked as awaiting review", () => {
    const hi = renderNotice(combined, "hi");
    expect(hi.badge).toBe("दो कामों के लिए एक ही खुदाई");
    expect(hi.headline).toBe("सिंहगड रोड, Karva Hospital के पास");
    expect(hi.rows.find((r) => r.mono)?.value).toBe("CC-2026-005");
    expect(hi.draftNote).toBeTruthy();
    const mr = renderNotice(combined, "mr");
    expect(mr.badge).toBe("दोन कामांसाठी एकदाच खोदकाम");
    expect(mr.headline).toBe("सिंहगड रोड, Karva Hospital जवळ");
    expect(mr.draftNote).toBeTruthy();
  });
  it("writes bus stop landmarks in Devanagari for Hindi and Marathi, and leaves unknown names alone", () => {
    expect(renderNotice(single, "mr").headline).toBe("सिंहगड रोड, राजाराम पूल जवळ");
    expect(renderNotice(single, "hi").headline).toBe("सिंहगड रोड, राजाराम पूल के पास");
    expect(renderNotice({ ...single, nearest_stop: "Prakash Cloth Store" }, "mr").headline).toBe("सिंहगड रोड, Prakash Cloth Store जवळ");
  });
  it("keeps Latin digits in dates for every language", () => {
    for (const lang of ["en", "hi", "mr"] as const) expect(renderNotice(combined, lang).rows[0].value).toMatch(/26.*2026/);
  });
  it("writes a single-permit notice without a badge, with the side and a full-closure diversion", () => {
    const n = renderNotice(single, "en");
    expect(n.badge).toBeNull();
    expect(n.headline).toBe("Sinhagad Road, near Rajaram Pul");
    expect(n.summary).toBe("Road works are planned on this stretch.");
    expect(n.rows[1].value).toBe("Road closed, left side");
    expect(n.rows[2].value).toBe("Follow the diversion signs at the site.");
  });
  it("does not claim one dig when the case was decided as separate execution", () => {
    const n = renderNotice({ ...combined, joint: false }, "en");
    expect(n.badge).toBeNull();
    expect(n.summary).toBe("Two works are planned on this stretch, one after another.");
  });
  it("falls back to a distance when there is no landmark", () => {
    expect(renderNotice({ ...single, nearest_stop: null }, "en").headline).toBe("Sinhagad Road, 3,260 to 3,450 m from Hingne");
  });
  it("has the report form wording in every language", () => {
    for (const t of Object.values(NOTICE_LANGS)) {
      const { about, ...strings } = t.reportForm;
      expect(about("X")).toContain("X");
      for (const value of Object.values(strings)) expect(value.trim().length).toBeGreaterThan(3);
    }
    expect(NOTICE_LANGS.hi.reportForm.title).not.toBe(NOTICE_LANGS.en.reportForm.title);
    expect(NOTICE_LANGS.mr.reportForm.thanks).not.toBe(NOTICE_LANGS.hi.reportForm.thanks);
  });
});
