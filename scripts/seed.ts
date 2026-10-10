// Seeds the demo database from data/processed (never from data/raw). Idempotent: it clears the demo tables first.
// Usage: npm run db:seed
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import type { FeatureCollection, Geometry } from "geojson";
import { DEMO_USERS } from "../config/demo-users";
import { pune } from "../config/cities/pune";
import { createConnection, type Sql } from "../lib/db/connection";
import { readProcessed } from "./lib/data";
import { explainAllCases } from "./ai-explain";
import { replayStory } from "./seed-story";

config({ path: ".env.local", quiet: true });

type Row = Record<string, unknown>;
/** postgres.js types JSON narrowly; the processed files are plain JSON by construction. */
const json = (sql: Sql, value: unknown) => sql.json(value as never);
const features = <P>(file: string) => readProcessed<FeatureCollection<Geometry, P>>(file).features;

// Every table the demo writes to. Reference tables are reloaded too, so a reset always matches data/processed.
const TABLES = [
  "grievances", "notices", "tasks", "decisions", "ai_explanations", "strategy_options", "coordination_cases",
  "rule_hits", "evaluations", "attachments", "permits", "audit_log", "rules", "complaints_evidence",
  "infra_zones", "bus_stops", "bus_routes", "facilities", "restorations", "road_segments", "corridors", "wards",
  "profiles", "departments", "cities",
];

async function seedReference(sql: Sql) {
  const corridor = features<Row>("corridor.geojson")[0];
  await sql`insert into cities ${sql({
    id: pune.city_id, name: pune.name, bbox: json(sql, pune.bbox), languages: [...pune.languages], demo_today: pune.demo_today,
    config: json(sql, { sla_hours: pune.sla_hours, schedule_cost_days: pune.schedule_cost_days, defer_buffer_days: pune.defer_buffer_days, snap_tolerance_m: pune.snap_tolerance_m, context_radius_m: pune.context_radius_m }),
  })}`;
  await sql`insert into departments ${sql(readProcessed<Row[]>("departments.json"), "id", "name", "short", "color", "utility_group")}`;

  await sql`
    insert into wards (ward_number, ward_name, admin_zone, geom)
    select x.ward_number, x.ward_name, x.admin_zone, st_setsrid(st_geomfromgeojson(x.geom::text), 4326)
    from jsonb_to_recordset(${json(sql, features<Row>("wards.geojson").map((f) => ({ ...f.properties, geom: f.geometry })))})
      as x(ward_number int, ward_name text, admin_zone text, geom jsonb)`;

  await sql`
    insert into corridors (id, city_id, road_name, start_label, end_label, length_m, geom)
    select x.id, x.city_id, x.road_name, x.start_label, x.end_label, x.length_m, st_setsrid(st_geomfromgeojson(x.geom::text), 4326)
    from jsonb_to_recordset(${json(sql, [{ ...corridor.properties, geom: corridor.geometry }])})
      as x(id text, city_id text, road_name text, start_label text, end_label text, length_m numeric, geom jsonb)`;

  await sql`
    insert into road_segments (id, corridor_id, seq, chainage_start_m, chainage_end_m, classification, width_m, surface, protected, ward_id, admin_zone, geom)
    select x.id, x.corridor_id, x.seq, x.chainage_start_m, x.chainage_end_m, x.classification, x.width_m, x.surface, x.protected,
           w.id, x.admin_zone, st_setsrid(st_geomfromgeojson(x.geom::text), 4326)
    from jsonb_to_recordset(${json(sql, features<Row>("segments.geojson").map((f) => ({ ...f.properties, geom: f.geometry })))})
      as x(id text, corridor_id text, seq int, chainage_start_m numeric, chainage_end_m numeric, classification text, width_m numeric,
           surface text, protected boolean, ward_number int, admin_zone text, geom jsonb)
    left join wards w on w.ward_number = x.ward_number`;

  await sql`
    insert into restorations (id, corridor_id, chainage_start_m, chainage_end_m, completed_on, surface, protected, kind, synthetic, geom)
    select x.id, x.corridor_id, x.chainage_start_m, x.chainage_end_m, x.completed_on, x.surface, x.protected, x.kind, x.synthetic,
           st_setsrid(st_geomfromgeojson(x.geom::text), 4326)
    from jsonb_to_recordset(${json(sql, readProcessed<Row[]>("restorations.json"))})
      as x(id text, corridor_id text, chainage_start_m numeric, chainage_end_m numeric, completed_on date, surface text, protected boolean,
           kind text, synthetic boolean, geom jsonb)`;

  await sql`
    insert into facilities (id, name, type, source, geom)
    select x.id, x.name, x.type, x.source, st_setsrid(st_geomfromgeojson(x.geom::text), 4326)
    from jsonb_to_recordset(${json(sql, features<Row>("facilities.geojson").map((f) => ({ ...f.properties, geom: f.geometry })))})
      as x(id text, name text, type text, source text, geom jsonb)`;

  await sql`
    insert into bus_routes (id, route_name, shape_id, geom)
    select x.id, x.route_name, x.shape_id, st_setsrid(st_geomfromgeojson(x.geom::text), 4326)
    from jsonb_to_recordset(${json(sql, features<Row>("bus_routes.geojson").map((f) => ({ ...f.properties, geom: f.geometry })))})
      as x(id text, route_name text, shape_id text, geom jsonb)`;

  await sql`
    insert into bus_stops (id, stop_name, routes_served, geom)
    select x.id, x.stop_name, array(select jsonb_array_elements_text(x.routes_served)), st_setsrid(st_geomfromgeojson(x.geom::text), 4326)
    from jsonb_to_recordset(${json(sql, features<Row>("bus_stops.geojson").map((f) => ({ ...f.properties, geom: f.geometry })))})
      as x(id text, stop_name text, routes_served jsonb, geom jsonb)`;

  await sql`
    insert into infra_zones (id, project_id, project_name, agency, status, start_date, end_date, end_is_approximate, context_only,
                             programme_year_marker, corridor_id, chainage_start_m, chainage_end_m, geometry_approximated, location_basis,
                             source_url, source_notes, geom)
    select x.id, x.project_id, x.project_name, x.agency, x.status, x.start_date, x.end_date, x.end_is_approximate, x.context_only,
           x.programme_year_marker, x.corridor_id, x.chainage_start_m, x.chainage_end_m, x.geometry_approximated, x.location_basis,
           x.source_url, x.source_notes,
           case when x.geom is null or x.geom = 'null'::jsonb then null else st_setsrid(st_geomfromgeojson(x.geom::text), 4326) end
    from jsonb_to_recordset(${json(sql, readProcessed<Row[]>("infra_zones.json"))})
      as x(id text, project_id text, project_name text, agency text, status text, start_date date, end_date date, end_is_approximate boolean,
           context_only boolean, programme_year_marker int, corridor_id text, chainage_start_m numeric, chainage_end_m numeric,
           geometry_approximated boolean, location_basis text, source_url text, source_notes text, geom jsonb)`;

  await sql`
    insert into rules (rule_id, city_id, category, provenance, trigger_text, action, severity, threshold_text, reason, params, source, enabled)
    select x.rule_id, x.city_id, x.category, x.provenance, x.trigger_text, x.action, x.severity, x.threshold_text, x.reason, x.params, x.source, x.enabled
    from jsonb_to_recordset(${json(sql, readProcessed<Row[]>("rules.json"))})
      as x(rule_id text, city_id text, category text, provenance text, trigger_text text, action text, severity text, threshold_text text,
           reason text, params jsonb, source text, enabled boolean)`;

  await sql`
    insert into complaints_evidence (id, date, date_text, source, location, summary, tags, strength, url)
    select x.id, case when length(x.date) = 10 then x.date::date end, x.date, x.source, x.location, x.summary, array(select jsonb_array_elements_text(x.tags)), x.strength, x.url
    from jsonb_to_recordset(${json(sql, readProcessed<Row[]>("complaints.json"))})
      as x(id text, date text, source text, location text, summary text, tags jsonb, strength text, url text)`;
}

