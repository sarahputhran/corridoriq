// Turns a notice's database fields into the text a citizen reads, in English, Hindi or Marathi.
// Deterministic: no AI is involved, so a notice says the same thing every time.
import { en } from "./templates/en";
import { hi } from "./templates/hi";
import { mr } from "./templates/mr";
import type { NoticeData, NoticeLang, NoticeStrings, RenderedNotice } from "./types";

export const NOTICE_LANGS: Record<NoticeLang, NoticeStrings> = { en, hi, mr };
export const isNoticeLang = (v: unknown): v is NoticeLang => v === "en" || v === "hi" || v === "mr";

function dateRange(start: string, end: string, locale: string): string {
  const d = (iso: string, withYear: boolean) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC", numberingSystem: "latn" }).format(new Date(`${iso}T00:00:00Z`));
  return `${d(start, start.slice(0, 4) !== end.slice(0, 4))} – ${d(end, true)}`;
}

export function renderNotice(data: NoticeData, lang: NoticeLang): RenderedNotice {
  const t = NOTICE_LANGS[lang];
  const road = t.roadName(data.road_name);
  const count = data.works.length;
  const n = t.numberWord[count] ?? String(count);
  // A facility keeps its own name; a bus stop is written in the notice's script.
  const landmark = data.facility ?? (data.nearest_stop ? t.placeName(data.nearest_stop) : null);
  const round = (m: number) => (Math.round(m / 10) * 10).toLocaleString("en-IN");

  const sides = [...new Set(data.works.map((w) => w.road_side))];
  const traffic = (t.traffic[data.traffic_impact] ?? data.traffic_impact) + (sides.length === 1 ? `, ${t.side[sides[0]] ?? sides[0]}` : "");
  const diversion = [data.traffic_impact === "full_closure" ? t.diversionFull : t.diversionNone, data.facility ? t.accessOpen(data.facility) : ""].filter(Boolean).join(" ");
  // Department names are proper nouns and stay as the departments write them.
  const responsible = t.responsible(data.departments);
  const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return {
    lang,
    pageTitle: t.pageTitle,
    badge: data.joint && count > 1 ? t.badge(n) : null,
    headline: landmark ? t.near(road, landmark) : t.atChainage(road, round(data.chainage_start_m), round(data.chainage_end_m)),
    summary: sentence(count > 1 ? (data.joint ? t.summaryJoint(n) : t.summarySeparate(n)) : t.summarySingle),
    rows: [
      { label: t.labels.dates, value: dateRange(data.starts_on, data.ends_on, t.dateLocale) },
      { label: t.labels.traffic, value: traffic },
      { label: t.labels.diversion, value: diversion },
      { label: t.labels.responsible, value: responsible },
      { label: t.labels.reference, value: data.reference, mono: true },
    ],
    report: t.report,
    allWorks: t.allWorks,
    demoNote: t.demoNote,
    draftNote: t.draftNote,
  };
}
