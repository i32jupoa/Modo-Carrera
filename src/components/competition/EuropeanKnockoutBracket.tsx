import { useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TeamBadge } from "@/components/TeamBadge";
import { TeamLogo } from "@/components/TeamLogo";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import type { UCLBracketSlot } from "@/data/ucl";
import type { Fixture } from "@/lib/season";
import { orderPlayoffByR16, orderTieBySecondLegHome, splitUclBracketSides } from "@/lib/uclBracketLayout";

type CompetitionKey = "uel" | "uecl";
type BracketRound = "playoff" | "r16" | "qf" | "sf" | "final";
type BracketMatchup = {
  id: string;
  round: BracketRound;
  homeTeam: string | null;
  awayTeam: string | null;
  winner: string | null;
};
type BracketState = {
  playoff: BracketMatchup[];
  r16: BracketMatchup[];
  qf: BracketMatchup[];
  sf: BracketMatchup[];
  final: BracketMatchup;
};
type TieFixtures = { single: Fixture | null; leg1: Fixture | null; leg2: Fixture | null };
type TieResult = {
  homeGoals: number;
  awayGoals: number;
  winner: string | null;
  complete: boolean;
  lastLeg: Fixture | null;
};

const ROUND_PREFIX: Record<Exclude<BracketRound, "final">, string> = {
  playoff: "Playoff",
  r16: "R16",
  qf: "QF",
  sf: "SF",
};

function teamName(teamId: string): string {
  try {
    return teamById(teamId).name;
  } catch {
    return teamId;
  }
}

function leagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

function safeTeamName(teamId: string | null): string {
  if (!teamId || teamId.startsWith("winner-") || teamId.startsWith("PO-WINNER-")) return "Por definir";
  return teamName(teamId);
}

