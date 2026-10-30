import type { Fixture, Standing } from "@/lib/season";
import { applyResult, emptyStandings, sortStandings } from "@/lib/season";
import type { SaveGame } from "@/lib/store";
import { teamById, type Team } from "@/data/teams";
import { getAllPlayedFixtures, type TeamFormResult } from "@/lib/teamForm";
import { getLeaguePositionZones, type LeagueZoneKind } from "@/lib/season/leaguePositionZones";
import { loadTactics, resolveMatchTactics, tacticalMatchupMultiplier, TACTICAL_SYSTEMS } from "@/lib/teamTactics";

type ResultChip = {
  code: TeamFormResult;
  score: string;
  opponent: string;
  competition: string;
  title: string;
};

type TeamFormAnalysis = {
  chips: ResultChip[];
  summary: string;
  trend: string;
  played: number;
};

type TacticalAnalysis = {
  heading: string;
  formation: string;
  body: string;
  tags: string[];
  system: string;
  mentality: string;
  gameStyle: string;
  matchup: string;
  matchupStatus: "favorable" | "complicado" | "equilibrado";
};

export type IndividualRunHighlight = {
  id: string;
  side: "home" | "away";
  playerId: string;
  playerName: string;
  category: "goals" | "assists" | "cleanSheets" | "rating" | "mvp" | "form" | "quality" | "impact" | "profile";
  value: string;
  title: string;
  body: string;
  priority: number;
};

export type MatchPreviewAnalysis = {
  tags: string[];
  contextTitle: string;
  contextBody: string;
  homeForm: TeamFormAnalysis;
  awayForm: TeamFormAnalysis;
  homePlan: TacticalAnalysis;
  awayPlan: TacticalAnalysis;
  rivalry: { title: string; body: string } | null;
  keyBattle: { title: string; body: string };
  previousMeeting: string | null;
  individualRuns: IndividualRunHighlight[];
  overallRead: string;
};

