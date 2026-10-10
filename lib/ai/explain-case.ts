// Builds a case's fact sheet from the database, gets an explanation through the adapter and caches it.
// Called once when a case is created or its strategy table changes, and on an explicit "Regenerate". Never on page view.
import type { Sql } from "@/lib/db/connection";
import { explain, type Explanation } from "./adapter";
import { buildFactSheet, factIndex, type FactSheet } from "./factsheet";

export async function loadFactSheet(sql: Sql, caseId: string): Promise<FactSheet | null> {
  const [c] = await sql`
    select cc.id, cc.case_ref, cc.permit_ids, cc.infra_zone_ids, cc.rule_ids, cc.triggering_permit_id, cc.chainage_start_m, cc.chainage_end_m, co.road_name,
           coalesce((select (params->>'buffer_m')::numeric from rules where rule_id = 'CORRIDOR_FACILITY_CRITICALITY_GATE' and city_id = co.city_id), 200) as buffer_m
    from coordination_cases cc join corridors co on co.id = cc.corridor_id where cc.id = ${caseId}`;
  if (!c) return null;
  const permitIds = c.permit_ids as string[];
  const buffer = c.buffer_m as number;
  const permits = await sql`
    select p.permit_id, d.name as department, p.purpose, to_char(p.proposed_start, 'YYYY-MM-DD') as proposed_start, to_char(p.proposed_end, 'YYYY-MM-DD') as proposed_end,
           p.road_side, p.chainage_start_m, p.chainage_end_m, p.status::text as status, (p.id = ${c.triggering_permit_id}) as is_trigger
    from permits p join departments d on d.id = p.department_id where p.id = any(${permitIds}::uuid[]) order by p.filed_at, p.permit_id`;
  const facilities = await sql`
    with t as (select st_collect(geom)::geography as g from permits where id = any(${permitIds}::uuid[]) and status <> 'completed')
    select f.name, f.type, round(st_distance(f.geom::geography, t.g)::numeric) as distance_m
    from facilities f, t where f.type <> 'bus_stop' and st_dwithin(f.geom::geography, t.g, ${buffer}) order by distance_m, f.id`;
  const routes = await sql`
    with t as (select st_collect(geom)::geography as g from permits where id = any(${permitIds}::uuid[]) and status <> 'completed')
    select r.route_name from bus_routes r, t where st_dwithin(r.geom::geography, t.g, ${buffer}) order by r.route_name, r.id`;
  const zones = await sql`select project_name, agency, status from infra_zones where id = any(${c.infra_zone_ids as string[]}) order by id`;
  const rules = await sql`select rule_id, trigger_text, action from rules where rule_id = any(${c.rule_ids as string[]}) order by rule_id`;
  const strategies = await sql`select strategy::text as strategy, recommended, feasible, schedule_shift_days, ratings, conditions from strategy_options where case_id = ${caseId} order by id`;

  return buildFactSheet({
    case_ref: c.case_ref as string,
    road_name: c.road_name as string,
    chainage_start_m: c.chainage_start_m as number,
    chainage_end_m: c.chainage_end_m as number,
    buffer_m: buffer,
    permits: permits as never,
    facilities: facilities as never,
    busRouteNames: routes.map((r) => r.route_name as string),
    infraZones: zones as never,
    rules: rules as never,
    strategies: strategies as never,
  });
}

/** Generates and stores the explanation. Returns null when the case does not exist. */
export async function generateExplanation(sql: Sql, caseId: string): Promise<Explanation | null> {
  const sheet = await loadFactSheet(sql, caseId);
  if (!sheet) return null;
  const result = await explain(sheet);
  const index = factIndex(sheet);
  // Stored with each cited fact's label, so the page can show what a chip refers to without rebuilding the sheet.
  const citations = result.citations.map((id) => ({ id, ...(index.get(id) ?? { label: id, anchor: "rules" }) }));
  await sql`
    insert into ai_explanations (case_id, text, citations, provider, model, validated, created_at)
    values (${caseId}, ${result.text}, ${sql.json(citations as never)}, ${result.provider}, ${result.model}, ${result.validated}, now())
    on conflict (case_id) do update set text = excluded.text, citations = excluded.citations, provider = excluded.provider,
      model = excluded.model, validated = excluded.validated, created_at = excluded.created_at`;
  return result;
}
