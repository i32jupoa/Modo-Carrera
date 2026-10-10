import type { Fixture } from "@/lib/season";
import { LEAGUES, teamById } from "@/data/teams";
import { TeamLogo } from "@/components/TeamLogo";
import { TeamBadge } from "@/components/TeamBadge";

function roundPrefix(value?: string): string {
  return String(value ?? "Final").replace(/-Leg[12]$/i, "");
}

function fixtureDate(fixture: Fixture): string {
  if (!fixture.date || !/^\d{4}-\d{2}-\d{2}/.test(fixture.date)) return "";
  const date = new Date(`${fixture.date.slice(0, 10)}T12:00:00`);
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" })
    .format(date).replace(/\./g, "").toUpperCase();
}

function teamName(id: string): string {
  try { return teamById(id)?.name ?? id; } catch { return id; }
}

function teamLogo(id: string) {
  try {
    const team = teamById(id);
    return <TeamLogo teamName={team.name} leagueName={LEAGUES[team.league]?.name ?? team.league} size={18} />;
  } catch {
    return <TeamBadge teamId={id} size={18} />;
  }
}

function totalGoals(fixture: Fixture, teamId: string): number {
  const result = fixture.result;
  if (!result) return 0;
  const isHome = fixture.homeId === teamId;
  return Number(isHome ? result.homeGoals : result.awayGoals) +
    Number(isHome ? result.extraTime?.homeGoals ?? 0 : result.extraTime?.awayGoals ?? 0);
}

function matchWinner(fixture: Fixture): string | null {
  if (!fixture.result) return null;
  const home = totalGoals(fixture, fixture.homeId);
  const away = totalGoals(fixture, fixture.awayId);
  if (home !== away) return home > away ? fixture.homeId : fixture.awayId;
  if (fixture.result.penalties) {
    const homePens = Number(fixture.result.penalties.homeGoals ?? 0);
    const awayPens = Number(fixture.result.penalties.awayGoals ?? 0);
    if (homePens === awayPens) return null;
    return homePens > awayPens ? fixture.homeId : fixture.awayId;
  }
  return null;
}

function resultLabel(fixture: Fixture): { score: string; note: string } {
  if (!fixture.result) return { score: "–", note: "Pendiente" };
  const home = totalGoals(fixture, fixture.homeId);
  const away = totalGoals(fixture, fixture.awayId);
  if (fixture.result.penalties) {
    const regularHome = Number(fixture.result.homeGoals ?? 0) + Number(fixture.result.extraTime?.homeGoals ?? 0);
    const regularAway = Number(fixture.result.awayGoals ?? 0) + Number(fixture.result.extraTime?.awayGoals ?? 0);
    return { score: `${regularHome} (${fixture.result.penalties.homeGoals}) – (${fixture.result.penalties.awayGoals}) ${regularAway}`, note: "" };
  }
  return { score: `${home} – ${away}`, note: fixture.result.extraTime ? "Prórroga" : "" };
}

function globalScore(legs: Fixture[], homeId: string, awayId: string) {
  return {
    home: legs.reduce((sum, fixture) => sum + totalGoals(fixture, homeId), 0),
    away: legs.reduce((sum, fixture) => sum + totalGoals(fixture, awayId), 0),
  };
}

function tieWinner(legs: Fixture[], homeId: string, awayId: string): string | null {
  const score = globalScore(legs, homeId, awayId);
  if (score.home !== score.away) return score.home > score.away ? homeId : awayId;
  const secondLeg = legs.find((fixture) => /-Leg2$/i.test(fixture.round ?? ""));
  if (secondLeg?.result?.penalties) {
    const sideHomePens = secondLeg.homeId === homeId
      ? secondLeg.result.penalties.homeGoals : secondLeg.result.penalties.awayGoals;
    const sideAwayPens = secondLeg.homeId === awayId
      ? secondLeg.result.penalties.homeGoals : secondLeg.result.penalties.awayGoals;
    return sideHomePens === sideAwayPens ? null : sideHomePens > sideAwayPens ? homeId : awayId;
  }
  return null;
}

