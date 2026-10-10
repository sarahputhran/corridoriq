// Turns an engine result into the plain-language rows of the Pre-check panel on the File Permit screen.
// Pure: the same result always gives the same rows. Each row that comes from a rule carries its rule ID.
import type { CorridorState, PipelineResult } from "@/engine/types";

export interface PrecheckRow {
  tone: "ok" | "warn" | "block";
  title: string;
  detail: string;
  rule_id?: string;
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const d = (iso: string | null) => (iso ? DATE.format(new Date(`${iso}T00:00:00Z`)) : "");
const m = (n: number) => Math.round(n).toLocaleString("en-IN");
const fired = (r: PipelineResult, id: string) => r.ruleHits.find((h) => h.rule_id === id && h.fired);

export function precheckRows(result: PipelineResult, state: CorridorState, bufferM: number): PrecheckRow[] {
  const rows: PrecheckRow[] = [];
  if (result.steps[0]?.status === "stop") {
    return [{ tone: "block", title: "Not on a managed corridor.", detail: `Both ends of the trench need to be on ${state.corridor.road_name || "the corridor"}. Click closer to the road line.` }];
  }
  const others = new Map(state.permits.map((p) => [p.permit_id, p]));

  if (fired(result, "PMC_MONSOON_5M")) {
    rows.push({ tone: "block", title: "Inside the monsoon window.", detail: "Routine excavation is not allowed from 30 April to 30 September. Choose dates outside it.", rule_id: "PMC_MONSOON_5M" });
  }
  if (fired(result, "PMC_FAULT_MONSOON_5X1")) {
    rows.push({ tone: "block", title: "Fault repair too large for the restricted season.", detail: "Without sanction, a fault excavation in the monsoon window is limited to 5 m by 1 m.", rule_id: "PMC_FAULT_MONSOON_5X1" });
  }
  if (fired(result, "PMC_FAULT_48H")) {
    rows.push({ tone: "warn", title: "Emergency fault pathway.", detail: result.conditions[0] ?? "Repair and reinstate quickly.", rule_id: "PMC_FAULT_48H" });
  }

  for (const c of result.counterparts.filter((c) => c.trigger_reasons.length)) {
    if (c.kind === "permit") {
      const p = others.get(c.id);
      const where = p ? `${m(p.chainage_start_m)}–${m(p.chainage_end_m)} m` : "this stretch";
      rows.push({
        tone: "warn",
        title: c.history ? "Recent work on this stretch." : "Planned work on this stretch.",
        detail: `${c.id} (${c.department}) ${c.history ? "dug" : "digs"} ${where} from ${d(c.start)} to ${d(c.end)}. A coordination case will open.`,
        rule_id: c.repeat === "REPEAT_SAME_UTILITY" ? "XPMS_REPEAT_SAME_6M" : c.repeat === "REPEAT_CROSS_UTILITY" ? "XPMS_REPEAT_OTHER_3M" : c.repeat === "COMMON_TRENCH_CANDIDATE" ? "XPMS_COMMON_TRENCH_3_6M" : "CORRIDOR_SAME_SEGMENT_MULTIWORK",
      });
    } else {
      rows.push({ tone: "warn", title: "Major infrastructure work zone.", detail: `The trench is inside the ${c.label} zone (${c.department}). A coordination case will open.`, rule_id: "CORRIDOR_FACILITY_CRITICALITY_GATE" });
    }
  }

  const critical = state.facilities.filter((f) => f.distance_m <= bufferM && ["hospital", "clinic", "school"].includes(f.type) && f.name).slice(0, 3);
  if (critical.length) {
    rows.push({ tone: "warn", title: "Critical facility.", detail: `Within ${m(bufferM)} m of ${critical.map((f) => f.name).join(", ")}.` });
  }

  const moratorium = fired(result, "CORRIDOR_CRITICAL_MORATORIUM");
  const restored = fired(result, "CORRIDOR_RESTORED_12M") ?? fired(result, "PMC_DLP_12M");
  const priorApproval = fired(result, "PMC_CC_DLP_PRIOR_APPROVAL");
  if (moratorium) rows.push({ tone: "warn", title: "Protected road under moratorium.", detail: "This stretch was reconstructed recently and is protected. Excavation needs chief engineer review.", rule_id: "CORRIDOR_CRITICAL_MORATORIUM" });
  else if (restored) rows.push({ tone: "warn", title: "Recently restored stretch.", detail: "The road here was restored within the last 12 months. A planner must review before it is cut again.", rule_id: restored.rule_id });
  else if (priorApproval) rows.push({ tone: "warn", title: "Prior approval needed.", detail: "The surface here needs prior approval before excavation.", rule_id: "PMC_CC_DLP_PRIOR_APPROVAL" });

  if (!fired(result, "PMC_MONSOON_5M") && !fired(result, "PMC_FAULT_MONSOON_5X1") && !moratorium && !restored) {
    rows.push({ tone: "ok", title: "Outside the monsoon window", detail: "and no restoration moratorium." });
  }
  if (fired(result, "PMC_100M_STAGING")) rows.push({ tone: "warn", title: "Over 100 m.", detail: "Work must be staged.", rule_id: "PMC_100M_STAGING" });
  if (fired(result, "PMC_ANNUAL_PROGRAMME")) rows.push({ tone: "warn", title: "Not in the annual programme.", detail: "A planner must review works that are not in this year's coordinated programme.", rule_id: "PMC_ANNUAL_PROGRAMME" });
  return rows;
}

/** One sentence on what happens if the permit is submitted as it stands. */
export function precheckOutcome(result: PipelineResult): string {
  switch (result.outcome_status) {
    case "blocked":
      return "If submitted now: blocked.";
    case "coordination_required":
      return "If submitted now: a coordination case opens and a planner decides.";
    case "review_required":
      return "If submitted now: it goes to a planner for review.";
    case "approved_with_conditions":
      return "If submitted now: approved automatically, with the conditions above.";
    default:
      return "If submitted now: approved automatically.";
  }
}
