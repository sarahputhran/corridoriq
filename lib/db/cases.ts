// Read models for the planner queue and the Coordination Case workspace.
import "server-only";
import type { FeatureCollection } from "geojson";
import type { RatingLevels, Strategy } from "@/engine/types";
import { db } from "./client";

export interface CaseListItem {
  id: string;
  case_ref: string;
  title: string;
  status: string;
  criticality_flags: string[];
  rule_count: number;
  permit_count: number;
  sla_due_at: Date | null;
  recommended_strategy: Strategy;
  chainage_start_m: number;
  chainage_end_m: number;
  wards: string[];
  created_at: Date;
}

export async function listCases(): Promise<CaseListItem[]> {
  const rows = await db()`
    select cc.id, cc.case_ref, cc.title, cc.status::text as status, cc.criticality_flags, coalesce(array_length(cc.rule_ids, 1), 0) as rule_count,
           coalesce(array_length(cc.permit_ids, 1), 0) as permit_count, cc.sla_due_at, cc.recommended_strategy::text as recommended_strategy,
           cc.chainage_start_m, cc.chainage_end_m, cc.created_at,
           coalesce((select array_agg(distinct w.ward_name order by w.ward_name) from road_segments s join wards w on w.id = s.ward_id
                      where s.corridor_id = cc.corridor_id and s.chainage_start_m < cc.chainage_end_m and s.chainage_end_m > cc.chainage_start_m), '{}') as wards
    from coordination_cases cc
    order by (cc.status in ('decided', 'closed')), cc.sla_due_at nulls last, cc.case_ref`;
  return rows as unknown as CaseListItem[];
}

export interface CasePermit {
  id: string;
  permit_id: string;
  department: string;
  department_short: string;
  color: string;
  purpose: string;
  status: string;
  road_side: string;
  traffic_impact: string;
  proposed_start: string;
  proposed_end: string;
  trench_depth_m: number;
  trench_length_m: number;
  chainage_start_m: number;
  chainage_end_m: number;
  filed_at: Date;
  conditions: string[];
  is_trigger: boolean;
}

export interface CaseDetail {
  id: string;
  case_ref: string;
  title: string;
  status: string;
  corridor_id: string;
  road_name: string;
  chainage_start_m: number;
  chainage_end_m: number;
  wards: string[];
  spatial_classification: string;
  repeat_opening_classification: string;
  execution_feasibility: string;
  criticality_flags: string[];
  recommended_strategy: Strategy;
  sla_due_at: Date | null;
  created_at: Date;
  buffer_m: number;
  permits: CasePermit[];
  infraZones: { id: string; project_name: string; agency: string; status: string; context_only: boolean }[];
  rules: { rule_id: string; severity: string; action: string; trigger_text: string; reason: string | null }[];
  strategies: { strategy: Strategy; feasible: boolean; recommended: boolean; schedule_shift_days: number; ratings: RatingLevels; conditions: string[]; rationale: string }[];
  decisions: { id: string; chosen_strategy: Strategy; is_override: boolean; override_reason: string | null; made_at: Date; maker: string | null; checked_at: Date | null; checker: string | null; checker_note: string | null; checker_approved: boolean | null }[];
  tasks: { id: string; kind: string; title: string; assignee_role: string; department: string | null; due_at: Date | null; status: string; escalated_at: Date | null; completed_at: Date | null; response: { action?: string; note?: string; proposed_start?: string; proposed_end?: string } | null; permit_id: string | null }[];
  audit: { id: number; at: Date; actor: string | null; actor_role: string; entity: string; entity_id: string; action: string; after: Record<string, unknown> | null }[];
  facilities: { id: string; name: string | null; type: string; distance_m: number }[];
  busRouteNames: string[];
  notice_id: string | null;
  explanation: { text: string; citations: unknown; provider: string; model: string | null; validated: boolean } | null;
  map: { bounds: [number, number, number, number]; layers: Record<string, FeatureCollection> };
}

