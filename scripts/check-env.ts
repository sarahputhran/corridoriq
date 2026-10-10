// Validates .env.local without ever printing a value. Usage: npm run check:env [-- --stage=setup|ai|all]
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { z } from "zod";

type Stage = "setup" | "ai";
type Check = { name: string; stage: Stage; schema: z.ZodType<string>; hint: string };

const nonEmpty = z.string().trim().min(1);

const checks: Check[] = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    stage: "setup",
    schema: nonEmpty.regex(/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/),
    hint: "should look like https://<project-ref>.supabase.co",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    stage: "setup",
    schema: nonEmpty.regex(/^(sb_publishable_[\w-]{20,}|eyJ[\w-]+\.[\w-]+\.[\w-]+)$/),
    hint: "should start with sb_publishable_ (or eyJ for the legacy anon key)",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    stage: "setup",
    schema: nonEmpty.regex(/^(sb_secret_[\w-]{20,}|eyJ[\w-]+\.[\w-]+\.[\w-]+)$/),
    hint: "should start with sb_secret_ (or eyJ for the legacy service_role key)",
  },
  {
    name: "DATABASE_URL",
    stage: "setup",
    schema: nonEmpty
      .regex(/^postgres(ql)?:\/\/[^:]+:[^@]+@[^/]+\/\w+/, "not a postgres connection string")
      .refine((v) => !v.includes("[YOUR-PASSWORD]"), "still contains [YOUR-PASSWORD]")
      .refine((v) => v.includes("pooler.supabase.com"), "not the Session pooler string"),
    hint: "Session pooler string with [YOUR-PASSWORD] replaced by the database password",
  },
  {
    name: "SUPABASE_PROJECT_REF",
    stage: "setup",
    schema: nonEmpty.regex(/^[a-z0-9]{20}$/),
    hint: "20 lowercase letters/digits (the part before .supabase.co)",
  },
  {
    name: "DEMO_TODAY",
    stage: "setup",
    schema: nonEmpty.regex(/^\d{4}-\d{2}-\d{2}$/),
    hint: "YYYY-MM-DD",
  },
  { name: "DEMO_USER_PASSWORD", stage: "setup", schema: nonEmpty.min(16), hint: "16+ characters" },
  { name: "ADMIN_RESET_TOKEN", stage: "setup", schema: nonEmpty.min(24), hint: "24+ characters" },
  {
    name: "AI_PRIMARY",
    stage: "ai",
    schema: z.enum(["gemini", "groq", "template"]),
    hint: "gemini | groq | template",
  },
  { name: "GEMINI_API_KEY", stage: "ai", schema: nonEmpty.min(30), hint: "from aistudio.google.com" },
  { name: "GEMINI_MODEL", stage: "ai", schema: nonEmpty, hint: "a Gemini model id" },
  { name: "GROQ_API_KEY", stage: "ai", schema: nonEmpty.regex(/^gsk_\w{20,}$/), hint: "starts with gsk_" },
  { name: "GROQ_MODEL", stage: "ai", schema: nonEmpty, hint: "a Groq model id" },
];

if (!existsSync(".env.local")) {
  console.error("✗ .env.local not found. Copy .env.example to .env.local first.");
  process.exit(1);
}
config({ path: ".env.local", quiet: true });

const stageArg = process.argv.find((a) => a.startsWith("--stage="))?.split("=")[1] ?? "all";
const required = (stage: Stage) => stageArg === "all" || stageArg === stage;

let failures = 0;
for (const check of checks) {
  // Strip trailing "# comment" left over from the example file.
  const raw = (process.env[check.name] ?? "").replace(/\s+#.*$/, "").trim();
  let status: string;
  if (!raw) {
    status = required(check.stage) ? "✗ missing" : "– not set yet (needed later)";
    if (required(check.stage)) failures++;
  } else if (check.schema.safeParse(raw).success) {
    status = "✓ set, looks valid";
  } else {
    status = `✗ set, but looks wrong: ${check.hint}`;
    failures++;
  }
  console.log(`${check.name.padEnd(32)} ${status}`);
}

if (
  process.env.SUPABASE_PROJECT_REF &&
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes(process.env.SUPABASE_PROJECT_REF.trim())
) {
  console.log("✗ SUPABASE_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL");
  failures++;
}

console.log(failures === 0 ? `\nAll good (stage: ${stageArg}).` : `\n${failures} problem(s) (stage: ${stageArg}).`);
process.exit(failures === 0 ? 0 : 1);
