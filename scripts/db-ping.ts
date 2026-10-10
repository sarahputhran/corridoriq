// Connectivity check: prints server facts only, never credentials. Usage: npm run db:ping
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });
async function main() {
  const sql = postgres(process.env.DATABASE_URL!, {
    max: 1,
    connect_timeout: 15,
    onnotice: () => {},
  });
  try {
    const [info] =
      await sql`select current_database() as db, current_user as usr, split_part(version(), ' ', 2) as pg`;
    const exts =
      await sql`select name, installed_version from pg_available_extensions where name in ('postgis','pg_cron') order by name`;
    const [tables] =
      await sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`;
    console.log(
      `connected: db=${info.db} user=${String(info.usr).split(".")[0]} postgres=${info.pg} public_tables=${tables.n}`,
    );
    for (const e of exts)
      console.log(
        `extension ${e.name}: ${e.installed_version ? "installed " + e.installed_version : "available, not installed"}`,
      );
  } catch (err) {
    const e = err as { code?: string; message?: string };
    console.error(
      `connection failed: ${e.code ?? ""} ${String(e.message ?? "").replace(/postgres(ql)?:\/\/\S+/g, "[redacted]")}`,
    );
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
void main();