function numericId(id: string): number {
  const match = id.match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function toMatchup(slot: Partial<UCLBracketSlot> | undefined, id: string, round: BracketRound): BracketMatchup {
  return {
    id: typeof slot?.id === "string" && slot.id ? slot.id : id,
    round,
    homeTeam: typeof slot?.homeId === "string" && slot.homeId ? slot.homeId : null,
    awayTeam: typeof slot?.awayId === "string" && slot.awayId ? slot.awayId : null,
    winner: null,
  };
}

function buildBracketState(slots: UCLBracketSlot[]): BracketState {
  const raw = Array.isArray(slots) ? slots : [];
  const collect = (round: BracketRound, count: number): BracketMatchup[] => {
    const selected = raw
      .filter((slot) => slot && slot.round === round)
      .sort((a, b) => numericId(String(a.id ?? "")) - numericId(String(b.id ?? "")))
      .slice(0, count)
      .map((slot, index) => toMatchup(slot, `${round.toUpperCase()}-${index + 1}`, round));
    while (selected.length < count) {
      selected.push(toMatchup(undefined, `${round.toUpperCase()}-${selected.length + 1}`, round));
    }
    return selected;
  };

  const finalSlot = raw.find((slot) => slot?.round === "final");
  return {
    playoff: collect("playoff", 8),
    r16: collect("r16", 8),
    qf: collect("qf", 4),
    sf: collect("sf", 2),
    final: toMatchup(finalSlot, "F", "final"),
  };
}

function isFixture(value: unknown): value is Fixture {
  if (!value || typeof value !== "object") return false;
  const fixture = value as Partial<Fixture>;
  return typeof fixture.homeId === "string" && typeof fixture.awayId === "string" && typeof fixture.round === "string";
}

function getTieFixtures(matchup: BracketMatchup, fixtures: Fixture[]): TieFixtures {
  const safeFixtures = Array.isArray(fixtures) ? fixtures.filter(isFixture) : [];
  if (matchup.round === "final") {
    return { single: safeFixtures.find((fixture) => fixture.round === "Final") ?? null, leg1: null, leg2: null };
  }
  if (!matchup.homeTeam || !matchup.awayTeam) return { single: null, leg1: null, leg2: null };

  const prefix = ROUND_PREFIX[matchup.round];
  const teams = [matchup.homeTeam, matchup.awayTeam].sort().join("|");
  const matches = safeFixtures.filter((fixture) =>
    fixture.round?.startsWith(prefix)
    && (fixture.matchday == null || fixture.matchday > 0)
    && [fixture.homeId, fixture.awayId].sort().join("|") === teams,
  );
  return {
    single: null,
    leg1: matches.find((fixture) => /-Leg1$/i.test(fixture.round ?? "")) ?? null,
    leg2: matches.find((fixture) => /-Leg2$/i.test(fixture.round ?? "")) ?? null,
  };
}

function goalsForTeam(fixture: Fixture | null, teamId: string): number {
  if (!fixture?.result) return 0;
  const isHome = fixture.homeId === teamId;
  const regular = isHome ? fixture.result.homeGoals : fixture.result.awayGoals;
  const extra = isHome ? fixture.result.extraTime?.homeGoals : fixture.result.extraTime?.awayGoals;
  return Number(regular ?? 0) + Number(extra ?? 0);
}

function getTieResult(matchup: BracketMatchup, fixtures: Fixture[]): TieResult | null {
  const safeFixtures = Array.isArray(fixtures) ? fixtures.filter(isFixture) : [];
  if (matchup.round === "final") {
    const final = safeFixtures.find((fixture) => fixture.round === "Final");
    if (!final?.result) return null;
    const homeGoals = goalsForTeam(final, final.homeId);
    const awayGoals = goalsForTeam(final, final.awayId);
    const winner = final.result.penalties
      ? final.result.penalties.homeGoals > final.result.penalties.awayGoals ? final.homeId : final.awayId
      : homeGoals > awayGoals ? final.homeId : awayGoals > homeGoals ? final.awayId : null;
    return { homeGoals, awayGoals, winner, complete: Boolean(winner), lastLeg: final };
  }

  const tie = getTieFixtures(matchup, safeFixtures);
  const { leg1, leg2 } = tie;
  const displayHome = leg2?.homeId ?? (matchup.round === "qf" || matchup.round === "sf" ? matchup.awayTeam : matchup.homeTeam);
  const displayAway = leg2?.awayId ?? (matchup.round === "qf" || matchup.round === "sf" ? matchup.homeTeam : matchup.awayTeam);
  if (!displayHome || !displayAway || (!leg1?.result && !leg2?.result)) return null;

  // While only the first leg is played, show that score under the eventual
  // second-leg home/away order. Once both legs are played, show aggregate goals.
  const homeGoals = leg1?.result && leg2?.result
    ? goalsForTeam(leg1, displayHome) + goalsForTeam(leg2, displayHome)
    : leg1?.result
      ? goalsForTeam(leg1, displayHome)
      : goalsForTeam(leg2, displayHome);
  const awayGoals = leg1?.result && leg2?.result
    ? goalsForTeam(leg1, displayAway) + goalsForTeam(leg2, displayAway)
    : leg1?.result
      ? goalsForTeam(leg1, displayAway)
      : goalsForTeam(leg2, displayAway);

  const penalties = leg2?.result?.penalties;
  const complete = Boolean(leg1?.result && leg2?.result && (homeGoals !== awayGoals || penalties));
  const winner = !complete
    ? null
    : penalties
      ? penalties.homeGoals > penalties.awayGoals ? leg2!.homeId : leg2!.awayId
      : homeGoals > awayGoals ? displayHome : awayGoals > homeGoals ? displayAway : null;

  return { homeGoals, awayGoals, winner, complete, lastLeg: leg2?.result ? leg2 : leg1?.result ? leg1 : null };
}

function teamCrest(teamId: string, size: number) {
  try {
    const team = teamById(teamId);
    return <TeamLogo teamName={team.name} leagueName={leagueName(team.league)} size={size} />;
  } catch {
    return <TeamBadge teamId={teamId} size={size} />;
  }
}

function formatFixtureDate(date?: string): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Fecha por confirmar";
  return new Date(`${date}T12:00:00`).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function displayTeams(matchup: BracketMatchup, fixtures: Fixture[]) {
  if (matchup.round === "final") {
    const final = fixtures.find((fixture) => fixture.round === "Final");
    return {
      top: final?.homeId ?? matchup.homeTeam,
      bottom: final?.awayId ?? matchup.awayTeam,
    };
  }
  const tie = getTieFixtures(matchup, fixtures);
  // The generated bracket stores the second-leg home club in `homeId` for
  // play-off/R16 slots and in `awayId` for QF/SF slots. Actual Leg 2 fixtures
  // take precedence over this fallback convention.
  return orderTieBySecondLegHome(
    matchup.homeTeam,
    matchup.awayTeam,
    tie.leg2,
    matchup.round === "playoff" || matchup.round === "r16",
  );
}

function MatchCard({
  matchup,
  fixtures,
  onOpen,
}: {
  matchup: BracketMatchup;
  fixtures: Fixture[];
  onOpen: (matchup: BracketMatchup) => void;
}) {
  const teams = displayTeams(matchup, fixtures);
  const result = getTieResult(matchup, fixtures);
  const tie = getTieFixtures(matchup, fixtures);
  // A two-legged tie can always open its leg selector once both clubs are
  // known. The individual leg buttons inside the dialog enforce played-only
  // navigation. A single-match final remains disabled until it has a result.
  const canOpen = matchup.round === "final"
    ? Boolean(tie.single?.result)
    : Boolean(matchup.homeTeam && matchup.awayTeam);
  const topWinner = Boolean(result?.complete && result.winner === teams.top);
  const bottomWinner = Boolean(result?.complete && result.winner === teams.bottom);

  const renderTeam = (teamId: string | null, isWinner: boolean, score: number | null) => (
    <div className={`europe-bracket-team ${isWinner ? "is-winner" : ""}`}>
      <span className="europe-bracket-logo">
        {teamId && !teamId.startsWith("winner-") && !teamId.startsWith("PO-WINNER-")
          ? teamCrest(teamId, 18)
          : <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-muted/50 text-[9px] font-bold text-muted-foreground">?</span>}
      </span>
      <span className={`min-w-0 flex-1 truncate text-[11px] ${isWinner ? "font-extrabold" : "font-semibold"}`}>
        {safeTeamName(teamId)}
      </span>
      <span className={`europe-bracket-score ${isWinner ? "text-[var(--comp-accent)]" : "text-muted-foreground"}`}>
        {score === null ? "·" : score}
      </span>
    </div>
  );

  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={() => onOpen(matchup)}
      aria-disabled={!canOpen}
      aria-label={`${safeTeamName(teams.top)} contra ${safeTeamName(teams.bottom)}. ${canOpen ? `Abrir ${matchup.round === "final" ? "final" : "ida o vuelta"}` : "Pendiente, no disponible hasta jugarse"}`}
      className="europe-bracket-card"
    >
      <div className="min-w-0 flex-1">
        {renderTeam(teams.top, topWinner, result ? result.homeGoals : null)}
        <div className="mx-1 h-px bg-border/50" />
        {renderTeam(teams.bottom, bottomWinner, result ? result.awayGoals : null)}
      </div>
    </button>
  );
}

export function EuropeanKnockoutBracket({
  bracket,
  fixtures,
  onOpenFixture,
  competition,
}: {
  bracket: UCLBracketSlot[];
  fixtures: Fixture[];
  onOpenFixture?: (fixture: Fixture) => void;
  competition: CompetitionKey;
}) {
  const [selectedTie, setSelectedTie] = useState<{
    matchup: BracketMatchup;
    leg1: Fixture | null;
    leg2: Fixture | null;
  } | null>(null);

  const bracketState = useMemo(() => buildBracketState(bracket), [bracket]);
  const orderedPlayoff = orderPlayoffByR16(bracketState.playoff, bracketState.r16).map((matchup, index) => matchup ?? ({
    id: `PO-TBD-${index + 1}`,
    round: "playoff" as const,
    homeTeam: null,
    awayTeam: null,
    winner: null,
  }));
  const sides = splitUclBracketSides(orderedPlayoff, bracketState.r16, bracketState.qf, bracketState.sf);
  const fixturesSafe = Array.isArray(fixtures) ? fixtures.filter(isFixture) : [];
  const title = competition === "uel" ? "Europa League" : "Conference League";

  const openMatchup = (matchup: BracketMatchup) => {
    const tie = getTieFixtures(matchup, fixturesSafe);
    // Finals are single matches and open only after being played. For every
    // two-legged tie, always open the selector; pending legs remain disabled
    // inside that menu and cannot navigate to a match-detail route.
    if (matchup.round === "final") {
      if (tie.single?.result) onOpenFixture?.(tie.single);
      return;
    }
    if (!matchup.homeTeam || !matchup.awayTeam) return;
    setSelectedTie({ matchup, leg1: tie.leg1, leg2: tie.leg2 });
  };

  const selectLeg = (fixture: Fixture) => {
    if (!fixture.result) return;
    setSelectedTie(null);
    onOpenFixture?.(fixture);
  };

  const columns = [
    { title: "Play-off", subtitle: "Acceso a octavos" },
    { title: "Octavos", subtitle: "16 equipos" },
    { title: "Cuartos", subtitle: "8 equipos" },
    { title: "Semifinal", subtitle: "Ida y vuelta" },
    { title: "Final", subtitle: "Por el título" },
    { title: "Semifinal", subtitle: "Ida y vuelta" },
    { title: "Cuartos", subtitle: "8 equipos" },
    { title: "Octavos", subtitle: "16 equipos" },
    { title: "Play-off", subtitle: "Acceso a octavos" },
  ];

  const renderCell = (matchup: BracketMatchup, column: number, row: string, className = "") => (
    <div key={matchup.id} className={`europe-bracket-cell ${className}`} style={{ gridColumn: column, gridRow: row }}>
      <MatchCard matchup={matchup} fixtures={fixturesSafe} onOpen={openMatchup} />
    </div>
  );

  if (!Array.isArray(bracket) || bracket.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/50 p-5 text-sm text-muted-foreground">
        El cuadro de {title} se generará tras el sorteo de play-offs.
      </div>
    );
  }

  const selectedTeams = selectedTie ? displayTeams(selectedTie.matchup, fixturesSafe) : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/55 shadow-xl shadow-black/10 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-4 md:px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--comp-accent)]/30 bg-[var(--comp-accent)]/10 text-[var(--comp-accent)]">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-black tracking-wide text-foreground">Camino a la final</h3>
            <p className="text-xs text-muted-foreground">{title} · Dos caminos simétricos hasta la final central</p>
          </div>
        </div>
        <div className="rounded-full border border-border/70 bg-background/50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Eliminatorias · Ida y vuelta
        </div>
      </div>

      <div className="overflow-x-auto px-3 py-4 md:px-5 md:py-5">
        <div className="europe-bracket-content">
          <div className="europe-bracket-headings">
            {columns.map((column, index) => (
              <div key={`${column.title}-${index}`} className={`flex min-w-0 items-center gap-2 px-1 ${index === 4 ? "justify-center text-center" : ""}`}>
                <span className="text-[10px] font-black tabular-nums text-[var(--comp-accent)]">{String(index + 1).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <div className="truncate text-xs font-extrabold uppercase tracking-wider text-foreground">{column.title}</div>
                  <div className="truncate text-[10px] text-muted-foreground">{column.subtitle}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="europe-bracket-board" aria-label={`Cuadro de eliminatorias de ${title} con la final en el centro`}>
            {sides.left.playoff.map((matchup, index) => renderCell(matchup, 1, `${index * 4 + 1} / span 4`, "europe-bracket-advance-right"))}
            {sides.left.r16.map((matchup, index) => renderCell(matchup, 2, `${index * 4 + 1} / span 4`, "europe-bracket-advance-right"))}
            {sides.left.qf.map((matchup, index) => renderCell(matchup, 3, `${index * 8 + 1} / span 8`, "europe-bracket-merge-left europe-bracket-advance-right"))}
            {sides.left.sf && renderCell(sides.left.sf, 4, "1 / span 16", "europe-bracket-merge-left europe-bracket-advance-right")}

            <div className="europe-bracket-cell europe-bracket-final" style={{ gridColumn: 5, gridRow: "1 / span 16" }}>
              <div className="w-full rounded-2xl border border-amber-400/30 bg-gradient-to-b from-amber-400/10 via-card/80 to-card/50 p-3 shadow-xl shadow-amber-950/10">
                <div className="mb-3 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-amber-500">
                  <Trophy className="h-4 w-4" /> Final
                </div>
                <MatchCard matchup={bracketState.final} fixtures={fixturesSafe} onOpen={openMatchup} />
              </div>
            </div>

            {sides.right.sf && renderCell(sides.right.sf, 6, "1 / span 16", "europe-bracket-merge-right europe-bracket-advance-left")}
            {sides.right.qf.map((matchup, index) => renderCell(matchup, 7, `${index * 8 + 1} / span 8`, "europe-bracket-merge-right europe-bracket-advance-left"))}
            {sides.right.r16.map((matchup, index) => renderCell(matchup, 8, `${index * 4 + 1} / span 4`, "europe-bracket-advance-left"))}
            {sides.right.playoff.map((matchup, index) => renderCell(matchup, 9, `${index * 4 + 1} / span 4`, "europe-bracket-advance-left"))}
          </div>
        </div>
      </div>

      <Dialog open={!!selectedTie} onOpenChange={(open) => !open && setSelectedTie(null)}>
        <DialogContent className="max-w-2xl border-border/70 bg-background/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black">
              {selectedTeams ? `${safeTeamName(selectedTeams.top)} vs ${safeTeamName(selectedTeams.bottom)}` : "Eliminatoria"}
            </DialogTitle>
            <DialogDescription>Selecciona la ida o la vuelta para consultar ese partido y su resultado.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              { label: "IDA", fixture: selectedTie?.leg1 },
              { label: "VUELTA", fixture: selectedTie?.leg2 },
            ] as const).map(({ label, fixture }) => fixture ? (
              <button
                key={label}
                type="button"
                disabled={!fixture.result}
                aria-disabled={!fixture.result}
                onClick={() => selectLeg(fixture)}
                className={`rounded-xl border border-border/70 bg-card/70 p-3 text-left transition ${fixture.result ? "hover:border-[var(--comp-accent)]/60 hover:bg-card" : "cursor-not-allowed opacity-55"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black tracking-[0.14em] text-[var(--comp-accent)]">{label}</span>
                  <span className="text-[10px] font-semibold text-muted-foreground">{fixture.result ? "Disputado" : "Pendiente"}</span>
                </div>
                <div className="mt-2 space-y-2">
                  {[fixture.homeId, fixture.awayId].map((teamId, index) => {
                    const score = index === 0 ? fixture.result?.homeGoals : fixture.result?.awayGoals;
                    return (
                      <div key={`${label}-${teamId}-${index}`} className="flex min-w-0 items-center gap-2 rounded-lg bg-background/55 px-2 py-1.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center">{teamCrest(teamId, 27)}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{safeTeamName(teamId)}</span>
                        <span className="min-w-5 text-right font-mono text-base font-black tabular-nums">{score ?? "–"}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                  {formatFixtureDate(fixture.date)} · {fixture.result ? "Ver ficha del partido" : "Pendiente · no disponible hasta jugarse"}
                </div>
              </button>
            ) : (
              <div key={label} className="rounded-xl border border-dashed border-border/70 bg-background/40 p-4 text-sm text-muted-foreground">
                <div className="text-xs font-black tracking-[0.14em]">{label}</div>
                <p className="mt-3">Partido aún no generado.</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <style>{`
        .europe-bracket-content {
          --europe-bracket-line: color-mix(in oklab, var(--comp-accent, var(--primary)) 62%, transparent);
          min-width: 1420px;
        }
        .europe-bracket-headings,
        .europe-bracket-board {
          display: grid;
          grid-template-columns: 138px 148px 148px 148px 176px 148px 148px 148px 138px;
          column-gap: 10px;
        }
        .europe-bracket-headings { margin-bottom: 16px; }
        .europe-bracket-board {
          grid-template-rows: repeat(16, 30px);
          align-items: stretch;
        }
        .europe-bracket-cell {
          position: relative;
          z-index: 1;
          display: flex;
          min-width: 0;
          align-items: center;
        }
        .europe-bracket-advance-right::after,
        .europe-bracket-advance-left::before {
          position: absolute;
          z-index: 0;
          top: 50%;
          width: 14px;
          height: 2px;
          background: var(--europe-bracket-line);
          content: "";
          transform: translateY(-50%);
        }
        .europe-bracket-advance-right::after { right: -14px; }
        .europe-bracket-advance-left::before { left: -14px; }
        .europe-bracket-merge-left::before,
        .europe-bracket-merge-right::after {
          position: absolute;
          z-index: 0;
          top: 25%;
          width: 14px;
          height: 50%;
          border-top: 2px solid var(--europe-bracket-line);
          border-bottom: 2px solid var(--europe-bracket-line);
          content: "";
          pointer-events: none;
        }
        .europe-bracket-merge-left::before {
          left: -14px;
          border-left: 2px solid var(--europe-bracket-line);
          border-radius: 8px 0 0 8px;
        }
        .europe-bracket-merge-right::after {
          right: -14px;
          border-right: 2px solid var(--europe-bracket-line);
          border-radius: 0 8px 8px 0;
        }
        .europe-bracket-final { z-index: 2; }
        .europe-bracket-card {
          position: relative;
          z-index: 2;
          display: flex;
          width: 100%;
          min-width: 0;
          min-height: 62px;
          align-items: stretch;
          gap: 4px;
          overflow: hidden;
          border: 1px solid color-mix(in oklab, var(--border) 78%, transparent);
          border-radius: 12px;
          background: color-mix(in oklab, var(--background) 92%, transparent);
          padding: 5px 6px;
          text-align: left;
          box-shadow: 0 5px 16px rgb(0 0 0 / 0.08);
          transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
        }
        .europe-bracket-card:not(:disabled):hover {
          border-color: var(--europe-bracket-line);
          background: color-mix(in oklab, var(--card) 96%, transparent);
          transform: translateY(-1px);
        }
        .europe-bracket-card:disabled { cursor: not-allowed; opacity: 0.72; }
        .europe-bracket-team {
          display: flex;
          min-width: 0;
          height: 24px;
          align-items: center;
          gap: 5px;
          border-radius: 6px;
          padding: 1px 2px;
          color: var(--foreground);
        }
        .europe-bracket-team.is-winner {
          background: color-mix(in oklab, var(--comp-accent, var(--primary)) 12%, transparent);
          color: var(--foreground);
        }
        .europe-bracket-logo {
          display: flex;
          width: 18px;
          height: 18px;
          flex: 0 0 18px;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .europe-bracket-logo img { width: 18px; height: 18px; object-fit: contain; }
        .europe-bracket-score {
          min-width: 13px;
          margin-left: auto;
          text-align: right;
          font-variant-numeric: tabular-nums;
          font-size: 11px;
          font-weight: 900;
        }
        @media (prefers-reduced-motion: reduce) {
          .europe-bracket-card { transition: none; }
        }
      `}</style>
    </section>
  );
}
