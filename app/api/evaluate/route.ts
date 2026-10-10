// POST /api/evaluate?dry_run=1: the platform-neutral engine API.
// JSON in, JSON out, nothing persisted. Powers the live Pre-check on the File Permit screen.
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { getDemoToday } from "@/lib/demo-date";
import { evaluateForm, permitFormSchema } from "@/lib/workflow/permit-form";
import { precheckOutcome, precheckRows } from "@/lib/workflow/precheck";

export async function POST(request: NextRequest) {
  if (request.nextUrl.searchParams.get("dry_run") !== "1") {
    return NextResponse.json({ error: "Only dry runs are served here. Add ?dry_run=1. Permits are filed from the File Permit screen." }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be JSON." }, { status: 400 });
  }
  const parsed = permitFormSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Some fields are missing or invalid.", fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) }, { status: 422 });
  }
  try {
    const evaluated = await evaluateForm(db(), parsed.data, getDemoToday());
    if ("error" in evaluated) return NextResponse.json({ error: evaluated.error }, { status: 422 });
    const { snap, result, state, buffer_m } = evaluated;
    return NextResponse.json({
      dry_run: true,
      today: result.today,
      trench: {
        chainage_start_m: snap.chainage_start_m,
        chainage_end_m: snap.chainage_end_m,
        length_m: snap.trench_length_m,
        snap_offset_m: snap.snap_offset_m,
        road_name: snap.road_name,
        segment: snap.segment,
        geom: snap.geom,
      },
      decision: result.decision,
      outcome_status: result.outcome_status,
      would_open_case: Boolean(result.coordination),
      rule_ids: result.ruleIds,
      flags: result.flags,
      conditions: result.conditions,
      recommended_strategy: result.coordination?.recommended_strategy ?? null,
      checks: precheckRows(result, state, buffer_m),
      outcome: precheckOutcome(result),
      steps: result.steps,
    });
  } catch (err) {
    console.error("dry run failed", err);
    return NextResponse.json({ error: "The pre-check could not run. Try again in a moment." }, { status: 500 });
  }
}
