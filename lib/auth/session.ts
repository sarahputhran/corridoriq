// Who is asking. Every server action and protected page calls this; the role comes from the profiles table, never the browser.
import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { db } from "@/lib/db/client";
import type { Actor } from "@/lib/workflow/common";
import { createSupabaseServer } from "./supabase";

export type Role = "engineer" | "planner" | "supervisor" | "admin";

export interface SessionUser {
  user_id: string;
  email: string;
  display_name: string;
  role: Role;
  department_id: string | null;
  department_name: string | null;
}

/** The signed-in demo persona, or null for a visitor. Cached for the duration of one request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // The session is per request: never part of a prerendered shell.
  await connection();
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const [profile] = await db()`
    select pr.display_name, pr.role::text as role, pr.department_id, d.name as department_name
    from profiles pr left join departments d on d.id = pr.department_id where pr.user_id = ${data.user.id}`;
  if (!profile) return null;
  return {
    user_id: data.user.id,
    email: data.user.email ?? "",
    display_name: profile.display_name as string,
    role: profile.role as Role,
    department_id: profile.department_id as string | null,
    department_name: profile.department_name as string | null,
  };
});

export const toActor = (user: SessionUser): Actor => ({ user_id: user.user_id, role: user.role });

export class NotAllowedError extends Error {}

/** Throws unless the current persona has one of the given roles. Admin may do anything a planner or supervisor can view, but not decide. */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new NotAllowedError("You are not signed in. Pick a demo role from the header first.");
  if (!roles.includes(user.role)) throw new NotAllowedError(`This needs the ${roles.join(" or ")} role. You are viewing as ${user.display_name}.`);
  return user;
}
