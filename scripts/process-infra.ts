// Gives the S7 infrastructure projects chainage-range zones on the corridor.
import * as turf from "@turf/turf";
import type { FeatureCollection, Point } from "geojson";
import { CORRIDOR_ID, RESEARCH, loadCorridor, metres, readJson, readProcessed, readRaw, round, writeProcessed } from "./lib/data";
import { INFRA_ZONE_PAD_M } from "./fixes/pune";

type Project = { project_id: string; project_name: string; executing_agency: string; start_date: string | null; expected_completion: string | null; source_url: string; source_notes: string };
type Research = { geocodes: { query: string; lat: number; lng: number }[]; metro_line_4_stations: { names_in_planning_documents: string[]; finding: string } };
type Permit = { permit_id: string; chainage_start_m: number; chainage_end_m: number };

console.log("process-infra");
const corridor = loadCorridor();
const projects = new Map(readRaw<Project[]>("s7/corridoriq_infrastructure_projects_sinhagad_2025_2027.json").map((p) => [p.project_id, p]));
const research = readJson<Research>(`${RESEARCH}/locations.json`);
const geocode = (query: string) => research.geocodes.find((g) => g.query === query)!;
const permits = readProcessed<Permit[]>("permits.json");
const stops = readProcessed<FeatureCollection<Point, { stop_name: string }>>("bus_stops.geojson");

const interface0020 = permits.find((p) => p.permit_id.endsWith("0020"))!;

// Rajaram Bridge meets the corridor where the PMPML "Rajaram Pul" stops are.
const rajaramStops = stops.features
  .filter((s) => /^rajaram pul/i.test(s.properties.stop_name))
  .map((s) => corridor.snap(s.geometry.coordinates[0], s.geometry.coordinates[1]))
  .filter((s) => s.offset_m <= 60);
if (!rajaramStops.length) throw new Error("No Rajaram Pul stop found on the corridor");
const rajaramChainage = rajaramStops.reduce((sum, s) => sum + s.chainage_m, 0) / rajaramStops.length;

const distanceToCorridor = (query: string) => {
  const g = geocode(query);
  return round(turf.pointToLineDistance([g.lng, g.lat], corridor.line, metres), 0);
};

type ZoneSpec = {
  id: string;
  project_id: string;
  status: "active" | "planned" | "ongoing" | "completed";
  range: [number, number] | null;
  start_date: string | null;
  end_date: string | null;
  end_is_approximate?: boolean;
  /** Context zones flag criticality but never count as a schedule conflict. */
  context_only: boolean;
  programme_year_marker?: number;
  location_basis: string;
};

const specs: ZoneSpec[] = [
  {
    id: "METRO-L4-INTERFACE",
    project_id: "INFRA/METRO/LINE4/2026",
    status: "active",
    range: [interface0020.chainage_start_m - INFRA_ZONE_PAD_M, interface0020.chainage_end_m + INFRA_ZONE_PAD_M],
    start_date: "2026-06-26",
    end_date: "2030-04-13",
    end_is_approximate: true,
    context_only: false,
    location_basis: `Permit 0020 (Metro utility-diversion interface) ±${INFRA_ZONE_PAD_M} m. ${research.metro_line_4_stations.finding} Planned station names on this stretch: ${research.metro_line_4_stations.names_in_planning_documents.join(", ")}.`,
  },
  {
    id: "RAJARAM-BRIDGE-WIDENING",
    project_id: "INFRA/PMC/RAJARAM/2026",
    status: "planned",
    range: [rajaramChainage - INFRA_ZONE_PAD_M, rajaramChainage + INFRA_ZONE_PAD_M],
    start_date: null,
    end_date: null,
    context_only: true,
    location_basis: `Junction of Rajaram Bridge with Sinhagad Road, located by the PMPML "Rajaram Pul" stops (chainage ~${round(rajaramChainage, 0)} m) ±${INFRA_ZONE_PAD_M} m. Construction dates are not published; the S7 start date is a consultant tender date, so none is used.`,
  },
  {
    id: "SHIVANE-KHARADI-LINK",
    project_id: "INFRA/PMC/SHIVANE-KHARADI/2026",
    status: "ongoing",
    range: [rajaramChainage - INFRA_ZONE_PAD_M, rajaramChainage + INFRA_ZONE_PAD_M],
    start_date: null,
    end_date: null,
    context_only: true,
    location_basis: `The missing link starts at Rajaram Bridge on the Karvenagar bank; it touches the corridor only at the bridge junction, so the same junction zone is used. No completion date is published.`,
  },
  {
    id: "SUNCITY-KARVENAGAR-BRIDGE",
    project_id: "INFRA/PMC/2024/SC-KARVENAGAR",
    status: "completed",
    range: null,
    start_date: "2024-01-01",
    end_date: "2026-09-30",
    context_only: true,
    location_basis: `Suncity/Anandnagar approach geocodes about ${distanceToCorridor("Sun City Road, Pune")} m from the corridor line, beyond its Hingne end, so it has no chainage range. Kept as completed history.`,
  },
  {
    id: "BARANGANI-MALA-DRAINAGE",
    project_id: "INFRA/PMC/DRAINAGE/SINHAGAD/2026",
    status: "planned",
    range: null,
    start_date: null,
    end_date: null,
    context_only: true,
    programme_year_marker: 2026,
    location_basis: `Barangani Mala geocodes to Dhayari, about ${distanceToCorridor("Barangani Mala, Pune")} m from the corridor line, so it has no chainage range. Kept as off-corridor context.`,
  },
];

const zones = specs.map((z) => {
  const project = projects.get(z.project_id);
  if (!project) throw new Error(`S7 project ${z.project_id} not found`);
  const range = z.range && ([Math.max(0, z.range[0]), Math.min(corridor.length, z.range[1])] as const);
  return {
    id: z.id,
    project_id: z.project_id,
    project_name: project.project_name,
    agency: project.executing_agency,
    status: z.status,
    start_date: z.start_date,
    end_date: z.end_date,
    end_is_approximate: z.end_is_approximate ?? false,
    context_only: z.context_only,
    programme_year_marker: z.programme_year_marker ?? null,
    corridor_id: range ? CORRIDOR_ID : null,
    chainage_start_m: range ? round(range[0], 1) : null,
    chainage_end_m: range ? round(range[1], 1) : null,
    geometry_approximated: true,
    location_basis: z.location_basis,
    source_url: project.source_url,
    source_notes: project.source_notes,
    geom: range ? corridor.slice(range[0], range[1]) : null,
  };
});
writeProcessed("infra_zones.json", zones);
