// Puts the demo back to its starting story through the admin endpoint. Runs before and after the smoke tests.
import { config } from "dotenv";

export default async function resetDemo() {
  config({ path: ".env.local", quiet: true });
  const token = process.env.ADMIN_RESET_TOKEN;
  if (!token) throw new Error("ADMIN_RESET_TOKEN is missing from .env.local");
  const res = await fetch("http://localhost:3000/api/admin/reset", { method: "POST", headers: { "x-admin-token": token }, signal: AbortSignal.timeout(280_000) });
  if (!res.ok) throw new Error(`Demo reset failed with HTTP ${res.status}`);
}
