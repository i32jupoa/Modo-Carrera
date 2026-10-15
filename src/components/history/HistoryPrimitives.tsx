import type { ReactNode } from "react";
import { Trophy } from "lucide-react";
import { LEAGUES, teamById, type LeagueId } from "@/data/teams";
import { TeamLogo } from "@/components/TeamLogo";

export function historicalTeam(teamId: string | null | undefined) {
  if (!teamId) return null;
  const team = teamById(teamId);
  if (team.id !== teamId) return { id: teamId, name: teamId, leagueName: "", known: false };
  return {
    id: team.id,
    name: team.name,
    leagueName: LEAGUES[team.league as LeagueId]?.name ?? team.league,
    known: true,
  };
}

export function ClubLabel({ teamId, leagueId, size = 28 }: { teamId: string | null | undefined; leagueId?: string | null; size?: number }) {
  const club = historicalTeam(teamId);
  if (!club) return <span className="text-sm text-muted-foreground">Sin determinar</span>;
  const historicalLeagueName = leagueId ? (LEAGUES[leagueId as LeagueId]?.name ?? leagueId) : club.leagueName;
  return (
    <div className="flex min-w-0 items-center gap-2">
      {club.known ? (
        <TeamLogo teamName={club.name} leagueName={historicalLeagueName} size={size} />
      ) : (
        <span className="grid shrink-0 place-items-center rounded-md border border-border/60 bg-secondary/40 text-[0.55rem] font-black" style={{ width: size, height: size }}>{club.name.slice(0, 3).toUpperCase()}</span>
      )}
      <span className="truncate text-sm font-bold">{club.name}</span>
    </div>
  );
}

export function HistoryPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-border/60 bg-card/70 shadow-sm ${className}`}>{children}</section>;
}

export function HistoryStat({ label, value, icon: Icon = Trophy }: { label: string; value: string | number; icon?: typeof Trophy }) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/50 p-3">
      <div className="flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-wider text-muted-foreground"><Icon className="h-3.5 w-3.5 text-primary" />{label}</div>
      <div className="mt-1 text-2xl font-black tabular-nums">{value}</div>
    </div>
  );
}

export function HistoryEmpty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border/60 bg-background/30 p-8 text-center text-sm text-muted-foreground">{children}</div>;
}

export function formatTransferFee(fee: number, type: string) {
  if (type === "free" || fee <= 0) return "Libre";
  if (fee >= 1_000_000) return `${(fee / 1_000_000).toFixed(1).replace(/\.0$/, "")} M€`;
  if (fee >= 1_000) return `${Math.round(fee / 1_000)} mil €`;
  return `${Math.round(fee)} €`;
}

export function transferTypeLabel(type: string) {
  switch (type) {
    case "loan": return "Cesión";
    case "loan-option": return "Cesión con opción";
    case "loan-obligation": return "Cesión con obligación";
    case "free": return "Agente libre";
    default: return "Traspaso";
  }
}
