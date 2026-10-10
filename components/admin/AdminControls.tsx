"use client";

import { useActionState, useState } from "react";
import { STATUS_LABEL } from "@/lib/format";
import { rerunOpenPermitsAction, resetDemoAction, runEscalationAction, updateRuleAction, type AdminState } from "@/lib/workflow/admin-actions";

function Feedback({ state }: { state: AdminState }) {
  if (!state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`mt-2.5 border-2 border-ink p-2.5 text-[13px] ${state.ok ? "bg-status-ok" : "bg-status-block-tint"}`}>
      {state.message}
    </p>
  );
}

/** One rule: switch it on or off and edit its parameters as JSON. The server checks the shape before saving. */
export function RuleEditor({ ruleId, enabled, params }: { ruleId: string; enabled: boolean; params: unknown }) {
  const [state, action, pending] = useActionState(updateRuleAction, null);
  // Held in state so an edit that fails the check stays on screen to be corrected.
  const [text, setText] = useState(() => JSON.stringify(params, null, 2));
  const [on, setOn] = useState(enabled);
  return (
    <form action={action}>
      <input type="hidden" name="rule_id" value={ruleId} />
      <label htmlFor={`params-${ruleId}`} className="mb-1 block text-xs font-semibold">
        Parameters (JSON)
      </label>
      <textarea
        id={`params-${ruleId}`}
        name="params"
        rows={Math.min(8, Math.max(2, JSON.stringify(params, null, 2).split("\n").length))}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        className="w-full resize-y border-[2.5px] border-ink bg-paper p-2 font-mono text-xs"
      />
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <label className="flex min-h-[40px] cursor-pointer items-center gap-2 text-[13px]">
          <input type="checkbox" name="enabled" checked={on} onChange={(e) => setOn(e.target.checked)} className="h-5 w-5 accent-[#111111]" />
          Rule is switched on
        </label>
        <button type="submit" disabled={pending} className="min-h-[40px] border-[2.5px] border-ink bg-card px-3 text-[13px] font-semibold shadow-btn disabled:opacity-60">
          {pending ? "Saving…" : "Save rule"}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function RerunPanel() {
  const [state, action, pending] = useActionState(rerunOpenPermitsAction, null);
  return (
    <div>
      <form action={action}>
        <button type="submit" disabled={pending} className="btn disabled:opacity-60">
          {pending ? "Evaluating…" : "Re-run engine on open permits"}
        </button>
      </form>
      {state && <Feedback state={{ ok: state.ok, message: state.message }} />}
      {state?.rows && state.rows.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-xs [&_td]:border-2 [&_td]:border-ink [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_th]:border-2 [&_th]:border-ink [&_th]:bg-paper [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left">
            <thead>
              <tr>
                <th scope="col">Permit</th>
                <th scope="col">Status</th>
                <th scope="col">Stored result</th>
                <th scope="col">With rules as they are now</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((r) => {
                const added = r.after.rules.filter((x) => !r.before.rules.includes(x));
                const removed = r.before.rules.filter((x) => !r.after.rules.includes(x));
                return (
                  <tr key={r.permit_id} className={r.changed ? "bg-warn-tint" : ""}>
                    <td className="whitespace-nowrap font-mono font-semibold">{r.permit_id}</td>
                    <td>{STATUS_LABEL[r.status] ?? r.status}</td>
                    <td>
                      {r.before.decision.replace(/_/g, " ").toLowerCase()} · {r.before.rules.length} rules
                    </td>
                    <td>
                      {r.changed ? <b>Changed: </b> : "Same: "}
                      {r.after.decision.replace(/_/g, " ").toLowerCase()} · {r.after.rules.length} rules
                      {added.length > 0 && <span className="mt-0.5 block font-mono">now fires: {added.join(", ")}</span>}
                      {removed.length > 0 && <span className="mt-0.5 block font-mono">no longer fires: {removed.join(", ")}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs">The stored result is from when each permit was filed. A difference can come from a rule edit, or from permits filed on the same stretch since then.</p>
        </div>
      )}
    </div>
  );
}

export function EscalateButton() {
  const [state, action, pending] = useActionState(runEscalationAction, null);
  return (
    <div>
      <form action={action}>
        <button type="submit" disabled={pending} className="btn disabled:opacity-60">
          {pending ? "Running…" : "Run escalation now"}
        </button>
      </form>
      <Feedback state={state} />
    </div>
  );
}

export function ResetButton() {
  const [state, action, pending] = useActionState(resetDemoAction, null);
  return (
    <div>
      <form action={action}>
        <button type="submit" disabled={pending} className="btn btn-primary disabled:opacity-60">
          {pending ? "Resetting, about a minute…" : "Reset demo"}
        </button>
      </form>
      <Feedback state={state} />
    </div>
  );
}
