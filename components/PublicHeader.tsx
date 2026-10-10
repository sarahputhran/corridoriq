import Link from "next/link";
import { brand } from "@/config/brand";

/** Header for the citizen pages: no app navigation, no sign-in. The small link on the right leads back to the demo. */
export function PublicHeader({ title }: { title: string }) {
  return (
    <header className="border-b-[2.5px] border-ink bg-card">
      <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-3 px-[18px] py-4 lg:px-6">
        <Link href="/public/works" className="flex min-w-0 items-center gap-2 no-underline">
          <span className="flex h-[26px] w-[26px] flex-none items-center justify-center border-[2.5px] border-ink bg-accent text-xs font-bold">{brand.logoText}</span>
          <span className="text-[17px] font-bold md:text-xl">{title}</span>
        </Link>
        <Link href="/" className="flex-none text-xs font-semibold md:text-sm" lang="en">
          About this demo
        </Link>
      </div>
    </header>
  );
}
