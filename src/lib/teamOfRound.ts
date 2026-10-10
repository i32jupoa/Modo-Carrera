import type { SaveGame } from "@/lib/store";
import type { Fixture } from "@/lib/season";
import type { ElevenSlot } from "@/lib/teamProfile";
import { formationSlots } from "@/lib/teamProfile";
import { LEAGUES } from "@/data/teams";
import { getAllPlayedFixtures } from "@/lib/teamForm";
import { usePlayersStore, type FcPlayer } from "@/store/playersStore";
import { buildPositions, positionGroupFromCode, type PosCode } from "@/lib/positions";

export type TeamOfRoundCategory = "liga" | "copa" | "ucl" | "uel" | "uecl";

export interface TeamOfRoundData {
  id: string;
  title: string;
  competitionLabel: string;
  roundLabel: string;
  dateLabel: string;
  category: TeamOfRoundCategory;
  formation: string;
  eleven: ElevenSlot[];
  teamIds: string[];
  playerOfRound: { player: FcPlayer; teamId: string; rating: number } | null;
}

type Candidate = { player: FcPlayer; teamId: string; ratingTotal: number; appearances: number };
type PositionGroup = "GK" | "DEF" | "MID" | "FWD";
const FORMATION = "Táctica 4-3-3";

function dateKey(date?: string, matchday = 0): string {
  if (date && /^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10);
  return `0000-00-${String(Math.max(0, matchday)).padStart(2, "0")}`;
}

function groupFor(candidate: Candidate): PositionGroup {
  const positions = buildPositions(candidate.player.Position, candidate.player["Alternative positions"]);
  return positionGroupFromCode((positions[0] ?? "MC") as PosCode);
}

function competitionKey(fixture: Fixture): string {
  if (fixture.europeanCompetition) return fixture.europeanCompetition;
  if (fixture.competition === "league") return `league:${fixture.league}`;
  if (fixture.competition === "cup") return `cup:${fixture.league}`;
  return String(fixture.competition ?? "other");
}

function roundKey(fixture: Fixture): string {
  if (fixture.competition === "league" && !fixture.europeanCompetition) return `md:${fixture.matchday}`;
  return `round:${fixture.round ?? fixture.matchday}`;
}

function competitionLabel(fixture: Fixture): string {
  if (fixture.europeanCompetition === "ucl" || fixture.competition === "ucl") return "Champions League";
  if (fixture.europeanCompetition === "uel") return "Europa League";
  if (fixture.europeanCompetition === "uecl") return "Conference League";
  if (fixture.competition === "cup") return "Copa nacional";
  return (LEAGUES as Record<string, { name?: string }>)[fixture.league]?.name ?? String(fixture.league);
}

function categoryFor(fixture: Fixture): TeamOfRoundCategory {
  if (fixture.europeanCompetition === "ucl" || fixture.competition === "ucl") return "ucl";
  if (fixture.europeanCompetition === "uel") return "uel";
  if (fixture.europeanCompetition === "uecl") return "uecl";
  if (fixture.competition === "cup") return "copa";
  return "liga";
}

function roundLabelFor(fixture: Fixture): string {
  if (fixture.competition === "league" && !fixture.europeanCompetition) return `Jornada ${fixture.matchday}`;
  const raw = String(fixture.round ?? "");
  const leg = /-Leg([12])$/i.exec(raw)?.[1];
  const prefix = raw.replace(/-Leg[12]$/i, "");
  const names: Record<string, string> = {
    Playoff: "Play-off", R32: "Dieciseisavos", R16: "Octavos", Octavos: "Octavos",
    QF: "Cuartos de final", SF: "Semifinal", Final: "Final",
  };
  const md = /^md(\d+)$/i.exec(raw);
  if (md) return `Jornada ${md[1]}`;
  const label = names[prefix] ?? (prefix.replace(/[-_]/g, " ") || `Jornada ${fixture.matchday}`);
  if (leg) return `${label} · ${leg === "1" ? "ida" : "vuelta"}`;
  return label;
}

function formatDateLabel(date?: string): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return "Última jornada disputada";
  const parsed = new Date(`${date.slice(0, 10)}T12:00:00`);
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" })
    .format(parsed).replace(/\./g, "").toUpperCase();
}

function fixtureSortLatest(a: Fixture, b: Fixture): number {
  return dateKey(b.date, b.matchday).localeCompare(dateKey(a.date, a.matchday)) ||
    b.matchday - a.matchday || String(b.id).localeCompare(String(a.id));
}

