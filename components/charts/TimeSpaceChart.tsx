"use client";

import { scaleLinear, scaleTime } from "d3-scale";
import Link from "next/link";
import { useId, useState } from "react";
import { theme } from "@/config/theme";
import { STATUS_LABEL, fmtMetres, fmtRange } from "@/lib/format";

export interface ChartPermit {
  permit_id: string;
  department: string;
  short: string;
  color: string;
  purpose: string;
  status: string;
  road_side: string;
  start: string;
  end: string;
  chainage_start_m: number;
  chainage_end_m: number;
  case_ref: string | null;
}

export interface ChartBand {
  id: string;
  label: string;
  sublabel: string;
  kind: "restored" | "protected" | "infra" | "context";
  chainage_start_m: number;
  chainage_end_m: number;
  /** ISO dates; null means open-ended in that direction. */
  from: string | null;
  to: string | null;
}

export interface ChartCluster {
  letter: string;
  case_ref: string;
  permit_ids: string[];
}

interface Props {
  corridor: { road_name: string; start_label: string; end_label: string; length_m: number };
  /** First day shown (top) and last day shown (bottom), ISO. */
  from: string;
  to: string;
  today: string;
  permits: ChartPermit[];
  bands: ChartBand[];
  /** Monsoon windows inside the range, with the rule that blocks routine work in them. */
  monsoon: { from: string; to: string; label: string }[];
  clusters: ChartCluster[];
}

const W = 820;
const H = 560;
const PLOT = { left: 70, right: 800, top: 40, bottom: 520 };
const INK = theme.ink;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const BLOCKED = new Set(["blocked", "rejected"]);

