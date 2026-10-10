import Link from "next/link";
import { Suspense } from "react";
import { brand } from "@/config/brand";
import { features } from "@/config/features";
import { formatDemoDate, getDemoToday } from "@/lib/demo-date";
import { RoleSwitcher } from "./RoleSwitcher";

// Tasks is the inbox for engineers and supervisors.
const NAV = [
  { href: "/cases", label: "Cases" },
  { href: "/corridors", label: "Corridors" },
  { href: "/permits", label: "Permits" },
  { href: "/tasks", label: "Tasks" },
  { href: "/dashboard", label: "Dashboard" },
].filter((item) => item.href !== "/dashboard" || features.dashboard);

export function SiteHeader({ active, returnTo }: { active?: string; returnTo?: string }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b-[2.5px] border-ink bg-card px-6 py-3.5">
      <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          <span className="flex h-[30px] w-[30px] items-center justify-center border-[2.5px] border-ink bg-accent text-sm font-bold">
            {brand.logoText}
          </span>
          <span className="text-xl font-bold tracking-[-0.02em]">{brand.name}</span>
        </Link>
        <nav aria-label="Main" className="flex flex-wrap gap-1.5">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active === item.href ? "page" : undefined}
              className={`border-2 px-3 py-1.5 text-sm no-underline ${
                active === item.href ? "border-ink bg-accent font-semibold" : "border-transparent font-medium"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Suspense fallback={<span className="text-xs">Viewing as …</span>}>
          <RoleSwitcher next={returnTo ?? active ?? "/cases"} />
        </Suspense>
        <span className="chip text-xs">
          Demo date: <span className="font-mono font-semibold">{formatDemoDate(getDemoToday())}</span>
        </span>
      </div>
    </header>
  );
}
