// Runs the engine over every permit in filing order (pure engine + fixtures, no database) and prints a Markdown table.
// Usage: npm run engine:report
import { evaluate, filingOrder } from "../engine/__tests__/helpers";

const short = (id: string) => id.slice(-4);
console.log("| Filed | Permit | Status in seed | Decision | Outcome | Rules fired | Flags | Case with | Recommended |");
console.log("|---|---|---|---|---|---|---|---|---|");
// Completed and pre-approved permits are seeded as history and never evaluated; 0018 is included for scenario E.
for (const p of filingOrder.filter((p) => p.status === "proposed" || p.work_type === "emergency_fault" && p.status === "in_progress")) {
  const r = evaluate(short(p.permit_id));
  const c = r.coordination;
  const withIds = c ? [...c.permit_ids.filter((id) => id !== p.permit_id).map(short), ...c.infra_zone_ids].join(", ") : "-";
  console.log(
    `| ${p.filed_at} | ${short(p.permit_id)} | ${p.status} | ${r.decision} | ${r.outcome_status} | ${r.ruleIds.join(", ") || "-"} | ${r.flags.join(", ") || "-"} | ${withIds} | ${c?.recommended_strategy ?? "-"} |`,
  );
}
