// ISO-date arithmetic without the clock. All dates are YYYY-MM-DD strings, compared in UTC.

const DAY_MS = 86_400_000;

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function toDayNumber(iso: string): number {
  const [y, m, d] = parts(iso);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** Whole days from `a` to `b` (negative when b is earlier). */
export function daysBetween(a: string, b: string): number {
  return toDayNumber(b) - toDayNumber(a);
}

export function addDays(iso: string, days: number): string {
  return fromUtc((toDayNumber(iso) + days) * DAY_MS);
}

/** Calendar-month addition, clamped to the last day of the target month. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = parts(iso);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return fromUtc(Date.UTC(year, month, Math.min(d, lastDay)));
}

export function windowsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** Days between two date windows; 0 when they overlap. */
export function windowGapDays(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  if (windowsOverlap(aStart, aEnd, bStart, bEnd)) return 0;
  return aEnd < bStart ? daysBetween(aEnd, bStart) : daysBetween(bEnd, aStart);
}

/** True when the later window starts no more than `months` calendar months after the earlier one ends. */
export function windowsWithinMonths(aStart: string, aEnd: string, bStart: string, bEnd: string, months: number): boolean {
  if (windowsOverlap(aStart, aEnd, bStart, bEnd)) return true;
  const [earlierEnd, laterStart] = aEnd < bStart ? [aEnd, bStart] : [bEnd, aStart];
  return laterStart <= addMonths(earlierEnd, months);
}

/** Does [start, end] touch the mm-dd window in any year it spans? */
export function overlapsSeason(start: string, end: string, startMmdd: string, endMmdd: string): boolean {
  for (let year = Number(start.slice(0, 4)); year <= Number(end.slice(0, 4)); year++) {
    if (windowsOverlap(start, end, `${year}-${startMmdd}`, `${year}-${endMmdd}`)) return true;
  }
  return false;
}
