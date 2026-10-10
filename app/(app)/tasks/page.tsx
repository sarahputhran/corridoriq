import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { TaskResponseForm } from "@/components/tasks/TaskResponseForm";
import { getSessionUser } from "@/lib/auth/session";
import { listTasks, type TaskItem } from "@/lib/db/tasks";
import { demoNow } from "@/lib/demo-clock";
import { fmtDateTime, fmtRange, humanize, slaText } from "@/lib/format";

export const metadata: Metadata = { title: "Tasks | CorridorIQ" };

const KIND_LABEL: Record<string, string> = {
  department_response: "Department response",
  planner_decision: "Planner decision",
  planner_review: "Planner review",
  checker_signoff: "Second sign-off",
  escalation: "Escalation",
  sla_breach: "SLA breach",
};

function TaskCard({ t, now, canRespond }: { t: TaskItem; now: Date; canRespond: boolean }) {
  const open = t.status === "open";
  const sla = open ? slaText(t.due_at, now) : null;
  return (
    <li className="border-2 border-ink bg-card p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em]">{KIND_LABEL[t.kind] ?? humanize(t.kind)}</span>
        <span className="flex flex-wrap gap-1.5">
          {t.escalated_at && <span className="chip bg-status-escalated !text-xs font-semibold">Escalated</span>}
          <span className={`chip !text-xs font-semibold ${open ? (sla?.overdue ? "bg-status-block-tint" : "bg-status-coord") : "bg-status-ok"}`}>
            {open ? (sla ? `Open · ${sla.text}` : "Open") : humanize(t.status)}
          </span>
        </span>
      </div>
      <p className="mt-1.5 font-semibold">{t.title}</p>
      <p className="mt-0.5 text-[13px]">
        {t.case_ref && (
          <>
            Case <Link href={`/cases/${t.case_ref}`} className="font-mono font-semibold">{t.case_ref}</Link>: {t.case_title}.{" "}
          </>
        )}
        {t.permit_start && t.permit_end && <>Current dates {fmtRange(t.permit_start, t.permit_end)}. </>}
        {t.due_at && <>Due {fmtDateTime(t.due_at)}.</>}
      </p>
      {t.response?.action && (
        <p className="mt-1 text-[13px]">
          Response: {t.response.action === "confirm" ? "dates confirmed" : t.response.proposed_start && t.response.proposed_end ? `proposed ${fmtRange(t.response.proposed_start, t.response.proposed_end)}` : "proposed new dates"}
          {t.response.note ? `. Note: ${t.response.note}` : ""}
        </p>
      )}
      {open && t.kind === "department_response" && canRespond && <TaskResponseForm taskId={t.id} start={t.permit_start} end={t.permit_end} />}
      {open && t.kind !== "department_response" && t.case_ref && (
        <p className="mt-2.5">
          <Link href={`/cases/${t.case_ref}`} className="btn">Open case</Link>
        </p>
      )}
    </li>
  );
}

async function Inbox() {
  await connection();
  let user;
  let tasks: TaskItem[] = [];
  try {
    user = await getSessionUser();
    if (user) tasks = await listTasks(user);
  } catch {
    return (
      <section className="card" role="alert">
        <h2 className="section-header">Could not load tasks</h2>
        <p>The database did not respond. Reload the page to try again.</p>
      </section>
    );
  }
  if (!user) {
    return (
      <section className="card">
        <h2 className="section-header">Pick a role to see its tasks</h2>
        <p>Tasks belong to a role. Use &ldquo;Viewing as&rdquo; in the header to become the planner, the supervisor or a department engineer.</p>
      </section>
    );
  }
  const now = demoNow();
  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status !== "open");
  return (
    <>
      <p className="mb-6 text-[15px]">
        Viewing as <b>{user.display_name}</b>
        {user.department_name ? ` (${user.department_name})` : ""}. {open.length} open, {done.length} closed.
      </p>
      {tasks.length === 0 ? (
        <section className="card">
          <h2 className="section-header">Nothing waiting</h2>
          <p>No tasks are assigned to this role. Tasks appear when a permit opens a coordination case or needs a review.</p>
        </section>
      ) : (
        <div className="flex flex-col gap-6">
          <section className="card">
            <h2 className="section-header">Open</h2>
            {open.length ? <ul className="flex flex-col gap-3">{open.map((t) => <TaskCard key={t.id} t={t} now={now} canRespond={user.role === "engineer"} />)}</ul> : <p>Nothing open.</p>}
          </section>
          {done.length > 0 && (
            <section className="card">
              <h2 className="section-header">Closed</h2>
              <ul className="flex flex-col gap-3">{done.map((t) => <TaskCard key={t.id} t={t} now={now} canRespond={false} />)}</ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}

export default function TasksPage() {
  return (
    <>
      <SiteHeader active="/tasks" />
      <main className="mx-auto w-full max-w-[960px] px-6 pb-12 pt-7">
        <h1 className="mb-2">Tasks</h1>
        <Suspense fallback={<p className="chip mt-4">Loading tasks…</p>}>
          <Inbox />
        </Suspense>
      </main>
    </>
  );
}
