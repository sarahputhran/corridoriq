// Department response, planner decision and supervisor sign-off.
// Each function expects to run inside a transaction supplied by the caller.
import { addDays, daysBetween } from "@/engine/dates";
import type { DecisionOutput, Strategy } from "@/engine/types";
import type { Sql } from "@/lib/db/connection";
import { loadCityConfig } from "@/lib/db/corridor-state";
import { addHours } from "@/lib/demo-clock";
import { audit, WorkflowError, type Actor } from "./common";

export const MIN_OVERRIDE_REASON = 15;
const STRATEGY_LABEL: Record<Strategy, string> = {
  JOINT_EXECUTION: "joint execution",
  DEFER_NEW_PERMIT: "defer new permit",
  RESEQUENCE_WORKS: "resequence works",
  SEPARATE_EXECUTION: "separate execution",
  BLOCK_OR_ESCALATE: "block or escalate",
};
export const strategyLabel = (s: Strategy) => STRATEGY_LABEL[s];
const TRAFFIC_RANK = ["none", "one_lane", "partial_closure", "full_closure"];

async function getCase(sql: Sql, caseId: string) {
  const [c] = await sql`select * from coordination_cases where id = ${caseId} for update`;
  if (!c) throw new WorkflowError("This coordination case no longer exists. Go back to the case list.");
  return c;
}

export interface TaskResponse {
  action: "confirm" | "propose";
  proposed_start?: string;
  proposed_end?: string;
  note?: string;
}

/** A department confirms its dates or proposes new ones. When every department has answered, the planner's clock starts. */
export async function respondToTask(sql: Sql, taskId: string, response: TaskResponse, actor: Actor, at: Date): Promise<void> {
  const [task] = await sql`select t.*, p.permit_id as permit_ref from tasks t left join permits p on p.id = t.permit_id where t.id = ${taskId} for update of t`;
  if (!task) throw new WorkflowError("This task no longer exists.");
  if (task.status !== "open") throw new WorkflowError("This task has already been answered.");
  if (task.kind !== "department_response") throw new WorkflowError("Only department response tasks can be answered here.");
  if (response.action === "propose" && !(response.proposed_start && response.proposed_end && response.proposed_end >= response.proposed_start)) {
    throw new WorkflowError("Give a start and end date for the alternative, with the end on or after the start.");
  }
  await sql`update tasks set status = 'done', completed_at = ${at}, response = ${sql.json(response as never)} where id = ${taskId}`;
  await audit(sql, { at, actor, entity: "task", entity_id: taskId, action: response.action === "confirm" ? "department_confirmed_dates" : "department_proposed_dates", after: { permit_id: task.permit_ref, ...response } });

  if (!task.case_id) return;
  const [{ open }] = await sql`select count(*)::int as open from tasks where case_id = ${task.case_id} and kind = 'department_response' and status = 'open'`;
  if (open > 0) return;
  const c = await getCase(sql, task.case_id as string);
  if (c.status !== "awaiting_department") return;
  const due = addHours(at, (await loadCityConfig(sql)).sla_hours.planner_decision);
  await sql`update coordination_cases set status = 'awaiting_planner', sla_due_at = ${due} where id = ${c.id}`;
  await sql`update tasks set due_at = ${due} where case_id = ${c.id} and kind = 'planner_decision' and status = 'open'`;
  await audit(sql, { at, actor: { user_id: null, role: "system" }, entity: "case", entity_id: c.case_ref as string, action: "department_responses_complete", after: { planner_due_at: due.toISOString() } });
}

