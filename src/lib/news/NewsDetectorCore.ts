import type { NewsEvent } from "./NewsEvents";

export interface CoreFixture {
  id: string;
  date?: string;
  matchday: number;
  competition: string;
  league: string;
  round?: string;
  homeId: string;
  awayId: string;
  result?: {
    homeGoals: number;
    awayGoals: number;
    events?: Array<{
      minute: number;
      team: "home" | "away";
      type: string;
      scorerId: string;
      scorerName: string;
    }>;
    injuries?: Array<{
      playerId: string;
      playerName: string;
      durationDays?: number;
      injuryType?: string;
      bodyPart?: string;
      minute?: number;
    }>;
    cards?: Array<{
      minute: number;
      playerId: string;
      playerName: string;
      cardType: "yellow" | "red";
      isSecondYellow: boolean;
    }>;
  };
  europeanCompetition?: string;
}

export interface CoreStanding {
  teamId: string;
  played: number;
  points: number;
  gd: number;
}

export interface CoreTeamStrength {
  value: number;
}

function matchDate(fixture: CoreFixture, fallback: string): string {
  return fixture.date ?? fallback;
}

function teamResultLabel(fixture: CoreFixture): string {
  return `${fixture.result?.homeGoals ?? 0}-${fixture.result?.awayGoals ?? 0}`;
}

function scorerCounts(fixture: CoreFixture): Map<string, { name: string; goals: number; minutes: number[] }> {
  const result = new Map<string, { name: string; goals: number; minutes: number[] }>();
  for (const event of fixture.result?.events ?? []) {
    if (!["goal", "penalty_goal", "free_kick_goal"].includes(event.type)) continue;
    const current = result.get(event.scorerId) ?? { name: event.scorerName, goals: 0, minutes: [] };
    current.goals += 1;
    current.minutes.push(event.minute);
    result.set(event.scorerId, current);
  }
  return result;
}

