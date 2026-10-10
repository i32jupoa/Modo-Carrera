/**
 * Utilidades de redacción para las noticias: artículos, apodos de clubes,
 * formato de importes y un RNG sembrado para que cada noticia suene distinta
 * pero siga siendo idéntica al recargar.
 */

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type Rng = () => number;

export function rngFor(seed: string): Rng {
  let a = hashStr(seed);
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: Rng, options: readonly T[]): T {
  return options[Math.floor(rng() * options.length)];
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

// ---------------------------------------------------------------- artículos
const FEMININE = new Set([
  "juventus",
  "roma",
  "lazio",
  "fiorentina",
  "atalanta",
  "sampdoria",
  "real sociedad",
  "cremonese",
  "salernitana",
  "spezia",
  "la real",
  "unión deportiva las palmas",
]);

function isFem(name: string): boolean {
  return FEMININE.has(name.trim().toLowerCase());
}

/** "el Real Madrid" / "la Juventus". */
export function the(name: string): string {
  return `${isFem(name) ? "la" : "el"} ${name}`;
}
export function The(name: string): string {
  return `${isFem(name) ? "La" : "El"} ${name}`;
}
/** "del Real Madrid" / "de la Juventus". */
export function deThe(name: string): string {
  return isFem(name) ? `de la ${name}` : `del ${name}`;
}
/** "al Real Madrid" / "a la Juventus". */
export function aThe(name: string): string {
  return isFem(name) ? `a la ${name}` : `al ${name}`;
}

// ---------------------------------------------------------------- apodos
const NICKNAMES: Array<[RegExp, string[]]> = [
  [/^real madrid/i, ["el conjunto blanco", "los blancos", "el cuadro merengue"]],
  [/^(fc )?barcelona/i, ["el conjunto azulgrana", "el equipo culé", "los azulgranas"]],
  [/atl[eé]tico de madrid|^atl[eé]tico/i, ["los colchoneros", "el conjunto rojiblanco"]],
  [/manchester city/i, ["los citizens", "el conjunto celeste"]],
  [/manchester united/i, ["los diablos rojos", "el conjunto de Old Trafford"]],
  [/^liverpool/i, ["los reds", "el conjunto de Anfield"]],
  [/^arsenal/i, ["los gunners", "el conjunto londinense"]],
  [/^chelsea/i, ["los blues", "el conjunto de Stamford Bridge"]],
  [/tottenham/i, ["los spurs"]],
  [/bayern/i, ["el conjunto bávaro", "el gigante bávaro"]],
  [/dortmund/i, ["el conjunto aurinegro"]],
  [/^juventus/i, ["la Vecchia Signora", "el conjunto bianconero"]],
  [/^(ac )?milan/i, ["el conjunto rossonero"]],
  [/^inter/i, ["el conjunto nerazzurro"]],
  [/napoli|nápoles/i, ["el conjunto partenopeo"]],
  [/paris|psg/i, ["el conjunto parisino"]],
  [/sevilla/i, ["el conjunto hispalense"]],
  [/valencia/i, ["el conjunto ché"]],
  [/athletic/i, ["los leones"]],
  [/villarreal/i, ["el submarino amarillo"]],
  [/betis/i, ["el conjunto verdiblanco"]],
];

/** Nombre del club con artículo, o un apodo si existe (sin artículo extra). */
export function clubRef(name: string, rng: Rng, nicknameChance = 0.35): string {
  if (chance(rng, nicknameChance)) {
    for (const [re, nicks] of NICKNAMES) {
      if (re.test(name)) return pick(rng, nicks);
    }
  }
  return the(name);
}

export function ClubRef(name: string, rng: Rng, nicknameChance = 0.35): string {
  const s = clubRef(name, rng, nicknameChance);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------- formatos
export function formatM(euros: number): string {
  if (euros >= 1_000_000) {
    const m = euros / 1_000_000;
    const txt = m >= 100 ? Math.round(m).toString() : (Math.round(m * 10) / 10).toString().replace(".", ",");
    return `${txt} M€`;
  }
  if (euros >= 1000) return `${Math.round(euros / 1000)} K€`;
  return `${Math.round(euros)} €`;
}

export function ordinalPos(n: number): string {
  return `${n}º`;
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? `${n} ${one}` : `${n} ${many}`;
}

export function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}


// ---------------------------------------------------------------- noticias de la carrera
import type { NewsCategory, NewsEvent } from "./NewsEvents";
import { teamById } from "@/data/teams";

export type NewsRenderedItem = {
  id: string;
  event: NewsEvent;
  category: NewsCategory;
  title: string;
  intro: string;
  body: string;
};

function stablePick<T>(seed: string, options: readonly T[]): T {
  if (!options.length) throw new Error("stablePick necesita al menos una opción");
  return options[hashStr(seed) % options.length];
}

function resolvedTeamName(id: string | undefined, name: string | undefined, fallback: string): string {
  if (name?.trim()) return name.trim();
  if (id) {
    const team = teamById(id);
    if (team?.name) return team.name;
  }
  return fallback;
}

/**
 * Convierte un hecho estructurado en un artículo periodístico determinista.
 * Sólo usa datos guardados en el hecho; no inventa estadísticas ni resultados.
 */
export function renderNewsEvent(event: NewsEvent): NewsRenderedItem {
  const { data, entities } = event;
  const rngSeed = event.id || `${event.date}:${event.type}`;
  const player = data.scorerNames?.[0] || entities.playerIds?.[0] || "El protagonista";
  const homeId = data.homeId || entities.teamIds?.[0];
  const awayId = data.awayId || entities.teamIds?.[1];
  const home = resolvedTeamName(homeId, data.homeName, "El equipo local");
  const away = resolvedTeamName(awayId, data.awayName, "El equipo visitante");
  const homeGoals = Number.isFinite(data.homeGoals) ? Number(data.homeGoals) : undefined;
  const awayGoals = Number.isFinite(data.awayGoals) ? Number(data.awayGoals) : undefined;
  const score = data.result || (homeGoals !== undefined && awayGoals !== undefined ? `${homeGoals}-${awayGoals}` : "resultado no disponible");
  const team = resolvedTeamName(data.teamId || entities.teamIds?.[0], data.teamName, home);
  const fee = typeof data.transferFee === "number" ? formatM(data.transferFee) : "un importe no especificado";
  let title = "Actualidad del fútbol";
  let intro = "La actualidad de la temporada deja un nuevo capítulo.";
  let body = "La noticia se basa en los datos registrados en la partida.";

  switch (event.type) {
    case "match": {
      const titles = [
        `${home} y ${away}: un duelo que deja huella`,
        `${home} ${score} ${away}: crónica del encuentro`,
        `Así queda el partido entre ${home} y ${away}`,
      ];
      title = stablePick(`${rngSeed}:match:title`, titles);
      intro = `${home} ${score} ${away}${data.competition ? `, en ${data.competition}` : ""}.`;
      const scorers = data.scorerNames?.length ? `Goleadores registrados: ${listJoin(data.scorerNames)}.` : "No constan goleadores individualizados en el registro del encuentro.";
      const minutes = data.goalMinutes?.length ? ` Los goles llegaron en los minutos ${data.goalMinutes.join(", ")} .`.replace("  .", ".") : "";
      body = `${stablePick(`${rngSeed}:match:body`, ["El marcador refleja lo sucedido sobre el césped.", "El resultado queda incorporado a la crónica de la temporada.", "El encuentro ya forma parte del historial competitivo de ambos equipos."])} ${scorers}${minutes}`;
      if (data.isComeback) body += " El equipo ganador tuvo que reaccionar tras verse por detrás.";
      if (data.isBigWin) body += " La diferencia final convierte el resultado en una victoria amplia.";
      break;
    }
    case "player_achievement": {
      const count = data.playerGoalCount ?? data.totalGoals ?? data.scorerNames?.length ?? 0;
      title = data.poker ? `${player} firma un póker` : data.hatTrick ? `${player} marca un triplete` : `${player} destaca en la temporada`;
      intro = count > 0 ? `${player} ha registrado ${count} goles en el encuentro.` : `${player} figura entre los protagonistas de la jornada.`;
      body = `${data.competition ? `En ${data.competition}, ` : ""}${player} suma una actuación destacada según las estadísticas registradas.`;
      break;
    }
    case "standings_change": {
      title = data.newPosition === 1 ? `${team} alcanza el liderato` : `${team} cambia de posición`;
      intro = data.newPosition && data.previousPosition ? `${team} pasa de la posición ${data.previousPosition} a la ${data.newPosition}.` : `${team} modifica su situación en la clasificación.`;
      body = `${data.matchesRemaining !== undefined ? `Quedan ${data.matchesRemaining} jornadas o partidos por disputarse. ` : ""}${data.leaderGap !== undefined ? `La diferencia con el liderato es de ${data.leaderGap} puntos. ` : ""}La información corresponde a la comparación de las tablas guardadas.`;
      break;
    }
    case "transfer": {
      const from = resolvedTeamName(data.fromClubId ?? undefined, data.fromClubName, "su anterior club");
      const to = resolvedTeamName(data.toClubId, data.toClubName, "su nuevo club");
      title = `${player} cambia de equipo`;
      intro = `${player} pasa de ${from} a ${to}.`;
      body = data.transferFee === 0 ? "La operación figura como gratuita en los datos de mercado." : `El importe registrado de la operación es ${fee}.`;
      if (data.isTransferRecord) body += " La operación se registra como un nuevo récord de traspaso.";
      break;
    }
    case "injury": {
      title = `Parte médico: ${player}`;
      intro = `${player} aparece en el registro de lesiones${data.injuryType ? ` por ${data.injuryType}` : ""}.`;
      body = data.durationDays !== undefined ? `La duración estimada registrada es de ${data.durationDays} días.` : "La duración todavía no consta en el parte médico.";
      if (data.bodyPart) body += ` Zona afectada: ${data.bodyPart}.`;
      break;
    }
    case "suspension": {
      title = `${player}, pendiente de sanción`;
      intro = `${player} ha quedado asociado a una sanción disciplinaria.`;
      body = data.suspensionMatches !== undefined ? `La sanción registrada es de ${data.suspensionMatches} partido(s).` : "La duración de la sanción no consta en el registro.";
      if (data.cardType === "second-yellow") body += " La expulsión se produjo por doble amonestación.";
      break;
    }
    case "competition_result": {
      title = `${team}: resolución de la competición`;
      intro = data.consequence || `${team} ya tiene registrado su resultado en la competición.`;
      body = data.competition ? `Competición: ${data.competition}.` : "El resultado queda incorporado al historial de la competición.";
      break;
    }
    default: {
      title = "Novedades de la temporada";
      intro = `${team} vuelve a ser protagonista de la actualidad.`;
      body = "La noticia se genera a partir de los hechos estructurados guardados en la partida.";
    }
  }

  return { id: event.id, event, category: event.category, title, intro, body };
}
