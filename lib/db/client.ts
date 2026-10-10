// The app's single postgres.js connection pool. Server only: the browser never talks to the database.
import "server-only";
import { createConnection, type Sql } from "./connection";

const globalForDb = globalThis as unknown as { __corridoriqSql?: Sql };

/** Reused across hot reloads in dev and across requests in production. */
export function db(): Sql {
  globalForDb.__corridoriqSql ??= createConnection();
  return globalForDb.__corridoriqSql;
}
