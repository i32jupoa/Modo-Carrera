// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { loadSave, saveSave, SaveGame, simulatePendingUCLThroughDay } from "@/lib/store";
import { uclDayOffset } from "@/data/ucl";
import { usePlayersStore } from "@/store/playersStore";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import { TeamBadge } from "@/components/TeamBadge";
import { TeamLogo } from "@/components/TeamLogo";
import { MatchStatsModal } from "@/components/MatchStatsModal";
import { KnockoutTieList } from "@/components/competition/KnockoutTieList";
import { EuropeanStandingsTable } from "@/components/competition/EuropeanStandingsTable";
import { UCLBracketSlot, uclStartForSeason } from "@/data/ucl";
import { getSeasonStartYear } from "@/lib/season/calendarFactory";
import type { Fixture } from "@/lib/season";
import { orderPlayoffByR16, orderTieBySecondLegHome, splitUclBracketSides } from "@/lib/uclBracketLayout";

export const Route = createFileRoute("/ucl")({ component: UCLPage });

// ── helpers ──────────────────────────────────────────────────────────────────

function teamName(id: string) {
  try {
    return teamById(id).name;
  } catch {
    return id;
  }
}

function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

function uclFixtureDate(matchday: number, seasonStartYear = 2026): string {
  const start = new Date(uclStartForSeason(seasonStartYear) + "T00:00:00Z");
  const d = new Date(start.getTime() + matchday * 86400000);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
}

function Result({ f }: { f: Fixture }) {
  if (!f.result) return <span className="text-muted-foreground text-xs">vs</span>;
  const { homeGoals, awayGoals, extraTime, penalties } = f.result;

  if (penalties) {
    // Format: 2 (3) - (2) 2
    const totalHome = homeGoals + (extraTime?.homeGoals || 0);
    const totalAway = awayGoals + (extraTime?.awayGoals || 0);
    return (
      <span className="font-mono font-semibold whitespace-nowrap">
        {totalHome} ({penalties.homeGoals}) - ({penalties.awayGoals}) {totalAway}
      </span>
    );
  } else if (extraTime) {
    const totalHome = homeGoals + extraTime.homeGoals;
    const totalAway = awayGoals + extraTime.awayGoals;
    if (totalHome !== totalAway) {
      return (
        <div className="flex flex-col items-center">
          <span className="font-mono font-semibold whitespace-nowrap">
            {totalHome} - {totalAway}
          </span>
          <span className="text-[10px] text-muted-foreground">(prórroga)</span>
        </div>
      );
    }
    return (
      <span className="font-mono font-semibold whitespace-nowrap">
        {totalHome} - {totalAway}
      </span>
    );
  }

  return (
    <span className="font-mono font-semibold whitespace-nowrap">
      {homeGoals} – {awayGoals}
    </span>
  );
}

// ── Fixtures list ─────────────────────────────────────────────────────────────

