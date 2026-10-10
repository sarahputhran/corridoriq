// Filing a permit: store it, run the engine against the corridor as it stands,
// persist the evaluation, then either open/join a Coordination Case or settle the permit on the spot.
// The caller supplies the transaction; nothing here commits on its own.
import type { LineString } from "geojson";
import { evaluatePermit } from "@/engine/pipeline";
import type { PermitInput, PipelineResult } from "@/engine/types";
import type { Sql } from "@/lib/db/connection";
import { loadCityConfig, loadCorridorState } from "@/lib/db/corridor-state";
import { addHours } from "@/lib/demo-clock";
import { audit, caseTitle, type Actor } from "./common";

export interface NewPermit extends Omit<PermitInput, "status" | "department"> {
  department_id: string;
  applicant_user_id: string | null;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  geom: LineString;
  synthetic: boolean;
}

export interface FileOptions {
  actor: Actor;
  /** When the filing happens (the seed replays history; live use passes the demo clock). */
  at: Date;
  /** The engine's "today" (DEMO_TODAY). */
  today: string;
}

export interface FileResult {
  permit_uuid: string;
  result: PipelineResult;
  case_id: string | null;
  case_ref: string | null;
  joined_existing_case: boolean;
}

const OPEN_CASE = ["open", "awaiting_department", "awaiting_planner", "awaiting_checker"];

export async function insertPermit(sql: Sql, p: NewPermit, status: string, filedAt: Date): Promise<string> {
  const [row] = await sql`
    insert into permits (permit_id, department_id, applicant_user_id, purpose, work_type, in_annual_programme, fault_sanctioned,
                         start_lat, start_lng, end_lat, end_lng, corridor_id, chainage_start_m, chainage_end_m, trench_length_m, snap_offset_m,
                         proposed_start, proposed_end, trench_depth_m, trench_width_m, road_side, traffic_impact, status, filed_at, synthetic, geom)
    values (${p.permit_id}, ${p.department_id}, ${p.applicant_user_id}, ${p.purpose}, ${p.work_type}, ${p.in_annual_programme}, ${p.fault_sanctioned},
            ${p.start_lat}, ${p.start_lng}, ${p.end_lat}, ${p.end_lng}, ${p.corridor_id}, ${p.chainage_start_m}, ${p.chainage_end_m},
            ${p.trench_length_m}, ${p.snap_offset_m}, ${p.proposed_start}, ${p.proposed_end}, ${p.trench_depth_m}, ${p.trench_width_m},
            ${p.road_side}, ${p.traffic_impact}, ${status}::permit_status, ${filedAt}, ${p.synthetic},
            st_setsrid(st_geomfromgeojson(${JSON.stringify(p.geom)}), 4326))
    returning id`;
  return row.id as string;
}

