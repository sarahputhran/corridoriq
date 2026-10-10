// Deterministic fallback: the same explanation shape, built straight from the fact sheet.
// No model is involved, so it always works and always validates.
import type { FactSheet } from "../factsheet";

const cite = (...ids: string[]) => ids.map((id) => `[${id}]`).join(" ");
const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export function templateExplanation(sheet: FactSheet): string {
  const sentences: string[] = [];
  const rule = (id: string) => sheet.rules.find((r) => r.rule_id === id);

  // 1. What is on this stretch.
  const places = sheet.facilities.slice(0, 2);
  const routes = sheet.bus_routes.slice(0, 1);
  if (places.length && routes.length) {
    sentences.push(`This stretch is within ${sheet.buffer_m} m of ${list(places.map((f) => f.name))} ${cite(...places.map((f) => f.id))} and carries the PMPML route ${list(routes.map((b) => b.route_name))} ${cite(...routes.map((b) => b.id))}.`);
  } else if (places.length) {
    sentences.push(`This stretch is within ${sheet.buffer_m} m of ${list(places.map((f) => f.name))} ${cite(...places.map((f) => f.id))}.`);
  } else if (routes.length) {
    sentences.push(`This stretch carries the PMPML route ${list(routes.map((b) => b.route_name))} ${cite(...routes.map((b) => b.id))}.`);
  }
  for (const z of sheet.infra_zones.slice(0, 1)) sentences.push(`The works fall inside the work zone of ${z.project_name}, where a utility trench cannot be shared ${cite(z.id)}.`);

  // 2. Why the works belong in one decision.
  const live = sheet.permits.filter((p) => p.role !== "completed_history");
  const history = sheet.permits.filter((p) => p.role === "completed_history");
  const repeat = rule("XPMS_REPEAT_OTHER_3M") ?? rule("XPMS_REPEAT_SAME_6M") ?? rule("XPMS_COMMON_TRENCH_3_6M") ?? rule("CORRIDOR_SAME_SEGMENT_MULTIWORK");
  if (live.length >= 2) {
    // Two works are named; a longer list is summarised without inventing a count.
    const shown = live.slice(0, 2);
    const named = shown.map((p) => `the ${lowerFirst(p.purpose)} ${cite(p.id)}`);
    const works = live.length > 2 ? `${named.join(", ")} and the other works in this case` : list(named);
    sentences.push(`Executing ${works} separately means the same stretch is opened more than once ${cite(...(repeat ? [repeat.id] : shown.map((p) => p.id)))}.`);
  } else if (live.length === 1 && history.length) {
    sentences.push(`The ${lowerFirst(live[0].purpose)} ${cite(live[0].id)} would reopen a stretch that was dug for the ${lowerFirst(history[0].purpose)} ${cite(history[0].id, ...(repeat ? [repeat.id] : []))}.`);
  } else if (live.length === 1) {
    sentences.push(`The ${lowerFirst(live[0].purpose)} is the only utility work in this case ${cite(live[0].id)}.`);
  }

  // 3. A hard road-protection rule, when one fired.
  const moratorium = rule("CORRIDOR_CRITICAL_MORATORIUM");
  if (moratorium) sentences.push(`The stretch is a protected road inside its moratorium period, so excavation needs chief engineer review ${cite(moratorium.id)}.`);

  // 4. The recommendation and its main cost.
  const rec = sheet.strategies.find((s) => s.id === sheet.recommended_strategy_id);
  if (rec) {
    const trigger = sheet.permits.find((p) => p.role === "triggering");
    const shift =
      rec.schedule_shift_days <= 0
        ? "with no change to the dates"
        : rec.schedule_shift_days < 7
          ? `which moves the ${trigger?.department ?? "new permit"} start by ${rec.schedule_shift_days} days`
          : `which moves the ${trigger?.department ?? "new permit"} start by ${rec.schedule_shift_weeks} weeks`;
    const feasibility = rule("CORRIDOR_EXECUTION_FEASIBILITY");
    const cost = rec.strategy === "JOINT_EXECUTION" && feasibility ? ` and needs engineering sign-off before a joint trench ${cite(feasibility.id)}` : "";
    sentences.push(`The system recommends ${rec.label}, ${shift} ${cite(rec.id)}${cost}.`);
  }

  // The validator needs at least two sentences; a case always has rules to point at.
  if (sentences.length < 2 && sheet.rules.length) sentences.push(`The coordination rules that fired are recorded on this case ${cite(...sheet.rules.slice(0, 3).map((r) => r.id))}.`);
  return sentences.slice(0, 6).join(" ");
}
