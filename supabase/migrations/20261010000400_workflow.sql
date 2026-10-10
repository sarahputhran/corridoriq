-- Workflow support.

-- Which evaluation the case's strategy table came from (a case can be joined by later permits).
alter table coordination_cases add column strategy_evaluation_id uuid references evaluations on delete set null;

-- Supervisor outcome: true = approved, false = sent back, null = not yet checked.
alter table decisions add column checker_approved boolean;
alter table decisions add column created_at timestamptz default now();

-- A notice for a single auto-approved permit has no case.
alter table notices add column title text;
create index notices_permit_ids_idx on notices using gin (permit_ids);
create index tasks_case_idx on tasks (case_id, kind, status);
create index decisions_case_idx on decisions (case_id, created_at desc);
