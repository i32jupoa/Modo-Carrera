import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadSave, saveSave, SaveGame, simulatePendingUCLThroughDay } from "@/lib/store";
import { uclDayOffset } from "@/data/ucl";
import { usePlayersStore } from "@/store/playersStore";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import { TeamBadge } from "@/components/TeamBadge";
import { TeamLogo } from "@/components/TeamLogo";
import { sortUCLTable, UCLTableEntry, UCLBracketSlot, UCL_START } from "@/data/ucl";
import type { Fixture } from "@/lib/season";

export const Route = createFileRoute("/ucl")({ component: UCLPage });

// ── helpers ──────────────────────────────────────────────────────────────────

function teamName(id: string) {
  try { return teamById(id).name; } catch { return id; }
}

function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

function uclFixtureDate(matchday: number): string {
  const start = new Date(UCL_START + "T00:00:00Z");
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
    return <span className="font-mono font-semibold whitespace-nowrap">{totalHome} ({penalties.homeGoals}) - ({penalties.awayGoals}) {totalAway}</span>;
  } else if (extraTime) {
    const totalHome = homeGoals + extraTime.homeGoals;
    const totalAway = awayGoals + extraTime.awayGoals;
    if (totalHome !== totalAway) {
      return (
        <div className="flex flex-col items-center">
          <span className="font-mono font-semibold whitespace-nowrap">{totalHome} - {totalAway}</span>
          <span className="text-[10px] text-muted-foreground">(prórroga)</span>
        </div>
      );
    }
    return <span className="font-mono font-semibold whitespace-nowrap">{totalHome} - {totalAway}</span>;
  }

  return <span className="font-mono font-semibold whitespace-nowrap">{homeGoals} – {awayGoals}</span>;
}

// ── Table view (league phase) ─────────────────────────────────────────────────

function CUT({ label, color }: { label: string; color: string }) {
  return (
    <tr>
      <td colSpan={9} className={`px-3 py-0.5 text-xs font-semibold text-center ${color}`}>
        {label}
      </td>
    </tr>
  );
}

function TeamLogoById({ id, size = 26 }: { id: string; size?: number }) {
  try {
    const t = teamById(id);
    return <TeamLogo teamName={t.name} leagueName={getLeagueName(t.league)} size={size} />;
  } catch {
    return <TeamBadge teamId={id} size={size} />;
  }
}

function TableView({ table, userTeamId, fixtures }: { table: UCLTableEntry[]; userTeamId: string; fixtures: Fixture[] }) {
  const sorted = sortUCLTable(table);

  // Build form (last 5 results) per team — ONLY league-phase fixtures
  function getForm(teamId: string): ("W" | "D" | "L")[] {
    const played = fixtures
      .filter(f => f.result && f.round?.startsWith("Jornada") && (f.homeId === teamId || f.awayId === teamId))
      .sort((a, b) => a.matchday - b.matchday);
    return played.slice(-5).map(f => {
      const myGoals = f.homeId === teamId ? f.result!.homeGoals : f.result!.awayGoals;
      const theirGoals = f.homeId === teamId ? f.result!.awayGoals : f.result!.homeGoals;
      return myGoals > theirGoals ? "W" : myGoals < theirGoals ? "L" : "D";
    });
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-gradient-to-b from-card/90 to-background shadow-lg">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/20">
        <h2 className="text-sm font-black uppercase tracking-wider text-foreground">Clasificación</h2>
        <span className="text-[0.65rem] text-muted-foreground uppercase tracking-widest">Fase de Liga</span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/30 text-muted-foreground uppercase tracking-wider">
              <th className="w-10 py-2.5 px-1 font-bold text-center pl-4">#</th>
              <th className="min-w-[10rem] flex-1 py-2.5 px-1 font-bold text-left">Equipo</th>
              <th className="w-9 py-2.5 px-1 font-bold text-center">PJ</th>
              <th className="w-9 py-2.5 px-1 font-bold text-center text-emerald-400">V</th>
              <th className="w-9 py-2.5 px-1 font-bold text-center">E</th>
              <th className="w-9 py-2.5 px-1 font-bold text-center text-destructive">D</th>
              <th className="w-9 py-2.5 px-1 font-bold text-center">GF</th>
              <th className="w-9 py-2.5 px-1 font-bold text-center">GC</th>
              <th className="w-10 py-2.5 px-1 font-bold text-center">DG</th>
              <th className="w-11 py-2.5 px-1 font-bold text-center text-primary">PTS</th>
              <th className="w-24 py-2.5 px-1 font-bold text-center">Forma</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e, i) => {
              const pos = i + 1;
              const isUser = e.teamId === userTeamId;
              const r16 = pos <= 8;
              const playoff = pos > 8 && pos <= 24;
              const elim = pos > 24;
              const form = getForm(e.teamId);

              const rows: React.ReactNode[] = [];

              if (pos === 9) {
                rows.push(
                  <tr key="cut-playoff">
                    <td colSpan={11} className="py-0 px-0">
                      <div className="flex items-center gap-2 px-3 py-0.5 bg-yellow-950/30">
                        <div className="flex-1 h-px bg-yellow-600/40" />
                        <span className="text-[0.6rem] text-yellow-500 font-semibold uppercase tracking-wider whitespace-nowrap">Play-offs</span>
                        <div className="flex-1 h-px bg-yellow-600/40" />
                      </div>
                    </td>
                  </tr>
                );
              }
              if (pos === 25) {
                rows.push(
                  <tr key="cut-elim">
                    <td colSpan={11} className="py-0 px-0">
                      <div className="flex items-center gap-2 px-3 py-0.5 bg-red-950/30">
                        <div className="flex-1 h-px bg-red-600/40" />
                        <span className="text-[0.6rem] text-red-400 font-semibold uppercase tracking-wider whitespace-nowrap">Eliminados</span>
                        <div className="flex-1 h-px bg-red-600/40" />
                      </div>
                    </td>
                  </tr>
                );
              }

              rows.push(
                <tr
                  key={e.teamId}
                  className={[
                    "border-t border-border/40 transition-colors",
                    isUser
                      ? "bg-primary/15 hover:bg-primary/20"
                      : i % 2 === 0
                        ? "bg-background/40 hover:bg-muted/20"
                        : "bg-muted/5 hover:bg-muted/15",
                  ].join(" ")}
                >
                  <td className="py-2.5 pl-4 pr-1 font-bold tabular-nums">
                    <span className={[
                      "inline-flex h-6 w-6 items-center justify-center rounded text-[0.65rem]",
                      r16 ? "bg-emerald-500/20 text-emerald-400" : "",
                      playoff ? "bg-yellow-500/20 text-yellow-400" : "",
                      elim ? "bg-destructive/20 text-destructive" : "",
                    ].join(" ")}>
                      {pos}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <TeamLogoById id={e.teamId} size={26} />
                      <span className={`font-semibold truncate ${isUser ? "text-primary" : ""}`}>{teamName(e.teamId)}</span>
                    </div>
                  </td>
                  <td className="py-2 text-center tabular-nums text-muted-foreground">{e.played}</td>
                  <td className="py-2 text-center tabular-nums text-emerald-400 font-semibold">{e.won}</td>
                  <td className="py-2 text-center tabular-nums text-muted-foreground">{e.drawn}</td>
                  <td className="py-2 text-center tabular-nums text-destructive font-semibold">{e.lost}</td>
                  <td className="py-2 text-center tabular-nums">{e.gf}</td>
                  <td className="py-2 text-center tabular-nums">{e.ga}</td>
                  <td className={`py-2 text-center tabular-nums font-semibold ${e.gd > 0 ? "text-emerald-400" : e.gd < 0 ? "text-destructive" : ""}`}>
                    {e.gd > 0 ? `+${e.gd}` : e.gd}
                  </td>
                  <td className="py-2 pr-2 text-center tabular-nums font-black text-primary text-sm">{e.points}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center justify-center gap-0.5">
                      {form.map((r, fi) => (
                        <span
                          key={fi}
                          className={[
                            "inline-flex h-4 w-4 items-center justify-center rounded-full text-[0.55rem] font-bold",
                            r === "W" ? "bg-emerald-500/80 text-white" : "",
                            r === "D" ? "bg-muted-foreground/50 text-white" : "",
                            r === "L" ? "bg-destructive/80 text-white" : "",
                          ].join(" ")}
                        >
                          {r === "W" ? "V" : r === "D" ? "E" : "D"}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );

              return rows;
            })}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap gap-4 px-4 py-2.5 border-t border-border/40 text-[0.6rem] uppercase tracking-wider text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500/80" />Octavos directos</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-yellow-500/80" />Play-offs</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-destructive/80" />Eliminados</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" />Tu equipo</span>
      </footer>
    </section>
  );
}

