import { formatMatchMinuteWithMark, getMatchMinuteSortValue, markExtraTimeEvent } from "@/lib/matchTime";

/** Small, durable post-match copy stored with every played fixture. */
export type MatchPostReport = {
  version: 1;
  signature: string;
  headline: string;
  paragraphs: string[];
  facts: string[];
};

type ReportFixture = {
  id?: string;
  competition?: string;
  europeanCompetition?: string;
  league?: string;
  matchday?: number;
  round?: string;
  date?: string;
  homeId?: string;
  awayId?: string;
};

type ReportResult = {
  homeGoals?: number;
  awayGoals?: number;
  extraTime?: { homeGoals?: number; awayGoals?: number; events?: any[]; substitutions?: any[] };
  events?: any[];
  cards?: any[];
  injuries?: any[];
  highlights?: any[];
  substitutions?: any[];
  stats?: {
    home?: Record<string, number>;
    away?: Record<string, number>;
  };
  penalties?: { homeGoals?: number; awayGoals?: number };
  tacticalImpact?: {
    home?: { commentary?: string[] };
    away?: { commentary?: string[] };
  };
  xgHome?: number;
  xgAway?: number;
  mvp?: { playerName?: string; rating?: number; playerId?: string } | null;
};

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildMatchPostReport(
  fixture: ReportFixture,
  result: ReportResult,
  names: { homeName?: string; awayName?: string; competitionName?: string } = {},
): MatchPostReport {
  const homeName = names.homeName || fixture.homeId || "Local";
  const awayName = names.awayName || fixture.awayId || "Visitante";
  const homeGoals = number(result.homeGoals) + number(result.extraTime?.homeGoals);
  const awayGoals = number(result.awayGoals) + number(result.extraTime?.awayGoals);
  const shootoutWinner = result.penalties && number(result.penalties.homeGoals) !== number(result.penalties.awayGoals)
    ? number(result.penalties.homeGoals) > number(result.penalties.awayGoals) ? homeName : awayName
    : null;
  const winner = homeGoals > awayGoals ? homeName : awayGoals > homeGoals ? awayName : shootoutWinner;
  const decidedOnPenalties = !!shootoutWinner && homeGoals === awayGoals;
  const headline = winner
    ? decidedOnPenalties ? `${winner} gana en la tanda de penaltis` : `${winner} se lleva la victoria`
    : `Empate entre ${homeName} y ${awayName}`;

  const extraTimeEvents = Array.isArray(result.extraTime?.events) ? result.extraTime!.events! : [];
  const sameEvent = (a: any, b: any) =>
    number(a.minute) === number(b.minute) &&
    a.team === b.team &&
    (a.scorerId ?? a.playerName) === (b.scorerId ?? b.playerName) &&
    a.type === b.type;
  const baseEvents = (Array.isArray(result.events) ? result.events : []).map((event: any) =>
    extraTimeEvents.some((extraEvent: any) => sameEvent(event, extraEvent))
      ? markExtraTimeEvent(event)
      : event,
  );
  const goals = [
    ...baseEvents,
    ...extraTimeEvents
      .filter((event: any) => !baseEvents.some((base: any) => sameEvent(base, event)))
      .map((event: any) => markExtraTimeEvent(event)),
  ].filter((event: any) => ["goal", "penalty_goal", "free_kick_goal", "own_goal"].includes(String(event?.type ?? "")))
    .sort((a: any, b: any) => getMatchMinuteSortValue(a.minute, a) - getMatchMinuteSortValue(b.minute, b));

  const statsHome = result.stats?.home;
  const statsAway = result.stats?.away;
  const hasStats = !!statsHome && !!statsAway;
  const paragraphs: string[] = [
    `${homeName} ${homeGoals}–${awayGoals} ${awayName}${result.extraTime ? " tras la prórroga" : ""}. ${decidedOnPenalties ? `La eliminatoria se decidió en la tanda: ${number(result.penalties?.homeGoals)}–${number(result.penalties?.awayGoals)} para ${winner}.` : winner ? `${winner} terminó imponiéndose en el marcador.` : "Ninguno de los dos equipos consiguió romper la igualdad."}`,
  ];
  if (names.competitionName) paragraphs.unshift(`Encuentro correspondiente a ${names.competitionName}.`);

  if (hasStats) {
    const homePossession = number(statsHome.possession);
    const awayPossession = number(statsAway.possession);
    const homeShots = number(statsHome.shots);
    const awayShots = number(statsAway.shots);
    paragraphs.push(
      `${homeName} registró un ${homePossession}% de posesión, ${homeShots} tiros y ${number(statsHome.shotsOnTarget)} a puerta; ${awayName} terminó con un ${awayPossession}% de posesión, ${awayShots} tiros y ${number(statsAway.shotsOnTarget)} a puerta.`,
    );
    paragraphs.push(`Los goles esperados (xG) fueron ${number(statsHome.xg).toFixed(2)} para ${homeName} y ${number(statsAway.xg).toFixed(2)} para ${awayName}.`);
  } else {
    const homeXg = number(result.xgHome);
    const awayXg = number(result.xgAway);
    if (homeXg > 0 || awayXg > 0) {
      paragraphs.push(`Los modelos de ocasiones calcularon ${homeXg.toFixed(2)} xG para ${homeName} y ${awayXg.toFixed(2)} xG para ${awayName}.`);
    }
  }

  if (goals.length > 0) {
    const goalText = goals.map((event: any) => {
      const teamName = event.team === "away" ? awayName : homeName;
      const scorer = String(event.scorerName || "Autor no registrado");
      const suffix = event.type === "own_goal" ? " (en propia puerta)" : event.type === "penalty_goal" ? " (penalti)" : event.type === "free_kick_goal" ? " (falta directa)" : "";
      return `${formatMatchMinuteWithMark(event.minute, event)} ${scorer}${suffix} para ${teamName}`;
    });
    paragraphs.push(`Los goles llegaron así: ${goalText.join("; ")}.`);
  } else if (homeGoals + awayGoals > 0) {
    paragraphs.push("El marcador conserva los goles del encuentro, aunque este guardado no dispone del detalle de sus autores y minutos.");
  } else {
    paragraphs.push("El encuentro terminó sin goles.");
  }

  const facts: string[] = [];
  facts.push(`Marcador final: ${homeGoals}–${awayGoals}`);
  if (result.mvp?.playerName) {
    facts.push(`Jugador del partido: ${result.mvp.playerName}${Number.isFinite(Number(result.mvp.rating)) ? ` (${number(result.mvp.rating).toFixed(1)})` : ""}`);
  }
  const cards = Array.isArray(result.cards) ? result.cards : [];
  if (cards.length) facts.push(`Tarjetas: ${cards.length}`);
  const injuries = Array.isArray(result.injuries) ? result.injuries : [];
  if (injuries.length) facts.push(`Lesiones: ${injuries.length}`);
  const substitutions = [
    ...(Array.isArray(result.substitutions) ? result.substitutions : []),
    ...(Array.isArray(result.extraTime?.substitutions) ? result.extraTime!.substitutions! : []),
  ];
  if (substitutions.length) facts.push(`Sustituciones: ${substitutions.length}`);
  if (names.competitionName) facts.unshift(`Competición: ${names.competitionName}`);
  if (result.tacticalImpact?.home?.commentary?.[0]) facts.push(`${homeName}: ${result.tacticalImpact.home.commentary[0]}`);
  if (result.tacticalImpact?.away?.commentary?.[0]) facts.push(`${awayName}: ${result.tacticalImpact.away.commentary[0]}`);

  const signatureSource = JSON.stringify({
    fixtureId: fixture.id,
    competition: fixture.europeanCompetition || fixture.competition,
    score: [homeGoals, awayGoals],
    penalties: result.penalties ? [number(result.penalties.homeGoals), number(result.penalties.awayGoals)] : null,
    events: goals.map((event: any) => [event.minute, event.team, event.type, event.scorerId, event.scorerName]),
    cards: cards.map((card: any) => [card.minute, card.team, card.playerId, card.cardType, card.isSecondYellow]),
    injuries: injuries.map((injury: any) => [injury.minute, injury.team, injury.playerId, injury.reason]),
    substitutions: substitutions.map((sub: any) => [sub.minute, sub.team, sub.playerInId, sub.playerOutId]),
    tacticalImpact: result.tacticalImpact ?? null,
    stats: hasStats ? [statsHome, statsAway] : [number(result.xgHome), number(result.xgAway)],
  });

  return {
    version: 1,
    signature: stableHash(signatureSource),
    headline,
    paragraphs,
    facts,
  };
}
