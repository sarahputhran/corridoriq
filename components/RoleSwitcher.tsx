import { DEMO_USERS } from "@/config/demo-users";
import { demoSignIn, demoSignOut } from "@/lib/auth/actions";
import { getSessionUser } from "@/lib/auth/session";

/** "Viewing as <role> ▾": signs in as a demo persona. A plain <details> menu, so it works without client JavaScript. */
export async function RoleSwitcher({ next }: { next: string }) {
  const user = await getSessionUser();
  const staff = DEMO_USERS.filter((u) => u.role !== "engineer");
  const engineers = DEMO_USERS.filter((u) => u.role === "engineer");
  const item = (u: (typeof DEMO_USERS)[number]) => (
    <li key={u.email}>
      <form action={demoSignIn}>
        <input type="hidden" name="email" value={u.email} />
        <input type="hidden" name="next" value={next} />
        <button
          type="submit"
          aria-current={user?.email === u.email ? "true" : undefined}
          className={`flex min-h-[40px] w-full items-center px-3 text-left text-[13px] hover:bg-paper ${user?.email === u.email ? "bg-accent font-semibold" : ""}`}
        >
          {u.display_name}
        </button>
      </form>
    </li>
  );
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-xs">Viewing as</span>
      <details className="relative">
        <summary className="flex min-h-[36px] cursor-pointer list-none items-center border-2 border-ink bg-card px-3 text-[13px] font-semibold [&::-webkit-details-marker]:hidden">
          {user ? user.display_name : "Visitor"} ▾
        </summary>
        <div className="absolute left-0 z-20 xl:left-auto xl:right-0 mt-1.5 w-60 border-[2.5px] border-ink bg-card shadow-btn">
          <p className="border-b-2 border-ink px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em]">Demo roles</p>
          <ul>{staff.map(item)}</ul>
          <p className="border-y-2 border-ink px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em]">Department engineers</p>
          <ul>{engineers.map(item)}</ul>
          <p className="border-y-2 border-ink px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em]">No sign-in</p>
          <a href="/public/works" className="flex min-h-[40px] items-center px-3 text-[13px] hover:bg-paper">
            Resident: public notices
          </a>
          {(user?.role === "admin" || user?.role === "supervisor") && (
            <p className="flex flex-col border-t-2 border-ink">
              <a href="/approvals" className="flex min-h-[40px] items-center px-3 text-[13px] font-semibold">Approvals and escalations</a>
              {user.role === "admin" && <a href="/admin" className="flex min-h-[40px] items-center px-3 text-[13px] font-semibold">Admin: rules and demo reset</a>}
            </p>
          )}
          {user && (
            <form action={demoSignOut} className="border-t-2 border-ink">
              <button type="submit" className="flex min-h-[40px] w-full items-center px-3 text-left text-[13px] hover:bg-paper">
                Back to visitor
              </button>
            </form>
          )}
        </div>
      </details>
    </div>
  );
}
