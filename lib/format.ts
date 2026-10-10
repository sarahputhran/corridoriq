// Display helpers shared by server and client components. No percentages anywhere: levels are shown as words.

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const DATE_SHORT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const DATE_TIME = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });

const utc = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
export const fmtDate = (iso: string) => DATE.format(utc(iso));

/** "26 Oct – 26 Nov 2026" */
export function fmtRange(start: string, end: string): string {
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${sameYear ? DATE_SHORT.format(utc(start)) : DATE.format(utc(start))} – ${DATE.format(utc(end))}`;
}

/** Timestamps are shown in the demo city's time. */
export const fmtDateTime = (d: Date | string) => `${DATE_TIME.format(new Date(d))} IST`;

/** True for a well-formed permit ID such as PMC/RC/2026/0026 (used to vet values taken from the URL). */
export const isPermitId = (value: unknown): value is string => typeof value === "string" && /^PMC\/RC\/\d{4}\/\d{4}$/.test(value);

export const fmtMetres =(n: number) => Math.round(n).toLocaleString("en-IN");

/** "SOME_ENUM_VALUE" or "some_flag" → "Some enum value" */
export function humanize(value: string): string {
  const s = value.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "2 days left", "5 h left" or "overdue by 3 days" relative to the demo clock. */
export function slaText(due: Date | string | null, now: Date): { text: string; overdue: boolean } | null {
  if (!due) return null;
  const hours = (new Date(due).getTime() - now.getTime()) / 3_600_000;
  const abs = Math.abs(hours);
  const amount = abs >= 36 ? `${Math.round(abs / 24)} days` : abs >= 24 ? "1 day" : `${Math.max(1, Math.round(abs))} h`;
  return hours >= 0 ? { text: `${amount} left`, overdue: false } : { text: `overdue by ${amount}`, overdue: true };
}

/** Whole weeks for a schedule shift, as the strategies table shows them ("· 2 wk"). */
export const shiftWeeks = (days: number) => (days <= 0 ? null : days < 7 ? `${days} d` : `${Math.round(days / 7)} wk`);

export const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  awaiting_department: "Waiting for departments",
  awaiting_planner: "Coordination required",
  awaiting_checker: "Waiting for sign-off",
  decided: "Decided",
  closed: "Closed",
  coordination_required: "Coordination required",
  review_required: "Review required",
  auto_approved: "Auto-approved",
  approved: "Approved",
  approved_with_conditions: "Approved with conditions",
  blocked: "Blocked",
  submitted: "Submitted",
  completed: "Completed",
  in_progress: "In progress",
  rescheduled: "Rescheduled",
  rejected: "Rejected",
  draft: "Draft",
};

/** Background token for a status chip. The chip always carries its text; colour is never the only signal. */
export function statusTone(status: string): string {
  if (["awaiting_planner", "awaiting_department", "coordination_required", "review_required", "open"].includes(status)) return "bg-status-coord";
  if (["decided", "approved", "auto_approved", "approved_with_conditions", "completed", "closed"].includes(status)) return "bg-status-ok";
  if (["blocked", "rejected"].includes(status)) return "bg-status-block-tint";
  if (status === "awaiting_checker") return "bg-status-escalated";
  return "bg-card";
}

export const STRATEGY_LABEL: Record<string, string> = {
  JOINT_EXECUTION: "Joint execution",
  DEFER_NEW_PERMIT: "Defer new permit",
  RESEQUENCE_WORKS: "Resequence works",
  SEPARATE_EXECUTION: "Separate execution",
  BLOCK_OR_ESCALATE: "Block or escalate",
};

export const TRAFFIC_LABEL: Record<string, string> = { one_lane: "one lane closed", partial_closure: "partial closure", full_closure: "full closure", none: "no traffic impact" };
