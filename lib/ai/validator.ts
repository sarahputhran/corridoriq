// Checks an explanation against its fact sheet. Anything that fails is discarded,
// and the adapter moves on to the next provider. The same checks apply to the deterministic template.
import { factIndex, type FactSheet } from "./factsheet";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  /** Distinct citation IDs in order of first use. */
  citations: string[];
  sentences: string[];
}

const BANNED: [RegExp, string][] = [
  [/%/, "%"],
  [/\bper\s?cent/i, "percent"],
  [/\bpredict/i, "predict"],
  [/\bforecast/i, "forecast"],
  [/\bestimat/i, "estimate"],
  [/\blikely\b/i, "likely"],
  [/\bprobabilit/i, "probability"],
  [/\bexpected to\b/i, "expected to"],
  [/\bapproximately\b/i, "approximately"],
  [/\broughly\b/i, "roughly"],
  [/\bpeople affected\b/i, "people affected"],
  [/\bcommuters affected\b/i, "commuters affected"],
  [/\bvehicles\b/i, "vehicles"],
];
const TAG = /\[([^\[\]]+)\]/g;
const MIN_SENTENCES = 2;
const MAX_SENTENCES = 6;
/** Length of the prose with citation tags removed. Keeps the card readable; a rambling answer is discarded. */
const MAX_PROSE_CHARS = 700;

const NUMBER_WORDS: Record<string, number> = Object.fromEntries(
  ["two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"]
    .map((w, i): [string, number] => [w, i + 2])
    .concat([["thirty", 30], ["forty", 40], ["fifty", 50], ["sixty", 60], ["seventy", 70], ["eighty", 80], ["ninety", 90], ["hundred", 100]]),
);

const numbersIn =(s: string) => (s.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)));

/** Strings copied from the sheet (names, purposes) may contain digits and full stops; they are not claims. */
function knownStrings(sheet: FactSheet): string[] {
  return [
    sheet.case_ref,
    sheet.road_name,
    ...sheet.permits.flatMap((p) => [p.permit_id, p.purpose, p.department]),
    ...sheet.facilities.map((f) => f.name),
    ...sheet.bus_routes.map((b) => b.route_name),
    ...sheet.infra_zones.flatMap((z) => [z.project_name, z.agency]),
  ]
    .filter((s) => s.length > 2)
    .sort((a, b) => b.length - a.length);
}

export function validateExplanation(text: string, sheet: FactSheet): ValidationResult {
  const errors: string[] = [];
  const known = factIndex(sheet);
  const clean = text.trim().replace(/\s+/g, " ");

  // Mask verbatim fact strings so "Dr." or "450mm" inside a real name cannot break sentence or number checks.
  // Citation tags are left untouched so an ID is never mistaken for a name.
  const names = knownStrings(sheet);
  const masked = clean
    .split(/(\[[^\[\]]+\])/)
    .map((part) => (part.startsWith("[") ? part : names.reduce((text, s) => text.split(s).join("NAME"), part)))
    .join("");

  const sentences = masked.split(/(?<=[.!?\]])\s+(?=[A-Z"“(])/).filter(Boolean);
  if (sentences.length < MIN_SENTENCES || sentences.length > MAX_SENTENCES) errors.push(`has ${sentences.length} sentences; needs ${MIN_SENTENCES}–${MAX_SENTENCES}`);

  const prose = masked.replace(TAG, "").replace(/\s+/g, " ");
  if (clean.replace(TAG, "").length > MAX_PROSE_CHARS) errors.push(`is longer than ${MAX_PROSE_CHARS} characters`);
  // Fact IDs belong in the tags; prose that says "under rule XPMS_REPEAT_OTHER_3M" or "permit P0023" reads like a log.
  const leaked = prose.match(/\b(?:R:[A-Z0-9_]+|[A-Z]{3,}(?:_[A-Z0-9]+)+|P\d{4}|[FBSI]\d{1,2})\b/);
  if (leaked) errors.push(`mentions the fact ID ${leaked[0]} in the prose`);

  const citations: string[] = [];
  sentences.forEach((sentence, i) => {
    const ids = [...sentence.matchAll(TAG)].flatMap((m) => m[1].split(/\s*[,;]\s*/));
    if (!ids.length) errors.push(`sentence ${i + 1} has no citation`);
    for (const id of ids) {
      if (!known.has(id)) errors.push(`sentence ${i + 1} cites unknown fact [${id}]`);
      else if (!citations.includes(id)) citations.push(id);
    }
  });

  // Numbers the text may use: measured values and dates from the sheet, never digits that only occur inside an ID.
  const values: unknown[] = [
    sheet.buffer_m, sheet.chainage_start_m, sheet.chainage_end_m, ...Object.values(sheet.counts),
    ...sheet.permits.flatMap((p) => [p.starts, p.ends, p.chainage_start_m, p.chainage_end_m]),
    ...sheet.facilities.map((f) => f.distance_m),
    ...sheet.rules.map((r) => r.trigger),
    ...sheet.strategies.flatMap((s) => [s.schedule_shift_days, s.schedule_shift_weeks, Math.floor(s.schedule_shift_days / 7), Math.ceil(s.schedule_shift_days / 7), ...s.conditions]),
  ];
  const allowed = new Set(values.flatMap((v) => numbersIn(String(v))));
  for (const n of numbersIn(masked.replace(TAG, " "))) if (!allowed.has(n)) errors.push(`number ${n} is not in the fact sheet`);

  // Numbers written as words are claims too ("seventeen days"). "One" is left alone: it is mostly an article.
  for (const word of prose.toLowerCase().match(/\b[a-z]+\b/g) ?? []) {
    const n = NUMBER_WORDS[word];
    if (n !== undefined && !allowed.has(String(n))) errors.push(`number ${word} is not in the fact sheet`);
  }

  for (const [pattern, term] of BANNED) if (pattern.test(masked.replace(TAG, " "))) errors.push(`uses the banned term "${term}"`);

  return { ok: errors.length === 0, errors, citations, sentences: clean.split(/(?<=[.!?\]])\s+(?=[A-Z"“(])/).filter(Boolean) };
}
