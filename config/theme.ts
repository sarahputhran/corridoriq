// Mirrors the CSS variables in app/globals.css for places that need raw values (MapLibre, SVG charts).
export const theme = {
  paper: "#F4F1EA",
  card: "#FFFFFF",
  ink: "#111111",
  accent: "#FFD23F",
  mapLand: "#ECE8DE",
  mapMinor: "#D6D0C2",
  field: "#F4F1EA",
  warnTint: "#FDF1DF",
  status: {
    coord: "#F7C9A0",
    ok: "#B8E6C9",
    blockText: "#8E2A20",
    blockLine: "#C0392B",
    blockTint: "#FBE3E3",
    escalated: "#CDB8F2",
  },
  dept: {
    water: "#A7D8F0",
    sewer: "#C9B29B",
    msedcl: "#F3E3A0",
    jio: "#AFC3F5",
    airtel: "#F5B8CF",
    mngl: "#F7C9A0",
    metro: "#CDB8F2",
  },
  focus: "#2B59FF",
} as const;