export function detectFixtureFacts(
  fixture: CoreFixture,
  date: string,
  previousStandings?: Record<string, CoreStanding[]>,
  currentStandings?: Record<string, CoreStanding[]>,
  teamStrength?: (teamId: string) => CoreTeamStrength | undefined,
  userTeamId?: string,
): NewsEvent[] {
  if (!fixture.result) return [];
  const facts: NewsEvent[] = [];
  const homeGoals = fixture.result.homeGoals;
  const awayGoals = fixture.result.awayGoals;
  const totalGoals = homeGoals + awayGoals;
  const events = fixture.result.events ?? [];
  const scorers = scorerCounts(fixture);
  const winner = homeGoals === awayGoals ? null : homeGoals > awayGoals ? fixture.homeId : fixture.awayId;

  const regularGoalMinutes = events
    .filter((event) => ["goal", "penalty_goal", "free_kick_goal"].includes(event.type))
    .map((event) => event.minute)
    .sort((a, b) => a - b);
  const comeback = (() => {
    if (!winner) return false;
    let h = 0;
    let a = 0;
    let hadWinnerBehind = false;
    for (const event of events.sort((a, b) => a.minute - b.minute)) {
      if (!["goal", "penalty_goal", "free_kick_goal", "own_goal"].includes(event.type)) continue;
      if (event.team === "home") h += 1;
      else a += 1;
      if ((winner === fixture.homeId && a > h) || (winner === fixture.awayId && h > a)) {
        hadWinnerBehind = true;
      }
    }
    return hadWinnerBehind;
  })();

  const decisiveMinute = regularGoalMinutes.at(-1);
  const strengthGap = teamStrength
    ? Math.abs((teamStrength(fixture.homeId)?.value ?? 0) - (teamStrength(fixture.awayId)?.value ?? 0))
    : 0;
  const favoriteLost = winner !== null && strengthGap >= 12
    ? (teamStrength(fixture.homeId)?.value ?? 0) > (teamStrength(fixture.awayId)?.value ?? 0)
      ? winner === fixture.awayId
      : winner === fixture.homeId
    : false;

  const base: NewsEvent = {
    id: `match:${fixture.id}`,
    date: matchDate(fixture, date),
    type: "match",
    category: fixture.europeanCompetition ? "europa" : fixture.competition === "cup" ? "liga" : "liga",
    relevance: Math.min(100, 25 + totalGoals * 5 + (comeback ? 15 : 0) + (favoriteLost ? 18 : 0) + (userTeamId && (fixture.homeId === userTeamId || fixture.awayId === userTeamId) ? 18 : 0)),
    entities: {
      teamIds: [fixture.homeId, fixture.awayId],
      competitionId: fixture.europeanCompetition,
      leagueId: fixture.league,
    },
    data: {
      homeId: fixture.homeId,
      awayId: fixture.awayId,
      homeGoals,
      awayGoals,
      result: teamResultLabel(fixture),
      goalMinutes: regularGoalMinutes,
      scorerNames: Array.from(scorers.values()).map((entry) => entry.name),
      decisiveMinute,
      matchday: fixture.matchday,
      round: fixture.round,
      competition: fixture.europeanCompetition ?? fixture.competition,
      isComeback: comeback,
      isBigWin: Math.abs(homeGoals - awayGoals) >= 4,
      totalGoals,
      cleanSheet: homeGoals === 0 || awayGoals === 0,
      cleanSheetTeamId: homeGoals === 0 && awayGoals > 0 ? fixture.awayId : awayGoals === 0 && homeGoals > 0 ? fixture.homeId : undefined,
      teamStrengthGap: strengthGap,
      surprise: favoriteLost,
    },
  };

  if (userTeamId && (fixture.homeId === userTeamId || fixture.awayId === userTeamId)) {
    base.relevance += 10;
  }
  facts.push(base);

  for (const [playerId, scorer] of scorers.entries()) {
    if (scorer.goals < 3) continue;
    facts.push({
      id: `player-achievement:${fixture.id}:${playerId}:${scorer.goals}`,
      date: matchDate(fixture, date),
      type: "player_achievement",
      category: "jugadores",
      relevance: Math.min(100, 55 + scorer.goals * 7 + (userTeamId && (fixture.homeId === userTeamId || fixture.awayId === userTeamId) ? 12 : 0)),
      entities: {
        teamIds: [fixture.homeId, fixture.awayId],
        playerIds: [playerId],
        leagueId: fixture.league,
        competitionId: fixture.europeanCompetition,
      },
      data: {
        homeId: fixture.homeId,
        awayId: fixture.awayId,
        result: teamResultLabel(fixture),
        scorerNames: [scorer.name],
        playerGoalCount: scorer.goals,
        hatTrick: scorer.goals === 3,
        poker: scorer.goals >= 4,
        goalMinutes: scorer.minutes,
        decisiveMinute,
      },
    });
  }

  for (const injury of fixture.result.injuries ?? []) {
    facts.push({
      id: `injury:${fixture.id}:${injury.playerId}:${injury.minute ?? "x"}`,
      date: matchDate(fixture, date),
      type: "injury",
      category: "jugadores",
      relevance: Math.min(100, 45 + Math.min(30, (injury.durationDays ?? 0) / 4)),
      entities: { teamIds: [fixture.homeId, fixture.awayId], playerIds: [injury.playerId], leagueId: fixture.league },
      data: {
        homeId: fixture.homeId,
        awayId: fixture.awayId,
        scorerNames: [injury.playerName],
        durationDays: injury.durationDays,
        injuryType: injury.injuryType,
        bodyPart: injury.bodyPart,
      },
    });
  }

  for (const card of fixture.result.cards ?? []) {
    if (card.cardType !== "red" && !card.isSecondYellow) continue;
    facts.push({
      id: `suspension:${fixture.id}:${card.playerId}:${card.minute}`,
      date: matchDate(fixture, date),
      type: "suspension",
      category: "jugadores",
      relevance: 52,
      entities: { teamIds: [fixture.homeId, fixture.awayId], playerIds: [card.playerId], leagueId: fixture.league },
      data: {
        homeId: fixture.homeId,
        awayId: fixture.awayId,
        scorerNames: [card.playerName],
        cardType: card.isSecondYellow ? "second-yellow" : "red",
        suspensionMatches: card.isSecondYellow ? 1 : undefined,
      },
    });
  }


  return facts;
}

