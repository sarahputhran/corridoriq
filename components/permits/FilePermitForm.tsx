"use client";

import type { FeatureCollection, LineString } from "geojson";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { TrenchPicker, type Point } from "@/components/map/TrenchPicker";
import { DEPARTMENTS } from "@/config/departments";
import { submitPermitAction } from "@/lib/workflow/permit-actions";
import type { PrecheckRow } from "@/lib/workflow/precheck";

interface Precheck {
  trench: { chainage_start_m: number; chainage_end_m: number; length_m: number; road_name: string; segment: { id: string; classification: string } | null; geom: LineString };
  checks: PrecheckRow[];
  outcome: string;
  outcome_status: string;
}

export interface FormDefaults {
  department_id: string;
  purpose: string;
  work_type: "routine" | "emergency_fault";
  proposed_start: string;
  proposed_end: string;
  trench_depth_m: string;
  trench_width_m: string;
  road_side: string;
  traffic_impact: string;
  start: Point | null;
  end: Point | null;
}

interface Props {
  map: { layers: { corridor: FeatureCollection; permits: FeatureCollection; facilities: FeatureCollection }; bounds: [number, number, number, number] };
  defaults: FormDefaults;
  /** The signed-in engineer's department, or null when the visitor cannot file. */
  lockedDepartment: string | null;
  canSubmit: boolean;
  cannotSubmitReason: string;
}

const input = "block min-h-[44px] w-full border-[2.5px] border-ink bg-field px-2.5 text-[15px]";
const label = "mb-1.5 block text-[13px] font-semibold";
const fmt = (n: number) => Math.round(n).toLocaleString("en-IN");