export async function getCaseDetail(caseRef: string): Promise<CaseDetail | null> {
  const sql = db();
  const [c] = await sql`
    select cc.*, cc.status::text as status_text, cc.recommended_strategy::text as rec, co.road_name,
           coalesce((select (params->>'buffer_m')::numeric from rules where rule_id = 'CORRIDOR_FACILITY_CRITICALITY_GATE' and city_id = co.city_id), 200) as buffer_m,
           coalesce((select array_agg(distinct w.ward_name order by w.ward_name) from road_segments s join wards w on w.id = s.ward_id
                      where s.corridor_id = cc.corridor_id and s.chainage_start_m < cc.chainage_end_m and s.chainage_end_m > cc.chainage_start_m), '{}') as wards
    from coordination_cases cc join corridors co on co.id = cc.corridor_id where cc.case_ref = ${caseRef}`;
  if (!c) return null;
  const permitIds = c.permit_ids as string[];
  const buffer = c.buffer_m as number;

  const [permits, infraZones, rules, strategies, decisions, tasks, audit, facilities, busRoutes, [notice], [explanation], [geo]] = await Promise.all([
    sql`select p.id, p.permit_id, d.name as department, d.short as department_short, d.color, p.purpose, p.status::text as status, p.road_side, p.traffic_impact,
               to_char(p.proposed_start, 'YYYY-MM-DD') as proposed_start, to_char(p.proposed_end, 'YYYY-MM-DD') as proposed_end, p.trench_depth_m, p.trench_length_m,
               p.chainage_start_m, p.chainage_end_m, p.filed_at, p.conditions, (p.id = ${c.triggering_permit_id}) as is_trigger
        from permits p join departments d on d.id = p.department_id where p.id = any(${permitIds}::uuid[]) order by p.filed_at, p.permit_id`,
    sql`select id, project_name, agency, status, context_only from infra_zones where id = any(${c.infra_zone_ids as string[]}) order by id`,
    sql`select rule_id, severity, action, trigger_text, reason from rules where rule_id = any(${c.rule_ids as string[]}) order by rule_id`,
    sql`select strategy::text as strategy, feasible, recommended, schedule_shift_days, ratings, conditions, rationale from strategy_options where case_id = ${c.id} order by id`,
    sql`select d.id, d.chosen_strategy::text as chosen_strategy, d.is_override, d.override_reason, d.made_at, m.display_name as maker, d.checked_at, k.display_name as checker,
               d.checker_note, d.checker_approved
        from decisions d left join profiles m on m.user_id = d.maker_user_id left join profiles k on k.user_id = d.checker_user_id
        where d.case_id = ${c.id} order by d.created_at`,
    sql`select t.id, t.kind, t.title, t.assignee_role::text as assignee_role, d.name as department, t.due_at, t.status, t.escalated_at, t.completed_at, t.response, p.permit_id
        from tasks t left join departments d on d.id = t.assignee_department_id left join permits p on p.id = t.permit_id
        where t.case_id = ${c.id} order by t.created_at, t.id`,
    sql`select a.id, a.at, pr.display_name as actor, a.actor_role, a.entity, a.entity_id, a.action, a.after
        from audit_log a left join profiles pr on pr.user_id = a.actor_user_id
        where (a.entity = 'case' and a.entity_id = ${caseRef}) or (a.entity = 'notice' and a.entity_id = ${caseRef})
           or (a.entity = 'permit' and a.entity_id in (select permit_id from permits where id = any(${permitIds}::uuid[])))
           or (a.entity = 'task' and a.entity_id in (select id::text from tasks where case_id = ${c.id}))
        order by a.at, a.id`,
    sql`with t as (select st_collect(geom)::geography as g from permits where id = any(${permitIds}::uuid[]) and status <> 'completed')
        select f.id, f.name, f.type, round(st_distance(f.geom::geography, t.g)::numeric) as distance_m
        from facilities f, t where f.type <> 'bus_stop' and st_dwithin(f.geom::geography, t.g, ${buffer}) order by distance_m, f.id`,
    sql`with t as (select st_collect(geom)::geography as g from permits where id = any(${permitIds}::uuid[]) and status <> 'completed')
        select distinct r.route_name from bus_routes r, t where st_dwithin(r.geom::geography, t.g, ${buffer}) order by r.route_name`,
    sql`select id from notices where case_id = ${c.id} order by published_at desc limit 1`,
    sql`select text, citations, provider, model, validated from ai_explanations where case_id = ${c.id}`,
    sql`
      with live as (select * from permits where id = any(${permitIds}::uuid[])),
      area as (select st_buffer(st_collect(geom)::geography, ${buffer})::geometry as g from live where status <> 'completed'),
      view as (select st_buffer(st_collect(geom)::geography, ${buffer} + 120)::geometry as g from live where status <> 'completed')
      select
        (select jsonb_build_array(st_xmin(g), st_ymin(g), st_xmax(g), st_ymax(g)) from view) as bounds,
        (select jsonb_agg(jsonb_build_object('type','Feature','geometry',st_asgeojson(geom, 6)::jsonb,'properties',jsonb_build_object('id', id))) from corridors where id = ${c.corridor_id}) as corridor,
        (select jsonb_agg(jsonb_build_object('type','Feature','geometry',st_asgeojson(g, 6)::jsonb,'properties','{}'::jsonb)) from area) as buffer,
        (select jsonb_agg(jsonb_build_object('type','Feature','geometry',st_asgeojson(p.geom, 6)::jsonb,'properties',
            jsonb_build_object('permit_id', p.permit_id, 'department', d.name, 'color', d.color, 'purpose', p.purpose, 'status', p.status, 'road_side', p.road_side,
              'proposed_start', p.proposed_start, 'proposed_end', p.proposed_end, 'chainage_start_m', p.chainage_start_m, 'chainage_end_m', p.chainage_end_m,
              'offset', case p.road_side when 'left' then -7 when 'right' then 7 else 0 end)) order by p.permit_id)
           from live p join departments d on d.id = p.department_id) as permits,
        (select jsonb_agg(jsonb_build_object('type','Feature','geometry',st_asgeojson(f.geom, 6)::jsonb,'properties',
            jsonb_build_object('id', f.id, 'name', f.name, 'type', f.type,
              'label', case when f.type in ('hospital','clinic','school') then f.name end,
              'letter', case f.type when 'hospital' then 'H' when 'clinic' then 'C' when 'school' then 'S' when 'place_of_worship' then 'W'
                          when 'police' then 'P' when 'fire_station' then 'F' else '' end)) order by f.id)
           from facilities f, area where f.type <> 'bus_stop' and st_contains(area.g, f.geom)) as facilities,
        (select jsonb_agg(jsonb_build_object('type','Feature','geometry',st_asgeojson(b.geom, 6)::jsonb,'properties',jsonb_build_object('id', b.id, 'stop_name', b.stop_name)) order by b.id)
           from bus_stops b, area where st_contains(area.g, b.geom)) as bus_stops,
        (select jsonb_agg(jsonb_build_object('type','Feature','geometry',st_asgeojson(z.geom, 6)::jsonb,'properties',
            jsonb_build_object('id', z.id, 'project_name', z.project_name, 'agency', z.agency, 'status', z.status, 'context_only', z.context_only)) order by z.id)
           from infra_zones z where z.id = any(${c.infra_zone_ids as string[]}) and z.geom is not null) as infra`,
  ]);

  const fc = (features: unknown): FeatureCollection => ({ type: "FeatureCollection", features: (features as FeatureCollection["features"]) ?? [] });
  return {
    id: c.id as string,
    case_ref: c.case_ref as string,
    title: c.title as string,
    status: c.status_text as string,
    corridor_id: c.corridor_id as string,
    road_name: c.road_name as string,
    chainage_start_m: c.chainage_start_m as number,
    chainage_end_m: c.chainage_end_m as number,
    wards: c.wards as string[],
    spatial_classification: c.spatial_classification as string,
    repeat_opening_classification: c.repeat_opening_classification as string,
    execution_feasibility: c.execution_feasibility as string,
    criticality_flags: c.criticality_flags as string[],
    recommended_strategy: c.rec as Strategy,
    sla_due_at: c.sla_due_at as Date | null,
    created_at: c.created_at as Date,
    buffer_m: buffer,
    permits: permits as unknown as CaseDetail["permits"],
    infraZones: infraZones as unknown as CaseDetail["infraZones"],
    rules: rules as unknown as CaseDetail["rules"],
    strategies: strategies as unknown as CaseDetail["strategies"],
    decisions: decisions as unknown as CaseDetail["decisions"],
    tasks: tasks as unknown as CaseDetail["tasks"],
    audit: audit as unknown as CaseDetail["audit"],
    facilities: facilities as unknown as CaseDetail["facilities"],
    busRouteNames: busRoutes.map((r) => r.route_name as string),
    notice_id: (notice?.id as string) ?? null,
    explanation: (explanation as unknown as CaseDetail["explanation"]) ?? null,
    map: {
      bounds: geo.bounds as [number, number, number, number],
      layers: { corridor: fc(geo.corridor), buffer: fc(geo.buffer), permits: fc(geo.permits), facilities: fc(geo.facilities), busStops: fc(geo.bus_stops), infraZones: fc(geo.infra) },
    },
  };
}
