"use client";

import Link from "next/link";

/** Shown when a screen fails in a way it did not handle itself. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col justify-center p-6">
      <section className="card" role="alert">
        <h1 className="!text-3xl">Something went wrong</h1>
        <p className="mt-2 text-[15px]">This screen could not be shown. Nothing was changed. Try again, and if it keeps happening, go back to the start page.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <Link href="/" className="btn">
            Go to the start page
          </Link>
        </div>
      </section>
    </main>
  );
}
