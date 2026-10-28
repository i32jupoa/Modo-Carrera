import { Fragment } from "react";
import { TeamBadge } from "@/components/TeamBadge";
import { TeamLogo } from "@/components/TeamLogo";
import { TeamForm } from "@/components/TeamForm";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import { sortUCLTable, type UCLTableEntry } from "@/data/ucl";
import type { SaveGame } from "@/lib/store";
import { getTeamFormsForCompetition } from "@/lib/teamForm";

type EuropeanCompetition = "ucl" | "uel" | "uecl";

type EuropeanStandingsTableProps = {
  table: UCLTableEntry[];
  userTeamId: string;
  save: SaveGame;
  competition: EuropeanCompetition;
};

function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

function PositionCut({ label, tone }: { label: string; tone: "playoff" | "eliminated" }) {
  const styles = tone === "playoff"
    ? { line: "bg-amber-500/40", text: "text-amber-300", surface: "bg-amber-500/[0.06]" }
    : { line: "bg-rose-500/40", text: "text-rose-300", surface: "bg-rose-500/[0.06]" };

  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 ${styles.surface}`}>
      <span className={`h-px flex-1 ${styles.line}`} />
      <span className={`whitespace-nowrap text-[0.58rem] font-black uppercase tracking-wider ${styles.text}`}>
        {label}
      </span>
      <span className={`h-px flex-1 ${styles.line}`} />
    </div>
  );
}

/**
 * Clasificación europea con las mismas proporciones compactas que la tabla de
 * liga nacional. Se conservan los cortes UEFA: octavos directos (1–8),
 * play-offs (9–24) y eliminación (25–36).
 */
export function EuropeanStandingsTable({
  table,
  userTeamId,
  save,
  competition,
}: EuropeanStandingsTableProps) {
  const sorted = sortUCLTable(table);
  const formsByTeam = getTeamFormsForCompetition(save, 5, competition);

  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-gradient-to-b from-card/90 to-background shadow-lg">
      <header className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-4 py-3">
        <h2 className="text-sm font-black uppercase tracking-wider text-foreground">Clasificación</h2>
        <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">Fase de Liga</span>
      </header>

      <div className="overflow-x-auto p-4">
        <div className="min-w-[560px] text-xs">
          <div className="grid grid-cols-[24px_1fr_24px_24px_24px_24px_28px_28px_28px_32px_76px] gap-2 border-b border-border/60 pb-2 text-muted-foreground uppercase tracking-wider">
            <span>#</span>
            <span>Equipo</span>
            <span className="text-center">PJ</span>
            <span className="text-center">V</span>
            <span className="text-center">E</span>
            <span className="text-center">D</span>
            <span className="text-center">GF</span>
            <span className="text-center">GC</span>
            <span className="text-center">DG</span>
            <span className="text-center">Pts</span>
            <span className="text-center">Forma</span>
          </div>

          {sorted.map((entry, index) => {
            const position = index + 1;
            const isUser = entry.teamId === userTeamId;
            const direct = position <= 8;
            const playoff = position > 8 && position <= 24;
            const eliminated = position > 24;
            const zoneBorder = direct
              ? "border-l-emerald-500/80"
              : playoff
                ? "border-l-amber-500/80"
                : "border-l-rose-500/80";
            const positionTone = direct
              ? "bg-emerald-500/15 text-emerald-300"
              : playoff
                ? "bg-amber-500/15 text-amber-300"
                : "bg-rose-500/15 text-rose-300";
            let team: ReturnType<typeof teamById> | null = null;
            try {
              team = teamById(entry.teamId, { teamLeagueOverrides: save.teamLeagueOverrides ?? {} });
            } catch {
              team = null;
            }

            return (
              <Fragment key={entry.teamId}>
                {position === 9 && (
                  <PositionCut label="Acceso a play-offs · posiciones 9–24" tone="playoff" />
                )}
                {position === 25 && (
                  <PositionCut label="Eliminados · posiciones 25–36" tone="eliminated" />
                )}
                <div
                  title={direct ? "Acceso directo a octavos" : playoff ? "Acceso a play-offs" : "Eliminado"}
                  className={`grid grid-cols-[24px_1fr_24px_24px_24px_24px_28px_28px_28px_32px_76px] items-center gap-2 border-b border-border/30 border-l-2 py-1.5 pl-2 last:border-0 ${zoneBorder} ${isUser ? "bg-primary/10 font-bold text-primary" : index % 2 === 1 ? "bg-secondary/[0.045]" : ""}`}
                >
                  <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-0.5 tabular-nums ${positionTone}`}>
                    {position}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    {team ? (
                      <TeamLogo teamName={team.name} leagueName={getLeagueName(team.league)} size={18} />
                    ) : (
                      <TeamBadge teamId={entry.teamId} size={18} />
                    )}
                    <span className={`truncate ${isUser ? "text-primary" : "font-semibold"}`}>
                      {team?.name ?? entry.teamId}
                    </span>
                  </span>
                  <span className="scoreline text-center text-muted-foreground">{entry.played}</span>
                  <span className="scoreline text-center text-primary">{entry.won}</span>
                  <span className="scoreline text-center text-muted-foreground">{entry.drawn}</span>
                  <span className="scoreline text-center text-destructive">{entry.lost}</span>
                  <span className="scoreline text-center">{entry.gf}</span>
                  <span className="scoreline text-center">{entry.ga}</span>
                  <span className="scoreline text-center">{entry.gd > 0 ? `+${entry.gd}` : entry.gd}</span>
                  <span className="scoreline text-center font-bold">{entry.points}</span>
                  <TeamForm results={formsByTeam.get(entry.teamId) ?? []} className="translate-y-0" />
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>

      <footer className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border/40 px-4 py-2.5 text-[0.6rem] uppercase tracking-wider text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-emerald-500/80" />Octavos directos · 1–8
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-amber-500/80" />Play-offs · 9–24
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-rose-500/80" />Eliminados · 25–36
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-primary" />Tu equipo
        </span>
      </footer>
    </section>
  );
}
