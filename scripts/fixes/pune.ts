// Demo fixes for the Pune pack. Applied by scripts/process-permits.ts;
// every change is described in data/README.md. Nothing here edits data/raw.

export { DEPARTMENTS } from "../../config/departments";

export type PermitStatus = "proposed" | "approved" | "completed" | "in_progress";

export type PermitFix = {
  /** New demo dates; omitted = keep the S5 dates. */
  dates?: [start: string, end: string];
  filed_at: string;
  status: PermitStatus;
  work_type?: "emergency_fault";
  in_annual_programme?: false;
  purpose?: string;
  role: string;
};

/** Keyed by the last four digits of the permit ID. */
export const PERMIT_FIXES: Record<string, PermitFix> = {
  "0001": { dates: ["2026-11-02", "2026-12-11"], filed_at: "2026-10-01", status: "proposed", role: "C1 / D: restored stretch, >100 m staging" },
  "0002": { dates: ["2026-11-23", "2026-12-02"], filed_at: "2026-10-08", status: "proposed", role: "C1" },
  "0003": { dates: ["2026-11-26", "2026-12-06"], filed_at: "2026-10-12", status: "proposed", role: "C1" },
  "0004": { dates: ["2026-11-09", "2026-12-09"], filed_at: "2026-09-15", status: "approved", role: "C2 / P" },
  "0005": { dates: ["2026-11-23", "2026-12-07"], filed_at: "2026-09-25", status: "approved", role: "C2 / P" },
  "0006": { dates: ["2026-11-30", "2026-12-14"], filed_at: "2026-10-13", status: "proposed", in_annual_programme: false, role: "C2 / P: not in annual programme" },
  "0007": { filed_at: "2026-09-01", status: "approved", role: "C3" },
  "0008": { filed_at: "2026-10-09", status: "proposed", role: "C3 / R: repeat same utility vs 0022" },
  "0009": { filed_at: "2026-10-11", status: "proposed", role: "C3" },
  "0010": { filed_at: "2026-09-10", status: "approved", role: "C4 / O" },
  "0011": { filed_at: "2026-10-10", status: "proposed", role: "C4 / O: override scenario" },
  "0012": { filed_at: "2026-10-02", status: "proposed", role: "C5 / M" },
  "0013": { filed_at: "2026-10-06", status: "proposed", role: "C5 / M" },
  "0014": { filed_at: "2026-10-09", status: "proposed", role: "C5 / M" },
  "0015": { filed_at: "2026-08-01", status: "completed", role: "history" },
  "0016": { filed_at: "2026-07-20", status: "completed", role: "history → R1 restoration" },
  "0017": { dates: ["2027-01-11", "2027-01-18"], filed_at: "2026-10-14", status: "proposed", role: "I: isolated → auto-approve" },
  "0018": { dates: ["2026-10-14", "2026-10-18"], filed_at: "2026-10-14", status: "in_progress", work_type: "emergency_fault", role: "E: emergency" },
  "0019": { dates: ["2027-05-20", "2027-05-26"], filed_at: "2026-10-07", status: "proposed", role: "B: monsoon block" },
  "0020": { filed_at: "2026-09-05", status: "approved", role: "M: metro interface" },
  "0021": { filed_at: "2026-10-12", status: "proposed", role: "near C3" },
  "0022": { filed_at: "2026-08-30", status: "completed", work_type: "emergency_fault", role: "history for R (0008)" },
  "0023": {
    dates: ["2026-10-26", "2026-11-26"],
    filed_at: "2026-09-20",
    status: "proposed",
    purpose: "200mm water distribution main replacement near Karva Hospital",
    role: "H: hero",
  },
  "0024": {
    dates: ["2026-11-12", "2026-11-23"],
    filed_at: "2026-10-10",
    status: "proposed",
    purpose: "OFC duct laying for FTTH near Karva Hospital",
    role: "H: hero (triggers case)",
  },
  "0025": { filed_at: "2026-07-15", status: "completed", role: "history → R3 restoration" },
};

/** Permits whose S5 coordinates are not on Sinhagad Road and are re-placed onto the corridor. */
export const HERO = {
  facilityName: "Karva Hospital",
  /** The raw coordinates of these permits are beside Deenanath Mangeshkar Hospital, about 880 m from the corridor. */
  permits: ["0023", "0024"],
  /** Distance kept between the end of the longer hero trench and the corridor's end. */
  endMarginM: 50,
} as const;

/** Lateral position used when a permit has to be re-placed: 3 m either side keeps the 6 m mutual offset. */
export const SIDE_OFFSET_M: Record<string, number> = { left: 3, right: -3, center: 0, "full-width": 0 };

export const RESTORATIONS = {
  R1: {
    sourcePermit: "0016",
    // Wider than the stretch of 0016 itself: 0016 is 45–86 m away from the C1
    // permits, so R1 alone would not touch them and scenario D could not fire. Modelled as the
    // reinstated block around the chamber works instead.
    padM: 100,
    completed_on: "2026-08-28",
    surface: "bituminous",
    protected: false,
    kind: "reinstatement",
  },
  R2: {
    sourcePermits: ["0004", "0005", "0006"],
    padM: 50,
    completed_on: "2025-11-01",
    surface: "cement_concrete",
    protected: true,
    kind: "reconstruction",
  },
  R3: {
    sourcePermit: "0025",
    padM: 0,
    completed_on: "2026-08-20",
    surface: "bituminous",
    protected: false,
    kind: "reinstatement",
  },
} as const;

export const SNAP_TOLERANCE_M = 30;
export const INFRA_ZONE_PAD_M = 150;
