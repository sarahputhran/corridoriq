// Database-level check: what the seeded workflow stored must agree with the pure engine
// run on the processed-data fixtures. Usage: npm run db:verify
import { config } from "dotenv";
import { evaluate, filingOrder } from "../engine/__tests__/helpers";
import type { PipelineResult } from "../engine/types";
import { createConnection } from "../lib/db/connection";

config({ path: ".env.local", quiet: true });

async function main() {
  const sql = createConnection({ max: 1 });
  let failures = 0;
  const fail = (msg: string) => {
    failures++;
    console.log(`  ✗ ${msg}`);
  };
  try {
    const rows = await sql`
      select p.permit_id, e.result from permits p
      join lateral (select result from evaluations where permit_id = p.id order by ran_at limit 1) e on true`;
    const stored = new Map(rows.map((r) => [r.permit_id as string, r.result as PipelineResult]));
    const evaluated = filingOrder.filter((p) => p.status === "proposed");
    if (stored.size !== evaluated.length) fail(`expected ${evaluated.length} evaluated permits, found ${stored.size}`);

    for (const p of evaluated) {
      const short = p.permit_id.slice(-4);
      const db = stored.get(p.permit_id);
      const pure = evaluate(short);
      if (!db) {
        fail(`${short}: no stored evaluation`);
        continue;
      }
      const same = (label: string, a: unknown, b: unknown) => {
        if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${short} ${label}: database ${JSON.stringify(a)} vs engine fixtures ${JSON.stringify(b)}`);
      };
      same("decision", db.decision, pure.decision);
      same("rules", db.ruleIds, pure.ruleIds);
      same("flags", db.flags, pure.flags);
      same("outcome", db.outcome_status, pure.outcome_status);
      same("case permits", db.coordination?.permit_ids ?? null, pure.coordination?.permit_ids ?? null);
      same("recommended", db.coordination?.recommended_strategy ?? null, pure.coordination?.recommended_strategy ?? null);
      same("counterpart classes", db.counterparts.map((c) => [c.id, c.spatial, c.repeat, c.feasibility]), pure.counterparts.map((c) => [c.id, c.spatial, c.repeat, c.feasibility]));
    }

    const [hero] = await sql`
      select cc.case_ref, cc.status::text as status, cc.recommended_strategy::text as rec, cc.criticality_flags,
             (select count(*)::int from strategy_options s where s.case_id = cc.id) as strategies,
             (select count(*)::int from tasks t where t.case_id = cc.id and t.kind = 'planner_decision' and t.status = 'open') as planner_tasks
      from coordination_cases cc join permits p on p.id = cc.triggering_permit_id where p.permit_id = 'PMC/RC/2026/0024'`;
    if (!hero) fail("hero case (0024) not found");
    else {
      if (hero.status !== "awaiting_planner") fail(`hero case status is ${hero.status}, expected awaiting_planner`);
      if (hero.rec !== "JOINT_EXECUTION") fail(`hero case recommends ${hero.rec}`);
      if (hero.strategies !== 5) fail(`hero case has ${hero.strategies} strategy rows`);
      if (hero.planner_tasks !== 1) fail(`hero case has ${hero.planner_tasks} open planner tasks`);
      if (!(hero.criticality_flags as string[]).includes("hospital_access")) fail("hero case has no hospital_access flag");
    }
    const [decided] = await sql`
      select count(*)::int as n from decisions d join coordination_cases cc on cc.id = d.case_id
      where cc.status = 'decided' and d.checker_approved and d.maker_user_id is not null and d.checker_user_id is not null and d.maker_user_id <> d.checker_user_id`;
    if (decided.n < 1) fail("no case has been decided and signed off by two different people");
    const [combined] = await sql`select count(*)::int as n from notices where case_id is not null and array_length(permit_ids, 1) > 1`;
    if (combined.n < 1) fail("no combined notice exists");
    const [overdue] = await sql`select count(*)::int as n from tasks where status = 'open' and kind = 'department_response' and due_at < ${`${process.env.DEMO_TODAY ?? "2026-10-15"}T00:00:00+05:30`}`;
    if (overdue.n < 1) fail("no overdue department task for the escalation demo");

    console.log(failures ? `\n${failures} check(s) failed.` : `  ✓ ${evaluated.length} stored evaluations match the engine; hero case, sign-off, combined notice and overdue task present.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error("verify failed:", String(err?.message ?? err).replace(/postgres(ql)?:\/\/\S+/g, "[connection string hidden]"));
  process.exit(1);
});
