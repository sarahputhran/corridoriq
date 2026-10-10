// Processes reference layers: facilities (S2), bus (S3), wards (S4), rules (S6), complaints (S8), departments.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FeatureCollection, LineString, MultiPolygon, Point } from "geojson";
import { RAW, featureCollection, parseCsv, readRaw, roundCoord, writeProcessed } from "./lib/data";
import { DEPARTMENTS } from "./fixes/pune";

console.log("process-reference");

// ── Facilities ────────────────────────────────────────────────────────────────
type CleanFacility = { name: string | null; type: string };
type RawFacility = { name?: string; "name:en"?: string; amenity?: string };
const clean = readRaw<FeatureCollection<Point, CleanFacility>>("s2/corridoriq_pune_facilities.geojson");
const rawFac = readRaw<FeatureCollection<Point, RawFacility>>("s2/pune_sinhagad_facilities_raw.geojson");
const coordKey = (c: number[]) => `${c[0].toFixed(6)},${c[1].toFixed(6)}`;
const rawByCoord = new Map(rawFac.features.filter((f) => f.geometry.type === "Point").map((f) => [coordKey(f.geometry.coordinates), f.properties]));

const MEDICAL_NAME = /hospital|clinic|nursing|health|medical|care|dr\.?\s|doctor|dental|eye|heart|maternity|ortho|surg|diagnos|pathology|ayur|homeo|physio/i;
const facilityFixes: { name: string; from: string; to: string; reason: string }[] = [];

const facilities = clean.features
  .map((f) => {
    const raw = rawByCoord.get(coordKey(f.geometry.coordinates));
    const rawName = raw?.name ?? raw?.["name:en"] ?? null;
    const name = f.properties.name ?? rawName;
    let type = f.properties.type;
    if (type === "hospital") {
      // The cleaned file folds clinics into "hospital"; the raw OSM tag keeps them apart.
      if (raw?.amenity === "clinic" || raw?.amenity === "doctors") type = "clinic";
      // OSM mis-tags: a named, clearly non-medical business tagged amenity=hospital.
      if (f.properties.name == null && rawName && !MEDICAL_NAME.test(rawName)) {
        facilityFixes.push({ name: rawName, from: "hospital", to: "commercial", reason: "non-medical business mis-tagged amenity=hospital in OSM" });
        type = "commercial";
      }
    }
    return { name, type, coordinates: roundCoord(f.geometry.coordinates) };
  })
  .sort((a, b) => a.type.localeCompare(b.type) || (a.name ?? "").localeCompare(b.name ?? "") || a.coordinates[0] - b.coordinates[0] || a.coordinates[1] - b.coordinates[1])
  .map((f, i) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: f.coordinates },
    properties: { id: `FAC-${String(i + 1).padStart(4, "0")}`, name: f.name, type: f.type, source: "OpenStreetMap" },
  }));
writeProcessed("facilities.geojson", featureCollection(facilities));
writeProcessed("_facility_fixes.json", facilityFixes);

// ── Bus ───────────────────────────────────────────────────────────────────────
type RouteProps = { route_id: number | string; route_name: string; shape_id: string };
const routes = readRaw<FeatureCollection<LineString, RouteProps>>("s3/corridoriq_pune_bus_routes.geojson");
writeProcessed(
  "bus_routes.geojson",
  featureCollection(
    routes.features.map((f) => ({
      type: "Feature" as const,
      geometry: { type: "MultiLineString" as const, coordinates: [f.geometry.coordinates.map(roundCoord)] },
      properties: { id: String(f.properties.route_id), route_name: f.properties.route_name, shape_id: f.properties.shape_id, source: "PMPML GTFS" },
    })),
  ),
);
type StopProps = { stop_id: number | string; stop_name: string; routes_served?: string };
const stops = readRaw<FeatureCollection<Point, StopProps>>("s3/corridoriq_pune_bus_stops.geojson");
writeProcessed(
  "bus_stops.geojson",
  featureCollection(
    stops.features.map((f) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: roundCoord(f.geometry.coordinates) },
      properties: {
        id: String(f.properties.stop_id),
        stop_name: f.properties.stop_name,
        routes_served: (f.properties.routes_served ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        source: "PMPML GTFS",
      },
    })),
  ),
);

