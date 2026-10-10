"use client";

import { useActionState, useState } from "react";
import { STRATEGY_LABEL } from "@/lib/format";
import { decideCaseAction, signOffCaseAction, type ActionState } from "@/lib/workflow/actions";

const MIN_REASON = 15;

function Feedback({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`mt-3 border-2 border-ink p-2.5 text-[13px] ${state.ok ? "bg-status-ok" : "bg-status-block-tint"}`}>
      {state.message}
    </p>
  );
}

/** Planner: approve the recommendation in one click, or pick another strategy with a recorded reason. */
export function PlannerDecision({ caseId, recommended, options }: { caseId: string; recommended: string; options: { strategy: string; feasible: boolean }[] }) {
  const [state, action, pending] = useActionState(decideCaseAction, null);
  const [choosing, setChoosing] = useState(false);
  const others = options.filter((o) => o.strategy !== recommended);
  const [choice, setChoice] = useState(others.find((o) => o.feasible)?.strategy ?? others[0]?.strategy ?? "");
  const [reason, setReason] = useState("");
  const reasonOk = reason.trim().length >= MIN_REASON;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3">
        <form action={action}>
          <input type="hidden" name="case_id" value={caseId} />
          <input type="hidden" name="strategy" value={recommended} />
          <button type="submit" disabled={pending} className="btn btn-primary disabled:opacity-60">
            Approve {STRATEGY_LABEL[recommended].toLowerCase()}
          </button>
        </form>
        <button type="button" className="btn" aria-expanded={choosing} onClick={() => setChoosing((v) => !v)}>
          Choose another strategy
        </button>
      </div>
      {choosing && (
        <form action={action} className="border-2 border-ink bg-paper p-3.5">
          <input type="hidden" name="case_id" value={caseId} />
          <label htmlFor="strategy" className="mb-1.5 block text-[13px] font-semibold">
            Strategy
          </label>
          <select id="strategy" name="strategy" value={choice} onChange={(e) => setChoice(e.target.value)} className="mb-3 min-h-[44px] w-full border-[2.5px] border-ink bg-card px-2.5 text-sm">
            {others.map((o) => (
              <option key={o.strategy} value={o.strategy}>
                {STRATEGY_LABEL[o.strategy]}
                {o.feasible ? "" : " (marked not feasible)"}
              </option>
            ))}
          </select>
          <label htmlFor="override" className="mb-1.5 block text-[13px] font-semibold">
            Override reason (required: you are not picking the recommendation)
          </label>
          <textarea
            id="override"
            name="override_reason"
            rows={3}
            required
            minLength={MIN_REASON}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Jio has a contractual go-live on 15 Nov; separate execution with restoration bond"
            className="w-full resize-y border-[2.5px] border-ink bg-card p-2.5 text-sm"
          />
          <p className="mt-1 text-xs" aria-live="polite">
            {reasonOk ? "The reason is recorded in the audit trail with your name." : `At least ${MIN_REASON} characters. ${Math.max(0, MIN_REASON - reason.trim().length)} to go.`}
          </p>
          <button type="submit" disabled={pending || !reasonOk} className="btn mt-3 disabled:opacity-60">
            Record override
          </button>
        </form>
      )}
      <Feedback state={state} />
      <p className="mt-2.5 text-[13px]">Needs second sign-off from a supervisor before the permits are released.</p>
    </div>
  );
}

/** Supervisor: second sign-off on the planner's decision, or send it back with a note. */
export function SupervisorSignOff({ caseId }: { caseId: string }) {
  const [state, action, pending] = useActionState(signOffCaseAction, null);
  const [note, setNote] = useState("");
  return (
    <form action={action}>
      <input type="hidden" name="case_id" value={caseId} />
      <label htmlFor="checker-note" className="mb-1.5 block text-[13px] font-semibold">
        Checker note (optional when approving, required when sending back)
      </label>
      <textarea id="checker-note" name="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="w-full resize-y border-[2.5px] border-ink bg-paper p-2.5 text-sm" />
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="submit" name="approve" value="yes" disabled={pending} className="btn btn-primary disabled:opacity-60">
          Sign off and release permits
        </button>
        <button type="submit" name="approve" value="no" disabled={pending || !note.trim()} className="btn disabled:opacity-60">
          Send back to planner
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}
