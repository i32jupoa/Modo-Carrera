// Shared button / chip styles so every control inside the match screen keeps
// the same height, radius and rhythm.

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap " +
  "transition disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-primary/60";

export const btnPrimary = `${BASE} h-11 px-6 text-sm font-black bg-primary text-primary-foreground glow-neon hover:brightness-110`;

export const btnSecondary = `${BASE} h-11 px-5 text-sm bg-card border border-border hover:border-accent`;

export const btnGhost = `${BASE} h-9 px-4 text-xs bg-transparent border border-border/70 text-muted-foreground hover:text-foreground hover:border-accent`;

export const btnDanger = `${BASE} h-11 px-5 text-sm bg-destructive/15 border border-destructive/50 text-destructive hover:bg-destructive/25`;

export const segmentBase =
  "inline-flex items-center rounded-lg border border-border bg-card p-0.5 gap-0.5";

export const segmentItem = (active: boolean) =>
  `h-8 px-3 rounded-md text-xs font-bold transition ${
    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
  }`;

export const infoChip =
  "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border/70 bg-card/60 text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground";
