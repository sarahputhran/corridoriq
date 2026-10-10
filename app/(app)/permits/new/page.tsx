import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { FilePermitForm, type FormDefaults } from "@/components/permits/FilePermitForm";
import { SiteHeader } from "@/components/SiteHeader";
import { pune } from "@/config/cities/pune";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getCorridorMapData } from "@/lib/db/map-data";
import { getDemoToday } from "@/lib/demo-date";

export const metadata: Metadata = { title: "File a permit | CorridorIQ" };

const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The landing page's "Try filing a permit": an Airtel duct beside the hero stretch, so the pre-check has something to say. */
async function exampleTrench() {
  const [row] = await db()`
    select st_x(st_startpoint(p.geom)) as start_lng, st_y(st_startpoint(p.geom)) as start_lat, st_x(st_endpoint(p.geom)) as end_lng, st_y(st_endpoint(p.geom)) as end_lat
    from permits p where p.permit_id = 'PMC/RC/2026/0024'`;
  return row ? { start: { lng: Number(Number(row.start_lng).toFixed(7)), lat: Number(Number(row.start_lat).toFixed(7)) }, end: { lng: Number(Number(row.end_lng).toFixed(7)), lat: Number(Number(row.end_lat).toFixed(7)) } } : null;
}

async function FileScreen({ searchParams }: Pick<PageProps<"/permits/new">, "searchParams">) {
  const query = await searchParams;
  await connection();
  let data;
  let user;
  let example = null;
  try {
    [data, user] = await Promise.all([getCorridorMapData(pune.corridor_id), getSessionUser()]);
    if (query.example === "hospital") example = await exampleTrench();
  } catch {
    data = null;
  }
  if (!data) {
    return (
      <section className="card" role="alert">
        <h2 className="section-header">The form could not load</h2>
        <p>The corridor data did not load from the database. Reload the page to try again.</p>
      </section>
    );
  }
  const today = getDemoToday();
  const engineer = user?.role === "engineer" ? user : null;
  const defaults: FormDefaults = {
    department_id: engineer?.department_id ?? (example ? "airtel" : "jio"),
    purpose: example ? "OFC duct laying for new FTTH connections" : "",
    work_type: "routine",
    proposed_start: addDays(today, example ? 32 : 30),
    proposed_end: addDays(today, example ? 40 : 40),
    trench_depth_m: "0.6",
    trench_width_m: "0.5",
    road_side: "left",
    traffic_impact: "partial_closure",
    start: example?.start ?? null,
    end: example?.end ?? null,
  };
  return (
    <FilePermitForm
      map={{ layers: { corridor: data.layers.corridor, permits: data.layers.permits, facilities: data.layers.facilities }, bounds: data.bounds }}
      defaults={defaults}
      lockedDepartment={engineer?.department_id ?? null}
      canSubmit={Boolean(engineer)}
      cannotSubmitReason={user ? `You are viewing as ${user.display_name}. Only a department engineer can file; switch role in the header. The pre-check above still works.` : "Pick a department engineer under “Viewing as” in the header to submit. The pre-check above works without signing in."}
    />
  );
}

export default function NewPermitPage(props: PageProps<"/permits/new">) {
  return (
    <>
      <SiteHeader active="/permits" returnTo="/permits/new" />
      <main className="mx-auto w-full max-w-[1280px] px-6 pb-12 pt-7">
        <div className="mb-6">
          <h1>File a road-cutting permit</h1>
          <p className="mt-2 text-[15px]">Mark the trench on the road, add the specs, and see any conflicts before you submit.</p>
        </div>
        <Suspense fallback={<p className="chip">Loading form…</p>}>
          <FileScreen searchParams={props.searchParams} />
        </Suspense>
      </main>
    </>
  );
}
