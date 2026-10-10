// Public read models: published notices and the works behind them. No login is needed to read these.
import "server-only";
import type { FeatureCollection } from "geojson";
import type { NoticeData } from "@/lib/notices/types";
import { db } from "./client";

export interface NoticeDetail extends NoticeData {
  published_at: Date;
  map: { bounds: [number, number, number, number]; layers: Record<string, FeatureCollection> };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getNotice(id: string): Promise<NoticeDetail | null> {
  if (!UUID.test(id)) return null;
  const sql = db();
  const [n] = await sql`
    select n.id, n.reference, n.permit_ids, n.corridor_id, n.chainage_start_m, n.chainage_end_m, to_char(n.starts_on, 'YYYY-MM-DD') as starts_on,
           to_char(n.ends_on, 'YYYY-MM-DD') as ends_on, n.traffic_impact, n.departments, n.published_at, co.road_name,
           coalesce((select d.chosen_strategy = 'JOINT_EXECUTION' from decisions d where d.case_id = n.case_id and d.checker_approved order by d.checked_at desc limit 1), false) as joint,
           coalesce((select (params->>'buffer_m')::numeric from rules where rule_id = 'CORRIDOR_FACILITY_CRITICALITY_GATE' and city_id = co.city_id), 200) as buffer_m
    from notices n join corridors co on co.id = n.corridor_id where n.id = ${id}`;
  if (!n) return null;
  const permitIds = n.permit_ids as string[];
  const [works, [facility], [stop], [geo]] = await Promise.all([
    sql`select p.permit_id, d.name as department, p.purpose, p.road_side from permits p join departments d on d.id = p.department_id
        where p.id = any(${permitIds}::uuid[]) order by p.proposed_start, p.permit_id`,
    sql`with t as (select st_collect(geom)::geography as g from permits where id = any(${permitIds}::uuid[]))
        select f.name from facilities f, t where f.type in ('hospital', 'clinic', 'school') and f.name is not null and st_dwithin(f.geom::geography, t.g, ${n.buffer_m})
        order by (f.type = 'hospital') desc, st_distance(f.geom::geography, t.g) limit 1`,
    sql`with t as (select st_centroid(st_collect(geom))::geography as g from permits where id = any(${permitIds}::uuid[]))
        select b.stop_name from bus_stops b, t where st_dwithin(b.geom::geography, t.g, 400) order by st_distance(b.geom::geography, t.g) limit 1`,
    sql`with live as (select p.*, d.name as department, d.color from permits p join departments d on d.id = p.department_id where p.id = any(${permitIds}::uuid[])),
        view as (select st_buffer(st_collect(geom)::geography, 180)::geometry as g from live)
        select (select jsonb_build_array(st_xmin(g), st_ymin(g), st_xmax(g), st_ymax(g)) from view) as bounds,
          (select jsonb_agg(jsonb_build_object('type','Feature','geometry',st_asgeojson(geom, 6)::jsonb,'properties','{}'::jsonb)) from corridors where id = ${n.corridor_id}) as corridor,
          (select jsonb_agg(jsonb_build_object('type','Feature','geometry',st_asgeojson(geom, 6)::jsonb,'properties',
             jsonb_build_object('permit_id', permit_id, 'department', department, 'color', color, 'purpose', purpose, 'status', status, 'road_side', road_side,
               'proposed_start', proposed_start, 'proposed_end', proposed_end, 'chainage_start_m', chainage_start_m, 'chainage_end_m', chainage_end_m,
               'offset', case road_side when 'left' then -7 when 'right' then 7 else 0 end))) from live) as permits,
          (select jsonb_agg(jsonb_build_object('type','Feature','geometry',st_asgeojson(f.geom, 6)::jsonb,'properties',
             jsonb_build_object('id', f.id, 'name', f.name, 'type', f.type, 'letter', case f.type when 'hospital' then 'H' when 'clinic' then 'C' else 'S' end)))
             from facilities f, view where f.type in ('hospital', 'clinic', 'school') and st_contains(view.g, f.geom)) as facilities`,
  ]);
  const fc = (features: unknown): FeatureCollection => ({ type: "FeatureCollection", features: (features as FeatureCollection["features"]) ?? [] });
  return {
    id: n.id as string,
    reference: n.reference as string,
    road_name: n.road_name as string,
    chainage_start_m: n.chainage_start_m as number,
    chainage_end_m: n.chainage_end_m as number,
    starts_on: n.starts_on as string,
    ends_on: n.ends_on as string,
    traffic_impact: n.traffic_impact as string,
    departments: n.departments as string[],
    joint: n.joint as boolean,
    works: works as unknown as NoticeData["works"],
    facility: (facility?.name as string) ?? null,
    nearest_stop: (stop?.stop_name as string) ?? null,
    published_at: n.published_at as Date,
    map: { bounds: geo.bounds as [number, number, number, number], layers: { corridor: fc(geo.corridor), permits: fc(geo.permits), facilities: fc(geo.facilities) } },
  };
}

export interface PublicWork {
  notice_id: string;
  reference: string;
  starts_on: string;
  ends_on: string;
  chainage_start_m: number;
  chainage_end_m: number;
  traffic_impact: string;
  departments: string[];
  permit_count: number;
  combined: boolean;
  landmark: string | null;
}

/**
 * Current notices for works that have not finished. When a permit appears in more than one notice
 * (its own, then a combined one after a case is decided) only the newest is listed.
 */
export async function listPublicWorks(today: string): Promise<{ works: PublicWork[]; map: { bounds: [number, number, number, number] | null; layers: Record<string, FeatureCollection> } }> {
  const sql = db();
  const works = await sql`
    with current as (
      select n.* from notices n
      where n.ends_on >= ${today}::date
        and not exists (select 1 from notices newer where newer.published_at > n.published_at and newer.permit_ids && n.permit_ids)
    )
    select c.id as notice_id, c.reference, to_char(c.starts_on, 'YYYY-MM-DD') as starts_on, to_char(c.ends_on, 'YYYY-MM-DD') as ends_on, c.chainage_start_m, c.chainage_end_m,
           c.traffic_impact, c.departments, coalesce(array_length(c.permit_ids, 1), 0) as permit_count, (c.case_id is not null and array_length(c.permit_ids, 1) > 1) as combined,
           coalesce(
             (select f.name from facilities f where f.type in ('hospital', 'clinic', 'school') and f.name is not null
                and st_dwithin(f.geom::geography, (select st_collect(p.geom)::geography from permits p where p.id = any(c.permit_ids)), 200)
              order by (f.type = 'hospital') desc limit 1),
             (select b.stop_name from bus_stops b order by b.geom <-> (select st_centroid(st_collect(p.geom)) from permits p where p.id = any(c.permit_ids)) limit 1)) as landmark
    from current c order by c.starts_on, c.reference`;
  const noticeIds = works.map((w) => w.notice_id as string);
  const [geo] = await sql`
    select
      (select jsonb_build_array(st_xmin(e), st_ymin(e), st_xmax(e), st_ymax(e)) from (select st_extent(geom) e from corridors) x) as bounds,
      (select jsonb_agg(jsonb_build_object('type','Feature','geometry',st_asgeojson(geom, 6)::jsonb,'properties','{}'::jsonb)) from corridors) as corridor,
      (select jsonb_agg(jsonb_build_object('type','Feature','geometry',st_asgeojson(p.geom, 6)::jsonb,'properties',
         jsonb_build_object('permit_id', p.permit_id, 'department', d.name, 'color', d.color, 'purpose', p.purpose, 'status', p.status, 'road_side', p.road_side,
           'proposed_start', p.proposed_start, 'proposed_end', p.proposed_end, 'chainage_start_m', p.chainage_start_m, 'chainage_end_m', p.chainage_end_m,
           'offset', case p.road_side when 'left' then -7 when 'right' then 7 else 0 end)))
       from permits p join departments d on d.id = p.department_id
       where p.id in (select unnest(n.permit_ids) from notices n where n.id = any(${noticeIds}::uuid[]))) as permits`;
  const fc = (features: unknown): FeatureCollection => ({ type: "FeatureCollection", features: (features as FeatureCollection["features"]) ?? [] });
  return { works: works as unknown as PublicWork[], map: { bounds: (geo.bounds as [number, number, number, number]) ?? null, layers: { corridor: fc(geo.corridor), permits: fc(geo.permits) } } };
}
