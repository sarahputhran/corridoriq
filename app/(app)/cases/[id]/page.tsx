import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PlannerDecision, SupervisorSignOff } from "@/components/cases/DecisionCard";
import { ExplanationText, RegenerateExplanation } from "@/components/cases/Explanation";
import { CorridorMap } from "@/components/map/CorridorMap";
import { SiteHeader } from "@/components/SiteHeader";
import { getSessionUser } from "@/lib/auth/session";
import { getCaseDetail, type CaseDetail } from "@/lib/db/cases";
import { demoNow } from "@/lib/demo-clock";
import { STATUS_LABEL, STRATEGY_LABEL, TRAFFIC_LABEL, fmtDateTime, fmtMetres, fmtRange, humanize, shiftWeeks, slaText, statusTone, isPermitId } from "@/lib/format";

export const metadata: Metadata = { title: "Coordination case | CorridorIQ" };

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "tasks", label: "Tasks" },
  { key: "audit", label: "Audit trail" },
] as const;

const lower = (s: string) => humanize(s).toLowerCase();
const ruleTone = (action: string) => (action.startsWith("BLOCK") ? "bg-status-block-tint" : action === "ENGINEERING_REVIEW" || action === "ALLOW_WITH_CONDITIONS" ? "bg-card" : "bg-status-coord");

