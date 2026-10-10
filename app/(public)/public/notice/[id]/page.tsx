import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CorridorMap } from "@/components/map/CorridorMap";
import { PublicHeader } from "@/components/PublicHeader";
import { getNotice } from "@/lib/db/notices";
import { NOTICE_LANGS, isNoticeLang, renderNotice } from "@/lib/notices/render";
import type { NoticeLang } from "@/lib/notices/types";

export const metadata: Metadata = { title: "Road works notice | CorridorIQ" };

async function Notice({ params, searchParams }: Pick<PageProps<"/public/notice/[id]">, "params" | "searchParams">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  await connection();
  const lang: NoticeLang = isNoticeLang(query.lang) ? query.lang : "en";
  let data;
  try {
    data = await getNotice(id);
  } catch {
    return (
      <>
        <PublicHeader title={NOTICE_LANGS[lang].pageTitle} />
        <div className="p-[18px]">
          <section className="card !p-4" role="alert">
            <h1 className="!text-2xl">This notice could not load</h1>
            <p className="mt-2 text-sm">Something went wrong on our side. Reload the page to try again.</p>
          </section>
        </div>
      </>
    );
  }
  if (!data) {
    return (
      <>
        <PublicHeader title={NOTICE_LANGS[lang].pageTitle} />
        <div className="p-[18px]">
          <section className="card !p-4">
            <h1 className="!text-2xl">Notice not found</h1>
            <p className="mt-2 text-sm">This notice may have been replaced by a newer one.</p>
            <p className="mt-4">
              <Link href="/public/works" className="btn">See all works on this road</Link>
            </p>
          </section>
        </div>
      </>
    );
  }
  const notice = renderNotice(data, lang);
  const langHref = (l: NoticeLang) => (l === "en" ? `/public/notice/${data.id}` : `/public/notice/${data.id}?lang=${l}`);

  return (
    <div lang={lang}>
      <PublicHeader title={notice.pageTitle} />
      <div className="mx-auto w-full max-w-[1100px] px-[18px] pt-3.5 lg:px-6 md:pt-6">
      <nav className="flex md:max-w-sm" aria-label="Language">
        {(Object.keys(NOTICE_LANGS) as NoticeLang[]).map((l, i) => (
          <Link
            key={l}
            href={langHref(l)}
            lang={l}
            aria-current={l === lang ? "true" : undefined}
            className={`flex min-h-[44px] flex-1 items-center justify-center border-[2.5px] border-ink text-sm font-semibold no-underline ${i > 0 ? "-ml-[2.5px]" : ""} ${l === lang ? "bg-ink !text-white" : "bg-card"}`}
          >
            {NOTICE_LANGS[l].languageName}
          </Link>
        ))}
      </nav>
      </div>

      {/* Phone: one column in reading order. Wider screens: the notice on the left, the map and actions on the right. */}
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 p-[18px] md:grid md:grid-cols-2 md:items-start md:gap-6 md:py-6 lg:px-6">
        {query.reported === "1" && (
          <p role="status" className="border-[2.5px] border-ink bg-status-ok p-3 text-sm md:col-span-2">{NOTICE_LANGS[lang].reportForm.thanks}</p>
        )}
        <div className="contents md:flex md:flex-col md:gap-6">
        <section className="card order-1 !p-4 md:!p-6">
          {notice.badge && <span className="mb-2.5 inline-block border-2 border-ink bg-accent px-2 py-0.5 text-xs font-bold md:text-sm">{notice.badge}</span>}
          <h1 className="mb-1.5 !text-2xl !leading-[1.15] md:!text-[32px]">{notice.headline}</h1>
          <p className="mb-3 text-sm md:text-base">{notice.summary}</p>
          <dl>
            {notice.rows.map((row) => (
              <div key={row.label} className="flex justify-between gap-3 border-t-2 border-ink py-3 text-sm last:pb-0 md:text-[15px]">
                <dt>{row.label}</dt>
                <dd className={`text-right font-bold ${row.mono ? "font-mono text-[13px]" : ""}`}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="order-3 border-2 border-ink bg-card p-3 text-[13px] md:p-4 md:text-sm" lang="en">
          <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.06em]">{NOTICE_LANGS[lang].labels.works}</h2>
          <ul className="flex flex-col gap-1">
            {data.works.map((w) => (
              <li key={w.permit_id}>
                <b>{w.department}</b>: {w.purpose} <span className="font-mono text-[11px]">({w.permit_id})</span>
              </li>
            ))}
          </ul>
        </section>
        </div>

        <div className="contents md:flex md:flex-col md:gap-6">
        <section className="order-2 overflow-hidden border-[2.5px] border-ink md:shadow-card" aria-label="Map of the affected stretch">
          <CorridorMap layers={data.map.layers} bounds={data.map.bounds} heightClass="h-[190px] md:h-[400px]" ariaLabel="Map of the affected stretch" />
        </section>

        <div className="order-4 mt-2 flex flex-col gap-2.5 md:mt-0 md:flex-row md:[&>a]:flex-1">
          <Link href={`/public/notice/${data.id}/report${lang === "en" ? "" : `?lang=${lang}`}`} className="btn btn-primary w-full !py-3.5 !text-[15px] !font-bold">
            {notice.report}
          </Link>
          <Link href="/public/works" className="btn w-full !py-3.5 !text-[15px]">
            {notice.allWorks}
          </Link>
        </div>
        <div className="order-5 flex flex-col gap-1.5 text-xs">
          <p>{notice.demoNote}</p>
          {notice.draftNote && <p>{notice.draftNote}</p>}
        </div>
        </div>
      </div>
    </div>
  );
}

export default function NoticePage(props: PageProps<"/public/notice/[id]">) {
  return (
    <main className="min-h-screen w-full bg-paper">
      <Suspense
        fallback={
          <>
            <PublicHeader title="Road works notice" />
            <p className="chip m-[18px]">Loading notice…</p>
          </>
        }
      >
        <Notice params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
