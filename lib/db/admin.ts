// Read models for Admin, Approvals and the Dashboard.
import "server-only";
import { db } from "./client";

export interface RuleRow {
  rule_id: string;
  category: string;
  provenance: string;
  trigger_text: string;
  action: string;
  severity: string;
  threshold_text: string | null;
  source: string;
  params: unknown;
  enabled: boolean;
  hits: number;
}

export async function listRules(): Promise<RuleRow[]> {
  const rows = await db()`
    select r.rule_id, r.category, r.provenance, r.trigger_text, r.action, r.severity, r.threshold_text, r.source, r.params, r.enabled,
           (select count(*)::int from rule_hits h where h.rule_id = r.rule_id and h.fired) as hits
    from rules r where r.city_id = 'pune' order by r.rule_id`;
  return rows as unknown as RuleRow[];
}

export interface SegmentRow {
  id: string;
  seq: number;
  chainage_start_m: number;
  chainage_end_m: number;
  classification: string;
  width_m: number;
  surface: string;
  protected: boolean;
  ward: string | null;
  admin_zone: string | null;
  permits: number;
}

export async function listSegments(): Promise<SegmentRow[]> {
  const rows = await db()`
    select s.id, s.seq, s.chainage_start_m, s.chainage_end_m, s.classification, s.width_m, s.surface, s.protected, w.ward_name as ward, s.admin_zone,
           (select count(*)::int from permits p where p.corridor_id = s.corridor_id and p.status <> 'draft' and p.chainage_start_m < s.chainage_end_m and p.chainage_end_m > s.chainage_start_m) as permits
    from road_segments s left join wards w on w.id = s.ward_id order by s.seq`;
  return rows as unknown as SegmentRow[];
}

export interface GrievanceRow {
  id: string;
  reference: string | null;
  notice_id: string | null;
  message: string;
  name: string | null;
  created_at: Date;
}

export async function listGrievances(): Promise<GrievanceRow[]> {
  const rows = await db()`
    select g.id, n.reference, g.notice_id, g.message, g.name, g.created_at from grievances g left join notices n on n.id = g.notice_id order by g.created_at desc limit 50`;
  return rows as unknown as GrievanceRow[];
}

export interface ApprovalRow {
  case_ref: string;
  title: string;
  chosen_strategy: string;
  is_override: boolean;
  override_reason: string | null;
  maker: string | null;
  made_at: Date;
  sla_due_at: Date | null;
}

export async function listPendingApprovals(): Promise<ApprovalRow[]> {
  const rows = await db()`
    select cc.case_ref, cc.title, d.chosen_strategy::text as chosen_strategy, d.is_override, d.override_reason, m.display_name as maker, d.made_at, cc.sla_due_at
    from coordination_cases cc
    join lateral (select * from decisions where case_id = cc.id and checked_at is null order by created_at desc limit 1) d on true
    left join profiles m on m.user_id = d.maker_user_id
    where cc.status = 'awaiting_checker' order by cc.sla_due_at nulls last`;
  return rows as unknown as ApprovalRow[];
}

export interface EscalationRow {
  id: string;
  kind: string;
  title: string;
  status: string;
  due_at: Date | null;
  escalated_at: Date | null;
  case_ref: string | null;
  department: string | null;
}

/** Tasks that have breached their SLA, plus tasks that are overdue now and will be escalated on the next run. */
export async function listEscalations(now: Date): Promise<{ escalated: EscalationRow[]; overdue: EscalationRow[] }> {
  const rows = await db()`
    select t.id, t.kind, t.title, t.status, t.due_at, t.escalated_at, cc.case_ref, d.name as department
    from tasks t left join coordination_cases cc on cc.id = t.case_id left join departments d on d.id = t.assignee_department_id
    where t.escalated_at is not null or t.kind in ('escalation', 'sla_breach') or (t.status = 'open' and t.due_at < ${now})
    order by t.due_at nulls last, t.created_at`;
  const all = rows as unknown as EscalationRow[];
  return {
    escalated: all.filter((t) => t.escalated_at || t.kind === "escalation" || t.kind === "sla_breach"),
    overdue: all.filter((t) => !t.escalated_at && t.kind !== "escalation" && t.kind !== "sla_breach"),
  };
}

