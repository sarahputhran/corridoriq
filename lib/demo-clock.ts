import { getDemoToday } from "./demo-date";

/**
 * The demo's "now": DEMO_TODAY's date with the real time of day (UTC). Every workflow timestamp and SLA uses it,
 * so the seeded story stays consistent however long after seeding someone opens the demo.
 */
export function demoNow(): Date {
  const real = new Date();
  return new Date(`${getDemoToday()}T${real.toISOString().slice(11)}`);
}

export const HOUR_MS = 3_600_000;
export const addHours = (d: Date, hours: number) => new Date(d.getTime() + hours * HOUR_MS);
