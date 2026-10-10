const DEFAULT_DEMO_TODAY = "2026-10-15";

/** The engine's "today". Fixed so the demo and tests stay deterministic. */
export function getDemoToday(): string {
  const value = process.env.DEMO_TODAY;
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : DEFAULT_DEMO_TODAY;
}

export function formatDemoDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