// ── Fixtures list ─────────────────────────────────────────────────────────────

function FixtureRow({ f, myTeamId }: { f: Fixture; myTeamId: string }) {
  const isUser = f.homeId === myTeamId || f.awayId === myTeamId;
  const played = !!f.result;
  let resultBg = "";
  if (played && isUser) {
    const myGoals = f.homeId === myTeamId ? f.result!.homeGoals : f.result!.awayGoals;
    const theirGoals = f.homeId === myTeamId ? f.result!.awayGoals : f.result!.homeGoals;
    resultBg = myGoals > theirGoals ? "bg-green-950/40 border-l-2 border-green-500" :
               myGoals < theirGoals ? "bg-red-950/40 border-l-2 border-red-500" :
               "bg-yellow-950/30 border-l-2 border-yellow-500";
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
    <div className={`flex items-center gap-2 px-3 py-2 hover:bg-muted/30 text-sm ${isUser ? resultBg || "bg-blue-950/20 border-l-2 border-blue-400" : ""}`}>
      <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
        <span className={`text-right truncate max-w-[130px] ${f.homeId === myTeamId ? "font-bold text-white" : ""}`}>{teamName(f.homeId)}</span>
        <Logo id={f.homeId} />
      </div>
      <div className="w-24 text-center shrink-0 py-1">
        {played
          ? (() => {
              const { homeGoals, awayGoals, extraTime, penalties } = f.result!;
              if (penalties) {
                const totalHome = homeGoals + (extraTime?.homeGoals || 0);
                const totalAway = awayGoals + (extraTime?.awayGoals || 0);
                return <span className="font-mono font-bold text-xs whitespace-nowrap">{totalHome} ({penalties.homeGoals}) - ({penalties.awayGoals}) {totalAway}</span>;
              } else if (extraTime) {
                const totalHome = homeGoals + extraTime.homeGoals;
                const totalAway = awayGoals + extraTime.awayGoals;
                if (totalHome !== totalAway) {
                  return (
                    <div className="flex flex-col items-center">
                      <span className="font-mono font-bold text-xs whitespace-nowrap">{totalHome} - {totalAway}</span>
                      <span className="text-[9px] text-muted-foreground">(prórroga)</span>
                    </div>
                  );
                }
                return <span className="font-mono font-bold text-xs whitespace-nowrap">{totalHome} - {totalAway}</span>;
              }
              return <span className="font-mono font-bold text-sm whitespace-nowrap">{homeGoals} – {awayGoals}</span>;
            })()
          : <span className="text-muted-foreground text-xs font-medium">vs</span>
        }
      </div>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <Logo id={f.awayId} />
        <span className={`truncate max-w-[130px] ${f.awayId === myTeamId ? "font-bold text-white" : ""}`}>{teamName(f.awayId)}</span>
      </div>
    </div>
  );
}

// ── Bracket view ──────────────────────────────────────────────────────────────

// Immutable bracket structure
interface BracketMatchup {
  id: string;                // "R16-1", "QF-1", etc.
  round: string;             // "playoff", "r16", "qf", "sf", "final"
  homeTeam: string | null;   // ID del equipo original (inmutable una vez se establece)
  awayTeam: string | null;   // ID del equipo original (inmutable una vez se establece)
  winner: string | null;     // ID del ÚNICO ganador de esta llave que avanza a la siguiente ronda
}

interface ImmutableBracketState {
  playoff: BracketMatchup[];
  r16: BracketMatchup[];
  qf: BracketMatchup[];
  sf: BracketMatchup[];
  final: BracketMatchup;
}

