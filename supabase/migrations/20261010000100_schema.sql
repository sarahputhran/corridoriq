-- CorridorIQ schema. Geometry is EPSG:4326; cast to geography for metre distances.

create extension if not exists postgis with schema extensions;

create type user_role as enum ('engineer','planner','supervisor','admin');
create type permit_status as enum ('draft','submitted','auto_approved','approved','approved_with_conditions',
  'coordination_required','review_required','rescheduled','blocked','rejected','in_progress','completed');
create type decision_output as enum ('ALLOW','ALLOW_WITH_CONDITIONS','COORDINATION_REQUIRED','REVIEW_REQUIRED',
  'RESCHEDULE','BLOCK','EMERGENCY_EXCEPTION');
create type strategy as enum ('JOINT_EXECUTION','DEFER_NEW_PERMIT','RESEQUENCE_WORKS','SEPARATE_EXECUTION','BLOCK_OR_ESCALATE');
create type case_status as enum ('open','awaiting_department','awaiting_planner','awaiting_checker','decided','closed');

-- ── Reference data ───────────────────────────────────────────────────────────
create table cities (id text primary key, name text, bbox jsonb, languages text[], demo_today date, config jsonb);
create table departments (id text primary key, name text unique, short text, color text, utility_group text);
create table profiles (user_id uuid primary key references auth.users on delete cascade, display_name text, role user_role,
  department_id text references departments, is_demo boolean default true);

create table wards (id serial primary key, ward_number int unique, ward_name text, admin_zone text,
  geom extensions.geometry(MultiPolygon,4326));
create table corridors (id text primary key, city_id text references cities, road_name text, start_label text,
  end_label text, length_m numeric, geom extensions.geometry(LineString,4326));
create table road_segments (id text primary key, corridor_id text references corridors, seq int,
  chainage_start_m numeric, chainage_end_m numeric, classification text, width_m numeric, surface text,
  protected boolean default false, ward_id int references wards, admin_zone text, geom extensions.geometry(LineString,4326));
create table restorations (id text primary key, corridor_id text references corridors, chainage_start_m numeric,
  chainage_end_m numeric, completed_on date, surface text, protected boolean, kind text, synthetic boolean default true,
  geom extensions.geometry(LineString,4326));
create table facilities (id text primary key, name text, type text, source text, geom extensions.geometry(Point,4326));
create table bus_routes (id text primary key, route_name text, shape_id text, geom extensions.geometry(MultiLineString,4326));
create table bus_stops (id text primary key, stop_name text, routes_served text[], geom extensions.geometry(Point,4326));
-- context_only: the zone flags criticality but is never a schedule conflict. Also carries
-- programme_year_marker, location_basis and geometry_approximated. Off-corridor projects have no corridor or chainage.
create table infra_zones (id text primary key, project_id text, project_name text, agency text, status text,
  start_date date, end_date date, end_is_approximate boolean default false, context_only boolean not null default false,
  programme_year_marker int, corridor_id text references corridors, chainage_start_m numeric, chainage_end_m numeric,
  geometry_approximated boolean default true, location_basis text, source_url text, source_notes text,
  geom extensions.geometry(LineString,4326));

-- ── Permits ──────────────────────────────────────────────────────────────────
create table permits (
  id uuid primary key default gen_random_uuid(),
  permit_id text unique not null,
  department_id text references departments not null,
  applicant_user_id uuid references auth.users on delete set null,
  purpose text not null, work_type text not null default 'routine' check (work_type in ('routine','emergency_fault')),
  in_annual_programme boolean not null default true,
  fault_sanctioned boolean not null default false,
  start_lat double precision, start_lng double precision, end_lat double precision, end_lng double precision,
  corridor_id text references corridors, chainage_start_m numeric, chainage_end_m numeric, trench_length_m numeric,
  snap_offset_m numeric,
  proposed_start date not null, proposed_end date not null,
  trench_depth_m numeric, trench_width_m numeric,
  road_side text check (road_side in ('left','right','center','full-width')), traffic_impact text,
  status permit_status not null default 'draft', conditions text[] not null default '{}',
  filed_at timestamptz, synthetic boolean default true,
  geom extensions.geometry(LineString,4326),
  created_at timestamptz default now(), updated_at timestamptz default now(),
  check (proposed_end >= proposed_start)
);
create table attachments (id uuid primary key default gen_random_uuid(), permit_id uuid references permits on delete cascade,
  kind text check (kind in ('drawing','trench_spec','restoration_bond')), storage_path text, file_name text, uploaded_at timestamptz default now());

-- ── Rules and evaluations ────────────────────────────────────────────────────
create table rules (rule_id text, city_id text references cities, category text, provenance text, trigger_text text,
  action text, severity text, threshold_text text, reason text, params jsonb not null default '{}', source text,
  enabled boolean not null default true, primary key (rule_id, city_id));

