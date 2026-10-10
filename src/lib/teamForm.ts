import type { Fixture } from "@/lib/season";
import type { SaveGame } from "@/lib/store";

export type TeamFormResult = "W" | "D" | "L";

type SaveWithFixtures = Pick<SaveGame, "fixtures" | "cupFixtures" | "uclFixtures" | "uelFixtures" | "ueclFixtures">;

/** Collect played fixtures from every competition, deduplicated by fixture id. */
export function getAllPlayedFixtures(save: SaveWithFixtures | null | undefined): Fixture[] {
  if (!save) return [];
  const leagueFixtures = Object.values(save.fixtures ?? {}).flatMap((value) =>
    Array.isArray(value) ? value : [],
  );
  const cupFixtures = Object.values(save.cupFixtures ?? {}).flatMap((value) =>
    Array.isArray(value) ? value : [],
  );
  const all = [
    ...leagueFixtures,
    ...cupFixtures,
    ...(Array.isArray(save.uclFixtures) ? save.uclFixtures : []),
    ...(Array.isArray(save.uelFixtures) ? save.uelFixtures : []),
    ...(Array.isArray(save.ueclFixtures) ? save.ueclFixtures : []),
  ];
  const unique = new Map<string, Fixture>();
  for (const fixture of all) {
    if (fixture?.id && fixture.result) unique.set(fixture.id, fixture);
  }
  return [...unique.values()];
}

function playedDate(fixture: Fixture): string {
  if (typeof fixture.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(fixture.date)) {
    return fixture.date.slice(0, 10);
  }
  // Legacy fixtures may lack a date; use the competition round as a stable fallback.
  return `0000-00-${String(Math.max(0, fixture.matchday ?? 0)).padStart(2, "0")}`;
}

function teamResult(fixture: Fixture, teamId: string): TeamFormResult {
  const result = fixture.result!;
  let homeGoals = Number(result.homeGoals ?? 0) + Number(result.extraTime?.homeGoals ?? 0);
  let awayGoals = Number(result.awayGoals ?? 0) + Number(result.extraTime?.awayGoals ?? 0);

  if (result.penalties && homeGoals === awayGoals) {
    homeGoals = Number(result.penalties.homeGoals ?? 0);
    awayGoals = Number(result.penalties.awayGoals ?? 0);
  }

  const goalsFor = fixture.homeId === teamId ? homeGoals : awayGoals;
  const goalsAgainst = fixture.homeId === teamId ? awayGoals : homeGoals;
  return goalsFor > goalsAgainst ? "W" : goalsFor < goalsAgainst ? "L" : "D";
}

/** Build form for all teams in one pass, keeping the table rendering inexpensive. */
export function getTeamForms(
  save: SaveWithFixtures | null | undefined,
  n = 5,
): Map<string, TeamFormResult[]> {
  const limit = Math.max(0, Math.floor(n));
  const byTeam = new Map<string, TeamFormResult[]>();
  if (!save || limit === 0) return byTeam;

  const played = getAllPlayedFixtures(save).sort(
    (a, b) => playedDate(b).localeCompare(playedDate(a)) || b.matchday - a.matchday,
  );
  for (const fixture of played) {
    for (const teamId of [fixture.homeId, fixture.awayId]) {
      const form = byTeam.get(teamId) ?? [];
      if (form.length >= limit) continue;
      form.push(teamResult(fixture, teamId));
      byTeam.set(teamId, form);
    }
  }
  for (const [teamId, form] of byTeam) byTeam.set(teamId, form.reverse());
  return byTeam;
}

/** Last n results for a team across league, domestic cup and all European competitions. */
export function getTeamForm(
  save: SaveWithFixtures | null | undefined,
  teamId: string,
  n = 5,
): TeamFormResult[] {
  return teamId ? (getTeamForms(save, n).get(teamId) ?? []) : [];
}

export type FormCompetition = "league" | "cup" | "ucl" | "uel" | "uecl";

/** Últimos resultados limitados a una competición concreta. */
export function getTeamFormsForCompetition(
  save: SaveWithFixtures | null | undefined,
  n = 5,
  competition: FormCompetition,
): Map<string, TeamFormResult[]> {
  if (!save) return new Map();
  const all = getAllPlayedFixtures(save);
  const matching = all.filter((fixture: any) => {
    const european = fixture.europeanCompetition;
    if (competition === "league") return fixture.competition === "league" && !european;
    if (competition === "cup") return fixture.competition === "cup" && !european;
    if (competition === "ucl") return european === "ucl" || (fixture.competition === "ucl" && !european);
    return european === competition;
  });
  const limit = Math.max(0, Math.floor(n));
  const byTeam = new Map<string, TeamFormResult[]>();
  if (limit === 0) return byTeam;
  matching.sort((a, b) => playedDate(b).localeCompare(playedDate(a)) || b.matchday - a.matchday);
  for (const fixture of matching) {
    for (const teamId of [fixture.homeId, fixture.awayId]) {
      const form = byTeam.get(teamId) ?? [];
      if (form.length < limit) {
        form.push(teamResult(fixture, teamId));
        byTeam.set(teamId, form);
      }
    }
  }
  for (const [teamId, form] of byTeam) byTeam.set(teamId, form.reverse());
  return byTeam;
}
