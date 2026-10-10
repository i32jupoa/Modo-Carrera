/**
 * Motor de noticias REALES.
 *
 * Todas las noticias se DERIVAN del estado de la partida (resultados,
 * clasificaciones, historial de traspasos, renovaciones, Europa y copas).
 * No hay datos inventados: si un hecho no existe en la partida, no hay noticia.
 *
 * Al ser una función pura (SaveGame + historiales -> noticias), no ocupa nada
 * en el guardado ni en localStorage, y el texto es determinista por noticia
 * (RNG sembrado por el id del hecho) pero con estructuras y vocabulario
 * variables, de modo que dos noticias del mismo tipo no suenan igual.
 */

import { LEAGUES, teamById } from "@/data/teams";
import type { Fixture } from "@/lib/season";
import type { SaveGame } from "@/lib/store";
import { getPlayer } from "@/lib/transfers/PlayerIndex";
import { listRenewals } from "@/lib/transfers/RenewalLog";
import { listTransfers } from "@/lib/transfers/TransferHistory";
import {
  ClubRef,
  aThe,
  capitalize,
  clubRef,
  deThe,
  formatM,
  listJoin,
  pick,
  plural,
  rngFor,
  the,
  The,
  type Rng,
} from "./newsText";

// ============================================================================
// TIPOS
// ============================================================================

export type NewsCat = "club" | "liga" | "europa" | "mercado" | "jugadores" | "lesiones";

/** Temática visual de la ventana de la noticia. */
export type NewsTheme =
  | "liga"
  | "copa"
  | "ucl"
  | "uel"
  | "uecl"
  | "fichaje"
  | "cesion"
  | "renovacion"
  | "lesion"
  | "jugador";

export interface NewsTransfer {
  fromId?: string;
  toId: string;
  kind: "permanent" | "loan" | "free";
  fee: number;
}

export interface NewsInjury {
  playerId: string;
  playerName: string;
  clubId: string;
  days: number;
  returnDate?: string;
}

export interface NewsVisual {
  teamIds: string[];
  players: Array<{ id: string; name: string }>;
  /** Nombres de país (para banderas, p. ej. "España"). */
  countries: string[];
  leagueId?: string;
}

export interface NewsFact {
  label: string;
  value: string;
}

export interface NewsItem {
  id: string;
  cat: NewsCat;
  icon: string;
  title: string;
  lead: string;
  body: string[];
  facts: NewsFact[];
  visual: NewsVisual;
  /** Relevancia 0-100 (se usa para ordenar y variar). */
  score: number;
  /** Etiqueta temporal legible ("Jornada 12", "Mercado de verano"...). */
  when: string;
  mine: boolean;
  /** Temática de la ventana (colores). Se completa siempre en `buildGameNews`. */
  theme?: NewsTheme;
  /** Partido al que se refiere la noticia (se muestra como en Jornadas y abre sus estadísticas). */
  fixture?: Fixture;
  /** Datos del traspaso (para pintar club origen → club destino). */
  transfer?: NewsTransfer;
  /** Datos de la lesión. */
  injury?: NewsInjury;
}

const TOP_LEAGUES = ["laliga", "premier", "seriea", "bundesliga", "ligue1"];

// ============================================================================
// HELPERS DE DATOS
// ============================================================================

