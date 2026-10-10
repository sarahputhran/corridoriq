// POST /api/admin/escalate: runs SLA escalation now, against the demo clock. Needs an admin session or the x-admin-token header.
import { NextResponse, type NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/auth/admin-token";
import { db } from "@/lib/db/client";
import { demoNow } from "@/lib/demo-clock";

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Admin access is needed to run escalation." }, { status: 403 });
  try {
    const [{ n }] = await db()`select public.escalate_overdue_tasks(${demoNow()}) as n`;
    return NextResponse.json({ ok: true, escalated: n });
  } catch (err) {
    console.error("escalation failed", err);
    return NextResponse.json({ error: "Escalation could not run." }, { status: 500 });
  }
}