export interface DashboardData {
  wards: { ward: string; evaluated: number; coordinated: number }[];
  repeatOpeningsAvoided: { count: number; decided: number };
  notices: { combined: number; combinedPermits: number; single: number };
  turnaround: { medianHours: number | null; decided: number; escalations: number };
  audit: { complete: number; total: number };
  ruleActivity: { rule_id: string; hits: number }[];
  totals: { evaluations: number; ruleHits: number; cases: number };
}

/** Every number here is counted from records in this demo. Nothing is projected. */
export async function getDashboardData(): Promise<DashboardData> {
  const sql = db();
  const [wards, [repeat], [notices], [turnaround], [audit], ruleActivity, [totals]] = await Promise.all([
    sql`select coalesce(w.ward_name, 'Ward not resolved') as ward, count(*)::int as evaluated,
               count(*) filter (where exists (select 1 from coordination_cases cc where p.id = any(cc.permit_ids)))::int as coordinated
        from permits p
        join lateral (select ward_id from road_segments s where s.corridor_id = p.corridor_id
                        and s.chainage_start_m <= (p.chainage_start_m + p.chainage_end_m) / 2 and s.chainage_end_m >= (p.chainage_start_m + p.chainage_end_m) / 2
                      order by s.seq limit 1) seg on true
        left join wards w on w.id = seg.ward_id
        where exists (select 1 from evaluations e where e.permit_id = p.id)
        group by 1 order by 1`,
    sql`select count(*) filter (where d.chosen_strategy in ('JOINT_EXECUTION', 'RESEQUENCE_WORKS'))::int as count, count(*)::int as decided
        from decisions d where d.checker_approved`,
    sql`select count(*) filter (where case_id is not null and array_length(permit_ids, 1) > 1)::int as combined,
               coalesce(sum(array_length(permit_ids, 1)) filter (where case_id is not null and array_length(permit_ids, 1) > 1), 0)::int as "combinedPermits",
               count(*) filter (where case_id is null or array_length(permit_ids, 1) = 1)::int as single
        from notices`,
    sql`select (select percentile_cont(0.5) within group (order by extract(epoch from (d.checked_at - cc.created_at)) / 3600)
                  from decisions d join coordination_cases cc on cc.id = d.case_id where d.checker_approved) as "medianHours",
               (select count(*)::int from decisions where checker_approved) as decided,
               (select count(*)::int from tasks where escalated_at is not null) as escalations`,
    sql`select count(*)::int as total,
               count(*) filter (where coalesce(array_length(cc.rule_ids, 1), 0) > 0 and d.chosen_strategy is not null and d.maker_user_id is not null
                 and d.checker_user_id is not null and (not d.is_override or length(coalesce(d.override_reason, '')) >= 15))::int as complete
        from decisions d join coordination_cases cc on cc.id = d.case_id where d.checker_approved`,
    sql`select rule_id, count(*)::int as hits from rule_hits where fired group by rule_id order by hits desc, rule_id`,
    sql`select (select count(*)::int from evaluations) as evaluations, (select count(*)::int from rule_hits where fired) as "ruleHits",
               (select count(*)::int from coordination_cases) as cases`,
  ]);
  return {
    wards: wards as unknown as DashboardData["wards"],
    repeatOpeningsAvoided: repeat as unknown as DashboardData["repeatOpeningsAvoided"],
    notices: notices as unknown as DashboardData["notices"],
    turnaround: { medianHours: turnaround.medianHours == null ? null : Number(turnaround.medianHours), decided: turnaround.decided as number, escalations: turnaround.escalations as number },
    audit: audit as unknown as DashboardData["audit"],
    ruleActivity: ruleActivity as unknown as DashboardData["ruleActivity"],
    totals: totals as unknown as DashboardData["totals"],
  };
}
