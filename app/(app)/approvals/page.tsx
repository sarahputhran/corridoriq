import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { EscalateButton } from "@/components/admin/AdminControls";
import { SiteHeader } from "@/components/SiteHeader";
import { getSessionUser } from "@/lib/auth/session";
import { listEscalations, listPendingApprovals } from "@/lib/db/admin";
import { demoNow } from "@/lib/demo-clock";
import { STRATEGY_LABEL, fmtDateTime, humanize, slaText } from "@/lib/format";

export const metadata: Metadata = { title: "Approvals | CorridorIQ" };

async function Approvals({ searchParams }: Pick<PageProps<"/approvals">, "searchParams">) {
  const query = await searchParams;
  await connection();
  const tab = query.tab === "escalations" ? "escalations" : "signoffs";
  let user, approvals, escalations;
  const now = demoNow();
  try {
    [user, approvals, escalations] = await Promise.all([getSessionUser(), listPendingApprovals(), listEscalations(now)]);
  } catch {
    return (
      <section className="card" role="alert">
        <h2 className="section-header">Approvals could not load</h2>
        <p>The database did not respond. Reload the page to try again.</p>
      </section>
    );
  }
  const canAct = user?.role === "supervisor" || user?.role === "admin";
  return (
    <>
      <nav aria-label="Approval sections" className="mb-6 flex flex-wrap gap-1.5 border-b-[2.5px] border-ink">
        {[
          { key: "signoffs", label: `Sign-offs (${approvals.length})`, href: "/approvals" },
          { key: "escalations", label: `Escalations (${escalations.escalated.length + escalations.overdue.length})`, href: "/approvals?tab=escalations" },
        ].map((t) => (
          <Link key={t.key} href={t.href} aria-current={tab === t.key ? "page" : undefined} className={`-mb-[2.5px] flex min-h-[44px] items-center border-[2.5px] px-4 text-sm no-underline ${tab === t.key ? "border-ink border-b-paper bg-paper font-semibold" : "border-transparent font-medium"}`}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "signoffs" ? (
        approvals.length === 0 ? (
          <section className="card">
            <h2 className="section-header">Nothing waiting for sign-off</h2>
            <p>A case appears here after the planner records a decision. The supervisor then approves it or sends it back.</p>
          </section>
        ) : (
          <ul className="flex flex-col gap-3.5">
            {approvals.map((a) => {
              const sla = slaText(a.sla_due_at, now);
              return (
                <li key={a.case_ref} className="card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="chip font-mono font-semibold">{a.case_ref}</span>
                    {sla && <span className={`chip !text-xs ${sla.overdue ? "bg-status-block-tint font-semibold" : ""}`}>SLA: {sla.text}</span>}
                  </div>
                  <p className="mt-2.5 text-lg font-bold">{a.title}</p>
                  <p className="mt-1 text-sm">
                    {a.maker ?? "The planner"} chose <b>{STRATEGY_LABEL[a.chosen_strategy].toLowerCase()}</b>
                    {a.is_override ? ", overriding the recommendation" : ", the recommendation"}, on {fmtDateTime(a.made_at)}.
                  </p>
                  {a.override_reason && <p className="mt-1 text-sm">Reason given: {a.override_reason}</p>}
                  <p className="mt-3.5">
                    <Link href={`/cases/${a.case_ref}`} className="btn btn-primary">{canAct ? "Review and sign off" : "Open case"}</Link>
                  </p>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <div className="flex flex-col gap-6">
          <section className="card">
            <h2 className="section-header">Overdue, not yet escalated ({escalations.overdue.length})</h2>
            {escalations.overdue.length === 0 ? (
              <p className="text-[13px]">No task is past its due time.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {escalations.overdue.map((t) => (
                  <li key={t.id} className="border-2 border-ink p-3 text-[13px]">
                    <b>{t.title}</b>
                    <span className="mt-0.5 block">
                      {t.department ?? humanize(t.kind)} · {slaText(t.due_at, now)?.text}
                      {t.case_ref && <> · <Link href={`/cases/${t.case_ref}?tab=tasks`} className="font-mono font-semibold">{t.case_ref}</Link></>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {canAct ? <div className="mt-4"><EscalateButton /></div> : <p className="mt-3 text-[13px]">Switch to Supervisor to run escalation.</p>}
          </section>
          <section className="card">
            <h2 className="section-header">Escalated to the supervisor ({escalations.escalated.length})</h2>
            {escalations.escalated.length === 0 ? (
              <p className="text-[13px]">Nothing has been escalated.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {escalations.escalated.map((t) => (
                  <li key={t.id} className="border-2 border-ink p-3 text-[13px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <b>{t.title}</b>
                      <span className={`chip !text-xs font-semibold ${t.status === "open" ? "bg-status-escalated" : "bg-status-ok"}`}>{t.status === "open" ? "Open" : humanize(t.status)}</span>
                    </div>
                    <span className="mt-0.5 block">
                      {t.escalated_at ? `Escalated ${fmtDateTime(t.escalated_at)}` : t.due_at ? `Due ${fmtDateTime(t.due_at)}` : ""}
                      {t.case_ref && <> · <Link href={`/cases/${t.case_ref}?tab=tasks`} className="font-mono font-semibold">{t.case_ref}</Link></>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}

export default function ApprovalsPage(props: PageProps<"/approvals">) {
  return (
    <>
      <SiteHeader active="/tasks" returnTo="/approvals" />
      <main className="mx-auto w-full max-w-[960px] px-6 pb-12 pt-7">
        <h1 className="mb-2">Approvals</h1>
        <p className="mb-6 text-[15px]">Second sign-off on planner decisions, and tasks that ran past their time.</p>
        <Suspense fallback={<p className="chip">Loading approvals…</p>}>
          <Approvals searchParams={props.searchParams} />
        </Suspense>
      </main>
    </>
  );
}