/** The planner approves the recommendation or overrides it with a recorded reason. A supervisor must then sign off. */
export async function decideCase(sql: Sql, caseId: string, input: { strategy: Strategy; override_reason?: string }, actor: Actor, at: Date): Promise<void> {
  const c = await getCase(sql, caseId);
  if (!["open", "awaiting_department", "awaiting_planner"].includes(c.status as string)) {
    throw new WorkflowError(c.status === "awaiting_checker" ? "This case already has a decision waiting for supervisor sign-off." : "This case is already decided.");
  }
  const [option] = await sql`select * from strategy_options where case_id = ${caseId} and strategy = ${input.strategy}::strategy`;
  if (!option) throw new WorkflowError("That strategy is not available for this case.");
  const isOverride = input.strategy !== c.recommended_strategy;
  const reason = input.override_reason?.trim() ?? "";
  if (isOverride && reason.length < MIN_OVERRIDE_REASON) {
    throw new WorkflowError(`Choosing a strategy other than the recommendation needs a reason of at least ${MIN_OVERRIDE_REASON} characters.`);
  }
  const conditions = (option.conditions as string[]) ?? [];
  const decision: DecisionOutput =
    input.strategy === "BLOCK_OR_ESCALATE" ? "BLOCK" : input.strategy === "DEFER_NEW_PERMIT" || input.strategy === "RESEQUENCE_WORKS" ? "RESCHEDULE" : conditions.length ? "ALLOW_WITH_CONDITIONS" : "ALLOW";

  await sql`insert into decisions (case_id, chosen_strategy, decision, is_override, override_reason, maker_user_id, made_at, created_at)
            values (${caseId}, ${input.strategy}::strategy, ${decision}::decision_output, ${isOverride}, ${isOverride ? reason : null}, ${actor.user_id}, ${at}, ${at})`;
  const due = addHours(at, (await loadCityConfig(sql)).sla_hours.checker);
  await sql`update coordination_cases set status = 'awaiting_checker', sla_due_at = ${due} where id = ${caseId}`;
  await sql`update tasks set status = 'done', completed_at = ${at} where case_id = ${caseId} and kind = 'planner_decision' and status = 'open'`;
  await sql`update tasks set status = 'superseded', completed_at = ${at} where case_id = ${caseId} and kind = 'department_response' and status = 'open'`;
  await sql`insert into tasks (case_id, kind, assignee_role, title, due_at, created_at)
            values (${caseId}, 'checker_signoff', 'supervisor', ${`Sign off ${c.case_ref}: ${strategyLabel(input.strategy)}`}, ${due}, ${at})`;
  await audit(sql, {
    at, actor, entity: "case", entity_id: c.case_ref as string, action: isOverride ? "planner_overrode_recommendation" : "planner_approved_recommendation",
    after: { chosen_strategy: input.strategy, recommended_strategy: c.recommended_strategy, rule_ids: c.rule_ids, reason: isOverride ? reason : null },
  });
}