function safeTeam(id: string) {
  try {
    return teamById(id);
  } catch {
    return null;
  }
}
function nameOf(id: string): string {
  return safeTeam(id)?.name ?? id;
}
function strengthOf(id: string): number {
  const t = safeTeam(id);
  return t ? (t.att + t.mid + t.def) / 3 : 70;
}
function prestige(id: string): number {
  return Math.max(0, Math.min(1, (strengthOf(id) - 65) / 25));
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function leagueCountry(leagueId?: string): string | undefined {
  if (!leagueId) return undefined;
  return (LEAGUES as Record<string, { country?: string }>)[leagueId]?.country;
}
const PRETTY_LEAGUES: Record<string, string> = {
  "LALIGA EA SPORTS": "LaLiga EA Sports",
  "LALIGA HYPERMOTION": "LaLiga Hypermotion",
};
function leagueName(leagueId: string): string {
  const raw = (LEAGUES as Record<string, { name?: string }>)[leagueId]?.name ?? leagueId;
  return PRETTY_LEAGUES[raw] ?? raw;
}
function nationOfPlayer(id: string): string | undefined {
  const n = getPlayer(id)?.nation;
  return n && n.trim() ? n : undefined;
}
function fmtXg(n: number): string {
  return (Math.round(n * 10) / 10).toString().replace(".", ",");
}
function minuteTxt(m: number): string {
  return `${Math.round(m)}'`;
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function visualFor(args: {
  teams: string[];
  players?: Array<{ id: string; name: string }>;
  leagueId?: string;
}): NewsVisual {
  const players = (args.players ?? []).slice(0, 3);
  const countries = dedupe(
    [
      ...players.map((p) => nationOfPlayer(p.id)),
      leagueCountry(args.leagueId ?? safeTeam(args.teams[0])?.league),
    ].filter((c): c is string => !!c),
  ).slice(0, 3);
  return {
    teamIds: dedupe(args.teams).slice(0, 3),
    players,
    countries,
    leagueId: args.leagueId,
  };
}

// ============================================================================
// CLASIFICACIONES DERIVADAS DE LOS PARTIDOS
// ============================================================================

interface Row {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

function tableAt(fixtures: Fixture[], upToMatchday: number): Row[] {
  const map = new Map<string, Row>();
  const get = (id: string): Row => {
    let r = map.get(id);
    if (!r) {
      r = { teamId: id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
      map.set(id, r);
    }
    return r;
  };
  for (const f of fixtures) {
    get(f.homeId);
    get(f.awayId);
    if (!f.result || f.matchday > upToMatchday) continue;
    const h = get(f.homeId);
    const a = get(f.awayId);
    const hg = f.result.homeGoals;
    const ag = f.result.awayGoals;
    h.played++;
    a.played++;
    h.gf += hg;
    h.ga += ag;
    a.gf += ag;
    a.ga += hg;
    if (hg > ag) {
      h.won++;
      h.points += 3;
      a.lost++;
    } else if (hg < ag) {
      a.won++;
      a.points += 3;
      h.lost++;
    } else {
      h.drawn++;
      a.drawn++;
      h.points++;
      a.points++;
    }
  }
  const rows = [...map.values()].map((r) => ({ ...r, gd: r.gf - r.ga }));
  rows.sort(
    (x, y) =>
      y.points - x.points ||
      y.gd - x.gd ||
      y.gf - x.gf ||
      nameOf(x.teamId).localeCompare(nameOf(y.teamId)),
  );
  return rows;
}

function posOf(table: Row[], teamId: string): number {
  return table.findIndex((r) => r.teamId === teamId) + 1;
}
function rowOf(table: Row[], teamId: string): Row | undefined {
  return table.find((r) => r.teamId === teamId);
}

// ============================================================================
// ANÁLISIS DE UN PARTIDO
// ============================================================================

interface GoalEv {
  minute: number;
  side: "home" | "away";
  scorer: string;
  scorerId: string;
  kind: string;
}

interface MatchInfo {
  f: Fixture;
  hg: number; // goles totales (incluida prórroga)
  ag: number;
  outcome: "home" | "away" | "draw";
  winnerId?: string;
  loserId?: string;
  goals: GoalEv[];
  hasTimeline: boolean;
  comeback: boolean;
  deficit: number;
  decisive?: GoalEv;
  late: boolean;
  shootout: boolean;
  extraTime: boolean;
  hatTrick?: { id: string; name: string; goals: number; side: "home" | "away"; minutes: number[] };
  redCards: Array<{ name: string; minute: number; side: "home" | "away" }>;
  xgH?: number;
  xgA?: number;
  upset: boolean;
}

function analyze(f: Fixture): MatchInfo | null {
  const r = f.result;
  if (!r) return null;
  const etH = r.extraTime?.homeGoals ?? 0;
  const etA = r.extraTime?.awayGoals ?? 0;
  const hg = r.homeGoals + etH;
  const ag = r.awayGoals + etA;

  const rawEvents = [...(r.events ?? []), ...(r.extraTime?.events ?? [])].filter(
    (e) => e.type !== "penalty",
  );
  const goals: GoalEv[] = rawEvents
    .map((e) => ({
      minute: e.minute,
      side: e.team,
      scorer: e.scorerName,
      scorerId: e.scorerId,
      kind: e.type,
    }))
    .sort((a, b) => a.minute - b.minute);
  const hasTimeline = goals.length === hg + ag && goals.length > 0;

  let outcome: MatchInfo["outcome"] = hg > ag ? "home" : hg < ag ? "away" : "draw";
  let shootout = false;
  if (outcome === "draw" && r.penalties) {
    shootout = true;
    outcome = r.penalties.homeGoals > r.penalties.awayGoals ? "home" : "away";
  }
  const winnerId =
    outcome === "draw" ? undefined : outcome === "home" ? f.homeId : f.awayId;
  const loserId = outcome === "draw" ? undefined : outcome === "home" ? f.awayId : f.homeId;

  // Línea temporal: remontada y gol decisivo (solo si es fiable).
  let comeback = false;
  let deficit = 0;
  let decisive: GoalEv | undefined;
  const regularWin = hg !== ag;
  if (hasTimeline && regularWin) {
    const winSide: "home" | "away" = hg > ag ? "home" : "away";
    let h = 0;
    let a = 0;
    const diffs: number[] = [];
    for (const g of goals) {
      if (g.side === "home") h++;
      else a++;
      const d = winSide === "home" ? h - a : a - h;
      diffs.push(d);
      if (d < 0) {
        comeback = true;
        deficit = Math.max(deficit, -d);
      }
    }
    // gol decisivo = primer gol tras el cual el ganador ya no deja de ir por delante
    let lastNotAhead = -1;
    diffs.forEach((d, i) => {
      if (d <= 0) lastNotAhead = i;
    });
    const idx = lastNotAhead + 1;
    if (idx < goals.length && goals[idx].side === winSide) decisive = goals[idx];
    // si el ganador iba por detrás al inicio de la remontada, el último empate es relevante
    if (!comeback) {
      // victoria sin remontada: el decisivo es el que fija la ventaja definitiva
    }
  }
  const late = !!decisive && decisive.minute >= 85 && (hg - ag === 1 || ag - hg === 1);

  // Hat-trick (excluye goles en propia puerta)
  const perScorer = new Map<string, { name: string; side: "home" | "away"; minutes: number[] }>();
  for (const g of goals) {
    if (g.kind === "own_goal" || !g.scorerId) continue;
    const cur = perScorer.get(g.scorerId) ?? { name: g.scorer, side: g.side, minutes: [] };
    cur.minutes.push(g.minute);
    perScorer.set(g.scorerId, cur);
  }
  let hatTrick: MatchInfo["hatTrick"];
  for (const [id, v] of perScorer) {
    if (v.minutes.length >= 3 && (!hatTrick || v.minutes.length > hatTrick.goals)) {
      hatTrick = { id, name: v.name, goals: v.minutes.length, side: v.side, minutes: v.minutes };
    }
  }

  const redCards = (r.cards ?? [])
    .filter((c) => c.cardType === "red" || c.isSecondYellow)
    .map((c) => ({ name: c.playerName, minute: c.minute, side: c.team }));

  const upset =
    !!winnerId &&
    !!loserId &&
    strengthOf(loserId) - strengthOf(winnerId) >= 6 &&
    Math.abs(hg - ag) >= 1;

  return {
    f,
    hg,
    ag,
    outcome,
    winnerId,
    loserId,
    goals,
    hasTimeline,
    comeback,
    deficit,
    decisive,
    late,
    shootout,
    extraTime: !!r.extraTime,
    hatTrick,
    redCards,
    xgH: r.xgHome,
    xgA: r.xgAway,
    upset,
  };
}

// ============================================================================
// CONTEXTO COMPARTIDO
// ============================================================================

interface Ctx {
  save: SaveGame;
  myId: string;
}

function isMine(ctx: Ctx, ...ids: Array<string | undefined>): boolean {
  return ids.some((id) => id === ctx.myId);
}

// ============================================================================
// REDACCIÓN DE UN PARTIDO
// ============================================================================

interface TableContext {
  leagueId: string;
  md: number;
  before: Row[];
  after: Row[];
  totalMd: number;
}

function scoreLine(m: MatchInfo): string {
  const base = `${m.f.result!.homeGoals + (m.f.result!.extraTime?.homeGoals ?? 0)}-${
    m.f.result!.awayGoals + (m.f.result!.extraTime?.awayGoals ?? 0)
  }`;
  return base;
}

function goalsOfSide(m: MatchInfo, side: "home" | "away"): GoalEv[] {
  return m.goals.filter((g) => g.side === side);
}

function goalList(goals: GoalEv[]): string {
  const groups = new Map<string, GoalEv[]>();
  for (const g of goals) {
    const arr = groups.get(g.scorer) ?? [];
    arr.push(g);
    groups.set(g.scorer, arr);
  }
  return listJoin(
    [...groups.entries()].map(([name, gs]) => {
      const mins = gs.map(
        (g) =>
          `${minuteTxt(g.minute)}${g.kind === "own_goal" ? " en propia" : g.kind === "penalty_goal" ? " de penalti" : ""}`,
      );
      return `${name} (${mins.join(", ")})`;
    }),
  );
}

function sideOf(m: MatchInfo, teamId: string): "home" | "away" {
  return m.f.homeId === teamId ? "home" : "away";
}

function howParagraph(m: MatchInfo, rng: Rng): string {
  const hName = nameOf(m.f.homeId);
  const aName = nameOf(m.f.awayId);
  const score = scoreLine(m);

  if (!m.hasTimeline) {
    if (m.outcome === "draw") return `El encuentro entre ${the(hName)} y ${the(aName)} acabó ${score}.`;
    const w = nameOf(m.winnerId!);
    const l = nameOf(m.loserId!);
    return pick(rng, [
      `${The(w)} se impuso ${aThe(l)} por ${score}.`,
      `El marcador final fue ${score} a favor ${deThe(w)} frente ${aThe(l)}.`,
    ]);
  }

  const parts: string[] = [];
  const first = m.goals[0];
  const firstTeam = nameOf(first.side === "home" ? m.f.homeId : m.f.awayId);

  if (m.comeback && m.winnerId && m.loserId) {
    const w = nameOf(m.winnerId);
    const l = nameOf(m.loserId);
    const wSide = sideOf(m, m.winnerId);
    const lSide = wSide === "home" ? "away" : "home";
    const lGoalsEarly = goalsOfSide(m, lSide).slice(0, m.deficit);
    parts.push(
      pick(rng, [
        `${The(l)} se puso por delante con ${goalList(lGoalsEarly)} y parecía tener el partido controlado.`,
        `El guion empezó torcido para ${the(w)}: ${goalList(lGoalsEarly)} adelantaba ${aThe(l)}.`,
        `${The(l)} golpeó primero, con ${goalList(lGoalsEarly)}.`,
      ]),
    );
    const reply = goalsOfSide(m, wSide);
    parts.push(
      pick(rng, [
        `${The(w)} reaccionó y le dio la vuelta con tantos de ${goalList(reply)}.`,
        `La respuesta llegó con ${goalList(reply)}, y el partido cambió de dueño.`,
        `Pero ${the(w)} no se rindió: ${goalList(reply)} firmaron la remontada.`,
      ]),
    );
  } else if (m.outcome === "draw") {
    parts.push(
      pick(rng, [
        `${capitalize(clubRef(firstTeam, rng, 0.2))} abrió el marcador con gol de ${first.scorer} (${minuteTxt(first.minute)}), pero el partido terminó igualado.`,
        `Los goles de ${goalList(m.goals.slice(0, 4))} dibujaron un ${score} sin vencedor.`,
      ]),
    );
  } else {
    const w = nameOf(m.winnerId!);
    const wSide = sideOf(m, m.winnerId!);
    const wGoals = goalsOfSide(m, wSide);
    parts.push(
      pick(rng, [
        `${The(w)} marcó por medio de ${goalList(wGoals)}.`,
        `Los goles ${deThe(w)} llevaron la firma de ${goalList(wGoals)}.`,
        `${capitalize(goalList(wGoals))} dejaron el partido visto para ${the(w)}.`,
      ]),
    );
  }

  if (m.decisive && m.winnerId && !m.shootout && (m.comeback || Math.abs(m.hg - m.ag) === 1)) {
    const d = m.decisive;
    parts.push(
      m.late
        ? pick(rng, [
            `El golpe definitivo llegó en el minuto ${minuteTxt(d.minute)} con el tanto de ${d.scorer}, cuando casi nadie esperaba ya un ganador.`,
            `${d.scorer} lo decidió en el ${minuteTxt(d.minute)}, en una recta final de infarto.`,
          ])
        : pick(rng, [
            `El gol que inclinó la balanza fue el de ${d.scorer} en el ${minuteTxt(d.minute)}.`,
            `${d.scorer} firmó el tanto decisivo en el minuto ${minuteTxt(d.minute)}.`,
          ]),
    );
  }

  if (m.shootout && m.f.result?.penalties) {
    const p = m.f.result.penalties;
    parts.push(
      `Tras empatar a ${scoreLine(m)}, la eliminatoria se resolvió en los penaltis (${p.homeGoals}-${p.awayGoals}).`,
    );
  }
  return parts.join(" ");
}

function whyParagraph(m: MatchInfo, rng: Rng): string | null {
  const out: string[] = [];
  const hName = nameOf(m.f.homeId);
  const aName = nameOf(m.f.awayId);

  if (m.xgH != null && m.xgA != null && m.xgH + m.xgA > 0.5) {
    const hx = fmtXg(m.xgH);
    const ax = fmtXg(m.xgA);
    if (m.winnerId) {
      const winSide = sideOf(m, m.winnerId);
      const xW = winSide === "home" ? m.xgH : m.xgA;
      const xL = winSide === "home" ? m.xgA : m.xgH;
      const w = nameOf(m.winnerId);
      const l = nameOf(m.loserId!);
      if (xW > xL + 0.5) {
        out.push(
          pick(rng, [
            `Los números respaldan el resultado: ${the(w)} generó más peligro (xG ${fmtXg(xW)} frente a ${fmtXg(xL)}).`,
            `El dominio fue real: xG de ${fmtXg(xW)} para ${the(w)} y ${fmtXg(xL)} para ${the(l)}.`,
          ]),
        );
      } else if (xL > xW + 0.5) {
        out.push(
          pick(rng, [
            `Victoria con premio extra por eficacia: ${the(l)} tuvo más ocasiones (xG ${fmtXg(xL)} a ${fmtXg(xW)}) y no lo aprovechó.`,
            `Pese a generar menos peligro (xG ${fmtXg(xW)} por ${fmtXg(xL)}), ${the(w)} fue letal cuando tuvo la suya.`,
          ]),
        );
      }
    } else if (Math.abs(m.xgH - m.xgA) < 0.5) {
      out.push(`El reparto de puntos refleja un partido equilibrado (xG ${hx} - ${ax}).`);
    }
  }

  if (m.upset && m.winnerId && m.loserId) {
    out.push(
      pick(rng, [
        `Sobre el papel ${the(nameOf(m.loserId))} partía como favorito, lo que convierte el resultado en una de las sorpresas de la jornada.`,
        `Es un resultado inesperado: ${the(nameOf(m.winnerId))} venía con menos nivel de plantilla que su rival.`,
      ]),
    );
  }

  if (m.redCards.length > 0) {
    const rc = m.redCards[0];
    const team = rc.side === "home" ? hName : aName;
    out.push(
      pick(rng, [
        `La expulsión de ${rc.name} (${minuteTxt(rc.minute)}) dejó a ${the(team)} con diez y condicionó el desenlace.`,
        `Todo cambió tras la roja a ${rc.name} en el minuto ${rc.minute}.`,
      ]),
    );
  }
  return out.length ? out.join(" ") : null;
}

function tableParagraph(m: MatchInfo, t: TableContext | null, rng: Rng): string | null {
  if (!t) return null;
  const parts: string[] = [];
  const ids = [m.winnerId ?? m.f.homeId, m.loserId ?? m.f.awayId];
  const leader = t.after[0];
  for (const id of ids) {
    const pa = posOf(t.after, id);
    const pb = posOf(t.before, id);
    const row = rowOf(t.after, id);
    if (!pa || !row) continue;
    const name = nameOf(id);
    const spot = pa === 1 ? "el liderato" : `el puesto ${pa}`;
    let move = "";
    if (pb && pa < pb) move = pick(rng, [`escala hasta ${spot}`, `sube del ${pb}º al ${pa}º`]);
    else if (pb && pa > pb) move = pick(rng, [`cae hasta ${spot}`, `baja del ${pb}º al ${pa}º`]);
    else move = pick(rng, [`se mantiene ${pa}º`, `continúa en ${spot}`]);
    const gapPts = leader ? leader.points - row.points : 0;
    const gap =
      leader && leader.teamId !== id
        ? gapPts > 0
          ? ` a ${plural(gapPts, "punto", "puntos")} del líder`
          : " igualado a puntos con el líder"
        : "";
    parts.push(`${the(name)} ${move} con ${plural(row.points, "punto", "puntos")}${gap}`);
  }
  const intro = pick(rng, ["En la clasificación,", "Con este resultado,", "Tras la jornada,"]);
  return parts.length ? `${intro} ${parts.join("; ")}.` : null;
}

interface MatchStoryOpts {
  m: MatchInfo;
  ctx: Ctx;
  cat: NewsCat;
  when: string;
  compLabel: string;
  table: TableContext | null;
  leagueId?: string;
  idPrefix: string;
}

function matchStory(o: MatchStoryOpts): NewsItem | null {
  const { m, ctx } = o;
  const f = m.f;
  const mine = isMine(ctx, f.homeId, f.awayId);
  const hName = nameOf(f.homeId);
  const aName = nameOf(f.awayId);
  const rng = rngFor(`news:${o.idPrefix}:${f.id}`);
  const goalsTotal = m.hg + m.ag;
  const diff = Math.abs(m.hg - m.ag);
  const posH = o.table ? posOf(o.table.before, f.homeId) : 0;
  const posA = o.table ? posOf(o.table.before, f.awayId) : 0;
  const bigClash = !!o.table && o.table.md >= 4 && posH > 0 && posA > 0 && posH <= 4 && posA <= 4;
  const thrash = !m.shootout && diff >= 4;
  const thriller = goalsTotal >= 6;
  const hat = m.hatTrick;
  const newLeader =
    !!o.table &&
    !!hat &&
    o.table.after[0]?.teamId === (hat.side === "home" ? f.homeId : f.awayId) &&
    o.table.before[0]?.teamId !== o.table.after[0]?.teamId;

  const flagged =
    !!hat || m.comeback || m.upset || thrash || thriller || m.late || bigClash || m.shootout;
  if (!flagged && !mine) return null;

  // ---- puntuación
  let score = 28 + 22 * ((prestige(f.homeId) + prestige(f.awayId)) / 2);
  if (hat) score += 20 + (hat.goals - 3) * 8;
  if (m.comeback) score += 16 + m.deficit * 3;
  if (m.upset) score += 16;
  if (thrash) score += 12;
  if (thriller) score += 10;
  if (m.late) score += 10;
  if (bigClash) score += 14;
  if (m.shootout) score += 10;
  if (newLeader) score += 12;
  if (mine) score += 22;
  if (o.cat === "europa") score += 6;

  const W = m.winnerId ? nameOf(m.winnerId) : "";
  const L = m.loserId ? nameOf(m.loserId) : "";
  const sl = scoreLine(m);

  // ---- titular
  let title = "";
  let icon = "📰";
  if (hat) {
    const hatTeam = nameOf(hat.side === "home" ? f.homeId : f.awayId);
    const noun = hat.goals >= 4 ? (hat.goals === 4 ? "Póker de goles" : `${hat.goals} goles`) : "Hat-trick";
    icon = "🎩";
    if (newLeader) {
      title = pick(rng, [
        `${noun} de ${hat.name} para poner líder ${aThe(hatTeam)}`,
        `${noun} de ${hat.name} y ${the(hatTeam)} se sube al liderato`,
        `${hat.name} lo borda con ${hat.goals === 3 ? "un hat-trick" : `${hat.goals} goles`} y ${the(hatTeam)} manda en la tabla`,
      ]);
    } else {
      title = pick(rng, [
        `${noun} de ${hat.name} ${m.outcome === "draw" ? `en el ${sl} ante ${nameOf(hat.side === "home" ? f.awayId : f.homeId)}` : `en el ${sl} ${deThe(hatTeam)}`}`,
        `Noche mágica de ${hat.name}: ${hat.goals} goles con ${the(hatTeam)}`,
        `${hat.name} se lo lleva a casa: ${hat.goals} goles en un ${sl}`,
      ]);
    }
  } else if (m.comeback && W) {
    icon = "🔁";
    const adj = m.late ? "de infarto" : goalsTotal >= 5 ? "loco" : "muy intenso";
    title = pick(rng, [
      `${The(W)} le remonta ${aThe(L)} en un partido ${adj}`,
      `Remontada ${deThe(W)}: de ir perdiendo a ganar ${sl}${m.late ? " sobre la bocina" : ""}`,
      `${ClubRef(W, rng)} da la vuelta al marcador y gana ${sl} ${aThe(L)}`,
      `Reacción de campeón: ${the(W)} remonta ${m.deficit > 1 ? `un ${m.deficit}-0` : "y se lleva el partido"} ante ${the(L)}`,
    ]);
  } else if (m.shootout && W) {
    icon = "🥅";
    title = pick(rng, [
      `${The(W)} elimina ${aThe(L)} en los penaltis`,
      `Tanda de nervios: ${the(W)} supera ${aThe(L)} desde los once metros`,
    ]);
  } else if (m.upset && W) {
    icon = "😮";
    title = pick(rng, [
      `Sorpresa mayúscula: ${the(W)} derriba ${aThe(L)} (${sl})`,
      `${The(W)} da la campanada ante ${the(L)}`,
      `Palo para ${the(L)}: cae ${sl} ante ${the(W)}`,
    ]);
  } else if (thrash && W) {
    icon = "💥";
    title = pick(rng, [
      `Goleada ${deThe(W)}: ${sl} ${aThe(L)}`,
      `${The(W)} arrolla ${aThe(L)} con un contundente ${sl}`,
      `Exhibición ${deThe(W)}, que se pasea ${sl} ante ${the(L)}`,
    ]);
  } else if (thriller) {
    icon = "🎆";
    title = pick(rng, [
      `Festival de goles entre ${the(hName)} y ${the(aName)}: ${sl}`,
      `${goalsTotal} goles en un partidazo: ${hName} ${sl} ${aName}`,
    ]);
  } else if (m.late && W) {
    icon = "⏱️";
    title = pick(rng, [
      `${The(W)} se lleva un triunfo agónico ante ${the(L)}`,
      `Sufrimiento y premio: ${the(W)} gana ${sl} en el tramo final`,
    ]);
  } else if (bigClash) {
    icon = "⚔️";
    title =
      m.outcome === "draw"
        ? `${The(hName)} y ${the(aName)} se anulan en un duelo de altura (${sl})`
        : `${The(W)} gana el duelo de gigantes ${aThe(L)} (${sl})`;
  } else if (mine) {
    if (m.outcome === "draw") {
      title = pick(rng, [
        `${The(hName)} y ${the(aName)} reparten puntos (${sl})`,
        `Empate ${sl} entre ${the(hName)} y ${the(aName)}`,
      ]);
    } else {
      title = pick(rng, [
        `${The(W)} suma tres puntos ante ${the(L)} (${sl})`,
        `${The(W)} gana ${sl} ${aThe(L)}`,
        `Triunfo ${deThe(W)} ${m.winnerId === f.homeId ? "en casa" : "a domicilio"}: ${sl} ${aThe(L)}`,
      ]);
    }
    icon = m.outcome === "draw" ? "🤝" : "🏟️";
  }

  // ---- entradilla
  const lead = pick(rng, [
    `${o.compLabel}: ${hName} ${sl} ${aName}.`,
    `${hName} ${sl} ${aName} · ${o.compLabel}.`,
    `Resultado en ${o.compLabel}: ${hName} ${sl} ${aName}.`,
  ]);

  // ---- cuerpo (qué, cómo, por qué, consecuencia)
  const body: string[] = [];
  body.push(howParagraph(m, rng));
  if (hat) {
    body.push(
      `${hat.name} ${hat.goals >= 4 ? "firmó" : "completó"} su ${hat.goals === 3 ? "triplete" : `${hat.goals} goles`} en los minutos ${listJoin(
        hat.minutes.map(minuteTxt),
      )}.`,
    );
  }
  const why = whyParagraph(m, rng);
  if (why) body.push(why);
  const tp = tableParagraph(m, o.table, rng);
  if (tp) body.push(tp);

  // El resultado, los goles y la competición se ven en la tarjeta del partido
  // (igual que en Jornadas/Copa/Europa), así que no se duplican como "hechos".
  const facts: NewsFact[] = [];

  const players: Array<{ id: string; name: string }> = [];
  if (hat) players.push({ id: hat.id, name: hat.name });
  else if (m.decisive?.scorerId && m.decisive.kind !== "own_goal")
    players.push({ id: m.decisive.scorerId, name: m.decisive.scorer });

  return {
    id: `${o.idPrefix}:${f.id}`,
    cat: mine && o.cat === "liga" ? "club" : hat ? "jugadores" : o.cat,
    icon,
    title,
    lead,
    body,
    facts,
    visual: visualFor({ teams: [f.homeId, f.awayId], players, leagueId: o.leagueId }),
    score: clamp(score, 5, 100),
    when: o.when,
    mine,
    fixture: f,
  };
}

// ============================================================================
// DETECTORES DE LIGA
// ============================================================================

function latestPlayedMatchday(fixtures: Fixture[]): number {
  let md = 0;
  for (const f of fixtures) if (f.result && f.matchday > md) md = f.matchday;
  return md;
}

function leagueNews(ctx: Ctx, leagueId: string, depth: number): NewsItem[] {
  const fixtures = ctx.save.fixtures?.[leagueId] as Fixture[] | undefined;
  if (!fixtures || fixtures.length === 0) return [];
  const M = latestPlayedMatchday(fixtures);
  if (M <= 0) return [];
  const items: NewsItem[] = [];
  const lname = leagueName(leagueId);
  const teamCount = new Set(fixtures.flatMap((f) => [f.homeId, f.awayId])).size;
  const totalMd = Math.max(1, (teamCount - 1) * 2);

  for (let md = M; md > Math.max(0, M - depth); md--) {
    const ageFactor = 1 - (M - md) * 0.22;
    const before = tableAt(fixtures, md - 1);
    const after = tableAt(fixtures, md);
    const table: TableContext = { leagueId, md, before, after, totalMd };
    const when = `${lname} · Jornada ${md}`;
    const played = fixtures.filter((f) => f.result && f.matchday === md);

    // --- historias de partido
    const matchItems: NewsItem[] = [];
    for (const f of played) {
      const info = analyze(f);
      if (!info) continue;
      const story = matchStory({
        m: info,
        ctx,
        cat: "liga",
        when,
        compLabel: `${lname}, jornada ${md}`,
        table,
        leagueId,
        idPrefix: `lg:${leagueId}:${md}`,
      });
      if (story) {
        story.score *= ageFactor;
        matchItems.push(story);
      }
    }
    // De cada jornada, solo las historias más relevantes (y siempre las del usuario).
    matchItems
      .sort((a, b) => b.score - a.score)
      .forEach((it, i) => {
        if (i < 4 || it.mine) items.push(it);
      });

    // --- cambio de liderato
    const leaderBefore = before[0];
    const leaderAfter = after[0];
    if (md > 1 && leaderBefore && leaderAfter && leaderBefore.teamId !== leaderAfter.teamId) {
      const item = leaderChangeStory(ctx, table, played, lname, md);
      if (item) {
        item.score *= ageFactor;
        items.push(item);
      }
    }

    // --- campeón matemático
    const left = totalMd - md;
    if (after.length > 1 && md >= Math.floor(totalMd / 2)) {
      const gapAfter = after[0].points - after[1].points;
      const prevGap = before.length > 1 ? before[0].points - before[1].points : 0;
      const leadChanged = before[0]?.teamId !== after[0]?.teamId;
      if (gapAfter > left * 3 && (!(prevGap > (left + 1) * 3) || leadChanged)) {
        const name = nameOf(after[0].teamId);
        const rng = rngFor(`news:champ:${leagueId}:${md}`);
        items.push({
          id: `champ:${leagueId}:${md}`,
          cat: "liga",
          icon: "🏆",
          title: pick(rng, [
            `${The(name)} es campeón de ${lname} con ${plural(left, "jornada", "jornadas")} de margen`,
            `Matemáticamente campeón: ${the(name)} conquista ${lname}`,
          ]),
          lead: `${name} suma ${after[0].points} puntos y ya no puede ser alcanzado.`,
          body: [
            `Tras la jornada ${md}, ${the(name)} lidera con ${plural(gapAfter, "punto", "puntos")} sobre ${the(nameOf(after[1].teamId))} cuando solo quedan por jugarse ${left * 3} en disputa.`,
          ],
          facts: [
            { label: "Puntos", value: String(after[0].points) },
            { label: "Ventaja", value: `${gapAfter} pts` },
            { label: "Jornadas restantes", value: String(left) },
          ],
          visual: visualFor({ teams: [after[0].teamId, after[1].teamId], leagueId }),
          score: 82 * ageFactor + (isMine(ctx, after[0].teamId) ? 15 : 0),
          when,
          mine: isMine(ctx, after[0].teamId),
        });
      }
    }
  }

  // --- rachas (estado actual)
  items.push(...streakNews(ctx, fixtures, leagueId, M, lname));
  // --- pichichi
  const scorerNews = topScorerNews(ctx, fixtures, leagueId, M, lname);
  if (scorerNews) items.push(scorerNews);

  return items;
}

function leaderChangeStory(
  ctx: Ctx,
  t: TableContext,
  played: Fixture[],
  lname: string,
  md: number,
): NewsItem | null {
  const newL = t.after[0];
  const oldL = t.before[0];
  const rng = rngFor(`news:leader:${t.leagueId}:${md}`);
  const nName = nameOf(newL.teamId);
  const oName = nameOf(oldL.teamId);
  const left = t.totalMd - md;
  const prevPos = posOf(t.before, newL.teamId);
  const myMatch = played.find((f) => f.homeId === newL.teamId || f.awayId === newL.teamId);
  const oldMatch = played.find((f) => f.homeId === oldL.teamId || f.awayId === oldL.teamId);
  const nInfo = myMatch ? analyze(myMatch) : null;
  const oInfo = oldMatch ? analyze(oldMatch) : null;
  const gap = newL.points - (t.after[1]?.points ?? newL.points);

  const nOpp = myMatch ? nameOf(myMatch.homeId === newL.teamId ? myMatch.awayId : myMatch.homeId) : "";
  const oOpp = oldMatch ? nameOf(oldMatch.homeId === oldL.teamId ? oldMatch.awayId : oldMatch.homeId) : "";
  const nWon = nInfo?.winnerId === newL.teamId;
  const nSc = nInfo ? scoreLine(nInfo) : "";
  const oSc = oInfo ? scoreLine(oInfo) : "";
  const oWon = oInfo?.winnerId === oldL.teamId;
  const oLost = !!oInfo && !!oInfo.loserId && oInfo.loserId === oldL.teamId;

  const adj = nInfo?.late ? "agónica" : nInfo?.comeback ? "épica" : (nInfo && Math.abs(nInfo.hg - nInfo.ag) >= 3) ? "contundente" : "importante";
  const how = nWon
    ? pick(rng, [`en una ${adj} victoria ante ${the(nOpp)}`, `tras ganar ${aThe(nOpp)} por ${nSc}`, `con un triunfo ${adj} frente ${aThe(nOpp)}`])
    : nInfo
      ? `pese a no ganar ${the(nOpp)} (${nSc})`
      : "";

  const title = pick(rng, [
    `${The(nName)} consigue el liderato ${how}${prevPos > 1 ? ` y se coloca primero tras ${md} jornadas` : ""}!`,
    `${The(nName)} manda en ${lname}: ${how || `desbanca ${aThe(oName)}`}`,
    `Cambio de líder en ${lname}: ${the(nName)} supera ${aThe(oName)} tras la jornada ${md}`,
  ]).replace(/\s+/g, " ").replace(" !", "!").replace(" .", ".");

  const body: string[] = [];
  body.push(
    `${The(nName)} ${prevPos > 1 ? `era ${prevPos}º antes de esta jornada y ` : ""}ha pasado a liderar la clasificación con ${plural(newL.points, "punto", "puntos")}.`,
  );
  if (nInfo && nWon) body.push(howParagraph(nInfo, rng));
  if (oInfo) {
    if (oLost) {
      body.push(
        pick(rng, [
          `${The(oName)} se dejó los tres puntos con su derrota ${oSc} ante ${the(oOpp)}, lo que le hace perder el primer puesto.`,
          `El golpe lo recibió ${the(oName)}, que cayó por ${oSc} ante ${the(oOpp)} y cede el liderato.`,
        ]),
      );
    } else if (!oWon) {
      body.push(
        `${The(oName)} dejó escapar puntos con su empate ${oSc} frente ${aThe(oOpp)} y deja el liderato.`,
      );
    } else {
      body.push(
        `${The(oName)} también ganó (${oSc} ante ${the(oOpp)}), pero la diferencia de goles inclina la balanza hacia ${the(nName)}.`,
      );
    }
  }
  body.push(
    left > 0
      ? `${The(nName)} es líder a falta de ${plural(left, "jornada", "jornadas")}${gap > 0 ? ` y con ${plural(gap, "punto", "puntos")} de ventaja sobre su perseguidor` : ""}.`
      : `Se trata del final de la liga: ${the(nName)} cierra como líder.`,
  );

  const mine = isMine(ctx, newL.teamId, oldL.teamId);
  return {
    id: `leader:${t.leagueId}:${md}`,
    cat: mine ? "club" : "liga",
    icon: "👑",
    title,
    lead: `${oName} deja el primer puesto en ${lname}.`,
    body,
    facts: [
      { label: "Nuevo líder", value: `${nName} · ${newL.points} pts` },
      { label: "Anterior líder", value: `${oName} · ${oldL.points} pts` },
      { label: "Jornadas restantes", value: String(left) },
    ],
    visual: visualFor({ teams: [newL.teamId, oldL.teamId], leagueId: t.leagueId }),
    score: 70 + 20 * prestige(newL.teamId) + (mine ? 18 : 0),
    when: `${lname} · Jornada ${md}`,
    mine,
  };
}

function streakNews(ctx: Ctx, fixtures: Fixture[], leagueId: string, M: number, lname: string): NewsItem[] {
  const byTeam = new Map<string, Array<{ md: number; res: "W" | "D" | "L" }>>();
  for (const f of fixtures) {
    if (!f.result || f.matchday > M) continue;
    const hg = f.result.homeGoals;
    const ag = f.result.awayGoals;
    const push = (id: string, res: "W" | "D" | "L") => {
      const arr = byTeam.get(id) ?? [];
      arr.push({ md: f.matchday, res });
      byTeam.set(id, arr);
    };
    push(f.homeId, hg > ag ? "W" : hg === ag ? "D" : "L");
    push(f.awayId, ag > hg ? "W" : hg === ag ? "D" : "L");
  }
  const out: NewsItem[] = [];
  for (const [id, arr] of byTeam) {
    arr.sort((a, b) => a.md - b.md);
    if (arr[arr.length - 1]?.md !== M) continue; // la racha debe estar viva esta jornada
    let wins = 0;
    for (let i = arr.length - 1; i >= 0 && arr[i].res === "W"; i--) wins++;
    let unbeaten = 0;
    for (let i = arr.length - 1; i >= 0 && arr[i].res !== "L"; i--) unbeaten++;
    let losses = 0;
    for (let i = arr.length - 1; i >= 0 && arr[i].res === "L"; i--) losses++;
    const name = nameOf(id);
    const rng = rngFor(`news:streak:${leagueId}:${id}:${M}`);
    const mine = isMine(ctx, id);
    if (wins >= 5) {
      out.push({
        id: `streak-w:${leagueId}:${id}:${M}`,
        cat: mine ? "club" : "liga",
        icon: "🔥",
        title: pick(rng, [
          `${The(name)} enlaza ${wins} victorias seguidas en ${lname}`,
          `Imparable: ${wins} triunfos consecutivos para ${the(name)}`,
          `${The(name)} no conoce otra cosa que ganar: ${wins} de ${wins}`,
        ]),
        lead: `La racha ${deThe(name)} sigue viva tras la jornada ${M}.`,
        body: [
          `${The(name)} acumula ${wins} victorias consecutivas en liga, un registro que le coloca entre los equipos en mejor momento de ${lname}.`,
        ],
        facts: [{ label: "Racha", value: `${wins} victorias` }],
        visual: visualFor({ teams: [id], leagueId }),
        score: 38 + wins * 4 + 15 * prestige(id) + (mine ? 18 : 0),
        when: `${lname} · Jornada ${M}`,
        mine,
      });
    } else if (unbeaten >= 8) {
      out.push({
        id: `streak-u:${leagueId}:${id}:${M}`,
        cat: mine ? "club" : "liga",
        icon: "🛡️",
        title: pick(rng, [
          `${The(name)} suma ${unbeaten} jornadas sin perder`,
          `Muro ${deThe(name)}: ${unbeaten} partidos seguidos sin conocer la derrota`,
        ]),
        lead: `Racha invicta en ${lname}.`,
        body: [`${The(name)} lleva ${unbeaten} encuentros de liga sin caer derrotado.`],
        facts: [{ label: "Racha invicta", value: `${unbeaten} partidos` }],
        visual: visualFor({ teams: [id], leagueId }),
        score: 34 + unbeaten * 2 + 12 * prestige(id) + (mine ? 18 : 0),
        when: `${lname} · Jornada ${M}`,
        mine,
      });
    } else if (losses >= 4) {
      out.push({
        id: `streak-l:${leagueId}:${id}:${M}`,
        cat: mine ? "club" : "liga",
        icon: "📉",
        title: pick(rng, [
          `${The(name)} se hunde: ${losses} derrotas seguidas`,
          `Crisis ${deThe(name)}, que encadena ${losses} derrotas consecutivas`,
        ]),
        lead: `Mala racha en ${lname}.`,
        body: [`${The(name)} no gana desde hace ${losses} jornadas y la presión crece.`],
        facts: [{ label: "Derrotas seguidas", value: String(losses) }],
        visual: visualFor({ teams: [id], leagueId }),
        score: 36 + losses * 3 + 12 * prestige(id) + (mine ? 18 : 0),
        when: `${lname} · Jornada ${M}`,
        mine,
      });
    }
  }
  return out;
}

function topScorerNews(ctx: Ctx, fixtures: Fixture[], leagueId: string, M: number, lname: string): NewsItem | null {
  const tally = (upTo: number) => {
    const map = new Map<string, { name: string; teamId: string; goals: number }>();
    for (const f of fixtures) {
      if (!f.result || f.matchday > upTo) continue;
      for (const e of f.result.events ?? []) {
        if (e.type === "own_goal" || e.type === "penalty" || !e.scorerId) continue;
        const teamId = e.team === "home" ? f.homeId : f.awayId;
        const cur = map.get(e.scorerId) ?? { name: e.scorerName, teamId, goals: 0 };
        cur.goals++;
        map.set(e.scorerId, cur);
      }
    }
    return [...map.entries()].sort((a, b) => b[1].goals - a[1].goals);
  };
  const now = tally(M);
  if (now.length === 0) return null;
  const prev = tally(M - 1);
  const [id, top] = now[0];
  if (top.goals < 5) return null;
  const second = now[1]?.[1];
  const prevLeader = prev[0]?.[0];
  const changed = prevLeader && prevLeader !== id;
  const rng = rngFor(`news:scorer:${leagueId}:${M}`);
  const tn = nameOf(top.teamId);
  const mine = isMine(ctx, top.teamId);
  const margin = second ? top.goals - second.goals : top.goals;
  return {
    id: `scorer:${leagueId}:${M}`,
    cat: "jugadores",
    icon: "⚽",
    title: changed
      ? pick(rng, [
          `${top.name} se coloca máximo goleador de ${lname} con ${top.goals} tantos`,
          `Nuevo pichichi en ${lname}: ${top.name} (${top.goals} goles)`,
        ])
      : pick(rng, [
          `${top.name} sigue mandando en la carrera por el pichichi: ${top.goals} goles`,
          `${top.goals} dianas para ${top.name}, líder de goleadores de ${lname}`,
        ]),
    lead: `Máximo goleador de ${lname} tras la jornada ${M}.`,
    body: [
      `${top.name}, jugador ${deThe(tn)}, acumula ${top.goals} goles${second ? ` y aventaja en ${plural(margin, "gol", "goles")} a ${second.name} (${second.goals})` : ""}.`,
    ],
    facts: [
      { label: "Goles", value: String(top.goals) },
      ...(second ? [{ label: "Segundo", value: `${second.name} · ${second.goals}` }] : []),
    ],
    visual: visualFor({ teams: [top.teamId], players: [{ id, name: top.name }], leagueId }),
    score: 36 + top.goals * 1.6 + (changed ? 10 : 0) + (mine ? 12 : 0),
    when: `${lname} · Jornada ${M}`,
    mine,
  };
}

// ============================================================================
// EUROPA Y COPAS
// ============================================================================

const EURO_META: Record<string, { label: string; icon: string }> = {
  ucl: { label: "Champions League", icon: "⭐" },
  uel: { label: "Europa League", icon: "🟠" },
  uecl: { label: "Conference League", icon: "🟢" },
};

function europeanNews(ctx: Ctx): NewsItem[] {
  const out: NewsItem[] = [];
  const lists: Array<[string, Fixture[]]> = [
    ["ucl", (ctx.save.uclFixtures ?? []) as Fixture[]],
    ["uel", (ctx.save.uelFixtures ?? []) as Fixture[]],
    ["uecl", (ctx.save.ueclFixtures ?? []) as Fixture[]],
  ];
  for (const [key, fixtures] of lists) {
    const played = fixtures.filter((f) => f.result);
    if (played.length === 0) continue;
    const meta = EURO_META[key];
    const leaguePhase = fixtures.filter((f) => String(f.round ?? "").startsWith("Jornada"));
    const playedLP = leaguePhase.filter((f) => f.result);
    const lastLPmd = playedLP.reduce((m, f) => Math.max(m, f.matchday), 0);

    // --- fase de liga: líder y mejores partidos de la última jornada
    if (lastLPmd > 0) {
      const before = tableAt(leaguePhase, lastLPmd - 1);
      const after = tableAt(leaguePhase, lastLPmd);
      const when = `${meta.label} · Jornada ${lastLPmd}`;
      const table: TableContext = { leagueId: key, md: lastLPmd, before, after, totalMd: 8 };
      const ofRound = playedLP.filter((f) => f.matchday === lastLPmd);
      const stories: NewsItem[] = [];
      for (const f of ofRound) {
        const info = analyze(f);
        if (!info) continue;
        const s = matchStory({
          m: info,
          ctx,
          cat: "europa",
          when,
          compLabel: `${meta.label}, jornada ${lastLPmd}`,
          table: null,
          idPrefix: `eu:${key}:${lastLPmd}`,
        });
        if (s) {
          s.icon = s.icon === "📰" ? meta.icon : s.icon;
          stories.push(s);
        }
      }
      stories.sort((a, b) => b.score - a.score).forEach((s, i) => (i < 3 || s.mine) && out.push(s));

      const leader = after[0];
      const leaderPrev = before[0];
      if (leader && leader.played > 0) {
        const rng = rngFor(`news:eu-leader:${key}:${lastLPmd}`);
        const ln = nameOf(leader.teamId);
        const changed = lastLPmd > 1 && leaderPrev && leaderPrev.teamId !== leader.teamId;
        const left = 8 - lastLPmd;
        const mine = isMine(ctx, leader.teamId);
        const second = after[1];
        out.push({
          id: `eu-leader:${key}:${lastLPmd}`,
          cat: "europa",
          icon: meta.icon,
          title: changed
            ? pick(rng, [
                `${The(ln)} es el nuevo líder de la fase de liga de la ${meta.label}`,
                `${The(ln)} se sube a lo más alto de la ${meta.label}`,
              ])
            : pick(rng, [
                `${The(ln)}, líder de la fase de liga de la ${meta.label}`,
                `${The(ln)} manda en la ${meta.label} tras la jornada ${lastLPmd}`,
              ]),
          lead: `${leader.points} puntos tras ${plural(leader.played, "partido", "partidos")}.`,
          body: [
            `${The(ln)} encabeza la tabla de la ${meta.label} con ${plural(leader.points, "punto", "puntos")} y diferencia de goles ${leader.gd >= 0 ? "+" : ""}${leader.gd}.`,
            ...(changed && leaderPrev
              ? [`Supera ${aThe(nameOf(leaderPrev.teamId))}, que lideraba hasta la jornada anterior.`]
              : []),
            ...(second
              ? [`Le sigue ${the(nameOf(second.teamId))} con ${plural(second.points, "punto", "puntos")}.`]
              : []),
            left > 0 ? `Quedan ${plural(left, "jornada", "jornadas")} para cerrar la fase de liga.` : "La fase de liga ha concluido.",
          ],
          facts: [
            { label: "Puntos", value: String(leader.points) },
            { label: "Dif. goles", value: `${leader.gd >= 0 ? "+" : ""}${leader.gd}` },
            { label: "Jornadas restantes", value: String(left) },
          ],
          visual: visualFor({ teams: [leader.teamId, ...(second ? [second.teamId] : [])] }),
          score: 52 + 18 * prestige(leader.teamId) + (changed ? 8 : 0) + (mine ? 18 : 0),
          when,
          mine,
        });
      }
    }

    // --- eliminatorias: último cruce jugado
    const ko = played.filter((f) => !String(f.round ?? "").startsWith("Jornada"));
    if (ko.length > 0) {
      const lastRound = ko[ko.length - 1].round;
      const stories: NewsItem[] = [];
      for (const f of ko.filter((x) => x.round === lastRound)) {
        const info = analyze(f);
        if (!info) continue;
        const s = matchStory({
          m: info,
          ctx,
          cat: "europa",
          when: `${meta.label} · ${lastRound}`,
          compLabel: meta.label,
          table: null,
          idPrefix: `eu-ko:${key}`,
        });
        if (s) stories.push(s);
      }
      stories.sort((a, b) => b.score - a.score).forEach((s, i) => (i < 2 || s.mine) && out.push(s));
    }
  }

  // --- campeones europeos
  const champs: Array<[string, string | null | undefined]> = [
    ["ucl", ctx.save.uclChampion],
    ["uel", ctx.save.uelChampion],
    ["uecl", ctx.save.ueclChampion],
  ];
  for (const [key, champ] of champs) {
    if (!champ) continue;
    const meta = EURO_META[key];
    const rng = rngFor(`news:eu-champ:${key}:${champ}`);
    const name = nameOf(champ);
    const mine = isMine(ctx, champ);
    out.push({
      id: `eu-champ:${key}:${champ}`,
      cat: "europa",
      icon: "🏆",
      title: pick(rng, [
        `${The(name)} conquista la ${meta.label}`,
        `${The(name)}, campeón de la ${meta.label}`,
      ]),
      lead: `Gloria europea para ${name}.`,
      body: [`${The(name)} levanta el título de la ${meta.label} tras superar todas las rondas del torneo.`],
      facts: [{ label: "Campeón", value: name }, { label: "Competición", value: meta.label }],
      visual: visualFor({ teams: [champ] }),
      score: 90 + (mine ? 10 : 0),
      when: meta.label,
      mine,
    });
  }
  return out;
}

function cupNews(ctx: Ctx, leagueIds: string[]): NewsItem[] {
  const out: NewsItem[] = [];
  for (const lg of leagueIds) {
    const fixtures = (ctx.save.cupFixtures?.[lg] ?? []) as Fixture[];
    const played = fixtures.filter((f) => f.result);
    if (played.length === 0) continue;
    const country = leagueCountry(lg);
    const label = country ? `Copa de ${country}` : "Copa";
    const lastMd = played.reduce((m, f) => Math.max(m, f.matchday), 0);
    const ofRound = played.filter((f) => f.matchday === lastMd);
    const roundName = ofRound[0]?.round ?? `ronda ${lastMd}`;
    const stories: NewsItem[] = [];
    for (const f of ofRound) {
      const info = analyze(f);
      if (!info) continue;
      const s = matchStory({
        m: info,
        ctx,
        cat: "liga",
        when: `${label} · ${roundName}`,
        compLabel: label,
        table: null,
        leagueId: lg,
        idPrefix: `cup:${lg}`,
      });
      if (s) {
        s.score *= 0.9;
        stories.push(s);
      }
    }
    stories.sort((a, b) => b.score - a.score).forEach((s, i) => (i < 2 || s.mine) && out.push(s));

    const champ = ctx.save.cupChampion?.[lg];
    if (champ) {
      const rng = rngFor(`news:cup-champ:${lg}:${champ}`);
      const name = nameOf(champ);
      const mine = isMine(ctx, champ);
      out.push({
        id: `cup-champ:${lg}:${champ}`,
        cat: "liga",
        icon: "🏆",
        title: pick(rng, [`${The(name)} se proclama campeón de la ${label}`, `${The(name)} levanta la ${label}`]),
        lead: `Título copero para ${name}.`,
        body: [`${The(name)} gana la ${label} y suma un trofeo a su palmarés.`],
        facts: [{ label: "Campeón", value: name }],
        visual: visualFor({ teams: [champ], leagueId: lg }),
        score: 70 + (mine ? 15 : 0),
        when: label,
        mine,
      });
    }
  }
  return out;
}

// ============================================================================
// MERCADO: FICHAJES Y RENOVACIONES
// ============================================================================

function dayNum(date: string): number {
  const t = Date.parse(date);
  return Number.isFinite(t) ? Math.floor(t / 86_400_000) : NaN;
}

function marketNews(ctx: Ctx, refDay: number): NewsItem[] {
  const out: NewsItem[] = [];
  const transfers = listTransfers(120);
  const renewals = listRenewals(60);
  const allDates = [...transfers.map((t) => dayNum(t.date)), ...renewals.map((r) => dayNum(r.date))].filter(
    (n) => Number.isFinite(n),
  );
  const latest = allDates.length ? Math.max(...allDates, Number.isFinite(refDay) ? refDay : 0) : refDay;
  const maxAge = 30;

  let recordFee = 0;
  for (const t of transfers) if (t.type === "permanent" && t.fee > recordFee) recordFee = t.fee;

  for (const t of transfers) {
    const d = dayNum(t.date);
    if (Number.isFinite(d) && Number.isFinite(latest) && latest - d > maxAge) continue;
    const p = getPlayer(t.playerId);
    const ovr = p?.ovr ?? 0;
    const toName = nameOf(t.toClubId);
    const fromName = t.fromClubId ? nameOf(t.fromClubId) : null;
    const mine = isMine(ctx, t.toClubId, t.fromClubId ?? undefined);
    const rng = rngFor(`news:tr:${t.id}`);
    const isLoan = t.type.startsWith("loan");
    const isFree = t.type === "free" || (!fromName && !isLoan);
    const fee = t.fee;

    // relevancia
    let score = 20 + Math.max(0, ovr - 70) * 1.6;
    if (!isLoan && !isFree) score += Math.min(35, fee / 4_000_000);
    if (!isLoan && fee > 0 && fee === recordFee) score += 14;
    if (mine) score += 25;
    score += 10 * (prestige(t.toClubId) + (t.fromClubId ? prestige(t.fromClubId) : 0)) / 2;
    if (score < 38 && !mine) continue;

    const posTxt = p?.position ? ` ${p.position}` : "";
    const age = p ? `${p.age} años` : "";
    const wageTxt = t.wage > 0 ? `${formatM(t.wage)} anuales` : "";
    const facts: NewsFact[] = [];
    if (fromName) facts.push({ label: "Procedencia", value: fromName });
    facts.push({ label: "Destino", value: toName });
    if (!isFree && fee > 0) facts.push({ label: isLoan ? "Cesión" : "Traspaso", value: formatM(fee) });
    if (wageTxt) facts.push({ label: "Salario", value: wageTxt });
    if (p) facts.push({ label: "Jugador", value: `${p.age} años · Media ${p.ovr}${posTxt ? ` · ${p.position}` : ""}` });

    const body: string[] = [];
    let title: string;
    let icon = "💼";
    if (isLoan) {
      icon = "🔄";
      title = pick(rng, [
        `${t.playerName} sale cedido${fromName ? ` ${deThe(fromName)}` : ""} ${aThe(toName)}`,
        `${The(toName)} se hace con la cesión de ${t.playerName}`,
      ]);
      body.push(`${t.playerName}${age ? ` (${age})` : ""} jugará cedido ${aThe(toName)}${fromName ? `, procedente ${deThe(fromName)}` : ""}.`);
    } else if (isFree) {
      icon = "✍️";
      title = pick(rng, [
        `${t.playerName} firma por ${the(toName)} como agente libre`,
        `Gratis y con ${ovr ? `media ${ovr}` : "calidad"}: ${t.playerName} ficha por ${the(toName)}`,
      ]);
      body.push(`${The(toName)} incorpora sin pagar traspaso a ${t.playerName}${age ? `, de ${age}` : ""}.`);
    } else {
      const big = fee >= 100_000_000;
      icon = big ? "💰" : "💼";
      const recordTag = fee === recordFee && fee >= 40_000_000;
      title = pick(rng, [
        `${t.playerName} ficha por ${the(toName)} por ${formatM(fee)}`,
        `${The(toName)} se lleva a ${t.playerName}${fromName ? ` ${deThe(fromName)}` : ""} por ${formatM(fee)}`,
        recordTag
          ? `Bombazo: ${formatM(fee)} por ${t.playerName}, el fichaje más caro de la partida`
          : `Operación de ${formatM(fee)}: ${t.playerName} ${fromName ? `deja ${the(fromName)} por ${the(toName)}` : `refuerza ${the(toName)}`}`,
      ]);
      body.push(
        `${The(toName)} ha cerrado la incorporación de ${t.playerName}${age ? ` (${age})` : ""}${fromName ? `, que deja ${the(fromName)}` : ""}, por ${formatM(fee)}.`,
      );
      if (recordTag) body.push(`Es la mayor operación registrada en esta partida hasta el momento.`);
    }
    if (p && ovr >= 82) body.push(`Con una media de ${ovr}, se trata de uno de los jugadores de mayor nivel en circulación.`);
    if (wageTxt) body.push(`Su contrato le reportará ${wageTxt}.`);

    out.push({
      id: `tr:${t.id}`,
      cat: "mercado",
      icon,
      title: title.replace(/\s+/g, " "),
      lead: fromName ? `${fromName} → ${toName}` : `Nuevo fichaje del ${toName}`,
      body,
      facts,
      visual: visualFor({
        teams: [t.toClubId, ...(t.fromClubId ? [t.fromClubId] : [])],
        players: [{ id: t.playerId, name: t.playerName }],
      }),
      score: clamp(score, 5, 100),
      when: t.date ? `Mercado · ${t.date}` : "Mercado",
      mine,
      theme: isLoan ? "cesion" : "fichaje",
      transfer: {
        fromId: t.fromClubId ?? undefined,
        toId: t.toClubId,
        kind: isLoan ? "loan" : isFree ? "free" : "permanent",
        fee: isFree ? 0 : fee,
      },
    });
  }

  for (const r of renewals) {
    const d = dayNum(r.date);
    if (Number.isFinite(d) && Number.isFinite(latest) && latest - d > maxAge) continue;
    const p = getPlayer(r.playerId);
    const ovr = p?.ovr ?? 0;
    const mine = isMine(ctx, r.clubId);
    let score = 22 + Math.max(0, ovr - 68) * 1.7 + 8 * prestige(r.clubId) + (mine ? 24 : 0);
    if (score < 38 && !mine) continue;
    const rng = rngFor(`news:ren:${r.id}`);
    const club = nameOf(r.clubId);
    const raise = r.previousWage && r.previousWage > 0 ? Math.round(((r.wage - r.previousWage) / r.previousWage) * 100) : null;
    const years = r.years > 0 ? `por ${plural(r.years, "temporada", "temporadas")}` : "";
    const body = [
      `${r.playerName}${p ? ` (${p.age} años, media ${p.ovr})` : ""} ha acordado su continuidad en ${the(club)}${years ? `, ${years}` : ""}.`,
    ];
    if (r.wage > 0) {
      body.push(
        raise !== null && raise > 0
          ? `Pasará a cobrar ${formatM(r.wage)} anuales, un ${raise}% más que antes.`
          : `Su ficha anual queda fijada en ${formatM(r.wage)}.`,
      );
    }
    if (r.releaseClause && r.releaseClause > 0) body.push(`Su cláusula de rescisión asciende a ${formatM(r.releaseClause)}.`);
    out.push({
      id: `ren:${r.id}`,
      cat: "mercado",
      icon: "🖊️",
      title: pick(rng, [
        `${r.playerName} renueva con ${the(club)}`,
        `${The(club)} blinda a ${r.playerName}`,
        `Continuidad asegurada: ${r.playerName} seguirá en ${the(club)}`,
      ]),
      lead: `Renovación ${r.years > 0 ? `por ${plural(r.years, "año", "años")}` : "confirmada"}.`,
      body,
      facts: [
        { label: "Club", value: club },
        { label: "Duración", value: r.years > 0 ? plural(r.years, "año", "años") : "—" },
        ...(r.wage > 0 ? [{ label: "Salario", value: `${formatM(r.wage)} / año` }] : []),
      ],
      visual: visualFor({ teams: [r.clubId], players: [{ id: r.playerId, name: r.playerName }] }),
      score: clamp(score, 5, 100),
      when: r.date ? `Mercado · ${r.date}` : "Mercado",
      mine,
      theme: "renovacion",
    });
  }
  return out;
}

// ============================================================================
// LESIONES IMPORTANTES
// ============================================================================

function addDays(iso: string | undefined, days: number): string | undefined {
  if (!iso) return undefined;
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return undefined;
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

function prettyDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${Number(d)}/${Number(m)}/${y}` : undefined;
}

function durationText(days: number): string {
  if (days < 14) return plural(Math.max(1, days), "día", "días");
  if (days < 60) return plural(Math.round(days / 7), "semana", "semanas");
  const months = Math.round(days / 30);
  return plural(months, "mes", "meses");
}

function injuryNews(ctx: Ctx, leagueIds: string[]): NewsItem[] {
  const out: NewsItem[] = [];
  const save = ctx.save;

  // Partidos recientes de cada competición (último día jugado; en la liga del
  // usuario también el anterior para no perder bajas importantes).
  const sources: Array<{ fixtures: Fixture[]; label: string; back: number; compId: string }> = [];
  for (const lg of leagueIds) {
    sources.push({
      fixtures: (save.fixtures?.[lg] ?? []) as Fixture[],
      label: leagueName(lg),
      back: lg === save.myLeague ? 1 : 0,
      compId: lg,
    });
    const cup = (save.cupFixtures?.[lg] ?? []) as Fixture[];
    if (cup.length) {
      const country = leagueCountry(lg);
      sources.push({ fixtures: cup, label: country ? `Copa de ${country}` : "Copa", back: 0, compId: `cup:${lg}` });
    }
  }
  sources.push({ fixtures: (save.uclFixtures ?? []) as Fixture[], label: "Champions League", back: 0, compId: "ucl" });
  sources.push({ fixtures: (save.uelFixtures ?? []) as Fixture[], label: "Europa League", back: 0, compId: "uel" });
  sources.push({ fixtures: (save.ueclFixtures ?? []) as Fixture[], label: "Conference League", back: 0, compId: "uecl" });

  const seen = new Set<string>();
  for (const src of sources) {
    const played = src.fixtures.filter((f) => f.result);
    if (played.length === 0) continue;
    const last = played.reduce((m, f) => Math.max(m, f.matchday), 0);
    const recent = played.filter((f) => f.matchday >= last - src.back);

    for (const f of recent) {
      const injuries = f.result?.injuries ?? [];
      for (const inj of injuries) {
        const key = `${inj.playerId}:${f.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const days = Math.max(1, Math.round(inj.durationDays ?? (inj.weeks ?? 0) * 7));
        const clubId = inj.team === "home" ? f.homeId : f.awayId;
        const lineup = [
          ...(f.result?.homeStartingLineup ?? f.result?.homeLineup ?? []),
          ...(f.result?.awayStartingLineup ?? f.result?.awayLineup ?? []),
        ];
        const ovr = getPlayer(inj.playerId)?.ovr ?? lineup.find((p) => p.id === inj.playerId)?.rating ?? 0;
        const mine = isMine(ctx, clubId);

        // ¿Es importante? Larga duración, jugador de nivel o jugador del usuario.
        const important = days >= 42 || (ovr >= 82 && days >= 14) || (mine && days >= 14);
        if (!important) continue;

        let score = 20 + Math.min(40, days / 3) + Math.max(0, ovr - 70) * 1.4 + 12 * prestige(clubId) + (mine ? 22 : 0);
        score = clamp(score, 8, 98);

        const club = nameOf(clubId);
        const rival = nameOf(clubId === f.homeId ? f.awayId : f.homeId);
        const rng = rngFor(`news:inj:${f.id}:${inj.playerId}`);
        const dur = durationText(days);
        const long = days >= 120;
        const retIso = addDays(f.date, days);
        const ret = prettyDate(retIso);
        const diag = (inj.diagnosis || inj.reason || "").trim();
        const part = (inj.bodyPart || "").trim();
        const minute = inj.minute != null ? Math.round(inj.minute) : null;
        const star = ovr >= 82;

        const title = long
          ? pick(rng, [
              `Mazazo para ${the(club)}: ${inj.playerName} se pierde ${dur === "1 mes" ? "un mes" : `${dur}`} de competición`,
              `Lesión de gravedad: ${inj.playerName} estará de baja ${dur}`,
              `${inj.playerName} cae lesionado y será baja durante ${dur}`,
            ])
          : pick(rng, [
              `${inj.playerName} se lesiona y estará de baja ${dur}`,
              `Mala noticia para ${the(club)}: ${inj.playerName} se pierde ${dur}`,
              `Baja sensible ${deThe(club)}: ${inj.playerName} estará ${dur} sin jugar`,
            ]);

        const body: string[] = [];
        body.push(
          `${inj.playerName}${getPlayer(inj.playerId) ? ` (${getPlayer(inj.playerId)!.age} años)` : ""} tuvo que dejar el campo${
            minute != null ? ` en el minuto ${minute}'` : ""
          } del ${nameOf(f.homeId)}-${nameOf(f.awayId)} de ${src.label}${
            inj.replacementName ? `, y ${inj.replacementName} entró en su lugar` : ""
          }.`,
        );
        if (diag || part) {
          body.push(
            `${diag ? `El diagnóstico es ${diag.charAt(0).toLowerCase()}${diag.slice(1)}` : "Las pruebas confirman la lesión"}${
              part ? ` (${part.toLowerCase()})` : ""
            }, que lo mantendrá apartado unos ${plural(days, "día", "días")}.`,
          );
        }
        if (star) {
          body.push(
            `Es una baja de peso: con una media de ${ovr}, ${inj.playerName} es uno de los jugadores más importantes ${deThe(club)}.`,
          );
        } else if (mine) {
          body.push(`${The(club)} tendrá que reorganizar la plantilla para suplir su ausencia.`);
        }
        if (ret) body.push(`La fecha estimada de regreso a los terrenos de juego es el ${ret}.`);

        const facts: NewsFact[] = [
          { label: "Jugador", value: inj.playerName },
          { label: "Club", value: club },
          { label: "Baja estimada", value: dur },
        ];
        if (diag) facts.push({ label: "Lesión", value: diag });
        if (part) facts.push({ label: "Zona", value: part });
        if (ret) facts.push({ label: "Regreso estimado", value: ret });

        out.push({
          id: `inj:${f.id}:${inj.playerId}`,
          cat: "lesiones",
          icon: long ? "🚑" : "🩹",
          title,
          lead: `${inj.playerName} (${club}) · ${dur} de baja tras el partido ante ${rival}.`,
          body,
          facts,
          visual: visualFor({
            teams: [clubId],
            players: [{ id: inj.playerId, name: inj.playerName }],
            leagueId: leagueIds.includes(src.compId) ? src.compId : undefined,
          }),
          score,
          when: `${src.label}${f.round && !String(f.round).startsWith("Jornada") ? ` · ${f.round}` : f.matchday ? ` · Jornada ${f.matchday}` : ""}`,
          mine,
          theme: "lesion",
          fixture: f,
          injury: { playerId: inj.playerId, playerName: inj.playerName, clubId, days, returnDate: ret },
        });
      }
    }
  }
  return out;
}

// ============================================================================
// CANTERA
// ============================================================================

function academyPromotionNews(ctx: Ctx): NewsItem[] {
  const events = Array.isArray(ctx.save.academyEvents) ? ctx.save.academyEvents : [];
  return events
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 18)
    .map((event) => {
      const club = nameOf(event.teamId);
      const mine = isMine(ctx, event.teamId);
      const rng = rngFor(`news:academy:${event.id}`);
      const decision = event.wasUserDecision ? "El cuerpo técnico ha decidido darle la oportunidad." : event.reason;
      return {
        id: `academy:${event.id}`,
        cat: "jugadores",
        icon: "🌱",
        title: pick(rng, [
          `${event.playerName} asciende al primer equipo de ${club}`,
          `${club} promociona a ${event.playerName} desde la cantera`,
          `Nueva promesa para ${club}: ${event.playerName} da el salto`,
        ]),
        lead: `${event.playerName} deja la cantera y pasa a formar parte de la primera plantilla.`,
        body: [
          `${event.playerName} ha sido promocionado por ${club}.`,
          decision,
        ],
        facts: [
          { label: "Jugador", value: event.playerName },
          { label: "Club", value: club },
          { label: "Motivo", value: event.reason },
        ],
        visual: visualFor({ teams: [event.teamId], players: [{ id: String(event.playerId), name: event.playerName }] }),
        score: clamp(52 + (mine ? 28 : 0) + prestige(event.teamId) * 12, 10, 96),
        when: `Cantera · ${prettyDate(event.date) ?? event.date}`,
        mine,
        theme: "jugador",
      } satisfies NewsItem;
    });
}

// ============================================================================
// SELECCIÓN FINAL (relevancia + variedad)
// ============================================================================

function selectVaried(items: NewsItem[], limit: number): NewsItem[] {
  const unique = new Map<string, NewsItem>();
  for (const it of items) if (!unique.has(it.id)) unique.set(it.id, it);
  const pool = [...unique.values()];
  const chosen: NewsItem[] = [];
  const catCount = new Map<string, number>();
  const teamCount = new Map<string, number>();
  while (chosen.length < limit && pool.length > 0) {
    let bestIdx = -1;
    let best = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const it = pool[i];
      let adj = it.score;
      adj -= 9 * (catCount.get(it.cat) ?? 0);
      for (const t of it.visual.teamIds.slice(0, 2)) adj -= 7 * (teamCount.get(t) ?? 0);
      if (chosen.length > 0 && chosen[chosen.length - 1].cat === it.cat) adj -= 6;
      if (adj > best) {
        best = adj;
        bestIdx = i;
      }
    }
    const it = pool.splice(bestIdx, 1)[0];
    chosen.push(it);
    catCount.set(it.cat, (catCount.get(it.cat) ?? 0) + 1);
    for (const t of it.visual.teamIds.slice(0, 2)) teamCount.set(t, (teamCount.get(t) ?? 0) + 1);
  }
  return chosen;
}

/**
 * Noticias reales de la partida, ordenadas por relevancia con variedad de
 * categorías, ligas y equipos. Es una función pura y determinista.
 */
export function buildGameNews(save: SaveGame, opts: { limit?: number } = {}): NewsItem[] {
  const limit = opts.limit ?? 14;
  if (!save) return [];
  const ctx: Ctx = { save, myId: save.myTeamId };
  const leagues = dedupe([save.myLeague, ...TOP_LEAGUES]).filter((lg) => (save.fixtures?.[lg]?.length ?? 0) > 0);
  const all: NewsItem[] = [];
  try {
    for (const lg of leagues) all.push(...leagueNews(ctx, lg, lg === save.myLeague ? 2 : 1));
  } catch (e) {
    console.warn("[news] error en noticias de liga", e);
  }
  try {
    all.push(...europeanNews(ctx));
  } catch (e) {
    console.warn("[news] error en noticias europeas", e);
  }
  try {
    all.push(...cupNews(ctx, leagues.slice(0, 6)));
  } catch (e) {
    console.warn("[news] error en noticias de copa", e);
  }
  try {
    const myFixtures = (save.fixtures?.[save.myLeague] ?? []) as Fixture[];
    const refDate = myFixtures
      .filter((f) => f.result && f.date)
      .map((f) => dayNum(f.date as string))
      .filter((n) => Number.isFinite(n));
    all.push(...marketNews(ctx, refDate.length ? Math.max(...refDate) : NaN));
  } catch (e) {
    console.warn("[news] error en noticias de mercado", e);
  }
  try {
    all.push(...injuryNews(ctx, leagues));
  } catch (e) {
    console.warn("[news] error en noticias de lesiones", e);
  }
  try {
    all.push(...academyPromotionNews(ctx));
  } catch (e) {
    console.warn("[news] error en noticias de cantera", e);
  }
  const chosen = selectVaried(all, limit);
  for (const it of chosen) it.theme = it.theme ?? themeOf(it);
  return chosen;
}

/** Temática de una noticia a partir de su identificador y su categoría. */
function themeOf(it: NewsItem): NewsTheme {
  const id = it.id;
  const euro = /^eu(?:-ko|-leader|-champ)?:(ucl|uel|uecl)\b/.exec(id);
  if (euro) return euro[1] as NewsTheme;
  if (id.startsWith("cup:") || id.startsWith("cup-champ:")) return "copa";
  if (id.startsWith("tr:")) return "fichaje";
  if (id.startsWith("ren:")) return "renovacion";
  if (id.startsWith("academy:")) return "jugador";
  if (id.startsWith("inj:")) return "lesion";
  if (id.startsWith("scorer:")) return "jugador";
  return "liga";
}

/** Etiquetas de categoría para la UI. */
export const NEWS_CAT_LABEL: Record<NewsCat, string> = {
  club: "Mi club",
  liga: "Liga",
  europa: "Europa",
  mercado: "Mercado",
  jugadores: "Jugadores",
  lesiones: "Lesiones",
};