function Segmented({ name, legend, value, options, onChange }: { name: string; legend: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <fieldset>
      <legend className={label}>{legend}</legend>
      <div className="flex flex-wrap">
        {options.map((o, i) => (
          <label key={o.value} className={`flex min-h-[44px] cursor-pointer items-center border-[2.5px] border-ink px-4 text-sm font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${i > 0 ? "-ml-[2.5px]" : ""} ${value === o.value ? "bg-ink text-white" : "bg-card"}`}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const TONE = { ok: { mark: "✓", bg: "bg-status-ok", word: "OK" }, warn: { mark: "!", bg: "bg-status-coord", word: "Warning" }, block: { mark: "✕", bg: "bg-status-block-tint", word: "Blocked" } } as const;

export function FilePermitForm({ map, defaults, lockedDepartment, canSubmit, cannotSubmitReason }: Props) {
  const [state, action, pending] = useActionState(submitPermitAction, null);
  const [f, setF] = useState(defaults);
  const [inProgramme, setInProgramme] = useState(true);
  const [precheck, setPrecheck] = useState<Precheck | null>(null);
  const [checkState, setCheckState] = useState<"idle" | "checking" | "error">("idle");
  const [checkError, setCheckError] = useState("");
  const set = <K extends keyof FormDefaults>(key: K, value: FormDefaults[K]) => setF((prev) => ({ ...prev, [key]: value }));

  const payload = useMemo(() => {
    if (!f.start || !f.end) return null;
    return {
      department_id: f.department_id,
      purpose: f.purpose.trim().length >= 5 ? f.purpose : "Draft work",
      work_type: f.work_type,
      in_annual_programme: inProgramme,
      proposed_start: f.proposed_start,
      proposed_end: f.proposed_end,
      trench_depth_m: Number(f.trench_depth_m),
      trench_width_m: Number(f.trench_width_m),
      road_side: f.road_side,
      traffic_impact: f.traffic_impact,
      start_lng: f.start.lng,
      start_lat: f.start.lat,
      end_lng: f.end.lng,
      end_lat: f.end.lat,
    };
  }, [f, inProgramme]);

  // Live dry run: re-checks a moment after the trench, dates or specs change. Nothing is saved.
  const requestId = useRef(0);
  useEffect(() => {
    if (!payload) return;
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setCheckState("checking");
      try {
        const res = await fetch("/api/evaluate?dry_run=1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
        const json = await res.json();
        if (id !== requestId.current) return;
        if (!res.ok) {
          setPrecheck(null);
          setCheckError(json.fields ? Object.values(json.fields as Record<string, string>).join(". ") : (json.error ?? "The pre-check could not run."));
          setCheckState("error");
          return;
        }
        setPrecheck(json as Precheck);
        setCheckState("idle");
      } catch {
        if (id !== requestId.current) return;
        setCheckError("The pre-check could not reach the server. Check your connection; it will retry when you change something.");
        setCheckState("error");
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [payload]);

  const marked = Boolean(f.start && f.end);
  const shown = marked ? precheck : null;
  const fieldError = (name: string) => (state?.fields?.[name] ? <p className="mt-1 text-xs font-semibold text-status-block-text">{state.fields[name]}</p> : null);

  return (
    <form action={action} className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-6">
        <section className="card">
          <h2 className="section-header">1 · The work</h2>
          <div className="flex flex-col gap-4">
            <div>
              <label className={label} htmlFor="dept">Department</label>
              {lockedDepartment ? (
                <>
                  <input type="hidden" name="department_id" value={f.department_id} />
                  <p id="dept" className={`${input} flex items-center bg-card`}>{DEPARTMENTS.find((d) => d.id === f.department_id)?.name}</p>
                  <p className="mt-1 text-xs">You file for your own department. Switch role in the header to file for another.</p>
                </>
              ) : (
                <select id="dept" name="department_id" className={input} value={f.department_id} onChange={(e) => set("department_id", e.target.value)}>
                  {DEPARTMENTS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className={label} htmlFor="purpose">Purpose</label>
              <input id="purpose" name="purpose" className={input} value={f.purpose} onChange={(e) => set("purpose", e.target.value)} maxLength={160} required minLength={5} />
              {fieldError("purpose")}
            </div>
            <Segmented name="work_type" legend="Work type" value={f.work_type} onChange={(v) => set("work_type", v as FormDefaults["work_type"])} options={[{ value: "routine", label: "Routine" }, { value: "emergency_fault", label: "Emergency fault repair" }]} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="sd">Start date</label>
                <input id="sd" name="proposed_start" type="date" className={input} value={f.proposed_start} onChange={(e) => set("proposed_start", e.target.value)} required />
                {fieldError("proposed_start")}
              </div>
              <div>
                <label className={label} htmlFor="ed">End date</label>
                <input id="ed" name="proposed_end" type="date" className={input} value={f.proposed_end} min={f.proposed_start} onChange={(e) => set("proposed_end", e.target.value)} required />
                {fieldError("proposed_end")}
              </div>
            </div>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm">
              <input type="checkbox" name="in_annual_programme" checked={inProgramme} onChange={(e) => setInProgramme(e.target.checked)} className="h-5 w-5 accent-[#111111]" />
              This work is in the annual coordinated programme
            </label>
          </div>
        </section>

        <section className="card">
          <h2 className="section-header">2 · Trench</h2>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="dep">Depth (m)</label>
              <input id="dep" name="trench_depth_m" type="number" step="0.05" min="0.1" max="10" className={`${input} font-mono`} value={f.trench_depth_m} onChange={(e) => set("trench_depth_m", e.target.value)} required />
              {fieldError("trench_depth_m")}
            </div>
            <div>
              <label className={label} htmlFor="wid">Width (m)</label>
              <input id="wid" name="trench_width_m" type="number" step="0.05" min="0.1" max="20" className={`${input} font-mono`} value={f.trench_width_m} onChange={(e) => set("trench_width_m", e.target.value)} required />
              {fieldError("trench_width_m")}
            </div>
          </div>
          <div className="mb-4">
            <Segmented name="road_side" legend="Road side" value={f.road_side} onChange={(v) => set("road_side", v)} options={[{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }]} />
            <p className="mt-1 text-xs">Left and right are as you face along the road from Hingne toward Dandekar Bridge.</p>
          </div>
          <div>
            <label className={label} htmlFor="ti">Traffic impact</label>
            <select id="ti" name="traffic_impact" className={input} value={f.traffic_impact} onChange={(e) => set("traffic_impact", e.target.value)}>
              <option value="one_lane">One lane closed</option>
              <option value="partial_closure">Partial closure</option>
              <option value="full_closure">Full closure</option>
            </select>
          </div>
        </section>

        <section className="card">
          <h2 className="section-header">3 · Documents</h2>
          <div className="flex flex-col gap-2.5">
            {[
              { kind: "drawing", label: "Drawings" },
              { kind: "trench_spec", label: "Trench specification" },
              { kind: "restoration_bond", label: "Restoration bond" },
            ].map((doc) => (
              <label key={doc.kind} className="flex flex-wrap items-center justify-between gap-2.5 border-2 border-dashed border-ink bg-card p-2.5 text-sm">
                <b>{doc.label}</b>
                <input type="file" name={`doc_${doc.kind}`} accept="application/pdf,image/png,image/jpeg" className="max-w-full text-[13px] file:mr-2.5 file:min-h-[36px] file:border-2 file:border-solid file:border-ink file:bg-card file:px-2.5 file:text-[13px] file:font-semibold" />
              </label>
            ))}
          </div>
          <p className="mt-2.5 text-xs">Optional in this demo. PDF, PNG or JPG, up to 4 MB each. Files are stored privately.</p>
        </section>
      </div>

      <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-6">
        <section className="card overflow-hidden !p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b-[2.5px] border-ink px-5 py-3.5">
            <h2 className="section-header !m-0">4 · Mark the trench</h2>
            <span className="text-[13px]">{!f.start ? "Click the start, then the end, on the road" : !f.end ? "Now click the end of the trench" : "Click again to start over"}</span>
          </div>
          <TrenchPicker layers={map.layers} bounds={map.bounds} start={f.start} end={f.end} trench={shown?.trench.geom ?? null} onChange={(start, end) => setF((prev) => ({ ...prev, start, end }))} />
          <input type="hidden" name="start_lng" value={f.start?.lng ?? ""} />
          <input type="hidden" name="start_lat" value={f.start?.lat ?? ""} />
          <input type="hidden" name="end_lng" value={f.end?.lng ?? ""} />
          <input type="hidden" name="end_lat" value={f.end?.lat ?? ""} />
          <div className="flex flex-wrap border-t-[2.5px] border-ink" aria-live="polite">
            <div className="flex-[1_1_160px] border-b-[2.5px] border-ink px-5 py-3 sm:border-b-0 sm:border-r-[2.5px]">
              <div className="text-xs">Chainage</div>
              <div className="font-mono text-base font-semibold">{shown ? `${fmt(shown.trench.chainage_start_m)} → ${fmt(shown.trench.chainage_end_m)} m` : "Not marked yet"}</div>
            </div>
            <div className="flex-[1_1_120px] border-b-[2.5px] border-ink px-5 py-3 sm:border-b-0 sm:border-r-[2.5px]">
              <div className="text-xs">Length</div>
              <div className="font-mono text-base font-semibold">{shown ? `${fmt(shown.trench.length_m)} m` : "Not marked yet"}</div>
            </div>
            <div className="flex-[1_1_160px] px-5 py-3">
              <div className="text-xs">Segment</div>
              <div className="text-base font-semibold">{shown ? `${shown.trench.road_name} · ${shown.trench.segment?.classification ?? "unclassified"}` : "Not marked yet"}</div>
            </div>
          </div>
        </section>

        <section className="card !bg-warn-tint">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="section-header !m-0">Pre-check</h2>
            {marked && checkState === "checking" && <span className="text-xs">Checking…</span>}
          </div>
          <div aria-live="polite">
            {!marked ? (
              <p className="text-sm">Mark the trench on the map to see conflicts before you submit. Nothing is saved until you submit.</p>
            ) : checkState === "error" ? (
              <p role="alert" className="border-2 border-ink bg-status-block-tint p-2.5 text-sm">{checkError}</p>
            ) : shown ? (
              <>
                <ul className="flex flex-col gap-2.5">
                  {shown.checks.map((row, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <span className={`flex-none border-2 border-ink px-1.5 font-bold ${TONE[row.tone].bg}`} aria-label={TONE[row.tone].word}>{TONE[row.tone].mark}</span>
                      <div>
                        <b>{row.title}</b> {row.detail}
                        {row.rule_id && <span className="ml-1.5 font-mono text-xs">({row.rule_id})</span>}
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[13px] font-semibold">{shown.outcome}</p>
              </>
            ) : (
              <p className="text-sm">Checking…</p>
            )}
          </div>
          {state && !state.ok && <p role="alert" className="mt-3 border-2 border-ink bg-status-block-tint p-2.5 text-sm">{state.message}</p>}
          <div className="mt-[18px] flex flex-wrap gap-3">
            <button type="submit" name="intent" value="submit" disabled={pending || !canSubmit} className="btn btn-primary !text-[15px] !font-bold disabled:opacity-60">
              {pending ? "Submitting…" : "Submit permit"}
            </button>
            <button type="submit" name="intent" value="draft" disabled={pending || !canSubmit} className="btn !text-[15px] disabled:opacity-60">
              Save draft
            </button>
          </div>
          {!canSubmit && <p className="mt-2.5 text-[13px]">{cannotSubmitReason}</p>}
        </section>
      </div>
    </form>
  );
}
