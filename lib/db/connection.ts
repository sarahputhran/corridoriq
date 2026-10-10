// Creates a postgres.js connection from DATABASE_URL. Used by scripts directly and by lib/db/client.ts in the app.
import postgres from "postgres";

export type Sql = postgres.Sql;

export function createConnection(options: { max?: number } = {}): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Run `npm run check:env`.");
  // Supabase's transaction pooler (port 6543) suits serverless hosting but cannot keep prepared statements,
  // so they are switched off for it. The session pooler (port 5432) keeps them.
  const transactionPooler = /:6543\//.test(url);
  return postgres(url, {
    max: options.max ?? (process.env.VERCEL ? 2 : 5),
    prepare: !transactionPooler,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
    // numeric → number: every numeric column here is a length, depth or chainage, well inside double precision.
    types: { numeric: { to: 0, from: [1700], serialize: (v: number) => String(v), parse: (v: string) => Number(v) } },
  });
}
