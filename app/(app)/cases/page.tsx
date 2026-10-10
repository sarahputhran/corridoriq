import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { listCases, type CaseListItem } from "@/lib/db/cases";
import { demoNow } from "@/lib/demo-clock";
import { STATUS_LABEL, STRATEGY_LABEL, fmtMetres, humanize, slaText, statusTone } from "@/lib/format";

export const metadata: Metadata = { title: "Coordination cases | CorridorIQ" };

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "decided", label: "Decided" },
  { key: "all", label: "All" },
] as const;

async function CaseQueue({ searchParams }: Pick<PageProps<"/cases">, "searchParams">) {
  const query = await searchParams;
  await connection();
  let cases: CaseListItem[];
  try {
    cases = await listCases();
  } catch {
    return (
      <section className="card" role="alert">
        <h2 className="section-header">Could not load cases</h2>
        <p>The database did not respond. Reload the page; if it keeps happening, check the connection with <span className="font-mono text-[13px]">npm run db:ping</span>.</p>
      </section>
    );
  }
  const now = demoNow();
  const status = FILTERS.find((f) => f.key === query.status)?.key ?? "open";
  const flag = typeof query.flag === "string" ? query.flag : "";
  const ward = typeof query.ward === "string" ? query.ward : "";
  const flags = [...new Set(cases.flatMap((c) => c.criticality_flags))].sort();
  const wards = [...new Set(cases.flatMap((c) => c.wards))].sort();
  const shown = cases.filter(
    (c) =>
      (status === "all" || (status === "decided") === ["decided", "closed"].includes(c.status)) &&
      (!flag || c.criticality_flags.includes(flag)) &&
      (!ward || c.wards.includes(ward)),
  );
  const href = (next: Record<string, string>) => {
    const p = new URLSearchParams({ ...(status !== "open" ? { status } : {}), ...(flag ? { flag } : {}), ...(ward ? { ward } : {}), ...next });
    for (const [k, v] of [...p]) if (!v || (k === "status" && v === "open")) p.delete(k);
    const s = p.toString();
    return s ? `/cases?${s}` : "/cases";
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px]">
        <div className="flex items-center gap-1.5" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <Link key={f.key} href={href({ status: f.key })} aria-current={status === f.key ? "true" : undefined} className={`flex min-h-[36px] items-center border-2 border-ink px-3 no-underline ${status === f.key ? "bg-ink font-semibold !text-white" : "bg-card"}`}>
              {f.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by flag">
          <span className="font-semibold">Flag</span>
          <Link href={href({ flag: "" })} className={`flex min-h-[36px] items-center border-2 border-ink px-2.5 no-underline ${!flag ? "bg-ink !text-white" : "bg-card"}`}>Any</Link>
          {flags.map((f) => (
            <Link key={f} href={href({ flag: f })} className={`flex min-h-[36px] items-center border-2 border-ink px-2.5 no-underline ${flag === f ? "bg-ink !text-white" : "bg-card"}`}>
              {humanize(f)}
            </Link>
          ))}
        </div>
        {wards.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by ward">
            <span className="font-semibold">Ward</span>
            <Link href={href({ ward: "" })} className={`flex min-h-[36px] items-center border-2 border-ink px-2.5 no-underline ${!ward ? "bg-ink !text-white" : "bg-card"}`}>Any</Link>
            {wards.map((w) => (
              <Link key={w} href={href({ ward: w })} className={`flex min-h-[36px] items-center border-2 border-ink px-2.5 no-underline ${ward === w ? "bg-ink !text-white" : "bg-card"}`}>
                {w}
              </Link>
            ))}
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <section className="card">
          <h2 className="section-header">{cases.length === 0 ? "No coordination cases yet" : "No cases match these filters"}</h2>
          <p>{cases.length === 0 ? "A case opens when a new permit overlaps planned or recent work on the same stretch. File a permit to see one." : "Clear a filter to see more."}</p>
          <p className="mt-4">
            <Link href={cases.length === 0 ? "/permits/new" : "/cases?status=all"} className="btn">{cases.length === 0 ? "File a permit" : "Show all cases"}</Link>
          </p>
        </section>
      ) : (
        <section className="card overflow-hidden !p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-[13px] [&_td]:border-b-2 [&_td]:border-ink [&_td]:px-3.5 [&_td]:py-3 [&_td]:align-top [&_th]:border-b-[2.5px] [&_th]:border-ink [&_th]:bg-paper [&_th]:px-3.5 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-[0.06em] [&_tr:last-child_td]:border-b-0">
              <thead>
                <tr>
                  <th scope="col">Case</th><th scope="col">What</th><th scope="col">Flags</th><th scope="col">Rules</th><th scope="col">SLA</th><th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => {
                  const sla = ["decided", "closed"].includes(c.status) ? null : slaText(c.sla_due_at, now);
                  return (
                    <tr key={c.id}>
                      <td><Link href={`/cases/${c.case_ref}`} className="whitespace-nowrap font-mono font-semibold">{c.case_ref}</Link></td>
                      <td>
                        <Link href={`/cases/${c.case_ref}`} className="font-semibold no-underline hover:underline">{c.title}</Link>
                        <span className="mt-0.5 block text-xs">
                          chainage {fmtMetres(c.chainage_start_m)}–{fmtMetres(c.chainage_end_m)} m · {c.permit_count} permits · recommends {STRATEGY_LABEL[c.recommended_strategy].toLowerCase()}
                        </span>
                      </td>
                      <td>{c.criticality_flags.map(humanize).join(", ") || "None"}</td>
                      <td className="font-mono">{c.rule_count}</td>
                      <td className={sla?.overdue ? "font-semibold text-status-block-text" : ""}>{sla ? humanize(sla.text) : "Closed"}</td>
                      <td><span className={`chip !text-xs font-semibold ${statusTone(c.status)}`}>{STATUS_LABEL[c.status] ?? humanize(c.status)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

export default function CasesPage(props: PageProps<"/cases">) {
  return (
    <>
      <SiteHeader active="/cases" />
      <main className="mx-auto w-full max-w-[1280px] px-6 pb-12 pt-7">
        <h1 className="mb-2">Coordination cases</h1>
        <p className="mb-6 max-w-2xl text-[15px]">Stretches of road where a new permit overlaps planned or recent work. Sorted by time left to decide.</p>
        <Suspense fallback={<p className="chip">Loading cases…</p>}>
          <CaseQueue searchParams={props.searchParams} />
        </Suspense>
      </main>
    </>
  );
}