export async function filePermit(sql: Sql, permit: NewPermit, opts: FileOptions): Promise<FileResult> {
  const { actor, at, today } = opts;
  const permitUuid = await insertPermit(sql, permit, "submitted", at);
  await audit(sql, { at, actor, entity: "permit", entity_id: permit.permit_id, action: "permit_submitted", after: { department_id: permit.department_id, proposed_start: permit.proposed_start, proposed_end: permit.proposed_end } });

  const [dept] = await sql`select name from departments where id = ${permit.department_id}`;
  const input: PermitInput = { ...permit, department: dept.name as string, status: "submitted" };
  const city = await loadCityConfig(sql);
  const loaded = permit.corridor_id
    ? await loadCorridorState(sql, permit.corridor_id, permit.geom, permitUuid)
    : { state: { corridor: { id: "", road_name: "", length_m: 0 }, permits: [], restorations: [], infraZones: [], facilities: [], busRoutes: [] }, uuids: new Map<string, string>() };
  const result = evaluatePermit({ permit: input, corridor: loaded.state, city, today });
  loaded.uuids.set(permit.permit_id, permitUuid);

  const [evaluation] = await sql`
    insert into evaluations (permit_id, ran_at, demo_today, result, decision, rule_ids)
    values (${permitUuid}, ${at}, ${today}, ${sql.json(result as never)}, ${result.decision}::decision_output, ${result.ruleIds})
    returning id`;
  if (result.ruleHits.length) {
    await sql`insert into rule_hits ${sql(
      result.ruleHits.map((h) => ({
        evaluation_id: evaluation.id as string,
        rule_id: h.rule_id,
        step: h.step,
        fired: h.fired,
        counterpart_permit_id: h.counterpart_permit_id ? (loaded.uuids.get(h.counterpart_permit_id) ?? null) : null,
        counterpart_infra_id: h.counterpart_infra_id ?? null,
        inputs: sql.json({ ...h.inputs, restoration_id: h.restoration_id } as never),
        explanation: h.explanation,
      })),
    )}`;
  }
  await sql`update permits set status = ${result.outcome_status}::permit_status, conditions = ${result.conditions} where id = ${permitUuid}`;
  await audit(sql, {
    at, actor: { user_id: null, role: "system" }, entity: "permit", entity_id: permit.permit_id, action: "permit_evaluated",
    after: { decision: result.decision, status: result.outcome_status, rule_ids: result.ruleIds, gate: result.gate.reason },
  });

  const escalate = async (caseId: string | null) => {
    for (const e of result.escalations) {
      await sql`insert into tasks (case_id, permit_id, kind, assignee_role, title, due_at, created_at)
                values (${caseId}, ${permitUuid}, 'escalation', 'supervisor', ${`${e.reason} (${permit.permit_id})`}, ${addHours(at, city.sla_hours.checker)}, ${at})`;
    }
  };

  let caseId: string | null = null;
  let caseRef: string | null = null;
  let joined = false;

  if (result.coordination) {
    const c = result.coordination;
    const memberUuids = c.permit_ids.map((id) => loaded.uuids.get(id)!).filter(Boolean);
    const [existing] = await sql`
      select cc.*, coalesce(jsonb_array_length(e.result->'coordination'->'permit_ids'), 0) as basis_size
      from coordination_cases cc left join evaluations e on e.id = cc.strategy_evaluation_id
      where cc.status::text = any(${OPEN_CASE}) and cc.permit_ids && ${memberUuids}::uuid[]
      order by cc.created_at limit 1`;

    // The strategy table follows the evaluation that saw the most of the case.
    const replaceStrategies = !existing || c.permit_ids.length >= (existing.basis_size as number);
    const deptDue = addHours(at, city.sla_hours.department_response);
    const plannerDue = addHours(deptDue, city.sla_hours.planner_decision);

    if (existing) {
      joined = true;
      caseId = existing.id as string;
      caseRef = existing.case_ref as string;
      const permitIds = [...new Set([...(existing.permit_ids as string[]), ...memberUuids])];
      const members = await sql`select p.chainage_start_m, p.chainage_end_m, p.status::text as status, d.short from permits p join departments d on d.id = p.department_id where p.id = any(${permitIds}::uuid[]) order by p.permit_id`;
      const infraIds = [...new Set([...(existing.infra_zone_ids as string[]), ...c.infra_zone_ids])];
      const infraNames = infraIds.length ? (await sql`select project_name from infra_zones where id = any(${infraIds}) order by id`).map((z) => z.project_name as string) : [];
      const live = members.filter((m) => m.status !== "completed");
      const from = Math.min(...live.map((m) => m.chainage_start_m as number));
      const to = Math.max(...live.map((m) => m.chainage_end_m as number));
      await sql`
        update coordination_cases set
          permit_ids = ${permitIds}::uuid[], infra_zone_ids = ${infraIds},
          chainage_start_m = ${from}, chainage_end_m = ${to},
          title = ${caseTitle(live.map((m) => m.short as string), to - from, infraNames)},
          rule_ids = ${[...new Set([...(existing.rule_ids as string[]), ...c.rule_ids])].sort()},
          criticality_flags = ${[...new Set([...(existing.criticality_flags as string[]), ...c.criticality_flags])]},
          status = case when status = 'awaiting_planner' and ${c.department_tasks.length > 0} then 'awaiting_department'::case_status else status end
          ${replaceStrategies ? sql`, triggering_permit_id = ${permitUuid}, spatial_classification = ${c.spatial_classification},
            repeat_opening_classification = ${c.repeat_opening_classification}, execution_feasibility = ${c.execution_feasibility},
            recommended_strategy = ${c.recommended_strategy}::strategy, strategy_evaluation_id = ${evaluation.id}` : sql``}
        where id = ${caseId}`;
      await audit(sql, { at, actor: { user_id: null, role: "system" }, entity: "case", entity_id: caseRef, action: "permit_joined_case", after: { permit_id: permit.permit_id, rule_ids: c.rule_ids } });
    } else {
      const [{ n }] = await sql`select count(*)::int + 1 as n from coordination_cases`;
      caseRef = `CC-${today.slice(0, 4)}-${String(n).padStart(3, "0")}`;
      const members = await sql`select p.status::text as status, d.short from permits p join departments d on d.id = p.department_id where p.id = any(${memberUuids}::uuid[]) order by p.permit_id`;
      const infraNames = c.infra_zone_ids.length ? (await sql`select project_name from infra_zones where id = any(${c.infra_zone_ids}) order by id`).map((z) => z.project_name as string) : [];
      const hasDeptTasks = c.department_tasks.length > 0;
      const [created] = await sql`
        insert into coordination_cases (case_ref, title, corridor_id, triggering_permit_id, permit_ids, infra_zone_ids, chainage_start_m, chainage_end_m,
                                        spatial_classification, repeat_opening_classification, execution_feasibility, criticality_flags, rule_ids,
                                        recommended_strategy, status, sla_due_at, created_at, strategy_evaluation_id)
        values (${caseRef}, ${caseTitle(members.filter((m) => m.status !== "completed").map((m) => m.short as string), c.chainage_end_m - c.chainage_start_m, infraNames)},
                ${c.corridor_id}, ${permitUuid}, ${memberUuids}::uuid[], ${c.infra_zone_ids}, ${c.chainage_start_m}, ${c.chainage_end_m},
                ${c.spatial_classification}, ${c.repeat_opening_classification}, ${c.execution_feasibility}, ${c.criticality_flags}, ${c.rule_ids},
                ${c.recommended_strategy}::strategy, ${hasDeptTasks ? "awaiting_department" : "awaiting_planner"}::case_status,
                ${hasDeptTasks ? plannerDue : addHours(at, city.sla_hours.planner_decision)}, ${at}, ${evaluation.id})
        returning id`;
      caseId = created.id as string;
      await sql`insert into tasks (case_id, kind, assignee_role, title, due_at, created_at)
                values (${caseId}, 'planner_decision', 'planner', ${`Decide coordination case ${caseRef}`},
                        ${hasDeptTasks ? plannerDue : addHours(at, city.sla_hours.planner_decision)}, ${at})`;
      await audit(sql, { at, actor: { user_id: null, role: "system" }, entity: "case", entity_id: caseRef, action: "case_opened", after: { triggering_permit: permit.permit_id, permit_ids: c.permit_ids, infra_zone_ids: c.infra_zone_ids, rule_ids: c.rule_ids, recommended_strategy: c.recommended_strategy } });
    }

    // A counterpart that was waiting for a plain planner review is now handled through the case instead.
    const moved = await sql`
      update permits set status = 'coordination_required'
      where id = any(${memberUuids}::uuid[]) and id <> ${permitUuid} and status = 'review_required' returning id, permit_id`;
    for (const m of moved) {
      await sql`update tasks set status = 'superseded', completed_at = ${at} where permit_id = ${m.id} and kind = 'planner_review' and status = 'open'`;
      await audit(sql, { at, actor: { user_id: null, role: "system" }, entity: "permit", entity_id: m.permit_id as string, action: "permit_review_moved_to_case", after: { case_ref: caseRef } });
    }

    if (replaceStrategies) {
      await sql`delete from strategy_options where case_id = ${caseId}`;
      await sql`insert into strategy_options ${sql(
        result.strategies!.map((s) => ({ case_id: caseId!, strategy: s.strategy, feasible: s.feasible, recommended: s.recommended, schedule_shift_days: s.schedule_shift_days, ratings: sql.json(s.ratings as never), conditions: s.conditions, rationale: s.rationale })),
      )}`;
      // A cached explanation describes the old strategy table.
      await sql`delete from ai_explanations where case_id = ${caseId}`;
    }
    // One response task per counterpart permit: "confirm dates or propose alternative".
    for (const t of c.department_tasks) {
      const counterpartUuid = loaded.uuids.get(t.permit_id)!;
      const [dup] = await sql`select 1 from tasks where case_id = ${caseId} and permit_id = ${counterpartUuid} and kind = 'department_response'`;
      if (dup) continue;
      const [d] = await sql`select id from departments where name = ${t.department}`;
      await sql`insert into tasks (case_id, permit_id, kind, assignee_role, assignee_department_id, title, due_at, created_at)
                values (${caseId}, ${counterpartUuid}, 'department_response', 'engineer', ${d.id}, ${`Confirm dates or propose an alternative for ${t.permit_id}`}, ${deptDue}, ${at})`;
    }
    await escalate(caseId);
  } else if (result.outcome_status === "review_required") {
    await sql`insert into tasks (permit_id, kind, assignee_role, title, due_at, created_at)
              values (${permitUuid}, 'planner_review', 'planner', ${`Review permit ${permit.permit_id}: ${result.ruleIds.join(", ") || result.gate.reason}`}, ${addHours(at, city.sla_hours.planner_decision)}, ${at})`;
    await escalate(null);
  } else if (result.outcome_status === "blocked") {
    await escalate(null);
  } else if (result.noticeDraft) {
    const n = result.noticeDraft;
    await sql`insert into notices (permit_ids, corridor_id, chainage_start_m, chainage_end_m, starts_on, ends_on, traffic_impact, departments, reference, published_at)
              values (${[permitUuid]}::uuid[], ${n.corridor_id}, ${n.chainage_start_m}, ${n.chainage_end_m}, ${n.starts_on}, ${n.ends_on}, ${n.traffic_impact}, ${n.departments}, ${permit.permit_id}, ${at})`;
    await audit(sql, { at, actor: { user_id: null, role: "system" }, entity: "notice", entity_id: permit.permit_id, action: "notice_published", after: { permit_ids: [permit.permit_id] } });
  }

  return { permit_uuid: permitUuid, result, case_id: caseId, case_ref: caseRef, joined_existing_case: joined };
}
