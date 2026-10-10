/** Resolve distinct, readable colors for the two sides of a match. */
type ColorTeam = { color?: string; secondaryColor?: string } | null | undefined;

function normalizeHex(value?: string): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw.split("").map((c) => c + c).join("")}`.toUpperCase();
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`.toUpperCase();
  return null;
}

function rgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

/** Euclidean RGB distance (0–441); enough here to avoid visually identical bars. */
export function matchColorDistance(first?: string, second?: string): number {
  const aHex = normalizeHex(first);
  const bHex = normalizeHex(second);
  if (!aHex || !bHex) return 441;
  const a = rgb(aHex);
  const b = rgb(bHex);
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

const CONTRAST_PALETTE = [
  "#2563EB", "#D97706", "#0F766E", "#7C3AED", "#DB2777", "#15803D", "#111827", "#0891B2", "#B91C1C", "#A16207",
];

export function resolveMatchTeamColors(homeTeam: ColorTeam, awayTeam: ColorTeam): { homeColor: string; awayColor: string } {
  const homeColor = normalizeHex(homeTeam?.color) ?? "#2563EB";
  const awayPrimary = normalizeHex(awayTeam?.color) ?? "#D97706";
  if (matchColorDistance(homeColor, awayPrimary) >= 95) {
    return { homeColor, awayColor: awayPrimary };
  }

  const secondary = normalizeHex(awayTeam?.secondaryColor);
  if (secondary && matchColorDistance(homeColor, secondary) >= 95) {
    return { homeColor, awayColor: secondary };
  }

  const candidates = CONTRAST_PALETTE.filter((color) => color !== homeColor && color !== awayPrimary);
  const awayColor = candidates.sort((a, b) => {
    const scoreA = Math.min(matchColorDistance(homeColor, a), matchColorDistance(awayPrimary, a));
    const scoreB = Math.min(matchColorDistance(homeColor, b), matchColorDistance(awayPrimary, b));
    return scoreB - scoreA;
  })[0] ?? "#111827";
  return { homeColor, awayColor };
}