// ── Wards ─────────────────────────────────────────────────────────────────────
type WardProps = { ward_number: number; ward_name: string; admin_zone: string; source_year: number; source: string };
const wards = readRaw<FeatureCollection<MultiPolygon, WardProps>>("s4/corridoriq_sinhagad_road_wards.geojson");
writeProcessed("wards.geojson", featureCollection([...wards.features].sort((a, b) => a.properties.ward_number - b.properties.ward_number)));

// ── Departments ───────────────────────────────────────────────────────────────
writeProcessed("departments.json", DEPARTMENTS);

// ── Rules ─────────────────────────────────────────────────────────────────────
// Structured params for each rule. The CSV text columns are kept verbatim next to them.
// Four of them are not in the source CSV and exist so the engine hard-codes no threshold: dlp_months,
// overlap_tolerance_m, not_joint_departments and separation_pairs.
const RULE_PARAMS: Record<string, unknown> = {
  PMC_DLP_12M: { months: 12 },
  PMC_CC_DLP_PRIOR_APPROVAL: { surfaces: ["cc", "cement_concrete", "mastic"], dlp_months: 12 },
  PMC_MONSOON_5M: { start_mmdd: "04-30", end_mmdd: "09-30", applies_to: "routine" },
  PMC_FAULT_48H: { hours: 48 },
  PMC_FAULT_MONSOON_5X1: { max_length_m: 5, max_width_m: 1 },
  PMC_100M_STAGING: { max_length_m: 100 },
  PMC_ANNUAL_PROGRAMME: {},
  XPMS_REPEAT_SAME_6M: { months: 6 },
  XPMS_REPEAT_OTHER_3M: { months: 3 },
  XPMS_COMMON_TRENCH_3_6M: { min_months: 3, max_months: 6 },
  MOHUA_UTILITY_COORDINATION: { groups: [["Jio Fiber", "Airtel Fiber", "MSEDCL (electricity)", "Maharashtra Natural Gas Ltd"]] },
  CORRIDOR_CRITICAL_MORATORIUM: { months: 36 },
  CORRIDOR_RESTORED_12M: { months: 12 },
  CORRIDOR_FACILITY_CRITICALITY_GATE: { buffer_m: 200, critical_types: ["hospital", "clinic", "school"], include_bus: true, commercial_min: 5 },
  CORRIDOR_SAME_SEGMENT_MULTIWORK: { window_days: 90, adjacent_m: 50, nearby_m: 200, overlap_tolerance_m: 5 },
  CORRIDOR_EXECUTION_FEASIBILITY: {
    max_depth_diff_m: 0.6,
    heuristic: true,
    not_joint_departments: ["Pune Metro Rail"],
    separation_pairs: [["Maharashtra Natural Gas Ltd", "MSEDCL (electricity)"]],
  },
};
const ruleRows = parseCsv(readFileSync(join(RAW, "s6/corridoriq_comprehensive_rules_v1.csv"), "utf8"));
const rules = ruleRows.map((r) => {
  if (!(r.rule_id in RULE_PARAMS)) throw new Error(`No params defined for rule ${r.rule_id}`);
  return {
    rule_id: r.rule_id,
    city_id: "pune",
    category: r.category,
    provenance: r.source_type,
    trigger_text: r.trigger,
    action: r.action,
    severity: r.severity,
    threshold_text: r.threshold,
    reason: r.reason,
    source: r.source_document,
    params: RULE_PARAMS[r.rule_id],
    enabled: true,
  };
});
const missing = Object.keys(RULE_PARAMS).filter((id) => !rules.some((r) => r.rule_id === id));
if (missing.length) throw new Error(`Rules with params defined here but missing from the CSV: ${missing.join(", ")}`);
writeProcessed("rules.json", rules);

// ── Complaints evidence ───────────────────────────────────────────────────────
type Complaint = { evidence_id: string; source_type: string; date: string; source: string; location: string; complaint_or_evidence: string; problem_tags: string[]; strength: string; source_url: string };
const complaints = readRaw<Complaint[]>("s8/corridoriq_citizen_complaints_section8.json");
writeProcessed(
  "complaints.json",
  // Direct quotes are deliberately dropped: the app paraphrases and links to the source.
  complaints.map((c) => ({
    id: c.evidence_id,
    date: c.date,
    source: c.source,
    source_type: c.source_type,
    location: c.location,
    summary: c.complaint_or_evidence,
    tags: c.problem_tags,
    strength: c.strength,
    url: c.source_url,
  })),
);
