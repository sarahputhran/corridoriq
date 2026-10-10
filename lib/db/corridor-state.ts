// Loads what the engine needs from the database. All spatial SQL lives here; the engine itself stays pure.
// The output shape must match engine/__tests__/fixtures/pune.json.
import type { LineString } from "geojson";
import { pune } from "@/config/cities/pune";
import type { CityConfig, CorridorState, PermitInput, RuleRecord } from "@/engine/types";
import type { Sql } from "./connection";

/** Permits in these states are not works that will happen, so they are not counterparts. */
const NOT_COUNTERPARTS = ["draft", "rejected", "blocked"];

export interface PermitRow {
  id: string;
  permit_id: string;
  department: string;
  department_id: string;
  purpose: string;
  work_type: "routine" | "emergency_fault";
  in_annual_programme: boolean;
  fault_sanctioned: boolean;
  proposed_start: string;
  proposed_end: string;
  trench_depth_m: number;
  trench_width_m: number;
  road_side: PermitInput["road_side"];
  traffic_impact: string;
  status: string;
  corridor_id: string | null;
  chainage_start_m: number;
  chainage_end_m: number;
  trench_length_m: number;
  snap_offset_m: number;
}

export const PERMIT_COLUMNS = `
  p.id, p.permit_id, d.name as department, p.department_id, p.purpose, p.work_type, p.in_annual_programme, p.fault_sanctioned,
  to_char(p.proposed_start, 'YYYY-MM-DD') as proposed_start, to_char(p.proposed_end, 'YYYY-MM-DD') as proposed_end,
  p.trench_depth_m, p.trench_width_m, p.road_side, p.traffic_impact, p.status::text as status, p.corridor_id,
  p.chainage_start_m, p.chainage_end_m, p.trench_length_m, coalesce(p.snap_offset_m, 0) as snap_offset_m`;

export function toPermitInput(row: PermitRow): PermitInput {
  return {
    permit_id: row.permit_id,
    department: row.department,
    purpose: row.purpose,
    work_type: row.work_type,
    in_annual_programme: row.in_annual_programme,
    fault_sanctioned: row.fault_sanctioned,
    proposed_start: row.proposed_start,
    proposed_end: row.proposed_end,
    trench_depth_m: row.trench_depth_m,
    trench_width_m: row.trench_width_m,
    road_side: row.road_side,
    traffic_impact: row.traffic_impact,
    status: row.status,
    corridor_id: row.corridor_id,
    chainage_start_m: row.chainage_start_m,
    chainage_end_m: row.chainage_end_m,
    trench_length_m: row.trench_length_m,
    snap_offset_m: row.snap_offset_m,
  };
}

export interface LoadedState {
  state: CorridorState;
  /** permit_id → database uuid, for every counterpart permit. */
  uuids: Map<string, string>;
}

/**
 * @param corridorId corridor the new permit snapped to
 * @param trench the new permit's snapped trench line
 * @param excludePermitUuid the new permit itself, when it is already stored
 */
export async function loadCorridorState(sql: Sql, corridorId: string, trench: LineString, excludePermitUuid: string | null): Promise<LoadedState> {
  const geom = JSON.stringify(trench);
  const [corridor] = await sql`select id, road_name, length_m from corridors where id = ${corridorId}`;
  if (!corridor) throw new Error(`Corridor ${corridorId} not found`);

  const permits = await sql.unsafe<PermitRow[]>(
    `select ${PERMIT_COLUMNS} from permits p join departments d on d.id = p.department_id
     where p.corridor_id = $1 and p.status::text <> all($2) and ($3::uuid is null or p.id <> $3::uuid)
     order by p.permit_id`,
    [corridorId, NOT_COUNTERPARTS, excludePermitUuid],
  );
  const restorations = await sql`
    select id, chainage_start_m, chainage_end_m, to_char(completed_on, 'YYYY-MM-DD') as completed_on, surface, protected
    from restorations where corridor_id = ${corridorId} order by id`;
  const infraZones = await sql`
    select id, project_name, agency, status, to_char(start_date, 'YYYY-MM-DD') as start_date, to_char(end_date, 'YYYY-MM-DD') as end_date,
           context_only, chainage_start_m, chainage_end_m
    from infra_zones where corridor_id = ${corridorId} and chainage_start_m is not null order by id`;
  const facilities = await sql`
    with t as (select st_setsrid(st_geomfromgeojson(${geom}), 4326)::geography as g)
    select f.id, f.name, f.type, round(st_distance(f.geom::geography, t.g)::numeric, 1) as distance_m
    from facilities f, t where st_dwithin(f.geom::geography, t.g, ${pune.context_radius_m})
    order by distance_m, f.id`;
  const busRoutes = await sql`
    with t as (select st_setsrid(st_geomfromgeojson(${geom}), 4326)::geography as g)
    select r.id, r.route_name, round(st_distance(r.geom::geography, t.g)::numeric, 1) as distance_m
    from bus_routes r, t where st_dwithin(r.geom::geography, t.g, ${pune.context_radius_m})
    order by distance_m, r.id`;

  return {
    state: {
      corridor: corridor as CorridorState["corridor"],
      permits: permits.map(toPermitInput),
      restorations: restorations as unknown as CorridorState["restorations"],
      infraZones: infraZones as unknown as CorridorState["infraZones"],
      facilities: facilities as unknown as CorridorState["facilities"],
      busRoutes: busRoutes as unknown as CorridorState["busRoutes"],
    },
    uuids: new Map(permits.map((p) => [p.permit_id, p.id])),
  };
}

/** Rules come from the database, so an Admin edit takes effect on the next evaluation. */
export async function loadCityConfig(sql: Sql, cityId: string = pune.city_id): Promise<CityConfig> {
  const rules = await sql<RuleRecord[]>`
    select rule_id, action, severity, trigger_text, params, enabled from rules where city_id = ${cityId} order by rule_id`;
  const [city] = await sql`select config from cities where id = ${cityId}`;
  const config = (city?.config ?? {}) as Partial<Pick<CityConfig, "sla_hours" | "schedule_cost_days" | "defer_buffer_days" | "snap_tolerance_m">>;
  return {
    city_id: cityId,
    rules: [...rules],
    snap_tolerance_m: config.snap_tolerance_m ?? pune.snap_tolerance_m,
    sla_hours: config.sla_hours ?? pune.sla_hours,
    schedule_cost_days: config.schedule_cost_days ?? pune.schedule_cost_days,
    defer_buffer_days: config.defer_buffer_days ?? pune.defer_buffer_days,
  };
}
