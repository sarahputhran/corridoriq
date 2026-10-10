"use server";

// Server actions for the case workflow. Each one: checks the role on the server, validates input with zod,
// runs inside one transaction, writes audit entries (inside the workflow functions) and refreshes the page.
import { refresh } from "next/cache";
import { z } from "zod";
import { generateExplanation } from "@/lib/ai/explain-case";
import { NotAllowedError, requireRole, toActor, type Role } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import type { Sql } from "@/lib/db/connection";
import { demoNow } from "@/lib/demo-clock";
import { decideCase, respondToTask, signOffCase } from "./case-actions";
import { WorkflowError } from "./common";

export type ActionState = { ok: boolean; message: string } | null;

const STRATEGIES = ["JOINT_EXECUTION", "DEFER_NEW_PERMIT", "RESEQUENCE_WORKS", "SEPARATE_EXECUTION", "BLOCK_OR_ESCALATE"] as const;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function run(roles: Role[], work: (tx: Sql, actor: ReturnType<typeof toActor>, user: Awaited<ReturnType<typeof requireRole>>) => Promise<string>): Promise<ActionState> {
  try {
    const user = await requireRole(...roles);
    const message = await db().begin((tx) => work(tx as unknown as Sql, toActor(user), user));
    refresh();
    return { ok: true, message: message as string };
  } catch (err) {
    if (err instanceof WorkflowError || err instanceof NotAllowedError) return { ok: false, message: err.message };
    console.error("workflow action failed", err);
    return { ok: false, message: "Something went wrong saving that. Nothing was changed. Try again, and if it keeps happening reset the demo from Admin." };
  }
}

const decideSchema = z.object({ case_id: z.uuid(), strategy: z.enum(STRATEGIES), override_reason: z.string().max(1000).optional() });

export async function decideCaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = decideSchema.safeParse({ case_id: formData.get("case_id"), strategy: formData.get("strategy"), override_reason: formData.get("override_reason") ?? undefined });
  if (!parsed.success) return { ok: false, message: "Pick a strategy before submitting." };
  return run(["planner"], async (tx, actor) => {
    await decideCase(tx, parsed.data.case_id, parsed.data, actor, demoNow());
    return "Decision recorded. It now needs a supervisor's sign-off.";
  });
}

const signOffSchema = z.object({ case_id: z.uuid(), approve: z.enum(["yes", "no"]), note: z.string().max(1000).optional() });

export async function signOffCaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signOffSchema.safeParse({ case_id: formData.get("case_id"), approve: formData.get("approve"), note: formData.get("note") ?? undefined });
  if (!parsed.success) return { ok: false, message: "Choose approve or send back." };
  return run(["supervisor"], async (tx, actor) => {
    const approve = parsed.data.approve === "yes";
    await signOffCase(tx, parsed.data.case_id, { approve, note: parsed.data.note }, actor, demoNow());
    return approve ? "Signed off. The permits are released and one combined notice is published." : "Sent back to the planner with your note.";
  });
}

const respondSchema = z.object({
  task_id: z.uuid(),
  action: z.enum(["confirm", "propose"]),
  proposed_start: isoDate.optional(),
  proposed_end: isoDate.optional(),
  note: z.string().max(500).optional(),
});

export async function respondToTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const value = (k: string) => (formData.get(k) ? String(formData.get(k)) : undefined);
  const parsed = respondSchema.safeParse({ task_id: formData.get("task_id"), action: formData.get("action"), proposed_start: value("proposed_start"), proposed_end: value("proposed_end"), note: value("note") });
  if (!parsed.success) return { ok: false, message: "Check the dates: both are needed, in the form YYYY-MM-DD." };
  return run(["engineer"], async (tx, actor, user) => {
    const [task] = await tx`select assignee_department_id from tasks where id = ${parsed.data.task_id}`;
    if (!task || task.assignee_department_id !== user.department_id) throw new NotAllowedError("This task belongs to another department. Switch to that department's engineer.");
    const { task_id, ...response } = parsed.data;
    await respondToTask(tx, task_id, response, actor, demoNow());
    return response.action === "confirm" ? "Dates confirmed." : "Alternative dates sent to the planner.";
  });
}

const regenerateSchema = z.object({ case_id: z.uuid() });

/** Explicit "Regenerate": the only way an explanation is rewritten after a case exists. Never called on page view. */
export async function regenerateExplanationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = regenerateSchema.safeParse({ case_id: formData.get("case_id") });
  if (!parsed.success) return { ok: false, message: "That case could not be found." };
  try {
    await requireRole("planner", "supervisor", "admin");
    const result = await generateExplanation(db(), parsed.data.case_id);
    if (!result) return { ok: false, message: "That case could not be found." };
    refresh();
    return { ok: true, message: result.provider === "template" ? "Written from the template; the AI providers were unavailable or their answer failed the checks." : "Written and checked against the case records." };
  } catch (err) {
    if (err instanceof NotAllowedError) return { ok: false, message: err.message };
    console.error("explanation failed", err);
    return { ok: false, message: "The explanation could not be written. The case itself is unchanged." };
  }
}
