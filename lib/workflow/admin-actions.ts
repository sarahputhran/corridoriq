"use server";

// Admin actions: edit rule parameters, re-run the engine on open permits, run SLA escalation, reset the demo.
import { refresh } from "next/cache";
import { z } from "zod";
import { evaluatePermit } from "@/engine/pipeline";
import { RULE_IDS, ruleParamSchemas, type RuleId } from "@/engine/rules";
import { NotAllowedError, requireRole, toActor } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import type { Sql } from "@/lib/db/connection";
import { PERMIT_COLUMNS, loadCityConfig, loadCorridorState, toPermitInput, type PermitRow } from "@/lib/db/corridor-state";
import { demoNow } from "@/lib/demo-clock";
import { getDemoToday } from "@/lib/demo-date";
import { runSeed } from "@/scripts/seed";
import { audit } from "./common";

export type AdminState = { ok: boolean; message: string } | null;

function fail(err: unknown, fallback: string): AdminState {
  if (err instanceof NotAllowedError) return { ok: false, message: err.message };
  console.error("admin action failed", err);
  return { ok: false, message: fallback };
}

const ruleSchema = z.object({ rule_id: z.enum(RULE_IDS as [RuleId, ...RuleId[]]), enabled: z.boolean(), params: z.string().max(4000) });

export async function updateRuleAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const parsed = ruleSchema.safeParse({ rule_id: formData.get("rule_id"), enabled: formData.get("enabled") === "on", params: String(formData.get("params") ?? "") });
  if (!parsed.success) return { ok: false, message: "That rule could not be found." };
  let json: unknown;
  try {
    json = JSON.parse(parsed.data.params);
  } catch {
    return { ok: false, message: "The parameters are not valid JSON. Check for a missing quote, comma or bracket." };
  }
  const checked = ruleParamSchemas[parsed.data.rule_id].safeParse(json);
  if (!checked.success) {
    return { ok: false, message: `These parameters do not fit this rule: ${checked.error.issues.map((i) => `${i.path.join(".") || "value"}: ${i.message}`).join("; ")}` };
  }
  try {
    const user = await requireRole("admin");
    await db().begin(async (tx) => {
      const sql = tx as unknown as Sql;
      const [before] = await sql`select params, enabled from rules where rule_id = ${parsed.data.rule_id} and city_id = 'pune' for update`;
      if (!before) throw new Error("rule missing");
      await sql`update rules set params = ${sql.json(checked.data as never)}, enabled = ${parsed.data.enabled} where rule_id = ${parsed.data.rule_id} and city_id = 'pune'`;
      await audit(sql, { at: demoNow(), actor: toActor(user), entity: "rule", entity_id: parsed.data.rule_id, action: "rule_updated", before, after: { params: checked.data, enabled: parsed.data.enabled } });
    });
    refresh();
    return { ok: true, message: "Saved. New filings and pre-checks use it from now on." };
  } catch (err) {
    return fail(err, "The rule was not saved. Try again.");
  }
}

export interface RerunRow {
  permit_id: string;
  status: string;
  before: { decision: string; rules: string[] };
  after: { decision: string; rules: string[] };
  changed: boolean;
}
export type RerunState = { ok: boolean; message: string; rows?: RerunRow[] } | null;

/** Evaluates every open permit again with the rules as they are now. Nothing is saved: it shows what a rule edit would change. */
export async function rerunOpenPermitsAction(): Promise<RerunState> {
  try {
    await requireRole("admin");
    const sql = db();
    const city = await loadCityConfig(sql);
    const today = getDemoToday();
    const open = await sql.unsafe<(PermitRow & { geom: unknown; stored_decision: string | null; stored_rules: string[] | null })[]>(
      `select ${PERMIT_COLUMNS}, st_asgeojson(p.geom)::jsonb as geom, e.decision::text as stored_decision, e.rule_ids as stored_rules
       from permits p join departments d on d.id = p.department_id
       left join lateral (select decision, rule_ids from evaluations where permit_id = p.id order by ran_at desc limit 1) e on true
       where p.status in ('submitted', 'coordination_required', 'review_required') order by p.permit_id`,
    );
    const rows: RerunRow[] = [];
    for (const p of open) {
      const { state } = await loadCorridorState(sql, p.corridor_id!, p.geom as never, p.id);
      const result = evaluatePermit({ permit: toPermitInput(p), corridor: state, city, today });
      const before = { decision: p.stored_decision ?? "none", rules: p.stored_rules ?? [] };
      const after = { decision: result.decision, rules: result.ruleIds };
      rows.push({ permit_id: p.permit_id, status: p.status, before, after, changed: before.decision !== after.decision || before.rules.join() !== after.rules.join() });
    }
    const changed = rows.filter((r) => r.changed).length;
    return { ok: true, message: `${rows.length} open permits evaluated again. ${changed} would come out differently. Nothing was saved.`, rows };
  } catch (err) {
    return fail(err, "The re-run could not finish. Nothing was changed.");
  }
}

export async function runEscalationAction(): Promise<AdminState> {
  try {
    await requireRole("admin", "supervisor");
    const [{ n }] = await db()`select public.escalate_overdue_tasks(${demoNow()}) as n`;
    refresh();
    return { ok: true, message: n === 0 ? "No overdue tasks to escalate." : `${n} overdue ${n === 1 ? "task was" : "tasks were"} escalated to the supervisor.` };
  } catch (err) {
    return fail(err, "Escalation could not run. Try again.");
  }
}

export async function resetDemoAction(): Promise<AdminState> {
  try {
    await requireRole("admin");
    const { counts } = await runSeed();
    refresh();
    return { ok: true, message: `Demo reset: ${counts.permits} permits, ${counts.cases} cases, ${counts.notices} notices. Signed-in roles may need to be picked again.` };
  } catch (err) {
    return fail(err, "The reset did not finish. Run it again; a reset always starts from a clean slate.");
  }
}
