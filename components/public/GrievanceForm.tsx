"use client";

import { useActionState } from "react";
import { submitGrievanceAction } from "@/lib/workflow/grievance-actions";

const input = "mt-1 block min-h-[44px] w-full border-[2.5px] border-ink bg-card px-2.5 text-[15px] font-normal";

/** The wording of the form, already in the resident's language. */
export interface GrievanceFormText {
  problem: string;
  placeholder: string;
  name: string;
  contact: string;
  send: string;
  sending: string;
  note: string;
}

export function GrievanceForm({ noticeId, lang, text }: { noticeId: string; lang: string; text: GrievanceFormText }) {
  const [state, action, pending] = useActionState(submitGrievanceAction, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="notice_id" value={noticeId} />
      <input type="hidden" name="lang" value={lang} />
      <label className="text-[13px] font-semibold">
        {text.problem}
        <textarea name="message" rows={5} required minLength={10} maxLength={1000} defaultValue={state?.values.message} className={`${input} resize-y py-2.5`} placeholder={text.placeholder} />
      </label>
      <label className="text-[13px] font-semibold">
        {text.name}
        <input type="text" name="name" maxLength={80} autoComplete="name" defaultValue={state?.values.name} className={input} />
      </label>
      <label className="text-[13px] font-semibold">
        {text.contact}
        <input type="text" name="contact" maxLength={120} defaultValue={state?.values.contact} className={input} />
      </label>
      <div className="hidden" aria-hidden="true">
        <label>
          Leave this empty
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {state && !state.ok && <p role="alert" className="border-2 border-ink bg-status-block-tint p-2.5 text-sm">{state.message}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary w-full !py-3.5 !text-[15px] !font-bold disabled:opacity-60">
        {pending ? text.sending : text.send}
      </button>
      <p className="text-xs">{text.note}</p>
    </form>
  );
}
