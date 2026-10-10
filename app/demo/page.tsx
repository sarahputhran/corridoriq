import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TryDemo, TryDemoFallback } from "@/components/landing/TryDemo";
import { SiteHeader } from "@/components/SiteHeader";
import { DEMO_USERS } from "@/config/demo-users";
import { demoSignIn } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Pick a role | CorridorIQ" };

function RoleCard({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col">
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mb-5 mt-2 text-[15px] leading-snug">{body}</p>
      <div className="mt-auto">{children}</div>
    </section>
  );
}

function SignIn({ email, next, label }: { email: string; next: string; label: string }) {
  return (
    <form action={demoSignIn}>
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next} />
      <button type="submit" className="btn">
        {label}
      </button>
    </form>
  );
}

export default function DemoPage() {
  const engineers = DEMO_USERS.filter((u) => u.role === "engineer");
  return (
    <>
      <SiteHeader returnTo="/demo" />
      <main className="mx-auto w-full max-w-[1280px] px-6 pb-12 pt-7">
        <h1 className="mb-2">Pick a role</h1>
        <p className="mb-7 max-w-2xl text-[15px]">Five people use this system. Each sees different screens. No password is needed; you can switch any time from &ldquo;Viewing as&rdquo; in the header.</p>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <RoleCard title="Corridor planner" body="Sees every case on the road, compares the options and decides. Start here: it opens the hospital case.">
            <Suspense fallback={<TryDemoFallback label="Open as planner" />}>
              <TryDemo label="Open as planner" />
            </Suspense>
          </RoleCard>
          <RoleCard title="Supervisor" body="Gives the second sign-off on a planner's decision, or sends it back with a note. Also sees tasks that ran late.">
            <SignIn email="supervisor@corridoriq.demo" next="/approvals" label="Open as supervisor" />
          </RoleCard>
          <RoleCard title="Department engineer" body="Files permits for one department, sees the pre-check, and answers when a planner asks to confirm dates.">
            <form action={demoSignIn} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="next" value="/permits/new?example=hospital" />
              <label className="text-[13px] font-semibold">
                Department
                <select name="email" defaultValue="airtel@corridoriq.demo" className="mt-1 block min-h-[44px] border-[2.5px] border-ink bg-field px-2.5 text-[15px] font-normal">
                  {engineers.map((u) => (
                    <option key={u.email} value={u.email}>
                      {u.display_name.replace(" engineer", "")}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="btn">
                Open as engineer
              </button>
            </form>
          </RoleCard>
          <RoleCard title="Administrator" body="Edits the rule thresholds, checks what a change would do to open permits, and resets the demo.">
            <SignIn email="admin@corridoriq.demo" next="/admin" label="Open as administrator" />
          </RoleCard>
          <RoleCard title="Resident" body="No account. Sees approved works on the road and one notice per stretch, in English, Hindi or Marathi, and can report a problem.">
            <Link href="/public/works" className="btn">
              See the public page
            </Link>
          </RoleCard>
        </div>
      </main>
    </>
  );
}
