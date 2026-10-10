import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CorridorMap } from "@/components/map/CorridorMap";
import { PublicHeader } from "@/components/PublicHeader";
import { features } from "@/config/features";
import { listPublicWorks } from "@/lib/db/notices";
import { getDemoToday } from "@/lib/demo-date";
import { TRAFFIC_LABEL, fmtRange } from "@/lib/format";

export const metadata: Metadata = { title: "Road works on Sinhagad Road | CorridorIQ" };

async function Works() {
  await connection();
  let data;
  try {
    data = await listPublicWorks(getDemoToday());
  } catch {
    return (
      <section className="card !p-4" role="alert">
        <h2 className="section-header">The list could not load</h2>
        <p className="text-sm">Something went wrong on our side. Reload the page to try again.</p>
      </section>
    );
  }
  const { works, map } = data;
  if (!works.length) {
    return (
      <section className="card !p-4">
        <h2 className="section-header">No road works announced</h2>
        <p className="text-sm">There are no approved works on this road right now.</p>
      </section>
    );
  }
  return (
    // Phone: map, then the list. Wider screens: map on the left, list beside it.
    <div className={`grid gap-5 lg:items-start lg:gap-6 ${features.publicMap && map.bounds ? "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : ""}`}>
      {features.publicMap && map.bounds && (
        <section className="overflow-hidden border-[2.5px] border-ink bg-card shadow-card lg:sticky lg:top-4">
          <CorridorMap layers={map.layers} bounds={map.bounds} heightClass="h-[300px] md:h-[420px] lg:h-[600px]" ariaLabel="Map of approved road works on Sinhagad Road" />
        </section>
      )}
      <ul className={`grid gap-3.5 sm:grid-cols-2 ${features.publicMap && map.bounds ? "lg:grid-cols-1" : "lg:grid-cols-3"}`}>
        {works.map((w) => (
          <li key={w.notice_id}>
            <Link href={`/public/notice/${w.notice_id}`} className="block border-[2.5px] border-ink bg-card p-3.5 no-underline shadow-btn hover:bg-accent">
              {w.combined && <span className="mb-1.5 inline-block border-2 border-ink bg-accent px-1.5 text-[11px] font-bold">One notice for {w.permit_count} works</span>}
              <span className="block font-bold">{w.landmark ? `Near ${w.landmark}` : `${Math.round(w.chainage_start_m)} to ${Math.round(w.chainage_end_m)} m from Hingne`}</span>
              <span className="mt-0.5 block text-sm">
                {fmtRange(w.starts_on, w.ends_on)} · {TRAFFIC_LABEL[w.traffic_impact] ?? w.traffic_impact}
              </span>
              <span className="mt-0.5 block text-[13px]">{w.departments.join(", ")}</span>
              <span className="mt-1 block font-mono text-xs">{w.reference}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PublicWorksPage() {
  return (
    <main className="min-h-screen w-full bg-paper">
      <PublicHeader title="Road works on Sinhagad Road" />
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 p-[18px] lg:gap-6 lg:px-6 lg:py-7">
        <div>
          <h1 className="!text-[28px] md:!text-4xl">Upcoming road works</h1>
          <p className="mt-1.5 text-sm md:text-[15px]">Approved digging on Sinhagad Road, Hingne to Dandekar Bridge. Tap a notice for dates, traffic and who to contact.</p>
        </div>
        <Suspense fallback={<p className="chip">Loading works…</p>}>
          <Works />
        </Suspense>
        <p className="text-xs">Demo data. The permits in this prototype are made up, and Pune Municipal Corporation does not use this app. Map data © OpenStreetMap contributors.</p>
      </div>
    </main>
  );
}
