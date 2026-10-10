"use server";

// "Report a problem" on a public notice. Open to anyone, so input is kept small and strictly validated.
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db/client";
import type { Sql } from "@/lib/db/connection";
import { demoNow } from "@/lib/demo-clock";
import { NOTICE_LANGS, isNoticeLang } from "@/lib/notices/render";
import { audit } from "./common";

/** On failure the typed text comes back, so the form can show it again instead of going blank. */
export type GrievanceState = { ok: false; message: string; values: { message: string; name: string; contact: string } } | null;

const schema = z.object({
  notice_id: z.uuid(),
  lang: z.enum(["en", "hi", "mr"]).catch("en"),
  name: z.string().trim().max(80).optional(),
  contact: z.string().trim().max(120).optional(),
  message: z.string().trim().min(10, "tooShort").max(1000, "tooLong"),
  // A field people cannot see. Automated form fillers tend to complete it.
  website: z.string().max(0),
});

export async function submitGrievanceAction(_prev: GrievanceState, formData: FormData): Promise<GrievanceState> {
  const value = (k: string) => (formData.get(k) ? String(formData.get(k)) : undefined);
  const parsed = schema.safeParse({ notice_id: formData.get("notice_id"), lang: formData.get("lang"), name: value("name"), contact: value("contact"), message: value("message") ?? "", website: value("website") ?? "" });
  // Messages go back in the language the resident was reading.
  const rawLang = formData.get("lang");
  const text = NOTICE_LANGS[isNoticeLang(rawLang) ? rawLang : "en"].reportForm;
  const values = { message: value("message") ?? "", name: value("name") ?? "", contact: value("contact") ?? "" };
  if (!parsed.success) {
    const issue = parsed.error.issues.find((i) => i.path[0] === "message");
    return { ok: false, message: issue?.message === "tooShort" ? text.tooShort : issue?.message === "tooLong" ? text.tooLong : text.failed, values };
  }
  const { notice_id, lang, name, contact, message } = parsed.data;
  try {
    await db().begin(async (tx) => {
      const sql = tx as unknown as Sql;
      const [notice] = await sql`select reference from notices where id = ${notice_id}`;
      if (!notice) throw new Error("notice missing");
      const at = demoNow();
      const [g] = await sql`insert into grievances (notice_id, name, contact, message, created_at) values (${notice_id}, ${name ?? null}, ${contact ?? null}, ${message}, ${at}) returning id`;
      // The audit entry records that a report arrived, not who sent it or what it says.
      await audit(sql, { at, actor: { user_id: null, role: "system" }, entity: "notice", entity_id: notice.reference as string, action: "grievance_received", after: { grievance_id: g.id } });
    });
  } catch {
    return { ok: false, message: text.notSaved, values };
  }
  redirect(`/public/notice/${notice_id}?reported=1${lang === "en" ? "" : `&lang=${lang}`}`);
}
