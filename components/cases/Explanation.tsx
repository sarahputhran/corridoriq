"use client";

import { useActionState } from "react";
import { regenerateExplanationAction } from "@/lib/workflow/actions";

interface Citation {
  id: string;
  label: string;
  anchor: string;
}

/** Renders "…text [F1] [R:RULE]…" with each tag as a mono chip that names its record and jumps to it. */
export function ExplanationText({ text, citations }: { text: string; citations: Citation[] }) {
  const byId = new Map(citations.map((c) => [c.id, c]));
  const parts = text.split(/(\[[^\[\]]+\])/).filter(Boolean);
  return (
    <p className="text-base leading-[1.6]">
      {parts.map((part, i) => {
        const id = part.startsWith("[") ? part.slice(1, -1) : null;
        const fact = id ? byId.get(id) : undefined;
        if (!id || !fact) return <span key={i}>{part}</span>;
        return (
          <a key={i} href={`#${fact.anchor}`} title={fact.label} aria-label={`Source: ${fact.label}`} className="cite no-underline hover:bg-accent">
            {id.replace(/^R:/, "")}
          </a>
        );
      })}
    </p>
  );
}

export function RegenerateExplanation({ caseId, hasExplanation }: { caseId: string; hasExplanation: boolean }) {
  const [state, action, pending] = useActionState(regenerateExplanationAction, null);
  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="case_id" value={caseId} />
      <button type="submit" disabled={pending} className="border-2 border-ink bg-card px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60">
        {pending ? "Writing…" : hasExplanation ? "Regenerate explanation" : "Write explanation"}
      </button>
      {state && (
        <span role={state.ok ? "status" : "alert"} className="ml-2.5 text-xs">
          {state.message}
        </span>
      )}
    </form>
  );
}
