# Data

`data/raw` holds the source files exactly as collected. Nothing edits them. The scripts in `scripts/` turn them into `data/processed`, which is the only thing the database seed reads.

```bash
npm run data
```

That rebuilds `data/processed` and runs 16 checks.

## Sources

| Folder | Contents | Source | Real or made up |
|---|---|---|---|
| `raw/s1` | 1,857 road lines around Sinhagad Road | OpenStreetMap | Real |
| `raw/s2` | 346 facilities (hospitals, clinics, schools, shops, places of worship, police, fire) | OpenStreetMap | Real |
| `raw/s3` | 152 bus route shapes and 95 stops | PMPML GTFS feed | Real |
| `raw/s4` | 4 ward boundaries | DataMeet municipal data | Real |
| `raw/s5` | 25 road-cutting permits | Written for the demo | Made up |
| `raw/s6` | 16 rules, each with its trigger, action, severity and source | PMC trenching guidelines, Hong Kong XPMS, a 2017 MoHUA advisory, demo settings | Each rule lists its source |
| `raw/s7` | 5 infrastructure projects, described in text | News and tender records | Real projects, no geometry |
| `raw/s8` | 10 evidence records with links | News reports | Real, paraphrased |
| `research/locations.json` | Place lookups made while building infrastructure zones | OpenStreetMap Nominatim, Maha Metro pages | Lookup notes |

OpenStreetMap data is under the ODbL. The PMPML feed and the DataMeet boundaries have their own terms; confirm them before reusing the data.

## The corridor

- Built from the road lines named exactly "Sinhagad Road". OpenStreetMap maps the road as two one-way carriageways; the north-east-bound one is the reference line. The flyover is left out because permits are at ground level.
- Length 3,504 m. Chainage 0 is at Hingne and rises toward Dandekar Bridge.
- Split into 14 segments of about 250 m, each tagged with its ward.
- Chainage is measured in metres along the line. Processing uses turf.js; new permits filed in the app are measured in PostGIS and agree to within 0.2 m.

## What the scripts change

| Script | What it does |
|---|---|
| `build-corridor.ts` | Builds the corridor line and its segments |
| `process-reference.ts` | Facilities, bus data, wards, departments, rules, evidence |
| `process-permits.ts` | Fixes and enriches the permits, creates the restorations |
| `process-infra.ts` | Places the infrastructure projects on the corridor |
| `export-fixtures.ts` | Writes the engine test fixture from the processed data |
| `verify-data.ts` | Runs the 16 checks |

The fixes, in short:

- **Demo dates.** The app runs on a fixed demo date, 15 October 2026. Eleven permits are re-dated so their stories play out around it, and every permit gets a filing date. The values are in `scripts/fixes/pune.ts`.
- **Off-road permits.** Three raw permits have coordinates that are not on Sinhagad Road. Permits 0023 and 0024 are placed beside Karva Hospital, which is on the road, with their lengths, sides and offset kept. Permit 0025 is moved to the nearest stretch.
- **Extra permit fields.** Work type (routine or emergency), whether the work is in the annual programme, chainage, length and a snapped trench line.
- **Restorations.** Three made-up restored stretches (R1, R2, R3) so the road-protection rules have something to act on. R2 is a protected concrete stretch.
- **Infrastructure zones.** Metro Line 4 is placed as a zone of 150 m either side of the Metro's own permit, because station positions are not published. The Rajaram Bridge projects sit at the bridge junction as context only. Two projects are off this corridor and carry no position. All zone positions are approximate.
- **Facilities.** Clinics are separated from hospitals using the original OpenStreetMap tag, and one furniture shop that was tagged as a hospital is reclassified.
- **Rules.** Each rule keeps its source text and gains structured parameters, so thresholds are data and can be edited in the app.
- **Evidence.** Direct quotes are dropped; the app paraphrases and links.

## Files that are not committed

`npm run data` also writes `processed/_checks.json` and `processed/_facility_fixes.json`, a record of the last run. Git ignores them.