function Overview({ c, role }: { c: CaseDetail; role: string | null }) {
  const pending = c.decisions.find((d) => d.checked_at === null);
  const final = c.status === "decided" ? c.decisions.findLast((d) => d.checker_approved) : undefined;
  const sentBack = c.decisions.filter((d) => d.checker_approved === false);
  const filedOrder = [...c.permits].filter((p) => p.status !== "completed");
  const critical = c.facilities.filter((f) => ["hospital", "clinic", "school"].includes(f.type));
  const live = c.permits.filter((p) => p.status !== "completed");

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-6">
        <section className="card overflow-hidden !p-0">
          <div className="flex items-center justify-between border-b-[2.5px] border-ink px-5 py-3.5">
            <h2 className="section-header !m-0">Corridor map</h2>
            <span className="text-xs">Facility buffer {fmtMetres(c.buffer_m)} m</span>
          </div>
          <CorridorMap
            layers={c.map.layers}
            bounds={c.map.bounds}
            height={400}
            ariaLabel={`Map of the trenches in case ${c.case_ref} on ${c.road_name}, with the facilities inside the ${c.buffer_m} m buffer`}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t-[2.5px] border-ink px-5 py-2.5 text-[11px]">
            {live.map((p) => (
              <span key={p.id} className="flex items-center gap-1.5">
                <span className="h-2.5 w-[22px] border-[1.5px] border-ink" style={{ background: p.color }} />
                <span className="font-mono">{p.permit_id.slice(-4)}</span> {p.department_short}
              </span>
            ))}
            <span>H hospital · C clinic · S school · W worship · ○ bus stop</span>
          </div>
        </section>

        <section className="card scroll-mt-4" id="permits">
          <h2 className="section-header">Permits in this case</h2>
          <div className="flex flex-col gap-3">
            {c.permits.map((p) => (
              <div key={p.id} className="flex items-start gap-3.5 border-2 border-ink bg-card p-3">
                <div className="w-3.5 self-stretch border-2 border-ink" style={{ background: p.color }} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-mono text-[13px] font-semibold">{p.permit_id}</span>
                    <span className={`text-xs ${p.is_trigger ? "font-semibold" : ""}`}>
                      {p.status === "completed" ? "Completed work (history)" : p.is_trigger ? "Triggered this case" : p === filedOrder[0] ? "Filed first" : STATUS_LABEL[p.status]}
                    </span>
                  </div>
                  <p className="mt-1 font-semibold">
                    {p.department} · {p.purpose}
                  </p>
                  <p className="mt-0.5 text-[13px]">
                    {fmtRange(p.proposed_start, p.proposed_end)} · {p.trench_depth_m} m deep · {p.road_side} side · {TRAFFIC_LABEL[p.traffic_impact] ?? lower(p.traffic_impact)}
                  </p>
                  <p className="mt-0.5 font-mono text-xs">
                    chainage {fmtMetres(p.chainage_start_m)}–{fmtMetres(p.chainage_end_m)} m · {fmtMetres(p.trench_length_m)} m long
                  </p>
                  {p.conditions.length > 0 && (
                    <ul className="mt-1.5 list-disc pl-4 text-xs">
                      {p.conditions.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
            {c.infraZones.map((z) => (
              <div key={z.id} className="flex items-start gap-3.5 border-2 border-dashed border-ink bg-card p-3">
                <div className="w-3.5 self-stretch border-2 border-ink bg-dept-metro" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-mono text-[13px] font-semibold">{z.id}</span>
                    <span className="text-xs">Infrastructure zone · position approximate</span>
                  </div>
                  <p className="mt-1 font-semibold">{z.project_name}</p>
                  <p className="mt-0.5 text-[13px]">
                    {z.agency} · {z.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs">Permits are synthetic demo data.</p>
        </section>
      </div>

      <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-6">
        <section className="card scroll-mt-4" id="rules">
          <h2 className="section-header">Rules fired</h2>
          <div className="flex flex-wrap gap-2">
            {c.rules.map((r) => (
              <span key={r.rule_id} title={`${r.trigger_text} → ${lower(r.action)}`} className={`border-2 border-ink px-2 py-[5px] font-mono text-xs ${ruleTone(r.action)}`}>
                {r.rule_id}
              </span>
            ))}
          </div>
          <p className="mt-3 text-[13px]">
            {humanize(c.spatial_classification)} · {lower(c.repeat_opening_classification)} · {c.criticality_flags.map(lower).join(", ") || "no critical context"}
          </p>
          {critical.length > 0 && (
            <p className="mt-1.5 text-[13px]">
              Within {fmtMetres(c.buffer_m)} m: {critical.map((f) => `${f.name ?? "unnamed"} (${lower(f.type)}, ${fmtMetres(f.distance_m)} m)`).join("; ")}
              {c.busRouteNames.length > 0 ? `; ${c.busRouteNames.length} PMPML route shapes` : ""}.
            </p>
          )}
        </section>

        <section className="card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-header !m-0">Why this matters</h2>
            {c.explanation && (
              <span className="border-2 border-ink px-1.5 py-0.5 text-[11px]">{c.explanation.provider === "template" ? "Template explanation" : "AI explanation · citations checked"}</span>
            )}
          </div>
          {c.explanation ? (
            <ExplanationText text={c.explanation.text} citations={Array.isArray(c.explanation.citations) ? (c.explanation.citations as { id: string; label: string; anchor: string }[]) : []} />
          ) : (
            <p className="text-[13px]">No explanation has been written for this case yet. The rules, facilities and strategies on this page are the full record.</p>
          )}
          {c.explanation && <p className="mt-2.5 text-xs">Explains the records on this page; it does not predict disruption. Each chip names the record a sentence rests on.</p>}
          {role && role !== "engineer" && c.status !== "decided" && <RegenerateExplanation caseId={c.id} hasExplanation={Boolean(c.explanation)} />}
        </section>

        <section className="card scroll-mt-4" id="strategies">
          <h2 className="section-header">Strategies</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[13px] [&_td]:border-2 [&_td]:border-ink [&_td]:px-2 [&_td]:py-2 [&_th]:border-2 [&_th]:border-ink [&_th]:bg-paper [&_th]:px-2 [&_th]:py-2 [&_th]:text-left [&_th]:text-[10px] [&_th]:uppercase [&_th]:leading-tight [&_th]:tracking-[0.04em]">
              <thead>
                <tr>
                  <th scope="col">Strategy</th>
                  <th scope="col">Repeat dig avoided</th>
                  <th scope="col">Schedule cost</th>
                  <th scope="col">Facility exposure</th>
                  <th scope="col">Coordi&shy;nation</th>
                  <th scope="col">Engi&shy;neering</th>
                </tr>
              </thead>
              <tbody>
                {c.strategies.map((s) => {
                  const weeks = shiftWeeks(s.schedule_shift_days);
                  return (
                    <tr key={s.strategy} className={s.recommended ? "bg-accent" : ""} title={s.rationale}>
                      <td>
                        {s.recommended ? <b>{STRATEGY_LABEL[s.strategy]}</b> : STRATEGY_LABEL[s.strategy]}
                        {s.recommended && (
                          <>
                            <br />
                            <span className="text-[11px] font-bold">RECOMMENDED</span>
                          </>
                        )}
                        {!s.feasible && (
                          <>
                            <br />
                            <span className="text-[11px]">Not feasible here</span>
                          </>
                        )}
                      </td>
                      <td>{humanize(s.ratings.repeat_excavation_avoided)}</td>
                      <td>
                        {humanize(s.ratings.schedule_cost)}
                        {weeks ? ` · ${weeks}` : ""}
                      </td>
                      <td>{humanize(s.ratings.critical_facility_exposure)}</td>
                      <td>{humanize(s.ratings.coordination_complexity)}</td>
                      <td>{humanize(s.ratings.engineering_feasibility)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {c.strategies.find((s) => s.recommended)?.conditions.map((x) => (
            <p key={x} className="mt-2.5 text-[13px]">
              Condition on the recommendation: {x}
            </p>
          ))}
          <p className="mt-2.5 text-xs">Ratings are ordinal levels computed from the records on this page. Engineering feasibility uses demo heuristics (road side, depth difference, gas and electricity separation).</p>
        </section>

        <section className="card">
          <h2 className="section-header">Decision</h2>
          {final ? (
            <div className="text-[14px]">
              <p>
                <b>{STRATEGY_LABEL[final.chosen_strategy]}</b>
                {final.is_override ? " (planner override)" : " (recommended)"}. Decided by {final.maker ?? "planner"} on {fmtDateTime(final.made_at)}; signed off by{" "}
                {final.checker ?? "supervisor"} on {fmtDateTime(final.checked_at!)}.
              </p>
              {final.override_reason && <p className="mt-1.5">Override reason: {final.override_reason}</p>}
              {final.checker_note && <p className="mt-1.5">Checker note: {final.checker_note}</p>}
              {c.notice_id && (
                <p className="mt-3">
                  <Link href={`/public/notice/${c.notice_id}`} className="btn">
                    Open the public notice
                  </Link>
                </p>
              )}
            </div>
          ) : pending ? (
            <div>
              <p className="mb-3 border-2 border-ink bg-status-escalated p-2.5 text-[13px]">
                {pending.maker ?? "The planner"} chose <b>{lower(STRATEGY_LABEL[pending.chosen_strategy])}</b>
                {pending.is_override ? ", overriding the recommendation" : ", the recommendation"}, on {fmtDateTime(pending.made_at)}.
                {pending.override_reason ? ` Reason: ${pending.override_reason}` : ""}
              </p>
              {role === "supervisor" ? <SupervisorSignOff caseId={c.id} /> : <p className="text-[13px]">Waiting for a supervisor to sign off. Use &ldquo;Viewing as&rdquo; in the header to switch to Supervisor.</p>}
            </div>
          ) : role === "planner" ? (
            <PlannerDecision caseId={c.id} recommended={c.recommended_strategy} options={c.strategies.map((s) => ({ strategy: s.strategy, feasible: s.feasible }))} />
          ) : (
            <p className="text-[13px]">
              The corridor planner decides this case. Use &ldquo;Viewing as&rdquo; in the header to switch to Corridor planner. The recommendation is{" "}
              <b>{lower(STRATEGY_LABEL[c.recommended_strategy])}</b>.
            </p>
          )}
          {sentBack.map((d) => (
            <p key={d.id} className="mt-3 border-t-2 border-ink pt-2.5 text-[13px]">
              Sent back on {fmtDateTime(d.checked_at!)} by {d.checker ?? "supervisor"}: {lower(STRATEGY_LABEL[d.chosen_strategy])}. Note: {d.checker_note}
            </p>
          ))}
        </section>
      </div>
    </div>
  );
}

function Tasks({ c, now }: { c: CaseDetail; now: Date }) {
  if (!c.tasks.length) return <section className="card"><p>No tasks were created for this case.</p></section>;
  return (
    <section className="card">
      <h2 className="section-header">Tasks</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[13px] [&_td]:border-2 [&_td]:border-ink [&_td]:px-2.5 [&_td]:py-2 [&_td]:align-top [&_th]:border-2 [&_th]:border-ink [&_th]:bg-paper [&_th]:px-2.5 [&_th]:py-2 [&_th]:text-left [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-[0.06em]">
          <thead>
            <tr><th scope="col">Task</th><th scope="col">For</th><th scope="col">Due</th><th scope="col">Status</th></tr>
          </thead>
          <tbody>
            {c.tasks.map((t) => {
              const sla = t.status === "open" ? slaText(t.due_at, now) : null;
              return (
                <tr key={t.id}>
                  <td>
                    {t.title}
                    {t.response?.action && (
                      <span className="mt-1 block text-xs">
                        Response: {t.response.action === "confirm" ? "dates confirmed" : t.response.proposed_start && t.response.proposed_end ? `proposed ${fmtRange(t.response.proposed_start, t.response.proposed_end)}` : "proposed new dates"}
                        {t.response.note ? `. Note: ${t.response.note}` : ""}
                      </span>
                    )}
                  </td>
                  <td>{t.department ?? humanize(t.assignee_role)}</td>
                  <td>{t.due_at ? fmtDateTime(t.due_at) : "No deadline"}</td>
                  <td>
                    <span className={`chip !text-xs ${t.status === "open" ? (sla?.overdue ? "bg-status-block-tint" : "bg-status-coord") : "bg-status-ok"}`}>
                      {t.status === "open" ? (sla ? `Open · ${sla.text}` : "Open") : humanize(t.status)}
                    </span>
                    {t.escalated_at && <span className="chip ml-1.5 bg-status-escalated !text-xs">Escalated</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AuditTrail({ c }: { c: CaseDetail }) {
  const detail = (after: Record<string, unknown> | null) => {
    if (!after) return [];
    const out: string[] = [];
    if (after.chosen_strategy) out.push(`Strategy: ${lower(String(after.chosen_strategy))}`);
    if (after.decision) out.push(`Decision: ${lower(String(after.decision))}`);
    if (after.status) out.push(`Status: ${lower(String(after.status))}`);
    if (after.proposed_start && after.proposed_end) out.push(`Dates: ${fmtRange(String(after.proposed_start), String(after.proposed_end))}`);
    if (after.reason) out.push(`Reason: ${after.reason}`);
    if (after.note) out.push(`Note: ${after.note}`);
    if (after.permit_id) out.push(`Permit: ${after.permit_id}`);
    return out;
  };
  return (
    <section className="card">
      <h2 className="section-header">Audit trail</h2>
      <ol className="flex flex-col">
        {c.audit.map((a) => {
          const rules = Array.isArray(a.after?.rule_ids) ? (a.after!.rule_ids as string[]) : [];
          return (
            <li key={a.id} className="grid grid-cols-1 gap-x-4 gap-y-1 border-t-2 border-ink py-2.5 first:border-t-0 sm:grid-cols-[150px_1fr]">
              <span className="font-mono text-xs">{fmtDateTime(a.at)}</span>
              <div className="min-w-0 text-[13px]">
                <p>
                  <b>{humanize(a.action)}</b> · <span className="font-mono text-xs">{a.entity_id.length > 30 ? `task ${a.entity_id.slice(0, 8)}` : a.entity_id}</span>
                </p>
                <p className="text-xs">
                  {a.actor ?? "System"} ({a.actor_role})
                </p>
                {detail(a.after).map((line) => (
                  <p key={line} className="mt-0.5 break-words text-xs">{line}</p>
                ))}
                {rules.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-1">
                    {rules.map((r) => (
                      <span key={r} className="cite">{r}</span>
                    ))}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs">The audit log is append-only: entries cannot be edited or deleted.</p>
    </section>
  );
}

async function CaseScreen({ params, searchParams }: Pick<PageProps<"/cases/[id]">, "params" | "searchParams">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  await connection();
  const caseRef = decodeURIComponent(id);
  let c: CaseDetail | null;
  let user;
  try {
    [c, user] = await Promise.all([getCaseDetail(caseRef), getSessionUser()]);
  } catch {
    return (
      <>
        <SiteHeader active="/cases" />
        <main className="mx-auto w-full max-w-[1280px] px-6 pb-12 pt-7">
          <section className="card" role="alert">
            <h1 className="!text-2xl">This case could not be loaded</h1>
            <p className="mt-2">The database did not respond. Reload the page; if it keeps happening, check the connection with <span className="font-mono text-[13px]">npm run db:ping</span>.</p>
          </section>
        </main>
      </>
    );
  }
  if (!c) {
    return (
      <>
        <SiteHeader active="/cases" />
        <main className="mx-auto w-full max-w-[1280px] px-6 pb-12 pt-7">
          <section className="card">
            <h1 className="!text-2xl">No case called {caseRef}</h1>
            <p className="mt-2">It may have been removed by a demo reset.</p>
            <p className="mt-4"><Link href="/cases" className="btn">Back to all cases</Link></p>
          </section>
        </main>
      </>
    );
  }
  const now = demoNow();
  const tab = TABS.find((t) => t.key === query.tab)?.key ?? "overview";
  const sla = c.status === "decided" ? null : slaText(c.sla_due_at, now);
  const openTasks = c.tasks.filter((t) => t.status === "open").length;

  return (
    <>
      <SiteHeader active="/cases" returnTo={`/cases/${c.case_ref}`} />
      <main className="mx-auto w-full max-w-[1280px] px-6 pb-12 pt-7">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
              <span className="chip font-mono font-semibold">{c.case_ref}</span>
              <span className={`chip font-semibold ${statusTone(c.status)}`}>{STATUS_LABEL[c.status] ?? humanize(c.status)}</span>
              {sla && <span className={`chip ${sla.overdue ? "bg-status-block-tint font-semibold" : ""}`}>SLA: {sla.text}</span>}
            </div>
            <h1>{c.title}</h1>
            <p className="mt-2 text-[15px]">
              {c.road_name} · chainage {fmtMetres(c.chainage_start_m)}–{fmtMetres(c.chainage_end_m)} m · {c.wards.length ? `Ward ${c.wards.join(", ")}` : "ward not resolved"}
            </p>
          </div>
          <Link href="/corridors" className="btn">
            Open corridor
          </Link>
        </div>

        {isPermitId(query.filed) && (
          <p role="status" className="mb-6 border-[2.5px] border-ink bg-status-ok p-3 text-sm">
            Permit <span className="font-mono font-semibold">{query.filed}</span> was filed. It overlaps other work on this stretch, so it is held in this coordination case until a planner decides.
            {typeof query.docs === "string" ? ` Some documents were not stored: ${query.docs.slice(0, 300)}.` : ""}
          </p>
        )}

        <nav aria-label="Case sections" className="mb-6 flex flex-wrap gap-1.5 border-b-[2.5px] border-ink">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.key === "overview" ? `/cases/${c.case_ref}` : `/cases/${c.case_ref}?tab=${t.key}`}
              aria-current={tab === t.key ? "page" : undefined}
              className={`-mb-[2.5px] flex min-h-[44px] items-center border-[2.5px] px-4 text-sm no-underline ${tab === t.key ? "border-ink border-b-paper bg-paper font-semibold" : "border-transparent font-medium"}`}
            >
              {t.label}
              {t.key === "tasks" && openTasks > 0 ? ` (${openTasks} open)` : ""}
            </Link>
          ))}
        </nav>

        {tab === "overview" && <Overview c={c} role={user?.role ?? null} />}
        {tab === "tasks" && <Tasks c={c} now={now} />}
        {tab === "audit" && <AuditTrail c={c} />}
      </main>
    </>
  );
}

function Loading() {
  return (
    <>
      <SiteHeader active="/cases" />
      <main className="mx-auto w-full max-w-[1280px] px-6 pb-12 pt-7">
        <p className="chip">Loading case…</p>
      </main>
    </>
  );
}

export default function CasePage(props: PageProps<"/cases/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <CaseScreen params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}
