"use client";

import { useActionState, useState } from "react";
import { respondToTaskAction } from "@/lib/workflow/actions";

/** A department engineer confirms the permit's dates or proposes an alternative window. */
export function TaskResponseForm({ taskId, start, end }: { taskId: string; start: string | null; end: string | null }) {
  const [state, action, pending] = useActionState(respondToTaskAction, null);
  const [proposing, setProposing] = useState(false);
  if (state?.ok) return <p role="status" className="border-2 border-ink bg-status-ok p-2.5 text-[13px]">{state.message}</p>;
  return (
    <form action={action} className="mt-2.5">
      <input type="hidden" name="task_id" value={taskId} />
      {proposing && (
        <div className="mb-3 grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-[13px] font-semibold">
            New start
            <input type="date" name="proposed_start" required defaultValue={start ?? undefined} className="mt-1 block min-h-[44px] w-full border-[2.5px] border-ink bg-paper px-2.5 font-normal" />
          </label>
          <label className="text-[13px] font-semibold">
            New end
            <input type="date" name="proposed_end" required defaultValue={end ?? undefined} className="mt-1 block min-h-[44px] w-full border-[2.5px] border-ink bg-paper px-2.5 font-normal" />
          </label>
          <label className="text-[13px] font-semibold sm:col-span-2">
            Note for the planner (optional)
            <input type="text" name="note" maxLength={500} className="mt-1 block min-h-[44px] w-full border-[2.5px] border-ink bg-paper px-2.5 font-normal" />
          </label>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        {proposing ? (
          <>
            <button type="submit" name="action" value="propose" disabled={pending} className="btn btn-primary disabled:opacity-60">Send alternative dates</button>
            <button type="button" className="btn" onClick={() => setProposing(false)}>Cancel</button>
          </>
        ) : (
          <>
            <button type="submit" name="action" value="confirm" disabled={pending} className="btn btn-primary disabled:opacity-60">Confirm dates</button>
            <button type="button" className="btn" onClick={() => setProposing(true)}>Propose alternative</button>
          </>
        )}
      </div>
      {state && !state.ok && <p role="alert" className="mt-3 border-2 border-ink bg-status-block-tint p-2.5 text-[13px]">{state.message}</p>}
    </form>
  );
}
