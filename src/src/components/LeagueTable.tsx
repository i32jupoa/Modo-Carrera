import { useMemo } from "react";
import { usePlayersStore } from "@/store/playersStore";
import { teamById, teamsByLeague, type LeagueId } from "@/data/teams";
import { computeLeagueStandings } from "@/lib/standings";
import { TeamBadge } from "@/components/TeamBadge";

type LeagueTableProps = {
  league?: LeagueId;
  className?: string;
};

const COLS = [
  { key: "pos", label: "#", w: "w-10" },
  { key: "team", label: "Equipo", w: "min-w-[10rem] flex-1" },
  { key: "pj", label: "PJ", w: "w-9" },
  { key: "v", label: "V", w: "w-9" },
  { key: "e", label: "E", w: "w-9" },
  { key: "d", label: "D", w: "w-9" },
  { key: "gf", label: "GF", w: "w-9" },
  { key: "gc", label: "GC", w: "w-9" },
  { key: "dg", label: "DG", w: "w-10" },
  { key: "pts", label: "PTS", w: "w-11" },
] as const;

export function LeagueTable({ league, className = "" }: LeagueTableProps) {
  const fixtures = usePlayersStore((s) => s.fixtures);
  const myTeamId = usePlayersStore((s) => s.myTeamId);

  const resolvedLeague: LeagueId = useMemo(() => {
    if (league) return league;
    if (myTeamId) return teamById(myTeamId).league;
    return "laliga";
  }, [league, myTeamId]);

  const teamIds = useMemo(
    () => teamsByLeague(resolvedLeague).map((t) => t.id),
    [resolvedLeague],
  );

  const rows = useMemo(
    () => computeLeagueStandings(fixtures, teamIds),
    [fixtures, teamIds],
  );

  return (
    <section
      className={`overflow-hidden rounded-xl border border-border/80 bg-gradient-to-b from-card/90 to-background shadow-lg ${className}`}
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/20">
        <h2 className="text-sm font-black uppercase tracking-wider text-foreground">
          Clasificación
        </h2>
        <span className="text-[0.65rem] text-muted-foreground uppercase tracking-widest">
          Temporada 25/26
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/30 text-muted-foreground uppercase tracking-wider">
              {COLS.map((c) => (
                <th
                  key={c.key}
                  className={`${c.w} py-2.5 px-1 font-bold text-center first:text-left first:pl-4 ${
                    c.key === "team" ? "text-left" : ""
                  } ${c.key === "pts" ? "text-primary" : ""}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const team = teamById(row.teamId);
              const isMe = row.teamId === myTeamId;
              const pos = i + 1;
              const ucl = pos <= 4;
              const rel = pos >= rows.length - 2;

              return (
                <tr
                  key={row.teamId}
                  className={[
                    "border-t border-border/40 transition-colors",
                    isMe
                      ? "bg-primary/15 hover:bg-primary/20"
                      : i % 2 === 0
                        ? "bg-background/40 hover:bg-muted/20"
                        : "bg-muted/5 hover:bg-muted/15",
                  ].join(" ")}
                >
                  <td className="py-2.5 pl-4 pr-1 font-bold tabular-nums">
                    <span
                      className={[
                        "inline-flex h-6 w-6 items-center justify-center rounded text-[0.65rem]",
                        ucl ? "bg-emerald-500/20 text-emerald-400" : "",
                        rel ? "bg-destructive/20 text-destructive" : "",
                        !ucl && !rel ? "text-muted-foreground" : "",
                      ].join(" ")}
                    >
                      {pos}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <TeamBadge team={team} size={26} />
                      <span
                        className={`font-semibold truncate ${isMe ? "text-primary" : ""}`}
                      >
                        {team.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 text-center tabular-nums text-muted-foreground">
                    {row.played}
                  </td>
                  <td className="py-2 text-center tabular-nums">{row.won}</td>
                  <td className="py-2 text-center tabular-nums">{row.drawn}</td>
                  <td className="py-2 text-center tabular-nums">{row.lost}</td>
                  <td className="py-2 text-center tabular-nums">{row.gf}</td>
                  <td className="py-2 text-center tabular-nums">{row.ga}</td>
                  <td
                    className={`py-2 text-center tabular-nums font-semibold ${
                      row.gd > 0
                        ? "text-emerald-400"
                        : row.gd < 0
                          ? "text-destructive"
                          : ""
                    }`}
                  >
                    {row.gd > 0 ? `+${row.gd}` : row.gd}
                  </td>
                  <td className="py-2 pr-3 text-center tabular-nums font-black text-primary text-sm">
                    {row.points}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap gap-4 px-4 py-2.5 border-t border-border/40 text-[0.6rem] uppercase tracking-wider text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500/80" />
          Champions
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-destructive/80" />
          Descenso
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary" />
          Tu equipo
        </span>
      </footer>
    </section>
  );
}
