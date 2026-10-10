// Read model for the corridor time-space view: where and when every work happens along the road.
import "server-only";
import { db } from "./client";

export interface TimeSpacePermit {
  permit_id: string;
  department: string;
  short: string;
  color: string;
  purpose: string;
  status: string;
  road_side: string;
  start: string;
  end: string;
  chainage_start_m: number;
  chainage_end_m: number;
  case_ref: string | null;
}

export interface TimeSpaceData {
  corridor: { id: string; road_name: string; start_label: string; end_label: string; length_m: number };
  permits: TimeSpacePermit[];
  restorations: { id: string; chainage_start_m: number; chainage_end_m: number; completed_on: string; surface: string; protected: boolean }[];
  zones: { id: string; project_name: string; status: string; context_only: boolean; start_date: string | null; end_date: string | null; chainage_start_m: number; chainage_end_m: number }[];
  cases: { case_ref: string; title: string; status: string; permit_ids: string[]; infra: string[]; flags: string[]; repeat: string; departments: string[] }[];
  monsoon: { start_mmdd: string; end_mmdd: string; enabled: boolean };
  window_months: { restored: number; moratorium: number };
}

export async function getTimeSpaceData(corridorId: string): Promise<TimeSpaceData | null> {
  const sql = db();
  const [corridor] = await sql`select id, city_id, road_name, start_label, end_label, length_m from corridors where id = ${corridorId}`;
  if (!corridor) return null;
  const [permits, restorations, zones, cases, rules] = await Promise.all([
    sql`select p.permit_id, d.name as department, d.short, d.color, p.purpose, p.status::text as status, p.road_side,
               to_char(p.proposed_start, 'YYYY-MM-DD') as start, to_char(p.proposed_end, 'YYYY-MM-DD') as "end", p.chainage_start_m, p.chainage_end_m,
               (select cc.case_ref from coordination_cases cc where p.id = any(cc.permit_ids) order by cc.created_at desc limit 1) as case_ref
        from permits p join departments d on d.id = p.department_id
        where p.corridor_id = ${corridorId} and p.status <> 'draft' order by p.proposed_start, p.permit_id`,
    sql`select id, chainage_start_m, chainage_end_m, to_char(completed_on, 'YYYY-MM-DD') as completed_on, surface, protected from restorations where corridor_id = ${corridorId} order by id`,
    sql`select id, project_name, status, context_only, to_char(start_date, 'YYYY-MM-DD') as start_date, to_char(end_date, 'YYYY-MM-DD') as end_date, chainage_start_m, chainage_end_m
        from infra_zones where corridor_id = ${corridorId} and chainage_start_m is not null order by id`,
    sql`select cc.case_ref, cc.title, cc.status::text as status, cc.criticality_flags as flags, cc.repeat_opening_classification as repeat,
               (select array_agg(p.permit_id order by p.permit_id) from permits p where p.id = any(cc.permit_ids)) as permit_ids,
               (select array_agg(distinct d.short) from permits p join departments d on d.id = p.department_id where p.id = any(cc.permit_ids) and p.status <> 'completed') as departments,
               coalesce((select array_agg(z.project_name order by z.id) from infra_zones z where z.id = any(cc.infra_zone_ids)), '{}') as infra
        from coordination_cases cc where cc.corridor_id = ${corridorId} order by cc.case_ref`,
    sql`select rule_id, params, enabled from rules where city_id = ${corridor.city_id} and rule_id in ('PMC_MONSOON_5M', 'CORRIDOR_RESTORED_12M', 'CORRIDOR_CRITICAL_MORATORIUM')`,
  ]);
  const rule = (id: string) => rules.find((r) => r.rule_id === id);
  const monsoon = rule("PMC_MONSOON_5M");
  return {
    corridor: corridor as unknown as TimeSpaceData["corridor"],
    permits: permits as unknown as TimeSpacePermit[],
    restorations: restorations as unknown as TimeSpaceData["restorations"],
    zones: zones as unknown as TimeSpaceData["zones"],
    cases: cases as unknown as TimeSpaceData["cases"],
    monsoon: { start_mmdd: (monsoon?.params?.start_mmdd as string) ?? "04-30", end_mmdd: (monsoon?.params?.end_mmdd as string) ?? "09-30", enabled: Boolean(monsoon?.enabled) },
    window_months: { restored: Number(rule("CORRIDOR_RESTORED_12M")?.params?.months ?? 12), moratorium: Number(rule("CORRIDOR_CRITICAL_MORATORIUM")?.params?.months ?? 36) },
  };
}
