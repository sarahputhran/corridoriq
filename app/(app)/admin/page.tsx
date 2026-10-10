import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { EscalateButton, RerunPanel, ResetButton, RuleEditor } from "@/components/admin/AdminControls";
import { SiteHeader } from "@/components/SiteHeader";
import { getSessionUser } from "@/lib/auth/session";
import { listGrievances, listRules, listSegments } from "@/lib/db/admin";
import { fmtDateTime, fmtMetres, humanize } from "@/lib/format";

export const metadata: Metadata = { title: "Admin | CorridorIQ" };

const table =
  "w-full border-collapse text-[13px] [&_td]:border-b-2 [&_td]:border-ink [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top [&_th]:border-b-[2.5px] [&_th]:border-ink [&_th]:bg-paper [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-[0.06em] [&_tr:last-child_td]:border-b-0";

async function Admin() {
  await connection();
  const user = await getSessionUser().catch(() => null);
  if (user?.role !== "admin") {
    return (
      <section className="card max-w-2xl">
        <h2 className="section-header">Administrator only</h2>
        <p>Rule settings, the demo reset and the segment list are for the administrator. Use &ldquo;Viewing as&rdquo; in the header and pick Administrator.</p>
      </section>
    );
  }
  let rules, segments, grievances;
  try {
    [rules, segments, grievances] = await Promise.all([listRules(), listSegments(), listGrievances()]);
  } catch {
    return (
      <section className="card" role="alert">
        <h2 className="section-header">Admin data could not load</h2>
        <p>The database did not respond. Reload the page to try again.</p>
      </section>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <section className="card" id="demo">
        <h2 className="section-header">Demo controls</h2>
        <div className="grid gap-5 md:grid-cols-3">
          <div>
            <p className="mb-2.5 text-[13px]">Put every permit, case, task and notice back to the starting story. Takes about a minute.</p>
            <ResetButton />
          </div>
          <div>
            <p className="mb-2.5 text-[13px]">Escalate every task that is past its due time to the supervisor. The database also does this by itself every 15 minutes.</p>
            <EscalateButton />
          </div>
          <div>
            <p className="mb-2.5 text-[13px]">Runs the engine again on every open permit, with the rules and the road as they are now. A result can differ because you edited a rule, or because other permits were filed after it was stored. Nothing is saved.</p>
            <RerunPanel />
          </div>
        </div>
      </section>

      <section className="card" id="rules">
        <h2 className="section-header">Rules ({rules.length})</h2>
        <p className="mb-4 max-w-3xl text-[13px]">Thresholds live here, not in the code. Change a number or switch a rule off, save, and the next pre-check or filing uses it. Every edit is written to the audit log.</p>
        <div className="flex flex-col gap-3">
          {rules.map((r) => (
            <details key={r.rule_id} className="border-2 border-ink bg-card">
              <summary className="flex min-h-[48px] cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="font-mono text-[13px] font-semibold">{r.rule_id}</span>
                <span className={`chip !py-0 !text-[11px] font-semibold ${r.enabled ? "bg-status-ok" : "bg-status-block-tint"}`}>{r.enabled ? "On" : "Off"}</span>
                <span className="text-xs">
                  {humanize(r.action)} · {r.severity.toLowerCase()} · fired {r.hits} {r.hits === 1 ? "time" : "times"}
                </span>
              </summary>
              <div className="grid gap-4 border-t-2 border-ink p-3 md:grid-cols-2">
                <dl className="text-[13px] [&_dd]:mb-2 [&_dt]:text-[11px] [&_dt]:font-bold [&_dt]:uppercase [&_dt]:tracking-[0.06em]">
                  <dt>Fires when</dt>
                  <dd>{r.trigger_text}</dd>
                  <dt>Threshold as written in the source</dt>
                  <dd>{r.threshold_text ?? "Not stated"}</dd>
                  <dt>Source</dt>
                  <dd>{r.source}</dd>
                  <dt>Kind</dt>
                  <dd>{humanize(r.provenance)}</dd>
                </dl>
                <RuleEditor ruleId={r.rule_id} enabled={r.enabled} params={r.params} />
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="card overflow-hidden !p-0" id="segments">
        <h2 className="section-header !m-0 border-b-[2.5px] border-ink px-5 py-3.5">Road segments ({segments.length})</h2>
        <div className="overflow-x-auto">
          <table className={`${table} min-w-[720px]`}>
            <thead>
              <tr>
                <th scope="col">Segment</th><th scope="col">Chainage</th><th scope="col">Ward</th><th scope="col">Zone</th><th scope="col">Surface</th><th scope="col">Width</th><th scope="col">Permits</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((s) => (
                <tr key={s.id}>
                  <td className="font-mono font-semibold">{s.id}</td>
                  <td className="whitespace-nowrap font-mono text-xs">{fmtMetres(s.chainage_start_m)} to {fmtMetres(s.chainage_end_m)} m</td>
                  <td>{s.ward ?? "Not resolved"}</td>
                  <td>{s.admin_zone ?? "Not resolved"}</td>
                  <td>
                    {humanize(s.surface)}
                    {s.protected && <span className="chip ml-2 !py-0 !text-[11px] font-semibold">Protected</span>}
                  </td>
                  <td className="font-mono text-xs">{s.width_m} m</td>
                  <td className="font-mono text-xs">{s.permits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t-2 border-ink px-5 py-2.5 text-xs">
          Read only. Segments are built from OpenStreetMap; restored and protected stretches are synthetic. <Link href="/corridors">See them on the map</Link>.
        </p>
      </section>

      <section className="card" id="grievances">
        <h2 className="section-header">Problems reported by citizens ({grievances.length})</h2>
        {grievances.length === 0 ? (
          <p className="text-[13px]">Nobody has reported a problem yet. Reports come from the &ldquo;Report a problem&rdquo; button on a public notice.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {grievances.map((g) => (
              <li key={g.id} className="border-2 border-ink p-3 text-[13px]">
                <p className="text-xs">
                  {fmtDateTime(g.created_at)} · {g.name ?? "No name given"} ·{" "}
                  {g.notice_id ? <Link href={`/public/notice/${g.notice_id}`} className="font-mono">{g.reference}</Link> : "notice removed"}
                </p>
                <p className="mt-1 break-words">{g.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function AdminPage() {
  return (
    <>
      <SiteHeader returnTo="/admin" />
      <main className="mx-auto w-full max-w-[1280px] px-6 pb-12 pt-7">
        <h1 className="mb-6">Admin</h1>
        <Suspense fallback={<p className="chip">Loading admin…</p>}>
          <Admin />
        </Suspense>
      </main>
    </>
  );
}