function FixtureRow({
  f,
  myTeamId,
  fixtures,
  onClick,
}: {
  f: Fixture;
  myTeamId: string;
  fixtures: Fixture[];
  onClick?: (fixture: Fixture) => void;
}) {
  const isUser = f.homeId === myTeamId || f.awayId === myTeamId;
  const played = !!f.result;
  const roundPrefix = f.round?.replace(/-Leg[12]$/, "");
  const otherLeg = roundPrefix && f.round?.includes("-Leg")
    ? fixtures.find((candidate) => {
        if (candidate.id === f.id || !candidate.result || !candidate.round?.startsWith(`${roundPrefix}-Leg`)) return false;
        return [candidate.homeId, candidate.awayId].sort().join("|") === [f.homeId, f.awayId].sort().join("|");
      })
    : undefined;
  const goalsForTeam = (fixture: Fixture, teamId: string) => {
    const result = fixture.result;
    if (!result) return 0;
    const regular = fixture.homeId === teamId ? result.homeGoals : result.awayGoals;
    const extra = fixture.homeId === teamId ? result.extraTime?.homeGoals : result.extraTime?.awayGoals;
    return Number(regular ?? 0) + Number(extra ?? 0);
  };
  const aggregate = f.result && otherLeg?.result
    ? {
        home: goalsForTeam(f, f.homeId) + goalsForTeam(otherLeg, f.homeId),
        away: goalsForTeam(f, f.awayId) + goalsForTeam(otherLeg, f.awayId),
      }
    : null;
  const isSecondLeg = /-Leg2$/.test(f.round ?? "");
  const advancingTeamId = aggregate && isSecondLeg
    ? aggregate.home > aggregate.away
      ? f.homeId
      : aggregate.away > aggregate.home
        ? f.awayId
        : f.result?.penalties
          ? f.result.penalties.homeGoals > f.result.penalties.awayGoals
            ? f.homeId
            : f.awayId
          : undefined
    : undefined;
  const advancementDetail = f.result?.penalties
    ? "por penaltis"
    : f.result?.extraTime
      ? "tras prórroga"
      : "por el global";
  let resultBg = "";
  if (played && isUser) {
    const myGoals = f.homeId === myTeamId ? f.result!.homeGoals : f.result!.awayGoals;
    const theirGoals = f.homeId === myTeamId ? f.result!.awayGoals : f.result!.homeGoals;
    resultBg =
      myGoals > theirGoals
        ? "bg-green-950/40 border-l-2 border-green-500"
        : myGoals < theirGoals
          ? "bg-red-950/40 border-l-2 border-red-500"
          : "bg-yellow-950/30 border-l-2 border-yellow-500";
  }

  function Logo({ id }: { id: string }) {
    try {
      const t = teamById(id);
      return <TeamLogo teamName={t.name} leagueName={getLeagueName(t.league)} size={20} />;
    } catch {
      return <TeamBadge teamId={id} size={20} />;
    }
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 hover:bg-muted/30 text-sm ${isUser ? resultBg || "bg-blue-950/20 border-l-2 border-blue-400" : ""} ${played ? "cursor-pointer" : ""}`}
      onClick={() => played && onClick?.(f)}
    >
      <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
        <span
          className={`text-right truncate max-w-[130px] ${f.homeId === myTeamId ? "font-bold text-white" : ""}`}
        >
          {teamName(f.homeId)}
        </span>
        <Logo id={f.homeId} />
      </div>
      <div className="w-24 text-center shrink-0 py-1">
        {isUser && <div className="mb-1"><span className="rounded-full border border-primary/40 bg-primary/15 px-2 py-0.5 text-[0.55rem] font-black uppercase tracking-wider text-primary">Tu partido</span></div>}
        {played ? (
          (() => {
            const { homeGoals, awayGoals, extraTime, penalties } = f.result!;
            if (penalties) {
              const totalHome = homeGoals + (extraTime?.homeGoals || 0);
              const totalAway = awayGoals + (extraTime?.awayGoals || 0);
              return (
                <span className="font-mono font-bold text-xs whitespace-nowrap">
                  {totalHome} ({penalties.homeGoals}) - ({penalties.awayGoals}) {totalAway}
                </span>
              );
            } else if (extraTime) {
              const totalHome = homeGoals + extraTime.homeGoals;
              const totalAway = awayGoals + extraTime.awayGoals;
              if (totalHome !== totalAway) {
                return (
                  <div className="flex flex-col items-center">
                    <span className="font-mono font-bold text-xs whitespace-nowrap">
                      {totalHome} - {totalAway}
                    </span>
                    <span className="text-[9px] text-muted-foreground">(prórroga)</span>
                  </div>
                );
              }
              return (
                <span className="font-mono font-bold text-xs whitespace-nowrap">
                  {totalHome} - {totalAway}
                </span>
              );
            }
            return (
              <span className="font-mono font-bold text-sm whitespace-nowrap">
                {homeGoals} – {awayGoals}
              </span>
            );
          })()
        ) : (
          <span className="text-muted-foreground text-xs font-medium">vs</span>
        )}
        {aggregate && (
          <div className="mt-1 text-[0.58rem] font-bold text-primary whitespace-nowrap" title="Marcador global de la eliminatoria">
            <div>Global {aggregate.home}–{aggregate.away}</div>
            {advancingTeamId && <div className="max-w-[150px] truncate text-[0.52rem]" title={`Clasifica ${teamName(advancingTeamId)} ${advancementDetail}`}>Clasifica: {teamName(advancingTeamId)} {advancementDetail}</div>}
          </div>
        )}
      </div>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <Logo id={f.awayId} />
        <span
          className={`truncate max-w-[130px] ${f.awayId === myTeamId ? "font-bold text-white" : ""}`}
        >
          {teamName(f.awayId)}
        </span>
      </div>
    </div>
  );
}

// ── Bracket view ──────────────────────────────────────────────────────────────

// Immutable bracket structure
interface BracketMatchup {
  id: string; // "R16-1", "QF-1", etc.
  round: string; // "playoff", "r16", "qf", "sf", "final"
  homeTeam: string | null; // ID del equipo original (inmutable una vez se establece)
  awayTeam: string | null; // ID del equipo original (inmutable una vez se establece)
  winner: string | null; // ID del ÚNICO ganador de esta llave que avanza a la siguiente ronda
}

interface ImmutableBracketState {
  playoff: BracketMatchup[];
  r16: BracketMatchup[];
  qf: BracketMatchup[];
  sf: BracketMatchup[];
  final: BracketMatchup;
}

// Build immutable bracket state from fixtures (not bracket slots)
function isBracketFixture(value: unknown): value is Fixture {
  if (!value || typeof value !== "object") return false;
  const f = value as Partial<Fixture>;
  return typeof f.homeId === "string" && typeof f.awayId === "string" && typeof f.round === "string";
}


function getFixturesForBracketMatchup(matchup: BracketMatchup, fixtures: Fixture[]) {
  const safeFixtures = Array.isArray(fixtures) ? fixtures.filter(isBracketFixture) : [];
  if (matchup.round === "final") {
    return { single: safeFixtures.find((fixture) => fixture.round === "Final") ?? null, leg1: null, leg2: null };
  }

  if (!matchup.homeTeam || !matchup.awayTeam) {
    return { single: null, leg1: null, leg2: null };
  }

  const roundPrefix = matchup.round === "playoff" ? "Playoff" : matchup.round.toUpperCase();
  const teams = [matchup.homeTeam, matchup.awayTeam].sort().join("|");
  const tieFixtures = safeFixtures.filter((fixture) =>
    fixture.round?.startsWith(roundPrefix) &&
    (fixture.matchday == null || fixture.matchday > 0) &&
    [fixture.homeId, fixture.awayId].sort().join("|") === teams,
  );

  return {
    single: null,
    leg1: tieFixtures.find((fixture) => fixture.round?.endsWith("-Leg1")) ?? null,
    leg2: tieFixtures.find((fixture) => fixture.round?.endsWith("-Leg2")) ?? null,
  };
}

function buildImmutableBracketState(fixtures: Fixture[]): ImmutableBracketState {
  const playoff: BracketMatchup[] = [];
  const r16: BracketMatchup[] = [];
  const qf: BracketMatchup[] = [];
  const sf: BracketMatchup[] = [];
  let final: BracketMatchup = {
    id: "F",
    round: "final",
    homeTeam: null,
    awayTeam: null,
    winner: null,
  };

  const safeFixtures = Array.isArray(fixtures) ? fixtures.filter(isBracketFixture) : [];

  // Helper to group fixtures by tie (same teams in both legs)
  const groupFixturesByTie = (roundPrefix: string): Map<string, Fixture[]> => {
    const ties = new Map<string, Fixture[]>();
    const roundFixtures = safeFixtures.filter(
      (f) => typeof f.round === "string" && f.round.startsWith(roundPrefix) && (f.matchday == null || f.matchday > 0),
    );

    for (const f of roundFixtures) {
      const key = [f.homeId, f.awayId].sort().join("-");
      if (!ties.has(key)) {
        ties.set(key, []);
      }
      ties.get(key)!.push(f);
    }

    return ties;
  };

  // Helper to calculate winner from leg1 and leg2
  const calculateWinnerFromLegs = (leg1: Fixture, leg2: Fixture): string | null => {
    if (!leg1.result || !leg2.result) return null;

    // The second leg decides ties level on aggregate via extra time/penalties.
    if (leg2.result.penalties) {
      return leg2.result.penalties.homeGoals > leg2.result.penalties.awayGoals
        ? leg2.homeId
        : leg2.awayId;
    }

    const aggHome =
      leg1.result.homeGoals +
      leg2.result.awayGoals +
      (leg2.result.extraTime?.awayGoals || 0);
    const aggAway =
      leg1.result.awayGoals +
      leg2.result.homeGoals +
      (leg2.result.extraTime?.homeGoals || 0);

    return aggHome > aggAway ? leg1.homeId : leg1.awayId;
  };

  // Build playoff matchups from fixtures
  const playoffTies = groupFixturesByTie("Playoff");
  let playoffIndex = 0;
  for (const [key, tieFixtures] of [...playoffTies.entries()].sort((a, b) => (a[1][0]?.id ?? "").localeCompare(b[1][0]?.id ?? "", undefined, { numeric: true }))) {
    if (tieFixtures.length >= 1) {
      const leg1 = tieFixtures.find((f) => f.round?.includes("Leg1"));
      const leg2 = tieFixtures.find((f) => f.round?.includes("Leg2"));

      playoff.push({
        id: `PO-${playoffIndex + 1}`,
        round: "playoff",
        homeTeam: leg1?.homeId || null,
        awayTeam: leg1?.awayId || null,
        winner: leg1 && leg2 ? calculateWinnerFromLegs(leg1, leg2) : null,
      });
      playoffIndex++;
    }
  }

  // Build R16 matchups from fixtures
  const r16Ties = groupFixturesByTie("R16");
  let r16Index = 0;
  for (const [key, tieFixtures] of [...r16Ties.entries()].sort((a, b) => (a[1][0]?.id ?? "").localeCompare(b[1][0]?.id ?? "", undefined, { numeric: true }))) {
    if (tieFixtures.length >= 1) {
      const leg1 = tieFixtures.find((f) => f.round?.includes("Leg1"));
      const leg2 = tieFixtures.find((f) => f.round?.includes("Leg2"));

      r16.push({
        id: `R16-${r16Index + 1}`,
        round: "r16",
        homeTeam: leg1?.homeId || null,
        awayTeam: leg1?.awayId || null,
        winner: leg1 && leg2 ? calculateWinnerFromLegs(leg1, leg2) : null,
      });
      r16Index++;
    }
  }

  // Build QF matchups from fixtures
  const qfTies = groupFixturesByTie("QF");
  let qfIndex = 0;
  for (const [key, tieFixtures] of [...qfTies.entries()].sort((a, b) => (a[1][0]?.id ?? "").localeCompare(b[1][0]?.id ?? "", undefined, { numeric: true }))) {
    if (tieFixtures.length >= 1) {
      const leg1 = tieFixtures.find((f) => f.round?.includes("Leg1"));
      const leg2 = tieFixtures.find((f) => f.round?.includes("Leg2"));

      qf.push({
        id: `QF-${qfIndex + 1}`,
        round: "qf",
        homeTeam: leg1?.homeId || null,
        awayTeam: leg1?.awayId || null,
        winner: leg1 && leg2 ? calculateWinnerFromLegs(leg1, leg2) : null,
      });
      qfIndex++;
    }
  }

  // Build SF matchups from fixtures
  const sfTies = groupFixturesByTie("SF");
  let sfIndex = 0;
  for (const [key, tieFixtures] of [...sfTies.entries()].sort((a, b) => (a[1][0]?.id ?? "").localeCompare(b[1][0]?.id ?? "", undefined, { numeric: true }))) {
    if (tieFixtures.length >= 1) {
      const leg1 = tieFixtures.find((f) => f.round?.includes("Leg1"));
      const leg2 = tieFixtures.find((f) => f.round?.includes("Leg2"));

      sf.push({
        id: `SF-${sfIndex + 1}`,
        round: "sf",
        homeTeam: leg1?.homeId || null,
        awayTeam: leg1?.awayId || null,
        winner: leg1 && leg2 ? calculateWinnerFromLegs(leg1, leg2) : null,
      });
      sfIndex++;
    }
  }

  // Build final from fixtures
  const finalFixture = safeFixtures.find((f) => f.round === "Final");
  if (finalFixture) {
    final = {
      id: "F",
      round: "final",
      homeTeam: finalFixture.homeId,
      awayTeam: finalFixture.awayId,
      winner: finalFixture.result
        ? finalFixture.result.homeGoals > finalFixture.result.awayGoals
          ? finalFixture.homeId
          : finalFixture.awayId
        : null,
    };
  }

  return { playoff, r16, qf, sf, final };
}

// Calculate real aggregate result from fixtures by tie
function getRealMatchResult(
  matchup: BracketMatchup,
  fixtures: Fixture[],
): {
  homeGoals: number;
  awayGoals: number;
  winner: string;
  extraTime?: boolean;
  penalties?: { homeGoals: number; awayGoals: number };
  lastLeg?: Fixture;
} | null {
  if (!matchup || typeof matchup !== "object" || typeof matchup.homeTeam !== "string" || typeof matchup.awayTeam !== "string") return null;
  const safeFixtures = Array.isArray(fixtures) ? fixtures.filter(isBracketFixture) : [];

  // For final, find the single fixture
  if (matchup.round === "final") {
    const finalMatch = safeFixtures.find((f) => f.round === "Final");
    if (finalMatch?.result) {
      const extraTime = !!finalMatch.result.extraTime;
      const penalties = finalMatch.result.penalties
        ? {
            homeGoals: finalMatch.result.penalties.homeGoals,
            awayGoals: finalMatch.result.penalties.awayGoals,
          }
        : undefined;
      return {
        homeGoals: finalMatch.result.homeGoals,
        awayGoals: finalMatch.result.awayGoals,
        winner:
          finalMatch.result.penalties
            ? (finalMatch.result.penalties.homeGoals > finalMatch.result.penalties.awayGoals ? finalMatch.homeId : finalMatch.awayId)
            : finalMatch.result.homeGoals > finalMatch.result.awayGoals
              ? finalMatch.homeId
              : finalMatch.awayId,
        extraTime,
        penalties,
        lastLeg: finalMatch,
      };
    }
    return null;
  }

  // For two-legged ties, find both legs by team IDs
  const roundPrefix = matchup.round === "playoff" ? "Playoff" : matchup.round.toUpperCase();
  const roundFixtures = safeFixtures.filter((f) => typeof f.round === "string" && f.round.startsWith(roundPrefix) && (f.matchday == null || f.matchday > 0));

  // Find the two legs for this tie
  const leg1 = roundFixtures.find(
    (f) => f.homeId === matchup.homeTeam && f.awayId === matchup.awayTeam,
  );
  const leg2 = roundFixtures.find(
    (f) => f.homeId === matchup.awayTeam && f.awayId === matchup.homeTeam,
  );

  if (leg1?.result && leg2?.result) {
    // Check if leg2 went to extra time or penalties
    const extraTime = !!leg2.result.extraTime;
    const penalties = leg2.result.penalties
      ? { homeGoals: leg2.result.penalties.homeGoals, awayGoals: leg2.result.penalties.awayGoals }
      : undefined;

    // Determine winner based on penalties if they exist
    let winner: string;
    if (penalties) {
      winner = penalties.homeGoals > penalties.awayGoals ? leg2.homeId : leg2.awayId;
    } else if (extraTime) {
      const homeAgg =
        leg1.result.homeGoals + leg2.result.awayGoals + (leg2.result.extraTime?.awayGoals || 0);
      const awayAgg =
        leg1.result.awayGoals + leg2.result.homeGoals + (leg2.result.extraTime?.homeGoals || 0);
      winner = homeAgg > awayAgg ? leg1.homeId : leg1.awayId;
    } else {
      const homeAgg = leg1.result.homeGoals + leg2.result.awayGoals;
      const awayAgg = leg1.result.awayGoals + leg2.result.homeGoals;
      winner = homeAgg > awayAgg ? leg1.homeId : leg1.awayId;
    }

    // Correct aggregate calculation for two-legged ties
    const homeAgg =
      leg1.result.homeGoals + leg2.result.awayGoals + (leg2.result.extraTime?.awayGoals || 0);
    const awayAgg =
      leg1.result.awayGoals + leg2.result.homeGoals + (leg2.result.extraTime?.homeGoals || 0);
    return { homeGoals: homeAgg, awayGoals: awayAgg, winner, extraTime, penalties, lastLeg: leg2 };
  }

  // If only leg1 is played, show leg1 result
  if (leg1?.result) {
    return {
      homeGoals: leg1.result.homeGoals,
      awayGoals: leg1.result.awayGoals,
      winner: leg1.result.homeGoals > leg1.result.awayGoals ? leg1.homeId : leg1.awayId,
      lastLeg: leg1,
    };
  }

  return null;
}

function BracketView({
  bracket,
  fixtures,
  onOpenFixture,
}: {
  bracket: UCLBracketSlot[];
  fixtures: Fixture[];
  onOpenFixture?: (fixture: Fixture) => void;
}) {
  const [selectedTie, setSelectedTie] = useState<{
    matchup: BracketMatchup;
    leg1: Fixture | null;
    leg2: Fixture | null;
  } | null>(null);

  if (!Array.isArray(bracket) || bracket.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/50 p-5 text-sm text-muted-foreground">
        El cuadro se generará tras el sorteo de play-offs.
      </div>
    );
  }

  let bracketState: ImmutableBracketState;
  try {
    // Fixtures are authoritative: each displayed tie and its route must match
    // the real fixture IDs and the persisted competition progression.
    bracketState = buildImmutableBracketState(Array.isArray(fixtures) ? fixtures : []);
  } catch (error) {
    console.error("[BracketView] Error construyendo cuadro:", error);
    return (
      <div className="rounded-2xl border border-border/60 bg-card/50 p-6 text-center text-muted-foreground">
        <p className="font-semibold">No se pudo cargar el cuadro</p>
        <p className="mt-1 text-sm">Los partidos y resultados siguen guardados; el cuadro se reconstruirá con los datos válidos.</p>
      </div>
    );
  }

  const withPlaceholders = (items: BracketMatchup[], count: number, round: string, prefix: string) =>
    Array.from({ length: count }, (_, index) => items[index] ?? ({
      id: `${prefix}-${index + 1}`,
      round,
      homeTeam: null,
      awayTeam: null,
      winner: null,
    } satisfies BracketMatchup));

  const r16 = withPlaceholders(bracketState.r16, 8, "r16", "R16");
  const playoff = withPlaceholders(bracketState.playoff, 8, "playoff", "PO");
  const qf = withPlaceholders(bracketState.qf, 4, "qf", "QF");
  const sf = withPlaceholders(bracketState.sf, 2, "sf", "SF");

  // The playoff order must first match its destination in the R16. Only then
  // do we split both halves and mirror the right-hand route around the final.
  const playoffByR16 = orderPlayoffByR16(playoff, r16).map((matchup, index) => matchup ?? ({
    id: `PO-TBD-${index + 1}`,
    round: "playoff",
    homeTeam: null,
    awayTeam: null,
    winner: null,
  } satisfies BracketMatchup));
  const sides = splitUclBracketSides(playoffByR16, r16, qf, sf);

  const safeTeamName = (id: string): string => {
    if (typeof id !== "string" || !id || id.startsWith("winner-")) return "Por definir";
    try {
      return teamName(id);
    } catch {
      return id;
    }
  };

  const getTeamLogoPath = (teamId: string): string => {
    if (typeof teamId !== "string" || !teamId || teamId.startsWith("PO-WINNER-") || teamId.startsWith("winner-")) {
      return "";
    }

    try {
      const team = teamById(teamId);
      const leagueFolderMap: Record<string, string> = {
        laliga: "LALIGA EA SPORTS",
        premier: "Premier League",
        seriea: "Serie A Enilive",
        bundesliga: "Bundesliga",
        ligue1: "Ligue 1 McDonald's",
        laliga2: "LALIGA HYPERMOTION",
        championship: "EFL Championship",
        leagueone: "EFL League One",
        leaguetwo: "EFL League Two",
        serieb: "Serie BKT",
        bundesliga2: "Bundesliga 2",
        liga3: "3. Liga",
        ligue2: "Ligue 2 BKT",
        ligaportugal: "Liga Portugal",
        eredivisie: "Eredivisie",
        scottish: "Scottish Prem",
        austrianbundesliga: "Ö. Bundesliga",
      };
      const leagueFolder = leagueFolderMap[team.league] || getLeagueName(team.league);
      const svgTeams: Record<string, string> = { juv: "Juventus.svg" };
      return `/logos/${leagueFolder}/${svgTeams[teamId] || `${team.name}.png`}`;
    } catch {
      return "";
    }
  };

  const finalMatchup: BracketMatchup = bracketState.final ?? {
    id: "F",
    round: "final",
    homeTeam: null,
    awayTeam: null,
    winner: null,
  };

  const openMatchup = (matchup: BracketMatchup) => {
    const tie = getFixturesForBracketMatchup(matchup, fixtures);
    // Finals are single matches and open only after being played. For a
    // two-legged tie, open the selector even when both legs are pending;
    // played-only navigation is enforced by each leg button in the dialog.
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

  const formatFixtureDate = (date?: string) => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Fecha por confirmar";
    return new Date(`${date}T12:00:00`).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
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

  const renderMatchCard = (matchup: BracketMatchup) => (
    <ImmutableMatchCard
      matchup={matchup}
      fixtures={fixtures}
      safeTeamName={safeTeamName}
      getTeamLogoPath={getTeamLogoPath}
      onOpenMatchup={openMatchup}
    />
  );

  const renderCell = (
    matchup: BracketMatchup,
    column: number,
    row: string,
    className = "",
  ) => (
    <div
      key={matchup.id}
      className={`ucl-bracket-cell ${className}`}
      style={{ gridColumn: column, gridRow: row }}
    >
      {renderMatchCard(matchup)}
    </div>
  );

  return (
    <section className="ucl-bracket-shell overflow-hidden rounded-2xl border border-border/70 bg-card/55 shadow-xl shadow-black/10 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-4 md:px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--comp-accent)]/30 bg-[var(--comp-accent)]/10 text-[var(--comp-accent)]">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-black tracking-wide text-foreground">Camino a la final</h3>
            <p className="text-xs text-muted-foreground">Dos caminos simétricos que terminan en la final central</p>
          </div>
        </div>
        <div className="rounded-full border border-border/70 bg-background/50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Eliminatorias · Ida y vuelta
        </div>
      </div>

      <div className="overflow-x-auto px-3 py-4 md:px-5 md:py-5">
        <div className="ucl-bracket-content">
          <div className="ucl-bracket-headings">
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

          <div className="ucl-bracket-board" aria-label="Cuadro de eliminatorias de la Champions League con la final en el centro">
            {sides.left.playoff.map((matchup, index) => renderCell(matchup, 1, `${index * 4 + 1} / span 4`, "ucl-bracket-advance-right"))}
            {sides.left.r16.map((matchup, index) => renderCell(matchup, 2, `${index * 4 + 1} / span 4`, "ucl-bracket-advance-right"))}
            {sides.left.qf.map((matchup, index) => renderCell(matchup, 3, `${index * 8 + 1} / span 8`, "ucl-bracket-merge-left ucl-bracket-advance-right"))}
            {sides.left.sf && renderCell(sides.left.sf, 4, "1 / span 16", "ucl-bracket-merge-left ucl-bracket-advance-right")}

            <div className="ucl-bracket-cell ucl-bracket-final" style={{ gridColumn: 5, gridRow: "1 / span 16" }}>
              <div className="w-full rounded-2xl border border-amber-400/30 bg-gradient-to-b from-amber-500/10 to-background/90 p-3 text-center shadow-lg shadow-amber-950/10">
                <div className="mb-3 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-amber-500">
                  <Trophy className="h-4 w-4" /> Final
                </div>
                {renderMatchCard(finalMatchup)}
              </div>
            </div>

            {sides.right.sf && renderCell(sides.right.sf, 6, "1 / span 16", "ucl-bracket-merge-right ucl-bracket-advance-left")}
            {sides.right.qf.map((matchup, index) => renderCell(matchup, 7, `${index * 8 + 1} / span 8`, "ucl-bracket-merge-right ucl-bracket-advance-left"))}
            {sides.right.r16.map((matchup, index) => renderCell(matchup, 8, `${index * 4 + 1} / span 4`, "ucl-bracket-advance-left"))}
            {sides.right.playoff.map((matchup, index) => renderCell(matchup, 9, `${index * 4 + 1} / span 4`, "ucl-bracket-advance-left"))}
          </div>
        </div>
      </div>

      <Dialog open={!!selectedTie} onOpenChange={(open) => !open && setSelectedTie(null)}>
        <DialogContent className="max-w-2xl border-border/70 bg-background/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black">
              {selectedTie ? `${safeTeamName(selectedTie.leg2?.homeId ?? selectedTie.matchup.awayTeam ?? "")} vs ${safeTeamName(selectedTie.leg2?.awayId ?? selectedTie.matchup.homeTeam ?? "")}` : "Eliminatoria"}
            </DialogTitle>
            <DialogDescription>Selecciona la ida o la vuelta para consultar ese partido y su resultado.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              { label: "IDA", fixture: selectedTie?.leg1 },
              { label: "VUELTA", fixture: selectedTie?.leg2 },
            ] as const).map(({ label, fixture }) => (
              fixture ? (
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
                    {[fixture.homeId, fixture.awayId].map((teamId, teamIndex) => {
                      let crest = <TeamBadge teamId={teamId} size={27} />;
                      try {
                        const team = teamById(teamId);
                        crest = <TeamLogo teamName={team.name} leagueName={getLeagueName(team.league)} size={27} />;
                      } catch {
                        // Keep the short-name badge when a legacy team has no catalogue entry.
                      }
                      const score = teamIndex === 0 ? fixture.result?.homeGoals : fixture.result?.awayGoals;
                      return (
                        <div key={`${label}-${teamId}-${teamIndex}`} className="flex min-w-0 items-center gap-2 rounded-lg bg-background/55 px-2 py-1.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center">{crest}</span>
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
              )
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <style>{`
        .ucl-bracket-content {
          --ucl-bracket-line: color-mix(in oklab, var(--comp-accent, var(--primary)) 62%, transparent);
          min-width: 1420px;
        }
        .ucl-bracket-headings,
        .ucl-bracket-board {
          display: grid;
          grid-template-columns: 138px 148px 148px 148px 176px 148px 148px 148px 138px;
          column-gap: 10px;
        }
        .ucl-bracket-headings {
          margin-bottom: 16px;
        }
        .ucl-bracket-board {
          grid-template-rows: repeat(16, 30px);
          align-items: stretch;
        }
        .ucl-bracket-cell {
          position: relative;
          z-index: 1;
          display: flex;
          min-width: 0;
          align-items: center;
        }
        .ucl-bracket-advance-right::after,
        .ucl-bracket-advance-left::before {
          position: absolute;
          z-index: 0;
          top: 50%;
          width: 14px;
          height: 2px;
          background: var(--ucl-bracket-line);
          content: "";
          transform: translateY(-50%);
        }
        .ucl-bracket-advance-right::after { right: -14px; }
        .ucl-bracket-advance-left::before { left: -14px; }
        .ucl-bracket-merge-left::before,
        .ucl-bracket-merge-right::after {
          position: absolute;
          z-index: 0;
          top: 25%;
          width: 14px;
          height: 50%;
          border-top: 2px solid var(--ucl-bracket-line);
          border-bottom: 2px solid var(--ucl-bracket-line);
          content: "";
          pointer-events: none;
        }
        .ucl-bracket-merge-left::before {
          left: -14px;
          border-left: 2px solid var(--ucl-bracket-line);
          border-radius: 8px 0 0 8px;
        }
        .ucl-bracket-merge-right::after {
          right: -14px;
          border-right: 2px solid var(--ucl-bracket-line);
          border-radius: 0 8px 8px 0;
        }
        .ucl-bracket-final { z-index: 2; }
        .ucl-bracket-card {
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
        .ucl-bracket-card:not(:disabled):hover {
          border-color: var(--ucl-bracket-line);
          background: color-mix(in oklab, var(--card) 96%, transparent);
          transform: translateY(-1px);
        }
        .ucl-bracket-card:disabled { cursor: not-allowed; opacity: 0.72; }
        .ucl-bracket-team {
          display: flex;
          min-width: 0;
          height: 24px;
          align-items: center;
          gap: 5px;
          border-radius: 6px;
          padding: 1px 2px;
          color: var(--foreground);
        }
        .ucl-bracket-team.is-winner {
          background: color-mix(in oklab, var(--comp-accent, var(--primary)) 12%, transparent);
          color: var(--foreground);
        }
        .ucl-bracket-logo {
          display: flex;
          width: 18px;
          height: 18px;
          flex: 0 0 18px;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .ucl-bracket-logo img { width: 18px; height: 18px; object-fit: contain; }
        .ucl-bracket-score {
          min-width: 13px;
          margin-left: auto;
          text-align: right;
          font-variant-numeric: tabular-nums;
          font-size: 11px;
          font-weight: 900;
        }
        @media (prefers-reduced-motion: reduce) {
          .ucl-bracket-card { transition: none; }
        }
      `}</style>
    </section>
  );
}

// One card represents a full two-legged tie. Pressing it opens an explicit
// leg selector rather than guessing which fixture the user wanted to inspect.
function ImmutableMatchCard({
  matchup,
  fixtures,
  safeTeamName,
  getTeamLogoPath,
  onOpenMatchup,
}: {
  matchup: BracketMatchup;
  fixtures: Fixture[];
  safeTeamName: (id: string) => string;
  getTeamLogoPath: (id: string) => string;
  onOpenMatchup?: (matchup: BracketMatchup) => void;
}) {
  if (!matchup || typeof matchup !== "object") return null;

  const home = typeof matchup.homeTeam === "string" ? matchup.homeTeam : null;
  const away = typeof matchup.awayTeam === "string" ? matchup.awayTeam : null;
  const result = getRealMatchResult(matchup, fixtures);
  const isFinal = matchup.round === "final";
  const tieFixtures = getFixturesForBracketMatchup(matchup, fixtures);
  // Open the tie selector as soon as both clubs are known, even when its
  // fixtures are still pending. Only individual played legs can open details.
  const canOpen = Boolean(onOpenMatchup && (
    isFinal
      ? tieFixtures.single?.result
      : home && away
  ));
  const isTieCompleted = isFinal || Boolean(result?.lastLeg?.round?.includes("Leg2"));
  // El equipo local en la vuelta siempre aparece arriba. En la final, de partido
  // único, se mantiene el orden local/visitante normal.
  const displayOrder = isFinal
    ? { top: home, bottom: away }
    : orderTieBySecondLegHome(home, away, tieFixtures.leg2, false);
  const topTeam = displayOrder.top;
  const bottomTeam = displayOrder.bottom;
  const topIsWinner = isTieCompleted && result?.winner === topTeam;
  const bottomIsWinner = isTieCompleted && result?.winner === bottomTeam;
  const scoreForTeam = (teamId: string | null) => {
    if (!result || !teamId) return null;
    return teamId === home ? result.homeGoals : teamId === away ? result.awayGoals : null;
  };

  const renderTeam = (teamId: string | null, isWinner: boolean) => {
    const logoPath = teamId ? getTeamLogoPath(teamId) : "";
    const score = scoreForTeam(teamId);

    return (
      <div className={`ucl-bracket-team ${isWinner ? "is-winner" : ""}`}>
        <span className="ucl-bracket-logo">
          {logoPath ? (
            <img src={logoPath} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />
          ) : teamId && !teamId.startsWith("winner-") ? (
            <TeamBadge teamId={teamId} size={18} />
          ) : (
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-muted/50 text-[9px] font-bold text-muted-foreground">?</span>
          )}
        </span>
        <span className={`min-w-0 flex-1 truncate text-[11px] ${isWinner ? "font-extrabold" : "font-semibold"}`}>
          {teamId ? safeTeamName(teamId) : "Por definir"}
        </span>
        <span className={`ucl-bracket-score ${isWinner ? "text-[var(--comp-accent)]" : "text-muted-foreground"}`}>
          {score === null ? "·" : score}
        </span>
      </div>
    );
  };

  const status = result
    ? isFinal ? "FINAL" : isTieCompleted ? "GLOBAL" : "IDA"
    : "PENDIENTE";

  return (
    <button
      type="button"
      disabled={!canOpen}
      aria-disabled={!canOpen}
      onClick={() => onOpenMatchup?.(matchup)}
      aria-label={`${safeTeamName(topTeam ?? "")} contra ${safeTeamName(bottomTeam ?? "")}${result ? `, ${status.toLowerCase()} ${scoreForTeam(topTeam) ?? 0} a ${scoreForTeam(bottomTeam) ?? 0}` : ", pendiente"}. ${canOpen ? `Abrir ${isFinal ? "partido" : "ida o vuelta"}` : "No disponible hasta jugarse"}`}
      className="ucl-bracket-card"
    >
      <div className="min-w-0 flex-1">
        {renderTeam(topTeam, topIsWinner)}
        <div className="mx-1 h-px bg-border/50" />
        {renderTeam(bottomTeam, bottomIsWinner)}
      </div>
    </button>
  );
}

function CompactMatchCard({
  slot,
  fixtures,
  safeTeamName,
  getTeamLogoPath,
  getMatchResult,
  getRoundDate,
  isFinal = false,
}: {
  slot: UCLBracketSlot;
  fixtures: Fixture[];
  safeTeamName: (id: string) => string;
  getTeamLogoPath: (id: string) => string;
  getMatchResult: (
    slot: UCLBracketSlot,
  ) => { homeGoals: number; awayGoals: number; winner: string } | null;
  getRoundDate: (slot: UCLBracketSlot) => string;
  isFinal?: boolean;
}) {
  const home = slot.homeId;
  const away = slot.awayId;
  const result = getMatchResult(slot);
  const date = getRoundDate(slot);

  if (!home || !away) {
    return (
      <div className="bg-white/5 rounded-full w-14 h-14 flex items-center justify-center border border-white/10">
        <div className="text-white/30 text-xs">TBD</div>
      </div>
    );
  }

  const homeLogoPath = getTeamLogoPath(home);
  const awayLogoPath = getTeamLogoPath(away);

  return (
    <div className="flex flex-col items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10 backdrop-blur-sm">
      {/* Home team */}
      <div className="relative group">
        {homeLogoPath ? (
          <img
            src={homeLogoPath}
            alt={safeTeamName(home)}
            className="w-14 h-14 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
            <div className="text-white/30 text-xs">TBD</div>
          </div>
        )}
        {/* Tooltip */}
        {home && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1.5 bg-black/90 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 whitespace-nowrap z-20 transition-opacity">
            {safeTeamName(home)}
          </div>
        )}
      </div>

      {/* Result - Constant size pill */}
      {result ? (
        <div className="inline-flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-lg border border-white/20 min-w-[80px] justify-center">
          <span className="text-white font-bold text-sm">{result.homeGoals}</span>
          <span className="text-white/40 text-sm">-</span>
          <span className="text-white font-bold text-sm">{result.awayGoals}</span>
        </div>
      ) : (
        <div className="inline-flex items-center bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 min-w-[80px] justify-center">
          <span className="text-white/40 text-xs">Pendiente</span>
        </div>
      )}

      {/* Away team */}
      <div className="relative group">
        {awayLogoPath ? (
          <img
            src={awayLogoPath}
            alt={safeTeamName(away)}
            className="w-14 h-14 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
            <div className="text-white/30 text-xs">TBD</div>
          </div>
        )}
        {/* Tooltip */}
        {away && (
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-1.5 bg-black/90 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 whitespace-nowrap z-20 transition-opacity">
            {safeTeamName(away)}
          </div>
        )}
      </div>
    </div>
  );
}

function DarkMatchCard({
  slot,
  fixtures,
  safeTeamName,
  getTeamLogoPath,
  getMatchResult,
  getRoundDate,
  isFinal = false,
}: {
  slot: UCLBracketSlot;
  fixtures: Fixture[];
  safeTeamName: (id: string) => string;
  getTeamLogoPath: (id: string) => string;
  getMatchResult: (slot: UCLBracketSlot) => {
    homeGoals: number;
    awayGoals: number;
    winner: string;
    extraTime?: boolean;
    penalties?: { homeGoals: number; awayGoals: number };
  } | null;
  getRoundDate: (slot: UCLBracketSlot) => string;
  isFinal?: boolean;
}) {
  const home = slot.homeId;
  const away = slot.awayId;
  const result = getMatchResult(slot);
  const date = getRoundDate(slot);

  if (!home || !away) {
    return (
      <div className="bg-[#111827] rounded-xl border border-gray-700 p-3 opacity-50">
        <div className="text-gray-500 text-xs">TBD</div>
      </div>
    );
  }

  const homeLogoPath = getTeamLogoPath(home);
  const awayLogoPath = getTeamLogoPath(away);

  // Format aggregate result with extra time/penalties info
  const formatAggregate = (res: typeof result) => {
    if (!res) return "";
    let aggStr = `${res.homeGoals}-${res.awayGoals}`;
    if (res.penalties) {
      aggStr += ` (${res.penalties.homeGoals}-${res.penalties.awayGoals} pen)`;
    } else if (res.extraTime) {
      aggStr += " (prórroga)";
    }
    return aggStr;
  };

  return (
    <div className="bg-[#111827] rounded-xl border border-cyan-500/30 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-700">
        <div className="text-gray-300 text-xs">
          {isFinal ? "Final" : slot.round.toUpperCase()}
          {result && <span className="ml-2 text-cyan-400">Glo: {formatAggregate(result)}</span>}
        </div>
      </div>

      {/* Final date/time */}
      {isFinal && (
        <div className="px-3 py-1 bg-[#0f172a] text-gray-400 text-xs text-center">{date}</div>
      )}

      {/* Teams */}
      <div className="p-2">
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2">
            {homeLogoPath ? (
              <img
                src={homeLogoPath}
                alt={safeTeamName(home)}
                className="w-6 h-6 object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <TeamBadge teamId={home} size={24} />
            )}
            <span className="text-white text-xs font-medium">{safeTeamName(home)}</span>
          </div>
          {result && <span className="text-cyan-400 text-xs font-bold">{result.homeGoals}</span>}
        </div>
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2">
            {awayLogoPath ? (
              <img
                src={awayLogoPath}
                alt={safeTeamName(away)}
                className="w-6 h-6 object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <TeamBadge teamId={away} size={24} />
            )}
            <span className="text-white text-xs font-medium">{safeTeamName(away)}</span>
          </div>
          {result && <span className="text-cyan-400 text-xs font-bold">{result.awayGoals}</span>}
        </div>
      </div>
    </div>
  );
}

function ResultsListView({
  fixtures,
  safeTeamName,
  getTeamLogoPath,
}: {
  fixtures: Fixture[];
  safeTeamName: (id: string) => string;
  getTeamLogoPath: (id: string) => string;
}) {
  // Group fixtures by tie (same teams in both legs)
  const ties = new Map<string, Fixture[]>();

  for (const f of fixtures) {
    const key = [f.homeId, f.awayId].sort().join("-");
    if (!ties.has(key)) {
      ties.set(key, []);
    }
    ties.get(key)!.push(f);
  }

  const tieArray = Array.from(ties.values());

  const getRoundLabel = (round: string | undefined): string => {
    if (!round) return "";
    if (round.includes("Playoff")) return "Play-off";
    if (round.includes("R16")) return "Octavos";
    if (round.includes("QF")) return "Cuartos";
    if (round.includes("SF")) return "Semifinal";
    if (round === "Final") return "Final";
    return round;
  };

  const matchGoals = (fixture: Fixture) => ({
    home: Number(fixture.result?.homeGoals ?? 0) + Number(fixture.result?.extraTime?.homeGoals ?? 0),
    away: Number(fixture.result?.awayGoals ?? 0) + Number(fixture.result?.extraTime?.awayGoals ?? 0),
  });

  const getAggregateScore = (leg1: Fixture, leg2: Fixture): { home: number; away: number } => {
    const one = matchGoals(leg1);
    const two = matchGoals(leg2);
    // Global orientado según la ida: local de ida vs visitante de ida.
    return { home: one.home + (leg2.homeId === leg1.homeId ? two.home : two.away),
      away: one.away + (leg2.homeId === leg1.awayId ? two.home : two.away) };
  };

  const formatDate = (matchday: number, fixture?: Fixture): string => {
    const actual = fixture?.date && /^\d{4}-\d{2}-\d{2}/.test(fixture.date)
      ? new Date(`${fixture.date.slice(0, 10)}T12:00:00Z`)
      : (() => { const d = new Date(uclStartForSeason(seasonStartYear) + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + matchday); return d; })();
    return actual.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase();
  };

  const formatLegScore = (fixture: Fixture): string => {
    if (!fixture.result) return "- -";
    const { home, away } = matchGoals(fixture);
    const extraTime = !!fixture.result.extraTime;
    const penalties = fixture.result.penalties;
    return `${home} - ${away}${extraTime ? " (a.p.)" : ""}${penalties ? ` · Pen. ${penalties.homeGoals}-${penalties.awayGoals}` : ""}`;
  };

  const legWinnerId = (fixture: Fixture): string | null => {
    if (!fixture.result) return null;
    const { home, away } = matchGoals(fixture);
    if (home > away) return fixture.homeId;
    if (away > home) return fixture.awayId;
    const pens = fixture.result.penalties;
    if (!pens || pens.homeGoals === pens.awayGoals) return null;
    return pens.homeGoals > pens.awayGoals ? fixture.homeId : fixture.awayId;
  };

  return (
    <div className="w-full bg-[#040714] min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white uppercase tracking-wider">Resultados</h2>
          <select className="bg-[#111827] text-white border border-cyan-500/30 rounded px-3 py-2 text-sm">
            <option value="playoff">Play-off</option>
            <option value="r16">Octavos</option>
            <option value="qf">Cuartos</option>
            <option value="sf">Semifinales</option>
            <option value="final">Final</option>
          </select>
        </div>

        {/* Ties */}
        <div className="space-y-4">
          {tieArray.map((tieFixtures, idx) => {
            if (tieFixtures.length === 0) return null;

            const leg1 = tieFixtures[0];
            const leg2 = tieFixtures[1];
            const roundLabel = getRoundLabel(leg1.round);

            const aggregate = leg1.result && leg2.result ? getAggregateScore(leg1, leg2) : null;
            const aggregateWinnerId = aggregate
              ? aggregate.home > aggregate.away ? leg1.homeId
                : aggregate.away > aggregate.home ? leg1.awayId
                : leg2?.result?.penalties
                  ? (leg2.homeId === leg1.homeId
                    ? (leg2.result.penalties.homeGoals > leg2.result.penalties.awayGoals ? leg1.homeId : leg1.awayId)
                    : (leg2.result.penalties.homeGoals > leg2.result.penalties.awayGoals ? leg1.awayId : leg1.homeId))
                  : null
              : (legWinnerId(leg1));

            const homeLogo1 = getTeamLogoPath(leg1.homeId);
            const awayLogo1 = getTeamLogoPath(leg1.awayId);
            const homeLogo2 = leg2 ? getTeamLogoPath(leg2.homeId) : "";
            const awayLogo2 = leg2 ? getTeamLogoPath(leg2.awayId) : "";

            return (
              <div
                key={idx}
                className="bg-[#0b0f19] rounded-xl border border-gray-800 overflow-hidden"
              >
                {/* Aggregate Score Row */}
                {aggregate && (
                  <div className="bg-[#1a1f2e] px-4 py-3 border-b border-gray-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {homeLogo1 ? (
                          <img
                            src={homeLogo1}
                            alt={safeTeamName(leg1.homeId)}
                            className="w-5 h-5 object-contain"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <TeamBadge teamId={leg1.homeId} size={20} />
                        )}
                        <span className={`text-sm ${aggregateWinnerId === leg1.homeId ? "font-black text-white" : "font-medium text-gray-300"}`}>
                          {safeTeamName(leg1.homeId)}
                        </span>
                      </div>
                      <div className="text-center text-cyan-400 text-lg font-bold">
                        {aggregate.home} - {aggregate.away}
                        {leg2?.result?.extraTime && <span className="ml-1 text-[0.62rem] font-bold text-gray-300">(a.p.)</span>}
                        {leg2?.result?.penalties && <span className="ml-1 block text-[0.62rem] font-bold text-gray-300">Pen. {leg2.homeId === leg1.homeId ? `${leg2.result.penalties.homeGoals}-${leg2.result.penalties.awayGoals}` : `${leg2.result.penalties.awayGoals}-${leg2.result.penalties.homeGoals}`}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm ${aggregateWinnerId === leg1.awayId ? "font-black text-white" : "font-medium text-gray-300"}`}>
                          {safeTeamName(leg1.awayId)}
                        </span>
                        {awayLogo1 ? (
                          <img
                            src={awayLogo1}
                            alt={safeTeamName(leg1.awayId)}
                            className="w-5 h-5 object-contain"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <TeamBadge teamId={leg1.awayId} size={20} />
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Leg 1 */}
                <div className="px-4 py-3 border-b border-gray-800/50">
                  <div className="flex items-center justify-between">
                    <div className="w-12 shrink-0" aria-hidden="true" />
                    <div className="flex-1 flex flex-col items-center">
                      <span className="text-gray-400 text-xs mb-1">{roundLabel}</span>
                      <div className="flex items-center justify-between w-full max-w-xs">
                        <div className="flex items-center gap-2">
                          {homeLogo1 ? (
                            <img
                              src={homeLogo1}
                              alt={safeTeamName(leg1.homeId)}
                              className="w-4 h-4 object-contain"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <TeamBadge teamId={leg1.homeId} size={16} />
                          )}
                          <span className={`text-xs ${legWinnerId(leg1) === leg1.homeId ? "font-black text-white" : "text-gray-300"}`}>{safeTeamName(leg1.homeId)}</span>
                        </div>
                        <span className="text-white text-sm font-bold whitespace-nowrap">
                          {formatLegScore(leg1)}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs ${legWinnerId(leg1) === leg1.awayId ? "font-black text-white" : "text-gray-300"}`}>{safeTeamName(leg1.awayId)}</span>
                          {awayLogo1 ? (
                            <img
                              src={awayLogo1}
                              alt={safeTeamName(leg1.awayId)}
                              className="w-4 h-4 object-contain"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <TeamBadge teamId={leg1.awayId} size={16} />
                          )}
                        </div>
                      </div>
                      <span className="text-gray-500 text-[10px] mt-1">
                        {formatDate(leg1.matchday, leg1)}
                      </span>
                    </div>
                    <div className="w-12"></div>
                  </div>
                </div>

                {/* Leg 2 */}
                {leg2 && (
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="w-12 shrink-0" aria-hidden="true" />
                      <div className="flex-1 flex flex-col items-center">
                        <span className="text-gray-400 text-xs mb-1">{roundLabel}</span>
                        <div className="flex items-center justify-between w-full max-w-xs">
                          <div className="flex items-center gap-2">
                            {homeLogo2 ? (
                              <img
                                src={homeLogo2}
                                alt={safeTeamName(leg2.homeId)}
                                className="w-4 h-4 object-contain"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                            ) : (
                              <TeamBadge teamId={leg2.homeId} size={16} />
                            )}
                            <span className={`text-xs ${legWinnerId(leg2) === leg2.homeId ? "font-black text-white" : "text-gray-300"}`}>
                              {safeTeamName(leg2.homeId)}
                            </span>
                          </div>
                          <span className="text-white text-sm font-bold whitespace-nowrap">
                            {formatLegScore(leg2)}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-300 text-xs">
                              {safeTeamName(leg2.awayId)}
                            </span>
                            {awayLogo2 ? (
                              <img
                                src={awayLogo2}
                                alt={safeTeamName(leg2.awayId)}
                                className="w-4 h-4 object-contain"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                            ) : (
                              <TeamBadge teamId={leg2.awayId} size={16} />
                            )}
                          </div>
                        </div>
                        <span className="text-gray-500 text-[10px] mt-1">
                          {formatDate(leg2.matchday, leg2)}
                        </span>
                      </div>
                      <div className="w-12"></div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = "tabla" | "bracket" | "partidos";
type PhaseTab = "liga" | "playoff" | "r16" | "qf" | "sf" | "final";

const PHASE_TAB_ORDER: PhaseTab[] = ["liga", "playoff", "r16", "qf", "sf", "final"];

function uclPhaseToMaxTab(phase: string, playoffDone: boolean): PhaseTab {
  if (phase === "league") return playoffDone ? "playoff" : "liga";
  if (phase === "done") return "final";
  if (PHASE_TAB_ORDER.includes(phase as PhaseTab)) return phase as PhaseTab;
  return "liga";
}

function UCLPage() {
  const [save, setSave] = useState<SaveGame | null>(null);
  const [tab, setTab] = useState<Tab>("tabla");
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const [phaseTab, setPhaseTab] = useState<PhaseTab>("liga");
  const [selectedFixture, setSelectedFixture] = useState<Fixture | null>(null);

  const currentDate = usePlayersStore((s) => s.currentDate);
  const seasonStartYear = getSeasonStartYear(save?.season);

  useEffect(() => {
    const raw = loadSave();
    if (!raw?.ucl || !raw.ucl.phase || !Array.isArray(raw.ucl.participants)) {
      setSave(raw);
      return;
    }
    const leagueFixtures = Array.isArray(raw.uclFixtures) ? raw.uclFixtures : [];
    const leagueDrawDone = raw.ucl.phase !== "league" || Boolean(raw.ucl.drawState?.leagueDone) ||
      leagueFixtures.some((fixture) => typeof fixture?.round === "string" && fixture.round.startsWith("Jornada"));
    if (!leagueDrawDone) {
      setSave(raw);
      return;
    }
    const offset = uclDayOffset(currentDate, getSeasonStartYear(raw.season));
    const synced = simulatePendingUCLThroughDay(raw, offset, raw.myTeamId);
    saveSave(synced);
    setSave(synced);
  }, [currentDate]);

  if (!save) {
    return <div className="p-6 text-muted-foreground">Cargando...</div>;
  }

  const ucl = save.ucl;
  const fixtures = Array.isArray(save.uclFixtures) ? save.uclFixtures : [];

  if (!ucl || !ucl.phase || !Array.isArray(ucl.participants)) {
    return (
      <div className="p-6 text-center space-y-2">
        <div className="text-4xl">
          <Trophy className="h-10 w-10 text-white/90" />
        </div>
        <h2 className="text-xl font-bold">Champions League</h2>
        <p className="text-muted-foreground">
          La Champions League comenzará el 3 de julio con el sorteo de la fase de liga.
        </p>
      </div>
    );
  }

  const drawState = {
    leagueDone: ucl.phase !== "league" || Boolean(ucl.drawState?.leagueDone) ||
      fixtures.some((fixture) => typeof fixture?.round === "string" && fixture.round.startsWith("Jornada")),
    playoffDone: ["playoff", "r16", "qf", "sf", "final", "done"].includes(ucl.phase) ||
      Boolean(ucl.drawState?.playoffDone),
    knockoutDone: ["r16", "qf", "sf", "final", "done"].includes(ucl.phase) ||
      Boolean(ucl.drawState?.knockoutDone),
  };
  const bracket = Array.isArray(ucl.bracket) ? ucl.bracket : [];
  const showBracket = bracket.length > 0;
  const isKnockoutPhase = ["playoff", "r16", "qf", "sf", "final", "done"].includes(ucl.phase);
  const displayTable = Array.isArray(ucl.leaguePhaseTable)
    ? ucl.leaguePhaseTable
    : Array.isArray(ucl.table) ? ucl.table : [];

  // Group fixtures by round, sorted by matchday offset
  const leagueFixtures = fixtures.filter((f) => f.round?.startsWith("Jornada") && f.matchday > 0);
  const otherFixtures = fixtures.filter(
    (f) => f.round && !f.round.startsWith("Jornada") && f.matchday > 0,
  );

  // Sort jornadas by matchday offset
  const jornadas = [
    ...new Map<string, { matchday: number; fixtures: Fixture[] }>(
      leagueFixtures.reduce((acc, f) => {
        const r = f.round ?? "Sin ronda";
        if (!acc.has(r)) acc.set(r, { matchday: f.matchday, fixtures: [] });
        acc.get(r)!.fixtures.push(f);
        return acc;
      }, new Map<string, { matchday: number; fixtures: Fixture[] }>()),
    ).entries(),
  ].sort((a, b) => a[1].matchday - b[1].matchday);

  const roundNames = jornadas.map(([r]) => r);
  const activeRound = selectedRound ?? roundNames[0] ?? null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="comp-hero px-4 md:px-6">
        <div className="flex items-center gap-3">
          <div className="text-3xl">
            <Trophy className="h-8 w-8 text-white/90" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">UEFA Champions League</h1>
            <p className="text-blue-300 text-sm">
              {ucl.phase === "league" && "Fase de Liga — Sistema Suizo"}
              {ucl.phase === "playoff" && "Play-offs — Previa de Octavos"}
              {ucl.phase === "r16" && "Octavos de Final"}
              {ucl.phase === "qf" && "Cuartos de Final"}
              {ucl.phase === "sf" && "Semifinales"}
              {ucl.phase === "final" && "Gran Final"}
              {ucl.phase === "done" && "Temporada Finalizada"}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 py-2 border-b border-border bg-card">
        {(["tabla", "partidos", ...(showBracket ? ["bracket"] : [])] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              tab === t
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t === "tabla" ? "Tabla" : t === "partidos" ? "Partidos" : "Cuadro"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4">
        {tab === "tabla" && (
          <div className="mx-auto w-full max-w-5xl"><EuropeanStandingsTable table={displayTable} userTeamId={save.myTeamId} save={save} competition="ucl" /></div>
        )}

        {tab === "partidos" &&
          (() => {
            // Build phase buckets
            const playoffFx = fixtures.filter(
              (f) => f.round?.startsWith("Playoff") && f.matchday > 0,
            );
            const r16Fx = fixtures.filter((f) => f.round?.startsWith("R16") && f.matchday > 0);
            const qfFx = fixtures.filter((f) => f.round?.startsWith("QF") && f.matchday > 0);
            const sfFx = fixtures.filter((f) => f.round?.startsWith("SF") && f.matchday > 0);
            const finalFx = fixtures.filter((f) => f.round === "Final" && f.matchday > 0);

            const maxUnlockedTab = uclPhaseToMaxTab(ucl.phase, drawState.playoffDone);
            const maxUnlockedIdx = PHASE_TAB_ORDER.indexOf(maxUnlockedTab);

            const phaseBuckets: { key: PhaseTab; label: string; fxs: Fixture[] }[] = [
              { key: "liga", label: "Fase de Liga", fxs: leagueFixtures },
              { key: "playoff", label: "Play-offs", fxs: playoffFx },
              { key: "r16", label: "Octavos", fxs: r16Fx },
              { key: "qf", label: "Cuartos", fxs: qfFx },
              { key: "sf", label: "Semifinales", fxs: sfFx },
              { key: "final", label: "Final", fxs: finalFx },
            ].filter((b) => {
              if (b.fxs.length === 0) return false;
              const idx = PHASE_TAB_ORDER.indexOf(b.key);
              if (idx > maxUnlockedIdx) return false;
              if (b.key === "playoff" && !drawState.playoffDone) return false;
              return true;
            });

            const activePhase =
              phaseBuckets.find((b) => b.key === phaseTab) ?? phaseBuckets[phaseBuckets.length - 1];

            return (
              <div className="space-y-3">
                {/* Phase sub-tabs */}
                {phaseBuckets.length > 1 && (
                  <div className="flex gap-1 flex-wrap border-b border-border/50 pb-2">
                    {phaseBuckets.map((b) => {
                      const locked = PHASE_TAB_ORDER.indexOf(b.key) > maxUnlockedIdx;
                      return (
                        <button
                          key={b.key}
                          disabled={locked}
                          onClick={() => {
                            if (!locked) {
                              setPhaseTab(b.key);
                              setSelectedRound(null);
                            }
                          }}
                          className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                            locked
                              ? "bg-muted/40 text-muted-foreground/50 cursor-not-allowed"
                              : activePhase?.key === b.key
                                ? "bg-blue-700 text-white"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {b.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {activePhase &&
                  (() => {
                    if (activePhase.key === "liga") {
                      // Jornada selector
                      return (
                        <div className="space-y-3">
                          {roundNames.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {roundNames.map((r) => {
                                const info = jornadas.find(([name]) => name === r);
                                const md = info ? info[1].matchday : 0;
                                const hasUser = info
                                  ? info[1].fixtures.some(
                                      (f) =>
                                        f.homeId === save.myTeamId || f.awayId === save.myTeamId,
                                    )
                                  : false;
                                return (
                                  <button
                                    key={r}
                                    onClick={() => setSelectedRound(r)}
                                    className={`px-3 py-1 rounded text-xs font-medium transition-colors relative ${
                                      activeRound === r
                                        ? "bg-blue-600 text-white"
                                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                                    }`}
                                  >
                                    {r}
                                    <span className="ml-1 text-[0.6rem] opacity-70">
                                      {uclFixtureDate(md, seasonStartYear)}
                                    </span>
                                    {hasUser && (
                                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-400" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          {activeRound &&
                            (() => {
                              const info = jornadas.find(([r]) => r === activeRound);
                              if (!info) return null;
                              const [, { matchday, fixtures: fxs }] = info;
                              const played = fxs.filter((f) => f.result).length;
                              return (
                                <div className="rounded-lg border border-border overflow-hidden">
                                  <div className="bg-blue-950/60 px-4 py-2.5 flex items-center justify-between">
                                    <div>
                                      <span className="text-sm font-bold text-blue-200">
                                        {activeRound}
                                      </span>
                                      <span className="ml-2 text-xs text-blue-400">
                                        {uclFixtureDate(matchday, seasonStartYear)}
                                      </span>
                                    </div>
                                    <span className="text-xs text-blue-400">
                                      {played}/{fxs.length} jugados
                                    </span>
                                  </div>
                                  <div className="divide-y divide-border">
                                    {fxs
                                      .sort((a, b) => {
                                        const aUser =
                                          a.homeId === save.myTeamId || a.awayId === save.myTeamId;
                                        const bUser =
                                          b.homeId === save.myTeamId || b.awayId === save.myTeamId;
                                        return aUser === bUser ? 0 : aUser ? -1 : 1;
                                      })
                                      .map((f) => (
                                        <FixtureRow
                                          key={f.id}
                                          f={f}
                                          myTeamId={save.myTeamId}
                                          fixtures={fixtures}
                                          onClick={setSelectedFixture}
                                        />
                                      ))}
                                  </div>
                                </div>
                              );
                            })()}
                          {leagueFixtures.length === 0 && (
                            <p className="text-muted-foreground text-sm text-center py-8">
                              Los partidos aparecerán aquí tras el sorteo de la fase de liga.
                            </p>
                          )}
                        </div>
                      );
                    }

                    return (
                      <KnockoutTieList
                        fixtures={activePhase.fxs}
                        competition="ucl"
                        onOpenFixture={setSelectedFixture}
                      />
                    );
                  })()}
              </div>
            );
          })()}

        {tab === "bracket" && (
          <BracketView
            bracket={bracket}
            fixtures={fixtures}
            onOpenFixture={setSelectedFixture}
          />
        )}
      </div>

      <MatchStatsModal fixture={selectedFixture} onClose={() => setSelectedFixture(null)} />
    </div>
  );
}
