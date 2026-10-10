import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { TimeSpaceSection } from "@/components/charts/TimeSpaceSection";
import { CorridorMap } from "@/components/map/CorridorMap";
import { SiteHeader } from "@/components/SiteHeader";
import { pune } from "@/config/cities/pune";
import { DEPARTMENTS } from "@/config/departments";
import { getCorridorMapData } from "@/lib/db/map-data";

export const metadata: Metadata = { title: "Sinhagad Road corridor | CorridorIQ" };

const TOGGLES = [
  { key: "permits", label: "Permits", on: true },
  { key: "facilities", label: "Facilities", on: true },
  { key: "busStops", label: "Bus stops", on: true },
  { key: "busRoutes", label: "Bus routes", on: false },
  { key: "restorations", label: "Restored stretches", on: true },
  { key: "infraZones", label: "Infrastructure zones", on: true },
  { key: "segments", label: "Segment labels", on: false },
  { key: "wards", label: "Ward boundaries", on: true },
] as const;

async function CorridorMapSection() {
  await connection();
  let data;
  try {
    data = await getCorridorMapData(pune.corridor_id);
  } catch {
    return (
      <section className="card" role="alert">
        <h2 className="section-header">Could not load the corridor</h2>
        <p>The database did not respond. Check the connection settings with <span className="font-mono text-[13px]">npm run check:env</span>, then reload.</p>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="card">
        <h2 className="section-header">No corridor yet</h2>
        <p>The database has no corridor data. Run <span className="font-mono text-[13px]">npm run db:seed</span> to load the demo.</p>
      </section>
    );
  }
  const { corridor, counts } = data;
  return (
    <>
      <p className="mb-4 mt-10 text-[15px]">
        The same works on the map: {counts.permits} permits across {counts.segments} road segments. Permits are synthetic.
      </p>
      <div className="flex flex-wrap items-start gap-6">
        <section className="card min-w-0 flex-[1_1_620px] overflow-hidden !p-0">
          <div className="flex items-center justify-between border-b-[2.5px] border-ink px-5 py-3.5">
            <h2 className="section-header !m-0">Corridor map</h2>
            <span className="text-xs">Click a trench or marker for details</span>
          </div>
          <CorridorMap
            layers={data.layers}
            bounds={data.bounds}
            toggles={[...TOGGLES]}
            ariaLabel={`Map of ${corridor.road_name} from ${corridor.start_label} to ${corridor.end_label} with permits, facilities and bus stops`}
          />
        </section>
        <aside className="flex min-w-0 flex-[1_1_260px] flex-col gap-6">
          <section className="card">
            <h2 className="section-header">Departments</h2>
            <ul className="flex flex-col gap-2 text-[13px]">
              {DEPARTMENTS.map((d) => (
                <li key={d.id} className="flex items-center gap-2.5">
                  <span className="h-3 w-7 shrink-0 border-2 border-ink" style={{ background: d.color }} />
                  {d.name}
                </li>
              ))}
            </ul>
          </section>
          <section className="card">
            <h2 className="section-header">Legend</h2>
            <ul className="flex flex-col gap-2 text-[13px]">
              <li><span className="font-mono font-semibold">H</span> hospital · <span className="font-mono font-semibold">C</span> clinic · <span className="font-mono font-semibold">S</span> school</li>
              <li><span className="font-mono font-semibold">W</span> place of worship · <span className="font-mono font-semibold">P</span> police · <span className="font-mono font-semibold">F</span> fire station</li>
              <li>White circle: bus stop. Small dot: shop or office.</li>
              <li className="flex items-center gap-2.5"><span className="h-3 w-7 shrink-0 border-2 border-ink bg-[#A9A59B]" /> Restored stretch (synthetic)</li>
              <li className="flex items-center gap-2.5"><span className="h-3 w-7 shrink-0 border-2 border-ink bg-[#6B6B6B]" /> Protected stretch (synthetic)</li>
              <li className="flex items-center gap-2.5"><span className="h-3 w-7 shrink-0 border-2 border-dashed border-ink bg-dept-metro" /> Infrastructure zone (approximate)</li>
              <li>Trenches are drawn left or right of the road line by road side.</li>
            </ul>
          </section>
          <section className="card">
            <h2 className="section-header">On this map</h2>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[13px]">
              <dt>Facilities within 400 m</dt><dd className="font-mono">{counts.facilities}</dd>
              <dt>Bus stops on the road</dt><dd className="font-mono">{counts.busStops}</dd>
              <dt>Bus route shapes</dt><dd className="font-mono">{counts.busRoutes}</dd>
              <dt>Restored stretches</dt><dd className="font-mono">{counts.restorations}</dd>
              <dt>Infrastructure zones</dt><dd className="font-mono">{counts.infraZones}</dd>
            </dl>
            <p className="mt-3 text-xs">Roads, facilities and bus data are real (OpenStreetMap, PMPML). Permits and restorations are synthetic.</p>
          </section>
        </aside>
      </div>
    </>
  );
}

async function Schedule({ searchParams }: Pick<PageProps<"/corridors">, "searchParams">) {
  const query = await searchParams;
  return <TimeSpaceSection range={typeof query.range === "string" ? query.range : undefined} />;
}

export default function CorridorsPage(props: PageProps<"/corridors">) {
  return (
    <>
      <SiteHeader active="/corridors" />
      <main className="mx-auto w-full max-w-[1280px] px-6 pb-12 pt-7">
        <Suspense fallback={<p className="chip">Loading corridor schedule…</p>}>
          <Schedule searchParams={props.searchParams} />
        </Suspense>
        <Suspense fallback={<p className="chip mt-8">Loading map…</p>}>
          <CorridorMapSection />
        </Suspense>
      </main>
    </>
  );
}