function buildForRound(
  rawPlayers: FcPlayer[],
  allPlayed: Fixture[],
  latestFixture: Fixture,
): TeamOfRoundData | null {
  const targetComp = competitionKey(latestFixture);
  const targetRound = roundKey(latestFixture);
  const roundFixtures = allPlayed.filter((fixture) =>
    competitionKey(fixture) === targetComp && roundKey(fixture) === targetRound,
  );
  const playerById = new Map<string, FcPlayer>(rawPlayers.map((player) => [String(player.ID), player]));
  const candidates = new Map<string, Candidate>();
  for (const fixture of roundFixtures) {
    for (const rating of fixture.result?.ratings ?? []) {
      if (!rating.playerId || Number(rating.minutes ?? 0) < 20 || !Number.isFinite(Number(rating.rating))) continue;
      const id = String(rating.playerId);
      const player = playerById.get(id);
      if (!player) continue;
      const teamId = rating.team === "home" ? fixture.homeId : fixture.awayId;
      const current = candidates.get(id);
      if (current) {
        current.ratingTotal += Number(rating.rating);
        current.appearances += 1;
        current.teamId = teamId;
      } else {
        candidates.set(id, { player, teamId, ratingTotal: Number(rating.rating), appearances: 1 });
      }
    }
  }
  if (candidates.size < 8) return null;

  const pools: Record<PositionGroup, Candidate[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const candidate of candidates.values()) pools[groupFor(candidate)].push(candidate);
  const score = (candidate: Candidate) => candidate.ratingTotal / candidate.appearances;
  Object.values(pools).forEach((pool) => pool.sort((a, b) => score(b) - score(a) || b.player.OVR - a.player.OVR));

  const need: Record<PositionGroup, number> = { GK: 1, DEF: 4, MID: 3, FWD: 3 };
  const selected: Candidate[] = [];
  const selectedIds = new Set<string>();
  for (const group of ["GK", "DEF", "MID", "FWD"] as const) {
    for (const candidate of pools[group]) {
      if (selected.filter((entry) => groupFor(entry) === group).length >= need[group]) break;
      const id = String(candidate.player.ID);
      if (!selectedIds.has(id)) { selectedIds.add(id); selected.push(candidate); }
    }
  }
  const remaining = [...candidates.values()].filter((entry) => !selectedIds.has(String(entry.player.ID))).sort((a, b) => score(b) - score(a));
  while (selected.length < 11 && remaining.length) selected.push(remaining.shift()!);

  const groupPools: Record<PositionGroup, Candidate[]> = {
    GK: selected.filter((entry) => groupFor(entry) === "GK"),
    DEF: selected.filter((entry) => groupFor(entry) === "DEF"),
    MID: selected.filter((entry) => groupFor(entry) === "MID"),
    FWD: selected.filter((entry) => groupFor(entry) === "FWD"),
  };
  const used = new Set<string>();
  const eleven = formationSlots(FORMATION).map((slot): ElevenSlot => {
    const group = positionGroupFromCode(slot.label as PosCode);
    let candidate = groupPools[group]?.find((entry) => !used.has(String(entry.player.ID)));
    if (!candidate) candidate = selected.find((entry) => !used.has(String(entry.player.ID)));
    if (!candidate) return { label: slot.label, player: null, natural: false };
    used.add(String(candidate.player.ID));
    return {
      label: slot.label,
      player: candidate.player,
      natural: true,
      matchRating: Number(score(candidate).toFixed(1)),
    };
  });

  const playerOfRoundCandidate = [...candidates.values()]
    .sort((a, b) => score(b) - score(a) || b.player.OVR - a.player.OVR)[0];
  const comp = competitionLabel(latestFixture);
  const round = roundLabelFor(latestFixture);
  const date = formatDateLabel(latestFixture.date);
  const teamIds = Array.from(new Set(selected.map((candidate) => candidate.teamId)));
  return {
    id: `team-of-round:${targetComp}:${targetRound}`,
    title: "Equipo de la jornada",
    competitionLabel: comp,
    roundLabel: round,
    dateLabel: date,
    category: categoryFor(latestFixture),
    formation: FORMATION,
    eleven,
    teamIds,
    playerOfRound: playerOfRoundCandidate ? {
      player: playerOfRoundCandidate.player,
      teamId: playerOfRoundCandidate.teamId,
      rating: Number(score(playerOfRoundCandidate).toFixed(1)),
    } : null,
  };
}

function readRatedFixtures(save: SaveGame | null | undefined): { players: FcPlayer[]; fixtures: Fixture[] } | null {
  if (!save) return null;
  const players = usePlayersStore.getState().getRawPlayers() as FcPlayer[];
  if (!Array.isArray(players) || players.length === 0) return null;
  const fixtures = getAllPlayedFixtures(save).filter((fixture) => (fixture.result?.ratings?.length ?? 0) > 0);
  return fixtures.length ? { players, fixtures } : null;
}

/** XI ideal de la ronda más reciente disputada en cualquier competición relevante. */
export function buildTeamOfRoundData(save: SaveGame | null | undefined): TeamOfRoundData | null {
  const data = readRatedFixtures(save);
  if (!data) return null;
  const latestFixture = data.fixtures.slice().sort(fixtureSortLatest)[0];
  return latestFixture ? buildForRound(data.players, data.fixtures, latestFixture) : null;
}

/**
 * Construye una noticia por cada competición en la que participa el club del
 * usuario, tomando la última jornada/ronda disputada de cada una. Así no se
 * reemplaza el Equipo de la jornada de liga por el de Champions (o viceversa).
 */
export function buildLatestTeamOfRoundsData(save: SaveGame | null | undefined): TeamOfRoundData[] {
  const data = readRatedFixtures(save);
  if (!data || !save?.myTeamId) return [];
  const competitionsPlayedByUser = new Set(
    data.fixtures
      .filter((fixture) => fixture.homeId === save.myTeamId || fixture.awayId === save.myTeamId)
      .map(competitionKey),
  );
  const latestByCompetition = new Map<string, Fixture>();
  for (const fixture of data.fixtures) {
    const key = competitionKey(fixture);
    if (!competitionsPlayedByUser.has(key)) continue;
    const current = latestByCompetition.get(key);
    if (!current || fixtureSortLatest(fixture, current) < 0) latestByCompetition.set(key, fixture);
  }
  return [...latestByCompetition.entries()]
    .sort(([, a], [, b]) => fixtureSortLatest(a, b))
    .map(([, fixture]) => buildForRound(data.players, data.fixtures, fixture))
    .filter((item): item is TeamOfRoundData => item !== null);
}
