// One entry point for explanations: primary provider → the other AI provider (one try) →
// deterministic template. A model's answer is used only if it passes the validator.
import type { FactSheet } from "./factsheet";
import { userPrompt } from "./prompt";
import { geminiComplete } from "./providers/gemini";
import { groqComplete } from "./providers/groq";
import { templateExplanation } from "./providers/template";
import { validateExplanation } from "./validator";

export type ProviderName = "gemini" | "groq" | "template";

export interface Explanation {
  text: string;
  citations: string[];
  provider: ProviderName;
  model: string | null;
  validated: boolean;
  /** What happened at each step, for logs and the progress notes. Never contains keys. */
  attempts: { provider: ProviderName; ok: boolean; detail: string; rejected_text?: string }[];
}

type Complete = (user: string) => Promise<{ text: string; model: string }>;
const PROVIDERS: Record<Exclude<ProviderName, "template">, Complete> = { gemini: geminiComplete, groq: groqComplete };

function order(): Exclude<ProviderName, "template">[] {
  const primary = process.env.AI_PRIMARY;
  if (primary === "template") return [];
  return primary === "groq" ? ["groq", "gemini"] : ["gemini", "groq"];
}

/**
 * Tidies harmless formatting differences between models before validation: tags placed after the full stop
 * ("…routes. [F1] [B1] Next…"), the same tag repeated back to back, and stray spaces.
 */
export function normalise(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/([.!?])\s*((?:\[[^\[\]]+\]\s*)+)/g, (_m, stop: string, tags: string) => ` ${tags.trim()}${stop} `)
    .replace(/(\[[^\[\]]+\])(?:\s*\1)+/g, "$1")
    .replace(/\s+([.!?])/g, "$1")
    .replace(/([.!?])\1+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Injectable for tests; defaults to the real providers. */
export async function explain(sheet: FactSheet, providers: Partial<Record<"gemini" | "groq", Complete>> = PROVIDERS, sequence = order()): Promise<Explanation> {
  const attempts: Explanation["attempts"] = [];
  const prompt = userPrompt(sheet);
  for (const name of sequence) {
    const complete = providers[name];
    if (!complete) continue;
    try {
      const { text, model } = await complete(prompt);
      const clean = normalise(text);
      const check = validateExplanation(clean, sheet);
      if (check.ok) {
        attempts.push({ provider: name, ok: true, detail: "passed validation" });
        return { text: clean, citations: check.citations, provider: name, model, validated: true, attempts };
      }
      attempts.push({ provider: name, ok: false, detail: `failed validation: ${check.errors.slice(0, 3).join("; ")}`, rejected_text: clean });
    } catch (err) {
      const e = err as Error;
      attempts.push({ provider: name, ok: false, detail: e.name === "TimeoutError" ? "timed out" : e.message.slice(0, 120) });
    }
  }
  const text = templateExplanation(sheet);
  const check = validateExplanation(text, sheet);
  attempts.push({ provider: "template", ok: check.ok, detail: check.ok ? "built from the fact sheet" : `template failed its own validation: ${check.errors.join("; ")}` });
  return { text, citations: check.citations, provider: "template", model: null, validated: check.ok, attempts };
}
