import Link from "next/link";
import { connection } from "next/server";
import { demoSignIn } from "@/lib/auth/actions";
import { db } from "@/lib/db/client";

/** The permit whose filing opens the hero case in the seeded story. */
const HERO_PERMIT = "PMC/RC/2026/0024";

async function heroCasePath(): Promise<string> {
  try {
    const [row] = await db()`
      select cc.case_ref from coordination_cases cc join permits p on p.id = any(cc.permit_ids) where p.permit_id = ${HERO_PERMIT} order by cc.created_at desc limit 1`;
    return row ? `/cases/${row.case_ref}` : "/cases";
  } catch {
    return "/cases";
  }
}

/** "Try the demo": signs the visitor in as the corridor planner and opens the hospital case. */
export async function TryDemo({ label = "Try the demo" }: { label?: string }) {
  await connection();
  const next = await heroCasePath();
  return (
    <form action={demoSignIn}>
      <input type="hidden" name="email" value="planner@corridoriq.demo" />
      <input type="hidden" name="next" value={next} />
      <button type="submit" className="btn btn-primary !px-6 !py-3.5 !text-base !font-bold">
        {label}
      </button>
    </form>
  );
}

export function TryDemoFallback({ label = "Try the demo" }: { label?: string }) {
  return (
    <Link href="/cases" className="btn btn-primary !px-6 !py-3.5 !text-base !font-bold">
      {label}
    </Link>
  );
}
