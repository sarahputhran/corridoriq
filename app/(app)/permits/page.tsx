import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { getSessionUser } from "@/lib/auth/session";
import { listPermits, type PermitListItem } from "@/lib/db/tasks";
import { STATUS_LABEL, fmtMetres, fmtRange, humanize, statusTone, isPermitId } from "@/lib/format";

export const metadata: Metadata = { title: "Permits | CorridorIQ" };

async function PermitTable({ searchParams }: Pick<PageProps<"/permits">, "searchParams">) {
  const query = await searchParams;
  await connection();
  let permits: PermitListItem[];
  let user;
  try {
    user = await getSessionUser();
    // An engineer sees their own department's permits; everyone else sees the whole corridor.
    permits = await listPermits(user?.role === "engineer" ? user.department_id : null);
  } catch {
    return (
      <section className="card" role="alert">
        <h2 className="section-header">Could not load permits</h2>
        <p>The database did not respond. Reload the page to try again.</p>
      </section>
    );
  }
  if (!permits.length) {
    return (
      <section className="card">
        <h2 className="section-header">No permits yet</h2>
        <p>{user?.role === "engineer" ? "Your department has not filed any permits." : "No permits have been filed on this corridor."}</p>
      </section>
    );
  }
  const filed = isPermitId(query.filed) ? permits.find((p) => p.permit_id === query.filed) : undefined;
  return (
    <>
      {filed && (
        <p role="status" className="mb-5 border-[2.5px] border-ink bg-status-ok p-3 text-sm">
          Permit <span className="font-mono font-semibold">{filed.permit_id}</span> was saved. Status: {(STATUS_LABEL[filed.status] ?? humanize(filed.status)).toLowerCase()}.
        </p>
      )}
      <p className="mb-5 text-[15px]">
        {user?.role === "engineer" ? `Permits filed by ${user.department_name}.` : "Every permit on the corridor, newest first."} All permits are synthetic demo data.
      </p>
      <section className="card overflow-hidden !p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[13px] [&_td]:border-b-2 [&_td]:border-ink [&_td]:px-3.5 [&_td]:py-3 [&_td]:align-top [&_th]:border-b-[2.5px] [&_th]:border-ink [&_th]:bg-paper [&_th]:px-3.5 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-[0.06em] [&_tr:last-child_td]:border-b-0">
            <thead>
              <tr><th scope="col">Permit</th><th scope="col">Work</th><th scope="col">Dates</th><th scope="col">Where</th><th scope="col">Rules</th><th scope="col">Status</th></tr>
            </thead>
            <tbody>
              {permits.map((p) => (
                <tr key={p.permit_id}>
                  <td className="whitespace-nowrap font-mono font-semibold">{p.permit_id}</td>
                  <td>
                    <span className="flex items-center gap-2 font-semibold">
                      <span className="h-3 w-5 shrink-0 border-2 border-ink" style={{ background: p.color }} />
                      {p.department}
                    </span>
                    <span className="mt-0.5 block">{p.purpose}</span>
                  </td>
                  <td className="whitespace-nowrap">{fmtRange(p.proposed_start, p.proposed_end)}</td>
                  <td className="whitespace-nowrap font-mono text-xs">
                    {fmtMetres(p.chainage_start_m)}–{fmtMetres(p.chainage_end_m)} m · {p.road_side}
                  </td>
                  <td className="font-mono text-xs">{p.rule_ids.length ? p.rule_ids.length : "0"}</td>
                  <td>
                    <span className={`chip !text-xs font-semibold ${statusTone(p.status)}`}>{STATUS_LABEL[p.status] ?? humanize(p.status)}</span>
                    {p.case_ref && (
                      <Link href={`/cases/${p.case_ref}`} className="mt-1.5 block font-mono text-xs font-semibold">{p.case_ref}</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export default function PermitsPage(props: PageProps<"/permits">) {
  return (
    <>
      <SiteHeader active="/permits" />
      <main className="mx-auto w-full max-w-[1280px] px-6 pb-12 pt-7">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-4">
          <h1>Permits</h1>
          <Link href="/permits/new" className="btn btn-primary">File a permit</Link>
        </div>
        <Suspense fallback={<p className="chip mt-4">Loading permits…</p>}>
          <PermitTable searchParams={props.searchParams} />
        </Suspense>
      </main>
    </>
  );
}
