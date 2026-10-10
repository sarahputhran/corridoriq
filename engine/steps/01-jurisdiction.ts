import { recordStep, type Ctx } from "../context";

/** Step 1: is the trench on a managed corridor? If not, the permit goes to manual review and the pipeline stops. */
export function jurisdiction(ctx: Ctx): void {
  const { permit, input } = ctx;
  const onCorridor = permit.corridor_id === input.corridor.corridor.id && permit.snap_offset_m <= input.city.snap_tolerance_m;
  if (onCorridor) {
    recordStep(ctx, 1, "JURISDICTION", "Jurisdiction", "pass", `On ${input.corridor.corridor.road_name}, chainage ${Math.round(permit.chainage_start_m)}–${Math.round(permit.chainage_end_m)} m.`);
    return;
  }
  ctx.outsideCorridor = true;
  recordStep(ctx, 1, "JURISDICTION", "Jurisdiction", "stop", "Outside managed corridors: the trench does not snap to a managed corridor within tolerance.");
}
