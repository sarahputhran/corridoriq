// Everything the corridor map draws, as GeoJSON, in one round trip.
import "server-only";
import type { FeatureCollection } from "geojson";
import { db } from "./client";

export interface CorridorMapData {
  corridor: { id: string; road_name: string; start_label: string; end_label: string; length_m: number };
  bounds: [number, number, number, number];
  layers: Record<"corridor" | "segments" | "wards" | "restorations" | "infraZones" | "permits" | "facilities" | "busStops" | "busRoutes", FeatureCollection>;
  counts: { permits: number; facilities: number; busStops: number; busRoutes: number; segments: number; restorations: number; infraZones: number };
}

/** Facilities and stops are limited to this distance from the corridor line; the wider area is not the subject. */
const CONTEXT_M = 400;

export async function getCorridorMapData(corridorId: string): Promise<CorridorMapData | null> {
  const sql = db();
  const [row] = await sql`
    with c as (select * from corridors where id = ${corridorId}),
    fc as (
      select 'corridor' as k, jsonb_agg(jsonb_build_object('type','Feature','geometry',st_asgeojson(geom, 6)::jsonb,
        'properties', jsonb_build_object('id', id, 'road_name', road_name))) as f from c
      union all
      select 'segments', jsonb_agg(jsonb_build_object('type','Feature','geometry',st_asgeojson(s.geom, 6)::jsonb,
        'properties', jsonb_build_object('id', s.id, 'seq', s.seq, 'chainage_start_m', s.chainage_start_m, 'chainage_end_m', s.chainage_end_m,
          'surface', s.surface, 'protected', s.protected, 'ward', w.ward_name)) order by s.seq)
        from road_segments s left join wards w on w.id = s.ward_id where s.corridor_id = ${corridorId}
      union all
      select 'wards', jsonb_agg(jsonb_build_object('type','Feature','geometry',st_asgeojson(geom, 5)::jsonb,
        'properties', jsonb_build_object('ward_number', ward_number, 'ward_name', ward_name)) order by ward_number) from wards
      union all
      select 'restorations', jsonb_agg(jsonb_build_object('type','Feature','geometry',st_asgeojson(geom, 6)::jsonb,
        'properties', jsonb_build_object('id', id, 'completed_on', completed_on, 'surface', surface, 'protected', protected,
          'chainage_start_m', chainage_start_m, 'chainage_end_m', chainage_end_m)) order by id)
        from restorations where corridor_id = ${corridorId}
      union all
      select 'infraZones', jsonb_agg(jsonb_build_object('type','Feature','geometry',st_asgeojson(geom, 6)::jsonb,
        'properties', jsonb_build_object('id', id, 'project_name', project_name, 'agency', agency, 'status', status, 'context_only', context_only,
          'start_date', start_date, 'end_date', end_date, 'end_is_approximate', end_is_approximate)) order by id)
        from infra_zones where corridor_id = ${corridorId} and geom is not null
      union all
      select 'permits', jsonb_agg(jsonb_build_object('type','Feature','geometry',st_asgeojson(p.geom, 6)::jsonb,
        'properties', jsonb_build_object('permit_id', p.permit_id, 'department', d.name, 'department_id', d.id, 'color', d.color, 'purpose', p.purpose,
          'status', p.status, 'road_side', p.road_side, 'proposed_start', p.proposed_start, 'proposed_end', p.proposed_end,
          'chainage_start_m', p.chainage_start_m, 'chainage_end_m', p.chainage_end_m,
          'offset', case p.road_side when 'left' then -7 when 'right' then 7 else 0 end)) order by p.permit_id)
        from permits p join departments d on d.id = p.department_id where p.corridor_id = ${corridorId}
      union all
      select 'facilities', jsonb_agg(jsonb_build_object('type','Feature','geometry',st_asgeojson(f.geom, 6)::jsonb,
        'properties', jsonb_build_object('id', f.id, 'name', f.name, 'type', f.type,
          'letter', case f.type when 'hospital' then 'H' when 'clinic' then 'C' when 'school' then 'S' when 'place_of_worship' then 'W'
                      when 'police' then 'P' when 'fire_station' then 'F' else '' end)) order by f.id)
        from facilities f, c where f.type <> 'bus_stop' and st_dwithin(f.geom::geography, c.geom::geography, ${CONTEXT_M})
      union all
      select 'busStops', jsonb_agg(jsonb_build_object('type','Feature','geometry',st_asgeojson(b.geom, 6)::jsonb,
        'properties', jsonb_build_object('id', b.id, 'stop_name', b.stop_name)) order by b.id)
        from bus_stops b, c where st_dwithin(b.geom::geography, c.geom::geography, 60)
      union all
      select 'busRoutes', jsonb_agg(jsonb_build_object('type','Feature','geometry',st_asgeojson(st_simplify(r.geom, 0.00003), 5)::jsonb,
        'properties', jsonb_build_object('id', r.id, 'route_name', r.route_name)) order by r.id)
        from bus_routes r, c where st_dwithin(r.geom::geography, c.geom::geography, 30)
    )
    select
      (select jsonb_build_object('id', id, 'road_name', road_name, 'start_label', start_label, 'end_label', end_label, 'length_m', length_m) from c) as corridor,
      (select jsonb_build_array(st_xmin(e), st_ymin(e), st_xmax(e), st_ymax(e)) from (select st_extent(geom) e from c) x) as bounds,
      (select jsonb_object_agg(k, coalesce(f, '[]'::jsonb)) from fc) as layers`;
  if (!row?.corridor) return null;

  const layers = Object.fromEntries(
    Object.entries(row.layers as Record<string, unknown[]>).map(([k, features]) => [k, { type: "FeatureCollection", features }]),
  ) as CorridorMapData["layers"];
  const n = (k: keyof CorridorMapData["layers"]) => layers[k].features.length;
  return {
    corridor: row.corridor,
    bounds: row.bounds,
    layers,
    counts: { permits: n("permits"), facilities: n("facilities"), busStops: n("busStops"), busRoutes: n("busRoutes"), segments: n("segments"), restorations: n("restorations"), infraZones: n("infraZones") },
  };
}