export function TimeSpaceChart({ corridor, from, to, today, permits, bands, monsoon, clusters }: Props) {
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<ChartPermit | null>(null);
  const [selected, setSelected] = useState<ChartPermit | null>(null);

  const x = scaleLinear().domain([0, corridor.length_m]).range([PLOT.left, PLOT.right]);
  const y = scaleTime().domain([day(from), day(to)]).range([PLOT.top, PLOT.bottom]);
  const clampY = (iso: string | null, fallback: number) => (iso ? Math.min(PLOT.bottom, Math.max(PLOT.top, y(day(iso)))) : fallback);
  const inRange = (start: string, end: string) => start <= to && end >= from;

  // Month grid: one line per month start; the year is shown on the first row and each January.
  const months: { iso: string; label: string; bold: boolean }[] = [];
  for (let d = new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, 1)); d <= day(to); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    const iso = d.toISOString().slice(0, 10);
    const jan = d.getUTCMonth() === 0;
    months.push({ iso, label: jan || months.length === 0 ? `${MONTH.format(d)} ’${String(d.getUTCFullYear()).slice(2)}` : MONTH.format(d), bold: jan });
  }
  const labelEvery = Math.ceil(months.length / 14);
  const kms = Array.from({ length: Math.floor(corridor.length_m / 1000) + 1 }, (_, i) => i);

  const visible = permits.filter((p) => inRange(p.start, p.end));
  const box = (p: ChartPermit) => {
    const x0 = x(p.chainage_start_m);
    const y0 = clampY(p.start, PLOT.top);
    // An end date is inclusive: the work occupies the whole last day.
    const y1 = Math.min(PLOT.bottom, y(new Date(day(p.end).getTime() + 86_400_000)));
    return { x: x0, y: y0, w: Math.max(7, x(p.chainage_end_m) - x0), h: Math.max(7, y1 - y0) };
  };
  const todayY = today >= from && today <= to ? y(day(today)) : null;
  const active = hover ?? selected;

  return (
    <div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Time-space chart: distance along ${corridor.road_name} across, months down, permits as rectangles`} className="block h-auto w-full min-w-[640px]" style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}>
          <defs>
            <pattern id={`${uid}-hatch`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="8" height="8" fill={theme.paper} />
              <line x1="0" y1="0" x2="0" y2="8" stroke={INK} strokeWidth="1.2" strokeOpacity="0.22" />
            </pattern>
            <pattern id={`${uid}-hatch-dark`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="8" height="8" fill="#E5E0D4" />
              <line x1="0" y1="0" x2="0" y2="8" stroke={INK} strokeWidth="1.6" strokeOpacity="0.4" />
            </pattern>
            <pattern id={`${uid}-monsoon`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
              <rect width="10" height="10" fill={theme.status.blockTint} />
              <line x1="0" y1="0" x2="0" y2="10" stroke={theme.status.blockLine} strokeWidth="1.2" strokeOpacity="0.35" />
            </pattern>
          </defs>

          <rect x={PLOT.left} y={PLOT.top} width={PLOT.right - PLOT.left} height={PLOT.bottom - PLOT.top} fill="#fff" stroke={INK} strokeWidth="2" />

          {monsoon.map((m) => {
            const y0 = clampY(m.from, PLOT.top);
            const y1 = clampY(m.to, PLOT.bottom);
            return (
              <g key={m.from}>
                <rect x={PLOT.left} y={y0} width={PLOT.right - PLOT.left} height={Math.max(0, y1 - y0)} fill={`url(#${uid}-monsoon)`} />
              </g>
            );
          })}

          {bands.map((b) => {
            const y0 = clampY(b.from, PLOT.top);
            const y1 = clampY(b.to, PLOT.bottom);
            if (y1 - y0 < 2 || (b.to && b.to < from) || (b.from && b.from > to)) return null;
            const x0 = x(b.chainage_start_m);
            const w = Math.max(6, x(b.chainage_end_m) - x0);
            const infra = b.kind === "infra" || b.kind === "context";
            return (
              <g key={b.id}>
                <rect
                  x={x0}
                  y={y0}
                  width={w}
                  height={y1 - y0}
                  fill={infra ? theme.dept.metro : `url(#${uid}-${b.kind === "protected" ? "hatch-dark" : "hatch"})`}
                  fillOpacity={b.kind === "infra" ? 0.35 : b.kind === "context" ? 0.16 : 1}
                  stroke={infra ? INK : "none"}
                  strokeWidth="1.2"
                  strokeDasharray={infra ? "5 4" : undefined}
                />
                {/* Labels run up the band from its lower end, so neighbouring bands never write over each other. */}
                {w > 16 && y1 - y0 > (b.label.length + b.sublabel.length) * 5.4 + 30 && (
                  <text transform={`rotate(-90 ${x0 + 12} ${y1 - 8})`} x={x0 + 12} y={y1 - 8} fontSize="10" fill={INK} pointerEvents="none">
                    <tspan fontWeight="600">{b.label}</tspan>
                    <tspan dx="8" fontSize="9">
                      {b.sublabel}
                    </tspan>
                  </text>
                )}
              </g>
            );
          })}

          {monsoon.map((m) => {
            const y0 = clampY(m.from, PLOT.top);
            const y1 = clampY(m.to, PLOT.bottom);
            if (y1 - y0 <= 22) return null;
            // Drawn after the vertical bands, on its own strip, so no band can cover the rule label.
            return (
              <g key={`label-${m.from}`} pointerEvents="none">
                <rect x={PLOT.left + 4} y={y0 + 4} width={m.label.length * 5.9 + 12} height="17" fill={theme.status.blockTint} stroke={theme.status.blockLine} strokeWidth="1" />
                <text x={PLOT.left + 10} y={y0 + 16} fontSize="11" fontWeight="600" fill={theme.status.blockText}>
                  {m.label}
                </text>
              </g>
            );
          })}

          <g stroke={INK} strokeOpacity="0.12" strokeWidth="1">
            {months.slice(1).map((m) => (
              <line key={m.iso} x1={PLOT.left} x2={PLOT.right} y1={y(day(m.iso))} y2={y(day(m.iso))} />
            ))}
            {kms.slice(1).map((km) => (
              <line key={km} x1={x(km * 1000)} x2={x(km * 1000)} y1={PLOT.top} y2={PLOT.bottom} />
            ))}
          </g>
          <g fontSize="11" fill={INK} textAnchor="end">
            {months.map((m, i) =>
              i % labelEvery === 0 && y(day(m.iso)) + 24 <= PLOT.bottom + 6 ? (
                <text key={m.iso} x={PLOT.left - 8} y={Math.max(PLOT.top, y(day(m.iso))) + 22} fontWeight={m.bold ? 700 : 400}>
                  {m.label}
                </text>
              ) : null,
            )}
          </g>
          <g fontSize="11" fill={INK} textAnchor="middle">
            {kms.map((km) => (
              <text key={km} x={x(km * 1000)} y={PLOT.top - 10}>
                {km === 0 ? "0" : `${km} km`}
              </text>
            ))}
          </g>
          <text x={PLOT.left} y={PLOT.bottom + 22} fontSize="12" fontWeight="700" fill={INK}>
            {corridor.start_label}
          </text>
          <text x={PLOT.right} y={PLOT.bottom + 22} textAnchor="end" fontSize="12" fontWeight="700" fill={INK}>
            {corridor.end_label}
          </text>

          {clusters.map((c) => {
            const boxes = visible.filter((p) => c.permit_ids.includes(p.permit_id) && p.status !== "completed").map(box);
            if (!boxes.length) return null;
            const x0 = Math.min(...boxes.map((b) => b.x)) - 8;
            const y0 = Math.max(PLOT.top + 3, Math.min(...boxes.map((b) => b.y)) - 8);
            const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + 8;
            const y1 = Math.min(PLOT.bottom - 3, Math.max(...boxes.map((b) => b.y + b.h)) + 8);
            return (
              <g key={c.case_ref}>
                <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="none" stroke={INK} strokeWidth="6" />
                <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="none" stroke={theme.accent} strokeWidth="3" />
              </g>
            );
          })}

          {visible.map((p) => {
            const b = box(p);
            const blocked = BLOCKED.has(p.status);
            const done = p.status === "completed";
            const label = b.w >= 30 && b.h >= 14 ? p.permit_id.slice(-4) : null;
            return (
              <g
                key={p.permit_id}
                tabIndex={0}
                role="button"
                aria-label={`${p.permit_id}, ${p.department}, ${fmtRange(p.start, p.end)}, chainage ${fmtMetres(p.chainage_start_m)} to ${fmtMetres(p.chainage_end_m)} metres, ${STATUS_LABEL[p.status] ?? p.status}`}
                onMouseEnter={() => setHover(p)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(p)}
                onBlur={() => setHover(null)}
                onClick={() => setSelected(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(p);
                  }
                }}
                className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-[#2B59FF] [&:focus-visible>rect]:[stroke-width:4]"
              >
                <rect
                  x={b.x}
                  y={b.y}
                  width={b.w}
                  height={b.h}
                  fill={blocked ? "#fff" : p.color}
                  fillOpacity={done ? 0.55 : 1}
                  stroke={blocked ? theme.status.blockLine : INK}
                  strokeWidth={blocked ? 2.5 : 2}
                  strokeDasharray={blocked ? "4 3" : done ? "2 2" : undefined}
                />
                {label && (
                  <text x={b.x + b.w / 2} y={b.y + Math.min(b.h / 2 + 4, 16)} textAnchor="middle" fontSize="10" fontWeight="600" fill={blocked ? theme.status.blockText : INK} style={{ fontFamily: "var(--font-jetbrains-mono), monospace" }} pointerEvents="none">
                    {label}
                  </text>
                )}
                {blocked && (
                  <text x={b.x + b.w + 6} y={b.y + 11} fontSize="10" fontWeight="700" fill={theme.status.blockText} pointerEvents="none">
                    Blocked
                  </text>
                )}
              </g>
            );
          })}

          {clusters.map((c) => {
            const boxes = visible.filter((p) => c.permit_ids.includes(p.permit_id) && p.status !== "completed").map(box);
            if (!boxes.length) return null;
            const x1 = Math.min(PLOT.right - 22, Math.max(...boxes.map((b) => b.x + b.w)) + 12);
            const y0 = Math.max(PLOT.top + 3, Math.min(...boxes.map((b) => b.y)) - 8);
            return (
              <g key={c.case_ref} pointerEvents="none">
                <rect x={x1} y={y0} width="20" height="18" fill={INK} />
                <text x={x1 + 10} y={y0 + 13} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
                  {c.letter}
                </text>
              </g>
            );
          })}

          {todayY !== null && (
            <g pointerEvents="none">
              <line x1={PLOT.left} x2={PLOT.right} y1={todayY} y2={todayY} stroke={INK} strokeWidth="1.5" strokeDasharray="6 4" />
              <rect x={PLOT.left + 2} y={todayY - 14} width="40" height="13" fill="#fff" />
              <text x={PLOT.left + 5} y={todayY - 4} fontSize="10" fontWeight="700" fill={INK}>
                Today
              </text>
            </g>
          )}
        </svg>
      </div>

      <div className="mt-3 min-h-[76px] border-2 border-ink bg-paper p-3 text-[13px]" aria-live="polite">
        {active ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p>
                <span className="font-mono font-semibold">{active.permit_id}</span> · <b>{active.department}</b> · {STATUS_LABEL[active.status] ?? active.status}
              </p>
              <p className="mt-0.5">{active.purpose}</p>
              <p className="mt-0.5 font-mono text-xs">
                {fmtRange(active.start, active.end)} · chainage {fmtMetres(active.chainage_start_m)}–{fmtMetres(active.chainage_end_m)} m · {active.road_side} side
              </p>
            </div>
            <div className="flex flex-none items-center gap-2">
              {selected && active === selected && selected.case_ref && (
                <Link href={`/cases/${selected.case_ref}`} className="btn !min-h-[36px] !px-3 !py-1.5 !text-[13px]">
                  Open case {selected.case_ref}
                </Link>
              )}
              {selected && (
                <button type="button" onClick={() => setSelected(null)} className="min-h-[36px] border-2 border-ink bg-card px-2.5 text-xs font-semibold">
                  Clear
                </button>
              )}
            </div>
          </div>
        ) : (
          <p>Hover or tab to a rectangle to see the permit. Click it to keep the details and open its case.</p>
        )}
      </div>
    </div>
  );
}
