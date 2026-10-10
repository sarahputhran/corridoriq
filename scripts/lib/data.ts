// Shared helpers for the data-processing scripts. Raw files are read-only; everything is written to data/processed.
import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, Geometry, LineString, Position } from "geojson";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const RAW = "data/raw";
export const PROCESSED = "data/processed";
export const RESEARCH = "data/research";
export const CORRIDOR_ID = "sinhagad-road";
const M = { units: "meters" } as const;

export function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function readRaw<T = unknown>(file: string): T {
  return readJson<T>(join(RAW, file));
}

export function readProcessed<T = unknown>(file: string): T {
  return readJson<T>(join(PROCESSED, file));
}

export function writeProcessed(file: string, data: unknown): void {
  const path = join(PROCESSED, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  const count = Array.isArray(data)
    ? data.length
    : ((data as FeatureCollection).features?.length ?? 1);
  console.log(`  wrote ${path} (${count})`);
}

export const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;
export const roundCoord = (c: Position): Position => [round(c[0], 7), round(c[1], 7)];

export function featureCollection<G extends Geometry, P>(features: Feature<G, P>[]): FeatureCollection<G, P> {
  return { type: "FeatureCollection", features };
}

/** Minimal RFC 4180 CSV parser (quoted fields, embedded commas and quotes). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

export type CorridorProps = {
  id: string;
  city_id: string;
  road_name: string;
  start_label: string;
  end_label: string;
  length_m: number;
};

/** Chainage helpers bound to the processed corridor centerline. Chainage 0 is the south-west end. */
export function loadCorridor() {
  const fc = readProcessed<FeatureCollection<LineString, CorridorProps>>("corridor.geojson");
  const line = fc.features[0];
  const length = line.properties.length_m;

  const snap = (lng: number, lat: number) => {
    const p = turf.nearestPointOnLine(line, [lng, lat], M);
    return { chainage_m: p.properties.location, offset_m: p.properties.dist };
  };
  const pointAt = (chainage: number): Position =>
    turf.along(line, Math.min(Math.max(chainage, 0), length), M).geometry.coordinates;
  const slice = (from: number, to: number): LineString => {
    const a = Math.max(0, Math.min(from, to));
    const b = Math.min(length, Math.max(from, to));
    const g = turf.lineSliceAlong(line, a, Math.max(b, a + 0.01), M).geometry;
    return { type: "LineString", coordinates: g.coordinates.map(roundCoord) };
  };
  /** A point `offset` metres to the left (+) or right (−) of the direction of increasing chainage. */
  const pointBeside = (chainage: number, offset: number): Position => {
    const here = pointAt(chainage);
    const ahead = pointAt(Math.min(chainage + 5, length));
    const behind = pointAt(Math.max(chainage - 5, 0));
    const bearing = turf.bearing(behind, ahead);
    return roundCoord(turf.destination(here, Math.abs(offset), bearing + (offset >= 0 ? -90 : 90), M).geometry.coordinates);
  };
  return { line, length, props: line.properties, snap, pointAt, slice, pointBeside };
}

export const metres = M;
