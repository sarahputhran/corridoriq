// Task inbox and permit list read models.
import "server-only";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "./client";

export interface TaskItem {
  id: string;
  kind: string;
  title: string;
  status: string;
  due_at: Date | null;
  escalated_at: Date | null;
  completed_at: Date | null;
  case_ref: string | null;
  case_title: string | null;
  permit_id: string | null;
  permit_start: string | null;
  permit_end: string | null;
  department: string | null;
  response: { action?: string; note?: string; proposed_start?: string; proposed_end?: string } | null;
}

/** Tasks addressed to this persona: by role, and for engineers by department. Admin sees everything. */
export async function listTasks(user: SessionUser): Promise<TaskItem[]> {
  const sql = db();
  const rows = await sql`
    select t.id, t.kind, t.title, t.status, t.due_at, t.escalated_at, t.completed_at, cc.case_ref, cc.title as case_title,
           p.permit_id, to_char(p.proposed_start, 'YYYY-MM-DD') as permit_start, to_char(p.proposed_end, 'YYYY-MM-DD') as permit_end,
           d.name as department, t.response
    from tasks t
    left join coordination_cases cc on cc.id = t.case_id
    left join permits p on p.id = t.permit_id
    left join departments d on d.id = t.assignee_department_id
    where ${user.role === "admin" ? sql`true` : sql`t.assignee_role = ${user.role}::user_role and (t.assignee_department_id is null or t.assignee_department_id = ${user.department_id})`}
    order by (t.status <> 'open'), t.due_at nulls last, t.created_at`;
  return rows as unknown as TaskItem[];
}

export interface PermitListItem {
  permit_id: string;
  department: string;
  color: string;
  purpose: string;
  status: string;
  proposed_start: string;
  proposed_end: string;
  chainage_start_m: number;
  chainage_end_m: number;
  road_side: string;
  filed_at: Date | null;
  case_ref: string | null;
  decision: string | null;
  rule_ids: string[];
}

export async function listPermits(departmentId: string | null): Promise<PermitListItem[]> {
  const sql = db();
  const rows = await sql`
    select p.permit_id, d.name as department, d.color, p.purpose, p.status::text as status,
           to_char(p.proposed_start, 'YYYY-MM-DD') as proposed_start, to_char(p.proposed_end, 'YYYY-MM-DD') as proposed_end,
           p.chainage_start_m, p.chainage_end_m, p.road_side, p.filed_at,
           (select cc.case_ref from coordination_cases cc where p.id = any(cc.permit_ids) order by cc.created_at desc limit 1) as case_ref,
           e.decision::text as decision, coalesce(e.rule_ids, '{}') as rule_ids
    from permits p join departments d on d.id = p.department_id
    left join lateral (select decision, rule_ids from evaluations where permit_id = p.id order by ran_at desc limit 1) e on true
    where ${departmentId ? sql`p.department_id = ${departmentId}` : sql`true`}
    order by p.filed_at desc nulls last, p.permit_id desc`;
  return rows as unknown as PermitListItem[];
}