/** Resumen del global y ambos partidos de cada eliminatoria, con desempates visibles. */
export function KnockoutTieList({
  fixtures,
  onOpenFixture,
  competition = "ucl",
}: {
  fixtures: Fixture[];
  onOpenFixture?: (fixture: Fixture) => void;
  competition?: "ucl" | "uel" | "uecl";
}) {
  const palette = competition === "uel"
    ? { border: "border-orange-400/45", header: "bg-orange-950/35", card: "bg-orange-950/10", hover: "hover:bg-orange-900/15", accent: "text-orange-300", score: "bg-orange-950/40" }
    : competition === "uecl"
      ? { border: "border-green-400/45", header: "bg-green-950/35", card: "bg-green-950/10", hover: "hover:bg-green-900/15", accent: "text-green-300", score: "bg-green-950/40" }
      : { border: "border-blue-400/45", header: "bg-blue-950/35", card: "bg-blue-950/10", hover: "hover:bg-blue-900/15", accent: "text-blue-300", score: "bg-blue-950/40" };
  const byTie = new Map<string, Fixture[]>();
  for (const fixture of fixtures) {
    const prefix = roundPrefix(fixture.round);
    const teams = [fixture.homeId, fixture.awayId].sort();
    const key = `${prefix}|${teams.join("|")}`;
    const entries = byTie.get(key) ?? [];
    entries.push(fixture);
    byTie.set(key, entries);
  }
  const ties = [...byTie.entries()].map(([key, legs]) => ({
    key,
    legs: legs.slice().sort((a, b) => {
      const legNumber = (fixture: Fixture) => /-Leg2$/i.test(fixture.round ?? "") ? 2 : /-Leg1$/i.test(fixture.round ?? "") ? 1 : 0;
      return legNumber(a) - legNumber(b) || a.matchday - b.matchday;
    }),
  })).sort((a, b) => (a.legs[0]?.matchday ?? 0) - (b.legs[0]?.matchday ?? 0) || a.key.localeCompare(b.key));

  if (ties.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">Todavía no hay eliminatorias disputadas.</p>;

  return (
    <div className="space-y-2">
      {ties.map(({ key, legs }) => {
        const firstLeg = legs.find((fixture) => /-Leg1$/i.test(fixture.round ?? "")) ?? legs[0];
        const homeId = firstLeg.homeId;
        const awayId = firstLeg.awayId;
        const winner = legs.length > 1 && legs.every((fixture) => !!fixture.result)
          ? tieWinner(legs, homeId, awayId) : legs.length === 1 && legs[0].round === "Final" ? matchWinner(legs[0]) : null;
        const score = globalScore(legs, homeId, awayId);
        const allPlayed = legs.every((fixture) => !!fixture.result);
        const secondLeg = legs.find((fixture) => /-Leg2$/i.test(fixture.round ?? ""));
        const penalty = secondLeg?.result?.penalties;
        const extraTime = !!secondLeg?.result?.extraTime;
        return (
          <section key={key} className={`overflow-hidden rounded-lg border ${palette.border} ${palette.card}`}>
            <div className={`border-b ${palette.border} ${palette.header} px-2.5 py-1.5`}>
              <div className="flex items-center justify-center gap-1.5 text-xs tabular-nums sm:gap-2">
                <span className={`min-w-0 truncate text-right ${winner === homeId ? "font-black text-foreground" : "font-medium text-muted-foreground"}`}>{teamName(homeId)}</span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 font-black shadow-sm ${palette.score}`}>{allPlayed ? (penalty ? `${score.home} (${penalty.homeGoals}) – (${penalty.awayGoals}) ${score.away}` : `${score.home} – ${score.away}`) : "– –"}</span>
                <span className={`min-w-0 truncate ${winner === awayId ? "font-black text-foreground" : "font-medium text-muted-foreground"}`}>{teamName(awayId)}</span>
              </div>
              {winner && <div className={`mt-0.5 text-center text-[0.6rem] font-bold ${palette.accent}`}>Clasifica {teamName(winner)}{penalty ? ` · Pen. ${penalty.homeGoals}-${penalty.awayGoals}` : extraTime ? " · Prórroga" : ""}</div>}
            </div>
            <div className="divide-y divide-border/30">
              {legs.map((fixture) => {
                const result = resultLabel(fixture);
                const gameWinner = matchWinner(fixture);
                const hasWinner = !!fixture.result && !!gameWinner;
                const homeWon = hasWinner && gameWinner === fixture.homeId;
                const awayWon = hasWinner && gameWinner === fixture.awayId;
                return (
                  <button key={fixture.id} type="button" onClick={() => fixture.result && onOpenFixture?.(fixture)} disabled={!fixture.result}
                    className={`block w-full px-2 py-1.5 text-left transition ${fixture.result ? palette.hover : "cursor-default opacity-70"}`}>
                    <div className={`mb-0.5 text-center text-[0.55rem] font-bold uppercase tracking-wide ${palette.accent}`}>{/-Leg1$/i.test(fixture.round ?? "") ? "Ida" : /-Leg2$/i.test(fixture.round ?? "") ? "Vuelta" : ""}</div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 sm:gap-3">
                      <div className="flex min-w-0 items-center justify-end gap-1.5">
                        <span className={`truncate text-right text-xs ${homeWon ? "font-black text-foreground" : "font-medium text-muted-foreground"}`}>{teamName(fixture.homeId)}</span>
                        {teamLogo(fixture.homeId)}
                      </div>
                      <div className="min-w-[62px] text-center">
                        <div className={`font-mono text-xs tabular-nums ${hasWinner ? "font-black" : "font-bold"}`}>{result.score}</div>
                        {result.note && <div className={`mt-0.5 text-[0.52rem] font-bold ${palette.accent}`}>{result.note}</div>}
                      </div>
                      <div className="flex min-w-0 items-center gap-1.5">
                        {teamLogo(fixture.awayId)}
                        <span className={`truncate text-xs ${awayWon ? "font-black text-foreground" : "font-medium text-muted-foreground"}`}>{teamName(fixture.awayId)}</span>
                      </div>
                    </div>
                    {fixtureDate(fixture) && <div className="mt-0.5 text-center text-[0.52rem] font-medium text-muted-foreground">{fixtureDate(fixture)}</div>}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