export function detectStandingsFacts(
  previousStandings: Record<string, CoreStanding[]>,
  currentStandings: Record<string, CoreStanding[]>,
  date: string,
  userTeamId?: string,
): NewsEvent[] {
  const facts: NewsEvent[] = [];
  for (const [leagueId, currentRows] of Object.entries(currentStandings)) {
    const current = [...currentRows].sort((a, b) => b.points - a.points || b.gd - a.gd);
    const previous = [...(previousStandings[leagueId] ?? [])];
    if (current.length === 0 || previous.length === 0) continue;

    const previousPosition = new Map(previous.map((row, index) => [row.teamId, index + 1]));
    const currentPosition = new Map(current.map((row, index) => [row.teamId, index + 1]));
    const previousLeader = previous[0]?.teamId;
    const currentLeader = current[0]?.teamId;
    const leaderChanged = Boolean(previousLeader && currentLeader && previousLeader !== currentLeader);

    if (leaderChanged) {
      const runnerUp = current[1];
      facts.push({
        id: `leader-change:${leagueId}:${previousLeader}:${currentLeader}:${current[0]?.points ?? 0}`,
        date,
        type: "standings_change",
        category: ["ucl", "uel", "uecl"].includes(leagueId) ? "europa" : "liga",
        relevance: Math.min(100, 82 + (userTeamId && currentLeader === userTeamId ? 12 : 0)),
        entities: { teamIds: [currentLeader!, previousLeader!], leagueId },
        data: {
          teamId: currentLeader,
          previousLeaderId: previousLeader,
          newLeaderId: currentLeader,
          previousPosition: previousPosition.get(currentLeader),
          newPosition: currentPosition.get(currentLeader),
          leaderGap: runnerUp ? current[0].points - runnerUp.points : undefined,
          directRivalId: previousLeader,
        },
      });
      continue;
    }

    if (userTeamId) {
      const from = previousPosition.get(userTeamId);
      const to = currentPosition.get(userTeamId);
      if (from != null && to != null && Math.abs(from - to) >= 3) {
        const currentRow = current.find((row) => row.teamId === userTeamId);
        const leader = current[0];
        facts.push({
          id: `position-change:${leagueId}:${userTeamId}:${to}:${currentRow?.points ?? 0}`,
          date,
          type: "standings_change",
          category: "club" ,
          relevance: Math.min(100, 62 + Math.min(24, Math.abs(from - to) * 5)),
          entities: { teamIds: [userTeamId], leagueId },
          data: {
            teamId: userTeamId,
            previousPosition: from,
            newPosition: to,
            leaderGap: currentRow && leader ? leader.points - currentRow.points : undefined,
          },
        });
      }
    }
  }
  return facts;
}

export function snapshotStandings(standings: Record<string, CoreStanding[]>): Record<string, Array<{ teamId: string; position: number; points: number; gd: number }>> {
  const snapshot: Record<string, Array<{ teamId: string; position: number; points: number; gd: number }>> = {};
  for (const [leagueId, rows] of Object.entries(standings)) {
    const active = rows.filter((row) => row.played > 0 || row.points !== 0 || row.gd !== 0);
    if (active.length === 0) continue;
    const sorted = [...active].sort((a, b) => b.points - a.points || b.gd - a.gd);
    snapshot[leagueId] = sorted.map((row, index) => ({ teamId: row.teamId, position: index + 1, points: row.points, gd: row.gd }));
  }
  return snapshot;
}