function normalizeName(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function teamMatches(team: Team, aliases: string[]): boolean {
  const name = normalizeName(team.name);
  return aliases.some((alias) => {
    const normalized = normalizeName(alias);
    return name === normalized || (normalized.length >= 8 && name.includes(normalized)) || (name.length >= 8 && normalized.includes(name));
  });
}

const DERBIES: Array<{ a: string[]; b: string[]; title: string; description: string }> = [
  { a: ["Real Madrid"], b: ["Atlético de Madrid", "Atletico Madrid"], title: "Derbi madrileño", description: "La rivalidad de la capital añade tensión competitiva: se espera un partido intenso en los duelos, con máxima atención a las segundas jugadas y a cada pérdida cerca del área. El equipo que mantenga la cabeza fría y gestione mejor las transiciones puede inclinar el derbi." },
  { a: ["Real Madrid"], b: ["FC Barcelona", "Barcelona"], title: "El Clásico", description: "El Clásico convierte cada fase en una batalla de control y ritmo. La presión tras pérdida, la ocupación de los pasillos interiores y la capacidad para atacar el espacio a la espalda de la defensa pueden ser decisivas; los errores en salida se pagan especialmente caros." },
  { a: ["Sevilla FC", "Sevilla"], b: ["Real Betis", "Real Betis Seville"], title: "El Gran Derbi", description: "El derbi sevillano invita a un partido emocional y de duelos fuertes. La gestión de la presión, las faltas cerca del área y la elección de cuándo acelerar serán tan importantes como la calidad con balón." },
  { a: ["Manchester United"], b: ["Manchester City"], title: "Derbi de Manchester", description: "La batalla de Manchester suele enfrentar dos planes muy distintos para ocupar el campo. La salida bajo presión, las coberturas a la espalda de los laterales y el control de las transiciones serán puntos críticos." },
  { a: ["Arsenal"], b: ["Tottenham Hotspur", "Tottenham"], title: "Derbi del norte de Londres", description: "El derbi del norte de Londres suele premiar al equipo que combina agresividad con precisión. La presión alta puede generar ocasiones, pero también dejar espacios que el rival tratará de atacar con verticalidad." },
  { a: ["Liverpool"], b: ["Everton"], title: "Derbi de Merseyside", description: "La cercanía y la rivalidad elevan el ritmo de los duelos. Ganar las segundas jugadas, defender centros laterales y no conceder pérdidas en la salida puede tener tanto peso como la creación de ocasiones." },
  { a: ["Inter", "Internazionale"], b: ["AC Milan", "Milan"], title: "Derby della Madonnina", description: "El derbi milanés plantea un pulso táctico por los carriles interiores y las bandas. Los movimientos entre líneas y la defensa de las llegadas desde segunda línea pueden romper un encuentro muy equilibrado." },
  { a: ["AS Roma", "Roma"], b: ["Lazio"], title: "Derbi della Capitale", description: "El derbi romano suele exigir concentración en cada duelo y precisión cuando se recupera el balón. Evitar pérdidas en zonas centrales y aprovechar los espacios tras los laterales puede marcar la diferencia." },
  { a: ["Bayern München", "Bayern Munich"], b: ["Borussia Dortmund", "Dortmund"], title: "Der Klassiker", description: "El clásico alemán suele ofrecer un choque de ritmo alto. La altura de la línea defensiva, la presión sobre el primer pase y las carreras al espacio detrás de los centrales serán claves para controlar las transiciones." },
  { a: ["Celtic"], b: ["Rangers"], title: "Old Firm", description: "La intensidad del Old Firm hace especialmente importante protegerse tras perder el balón y evitar que la emoción desordene al equipo. Los duelos individuales y la eficacia en las áreas pueden decidirlo." },
  { a: ["Ajax"], b: ["Feyenoord"], title: "De Klassieker", description: "El clásico neerlandés invita a un duelo abierto, con presión y ataques rápidos. Será clave proteger el espacio a la espalda de los laterales y no conceder transiciones en superioridad." },
  { a: ["Boca Juniors"], b: ["River Plate"], title: "Superclásico argentino", description: "El Superclásico suele mezclar máxima tensión con un alto valor de cada detalle. La disciplina, la gestión de las tarjetas y la eficacia en las áreas pueden resultar determinantes." },
  { a: ["Benfica"], b: ["Porto"], title: "O Clássico", description: "El duelo entre Benfica y Porto suele resolverse en los detalles de la presión y las transiciones. El equipo que salga limpio de la primera presión y ocupe mejor el área rival tendrá una ventaja importante." },
  { a: ["Paris Saint-Germain", "PSG"], b: ["Olympique de Marseille", "Marseille"], title: "Le Classique", description: "La rivalidad francesa añade intensidad a un encuentro en el que el ritmo de circulación y las transiciones pueden dispararse. La vigilancia sobre los jugadores que reciben entre líneas será fundamental." },
  { a: ["Athletic Club", "Athletic Bilbao"], b: ["Real Sociedad"], title: "Derbi vasco", description: "El derbi vasco suele ser un partido de ritmo alto, disputas y presión coordinada. La precisión en la salida y la capacidad para ganar segundas jugadas pueden decidir quién logra instalarse en campo rival." },
];

function knownRivalry(home: Team, away: Team): MatchPreviewAnalysis["rivalry"] {
  for (const derby of DERBIES) {
    if ((teamMatches(home, derby.a) && teamMatches(away, derby.b)) || (teamMatches(home, derby.b) && teamMatches(away, derby.a))) {
      return { title: derby.title, body: derby.description };
    }
  }
  return null;
}

function competitionName(fixture: Fixture): string {
  const key = fixture.europeanCompetition || (fixture.competition === "ucl" ? "ucl" : undefined);
  if (key === "ucl") return "Champions League";
  if (key === "uel") return "Europa League";
  if (key === "uecl") return "Conference League";
  if (fixture.promotionPlayoff) return "Playoff de ascenso/permanencia";
  if (fixture.competition === "cup") return "Copa nacional";
  return "liga";
}

function getMatchGoals(fixture: Fixture): { home: number; away: number } {
  const result: any = fixture.result ?? {};
  return {
    home: Number(result.homeGoals ?? 0) + Number(result.extraTime?.homeGoals ?? 0),
    away: Number(result.awayGoals ?? 0) + Number(result.extraTime?.awayGoals ?? 0),
  };
}

function chronologicalFixtureKey(fixture: Fixture): string {
  if (typeof fixture.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(fixture.date)) return fixture.date.slice(0, 10);
  return `0000-${String(fixture.matchday ?? 0).padStart(4, "0")}-${fixture.id}`;
}

function formForTeam(save: SaveGame, team: Team, allPlayed = getAllPlayedFixtures(save)): TeamFormAnalysis {
  const played = allPlayed
    .filter((fixture) => fixture.result && (fixture.homeId === team.id || fixture.awayId === team.id))
    .sort((a, b) => chronologicalFixtureKey(a).localeCompare(chronologicalFixtureKey(b)))
    .slice(-5);

  if (played.length === 0) {
    return {
      chips: [],
      summary: `No hay partidos anteriores registrados para ${team.name} en esta carrera. La previa se apoya, por tanto, en el perfil colectivo y en la configuración táctica disponible, no en una racha inventada.`,
      trend: "Sin forma reciente registrada",
      played: 0,
    };
  }

  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  const chips = played.map((fixture) => {
    const score = getMatchGoals(fixture);
    const isHome = fixture.homeId === team.id;
    let gf = isHome ? score.home : score.away;
    let ga = isHome ? score.away : score.home;
    let wonOnPens = false;
    const result: any = fixture.result;
    if (result?.penalties && gf === ga) {
      const penaltyFor = Number(isHome ? result.penalties.homeGoals : result.penalties.awayGoals);
      const penaltyAgainst = Number(isHome ? result.penalties.awayGoals : result.penalties.homeGoals);
      wonOnPens = penaltyFor > penaltyAgainst;
      if (penaltyFor > penaltyAgainst) wins += 1;
      else if (penaltyFor < penaltyAgainst) losses += 1;
      else draws += 1;
    } else if (gf > ga) wins += 1;
    else if (gf < ga) losses += 1;
    else draws += 1;

    goalsFor += gf;
    goalsAgainst += ga;
    const code: TeamFormResult = result?.penalties && gf === ga
      ? (wonOnPens ? "W" : Number(isHome ? result.penalties.homeGoals : result.penalties.awayGoals) < Number(isHome ? result.penalties.awayGoals : result.penalties.homeGoals) ? "L" : "D")
      : gf > ga ? "W" : gf < ga ? "L" : "D";
    const opponent = teamMatchesById(fixture.homeId === team.id ? fixture.awayId : fixture.homeId);
    const competition = fixture.europeanCompetition === "ucl" || fixture.competition === "ucl"
      ? "Champions"
      : fixture.europeanCompetition === "uel"
        ? "Europa"
        : fixture.europeanCompetition === "uecl"
          ? "Conference"
          : fixture.competition === "cup" ? "Copa" : "Liga";
    const scoreLabel = result?.penalties && gf === ga
      ? `${gf}-${ga} · pen. ${isHome ? result.penalties.homeGoals : result.penalties.awayGoals}-${isHome ? result.penalties.awayGoals : result.penalties.homeGoals}`
      : `${gf}-${ga}`;
    const title = `${opponent} · ${scoreLabel} · ${competition}`;
    return { code, score: scoreLabel, opponent, competition, title };
  });

  const latestFirst = [...chips].reverse();
  const latestCode = latestFirst[0]?.code;
  let streak = 0;
  if (latestCode) {
    for (let index = 0; index < latestFirst.length; index += 1) {
      if (latestFirst[index].code !== latestCode) break;
      streak += 1;
    }
  }
  const resultsPhrase = `${wins} ${wins === 1 ? "victoria" : "victorias"}, ${draws} ${draws === 1 ? "empate" : "empates"} y ${losses} ${losses === 1 ? "derrota" : "derrotas"}`;
  const summary = `En sus últimos ${played.length} partidos registrados (todas las competiciones), ${team.name} suma ${resultsPhrase}, con ${goalsFor} goles a favor y ${goalsAgainst} en contra.`;
  let trend = "Balance reciente irregular";
  if (latestCode === "W" && streak >= 3) trend = `${streak} victorias consecutivas`;
  else if (latestCode === "L" && streak >= 3) trend = `${streak} derrotas consecutivas`;
  else if (wins > losses && wins >= 2) trend = "Dinámica reciente positiva";
  else if (losses > wins && losses >= 2) trend = "Necesita recuperar resultados";
  else if (wins === losses) trend = "Resultados recientes equilibrados";

  return { chips, summary, trend, played: played.length };
}

function teamMatchesById(teamId: string): string {
  return teamById(teamId).name;
}

function tacticPlan(
  team: Team,
  formation: string,
  xi: any[] = [],
  opponent: Team,
  opponentXi: any[] = [],
): TacticalAnalysis {
  const tactics = resolveMatchTactics(loadTactics(team.id), xi as any, team.id);
  const opponentTactics = resolveMatchTactics(loadTactics(opponent.id), opponentXi as any, opponent.id);
  const definition = TACTICAL_SYSTEMS.find((item) => item.id === tactics.system) ?? TACTICAL_SYSTEMS.find((item) => item.id === "possession")!;
  const opponentDefinition = TACTICAL_SYSTEMS.find((item) => item.id === opponentTactics.system) ?? TACTICAL_SYSTEMS.find((item) => item.id === "possession")!;
  const matchup = tacticalMatchupMultiplier(tactics.system, opponentTactics.system);
  const matchupStatus = matchup > 1.005 ? "favorable" : matchup < 0.995 ? "complicado" : "equilibrado";
  return {
    heading: definition.name,
    formation: String(formation || "Táctica 4-4-2").replace("Táctica ", ""),
    body: definition.description,
    tags: [definition.name],
    system: definition.name,
    mentality: tactics.mentality === "defensive" ? "Defensiva" : tactics.mentality === "offensive" ? "Ofensiva" : "Equilibrada",
    gameStyle: tactics.gameStyle === "possession" ? "Pases cortos"
      : tactics.gameStyle === "counter" ? "Transiciones rápidas"
        : tactics.gameStyle === "wide" ? "Centros laterales"
          : tactics.gameStyle === "direct" ? "Balón largo" : "Mixto",
    matchup: opponentDefinition.name,
    matchupStatus,
  };
}

function standingsContext(save: SaveGame, fixture: Fixture, home: Team, away: Team): { title: string; body: string; tags: string[] } {
  const matchday = Number(fixture.matchday ?? 0);
  if (fixture.competition !== "league" || fixture.europeanCompetition) {
    return { title: "El contexto de la competición", body: "", tags: [] };
  }
  if (matchday <= 1) {
    return {
      title: "Primera toma de contacto",
      body: "Es la jornada inaugural. Todavía no existe una clasificación con suficiente recorrido para hablar de presión por descenso, pelea europea o candidatos al título. El objetivo será empezar a construir una tendencia, comprobar los automatismos y medir las primeras respuestas competitivas.",
      tags: ["Jornada inaugural", "Sin presión de tabla consolidada"],
    };
  }

  const leagueFixtures = Array.isArray(save.fixtures?.[fixture.league]) ? save.fixtures[fixture.league] : [];
  const playedCount = leagueFixtures.filter((item) => Boolean(item.result)).length;
  if (playedCount === 0) {
    return {
      title: "La tabla aún no ofrece una lectura fiable",
      body: "Aunque la competición ha avanzado de calendario, todavía no hay resultados anteriores registrados en esta liga. La previa se centrará en la forma disponible y el duelo táctico sin atribuir posiciones o urgencias de clasificación que no estén confirmadas.",
      tags: ["Datos de clasificación insuficientes"],
    };
  }

  let table: Standing[] = emptyStandings(fixture.league, { teamLeagueOverrides: save.teamLeagueOverrides });
  for (const item of leagueFixtures) if (item.result) table = applyResult(table, item);
  table = sortStandings(table);
  const positions = new Map(table.map((row, index) => [row.teamId, index + 1]));
  const homeRow = table.find((row) => row.teamId === home.id);
  const awayRow = table.find((row) => row.teamId === away.id);
  if (!homeRow || !awayRow) {
    return {
      title: "Puntos importantes en juego",
      body: `Con la temporada ya en marcha, el encuentro puede empezar a marcar distancias. ${home.name} y ${away.name} buscarán sumar para reforzar sus objetivos, pero la lectura de la clasificación se limita a los datos que están registrados para sus clubes.`,
      tags: [`Jornada ${matchday}`],
    };
  }

  let zones = new Map<string, LeagueZoneKind[]>();
  try { zones = getLeaguePositionZones(save, fixture.league, table); } catch { zones = new Map(); }
  const homePosition = positions.get(home.id) ?? 0;
  const awayPosition = positions.get(away.id) ?? 0;
  const pointsGap = Math.abs(homeRow.points - awayRow.points);
  const bodyParts = [
    `Antes de este encuentro, ${home.name} ocupa la ${homePosition}.ª posición con ${homeRow.points} puntos y ${away.name} es ${awayPosition}.º con ${awayRow.points} puntos.`,
  ];
  // Some saves generate the league calendar in stages. Do not mistake the
  // latest currently-created matchday for the end of the season; for a normal
  // double round-robin, the number of clubs provides a safe floor.
  const totalRounds = Math.max(
    0,
    ...leagueFixtures.map((item) => Number(item.matchday) || 0),
    table.length > 1 ? (table.length - 1) * 2 : 0,
  );
  const tags = [`Jornada ${matchday}`, `${homePosition}.º ${home.name}`, `${awayPosition}.º ${away.name}`];
  const homeZones = zones.get(home.id) ?? [];
  const awayZones = zones.get(away.id) ?? [];
  const relegationTeams = table.filter((row) => (zones.get(row.teamId) ?? []).includes("relegation"));
  const firstDirectDropIndex = relegationTeams.length ? table.findIndex((row) => (zones.get(row.teamId) ?? []).includes("relegation")) : -1;
  const safeRowBeforeDirectDrop = firstDirectDropIndex > 0 ? table[firstDirectDropIndex - 1] : null;
  const homeDrop = homeZones.includes("relegation");
  const awayDrop = awayZones.includes("relegation");
  const homeDropPlayoff = homeZones.includes("relegation-playoff");
  const awayDropPlayoff = awayZones.includes("relegation-playoff");
  const homeInDanger = homeDrop || homeDropPlayoff;
  const awayInDanger = awayDrop || awayDropPlayoff;

  if (homeInDanger && awayInDanger) {
    bodyParts.push(`Es un duelo directo por la permanencia: ambos llegan en posiciones de peligro y pueden recortar distancias entre sí. La gestión de los nervios, no regalar transiciones y convertir las ocasiones claras tendrá un peso especial.`);
    tags.push("Duelo directo por la permanencia");
    const safetyRow = safeRowBeforeDirectDrop;
    if (safetyRow) {
      for (const endangered of [
        { team: home, row: homeRow, position: homePosition, direct: homeDrop, playoff: homeDropPlayoff },
        { team: away, row: awayRow, position: awayPosition, direct: awayDrop, playoff: awayDropPlayoff },
      ]) {
        const targetSafetyRow = endangered.playoff && !endangered.direct
          ? table[endangered.position - 2] ?? safetyRow
          : safetyRow;
        if (targetSafetyRow && endangered.row.points + 3 >= targetSafetyRow.points) {
          bodyParts.push(`Una victoria podría permitir a ${endangered.team.name} salir de la zona de peligro o acercarse a la zona segura, según el puesto exacto, los desempates y los resultados de sus rivales directos.`);
          tags.push(`${endangered.team.name}: opción de salir del peligro`);
        } else if (targetSafetyRow) {
          const gap = Math.max(0, targetSafetyRow.points - endangered.row.points);
          bodyParts.push(`${endangered.team.name} necesita recortar ${gap} ${gap === 1 ? "punto" : "puntos"} para alcanzar la referencia de permanencia; una victoria ayudaría, aunque no garantizaría salir de la zona de peligro.`);
        }
      }
    }
    const roundsLeft = totalRounds > 0 ? Math.max(0, totalRounds - matchday) : null;
    if (roundsLeft !== null && roundsLeft <= 3) {
      bodyParts.push(roundsLeft === 0
        ? "Es la última jornada de liga: la permanencia se decide hoy y los resultados de los rivales directos pueden ser decisivos."
        : `Quedan ${roundsLeft} ${roundsLeft === 1 ? "jornada" : "jornadas"} para el final, así que cada punto puede decidir la permanencia.`);
      tags.push(roundsLeft === 0 ? "Última jornada" : "Recta final por la permanencia");
    }
  } else if (homeInDanger || awayInDanger) {
    const endangeredTeam = homeInDanger ? home : away;
    const endangeredRow = homeInDanger ? homeRow : awayRow;
    const endangeredPosition = positions.get(endangeredTeam.id) ?? 0;
    const safetyRow = homeInDanger
      ? (homeDropPlayoff ? table[endangeredPosition - 2] : safeRowBeforeDirectDrop)
      : (awayDropPlayoff ? table[endangeredPosition - 2] : safeRowBeforeDirectDrop);
    const dangerLabel = (homeInDanger ? homeDropPlayoff : awayDropPlayoff) && !(homeInDanger ? homeDrop : awayDrop)
      ? "puesto de playoff de permanencia"
      : "puestos de descenso directo";
    if (safetyRow) {
      const gap = Math.max(0, safetyRow.points - endangeredRow.points);
      const canReachByWin = endangeredRow.points + 3 >= safetyRow.points;
      bodyParts.push(canReachByWin
        ? `${endangeredTeam.name} llega en ${dangerLabel}. Una victoria podría acercarle a la salida —o permitirle igualar la puntuación de la zona segura—, aunque dependerá también de los resultados y los desempates de los rivales directos.`
        : `${endangeredTeam.name} llega en ${dangerLabel} y necesita sumar para recortar los ${gap} puntos que le separan de la zona segura. Una derrota aumentaría la presión; puntuar puede ser importante incluso si no basta aún para salir.`);
    } else {
      bodyParts.push(`${endangeredTeam.name} aparece en posiciones de peligro en la clasificación registrada. La prioridad es sumar y no dejar que el margen con los rivales directos se amplíe.`);
    }
    tags.push("La permanencia, en juego");
    const roundsLeft = totalRounds > 0 ? Math.max(0, totalRounds - matchday) : null;
    if (roundsLeft !== null && roundsLeft <= 3) {
      bodyParts.push(roundsLeft === 0
        ? `Es la última jornada de liga: la permanencia se decide hoy y cualquier cálculo depende del resultado de este partido y de los rivales directos.`
        : `Quedan ${roundsLeft} ${roundsLeft === 1 ? "jornada" : "jornadas"} para el final. El margen para corregir errores es mínimo y cada punto puede tener un efecto directo en el destino del club.`);
      tags.push(roundsLeft === 0 ? "Última jornada" : "Recta final por la permanencia");
    }
  } else {
    const directDropIndex = table.findIndex((row) => (zones.get(row.teamId) ?? []).includes("relegation"));
    const directDropLine = directDropIndex >= 0 ? table[directDropIndex] : null;
    const closeToDrop = [
      { team: home, row: homeRow, position: homePosition },
      { team: away, row: awayRow, position: awayPosition },
    ].filter(({ team, row, position }) => {
      const currentlyInDanger = (zones.get(team.id) ?? []).some((zone) => zone === "relegation" || zone === "relegation-playoff");
      return !currentlyInDanger && directDropLine && position > 0 && position < directDropIndex + 1 && row.points - directDropLine.points <= 3;
    });
    for (const item of closeToDrop) {
      const margin = Math.max(0, item.row.points - (directDropLine?.points ?? item.row.points));
      bodyParts.push(margin === 0
        ? `${item.team.name} está justo por encima de la zona de descenso y comparte puntuación con la primera plaza de descenso directo. Una derrota y los resultados de los rivales podrían hacerle caer; ganar le permitiría tomar aire.`
        : `${item.team.name} está justo por encima de la zona de descenso, con solo ${margin} ${margin === 1 ? "punto" : "puntos"} de margen sobre la primera plaza de descenso directo. Si pierde y los resultados de los rivales acompañan, podría caer a la zona de peligro; una victoria abriría algo de colchón.`);
      tags.push("La zona de descenso está cerca");
    }
  }

  const homeIsPromotion = homeZones.includes("promotion") || homeZones.includes("promotion-playoff");
  const awayIsPromotion = awayZones.includes("promotion") || awayZones.includes("promotion-playoff");
  if ((homeIsPromotion || awayIsPromotion) && !homeDrop && !awayDrop) {
    const promotionTeam = homeIsPromotion ? home : away;
    bodyParts.push(`${promotionTeam.name} ocupa ahora una plaza de ascenso o promoción y buscará consolidarla. Un resultado positivo puede sostener la candidatura, pero la clasificación seguirá dependiendo de la distancia con los perseguidores.`);
    tags.push("Objetivo ascenso");
  }

  const homeEuropean = homeZones.some((zone) => ["champions", "europa", "conference"].includes(zone));
  const awayEuropean = awayZones.some((zone) => ["champions", "europa", "conference"].includes(zone));
  if ((homeEuropean || awayEuropean) && !homeDrop && !awayDrop) {
    const europeanTeam = homeEuropean ? home : away;
    bodyParts.push(`${europeanTeam.name} está en puestos de acceso europeo y buscará defender su posición. En esta zona de la tabla, ceder puntos puede reabrir la pelea con los perseguidores.`);
    tags.push("Plazas europeas en juego");
  }

  if (!homeDrop && !awayDrop && pointsGap <= 3 && homePosition > 0 && awayPosition > 0) {
    bodyParts.push(`Solo hay ${pointsGap} ${pointsGap === 1 ? "punto" : "puntos"} de diferencia entre ambos. Es una oportunidad para ganar terreno directamente sobre un rival de la misma zona de la tabla.`);
    tags.push("Duelo directo por puntos");
  }

  if (!homeDrop && !awayDrop && table.length > 0) {
    const leader = table[0];
    const hasLeaderInGame = [homeRow, awayRow].some((row) => row.teamId === leader.teamId || leader.points - row.points <= 3);
    if (hasLeaderInGame && (homePosition <= 4 || awayPosition <= 4)) {
      bodyParts.push(`La parte alta también empieza a marcar objetivos: los puntos de hoy pueden consolidar el liderato o acercar a uno de los equipos a la cabeza.`);
      tags.push("Pelea por la zona alta");
    }
  }

  if (bodyParts.length === 1) {
    bodyParts.push(`El objetivo inmediato es convertir el nivel mostrado sobre el papel en puntos. Con ${pointsGap} ${pointsGap === 1 ? "punto" : "puntos"} de diferencia entre ambos, sumar hoy podría cambiar las distancias en una clasificación que empieza a tomar forma.`);
  }
  const closeToDrop = tags.includes("La zona de descenso está cerca");
  return { title: homeDrop || awayDrop || homeDropPlayoff || awayDropPlayoff ? "La permanencia añade presión" : closeToDrop ? "El margen con el descenso es mínimo" : homeEuropean || awayEuropean ? "Europa marca el objetivo" : "Los puntos empiezan a pesar", body: bodyParts.join(" "), tags };
}

function competitionContext(fixture: Fixture, competitionLabel: string): { title: string; body: string; tags: string[] } {
  const round = String(fixture.round ?? "").trim();
  const normalized = normalizeName(round);
  const isEuropean = Boolean(fixture.europeanCompetition) || fixture.competition === "ucl";
  const legTwo = /leg\s*2|vuelta|segundapart/.test(normalized);
  const legOne = /leg\s*1|ida/.test(normalized);
  if (fixture.promotionPlayoff) {
    return {
      title: fixture.promotionPlayoff.stage === "survival" ? "Un partido por la permanencia" : "Una eliminatoria que puede cambiar la temporada",
      body: fixture.promotionPlayoff.stage === "survival"
        ? "El margen de error es mínimo: el resultado puede marcar el futuro competitivo del club. La disciplina sin balón, las acciones a balón parado y la gestión emocional de cada tramo serán especialmente importantes."
        : "La eliminatoria de ascenso exige equilibrar ambición y control. Atacar con intención sin regalar transiciones y entender cuándo acelerar el ritmo puede valer tanto como dominar la posesión.",
      tags: ["Eliminatoria decisiva", legTwo ? "Vuelta" : "Ida"],
    };
  }
  if (isEuropean) {
    if (/final/.test(normalized) && !/quarter|semi|finalphase/.test(normalized)) {
      return { title: "Un título en juego", body: `La final europea no deja margen para especular durante todo el encuentro: será importante iniciar con orden, no regalar pérdidas en salida y elegir bien los momentos para arriesgar. La gestión de los nervios y las acciones a balón parado pueden decidir un partido de este nivel.`, tags: [competitionLabel, "Final"] };
    }
    if (legTwo) {
      return { title: "La eliminatoria entra en su momento decisivo", body: "En una vuelta europea, cada decisión debe leerse también en relación con el marcador global. El equipo que necesite remontar tendrá que subir el riesgo sin perder toda la protección tras pérdida; el que tenga ventaja deberá defender hacia delante cuando pueda, no limitarse a retroceder.", tags: [competitionLabel, "Partido de vuelta"] };
    }
    if (legOne) {
      return { title: "La ida marca el tablero de la eliminatoria", body: "El objetivo es construir una ventaja sin comprometer la vuelta. Conviene equilibrar presión y coberturas, aprovechar el factor campo y evitar pérdidas que permitan al rival marcar fuera de su estructura defensiva.", tags: [competitionLabel, "Partido de ida"] };
    }
    if (/octavos|r16|cuartos|quarterfinal|semifinal|semifinales|playoff|knockout|eliminatoria/.test(normalized) || Number(fixture.matchday ?? 0) > 8) {
      return { title: "La fase eliminatoria exige precisión", body: "En Europa, una mala transición o una acción a balón parado puede cambiar el equilibrio de la eliminatoria. Se espera que ambos equipos midan los riesgos: presión coordinada cuando el rival se atasque y ataques rápidos al detectar espacios.", tags: [competitionLabel, "Fase eliminatoria"] };
    }
    return { title: "Cada punto cuenta en Europa", body: "En la fase de liga continental, cada punto puede influir en el acceso directo a la siguiente ronda o en la necesidad de disputar un playoff. Se espera un plan que combine iniciativa con control de las transiciones: conceder ocasiones evitables puede resultar decisivo al hacer balance de la tabla europea.", tags: [competitionLabel, "Fase de liga"] };
  }
  if (fixture.competition === "cup") {
    const roundLower = normalized;
    if (roundLower.includes("final")) {
      return { title: "Una final para decidir un título", body: "Una final de copa premia al equipo que mejor gestiona los momentos: comenzar con concentración, no perder la estructura al atacar y mantener la calma si el marcador se mantiene cerrado. Las jugadas a balón parado pueden tener un peso enorme.", tags: [competitionLabel, "Final"] };
    }
    return { title: "La copa no permite desconexiones", body: "En una eliminatoria copera, una fase de dominio no garantiza el pase: la eficacia en las áreas y la concentración en acciones aisladas pueden decidirlo. El equipo que gestione mejor la ventaja y las transiciones tendrá más opciones de avanzar.", tags: [competitionLabel, round || "Eliminatoria"] };
  }
  return { title: "La competición marca el ritmo", body: "El partido debe leerse desde el contexto competitivo, la forma reciente y los recursos colectivos de cada equipo. La previa combina esos datos con la estructura táctica prevista para identificar dónde puede abrirse el encuentro.", tags: [competitionLabel] };
}

function previousMeetingText(save: SaveGame, fixture: Fixture, home: Team, away: Team, allPlayed = getAllPlayedFixtures(save)): string | null {
  const meetings = allPlayed
    .filter((item) => item.id !== fixture.id && item.result && ((item.homeId === home.id && item.awayId === away.id) || (item.homeId === away.id && item.awayId === home.id)))
    .sort((a, b) => chronologicalFixtureKey(a).localeCompare(chronologicalFixtureKey(b)));
  const previous = meetings[meetings.length - 1];
  if (!previous) return null;
  const scores = getMatchGoals(previous);
  const homeScore = previous.homeId === home.id ? scores.home : scores.away;
  const awayScore = previous.homeId === home.id ? scores.away : scores.home;
  const venue = previous.homeId === home.id ? `${home.name} fue local` : `${away.name} fue local`;
  return `Antecedente registrado más reciente: ${venue} y el marcador fue ${homeScore}-${awayScore}. Es una referencia útil para el contexto, aunque la forma actual y los ajustes de hoy pueden cambiar el guion.`;
}

type PlayerAppearanceSnapshot = {
  fixtureKey: string;
  playerId: string;
  playerName: string;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  isGoalkeeper: boolean;
  rating?: number;
  isMvp: boolean;
};

type PreviewPlayerProfile = {
  id?: string | number;
  name?: string;
  rating?: number;
  goals?: number;
  assists?: number;
  positions?: unknown;
  position?: unknown;
  formHistory?: unknown[];
};

/**
 * Build two notable names for one club. Recorded match data wins when it
 * reveals a real streak; current XI quality/form fills any remaining slots.
 * The fallback deliberately avoids inventing recent stats if the save has
 * no player-level history yet.
 */
function individualRunsForTeam(
  allPlayed: Fixture[],
  team: Team,
  side: "home" | "away",
  currentPlayers: PreviewPlayerProfile[] = [],
): IndividualRunHighlight[] {
  const teamFixtures = allPlayed
    .filter((item) => item.result && (item.homeId === team.id || item.awayId === team.id))
    .sort((a, b) => chronologicalFixtureKey(a).localeCompare(chronologicalFixtureKey(b)));
  const byPlayer = new Map<string, { name: string; appearances: PlayerAppearanceSnapshot[] }>();

  for (const fixture of teamFixtures) {
    const result: any = fixture.result ?? {};
    const fixtureSide: "home" | "away" = fixture.homeId === team.id ? "home" : "away";
    const starts = Array.isArray(result[`${fixtureSide}StartingLineup`])
      ? result[`${fixtureSide}StartingLineup`]
      : Array.isArray(result[`${fixtureSide}Lineup`]) ? result[`${fixtureSide}Lineup`] : [];
    const finalLineup = Array.isArray(result[`${fixtureSide}FinalLineup`]) ? result[`${fixtureSide}FinalLineup`] : [];
    const ratings = Array.isArray(result.ratings) ? result.ratings.filter((entry: any) => entry?.team === fixtureSide) : [];
    const ratingsById = new Map<string, any>(ratings.filter((entry: any) => entry?.playerId).map((entry: any) => [String(entry.playerId), entry]));
    const participants = new Map<string, { id: string; name: string; positions?: unknown; started: boolean }>();
    const addPlayer = (player: any, started = false) => {
      const id = String(player?.id ?? player?.playerId ?? "");
      if (!id) return;
      const current = participants.get(id);
      participants.set(id, {
        id,
        name: String(player?.name ?? player?.playerName ?? current?.name ?? "Jugador"),
        positions: player?.positions ?? player?.position ?? current?.positions,
        started: started || Boolean(current?.started),
      });
    };
    starts.forEach((player: any) => addPlayer(player, true));
    finalLineup.forEach((player: any) => addPlayer(player));
    ratings.forEach((entry: any) => addPlayer({ id: entry.playerId, name: entry.playerName, position: entry.position }));
    (Array.isArray(result.substitutions) ? result.substitutions : [])
      .filter((sub: any) => sub?.team === fixtureSide)
      .forEach((sub: any) => {
        addPlayer({ id: sub.playerOutId, name: sub.playerOutName });
        addPlayer({ id: sub.playerInId, name: sub.playerInName });
      });

    const matchEvents = [
      ...(Array.isArray(result.events) ? result.events : []),
      ...(Array.isArray(result.extraTime?.events) ? result.extraTime.events : []),
    ];
    matchEvents.forEach((event: any) => {
      if (event?.team !== fixtureSide) return;
      if (event?.scorerId && event.type !== "own_goal") addPlayer({ id: event.scorerId, name: event.scorerName });
      if (event?.assistId) addPlayer({ id: event.assistId, name: event.assistName });
    });

    const hasMinuteRatings = ratings.some((entry: any) => Number.isFinite(Number(entry?.minutes)));
    const homeGoals = Number(result.homeGoals ?? 0) + Number(result.extraTime?.homeGoals ?? 0);
    const awayGoals = Number(result.awayGoals ?? 0) + Number(result.extraTime?.awayGoals ?? 0);
    const goalsAgainst = fixtureSide === "home" ? awayGoals : homeGoals;
    const eventsForTeam = matchEvents.filter((event: any) => event?.team === fixtureSide);
    for (const participant of participants.values()) {
      const rating = ratingsById.get(participant.id);
      const minutes = rating && Number.isFinite(Number(rating.minutes)) ? Number(rating.minutes) : (participant.started ? 90 : 15);
      if (rating && hasMinuteRatings && minutes <= 0) continue;
      const playerPositions = Array.isArray(participant.positions) ? participant.positions.map(String) : [String(participant.positions ?? "")];
      const isGoalkeeper = playerPositions.some((position) => ["GK", "POR", "PT", "PORTERO"].includes(position.toUpperCase()) || position.toLowerCase().includes("goalkeeper") || position.toLowerCase().includes("portero")) || ["GK", "POR", "PT", "PORTERO"].includes(String(rating?.position ?? "").toUpperCase());
      const goals = eventsForTeam.filter((event: any) => event.type !== "own_goal" && String(event.scorerId ?? "") === participant.id).length;
      const assists = eventsForTeam.filter((event: any) => String(event.assistId ?? "") === participant.id).length;
      const cleanSheet = isGoalkeeper && goalsAgainst === 0 && minutes >= 60;
      const snapshot: PlayerAppearanceSnapshot = {
        fixtureKey: chronologicalFixtureKey(fixture),
        playerId: participant.id,
        playerName: participant.name,
        goals,
        assists,
        cleanSheet,
        isGoalkeeper,
        rating: Number.isFinite(Number(rating?.rating)) ? Number(rating.rating) : undefined,
        isMvp: String(result.mvp?.playerId ?? "") === participant.id,
      };
      const entry = byPlayer.get(participant.id) ?? { name: participant.name, appearances: [] };
      entry.name = participant.name || entry.name;
      entry.appearances.push(snapshot);
      byPlayer.set(participant.id, entry);
    }
  }

  const profileById = new Map<string, PreviewPlayerProfile>();
  const safeCurrentPlayers = currentPlayers.filter((player) => player && (player.id != null || player.name));
  for (const player of safeCurrentPlayers) {
    if (player.id != null) profileById.set(String(player.id), player);
  }

  const candidatesById = new Map<string, IndividualRunHighlight>();
  const createProfileFallback = (player: PreviewPlayerProfile): IndividualRunHighlight | null => {
    const playerId = player.id == null ? "" : String(player.id);
    const playerName = String(player.name ?? "Jugador").trim();
    if (!playerId || !playerName) return null;
    const formValues = (Array.isArray(player.formHistory) ? player.formHistory : [])
      .map(Number).filter((value) => Number.isFinite(value) && value >= 1 && value <= 10).slice(-5);
    const averageForm = formValues.length ? formValues.reduce((sum, value) => sum + value, 0) / formValues.length : 0;
    const rating = Number(player.rating);
    const safeRating = Number.isFinite(rating) && rating > 0 ? rating : 0;
    const scoredGoals = Number(player.goals) || 0;
    const assists = Number(player.assists) || 0;
    if (averageForm >= 7.6) {
      return {
        id: `${side}:${playerId}:form`, side, playerId, playerName,
        category: "form", value: averageForm.toFixed(1), priority: 38 + averageForm * 2 + safeRating * 0.12,
        title: `${playerName} llega en buena forma`,
        body: `Su historial reciente de valoraciones promedia un ${averageForm.toFixed(1)} sobre 10. Es una de las referencias a seguir de ${team.name}.`,
      };
    }
    if (scoredGoals > 0 || assists > 0) {
      return {
        id: `${side}:${playerId}:impact`, side, playerId, playerName,
        category: "impact", value: `${scoredGoals} G · ${assists} A`, priority: 29 + scoredGoals * 5 + assists * 4 + safeRating * 0.15,
        title: `${playerName}, una referencia ofensiva`,
        body: `En sus registros de temporada suma ${scoredGoals} goles y ${assists} asistencias. Puede aportar llegada y último pase a ${team.name}.`,
      };
    }
    if (safeRating > 0) {
      return {
        id: `${side}:${playerId}:quality`, side, playerId, playerName,
        category: "quality", value: String(Math.round(safeRating)), priority: 24 + safeRating * 0.45 + averageForm * 1.4,
        title: `${playerName}, jugador a seguir`,
        body: `Su media actual es ${Math.round(safeRating)}, una de las referencias de calidad de ${team.name}. ${formValues.length ? `Su forma reciente promedia ${averageForm.toFixed(1)} sobre 10.` : "No hay valoraciones recientes suficientes para afirmar una racha."}`,
      };
    }
    return {
      id: `${side}:${playerId}:profile`, side, playerId, playerName,
      category: "profile", value: "EN FOCO", priority: 10,
      title: `${playerName}, nombre a seguir`,
      body: `Figura entre los futbolistas destacados de ${team.name}. No hay datos individuales suficientes en la partida para cuantificar una racha reciente.`,
    };
  };

  for (const [playerId, entry] of byPlayer) {
    const recent = [...entry.appearances].sort((a, b) => b.fixtureKey.localeCompare(a.fixtureKey)).slice(0, 5);
    if (!recent.length) continue;
    const goals = recent.reduce((sum, match) => sum + match.goals, 0);
    const assists = recent.reduce((sum, match) => sum + match.assists, 0);
    const mvpCount = recent.filter((match) => match.isMvp).length;
    const keeperMatches = recent.filter((match) => match.isGoalkeeper).slice(0, 3);
    const cleanSheets = keeperMatches.filter((match) => match.cleanSheet).length;
    const ratedMatches = recent.filter((match) => match.rating !== undefined).slice(0, 3);
    const averageRating = ratedMatches.length ? ratedMatches.reduce((sum, match) => sum + Number(match.rating), 0) / ratedMatches.length : 0;
    const currentProfile = profileById.get(playerId);
    const currentRating = Number(currentProfile?.rating) || 0;
    const formValues = (Array.isArray(currentProfile?.formHistory) ? currentProfile!.formHistory! : [])
      .map(Number).filter((value) => Number.isFinite(value) && value >= 1 && value <= 10).slice(-5);
    const averageForm = formValues.length ? formValues.reduce((sum, value) => sum + value, 0) / formValues.length : 0;
    const basePriority = 22 + currentRating * 0.3 + averageForm * 1.2 + averageRating * 2.1 + goals * 2 + assists * 2 + mvpCount * 3 + cleanSheets * 2;
    let candidate: IndividualRunHighlight | null = null;

    if (goals >= 3) {
      candidate = {
        id: `${side}:${playerId}:goals`, side, playerId, playerName: entry.name,
        category: "goals", value: `${goals} GOL${goals === 1 ? "" : "ES"}`, priority: basePriority + 50 + goals * 5,
        title: `${entry.name}, en racha goleadora`,
        body: `Ha marcado ${goals} goles en sus últimos ${recent.length} partidos con participación. ${team.name} llega al encuentro con una amenaza ofensiva en gran momento.`,
      };
    } else if (recent.some((match) => match.isGoalkeeper) && keeperMatches.length >= 2 && cleanSheets >= 2) {
      candidate = {
        id: `${side}:${playerId}:clean-sheets`, side, playerId, playerName: entry.name,
        category: "cleanSheets", value: `${cleanSheets}/${keeperMatches.length}`, priority: basePriority + 45 + cleanSheets * 4,
        title: `${entry.name} está cerrando la portería`,
        body: cleanSheets === keeperMatches.length
          ? `Ha firmado ${cleanSheets} porterías a cero en sus últimos ${keeperMatches.length} partidos con participación. ${team.name} llega respaldado por una buena racha defensiva.`
          : `Ha mantenido la portería imbatida en ${cleanSheets} de sus últimos ${keeperMatches.length} partidos. Será una referencia importante para ${team.name}.`,
      };
    } else if (assists >= 2) {
      candidate = {
        id: `${side}:${playerId}:assists`, side, playerId, playerName: entry.name,
        category: "assists", value: `${assists} AST.`, priority: basePriority + 30 + assists * 4,
        title: `${entry.name}, decisivo en el último pase`,
        body: `Suma ${assists} asistencias en sus últimos ${recent.length} partidos con participación y está generando ocasiones para sus compañeros.`,
      };
    } else if (ratedMatches.length >= 3 && averageRating >= 8) {
      candidate = {
        id: `${side}:${playerId}:rating`, side, playerId, playerName: entry.name,
        category: "rating", value: averageRating.toFixed(1), priority: basePriority + 25 + averageRating * 3,
        title: `${entry.name} mantiene un nivel sobresaliente`,
        body: `Promedia un ${averageRating.toFixed(1)} de valoración en sus últimos ${ratedMatches.length} partidos con nota registrada.`,
      };
    } else if (mvpCount >= 2) {
      candidate = {
        id: `${side}:${playerId}:mvp`, side, playerId, playerName: entry.name,
        category: "mvp", value: `${mvpCount} MVP`, priority: basePriority + 20 + mvpCount * 4,
        title: `${entry.name} está marcando diferencias`,
        body: `Ha sido elegido jugador del partido ${mvpCount} veces en sus últimos ${recent.length} encuentros con participación.`,
      };
    } else if (goals > 0 || assists > 0) {
      candidate = {
        id: `${side}:${playerId}:impact`, side, playerId, playerName: entry.name,
        category: "impact", value: `${goals} G · ${assists} A`, priority: basePriority + 13 + goals * 4 + assists * 3,
        title: `${entry.name}, con impacto ofensivo`,
        body: `En sus últimos ${recent.length} partidos con participación ha sumado ${goals} goles y ${assists} asistencias.`,
      };
    } else if (ratedMatches.length >= 2 && averageRating >= 7.3) {
      candidate = {
        id: `${side}:${playerId}:rating`, side, playerId, playerName: entry.name,
        category: "rating", value: averageRating.toFixed(1), priority: basePriority + 12 + averageRating * 1.5,
        title: `${entry.name}, rendimiento constante`,
        body: `Promedia ${averageRating.toFixed(1)} en sus últimos ${ratedMatches.length} partidos con valoración registrada.`,
      };
    } else if (recent.some((match) => match.isGoalkeeper) && cleanSheets > 0 && keeperMatches.length > 0) {
      candidate = {
        id: `${side}:${playerId}:clean-sheets`, side, playerId, playerName: entry.name,
        category: "cleanSheets", value: `${cleanSheets}/${keeperMatches.length}`, priority: basePriority + 9 + cleanSheets * 2,
        title: `${entry.name}, seguridad bajo palos`,
        body: `Ha dejado su portería a cero en ${cleanSheets} de sus últimos ${keeperMatches.length} partidos con participación registrada.`,
      };
    } else if (averageForm >= 7.3) {
      candidate = {
        id: `${side}:${playerId}:form`, side, playerId, playerName: entry.name,
        category: "form", value: averageForm.toFixed(1), priority: basePriority + 8 + averageForm,
        title: `${entry.name} llega en buen momento`,
        body: `Su historial reciente de valoraciones promedia ${averageForm.toFixed(1)} sobre 10.`,
      };
    } else {
      candidate = createProfileFallback({ id: playerId, name: entry.name, rating: currentRating, formHistory: formValues }) ?? null;
      if (candidate) candidate.priority += basePriority * 0.15;
    }
    if (candidate) candidatesById.set(playerId, candidate);
  }

  // Include the players selected for this match even when they do not yet have
  // player-by-player history in the save. Their current form/overall rating can
  // still identify two credible names per side without fabricating a streak.
  for (const player of safeCurrentPlayers) {
    const id = player.id == null ? "" : String(player.id);
    if (!id || candidatesById.has(id)) continue;
    const fallback = createProfileFallback(player);
    if (fallback) candidatesById.set(id, fallback);
  }

  const sortedCandidates = [...candidatesById.values()].sort((a, b) => b.priority - a.priority);
  const selected = sortedCandidates.slice(0, 2);
  const selectedNames = new Set(selected.map((item) => normalizeName(item.playerName)));
  // A team always has its designated stand-out players even when no previous
  // match has been played or the save has no individual performance records.
  for (const [index, starName] of (team.stars ?? []).entries()) {
    if (selected.length >= 2) break;
    const name = String(starName ?? "").trim();
    if (!name || selectedNames.has(normalizeName(name))) continue;
    const safeId = `star-${side}-${normalizeName(name) || index}`;
    selected.push({
      id: `${side}:${safeId}:profile`, side, playerId: safeId, playerName: name,
      category: "profile", value: "EN FOCO", priority: 5,
      title: `${name}, nombre a seguir`,
      body: `Figura entre los futbolistas destacados de ${team.name}. No hay suficientes datos individuales guardados para atribuirle una racha reciente.`,
    });
    selectedNames.add(normalizeName(name));
  }
  return selected.slice(0, 2);
}

function individualRunsForMatch(
  allPlayed: Fixture[],
  home: Team,
  away: Team,
  homePlayers: PreviewPlayerProfile[] = [],
  awayPlayers: PreviewPlayerProfile[] = [],
): IndividualRunHighlight[] {
  const homeRuns = individualRunsForTeam(allPlayed, home, "home", homePlayers);
  const awayRuns = individualRunsForTeam(allPlayed, away, "away", awayPlayers);
  // Interleave the selections: exactly two names per club, one from each side
  // per visual row, rather than allowing one club to occupy all four cards.
  return [homeRuns[0], awayRuns[0], homeRuns[1], awayRuns[1]]
    .filter((run): run is IndividualRunHighlight => Boolean(run));
}

export function buildMatchPreviewAnalysis(input: {
  save: SaveGame;
  fixture: Fixture;
  home: Team;
  away: Team;
  homeFormation: string;
  awayFormation: string;
  competitionLabel: string;
  homePlayers?: PreviewPlayerProfile[];
  awayPlayers?: PreviewPlayerProfile[];
}): MatchPreviewAnalysis {
  const { save, fixture, home, away, homeFormation, awayFormation, competitionLabel, homePlayers = [], awayPlayers = [] } = input;
  const allPlayed = getAllPlayedFixtures(save);
  const homeForm = formForTeam(save, home, allPlayed);
  const awayForm = formForTeam(save, away, allPlayed);
  const individualRuns = individualRunsForMatch(allPlayed, home, away, homePlayers, awayPlayers);
  const rivalry = knownRivalry(home, away);
  const competition = competitionContext(fixture, competitionLabel);
  const table = standingsContext(save, fixture, home, away);
  const context = fixture.competition === "league" && !fixture.europeanCompetition ? table : competition;
  const homePlan = tacticPlan(home, homeFormation, homePlayers as any[], away, awayPlayers as any[]);
  const awayPlan = tacticPlan(away, awayFormation, awayPlayers as any[], home, homePlayers as any[]);
  const homeAttackVsAwayDefence = (Number(home.att) || 0) - (Number(away.def) || 0);
  const awayAttackVsHomeDefence = (Number(away.att) || 0) - (Number(home.def) || 0);
  const midfieldGap = (Number(home.mid) || 0) - (Number(away.mid) || 0);
  let keyBattle: MatchPreviewAnalysis["keyBattle"];
  if (Math.abs(midfieldGap) >= 5) {
    const stronger = midfieldGap > 0 ? home : away;
    const weaker = midfieldGap > 0 ? away : home;
    keyBattle = {
      title: "La batalla por el centro",
      body: `${stronger.name} parte con mejor valoración colectiva en el centro del campo. Si logra ofrecer líneas de pase y recoger las segundas jugadas, puede controlar los ataques; ${weaker.name} necesitará cerrar los pasillos interiores y encontrar una salida rápida para no quedar hundido.`,
    };
  } else if (homeAttackVsAwayDefence >= 6 || awayAttackVsHomeDefence >= 6) {
    const attacker = homeAttackVsAwayDefence >= awayAttackVsHomeDefence ? home : away;
    const defender = attacker.id === home.id ? away : home;
    keyBattle = {
      title: "Ataque contra defensa",
      body: `${attacker.name} presenta una ventaja relativa en ataque frente a la valoración defensiva de ${defender.name}. La clave será si puede generar ocasiones claras sin quedar expuesto a la espalda: ${defender.name} tendrá que proteger el área y evitar que los duelos se conviertan en carreras hacia su portería.`,
    };
  } else {
    keyBattle = {
      title: "El detalle puede desequilibrarlo",
      body: `Los perfiles colectivos no muestran una superioridad clara en una sola línea. La precisión en el último pase, la capacidad para recuperar tras pérdida y la atención a los centros y acciones a balón parado pueden inclinar un encuentro que probablemente se decida por pequeños márgenes.`,
    };
  }

  const overallHome = ((Number(home.att) || 0) + (Number(home.mid) || 0) + (Number(home.def) || 0)) / 3;
  const overallAway = ((Number(away.att) || 0) + (Number(away.mid) || 0) + (Number(away.def) || 0)) / 3;
  const difference = Math.abs(overallHome - overallAway);
  const overallRead = difference >= 5
    ? `${overallHome > overallAway ? home.name : away.name} parte con una ventaja teórica en el perfil colectivo, pero tendrá que transformarla en control de las áreas. ${overallHome > overallAway ? away.name : home.name} puede equilibrar el choque con disciplina, eficiencia en las transiciones y aprovechando las situaciones a balón parado.`
    : `El perfil colectivo de ambos equipos es relativamente parejo. El partido puede depender de quién consiga imponer su ritmo, proteger mejor la zona central y convertir sus mejores llegadas en ocasiones claras.`;

  const tags = [...new Set([...(context.tags ?? []), ...(rivalry ? [rivalry.title] : []), ...homePlan.tags.slice(0, 1), ...awayPlan.tags.slice(0, 1)])].slice(0, 6);
  return {
    tags,
    contextTitle: context.title,
    contextBody: context.body,
    homeForm,
    awayForm,
    homePlan,
    awayPlan,
    rivalry,
    keyBattle,
    previousMeeting: previousMeetingText(save, fixture, home, away, allPlayed),
    individualRuns,
    overallRead,
  };
}
