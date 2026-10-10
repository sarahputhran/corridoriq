import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { RuleActivityChart, WardChart } from "@/components/charts/DashboardCharts";
import { SiteHeader } from "@/components/SiteHeader";
import { features } from "@/config/features";
import { getDashboardData } from "@/lib/db/admin";

export const metadata: Metadata = { title: "Dashboard | CorridorIQ" };

function Stat({ label, value, note, source }: { label: string; value: string; note: string; source: string }) {
  return (
    <section className="card" title={source}>
      <h2 className="section-header">{label}</h2>
      <p className="font-mono text-[34px] font-semibold leading-none">{value}</p>
      <p className="mt-2.5 text-[13px]">{note}</p>
      <p className="mt-2 text-xs">{source}</p>
    </section>
  );
}

async function Dashboard() {
  await connection();
  let d;
  try {
    d = await getDashboardData();
  } catch {
    return (
      <section className="card" role="alert">
        <h2 className="section-header">The dashboard could not load</h2>
        <p>The database did not respond. Reload the page to try again.</p>
      </section>
    );
  }
  if (d.totals.evaluations === 0) {
    return (
      <section className="card max-w-2xl">
        <h2 className="section-header">Nothing to count yet</h2>
        <p>The dashboard fills in once permits have been filed and evaluated. An administrator can reset the demo to load the starting story.</p>
      </section>
    );
  }
  const hours = d.turnaround.medianHours;
  const turnaround = hours == null ? "None yet" : hours >= 48 ? `${Math.round(hours / 24)} days` : `${Math.round(hours)} h`;
  return (
    <div className="flex flex-col gap-6">
      {features.syntheticHistory && <p className="border-[2.5px] border-ink bg-warn-tint p-3 text-sm font-semibold">Includes synthetic history.</p>}
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Repeat openings avoided"
          value={String(d.repeatOpeningsAvoided.count)}
          note="Decided cases where works were joined or resequenced. Each one is a stretch that is opened once instead of again."
          source={`Based on decisions in this demo. Computed from ${d.repeatOpeningsAvoided.decided} signed-off ${d.repeatOpeningsAvoided.decided === 1 ? "decision" : "decisions"}.`}
        />
        <Stat
          label="Notices issued"
          value={`${d.notices.combined + d.notices.single}`}
          note={`${d.notices.combined} combined ${d.notices.combined === 1 ? "notice covers" : "notices cover"} ${d.notices.combinedPermits} permits. ${d.notices.single} ${d.notices.single === 1 ? "notice is" : "notices are"} for a single permit.`}
          source={`Computed from ${d.notices.combined + d.notices.single} published notices.`}
        />
        <Stat
          label="Decision turnaround"
          value={turnaround}
          note={`Median time from a case opening to supervisor sign-off. ${d.turnaround.escalations} ${d.turnaround.escalations === 1 ? "task has" : "tasks have"} been escalated for running late.`}
          source={`Computed from ${d.turnaround.decided} signed-off ${d.turnaround.decided === 1 ? "case" : "cases"}, on the demo clock.`}
        />
        <Stat
          label="Audit completeness"
          value={`${d.audit.complete} of ${d.audit.total}`}
          note="Signed-off decisions that record the rules, the strategy, who decided, who checked, and a reason when the planner overrode the recommendation."
          source={`Computed from ${d.audit.total} signed-off ${d.audit.total === 1 ? "decision" : "decisions"}.`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="section-header">Coordination by ward</h2>
          <p className="mb-3 text-[13px]">Of the permits the engine evaluated in each ward, how many went into a coordination case.</p>
          <WardChart data={d.wards.map((w) => ({ ward: w.ward, coordinated: w.coordinated, other: w.evaluated - w.coordinated }))} />
          <p className="mt-2 text-xs">Computed from {d.totals.evaluations} evaluated permits. A permit counts for the ward its midpoint falls in.</p>
        </section>
        <section className="card">
          <h2 className="section-header">Rule activity</h2>
          <p className="mb-3 text-[13px]">How many times each rule fired.</p>
          <RuleActivityChart data={d.ruleActivity} />
          <p className="mt-2 text-xs">Computed from {d.totals.ruleHits} rule hits across {d.totals.evaluations} evaluations.</p>
        </section>
      </div>
      <p className="text-xs">Every figure is a count of records in this demo. The permits are synthetic, and nothing here is a forecast.</p>
    </div>
  );
}

export default function DashboardPage() {
  if (!features.dashboard) notFound();
  return (
    <>
      <SiteHeader active="/dashboard" />
      <main className="mx-auto w-full max-w-[1280px] px-6 pb-12 pt-7">
        <h1 className="mb-6">Dashboard</h1>
        <Suspense fallback={<p className="chip">Loading dashboard…</p>}>
          <Dashboard />
        </Suspense>
      </main>
    </>
  );
}
