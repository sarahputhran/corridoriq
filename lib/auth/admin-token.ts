// For scheduled jobs and scripts: a request may act as admin by presenting ADMIN_RESET_TOKEN in a header.
import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getSessionUser } from "./session";

export async function isAdminRequest(request: NextRequest): Promise<boolean> {
  const expected = process.env.ADMIN_RESET_TOKEN;
  const given = request.headers.get("x-admin-token");
  if (expected && given) {
    const a = Buffer.from(expected);
    const b = Buffer.from(given);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return (await getSessionUser())?.role === "admin";
}