/** Creates (or updates) the demo sign-ins through the Supabase admin API and returns email → user id. */
async function ensureDemoUsers(): Promise<Map<string, string>> {
  const password = process.env.DEMO_USER_PASSWORD;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!password || !url || !key) throw new Error("Supabase URL, service key or DEMO_USER_PASSWORD missing. Run `npm run check:env`.");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const existing = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Could not list users: ${error.message}`);
    for (const u of data.users) if (u.email) existing.set(u.email, u.id);
    if (data.users.length < 200) break;
  }
  const ids = new Map<string, string>();
  for (const user of DEMO_USERS) {
    const id = existing.get(user.email);
    if (id) {
      const { error } = await supabase.auth.admin.updateUserById(id, { password, email_confirm: true });
      if (error) throw new Error(`Could not update ${user.email}: ${error.message}`);
      ids.set(user.email, id);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({ email: user.email, password, email_confirm: true });
      if (error || !data.user) throw new Error(`Could not create ${user.email}: ${error?.message}`);
      ids.set(user.email, data.user.id);
    }
  }
  return ids;
}

/**
 * Clears the demo tables and rebuilds the whole demo: reference data, users, the filing replay and the case explanations.
 * Used by `npm run db:seed` and by the Admin "Reset demo" button.
 */
export async function runSeed(options: { log?: (line: string) => void; explain?: boolean } = {}): Promise<{ counts: Record<string, number> }> {
  const log = options.log ?? (() => {});
  const userIds = await ensureDemoUsers();
  log(`  demo users ready (${userIds.size})`);

  const sql = createConnection({ max: 1 });
  try {
    await sql.begin(async (tx) => {
      // A transaction handle has the same query interface as the pool.
      const db = tx as unknown as Sql;
      await db.unsafe(`truncate ${TABLES.join(", ")} restart identity cascade`);
      await seedReference(db);
      await db`insert into profiles ${db(
        DEMO_USERS.map((u) => ({ user_id: userIds.get(u.email)!, display_name: u.display_name, role: u.role, department_id: u.department_id, is_demo: true })),
      )}`;
      await replayStory(db, userIds, log);
      await db`insert into audit_log (actor_role, entity, entity_id, action, after) values ('system', 'demo', 'seed', 'demo_seeded', ${json(db, { demo_today: pune.demo_today })})`;
    });
    if (options.explain !== false) {
      // Explanations are written once per case, after the data is committed (never on page view).
      log("  writing case explanations");
      await explainAllCases(sql, undefined, log);
    }
    const rows = await sql`
      select 'permits' t, count(*)::int n from permits union all select 'cases', count(*)::int from coordination_cases
      union all select 'tasks', count(*)::int from tasks union all select 'notices', count(*)::int from notices
      union all select 'facilities', count(*)::int from facilities union all select 'rules', count(*)::int from rules
      union all select 'profiles', count(*)::int from profiles union all select 'audit_log', count(*)::int from audit_log`;
    const counts = Object.fromEntries(rows.map((r) => [r.t as string, r.n as number]));
    log("  " + Object.entries(counts).map(([t, n]) => `${t}=${n}`).join("  "));
    return { counts };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/seed.ts")) {
  console.log("seed");
  runSeed({ log: console.log }).catch((err) => {
    console.error("seed failed:", String(err?.message ?? err).replace(/postgres(ql)?:\/\/\S+/g, "[connection string hidden]"));
    process.exit(1);
  });
}
