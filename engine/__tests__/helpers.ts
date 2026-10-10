import { buildCityConfig } from "../../config/cities/pune";
import { evaluatePermit } from "../pipeline";
import type { CityConfig, CorridorState, InfraZone, NearbyBusRoute, NearbyFacility, PermitInput, PipelineResult, Restoration, RuleRecord } from "../types";
import fixture from "./fixtures/pune.json";

export const TODAY = "2026-10-15";
export type FixturePermit = PermitInput & { filed_at: string };

export const data = fixture as unknown as {
  corridor: CorridorState["corridor"];
  permits: FixturePermit[];
  restorations: Restoration[];
  infraZones: InfraZone[];
  rules: RuleRecord[];
  context: Record<string, { facilities: NearbyFacility[]; busRoutes: NearbyBusRoute[] }>;
};

export const pid = (short: string) => `PMC/RC/2026/${short}`;
export const permit = (short: string): FixturePermit => {
  const found = data.permits.find((p) => p.permit_id === pid(short));
  if (!found) throw new Error(`No permit ${short} in the fixture`);
  return found;
};

/** Filing order: by filed_at, then permit ID. This is the order the seed replays. */
export const filingOrder = [...data.permits].sort((a, b) => a.filed_at.localeCompare(b.filed_at) || a.permit_id.localeCompare(b.permit_id));

const blockedCache = new Map<string, boolean>();
/** A permit the engine blocked when it was filed is not a work that will happen, so later filings do not see it. */
function wasBlocked(p: FixturePermit): boolean {
  if (p.status !== "proposed") return false;
  if (!blockedCache.has(p.permit_id)) blockedCache.set(p.permit_id, evaluate(p.permit_id.slice(-4)).decision === "BLOCK");
  return blockedCache.get(p.permit_id)!;
}

/** The corridor as it stood when `short` was filed: only permits filed before it exist, as the database loader sees them. */
export function stateWhenFiled(short: string): CorridorState {
  const index = filingOrder.findIndex((p) => p.permit_id === pid(short));
  return {
    corridor: data.corridor,
    permits: filingOrder.slice(0, index).filter((p) => !wasBlocked(p)),
    restorations: data.restorations,
    infraZones: data.infraZones,
    ...data.context[pid(short)],
  };
}

type RuleEdit = { enabled?: boolean; params?: Record<string, unknown> };
export function city(edits: Record<string, RuleEdit> = {}): CityConfig {
  return buildCityConfig(
    data.rules.map((r) => {
      const edit = edits[r.rule_id];
      return edit ? { ...r, enabled: edit.enabled ?? r.enabled, params: { ...(r.params as object), ...edit.params } } : r;
    }),
  );
}

export function evaluate(short: string, edits: Record<string, RuleEdit> = {}): PipelineResult {
  return evaluatePermit({ permit: permit(short), corridor: stateWhenFiled(short), city: city(edits), today: TODAY });
}

export const counterpart = (result: PipelineResult, id: string) => {
  const found = result.counterparts.find((c) => c.id === id || c.id === pid(id));
  if (!found) throw new Error(`No counterpart ${id}`);
  return found;
};
export const strategy = (result: PipelineResult, name: string) => result.strategies!.find((s) => s.strategy === name)!;
