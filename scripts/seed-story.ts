// The demo's back-story: replays every filing in filed_at order through the real workflow,
// so cases come out exactly as they would in use, then plays a few follow-up actions so the screens are not empty.
import type { LineString } from "geojson";
import { DEMO_USERS } from "../config/demo-users";
import { pune } from "../config/cities/pune";
import type { Sql } from "../lib/db/connection";
import { decideCase, respondToTask, signOffCase } from "../lib/workflow/case-actions";
import { audit, SYSTEM, type Actor } from "../lib/workflow/common";
import { filePermit, insertPermit, type NewPermit } from "../lib/workflow/file-permit";
import { readProcessed } from "./lib/data";

type Processed = Omit<NewPermit, "applicant_user_id" | "snap_offset_m"> & {
  status: "proposed" | "approved" | "completed" | "in_progress";
  filed_at: string;
  snap_offset_start_m: number;
  snap_offset_end_m: number;
  geom: LineString;
};

/** Indian Standard Time, the demo city's clock. */
const ist = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);

export async function replayStory(sql: Sql, userIds: Map<string, string>, log: (line: string) => void = console.log) {
  const userFor = (role: string, departmentId: string | null = null): Actor => {
    const u = DEMO_USERS.find((d) => d.role === role && d.department_id === departmentId)!;
    return { user_id: userIds.get(u.email)!, role: u.role };
  };
  const planner = userFor("planner");
  const supervisor = userFor("supervisor");

  const permits = readProcessed<Processed[]>("permits.json").sort((a, b) => a.filed_at.localeCompare(b.filed_at) || a.permit_id.localeCompare(b.permit_id));
  const outcomes: string[] = [];
  for (const [i, p] of permits.entries()) {
    const engineer = userFor("engineer", p.department_id);
    const { status, filed_at, snap_offset_start_m, snap_offset_end_m, ...rest } = p;
    const permit: NewPermit = { ...rest, applicant_user_id: engineer.user_id, snap_offset_m: Math.max(snap_offset_start_m, snap_offset_end_m) };
    // Same-day filings keep their order: each is a minute after the previous one.
    const at = new Date(ist(filed_at, "10:00").getTime() + i * 60_000);
    if (status === "proposed") {
      const filed = await filePermit(sql, permit, { actor: engineer, at, today: pune.demo_today });
      outcomes.push(`${p.permit_id.slice(-4)}→${filed.case_ref ? `${filed.case_ref}${filed.joined_existing_case ? " (joined)" : ""}` : filed.result.outcome_status}`);
    } else {
      // Completed, in-progress and pre-approved works are history: stored as they are, not evaluated.
      await insertPermit(sql, permit, status, at);
      await audit(sql, { at, actor: SYSTEM, entity: "permit", entity_id: p.permit_id, action: "permit_seeded_as_history", after: { status } });
    }
  }
  log(`  replayed ${permits.length} filings: ${outcomes.join("  ")}`);

  const caseOf = async (short: string) => {
    const [c] = await sql`select cc.id, cc.case_ref, cc.recommended_strategy from coordination_cases cc join permits p on p.id = any(cc.permit_ids) where p.permit_id = ${`PMC/RC/2026/${short}`}`;
    if (!c) throw new Error(`No case contains permit ${short}`);
    return c;
  };
  const hero = await caseOf("0024");
  const repeat = await caseOf("0008");
  const restored = await caseOf("0001");

  // Departments answer. The hero case's answer lands on the demo morning, so its planner clock shows two days left.
  // The repeat-opening case is left unanswered and overdue, so the escalation screen has something real to show.
  const tasks = await sql`
    select t.id, t.case_id, t.assignee_department_id from tasks t
    where t.kind = 'department_response' and t.status = 'open' order by t.created_at, t.id`;
  for (const t of tasks) {
    if (t.case_id === repeat.id) continue;
    const at = t.case_id === hero.id ? ist(pune.demo_today, "09:00") : ist("2026-10-14", "11:00");
    await respondToTask(sql, t.id as string, { action: "confirm", note: "Dates confirmed." }, userFor("engineer", t.assignee_department_id as string), at);
  }

  // One case goes all the way through, so there is a combined notice and a complete audit trail on day one.
  await decideCase(sql, restored.id as string, { strategy: restored.recommended_strategy }, planner, ist("2026-10-14", "15:00"));
  await signOffCase(sql, restored.id as string, { approve: true, note: "Stage the works as conditioned." }, supervisor, ist("2026-10-14", "17:00"));

  const cases = await sql`select case_ref, status::text as status, title, array_length(permit_ids, 1) as n, recommended_strategy::text as rec from coordination_cases order by case_ref`;
  for (const c of cases) log(`  ${c.case_ref}  ${String(c.status).padEnd(19)} ${c.n} permits  ${String(c.rec).padEnd(18)} ${c.title}`);
}
