// Pune city pack. Rule thresholds are NOT here: they live in the rules table (data/processed/rules.json when seeding).
import type { CityConfig, RuleRecord } from "@/engine/types";

export const pune = {
  city_id: "pune",
  name: "Pune",
  corridor_id: "sinhagad-road",
  /** [west, south, east, north]. South edge is 18.478 so permit 0015 is inside (see data/README.md). */
  bbox: [73.82, 18.478, 73.85, 18.51] as [number, number, number, number],
  languages: ["en", "hi", "mr"] as const,
  demo_today: "2026-10-15",
  snap_tolerance_m: 30,
  sla_hours: { department_response: 72, planner_decision: 48, checker: 24 },
  schedule_cost_days: [14, 42] as [number, number],
  defer_buffer_days: 7,
  /** How far around a trench the corridor-state loader collects facilities and bus routes. */
  context_radius_m: 500,
};

export function buildCityConfig(rules: RuleRecord[]): CityConfig {
  return {
    city_id: pune.city_id,
    rules,
    snap_tolerance_m: pune.snap_tolerance_m,
    sla_hours: pune.sla_hours,
    schedule_cost_days: pune.schedule_cost_days,
    defer_buffer_days: pune.defer_buffer_days,
  };
}
