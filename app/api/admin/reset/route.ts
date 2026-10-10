// POST /api/admin/reset: rebuilds the demo. Needs an admin session or the x-admin-token header.
import { NextResponse, type NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/auth/admin-token";
import { runSeed } from "@/scripts/seed";

// A reset replays every filing and writes the case explanations; it takes about a minute.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Admin access is needed to reset the demo." }, { status: 403 });
  try {
    const { counts } = await runSeed();
    return NextResponse.json({ ok: true, counts });
  } catch (err) {
    console.error("reset failed", err);
    return NextResponse.json({ error: "The reset did not finish. Run it again; a reset always starts from a clean slate." }, { status: 500 });
  }
}
