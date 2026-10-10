"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { DEMO_USERS } from "@/config/demo-users";
import { createSupabaseServer } from "./supabase";

const schema = z.object({
  email: z.enum(DEMO_USERS.map((u) => u.email) as [string, ...string[]]),
  // Only same-site paths, so the form cannot be used to bounce someone elsewhere.
  next: z.string().regex(/^\/(?!\/)[\w\-./?=&%[\]]*$/).catch("/cases"),
});

/** Role switcher: signs in as one of the fixed demo personas. The shared password never leaves the server. */
export async function demoSignIn(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({ email: formData.get("email"), next: formData.get("next") ?? "/cases" });
  if (!parsed.success) redirect("/?signin=invalid");
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: process.env.DEMO_USER_PASSWORD! });
  if (error) redirect("/?signin=failed");
  redirect(parsed.data.next);
}

export async function demoSignOut(): Promise<void> {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/");
}
