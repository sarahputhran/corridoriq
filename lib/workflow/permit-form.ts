// The File Permit form: one schema for the live pre-check (dry run) and the real submission.
import { z } from "zod";
import { pune } from "@/config/cities/pune";
import { DEPARTMENTS } from "@/config/departments";
import { evaluatePermit } from "@/engine/pipeline";
import type { CorridorState, PermitInput, PipelineResult } from "@/engine/types";
import type { Sql } from "@/lib/db/connection";
import { loadCityConfig, loadCorridorState } from "@/lib/db/corridor-state";
import { MIN_TRENCH_M, snapTrench, type SnappedTrench } from "@/lib/geo/snap";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker");
const [west, south, east, north] = pune.bbox;

export const permitFormSchema = z
  .object({
    department_id: z.enum(DEPARTMENTS.map((d) => d.id) as [string, ...string[]]),
    purpose: z.string().trim().min(5, "Describe the work in a few words").max(160),
    work_type: z.enum(["routine", "emergency_fault"]),
    in_annual_programme: z.boolean(),
    proposed_start: isoDate,
    proposed_end: isoDate,
    trench_depth_m: z.number().min(0.1, "Depth must be at least 0.1 m").max(10, "Depth above 10 m is outside this form"),
    trench_width_m: z.number().min(0.1, "Width must be at least 0.1 m").max(20, "Width above 20 m is outside this form"),
    road_side: z.enum(["left", "center", "right", "full-width"]),
    traffic_impact: z.enum(["one_lane", "partial_closure", "full_closure"]),
    start_lng: z.number().min(west - 0.05).max(east + 0.05),
    start_lat: z.number().min(south - 0.05).max(north + 0.05),
    end_lng: z.number().min(west - 0.05).max(east + 0.05),
    end_lat: z.number().min(south - 0.05).max(north + 0.05),
  })
  .refine((v) => v.proposed_end >= v.proposed_start, { message: "The end date must be on or after the start date", path: ["proposed_end"] });

export type PermitForm = z.infer<typeof permitFormSchema>;

export interface Evaluated {
  form: PermitForm;
  snap: SnappedTrench;
  permit: PermitInput;
  state: CorridorState;
  result: PipelineResult;
  buffer_m: number;
}

/** Snaps the trench, loads the corridor as it stands and runs the engine. Writes nothing. */
export async function evaluateForm(sql: Sql, form: PermitForm, today: string): Promise<Evaluated | { error: string }> {
  const snap = await snapTrench(sql, pune.corridor_id, { lng: form.start_lng, lat: form.start_lat }, { lng: form.end_lng, lat: form.end_lat });
  if (!snap || snap.trench_length_m < MIN_TRENCH_M) return { error: "Mark two different points along the road: the start and the end of the trench." };
  const [dept] = await sql`select name from departments where id = ${form.department_id}`;
  const city = await loadCityConfig(sql);
  const onCorridor = snap.snap_offset_m <= city.snap_tolerance_m;
  const permit: PermitInput = {
    permit_id: "DRAFT",
    department: dept.name as string,
    purpose: form.purpose,
    work_type: form.work_type,
    in_annual_programme: form.in_annual_programme,
    fault_sanctioned: false,
    proposed_start: form.proposed_start,
    proposed_end: form.proposed_end,
    trench_depth_m: form.trench_depth_m,
    trench_width_m: form.trench_width_m,
    road_side: form.road_side,
    traffic_impact: form.traffic_impact,
    status: "draft",
    corridor_id: onCorridor ? snap.corridor_id : null,
    chainage_start_m: snap.chainage_start_m,
    chainage_end_m: snap.chainage_end_m,
    trench_length_m: snap.trench_length_m,
    snap_offset_m: snap.snap_offset_m,
  };
  const { state } = await loadCorridorState(sql, snap.corridor_id, snap.geom, null);
  const result = evaluatePermit({ permit, corridor: state, city, today });
  const gate = city.rules.find((r) => r.rule_id === "CORRIDOR_FACILITY_CRITICALITY_GATE");
  return { form, snap, permit, state, result, buffer_m: Number((gate?.params as { buffer_m?: number } | undefined)?.buffer_m ?? 200) };
}