create table evaluations (id uuid primary key default gen_random_uuid(), permit_id uuid references permits on delete cascade,
  ran_at timestamptz default now(), demo_today date, result jsonb, decision decision_output, rule_ids text[]);
create table rule_hits (id bigserial primary key, evaluation_id uuid references evaluations on delete cascade,
  rule_id text, step int, fired boolean, counterpart_permit_id uuid, counterpart_infra_id text, inputs jsonb, explanation text);

-- ── Coordination ─────────────────────────────────────────────────────────────
create table coordination_cases (
  id uuid primary key default gen_random_uuid(), case_ref text unique,
  title text,
  corridor_id text references corridors, triggering_permit_id uuid references permits,
  permit_ids uuid[], infra_zone_ids text[],
  chainage_start_m numeric, chainage_end_m numeric,
  spatial_classification text, repeat_opening_classification text, execution_feasibility text,
  criticality_flags text[], rule_ids text[], recommended_strategy strategy,
  status case_status default 'open', sla_due_at timestamptz, created_at timestamptz default now());
create table strategy_options (id bigserial primary key, case_id uuid references coordination_cases on delete cascade,
  strategy strategy, feasible boolean, recommended boolean, schedule_shift_days int, ratings jsonb, conditions text[], rationale text);
create table ai_explanations (case_id uuid primary key references coordination_cases on delete cascade,
  text text, citations jsonb, provider text, model text, validated boolean, created_at timestamptz default now());
create table decisions (id uuid primary key default gen_random_uuid(), case_id uuid references coordination_cases on delete cascade,
  chosen_strategy strategy, decision decision_output, is_override boolean not null default false, override_reason text,
  maker_user_id uuid references auth.users on delete set null, made_at timestamptz,
  checker_user_id uuid references auth.users on delete set null, checked_at timestamptz, checker_note text,
  check (not is_override or (override_reason is not null and length(override_reason) >= 15)));
create table tasks (id uuid primary key default gen_random_uuid(), case_id uuid references coordination_cases on delete cascade,
  permit_id uuid references permits on delete cascade, kind text, assignee_role user_role, assignee_department_id text references departments,
  title text, due_at timestamptz, status text default 'open', escalated_at timestamptz, completed_at timestamptz,
  response jsonb, created_at timestamptz default now());
create table notices (id uuid primary key default gen_random_uuid(), case_id uuid references coordination_cases on delete cascade,
  permit_ids uuid[], corridor_id text, chainage_start_m numeric, chainage_end_m numeric,
  starts_on date, ends_on date, traffic_impact text, departments text[],
  body jsonb, reference text, published_at timestamptz default now());
create table grievances (id uuid primary key default gen_random_uuid(), notice_id uuid references notices on delete cascade,
  name text, contact text, message text not null, created_at timestamptz default now(), status text default 'new');
create table audit_log (id bigserial primary key, at timestamptz default now(), actor_user_id uuid, actor_role text,
  entity text, entity_id text, action text, before jsonb, after jsonb);
create table complaints_evidence (id text primary key, date date, source text, location text, summary text,
  tags text[], strength text, url text);

-- ── Indexes ──────────────────────────────────────────────────────────────────
create index wards_geom_idx on wards using gist (geom);
create index corridors_geom_idx on corridors using gist (geom);
create index road_segments_geom_idx on road_segments using gist (geom);
create index restorations_geom_idx on restorations using gist (geom);
create index facilities_geom_idx on facilities using gist (geom);
create index bus_routes_geom_idx on bus_routes using gist (geom);
create index bus_stops_geom_idx on bus_stops using gist (geom);
create index infra_zones_geom_idx on infra_zones using gist (geom);
create index permits_geom_idx on permits using gist (geom);
create index permits_corridor_idx on permits (corridor_id, status);
create index evaluations_permit_idx on evaluations (permit_id, ran_at desc);
create index rule_hits_evaluation_idx on rule_hits (evaluation_id);
create index cases_status_idx on coordination_cases (status, sla_due_at);
create index cases_permit_ids_idx on coordination_cases using gin (permit_ids);
create index tasks_open_idx on tasks (status, due_at);
create index audit_entity_idx on audit_log (entity, entity_id, at);

-- ── updated_at ───────────────────────────────────────────────────────────────
create function set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger permits_set_updated_at before update on permits for each row execute function set_updated_at();

-- ── Security ─────────────────────────────────────────────────────────────────
-- Deny by default: RLS on, no policies. All data access goes through the server with the service role,
-- after an app-level role check. The browser uses Supabase only for the auth session.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- The audit log is append-only.
revoke update, delete, truncate on audit_log from public, authenticated, anon;
