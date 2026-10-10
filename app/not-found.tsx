import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: `Page not found | ${brand.name}` };

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col justify-center p-6">
      <section className="card">
        <h1 className="!text-3xl">Page not found</h1>
        <p className="mt-2 text-[15px]">There is nothing at this address. The link may be old, or the address may have a typing mistake.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/" className="btn btn-primary">
            Go to the start page
          </Link>
          <Link href="/cases" className="btn">
            See all cases
          </Link>
        </div>
      </section>
    </main>
  );
}
