import Link from "next/link";
import { connection } from "next/server";
import { pune } from "@/config/cities/pune";
import { DEPARTMENTS } from "@/config/departments";
import { addMonths } from "@/engine/dates";
import { getTimeSpaceData, type TimeSpaceData } from "@/lib/db/timespace";
import { getDemoToday } from "@/lib/demo-date";
import { STATUS_LABEL } from "@/lib/format";
import { TimeSpaceChart, type ChartBand } from "./TimeSpaceChart";

const RANGES = [
  { key: "12", label: "12 months" },
  { key: "24", label: "24 months" },
  { key: "history", label: "History" },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const MONTH_YEAR = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const monthYear = (iso: string) => MONTH_YEAR.format(new Date(`${iso}T00:00:00Z`));
const OPEN = (status: string) => !["decided", "closed"].includes(status);

function rangeWindow(range: RangeKey, today: string): { from: string; to: string } {
  const monthStart = `${today.slice(0, 7)}-01`;
  if (range === "history") return { from: addMonths(monthStart, -9), to: addMonths(monthStart, 3) };
  return { from: monthStart, to: addMonths(monthStart, range === "24" ? 24 : 12) };
}

/** Why a case exists, in a few words, from its recorded flags and classification. */
function reason(c: TimeSpaceData["cases"][number]): string {
  if (c.infra.length) return "Inside an active infrastructure project";
  if (c.repeat === "REPEAT_SAME_UTILITY") return "Same utility reopening within 6 months";
  if (c.flags.includes("hospital_access")) return "Same stretch, near a hospital";
  if (c.repeat === "REPEAT_CROSS_UTILITY") return "Reopened within 3 months";
  return "Works on the same stretch";
}

export async function TimeSpaceSection({ range }: { range: string | undefined }) {
  await connection();
  let data: TimeSpaceData | null;
  try {
    data = await getTimeSpaceData(pune.corridor_id);
  } catch {
    return (
      <section className="card" role="alert">
        <h2 className="section-header">Could not load the corridor schedule</h2>
        <p>The database did not respond. Reload the page to try again.</p>
      </section>
    );
  }
  if (!data) return null;

  const today = getDemoToday();
  const key = RANGES.find((r) => r.key === range)?.key ?? "12";
  const { from, to } = rangeWindow(key, today);
  const { corridor } = data;

  const bands: ChartBand[] = [
    ...data.restorations.map((r) => ({
      id: r.id,
      kind: r.protected ? ("protected" as const) : ("restored" as const),
      label: `${r.protected ? "Rebuilt" : "Restored"} ${monthYear(r.completed_on)}`,
      sublabel: r.protected ? "MORATORIUM" : "RESTORED_12M",
      chainage_start_m: r.chainage_start_m,
      chainage_end_m: r.chainage_end_m,
      from: r.completed_on,
      // The band lasts as long as the rule protects the stretch.
      to: addMonths(r.completed_on, r.protected ? data.window_months.moratorium : data.window_months.restored),
    })),
    // Zones that share a stretch are drawn once, so their labels do not sit on top of each other.
    ...Object.values(Object.groupBy(data.zones.filter((z) => z.status !== "completed"), (z) => `${z.chainage_start_m}-${z.chainage_end_m}-${z.context_only}`)).map((group) => {
      const z = group![0];
      return {
        id: z.id,
        kind: z.context_only ? ("context" as const) : ("infra" as const),
        label: z.project_name.split(" — ")[0].replace(/ Widening.*$/, ""),
        sublabel: group!.length > 1 ? `and ${group!.length - 1} more · planned` : z.context_only ? "planned" : "works",
        chainage_start_m: z.chainage_start_m,
        chainage_end_m: z.chainage_end_m,
        from: z.context_only ? null : z.start_date,
        to: z.context_only ? null : z.end_date,
      };
    }),
  ];

  const monsoon: { from: string; to: string; label: string }[] = [];
  if (data.monsoon.enabled) {
    for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
      const start = `${year}-${data.monsoon.start_mmdd}`;
      const end = `${year}-${data.monsoon.end_mmdd}`;
      if (start <= to && end >= from) monsoon.push({ from: start, to: end, label: "PMC_MONSOON_5M · routine works blocked 30 Apr – 30 Sep" });
    }
  }

  const openCases = data.cases.filter((c) => OPEN(c.status));
  const closedCases = data.cases.filter((c) => !OPEN(c.status));
  const clusters = openCases.map((c, i) => ({ letter: String.fromCharCode(65 + i), case_ref: c.case_ref, permit_ids: c.permit_ids }));
  const planned = data.permits.filter((p) => !["completed", "blocked", "rejected"].includes(p.status) && p.end >= today).length;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>{corridor.road_name} corridor</h1>
          <p className="mt-2 text-[15px]">
            {corridor.start_label} to {corridor.end_label} · {(corridor.length_m / 1000).toFixed(1)} km · {planned} permits planned · {openCases.length} open {openCases.length === 1 ? "conflict" : "conflicts"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={r.key === "12" ? "/corridors" : `/corridors?range=${r.key}`}
              aria-current={key === r.key ? "true" : undefined}
              className={`flex min-h-[40px] items-center border-[2.5px] border-ink px-3.5 text-[13px] font-semibold no-underline ${key === r.key ? "bg-ink !text-white" : "bg-card"}`}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <section className="card min-w-0 flex-[999_1_640px] !p-4">
          {/* The legend sits above the chart so the side column stays short and leaves no empty space under the chart. */}
          <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" aria-label="Legend">
            {DEPARTMENTS.map((d) => (
              <li key={d.id} className="flex items-center gap-1.5">
                <span className="h-3 w-[18px] flex-none border-2 border-ink" style={{ background: d.color }} />
                {d.short}
              </li>
            ))}
            <li className="flex items-center gap-1.5">
              <span className="h-3 w-[18px] flex-none border-2 border-ink outline outline-2 outline-offset-1 outline-accent" />
              Open case
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-3 w-[18px] flex-none border-2 border-dashed border-status-block-line bg-card" />
              Blocked
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-3 w-[18px] flex-none border-2 border-dashed border-ink bg-[#E5E0D4] opacity-60" />
              Completed
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-3 w-[18px] flex-none border-2 border-ink bg-[#E5E0D4]" />
              Restored stretch
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-3 w-[18px] flex-none border-2 border-dashed border-ink bg-dept-metro" />
              Infrastructure zone
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-3 w-[18px] flex-none border-2 border-status-block-line bg-status-block-tint" />
              Monsoon window
            </li>
          </ul>
          <TimeSpaceChart corridor={corridor} from={from} to={to} today={today} permits={data.permits} bands={bands} monsoon={monsoon} clusters={clusters} />
        </section>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-6">
          <section className="card">
            <h2 className="section-header">Conflicts</h2>
            {openCases.length === 0 ? (
              <p className="text-[13px]">No open conflicts on this corridor.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {openCases.map((c, i) => (
                  <Link key={c.case_ref} href={`/cases/${c.case_ref}`} className="block border-[2.5px] border-ink bg-card p-3 no-underline hover:bg-accent hover:shadow-btn">
                    <div className="flex items-start justify-between gap-3">
                      <b>
                        {String.fromCharCode(65 + i)} · {(c.departments ?? []).join(" + ")}
                      </b>
                      <span className="whitespace-nowrap font-mono text-xs">{c.case_ref}</span>
                    </div>
                    <div className="mt-1 text-[13px]">
                      {reason(c)} · {(STATUS_LABEL[c.status] ?? c.status).toLowerCase()}
                    </div>
                  </Link>
                ))}
              </div>
            )}
            {closedCases.length > 0 && (
              <>
                <h3 className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-[0.06em]">Decided</h3>
                <ul className="flex flex-col gap-1.5 text-[13px]">
                  {closedCases.map((c) => (
                    <li key={c.case_ref}>
                      <Link href={`/cases/${c.case_ref}`} className="font-mono font-semibold">{c.case_ref}</Link> {(c.departments ?? []).join(" + ")}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

        </aside>
      </div>
    </>
  );
}
