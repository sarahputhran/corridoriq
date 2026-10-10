// Shared workflow helpers: actor, audit trail, case titles.
import type { Sql } from "@/lib/db/connection";

export interface Actor {
  user_id: string | null;
  role: "engineer" | "planner" | "supervisor" | "admin" | "system";
}

export class WorkflowError extends Error {
  /** Safe to show to the user: says what happened and what to do. */
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

export interface AuditEntry {
  at: Date;
  actor: Actor;
  entity: "permit" | "case" | "task" | "rule" | "notice" | "demo";
  entity_id: string;
  action: string;
  before?: unknown;
  after?: unknown;
}

/** Every state change writes one append-only row. */
export async function audit(sql: Sql, e: AuditEntry): Promise<void> {
  await sql`
    insert into audit_log (at, actor_user_id, actor_role, entity, entity_id, action, before, after)
    values (${e.at}, ${e.actor.user_id}, ${e.actor.role}, ${e.entity}, ${e.entity_id}, ${e.action},
            ${e.before === undefined ? null : sql.json(e.before as never)}, ${e.after === undefined ? null : sql.json(e.after as never)})`;
}

const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/** e.g. "Water and Jio works on the same 200 m" or "MSEDCL work in the Pune Metro Line 4 zone". */
export function caseTitle(departments: string[], lengthM: number, infraNames: string[]): string {
  const names = [...new Set(departments)];
  const who = names.length > 4 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : list(names);
  if (names.length <= 1 && infraNames.length) return `${who} work in the ${infraNames[0].split(" — ")[0]} zone`;
  const metres = Math.max(10, Math.round(lengthM / 10) * 10);
  return `${who} works on the same ${metres} m`;
}

export const SYSTEM: Actor = { user_id: null, role: "system" };