/** The supervisor approves (releasing the permits and publishing one combined notice) or sends the case back with a note. */
export async function signOffCase(sql: Sql, caseId: string, input: { approve: boolean; note?: string }, actor: Actor, at: Date): Promise<{ notice_id: string | null }> {
  const c = await getCase(sql, caseId);
  if (c.status !== "awaiting_checker") throw new WorkflowError("This case is not waiting for sign-off.");
  const [decision] = await sql`select * from decisions where case_id = ${caseId} and checked_at is null order by created_at desc limit 1`;
  if (!decision) throw new WorkflowError("There is no planner decision to sign off yet.");
  if (actor.user_id && decision.maker_user_id === actor.user_id) throw new WorkflowError("The person who made the decision cannot also sign it off. Switch to the supervisor.");
  const note = input.note?.trim() ?? "";
  if (!input.approve && !note) throw new WorkflowError("Sending a case back needs a note saying what should change.");

  await sql`update decisions set checker_user_id = ${actor.user_id}, checked_at = ${at}, checker_note = ${note || null}, checker_approved = ${input.approve} where id = ${decision.id}`;
  await sql`update tasks set status = 'done', completed_at = ${at} where case_id = ${caseId} and kind = 'checker_signoff' and status = 'open'`;
  const city = await loadCityConfig(sql);

  if (!input.approve) {
    const due = addHours(at, city.sla_hours.planner_decision);
    await sql`update coordination_cases set status = 'awaiting_planner', sla_due_at = ${due} where id = ${caseId}`;
    await sql`insert into tasks (case_id, kind, assignee_role, title, due_at, created_at) values (${caseId}, 'planner_decision', 'planner', ${`Decide coordination case ${c.case_ref} again (sent back)`}, ${due}, ${at})`;
    await audit(sql, { at, actor, entity: "case", entity_id: c.case_ref as string, action: "supervisor_sent_back", after: { chosen_strategy: decision.chosen_strategy, note } });
    return { notice_id: null };
  }

  const strategy = decision.chosen_strategy as Strategy;
  const [option] = await sql`select * from strategy_options where case_id = ${caseId} and strategy = ${strategy}::strategy`;
  const permits = await sql`
    select p.id, p.permit_id, p.status::text as status, to_char(p.proposed_start, 'YYYY-MM-DD') as start, to_char(p.proposed_end, 'YYYY-MM-DD') as "end",
           p.conditions, p.traffic_impact, p.chainage_start_m, p.chainage_end_m, d.name as department,
           (select (s->>'feasible')::boolean from evaluations e, jsonb_array_elements(e.result->'strategies') s
             where e.permit_id = p.id and s->>'strategy' = 'JOINT_EXECUTION' order by e.ran_at desc limit 1) as can_join
    from permits p join departments d on d.id = p.department_id
    where p.id = any(${c.permit_ids as string[]}::uuid[]) order by p.permit_id for update of p`;
  const live = permits.filter((p) => p.status !== "completed");
  const pending = live.filter((p) => p.status === "coordination_required");
  const settled = live.filter((p) => p.status !== "coordination_required");
  const strategyConditions = ((option?.conditions as string[]) ?? []).filter((x) => !x.startsWith("Needs chief engineer approval"));

  for (const p of pending) {
    let start = p.start as string;
    let end = p.end as string;
    const extra: string[] = [];
    const duration = daysBetween(start, end);
    // can_join is false only when this permit's own evaluation found no trench it could share.
    if (strategy === "JOINT_EXECUTION" && p.can_join !== false) {
      const target = live.map((x) => x.start as string).sort()[0];
      if (target < start) [start, end] = [target, addDays(target, duration)];
      extra.push(`Joint execution under ${c.case_ref}: one road opening shared with the other works on this stretch.`, ...strategyConditions);
    } else if (strategy === "DEFER_NEW_PERMIT" && settled.length) {
      const target = addDays(settled.map((x) => x.end as string).sort().at(-1)!, city.defer_buffer_days);
      if (target > start) [start, end] = [target, addDays(target, duration)];
      extra.push(`Deferred under ${c.case_ref} until the existing works on this stretch finish.`);
    } else if (strategy === "RESEQUENCE_WORKS") {
      const shift = (option?.schedule_shift_days as number) ?? 0;
      if (shift > 0) [start, end] = [addDays(start, shift), addDays(end, shift)];
      extra.push(`Resequenced under ${c.case_ref}.`);
    } else if (strategy === "SEPARATE_EXECUTION") {
      extra.push(...strategyConditions);
    }
    const conditions = [...new Set([...(p.conditions as string[]), ...extra])];
    const status = strategy === "BLOCK_OR_ESCALATE" ? "blocked" : conditions.length ? "approved_with_conditions" : "approved";
    await sql`update permits set status = ${status}::permit_status, proposed_start = ${start}, proposed_end = ${end}, conditions = ${conditions} where id = ${p.id}`;
    await audit(sql, {
      at, actor, entity: "permit", entity_id: p.permit_id as string, action: status === "blocked" ? "permit_blocked_by_case" : "permit_released_by_case",
      before: { status: p.status, proposed_start: p.start, proposed_end: p.end },
      after: { status, proposed_start: start, proposed_end: end, case_ref: c.case_ref, strategy },
    });
    Object.assign(p, { start, end });
  }

  let noticeId: string | null = null;
  if (strategy !== "BLOCK_OR_ESCALATE" && live.length) {
    const traffic = live.map((p) => p.traffic_impact as string).sort((a, b) => TRAFFIC_RANK.indexOf(b) - TRAFFIC_RANK.indexOf(a))[0];
    const [notice] = await sql`
      insert into notices (case_id, permit_ids, corridor_id, chainage_start_m, chainage_end_m, starts_on, ends_on, traffic_impact, departments, reference, published_at)
      values (${caseId}, ${live.map((p) => p.id as string)}::uuid[], ${c.corridor_id}, ${Math.min(...live.map((p) => p.chainage_start_m as number))},
              ${Math.max(...live.map((p) => p.chainage_end_m as number))}, ${live.map((p) => p.start as string).sort()[0]}, ${live.map((p) => p.end as string).sort().at(-1)!},
              ${traffic}, ${[...new Set(live.map((p) => p.department as string))]}, ${c.case_ref}, ${at})
      returning id`;
    noticeId = notice.id as string;
    await audit(sql, { at, actor: { user_id: null, role: "system" }, entity: "notice", entity_id: c.case_ref as string, action: "combined_notice_published", after: { permit_ids: live.map((p) => p.permit_id), strategy } });
  }
  await sql`update coordination_cases set status = 'decided', sla_due_at = null where id = ${caseId}`;
  await sql`update tasks set status = 'done', completed_at = ${at} where case_id = ${caseId} and kind = 'escalation' and status = 'open' and ${strategy !== "BLOCK_OR_ESCALATE"}`;
  await audit(sql, { at, actor, entity: "case", entity_id: c.case_ref as string, action: "supervisor_signed_off", after: { chosen_strategy: strategy, is_override: decision.is_override, note: note || null, rule_ids: c.rule_ids } });
  return { notice_id: noticeId };
}
