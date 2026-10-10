export type NoticeLang = "en" | "hi" | "mr";

export interface NoticeStrings {
  lang: NoticeLang;
  languageName: string;
  pageTitle: string;
  roadName: (road: string) => string;
  /** A landmark name as this language writes it. */
  placeName: (name: string) => string;
  near: (road: string, landmark: string) => string;
  atChainage: (road: string, from: string, to: string) => string;
  /** Index = the number; used for small counts in running text. */
  numberWord: string[];
  badge: (n: string) => string;
  summaryJoint: (n: string) => string;
  summarySeparate: (n: string) => string;
  summarySingle: string;
  labels: { dates: string; traffic: string; diversion: string; responsible: string; reference: string; works: string };
  traffic: Record<string, string>;
  side: Record<string, string>;
  diversionNone: string;
  diversionFull: string;
  accessOpen: (name: string) => string;
  /** How several departments are listed on the Responsible row. */
  responsible: (departments: string[]) => string;
  report: string;
  allWorks: string;
  demoNote: string;
  /** Shown on languages whose text has not been checked by a native speaker yet. */
  draftNote: string | null;
  /** The "Report a problem" page that hangs off a notice. */
  reportForm: {
    title: string;
    about: (place: string) => string;
    problem: string;
    placeholder: string;
    name: string;
    contact: string;
    send: string;
    sending: string;
    note: string;
    back: string;
    thanks: string;
    tooShort: string;
    tooLong: string;
    failed: string;
    notSaved: string;
  };
  dateLocale: string;
}

/** What a notice is built from: database fields only. */
export interface NoticeData {
  id: string;
  reference: string;
  road_name: string;
  chainage_start_m: number;
  chainage_end_m: number;
  starts_on: string;
  ends_on: string;
  traffic_impact: string;
  departments: string[];
  /** True when the case was decided as joint execution. */
  joint: boolean;
  works: { permit_id: string; department: string; purpose: string; road_side: string }[];
  /** Nearest hospital, clinic or school inside the buffer, if any. */
  facility: string | null;
  /** Nearest bus stop to the middle of the stretch, used when there is no facility. */
  nearest_stop: string | null;
}

export interface RenderedNotice {
  lang: NoticeLang;
  pageTitle: string;
  badge: string | null;
  headline: string;
  summary: string;
  rows: { label: string; value: string; mono?: boolean }[];
  report: string;
  allWorks: string;
  demoNote: string;
  draftNote: string | null;
}