// Build immutable bracket state from fixtures (not bracket slots)
function buildImmutableBracketState(fixtures: Fixture[]): ImmutableBracketState {
  const playoff: BracketMatchup[] = [];
  const r16: BracketMatchup[] = [];
  const qf: BracketMatchup[] = [];
  const sf: BracketMatchup[] = [];
  let final: BracketMatchup = { id: "F", round: "final", homeTeam: null, awayTeam: null, winner: null };

  // Helper to group fixtures by tie (same teams in both legs)
  const groupFixturesByTie = (roundPrefix: string): Map<string, Fixture[]> => {
    const ties = new Map<string, Fixture[]>();
    const roundFixtures = fixtures.filter(f => f.round?.startsWith(roundPrefix) && f.matchday > 0);
    
    for (const f of roundFixtures) {
      const key = [f.homeId, f.awayId].sort().join('-');
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
    
    // Aggregate: leg1.homeGoals + leg2.awayGoals (team from leg1 home)
    const aggHome = leg1.result.homeGoals + leg2.result.awayGoals;
    const aggAway = leg1.result.awayGoals + leg2.result.homeGoals;
    
    return aggHome > aggAway ? leg1.homeId : leg1.awayId;
  };

  // Build playoff matchups from fixtures
  const playoffTies = groupFixturesByTie("Playoff");
  let playoffIndex = 0;
  for (const [key, tieFixtures] of playoffTies) {
    if (tieFixtures.length >= 1) {
      const leg1 = tieFixtures.find(f => f.round?.includes("Leg1"));
      const leg2 = tieFixtures.find(f => f.round?.includes("Leg2"));
      
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
  for (const [key, tieFixtures] of r16Ties) {
    if (tieFixtures.length >= 1) {
      const leg1 = tieFixtures.find(f => f.round?.includes("Leg1"));
      const leg2 = tieFixtures.find(f => f.round?.includes("Leg2"));
      
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
  for (const [key, tieFixtures] of qfTies) {
    if (tieFixtures.length >= 1) {
      const leg1 = tieFixtures.find(f => f.round?.includes("Leg1"));
      const leg2 = tieFixtures.find(f => f.round?.includes("Leg2"));
      
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
  for (const [key, tieFixtures] of sfTies) {
    if (tieFixtures.length >= 1) {
      const leg1 = tieFixtures.find(f => f.round?.includes("Leg1"));
      const leg2 = tieFixtures.find(f => f.round?.includes("Leg2"));
      
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
  const finalFixture = fixtures.find(f => f.round === "Final");
  if (finalFixture) {
    final = {
      id: "F",
      round: "final",
      homeTeam: finalFixture.homeId,
      awayTeam: finalFixture.awayId,
      winner: finalFixture.result 
        ? (finalFixture.result.homeGoals > finalFixture.result.awayGoals ? finalFixture.homeId : finalFixture.awayId)
        : null,
    };
  }

  return { playoff, r16, qf, sf, final };
}

// Calculate real aggregate result from fixtures by tie
function getRealMatchResult(matchup: BracketMatchup, fixtures: Fixture[]): { homeGoals: number; awayGoals: number; winner: string; extraTime?: boolean; penalties?: { homeGoals: number; awayGoals: number } } | null {
  if (!matchup.homeTeam || !matchup.awayTeam) return null;

  // For final, find the single fixture
  if (matchup.round === "final") {
    const finalMatch = fixtures.find(f => f.round === "Final");
    if (finalMatch?.result) {
      const extraTime = !!finalMatch.result.extraTime;
      const penalties = finalMatch.result.penalties ? { homeGoals: finalMatch.result.penalties.homeGoals, awayGoals: finalMatch.result.penalties.awayGoals } : undefined;
      return {
        homeGoals: finalMatch.result.homeGoals,
        awayGoals: finalMatch.result.awayGoals,
        winner: finalMatch.result.homeGoals > finalMatch.result.awayGoals ? finalMatch.homeId : finalMatch.awayId,
        extraTime,
        penalties
      };
    }
    return null;
  }

  // For two-legged ties, find both legs by team IDs
  const roundPrefix = matchup.round === "playoff" ? "Playoff" : matchup.round.toUpperCase();
  const roundFixtures = fixtures.filter(f => f.round?.startsWith(roundPrefix) && f.matchday > 0);

  // Find the two legs for this tie
  const leg1 = roundFixtures.find(f => f.homeId === matchup.homeTeam && f.awayId === matchup.awayTeam);
  const leg2 = roundFixtures.find(f => f.homeId === matchup.awayTeam && f.awayId === matchup.homeTeam);

  if (leg1?.result && leg2?.result) {
    // Check if leg2 went to extra time or penalties
    const extraTime = !!leg2.result.extraTime;
    const penalties = leg2.result.penalties ? { homeGoals: leg2.result.penalties.homeGoals, awayGoals: leg2.result.penalties.awayGoals } : undefined;

    // Determine winner based on penalties if they exist
    let winner: string;
    if (penalties) {
      winner = penalties.homeGoals > penalties.awayGoals ? leg2.homeId : leg2.awayId;
    } else if (extraTime) {
      const homeAgg = leg1.result.homeGoals + leg2.result.awayGoals + (leg2.result.extraTime?.awayGoals || 0);
      const awayAgg = leg1.result.awayGoals + leg2.result.homeGoals + (leg2.result.extraTime?.homeGoals || 0);
      winner = homeAgg > awayAgg ? leg1.homeId : leg1.awayId;
    } else {
      const homeAgg = leg1.result.homeGoals + leg2.result.awayGoals;
      const awayAgg = leg1.result.awayGoals + leg2.result.homeGoals;
      winner = homeAgg > awayAgg ? leg1.homeId : leg1.awayId;
    }

    // Correct aggregate calculation for two-legged ties
    const homeAgg = leg1.result.homeGoals + leg2.result.awayGoals + (leg2.result.extraTime?.awayGoals || 0);
    const awayAgg = leg1.result.awayGoals + leg2.result.homeGoals + (leg2.result.extraTime?.homeGoals || 0);
    return { homeGoals: homeAgg, awayGoals: awayAgg, winner, extraTime, penalties };
  }

  // If only leg1 is played, show leg1 result
  if (leg1?.result) {
    return {
      homeGoals: leg1.result.homeGoals,
      awayGoals: leg1.result.awayGoals,
      winner: leg1.result.homeGoals > leg1.result.awayGoals ? leg1.homeId : leg1.awayId
    };
  }

  return null;
}

function BracketView({ bracket, fixtures }: { bracket: UCLBracketSlot[]; fixtures: Fixture[] }) {
  if (bracket.length === 0) {
    return <p className="text-muted-foreground text-sm p-4">El cuadro se generará tras el sorteo de play-offs.</p>;
  }

  // Build immutable bracket state from fixtures
  const bracketState = buildImmutableBracketState(fixtures);

  // Split into left half (routes A & B) and right half (routes C & D)
  const playoffLeft = bracketState.playoff.slice(0, 4);
  const playoffRight = bracketState.playoff.slice(4);
  const r16Left = bracketState.r16.slice(0, 4);
  const r16Right = bracketState.r16.slice(4);
  const qfLeft = bracketState.qf.slice(0, 2);
  const qfRight = bracketState.qf.slice(2);
  const sfLeft = bracketState.sf.slice(0, 1);
  const sfRight = bracketState.sf.slice(1);

  // Safe helpers
  const safeTeamName = (id: string): string => {
    if (!id || id.startsWith("winner-")) return "Por definir";
    try { return teamName(id); } catch { return id; }
  };

  const getTeamLogoPath = (teamId: string): string => {
    if (!teamId || teamId.startsWith("PO-WINNER-") || teamId.startsWith("winner-")) {
      return '';
    }
    
    try {
      const team = teamById(teamId);
      const leagueFolderMap: Record<string, string> = {
        "laliga": "LALIGA EA SPORTS",
        "premier": "Premier League",
        "seriea": "Serie A Enilive",
        "bundesliga": "Bundesliga",
        "ligue1": "Ligue 1 McDonald's",
        "laliga2": "LALIGA HYPERMOTION",
        "championship": "EFL Championship",
        "leagueone": "EFL League One",
        "leaguetwo": "EFL League Two",
        "serieb": "Serie BKT",
        "bundesliga2": "Bundesliga 2",
        "liga3": "3. Liga",
        "ligue2": "Ligue 2 BKT",
        "ligaportugal": "Liga Portugal",
        "eredivisie": "Eredivisie",
        "scottish": "Scottish Prem",
        "austrianbundesliga": "Ö. Bundesliga",
      };
      
      const leagueFolder = leagueFolderMap[team.league] || getLeagueName(team.league);
      const teamName = team.name;
      
      const svgTeams: Record<string, string> = {
        "juv": "Juventus.svg",
      };
      
      if (svgTeams[teamId]) {
        return `/logos/${leagueFolder}/${svgTeams[teamId]}`;
      }
      
      return `/logos/${leagueFolder}/${teamName}.png`;
    } catch {
      return '';
    }
  };

  return (
    <div className="w-full min-h-screen p-8 relative overflow-hidden" style={{
      background: 'radial-gradient(ellipse at center, #1a1f3a 0%, #0a0e27 100%)',
      backgroundImage: `
        radial-gradient(circle at 20% 30%, rgba(59, 130, 246, 0.15) 0%, transparent 40%),
        radial-gradient(circle at 80% 70%, rgba(147, 51, 234, 0.15) 0%, transparent 40%),
        radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.05) 0%, transparent 60%)
      `
    }}>
      {/* Star pattern overlay */}
      <div className="absolute inset-0 opacity-5 pointer-events-none" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 5L32 25H52L36 37L42 57L30 45L18 57L24 37L8 25H28L30 5Z' fill='%23ffffff'/%3E%3C/svg%3E")`,
        backgroundSize: '60px 60px'
      }} />
      
      <div className="max-w-7xl mx-auto relative z-10">
        
        {/* Bracket with CSS connector lines */}
        <div className="flex items-center justify-between gap-6 min-h-[900px] py-8">
          
          {/* Left Block - Routes A & B */}
          <div className="flex-1 flex items-center gap-4">
            {/* Play-off */}
            <div className="flex-1 flex flex-col justify-around gap-8">
              <div className="text-center text-sm font-bold text-blue-400 uppercase tracking-wider mb-4">Play-off</div>
              {playoffLeft.map((matchup, idx) => (
                <div key={matchup.id} className="relative bracket-match-container">
                  <ImmutableMatchCard 
                    matchup={matchup} 
                    fixtures={fixtures} 
                    safeTeamName={safeTeamName} 
                    getTeamLogoPath={getTeamLogoPath} 
                  />
                  {/* CSS connector lines */}
                  {idx < 2 && <div className="bracket-connector-right" />}
                </div>
              ))}
            </div>
            
            {/* R16 */}
            <div className="flex-1 flex flex-col justify-around gap-8">
              <div className="text-center text-sm font-bold text-blue-400 uppercase tracking-wider mb-4">Octavos</div>
              {r16Left.map((matchup, idx) => (
                <div key={matchup.id} className="relative bracket-match-container">
                  <ImmutableMatchCard 
                    matchup={matchup} 
                    fixtures={fixtures} 
                    safeTeamName={safeTeamName} 
                    getTeamLogoPath={getTeamLogoPath} 
                  />
                  {idx === 0 && <div className="bracket-connector-right" />}
                </div>
              ))}
            </div>
            
            {/* QF */}
            <div className="flex-1 flex flex-col justify-around gap-8">
              <div className="text-center text-sm font-bold text-blue-400 uppercase tracking-wider mb-4">Cuartos</div>
              {qfLeft.map((matchup) => (
                <div key={matchup.id} className="relative bracket-match-container">
                  <ImmutableMatchCard 
                    matchup={matchup} 
                    fixtures={fixtures} 
                    safeTeamName={safeTeamName} 
                    getTeamLogoPath={getTeamLogoPath} 
                  />
                  <div className="bracket-connector-right" />
                </div>
              ))}
            </div>
            
            {/* SF */}
            <div className="flex-1 flex flex-col justify-center gap-8">
              <div className="text-center text-sm font-bold text-blue-400 uppercase tracking-wider mb-4">Semifinales</div>
              {sfLeft.map((matchup) => (
                <div key={matchup.id} className="relative bracket-match-container">
                  <ImmutableMatchCard 
                    matchup={matchup} 
                    fixtures={fixtures} 
                    safeTeamName={safeTeamName} 
                    getTeamLogoPath={getTeamLogoPath} 
                  />
                  <div className="bracket-connector-right-long" />
                </div>
              ))}
            </div>
          </div>

          {/* Center Block - Trophy with Finalists */}
          <div className="w-48 flex flex-col items-center justify-center gap-6">
            {/* Final Matchup */}
            {bracketState.final.homeTeam && bracketState.final.awayTeam && (
              <div className="flex items-center gap-4 mb-4">
                {/* Finalist 1 */}
                <div className="relative group">
                  {getTeamLogoPath(bracketState.final.homeTeam) ? (
                    <img 
                      src={getTeamLogoPath(bracketState.final.homeTeam)} 
                      alt={safeTeamName(bracketState.final.homeTeam)} 
                      className="w-16 h-16 object-contain"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }} 
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-white/5 border border-white/20 flex items-center justify-center">
                      <div className="text-white/30 text-xs">TBD</div>
                    </div>
                  )}
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black/90 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-20">
                    {safeTeamName(bracketState.final.homeTeam)}
                  </div>
                </div>

                {/* Trophy */}
                <div className="relative">
                  <img 
                    src="/trofeos/Champions.png" 
                    alt="Champions League Trophy" 
                    className="w-20 h-auto object-contain drop-shadow-2xl"
                    style={{ filter: 'drop-shadow(0 0 20px rgba(251, 191, 36, 0.3))' }}
                    onError={(e) => {
                      e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23fbbf24'%3E%3Cpath d='M12 2L15 8H21L16 12L18 18L12 15L6 18L8 12L3 8H9L12 2Z'/%3E%3C/svg%3E";
                    }}
                  />
                </div>

                {/* Finalist 2 */}
                <div className="relative group">
                  {getTeamLogoPath(bracketState.final.awayTeam) ? (
                    <img 
                      src={getTeamLogoPath(bracketState.final.awayTeam)} 
                      alt={safeTeamName(bracketState.final.awayTeam)} 
                      className="w-16 h-16 object-contain"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }} 
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-white/5 border border-white/20 flex items-center justify-center">
                      <div className="text-white/30 text-xs">TBD</div>
                    </div>
                  )}
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black/90 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-20">
                    {safeTeamName(bracketState.final.awayTeam)}
                  </div>
                </div>
              </div>
            )}

            {/* Final Result */}
            <div className="text-center">
              <div className="text-xs font-bold text-yellow-400 uppercase tracking-wider mb-2">Final</div>
              {(() => {
                const result = getRealMatchResult(bracketState.final, fixtures);
                return result ? (
                  <div className="inline-flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg border border-white/20">
                    <span className="text-white font-bold text-lg">{result.homeGoals}</span>
                    <span className="text-white/40">-</span>
                    <span className="text-white font-bold text-lg">{result.awayGoals}</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center bg-white/5 px-4 py-2 rounded-lg border border-white/10">
                    <span className="text-white/40 text-sm">Pendiente</span>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Right Block - Routes C & D */}
          <div className="flex-1 flex items-center gap-4">
            {/* SF */}
            <div className="flex-1 flex flex-col justify-center gap-8">
              <div className="text-center text-sm font-bold text-purple-400 uppercase tracking-wider mb-4">Semifinales</div>
              {sfRight.map((matchup) => (
                <div key={matchup.id} className="relative bracket-match-container">
                  <ImmutableMatchCard 
                    matchup={matchup} 
                    fixtures={fixtures} 
                    safeTeamName={safeTeamName} 
                    getTeamLogoPath={getTeamLogoPath} 
                  />
                  <div className="bracket-connector-left-long" />
                </div>
              ))}
            </div>
            
            {/* QF */}
            <div className="flex-1 flex flex-col justify-around gap-8">
              <div className="text-center text-sm font-bold text-purple-400 uppercase tracking-wider mb-4">Cuartos</div>
              {qfRight.map((matchup) => (
                <div key={matchup.id} className="relative bracket-match-container">
                  <ImmutableMatchCard 
                    matchup={matchup} 
                    fixtures={fixtures} 
                    safeTeamName={safeTeamName} 
                    getTeamLogoPath={getTeamLogoPath} 
                  />
                  <div className="bracket-connector-left" />
                </div>
              ))}
            </div>
            
            {/* R16 */}
            <div className="flex-1 flex flex-col justify-around gap-8">
              <div className="text-center text-sm font-bold text-purple-400 uppercase tracking-wider mb-4">Octavos</div>
              {r16Right.map((matchup, idx) => (
                <div key={matchup.id} className="relative bracket-match-container">
                  <ImmutableMatchCard 
                    matchup={matchup} 
                    fixtures={fixtures} 
                    safeTeamName={safeTeamName} 
                    getTeamLogoPath={getTeamLogoPath} 
                  />
                  {idx === 0 && <div className="bracket-connector-left" />}
                </div>
              ))}
            </div>
            
            {/* Play-off */}
            <div className="flex-1 flex flex-col justify-around gap-8">
              <div className="text-center text-sm font-bold text-purple-400 uppercase tracking-wider mb-4">Play-off</div>
              {playoffRight.map((matchup, idx) => (
                <div key={matchup.id} className="relative bracket-match-container">
                  <ImmutableMatchCard 
                    matchup={matchup} 
                    fixtures={fixtures} 
                    safeTeamName={safeTeamName} 
                    getTeamLogoPath={getTeamLogoPath} 
                  />
                  {idx < 2 && <div className="bracket-connector-left" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CSS for connector lines */}
      <style>{`
        .bracket-match-container {
          position: relative;
        }
        
        .bracket-connector-right {
          position: absolute;
          right: -16px;
          top: 50%;
          transform: translateY(-50%);
          width: 16px;
          height: 2px;
          background: rgba(59, 130, 246, 0.6);
        }
        
        .bracket-connector-right::after {
          content: '';
          position: absolute;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 8px;
          height: 8px;
          border-top: 2px solid rgba(59, 130, 246, 0.6);
          border-right: 2px solid rgba(59, 130, 246, 0.6);
          border-top-right-radius: 4px;
        }
        
        .bracket-connector-right-long {
          position: absolute;
          right: -24px;
          top: 50%;
          transform: translateY(-50%);
          width: 24px;
          height: 2px;
          background: rgba(59, 130, 246, 0.6);
        }
        
        .bracket-connector-right-long::after {
          content: '';
          position: absolute;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 8px;
          height: 8px;
          border-top: 2px solid rgba(59, 130, 246, 0.6);
          border-right: 2px solid rgba(59, 130, 246, 0.6);
          border-top-right-radius: 4px;
        }
        
        .bracket-connector-left {
          position: absolute;
          left: -16px;
          top: 50%;
          transform: translateY(-50%);
          width: 16px;
          height: 2px;
          background: rgba(147, 51, 234, 0.6);
        }
        
        .bracket-connector-left::before {
          content: '';
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 8px;
          height: 8px;
          border-top: 2px solid rgba(147, 51, 234, 0.6);
          border-left: 2px solid rgba(147, 51, 234, 0.6);
          border-top-left-radius: 4px;
        }
        
        .bracket-connector-left-long {
          position: absolute;
          left: -24px;
          top: 50%;
          transform: translateY(-50%);
          width: 24px;
          height: 2px;
          background: rgba(147, 51, 234, 0.6);
        }
        
        .bracket-connector-left-long::before {
          content: '';
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 8px;
          height: 8px;
          border-top: 2px solid rgba(147, 51, 234, 0.6);
          border-left: 2px solid rgba(147, 51, 234, 0.6);
          border-top-left-radius: 4px;
        }
      `}</style>
    </div>
  );
}

// Immutable match card component
function ImmutableMatchCard({ 
  matchup, 
  fixtures, 
  safeTeamName, 
  getTeamLogoPath,
}: { 
  matchup: BracketMatchup;
  fixtures: Fixture[];
  safeTeamName: (id: string) => string;
  getTeamLogoPath: (id: string) => string;
}) {
  const home = matchup.homeTeam;
  const away = matchup.awayTeam;
  const result = getRealMatchResult(matchup, fixtures);

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
            onError={(e) => { e.currentTarget.style.display = 'none'; }} 
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
            onError={(e) => { e.currentTarget.style.display = 'none'; }} 
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

function CompactMatchCard({ 
  slot, 
  fixtures, 
  safeTeamName, 
  getTeamLogoPath, 
  getMatchResult, 
  getRoundDate,
  isFinal = false 
}: { 
  slot: UCLBracketSlot; 
  fixtures: Fixture[];
  safeTeamName: (id: string) => string;
  getTeamLogoPath: (id: string) => string;
  getMatchResult: (slot: UCLBracketSlot) => { homeGoals: number; awayGoals: number; winner: string } | null;
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
            onError={(e) => { e.currentTarget.style.display = 'none'; }} 
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
            onError={(e) => { e.currentTarget.style.display = 'none'; }} 
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
  isFinal = false
}: {
  slot: UCLBracketSlot;
  fixtures: Fixture[];
  safeTeamName: (id: string) => string;
  getTeamLogoPath: (id: string) => string;
  getMatchResult: (slot: UCLBracketSlot) => { homeGoals: number; awayGoals: number; winner: string; extraTime?: boolean; penalties?: { homeGoals: number; awayGoals: number } } | null;
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
        <div className="px-3 py-1 bg-[#0f172a] text-gray-400 text-xs text-center">
          {date}
        </div>
      )}

      {/* Teams */}
      <div className="p-2">
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2">
            {homeLogoPath ? (
              <img src={homeLogoPath} alt={safeTeamName(home)} className="w-6 h-6 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
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
              <img src={awayLogoPath} alt={safeTeamName(away)} className="w-6 h-6 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
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

function ResultsListView({ fixtures, safeTeamName, getTeamLogoPath }: { 
  fixtures: Fixture[];
  safeTeamName: (id: string) => string;
  getTeamLogoPath: (id: string) => string;
}) {
  // Group fixtures by tie (same teams in both legs)
  const ties = new Map<string, Fixture[]>();
  
  for (const f of fixtures) {
    const key = [f.homeId, f.awayId].sort().join('-');
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
    if (round.includes("SF")) return "Semifinales";
    if (round === "Final") return "Final";
    return round;
  };

  const getAggregateScore = (leg1: Fixture, leg2: Fixture): { home: number; away: number } => {
    const h1 = leg1.result?.homeGoals || 0;
    const a1 = leg1.result?.awayGoals || 0;
    const h2 = leg2.result?.homeGoals || 0;
    const a2 = leg2.result?.awayGoals || 0;
    
    // Aggregate: leg1.home + leg2.away (team from leg1 home)
    const aggHome = h1 + a2;
    const aggAway = a1 + h2;
    
    return { home: aggHome, away: aggAway };
  };

  const formatDate = (matchday: number): string => {
    // Simple date formatting based on matchday
    const baseDate = new Date(2026, 2, 1); // March 2026
    baseDate.setDate(baseDate.getDate() + matchday);
    return baseDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
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
            
            const aggregate = leg1.result && leg2.result 
              ? getAggregateScore(leg1, leg2) 
              : null;

            const homeLogo1 = getTeamLogoPath(leg1.homeId);
            const awayLogo1 = getTeamLogoPath(leg1.awayId);
            const homeLogo2 = leg2 ? getTeamLogoPath(leg2.homeId) : '';
            const awayLogo2 = leg2 ? getTeamLogoPath(leg2.awayId) : '';

            return (
              <div key={idx} className="bg-[#0b0f19] rounded-xl border border-gray-800 overflow-hidden">
                {/* Aggregate Score Row */}
                {aggregate && (
                  <div className="bg-[#1a1f2e] px-4 py-3 border-b border-gray-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {homeLogo1 ? (
                          <img src={homeLogo1} alt={safeTeamName(leg1.homeId)} className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        ) : (
                          <TeamBadge teamId={leg1.homeId} size={20} />
                        )}
                        <span className="text-white text-sm font-medium">{safeTeamName(leg1.homeId)}</span>
                      </div>
                      <div className="text-cyan-400 text-lg font-bold">
                        {aggregate.home} - {aggregate.away}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-medium">{safeTeamName(leg1.awayId)}</span>
                        {awayLogo1 ? (
                          <img src={awayLogo1} alt={safeTeamName(leg1.awayId)} className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
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
                    <div className="w-12 h-5 bg-gray-700 rounded flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold">FIN</span>
                    </div>
                    <div className="flex-1 flex flex-col items-center">
                      <span className="text-gray-400 text-xs mb-1">{roundLabel}</span>
                      <div className="flex items-center justify-between w-full max-w-xs">
                        <div className="flex items-center gap-2">
                          {homeLogo1 ? (
                            <img src={homeLogo1} alt={safeTeamName(leg1.homeId)} className="w-4 h-4 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                          ) : (
                            <TeamBadge teamId={leg1.homeId} size={16} />
                          )}
                          <span className="text-gray-300 text-xs">{safeTeamName(leg1.homeId)}</span>
                        </div>
                        <span className="text-white text-sm font-bold whitespace-nowrap">
                          {leg1.result ? (() => {
                            const { homeGoals, awayGoals, extraTime, penalties } = leg1.result;
                            if (penalties) {
                              const totalHome = homeGoals + (extraTime?.homeGoals || 0);
                              const totalAway = awayGoals + (extraTime?.awayGoals || 0);
                              return `${totalHome} (${penalties.homeGoals}) - (${penalties.awayGoals}) ${totalAway}`;
                            } else if (extraTime) {
                              const totalHome = homeGoals + extraTime.homeGoals;
                              const totalAway = awayGoals + extraTime.awayGoals;
                              if (totalHome !== totalAway) {
                                return `${totalHome} - ${totalAway} (prórroga)`;
                              }
                              return `${totalHome} - ${totalAway}`;
                            }
                            return `${homeGoals} - ${awayGoals}`;
                          })() : ' - '}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-300 text-xs">{safeTeamName(leg1.awayId)}</span>
                          {awayLogo1 ? (
                            <img src={awayLogo1} alt={safeTeamName(leg1.awayId)} className="w-4 h-4 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                          ) : (
                            <TeamBadge teamId={leg1.awayId} size={16} />
                          )}
                        </div>
                      </div>
                      <span className="text-gray-500 text-[10px] mt-1">{formatDate(leg1.matchday)}</span>
                    </div>
                    <div className="w-12"></div>
                  </div>
                </div>

                {/* Leg 2 */}
                {leg2 && (
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="w-12 h-5 bg-gray-700 rounded flex items-center justify-center">
                        <span className="text-white text-[10px] font-bold">FIN</span>
                      </div>
                      <div className="flex-1 flex flex-col items-center">
                        <span className="text-gray-400 text-xs mb-1">{roundLabel}</span>
                        <div className="flex items-center justify-between w-full max-w-xs">
                          <div className="flex items-center gap-2">
                            {homeLogo2 ? (
                              <img src={homeLogo2} alt={safeTeamName(leg2.homeId)} className="w-4 h-4 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            ) : (
                              <TeamBadge teamId={leg2.homeId} size={16} />
                            )}
                            <span className="text-gray-300 text-xs">{safeTeamName(leg2.homeId)}</span>
                          </div>
                          <span className="text-white text-sm font-bold whitespace-nowrap">
                            {leg2.result ? (() => {
                              const { homeGoals, awayGoals, extraTime, penalties } = leg2.result;
                              if (penalties) {
                                const totalHome = homeGoals + (extraTime?.homeGoals || 0);
                                const totalAway = awayGoals + (extraTime?.awayGoals || 0);
                                return `${totalHome} (${penalties.homeGoals}) - (${penalties.awayGoals}) ${totalAway}`;
                              } else if (extraTime) {
                                const totalHome = homeGoals + extraTime.homeGoals;
                                const totalAway = awayGoals + extraTime.awayGoals;
                                if (totalHome !== totalAway) {
                                  return `${totalHome} - ${totalAway} (prórroga)`;
                                }
                                return `${totalHome} - ${totalAway}`;
                              }
                              return `${homeGoals} - ${awayGoals}`;
                            })() : ' - '}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-300 text-xs">{safeTeamName(leg2.awayId)}</span>
                            {awayLogo2 ? (
                              <img src={awayLogo2} alt={safeTeamName(leg2.awayId)} className="w-4 h-4 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            ) : (
                              <TeamBadge teamId={leg2.awayId} size={16} />
                            )}
                          </div>
                        </div>
                        <span className="text-gray-500 text-[10px] mt-1">{formatDate(leg2.matchday)}</span>
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

  const currentDate = usePlayersStore((s) => s.currentDate);

  useEffect(() => {
    const raw = loadSave();
    if (!raw?.ucl?.drawState.leagueDone) {
      setSave(raw);
      return;
    }
    const offset = uclDayOffset(currentDate);
    const synced = simulatePendingUCLThroughDay(raw, offset, raw.myTeamId);
    saveSave(synced);
    setSave(synced);
  }, [currentDate]);

  if (!save) {
    return <div className="p-6 text-muted-foreground">Cargando...</div>;
  }

  const ucl = save.ucl;
  const fixtures = save.uclFixtures ?? [];

  if (!ucl || !ucl.phase || !ucl.participants) {
    return (
      <div className="p-6 text-center space-y-2">
        <div className="text-4xl">🏆</div>
        <h2 className="text-xl font-bold">Champions League</h2>
        <p className="text-muted-foreground">La Champions League comenzará el 3 de julio con el sorteo de la fase de liga.</p>
      </div>
    );
  }

  const showBracket = (ucl.bracket?.length ?? 0) > 0;
  const isKnockoutPhase = ["playoff", "r16", "qf", "sf", "final", "done"].includes(ucl.phase);
  const displayTable = ucl.leaguePhaseTable ?? ucl.table ?? [];

  // Group fixtures by round, sorted by matchday offset
  const leagueFixtures = fixtures.filter(f => f.round?.startsWith("Jornada") && f.matchday > 0);
  const otherFixtures = fixtures.filter(f => f.round && !f.round.startsWith("Jornada") && f.matchday > 0);

  // Sort jornadas by matchday offset
  const jornadas = [...new Map<string, { matchday: number; fixtures: Fixture[] }>(
    leagueFixtures.reduce((acc, f) => {
      const r = f.round ?? "Sin ronda";
      if (!acc.has(r)) acc.set(r, { matchday: f.matchday, fixtures: [] });
      acc.get(r)!.fixtures.push(f);
      return acc;
    }, new Map<string, { matchday: number; fixtures: Fixture[] }>())
  ).entries()].sort((a, b) => a[1].matchday - b[1].matchday);

  const roundNames = jornadas.map(([r]) => r);
  const activeRound = selectedRound ?? roundNames[0] ?? null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-950 to-indigo-950 border-b border-border px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="text-3xl">🏆</div>
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
        {(["tabla", "partidos", ...(showBracket ? ["bracket"] : [])] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t === "tabla" ? "Tabla" : t === "partidos" ? "Partidos" : "Cuadro"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4">
        {tab === "tabla" && (
          <TableView table={displayTable} userTeamId={save.myTeamId} fixtures={fixtures} />
        )}

        {tab === "partidos" && (() => {
          // Build phase buckets
          const playoffFx = fixtures.filter(f => f.round?.startsWith("Playoff") && f.matchday > 0);
          const r16Fx = fixtures.filter(f => f.round?.startsWith("R16") && f.matchday > 0);
          const qfFx  = fixtures.filter(f => f.round?.startsWith("QF") && f.matchday > 0);
          const sfFx  = fixtures.filter(f => f.round?.startsWith("SF") && f.matchday > 0);
          const finalFx = fixtures.filter(f => f.round === "Final" && f.matchday > 0);

          const maxUnlockedTab = uclPhaseToMaxTab(ucl.phase, ucl.drawState.playoffDone);
          const maxUnlockedIdx = PHASE_TAB_ORDER.indexOf(maxUnlockedTab);

          const phaseBuckets: { key: PhaseTab; label: string; fxs: Fixture[] }[] = [
            { key: "liga",    label: "Fase de Liga",  fxs: leagueFixtures },
            { key: "playoff", label: "Play-offs",     fxs: playoffFx },
            { key: "r16",     label: "Octavos",       fxs: r16Fx },
            { key: "qf",      label: "Cuartos",       fxs: qfFx },
            { key: "sf",      label: "Semifinales",   fxs: sfFx },
            { key: "final",   label: "Final",         fxs: finalFx },
          ].filter(b => {
            if (b.fxs.length === 0) return false;
            const idx = PHASE_TAB_ORDER.indexOf(b.key);
            if (idx > maxUnlockedIdx) return false;
            if (b.key === "playoff" && !ucl.drawState.playoffDone) return false;
            return true;
          });

          const activePhase = phaseBuckets.find(b => b.key === phaseTab) ?? phaseBuckets[phaseBuckets.length - 1];

          return (
            <div className="space-y-3">
              {/* Phase sub-tabs */}
              {phaseBuckets.length > 1 && (
                <div className="flex gap-1 flex-wrap border-b border-border/50 pb-2">
                  {phaseBuckets.map(b => {
                    const locked = PHASE_TAB_ORDER.indexOf(b.key) > maxUnlockedIdx;
                    return (
                    <button
                      key={b.key}
                      disabled={locked}
                      onClick={() => { if (!locked) { setPhaseTab(b.key); setSelectedRound(null); } }}
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

              {activePhase && (() => {
                if (activePhase.key === "liga") {
                  // Jornada selector
                  return (
                    <div className="space-y-3">
                      {roundNames.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {roundNames.map(r => {
                            const info = jornadas.find(([name]) => name === r);
                            const md = info ? info[1].matchday : 0;
                            const hasUser = info ? info[1].fixtures.some(f => f.homeId === save.myTeamId || f.awayId === save.myTeamId) : false;
                            return (
                              <button
                                key={r}
                                onClick={() => setSelectedRound(r)}
                                className={`px-3 py-1 rounded text-xs font-medium transition-colors relative ${
                                  activeRound === r ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
                                }`}
                              >
                                {r}
                                <span className="ml-1 text-[0.6rem] opacity-70">{uclFixtureDate(md)}</span>
                                {hasUser && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-400" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {activeRound && (() => {
                        const info = jornadas.find(([r]) => r === activeRound);
                        if (!info) return null;
                        const [, { matchday, fixtures: fxs }] = info;
                        const played = fxs.filter(f => f.result).length;
                        return (
                          <div className="rounded-lg border border-border overflow-hidden">
                            <div className="bg-blue-950/60 px-4 py-2.5 flex items-center justify-between">
                              <div>
                                <span className="text-sm font-bold text-blue-200">{activeRound}</span>
                                <span className="ml-2 text-xs text-blue-400">{uclFixtureDate(matchday)}</span>
                              </div>
                              <span className="text-xs text-blue-400">{played}/{fxs.length} jugados</span>
                            </div>
                            <div className="divide-y divide-border">
                              {fxs
                                .sort((a, b) => {
                                  const aUser = a.homeId === save.myTeamId || a.awayId === save.myTeamId;
                                  const bUser = b.homeId === save.myTeamId || b.awayId === save.myTeamId;
                                  return aUser === bUser ? 0 : aUser ? -1 : 1;
                                })
                                .map(f => <FixtureRow key={f.id} f={f} myTeamId={save.myTeamId} />)}
                            </div>
                          </div>
                        );
                      })()}
                      {leagueFixtures.length === 0 && (
                        <p className="text-muted-foreground text-sm text-center py-8">Los partidos aparecerán aquí tras el sorteo de la fase de liga.</p>
                      )}
                    </div>
                  );
                }

                // Knockout phase: group by Leg1 / Leg2 (or just list for Final)
                const byRound = [...new Map(
                  activePhase.fxs.reduce((acc, f) => {
                    const r = f.round ?? "";
                    if (!acc.has(r)) acc.set(r, { matchday: f.matchday, fxs: [] as Fixture[] });
                    acc.get(r)!.fxs.push(f);
                    return acc;
                  }, new Map<string, { matchday: number; fxs: Fixture[] }>())
                ).entries()].sort((a, b) => a[1].matchday - b[1].matchday);

                const roundLabel: Record<string, string> = {
                  "Playoff-Leg1": "Ida", "Playoff-Leg2": "Vuelta",
                  "R16-Leg1": "Ida", "R16-Leg2": "Vuelta",
                  "QF-Leg1": "Ida",  "QF-Leg2": "Vuelta",
                  "SF-Leg1": "Ida",  "SF-Leg2": "Vuelta",
                  "Final": "Final",
                };

                return (
                  <div className="space-y-3">
                    {byRound.map(([r, { matchday, fxs }]) => (
                      <div key={r} className="rounded-lg border border-border overflow-hidden">
                        <div className="bg-blue-950/60 px-4 py-2.5 flex items-center justify-between">
                          <div>
                            <span className="text-sm font-bold text-blue-200">{roundLabel[r] ?? r}</span>
                            <span className="ml-2 text-xs text-blue-400">{uclFixtureDate(matchday)}</span>
                          </div>
                          <span className="text-xs text-blue-400">{fxs.filter(f => f.result).length}/{fxs.length} jugados</span>
                        </div>
                        <div className="divide-y divide-border">
                          {fxs
                            .sort((a, b) => {
                              const aU = a.homeId === save.myTeamId || a.awayId === save.myTeamId;
                              const bU = b.homeId === save.myTeamId || b.awayId === save.myTeamId;
                              return aU === bU ? 0 : aU ? -1 : 1;
                            })
                            .map(f => <FixtureRow key={f.id} f={f} myTeamId={save.myTeamId} />)}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {tab === "bracket" && (
          <BracketView bracket={ucl.bracket ?? []} fixtures={fixtures} />
        )}
      </div>
    </div>
  );
}
