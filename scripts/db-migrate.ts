// Applies supabase/migrations to the remote database with the Supabase CLI, using DATABASE_URL from .env.local.
// No `supabase login` or `link` needed. Usage: npm run db:migrate   |   npm run db:migrations (list only)
import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

config({ path: ".env.local", quiet: true });
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is missing. Run `npm run check:env`.");
  process.exit(1);
}
const listOnly = process.argv.includes("--list");
const args = listOnly ? ["migration", "list", "--db-url", url] : ["db", "push", "--db-url", url, "--yes"];
// Run the CLI entry point with node directly (no shell), so characters in the connection string are never reinterpreted.
const result = spawnSync(process.execPath, [join("node_modules", "supabase", "dist", "supabase.js"), ...args], { encoding: "utf8" });
// The CLI can echo the connection string on errors; never let it through.
const scrub = (s: string) => s.replace(/postgres(ql)?:\/\/\S+/g, "[connection string hidden]");
process.stdout.write(scrub(result.stdout ?? ""));
process.stderr.write(scrub(result.stderr ?? ""));
process.exit(result.status ?? 1);
