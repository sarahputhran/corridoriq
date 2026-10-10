"use server";

// Filing a permit from the File Permit screen: role check, validation, snap, engine, persist (one transaction),
// then documents and the case explanation outside it.
import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { generateExplanation } from "@/lib/ai/explain-case";
import { NotAllowedError, requireRole, toActor } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import type { Sql } from "@/lib/db/connection";
import { demoNow } from "@/lib/demo-clock";
import { getDemoToday } from "@/lib/demo-date";
import { audit, WorkflowError } from "./common";
import { filePermit, insertPermit, type NewPermit } from "./file-permit";
import { evaluateForm, permitFormSchema } from "./permit-form";

export type SubmitState = { ok: false; message: string; fields?: Record<string, string> } | null;

const DOC_KINDS = ["drawing", "trench_spec", "restoration_bond"] as const;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg"];

function readForm(formData: FormData) {
  const text = (k: string) => String(formData.get(k) ?? "");
  const num = (k: string) => (text(k).trim() === "" ? Number.NaN : Number(text(k)));
  return permitFormSchema.safeParse({
    department_id: text("department_id"),
    purpose: text("purpose"),
    work_type: text("work_type"),
    in_annual_programme: formData.get("in_annual_programme") === "on",
    proposed_start: text("proposed_start"),
    proposed_end: text("proposed_end"),
    trench_depth_m: num("trench_depth_m"),
    trench_width_m: num("trench_width_m"),
    road_side: text("road_side"),
    traffic_impact: text("traffic_impact"),
    start_lng: num("start_lng"),
    start_lat: num("start_lat"),
    end_lng: num("end_lng"),
    end_lat: num("end_lat"),
  });
}

/** Stores the uploaded documents in the private bucket. A failed upload never undoes the filing; it is reported instead. */
async function storeDocuments(permitUuid: string, formData: FormData): Promise<string[]> {
  const problems: string[] = [];
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const kind of DOC_KINDS) {
    const file = formData.get(`doc_${kind}`);
    if (!(file instanceof File) || file.size === 0) continue;
    if (file.size > MAX_FILE_BYTES || !ALLOWED_TYPES.includes(file.type)) {
      problems.push(`${file.name}: only PDF, PNG or JPG up to 4 MB`);
      continue;
    }
    const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
    const path = `${permitUuid}/${kind}-${safeName}`;
    const { error } = await supabase.storage.from("permit-attachments").upload(path, file, { contentType: file.type, upsert: true });
    if (error) {
      problems.push(`${file.name}: upload failed`);
      continue;
    }
    await db()`insert into attachments (permit_id, kind, storage_path, file_name) values (${permitUuid}, ${kind}, ${path}, ${file.name})`;
  }
  return problems;
}

export async function submitPermitAction(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const asDraft = formData.get("intent") === "draft";
  const parsed = readForm(formData);
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message]));
    const noTrench = ["start_lng", "start_lat", "end_lng", "end_lat"].some((k) => k in fields);
    return { ok: false, message: noTrench ? "Mark the trench on the map first: click the start, then the end." : "Check the highlighted fields.", fields };
  }

  let destination: string;
  try {
    const user = await requireRole("engineer");
    if (parsed.data.department_id !== user.department_id) throw new NotAllowedError(`You are viewing as ${user.display_name}, so you can only file for ${user.department_name}.`);
    const actor = toActor(user);
    const at = demoNow();
    const today = getDemoToday();

    const filed = await db().begin(async (tx) => {
      const sql = tx as unknown as Sql;
      const evaluated = await evaluateForm(sql, parsed.data, today);
      if ("error" in evaluated) throw new WorkflowError(evaluated.error);
      const { snap, form } = evaluated;
      // Serialise ID allocation so two filings at once cannot get the same number.
      await sql`select pg_advisory_xact_lock(hashtext('permit_id'))`;
      const year = today.slice(0, 4);
      const [{ next }] = await sql`select coalesce(max(split_part(permit_id, '/', 4)::int), 0) + 1 as next from permits where permit_id like ${`PMC/RC/${year}/%`}`;
      const permit: NewPermit = {
        permit_id: `PMC/RC/${year}/${String(next).padStart(4, "0")}`,
        department_id: form.department_id,
        applicant_user_id: user.user_id,
        purpose: form.purpose,
        work_type: form.work_type,
        in_annual_programme: form.in_annual_programme,
        fault_sanctioned: false,
        proposed_start: form.proposed_start,
        proposed_end: form.proposed_end,
        trench_depth_m: form.trench_depth_m,
        trench_width_m: form.trench_width_m,
        road_side: form.road_side,
        traffic_impact: form.traffic_impact,
        corridor_id: evaluated.permit.corridor_id,
        chainage_start_m: snap.chainage_start_m,
        chainage_end_m: snap.chainage_end_m,
        trench_length_m: snap.trench_length_m,
        snap_offset_m: snap.snap_offset_m,
        start_lat: form.start_lat,
        start_lng: form.start_lng,
        end_lat: form.end_lat,
        end_lng: form.end_lng,
        geom: snap.geom,
        // Filed by a demo visitor, not part of the seeded synthetic set; still demo data.
        synthetic: true,
      };
      if (asDraft) {
        const uuid = await insertPermit(sql, permit, "draft", at);
        await audit(sql, { at, actor, entity: "permit", entity_id: permit.permit_id, action: "permit_saved_as_draft" });
        return { permit_uuid: uuid, permit_id: permit.permit_id, case_id: null as string | null, case_ref: null as string | null };
      }
      const result = await filePermit(sql, permit, { actor, at, today });
      return { permit_uuid: result.permit_uuid, permit_id: permit.permit_id, case_id: result.case_id, case_ref: result.case_ref };
    });

    const problems = await storeDocuments(filed.permit_uuid, formData);
    // The explanation is written once, after the case is safely stored. If it fails the case is still complete.
    if (filed.case_id) await generateExplanation(db(), filed.case_id).catch((err) => console.error("explanation failed", err));

    const note = problems.length ? `&docs=${encodeURIComponent(problems.join("; "))}` : "";
    destination = filed.case_ref ? `/cases/${filed.case_ref}?filed=${encodeURIComponent(filed.permit_id)}${note}` : `/permits?filed=${encodeURIComponent(filed.permit_id)}${note}`;
  } catch (err) {
    if (err instanceof WorkflowError || err instanceof NotAllowedError) return { ok: false, message: err.message };
    console.error("submit permit failed", err);
    return { ok: false, message: "The permit could not be saved. Nothing was filed. Try again in a moment." };
  }
  redirect(destination);
}
