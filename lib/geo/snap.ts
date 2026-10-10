// Snaps a trench (two clicked points) onto a corridor and measures it in metres of chainage.
// Fractions are taken in UTM 43N so they are true distances, then scaled by the stored corridor length so new
// permits sit on the same chainage scale as the seeded ones.
import type { LineString } from "geojson";
import type { Sql } from "@/lib/db/connection";

export interface LngLat {
  lng: number;
  lat: number;
}

export interface SnappedTrench {
  corridor_id: string;
  road_name: string;
  chainage_start_m: number;
  chainage_end_m: number;
  trench_length_m: number;
  /** Largest distance from either clicked point to the corridor line. */
  snap_offset_m: number;
  geom: LineString;
  segment: { id: string; classification: string; surface: string; protected: boolean; ward: string | null } | null;
}

// EPSG:32643 (UTM zone 43N) is written as a literal in the SQL below: as a bound parameter PostGIS reads it as a proj string.
/** A trench shorter than this is treated as a mis-click. */
export const MIN_TRENCH_M = 2;

export async function snapTrench(sql: Sql, corridorId: string, start: LngLat, end: LngLat): Promise<SnappedTrench | null> {
  const [row] = await sql`
    with c as (select id, road_name, length_m, st_transform(geom, 32643) as g from corridors where id = ${corridorId}),
    p as (select st_transform(st_setsrid(st_makepoint(${start.lng}, ${start.lat}), 4326), 32643) as a,
                 st_transform(st_setsrid(st_makepoint(${end.lng}, ${end.lat}), 4326), 32643) as b),
    f as (select c.id, c.road_name, c.length_m, c.g,
                 least(st_linelocatepoint(c.g, p.a), st_linelocatepoint(c.g, p.b)) as f0,
                 greatest(st_linelocatepoint(c.g, p.a), st_linelocatepoint(c.g, p.b)) as f1,
                 greatest(st_distance(c.g, p.a), st_distance(c.g, p.b)) as off
          from c, p)
    select f.id, f.road_name, round((f.f0 * f.length_m)::numeric, 1) as chainage_start_m, round((f.f1 * f.length_m)::numeric, 1) as chainage_end_m,
           round(((f.f1 - f.f0) * f.length_m)::numeric, 1) as trench_length_m, round(f.off::numeric, 1) as snap_offset_m,
           case when f.f1 > f.f0 then st_asgeojson(st_transform(st_linesubstring(f.g, f.f0, f.f1), 4326), 7)::jsonb end as geom,
           (select jsonb_build_object('id', s.id, 'classification', s.classification, 'surface', s.surface, 'protected', s.protected, 'ward', w.ward_name)
              from road_segments s left join wards w on w.id = s.ward_id
              where s.corridor_id = f.id and s.chainage_start_m <= (f.f0 + f.f1) / 2 * f.length_m and s.chainage_end_m >= (f.f0 + f.f1) / 2 * f.length_m
              order by s.seq limit 1) as segment
    from f`;
  if (!row || !row.geom) return null;
  return {
    corridor_id: row.id as string,
    road_name: row.road_name as string,
    chainage_start_m: row.chainage_start_m as number,
    chainage_end_m: row.chainage_end_m as number,
    trench_length_m: row.trench_length_m as number,
    snap_offset_m: row.snap_offset_m as number,
    geom: row.geom as LineString,
    segment: (row.segment as SnappedTrench["segment"]) ?? null,
  };
}
