import { rangeOverlap, recordStep, round1, type Ctx } from "../context";
import type { Counterpart, SpatialClass } from "../types";

function sidesCompatible(a: string, b: string): boolean {
  return a === b || a === "center" || a === "full-width" || b === "center" || b === "full-width";
}

/** Step 4: classify every other permit and infrastructure zone by position along the road. */
export function spatial(ctx: Ctx): void {
  const { permit } = ctx;
  const { adjacent_m, nearby_m, overlap_tolerance_m } = ctx.rules.get("CORRIDOR_SAME_SEGMENT_MULTIWORK").params;
  const classify = (overlap: number, compatible: boolean): SpatialClass => {
    const gap = Math.max(0, -overlap);
    if (overlap > 0 || gap <= overlap_tolerance_m) return compatible ? "DIRECT_OVERLAP" : "SAME_SEGMENT";
    if (gap <= adjacent_m) return "ADJACENT_SEGMENT";
    if (gap <= nearby_m) return "NEARBY";
    return "NO_SPATIAL_CONFLICT";
  };
  const unclassified = (): Pick<Counterpart, "temporal_gap_days" | "repeat" | "feasibility" | "feasibility_reasons" | "trigger_reasons" | "joint_candidate"> => ({
    temporal_gap_days: null,
    repeat: "NO_REPEAT_RISK",
    feasibility: "PHYSICALLY_FEASIBLE",
    feasibility_reasons: [],
    trigger_reasons: [],
    joint_candidate: false,
  });

  const permits: Counterpart[] = ctx.input.corridor.permits
    .filter((p) => p.permit_id !== permit.permit_id && p.corridor_id === permit.corridor_id)
    .map((p) => {
      const overlap = rangeOverlap(permit, p);
      return {
        ...unclassified(),
        kind: "permit",
        id: p.permit_id,
        label: `${p.department} · ${p.purpose}`,
        department: p.department,
        status: p.status,
        history: p.status === "completed",
        spatial: classify(overlap, sidesCompatible(permit.road_side, p.road_side)),
        overlap_m: round1(Math.max(0, overlap)),
        gap_m: round1(Math.max(0, -overlap)),
        start: p.proposed_start,
        end: p.proposed_end,
      };
    });
  const zones: Counterpart[] = ctx.input.corridor.infraZones.map((z) => {
    const overlap = rangeOverlap(permit, z);
    return {
      ...unclassified(),
      kind: "infra",
      id: z.id,
      label: z.project_name,
      department: z.agency,
      status: z.status,
      history: z.status === "completed",
      spatial: classify(overlap, true),
      overlap_m: round1(Math.max(0, overlap)),
      gap_m: round1(Math.max(0, -overlap)),
      start: z.start_date,
      end: z.end_date,
    };
  });
  const byId = (a: Counterpart, b: Counterpart) => a.id.localeCompare(b.id);
  ctx.counterparts = [...permits.sort(byId), ...zones.sort(byId)].filter((c) => c.spatial !== "NO_SPATIAL_CONFLICT");

  const count = (s: SpatialClass) => ctx.counterparts.filter((c) => c.spatial === s).length;
  const close = count("DIRECT_OVERLAP") + count("SAME_SEGMENT") + count("ADJACENT_SEGMENT");
  recordStep(
    ctx,
    4,
    "SPATIAL",
    "Spatial",
    close ? "flag" : "pass",
    ctx.counterparts.length
      ? `${count("DIRECT_OVERLAP")} direct overlap, ${count("SAME_SEGMENT")} same segment, ${count("ADJACENT_SEGMENT")} adjacent, ${count("NEARBY")} nearby.`
      : "No other works or infrastructure zones near this stretch.",
  );
}
