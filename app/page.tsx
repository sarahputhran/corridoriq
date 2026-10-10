import Link from "next/link";
import { Suspense } from "react";
import { TryDemo, TryDemoFallback } from "@/components/landing/TryDemo";
import { SiteHeader } from "@/components/SiteHeader";
import { brand } from "@/config/brand";

// Paraphrased one-liners from the S8 evidence set. Each links to the original report; nothing is quoted.
const EVIDENCE = [
  {
    text: "A freshly concreted part of Sinhagad Road was dug up again about two months later to lay utility cables.",
    source: "Indian Express",
    date: "30 Jun 2020",
    url: "https://indianexpress.com/article/cities/pune/deadline-over-roaddiggers-still-send-traffic-into-a-spin/",
  },
  {
    text: "Two city buses got stuck on a newly concreted stretch near Hingne Chowk after utility lines were moved. The concrete had to be laid again.",
    source: "Times of India",
    date: "Oct 2025",
    url: "https://timesofindia.indiatimes.com/city/pune/pmpml-buses-get-stuck-on-newly-concreted-stretch-of-sinhagad-road/articleshow/124437290.cms",
  },
  {
    text: "After water pipeline repairs between Parvati Bridge and Dandekar Bridge, residents said the road was left badly restored and without warning barricades.",
    source: "Free Press Journal",
    date: "6 Dec 2024",
    url: "https://www.freepressjournal.in/pune/infrastructure-issues-plague-sinhagad-road-absence-of-barricades-reflectors-and-speed-breakers-lead-to-traffic-woes",
  },
];

const STEPS = [
  {
    title: "A department files a permit",
    body: "An engineer marks the trench on the map and adds the dates and depth. A pre-check shows any conflict before they submit.",
  },
  {
    title: "The engine checks the whole stretch",
    body: "Sixteen rules run in twelve fixed steps: monsoon season, recent restoration, other works in the same place and time, repeat digging, and the hospitals, schools and bus routes nearby. The same input always gives the same result, and every finding names its rule.",
  },
  {
    title: "A planner decides, a supervisor signs off",
    body: "The planner sees the options side by side with a short explanation that cites the records. They approve the recommendation or override it with a written reason. Residents get one notice in English, Hindi and Marathi.",
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader returnTo="/cases" />
      <main className="mx-auto w-full max-w-[1280px] px-6 pb-14 pt-10">
        <section className="max-w-4xl">
          <h1 className="!text-[clamp(32px,5vw,52px)]">{brand.oneLiner}</h1>
          <p className="mt-5 max-w-3xl text-[17px] leading-relaxed">
            In Indian cities, the water, sewerage, electricity, gas, telecom and metro agencies each get permission to dig up a road on their own. None of them sees the others&rsquo; plans, so the same stretch is dug,
            repaired and dug again. {brand.name} treats a stretch of road as one long-running case and catches the overlap before the second dig.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3.5">
            <Suspense fallback={<TryDemoFallback />}>
              <TryDemo />
            </Suspense>
            <a href="#how" className="btn !px-6 !py-3.5 !text-base">
              How it works
            </a>
          </div>
          <p className="mt-4 text-sm">
            The demo opens a real case on Sinhagad Road, Pune: a water main and a fibre duct planned for the same 200 m beside a hospital. You can also{" "}
            <Link href="/permits/new?example=hospital">try filing a permit</Link>, <Link href="/demo">pick another role</Link> or <Link href="/public/works">see what residents see</Link>.
          </p>
        </section>

        <section className="mt-14" aria-labelledby="evidence">
          <h2 id="evidence" className="section-header">
            This keeps happening on this road
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {EVIDENCE.map((e) => (
              <article key={e.url} className="card flex flex-col">
                <p className="text-[15px] leading-snug">{e.text}</p>
                <p className="mt-auto pt-4 text-[13px]">
                  <a href={e.url} target="_blank" rel="noreferrer" className="font-semibold">
                    {e.source}
                  </a>
                  , {e.date}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section id="how" className="mt-14 scroll-mt-6" aria-labelledby="how-heading">
          <h2 id="how-heading" className="section-header">
            How it works
          </h2>
          <ol className="grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card">
                <span className="mb-3 flex h-9 w-9 items-center justify-center border-[2.5px] border-ink bg-accent font-mono text-base font-semibold">{i + 1}</span>
                <h3 className="text-lg font-bold leading-snug">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-snug">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="card mt-14 max-w-4xl" aria-labelledby="honest">
          <h2 id="honest" className="section-header">
            What is real here and what is not
          </h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px]">
            <li>Real: the road, hospitals, schools, bus routes and ward boundaries. They come from OpenStreetMap, the PMPML bus feed and DataMeet.</li>
            <li>Made up: every permit and every restored stretch. They were written to tell a realistic story on a real road.</li>
            <li>Approximate: where the Metro and bridge projects touch the road. The projects are real, their exact positions here are not.</li>
            <li>This is a prototype. Pune Municipal Corporation does not use it.</li>
            <li>The AI only explains records already in a case. It does not predict traffic, delays or how many people are affected.</li>
          </ul>
        </section>
      </main>
      <footer className="border-t-[2.5px] border-ink bg-card px-6 py-5 text-[13px]">
        <div className="mx-auto flex max-w-[1280px] flex-wrap justify-between gap-3">
          <p>{brand.name}, a portfolio project by Sarah Puthran.</p>
          <p>
            Map data ©{" "}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap contributors
            </a>
            . Map tiles by{" "}
            <a href="https://openfreemap.org" target="_blank" rel="noreferrer">
              OpenFreeMap
            </a>
            .
          </p>
        </div>
      </footer>
    </>
  );
}
