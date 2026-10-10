"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { theme } from "@/config/theme";

const axis = { stroke: theme.ink, fontSize: 12, fontFamily: "var(--font-space-grotesk), sans-serif" };
const tooltip = {
  contentStyle: { border: `2.5px solid ${theme.ink}`, borderRadius: 0, background: "#fff", boxShadow: `3px 3px 0 ${theme.ink}`, fontSize: 13 },
  cursor: { fill: theme.paper },
};

/** Permits evaluated per ward, split into those that went into a coordination case and those that did not. */
export function WardChart({ data }: { data: { ward: string; coordinated: number; other: number }[] }) {
  return (
    <div className="h-[260px]" role="img" aria-label={`Bar chart of permits per ward: ${data.map((d) => `${d.ward}, ${d.coordinated} coordinated of ${d.coordinated + d.other}`).join("; ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={theme.ink} strokeOpacity={0.12} vertical={false} />
          <XAxis dataKey="ward" tick={axis} tickLine={false} axisLine={{ stroke: theme.ink, strokeWidth: 2 }} interval={0} />
          <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={{ stroke: theme.ink, strokeWidth: 2 }} />
          <Tooltip {...tooltip} />
          <Legend wrapperStyle={{ fontSize: 13 }} formatter={(value) => <span style={{ color: theme.ink }}>{value}</span>} />
          <Bar dataKey="coordinated" name="Went into a coordination case" stackId="a" fill={theme.accent} stroke={theme.ink} strokeWidth={2} isAnimationActive={false} />
          <Bar dataKey="other" name="Settled without a case" stackId="a" fill="#fff" stroke={theme.ink} strokeWidth={2} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** How often each rule fired across all evaluations. */
export function RuleActivityChart({ data }: { data: { rule_id: string; hits: number }[] }) {
  return (
    <div style={{ height: Math.max(180, data.length * 30 + 30) }} role="img" aria-label={`Bar chart of rule hits: ${data.map((d) => `${d.rule_id} ${d.hits}`).join("; ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={theme.ink} strokeOpacity={0.12} horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={axis} tickLine={false} axisLine={{ stroke: theme.ink, strokeWidth: 2 }} />
          <YAxis type="category" dataKey="rule_id" width={250} tick={{ ...axis, fontSize: 11, fontFamily: "var(--font-jetbrains-mono), monospace" }} tickLine={false} axisLine={{ stroke: theme.ink, strokeWidth: 2 }} interval={0} />
          <Tooltip {...tooltip} />
          <Bar dataKey="hits" name="Times fired" fill={theme.status.coord} stroke={theme.ink} strokeWidth={2} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
