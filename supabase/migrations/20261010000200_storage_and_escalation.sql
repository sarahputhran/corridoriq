-- Private bucket for permit documents, and the SLA escalation job.

insert into storage.buckets (id, name, public) values ('permit-attachments', 'permit-attachments', false)
on conflict (id) do nothing;

-- Marks overdue open tasks as escalated, opens a supervisor task for each, and writes an audit entry.
-- p_now lets the demo run against its own clock; the scheduled job uses the real one.
create function escalate_overdue_tasks(p_now timestamptz default now()) returns int
language plpgsql set search_path = '' as $$
declare
  t record;
  n int := 0;
begin
  for t in
    select id, case_id, permit_id, title, due_at from public.tasks
    where status = 'open' and escalated_at is null and due_at < p_now and kind <> 'sla_breach'
    order by due_at, id
    for update
  loop
    update public.tasks set escalated_at = p_now where id = t.id;
    insert into public.tasks (case_id, permit_id, kind, assignee_role, title, due_at)
    values (t.case_id, t.permit_id, 'sla_breach', 'supervisor', 'SLA breached: ' || t.title, p_now + interval '24 hours');
    insert into public.audit_log (at, actor_role, entity, entity_id, action, after)
    values (p_now, 'system', 'task', t.id::text, 'sla_escalated', jsonb_build_object('title', t.title, 'due_at', t.due_at));
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function escalate_overdue_tasks(timestamptz) from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('escalate-overdue-tasks', '*/15 * * * *', $$select public.escalate_overdue_tasks()$$);
