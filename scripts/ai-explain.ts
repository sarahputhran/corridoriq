// Generates (or regenerates) the cached explanation for every open case and prints which provider answered.
// Usage: npm run ai:explain            all cases
//        npm run ai:explain -- --sheet CC-2026-005   also print that case's fact sheet
import { config } from "dotenv";
import { generateExplanation, loadFactSheet } from "../lib/ai/explain-case";
import { createConnection } from "../lib/db/connection";

config({ path: ".env.local", quiet: true });

export async function explainAllCases(sql: ReturnType<typeof createConnection>, printSheetFor?: string, log: (line: string) => void = console.log) {
  const cases = await sql`select id, case_ref from coordination_cases order by case_ref`;
  for (const c of cases) {
    if (printSheetFor === c.case_ref) log(JSON.stringify(await loadFactSheet(sql, c.id as string), null, 1));
    const result = await generateExplanation(sql, c.id as string);
    if (!result) continue;
    log(`  ${c.case_ref}  ${result.provider}${result.model ? ` (${result.model})` : ""}  ${result.attempts.map((a) => `${a.provider}: ${a.detail}`).join(" → ")}`);
    log(`    ${result.text}`);
    if (process.argv.includes("--debug")) for (const a of result.attempts) if (a.rejected_text) log(`    rejected ${a.provider}: ${a.rejected_text}`);
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/ai-explain.ts")) {
  const sql = createConnection({ max: 1 });
  const i = process.argv.indexOf("--sheet");
  explainAllCases(sql, i > 0 ? process.argv[i + 1] : undefined)
    .catch((err) => {
      console.error("ai:explain failed:", String(err?.message ?? err).replace(/postgres(ql)?:\/\/\S+/g, "[connection string hidden]"));
      process.exitCode = 1;
    })
    .finally(() => sql.end({ timeout: 5 }));
}
