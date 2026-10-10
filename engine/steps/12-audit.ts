import { recordStep, type Ctx } from "../context";

/** Step 12: when the permit is approvable as it stands, draft the citizen notice. The audit record is assembled by the pipeline. */
export function audit(ctx: Ctx, autoApprovable: boolean): void {
  const { permit } = ctx;
  if (autoApprovable) {
    ctx.noticeDraft = {
      corridor_id: permit.corridor_id!,
      permit_ids: [permit.permit_id],
      chainage_start_m: permit.chainage_start_m,
      chainage_end_m: permit.chainage_end_m,
      starts_on: permit.proposed_start,
      ends_on: permit.proposed_end,
      traffic_impact: permit.traffic_impact,
      departments: [permit.department],
    };
  }
  recordStep(ctx, 12, "AUDIT_NOTIFICATION", "Audit and notification", "pass", autoApprovable ? "Audit record written; notice drafted." : "Audit record written; notice waits for approval.");
}
