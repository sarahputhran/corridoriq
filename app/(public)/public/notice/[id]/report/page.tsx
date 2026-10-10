import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { GrievanceForm } from "@/components/public/GrievanceForm";
import { PublicHeader } from "@/components/PublicHeader";
import { getNotice } from "@/lib/db/notices";
import { NOTICE_LANGS, isNoticeLang, renderNotice } from "@/lib/notices/render";

export const metadata: Metadata = { title: "Report a problem | CorridorIQ" };

async function Report({ params, searchParams }: Pick<PageProps<"/public/notice/[id]/report">, "params" | "searchParams">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  await connection();
  const lang = isNoticeLang(query.lang) ? query.lang : "en";
  const t = NOTICE_LANGS[lang];
  const data = await getNotice(id).catch(() => null);
  if (!data) {
    return (
      <>
        <PublicHeader title={t.pageTitle} />
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4 p-[18px] md:py-7">
          <section className="card !p-4">
            <h1 className="!text-2xl">Notice not found</h1>
            <p className="mt-2 text-sm">We could not find the notice you want to report on.</p>
            <p className="mt-4">
              <Link href="/public/works" className="btn">See all works on this road</Link>
            </p>
          </section>
        </div>
      </>
    );
  }
  const notice = renderNotice(data, lang);
  const form = t.reportForm;
  return (
    <div lang={lang}>
      <PublicHeader title={t.pageTitle} />
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4 p-[18px] md:py-7">
        <section className="card !p-4">
          <h1 className="mb-1.5 !text-2xl !leading-[1.15]">{form.title}</h1>
          <p className="text-sm">{form.about(notice.headline)}</p>
          <p className="mt-1 text-sm">
            {t.labels.reference}: <span className="font-mono text-[13px]">{data.reference}</span>
          </p>
        </section>
        <section className="card !p-4">
          <GrievanceForm
            noticeId={data.id}
            lang={lang}
            text={{ problem: form.problem, placeholder: form.placeholder, name: form.name, contact: form.contact, send: form.send, sending: form.sending, note: form.note }}
          />
        </section>
        <Link href={`/public/notice/${data.id}${lang === "en" ? "" : `?lang=${lang}`}`} className="btn w-full">
          {form.back}
        </Link>
      </div>
    </div>
  );
}

export default function ReportPage(props: PageProps<"/public/notice/[id]/report">) {
  return (
    <main className="min-h-screen w-full bg-paper">
      <Suspense
        fallback={
          <>
            <PublicHeader title="Road works notice" />
            <p className="chip m-[18px]">Loading…</p>
          </>
        }
      >
        <Report params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
