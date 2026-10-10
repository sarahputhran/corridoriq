// Supabase client bound to the request's cookies. Used only for the auth session; data goes through lib/db.
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options);
        } catch {
          // Server Components cannot write cookies; proxy.ts refreshes the session instead.
        }
      },
    },
  });
}
