import type { Player } from "@/data/players";
import type { Fixture } from "@/lib/season";
import type { SquadRole } from "@/lib/transfers/types";
import { clampMorale, SATISFACTION_CONFIG } from "./satisfaction";

export const MAILBOX_CONFIG = {
  maxConversations: 40,
  maxMessagesPerConversation: 30,
  // Las peticiones de oportunidad usan exactamente esta distribución por
  // intervalo entre partidos: 70% = 0, 20% = 1, 10% = 2.
  opportunityDistributionPercent: { none: 70, one: 20, two: 10 },
  // Límite duro de mensajes ordinarios entre dos partidos. Las resoluciones
  // de promesas son mensajes obligatorios y pueden saltarse este límite.
  maxMessagesBetweenMatches: 2,
  maxMessagesPerDay: 1,
  playerCooldownDays: 6,
  typeCooldownDays: 10,
  typingDelayMs: 550,
  sustainedLowMoraleThreshold: 25,
  complaintMissStreak: 3,
  notCalledComplaintStreak: 1,
  benchComplaintStreak: 3,
} as const;

export type MailboxMessageKind =
  | "opportunity"
  | "complaint"
  | "wants_out"
  | "positive"
  | "promise_success"
  | "promise_failure"
  | "injury_update";

export type MailboxMessage = {
  id: string;
  playerId: string;
  sender: "player" | "manager";
  kind: MailboxMessageKind;
  text: string;
  date: string;
  read: boolean;
  /** Las peticiones de oportunidad requieren siempre una respuesta del entrenador. */
  requiresResponse?: boolean;
  performance?: "great" | "normal" | "poor";
};

export type MailboxConversation = {
  playerId: string;
  updatedAt: string;
  unreadCount: number;
  messages: MailboxMessage[];
  lastKind?: MailboxMessageKind;
};

export type MailboxPromise = {
  id: string;
  playerId: string;
  fixtureId: string;
  fixtureDate: string;
  promisedAt: string;
  status: "pending" | "fulfilled" | "failed" | "skipped";
  resolutionPending?: boolean;
  resolutionPerformance?: "great" | "normal" | "poor";
};

export type MailboxState = {
  conversations: MailboxConversation[];
  promises: MailboxPromise[];
  sequence: number;
  generatedDate?: string;
  generatedCount?: number;
};

export type MailboxContext = {
  teamId: string;
  players: readonly Player[];
  stats: Record<string, { morale: number; squadRole?: SquadRole; satisfactionMissStreak?: number; satisfactionNotCalledStreak?: number; satisfactionBenchStreak?: number; injuredUntilDate?: string; injuryStartDate?: string; mailboxWantsOut?: boolean }>;
  fixtures: readonly Fixture[];
  matchDate: string;
  currentFixtureId: string;
  unavailablePlayerIds?: ReadonlySet<string>;
  injuredPlayerIds?: ReadonlySet<string>;
  suspendedPlayerIds?: ReadonlySet<string>;
};

export type MailboxResponse =
  | "promise"
  | "encourage"
  | "no"
  | "discuss"
  | "stay"
  | "transfer"
  | "recover"
  | "praise";

export type MailboxResponseOption = {
  id: MailboxResponse;
  label: string;
};

const VARIANTS: Record<MailboxMessageKind, readonly string[]> = {
  opportunity: [
    "Míster, ¿podría tener mi oportunidad contra {opponent}? Creo que esos minutos me vendrían muy bien.",
    "Sé que hay mucha competencia, pero contra {opponent} puedo echarte una mano. ¿Cuento con alguna opción?",
    "Estoy preparado para cuando me necesites. ¿Crees que puedo tener minutos contra {opponent}?",
    "Llevo trabajando toda la semana para esto. Si hay hueco contra {opponent}, me gustaría aprovecharlo.",
    "Míster, necesito sentir que también puedo aportar. ¿Podemos hablar de mis minutos contra {opponent}?",
    "Creo que puedo darte cosas diferentes. ¿Habrá una oportunidad para mí contra {opponent}?",
  ],
  complaint: [
    "Míster, entiendo la competencia, pero últimamente estoy esperando demasiado. ¿Qué puedo hacer para volver a entrar?",
    "Quiero hablar contigo de mi situación. Estoy listo para jugar y siento que no estoy teniendo el espacio que esperaba.",
    "Sé que no es fácil elegir el once, pero necesito saber si sigo contando para partidos importantes.",
    "Me está costando quedarme fuera tantos días seguidos. Quiero trabajar para recuperar mi sitio.",
    "No quiero crear problemas, míster, pero creo que puedo aportar más de lo que estoy aportando ahora.",
    "Necesito una señal de que sigo teniendo un papel importante en el equipo. ¿Cómo lo ves?",
  ],
  wants_out: [
    "Míster, necesito ser sincero contigo: si mi situación no cambia, creo que tendré que buscar una salida.",
    "Llevo tiempo dándole vueltas y no sé si lo mejor para mí es continuar aquí. Necesito hablarlo contigo.",
    "Quiero jugar y ahora mismo no estoy viendo el camino. ¿Podemos valorar una cesión o un traspaso?",
    "No estoy cómodo con mi situación. Preferiría que habláramos de una salida antes de que esto vaya a más.",
    "Sé que hay decisiones deportivas, pero necesito encontrar una solución a lo que estoy viviendo.",
  ],
  positive: [
    "Gracias por la confianza, míster. Estoy disfrutando mucho de cómo está yendo la temporada.",
    "Me está gustando mucho mi papel en el equipo. Voy con ganas a cada partido.",
    "Estoy muy cómodo con el grupo y con el rol que me has dado. Gracias por confiar en mí.",
    "Todo está encajando bien para mí. Quiero seguir apretando para ayudarte.",
    "Estoy disfrutando de cada semana con el equipo. Se nota que vamos por buen camino.",
    "Me siento importante y eso se nota en el campo. Gracias por la oportunidad, míster.",
  ],
  promise_success: [
    "Gracias por cumplir lo que hablamos, míster. Ahora quiero responderte en el campo.",
    "Agradezco que hayas confiado en mí. Tener esa oportunidad me ha venido muy bien.",
    "Cumpliste tu palabra y yo también quería aprovechar mi momento. Gracias, míster.",
    "Me gustó que pudiéramos hablarlo y luego llevarlo al campo. Quiero seguir así.",
  ],
  promise_failure: [
    "Míster, habíamos hablado de esta oportunidad y al final no llegó. Me ha fastidiado bastante.",
    "Pensaba que tendría los minutos que hablamos y me quedé fuera. Necesito que hablemos de ello.",
    "Te dije que estaba preparado y contaba con esa oportunidad. Me ha dolido que finalmente no ocurriera.",
    "Entiendo que los partidos cambian, pero habíamos acordado una cosa y al final no pudo ser.",
  ],
  injury_update: [
    "Míster, sigo trabajando en la recuperación. Te iré contando cómo evoluciona todo.",
    "La recuperación va paso a paso. Estoy centrado en volver bien y no precipitarme.",
    "Te mantengo informado: estoy haciendo todo lo posible para volver cuanto antes.",
    "Todavía me queda trabajo, pero la recuperación sigue su curso. En cuanto esté listo te aviso.",
  ],
};

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededIndex(seed: string, length: number): number {
  if (length <= 1) return 0;
  return hashSeed(seed) % length;
}

function compactConversations(conversations: MailboxConversation[]): MailboxConversation[] {
  return [...conversations]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAILBOX_CONFIG.maxConversations)
    .map((conversation) => ({
      ...conversation,
      messages: conversation.messages.slice(-MAILBOX_CONFIG.maxMessagesPerConversation),
    }));
}

export function createEmptyMailbox(): MailboxState {
  return { conversations: [], promises: [], sequence: 0, generatedDate: undefined, generatedCount: 0 };
}

function nextMessageId(state: MailboxState, prefix: string): [MailboxState, string] {
  const sequence = state.sequence + 1;
  return [{ ...state, sequence }, `${prefix}-${sequence}`];
}

function getConversation(state: MailboxState, playerId: string): MailboxConversation | undefined {
  return state.conversations.find((conversation) => conversation.playerId === playerId);
}

export function findNextUserFixture(fixtures: readonly Fixture[], teamId: string, afterDate: string): Fixture | undefined {
  return [...fixtures]
    .filter((fixture) => fixture.date && fixture.date > afterDate && (fixture.homeId === teamId || fixture.awayId === teamId))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
}

export function opponentName(fixture: Fixture | undefined, playerTeamId: string, teamNames: ReadonlyMap<string, string>): string {
  if (!fixture) return "el próximo partido";
  const opponentId = fixture.homeId === playerTeamId ? fixture.awayId : fixture.homeId;
  return teamNames.get(opponentId) ?? "el próximo rival";
}

function addMessage(
  state: MailboxState,
  player: Player,
  message: Omit<MailboxMessage, "id">,
): MailboxState {
  const [withSequence, id] = nextMessageId(state, `mail-${player.id}`);
  const nextMessage: MailboxMessage = { ...message, id };
  const existing = getConversation(withSequence, player.id);
  const nextConversation: MailboxConversation = existing
    ? {
        ...existing,
        updatedAt: message.date,
        unreadCount: message.read ? existing.unreadCount : existing.unreadCount + 1,
        lastKind: message.kind,
        messages: [...existing.messages, nextMessage].slice(-MAILBOX_CONFIG.maxMessagesPerConversation),
      }
    : {
        playerId: player.id,
        updatedAt: message.date,
        unreadCount: message.read ? 0 : 1,
        lastKind: message.kind,
        messages: [nextMessage],
      };
  return {
    ...withSequence,
    conversations: compactConversations([
      ...withSequence.conversations.filter((conversation) => conversation.playerId !== player.id),
      nextConversation,
    ]),
  };
}

function daysBetween(later: string, earlier: string): number {
  const a = Date.parse(`${later}T00:00:00Z`);
  const b = Date.parse(`${earlier}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (a - b) / 86400000);
}

function cooldownAllows(conversation: MailboxConversation | undefined, kind: MailboxMessageKind, date: string): boolean {
  if (!conversation) return true;
  const playerLast = [...conversation.messages].reverse().find((message) => message.sender === "player");
  const sameKind = [...conversation.messages].reverse().find(
    (message) => message.sender === "player" && message.kind === kind,
  );
  if (playerLast && daysBetween(date, playerLast.date) < MAILBOX_CONFIG.playerCooldownDays) return false;
  if (sameKind && daysBetween(date, sameKind.date) < MAILBOX_CONFIG.typeCooldownDays) return false;
  return true;
}

function markGenerated(state: MailboxState, date: string): MailboxState {
  const count = state.generatedDate === date ? Math.max(0, Number(state.generatedCount) || 0) : 0;
  return { ...state, generatedDate: date, generatedCount: count + 1 };
}

function userFixtures(fixtures: readonly Fixture[], teamId: string): Fixture[] {
  return [...fixtures]
    .filter((fixture) => fixture.date && (fixture.homeId === teamId || fixture.awayId === teamId))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function isUserMatchDay(fixtures: readonly Fixture[], teamId: string, date: string): boolean {
  return fixtures.some(
    (fixture) => fixture.date === date && (fixture.homeId === teamId || fixture.awayId === teamId),
  );
}

function previousUserFixture(fixtures: readonly Fixture[], teamId: string, date: string): Fixture | undefined {
  return userFixtures(fixtures, teamId).filter((fixture) => String(fixture.date) < date).at(-1);
}

function nextUserFixtureOnOrAfter(fixtures: readonly Fixture[], teamId: string, date: string): Fixture | undefined {
  return userFixtures(fixtures, teamId).find((fixture) => String(fixture.date) >= date);
}

export function opportunityCountFromRoll(roll: number): 0 | 1 | 2 {
  const normalized = ((Math.floor(roll) % 100) + 100) % 100;
  if (normalized < MAILBOX_CONFIG.opportunityDistributionPercent.none) return 0;
  if (normalized < MAILBOX_CONFIG.opportunityDistributionPercent.none + MAILBOX_CONFIG.opportunityDistributionPercent.one) return 1;
  return 2;
}

export function opportunityTargetCount(
  fixtures: readonly Fixture[],
  teamId: string,
  date: string,
): 0 | 1 | 2 {
  const previous = previousUserFixture(fixtures, teamId, date);
  const next = nextUserFixtureOnOrAfter(fixtures, teamId, date);
  const seed = `opportunity-window:${teamId}:${previous?.id ?? "start"}:${next?.id ?? "end"}`;
  const roll = hashSeed(seed) % 100;
  return opportunityCountFromRoll(roll);
}

function countOpportunityMessagesBetweenMatches(
  state: MailboxState,
  fixtures: readonly Fixture[],
  teamId: string,
  date: string,
): number {
  const previousMatch = previousUserFixture(fixtures, teamId, date);
  let count = 0;
  for (const conversation of state.conversations) {
    for (const message of conversation.messages) {
      if (message.sender === "player" && message.kind === "opportunity" && message.date <= date && (!previousMatch?.date || message.date > previousMatch.date)) {
        count += 1;
      }
    }
  }
  return count;
}

function countPlayerMessagesBetweenMatches(
  state: MailboxState,
  fixtures: readonly Fixture[],
  teamId: string,
  date: string,
): number {
  const matches = userFixtures(fixtures, teamId);
  const previousMatch = matches
    .filter((fixture) => String(fixture.date) < date)
    .at(-1);
  const windowStart = previousMatch?.date;
  let count = 0;
  for (const conversation of state.conversations) {
    for (const message of conversation.messages) {
      if (message.sender !== "player" || message.date > date) continue;
      if (!windowStart || message.date > windowStart) count += 1;
    }
  }
  return count;
}

export function remainingMessagesBetweenMatches(
  state: MailboxState,
  fixtures: readonly Fixture[],
  teamId: string,
  date: string,
): number {
  return Math.max(
    0,
    MAILBOX_CONFIG.maxMessagesBetweenMatches - countPlayerMessagesBetweenMatches(state, fixtures, teamId, date),
  );
}

function remainingMessagesForDate(state: MailboxState, date: string): number {
  const generatedToday = state.generatedDate === date ? Math.max(0, Number(state.generatedCount) || 0) : 0;
  return Math.max(0, MAILBOX_CONFIG.maxMessagesPerDay - generatedToday);
}

function remainingMailboxCapacity(
  state: MailboxState,
  fixtures: readonly Fixture[],
  teamId: string,
  date: string,
): number {
  return Math.min(
    remainingMessagesBetweenMatches(state, fixtures, teamId, date),
    remainingMessagesForDate(state, date),
  );
}

function pickVariant(
  kind: MailboxMessageKind,
  seed: string,
  recentTexts: readonly string[],
  opponent: string,
): string {
  const variants = VARIANTS[kind];
  const startIndex = seededIndex(seed, variants.length);
  for (let offset = 0; offset < variants.length; offset += 1) {
    const candidate = variants[(startIndex + offset) % variants.length].replaceAll("{opponent}", opponent);
    if (!recentTexts.includes(candidate)) return candidate;
  }
  return variants[startIndex].replaceAll("{opponent}", opponent);
}

export function generateMailboxMessages(
  state: MailboxState,
  ctx: MailboxContext,
  teamNames: ReadonlyMap<string, string>,
): { state: MailboxState; messages: MailboxMessage[] } {
  let next = state ?? createEmptyMailbox();
  const generated: MailboxMessage[] = [];
  if (isUserMatchDay(ctx.fixtures, ctx.teamId, ctx.matchDate)) return { state: next, messages: generated };

  const remainingOrdinary = remainingMailboxCapacity(next, ctx.fixtures, ctx.teamId, ctx.matchDate);
  const nextFixture = findNextUserFixture(ctx.fixtures, ctx.teamId, ctx.matchDate);
  const opponent = opponentName(nextFixture, ctx.teamId, teamNames);

  const candidates = ctx.players
    .map((player) => ({ player, stats: ctx.stats[player.id] }))
    .filter(({ stats }) => !!stats)
    .map(({ player, stats }) => {
      const conversation = getConversation(next, player.id);
      const isInjured = ctx.injuredPlayerIds?.has(player.id) ?? false;
      const isSuspended = ctx.suspendedPlayerIds?.has(player.id) ?? false;
      const role = stats?.squadRole;
      const streak = Number(stats?.satisfactionMissStreak ?? 0);
      const notCalledStreak = Number(stats?.satisfactionNotCalledStreak ?? 0);
      const benchStreak = Number(stats?.satisfactionBenchStreak ?? 0);

      // Estos mensajes son event-driven: no se sortean. Solo aparecen cuando
      // la situación del jugador realmente lo justifica.
      let kind: "complaint" | "wants_out" | "injury_update" | null = null;
      let priority = 0;
      if (!isSuspended && isInjured) {
        kind = conversation?.lastKind === "injury_update" ? null : "injury_update";
        priority = 90;
      } else if (!isSuspended && !isInjured && (stats?.mailboxWantsOut || (stats?.morale ?? 70) < MAILBOX_CONFIG.sustainedLowMoraleThreshold)) {
        kind = "wants_out";
        priority = 100;
      } else if (!isSuspended && !isInjured && (role === "star" || role === "starter") && (notCalledStreak >= MAILBOX_CONFIG.notCalledComplaintStreak || benchStreak >= MAILBOX_CONFIG.benchComplaintStreak || streak >= MAILBOX_CONFIG.complaintMissStreak)) {
        kind = "complaint";
        priority = 80 + Math.max(streak, notCalledStreak * 2, benchStreak * 2);
      }
      if (!kind || !cooldownAllows(conversation, kind, ctx.matchDate)) return null;
      return { player, stats, kind, priority, sort: hashSeed(`${ctx.matchDate}:event:${player.id}:${kind}`) };
    })
    .filter((candidate): candidate is { player: Player; stats: NonNullable<MailboxContext["stats"][string]>; kind: "complaint" | "wants_out" | "injury_update"; priority: number; sort: number } => !!candidate)
    .sort((a, b) => b.priority - a.priority || a.sort - b.sort);

  // Primero damos hueco a un único mensaje contextual por día. Si existe una
  // queja/lesión/salida real, no se le aplica una probabilidad artificial.
  if (remainingOrdinary > 0 && candidates[0]) {
    const candidate = candidates[0];
    const conversation = getConversation(next, candidate.player.id);
    const recentTexts = (conversation?.messages.slice(-10) ?? [])
      .filter((message) => message.sender === "player")
      .map((message) => message.text);
    const text = pickVariant(
      candidate.kind,
      `${ctx.matchDate}:${ctx.currentFixtureId}:${candidate.player.id}:${candidate.kind}:${next.sequence}`,
      recentTexts,
      opponent,
    );
    next = addMessage(next, candidate.player, {
      playerId: candidate.player.id,
      sender: "player",
      kind: candidate.kind,
      text,
      date: ctx.matchDate,
      read: false,
    });
    next = markGenerated(next, ctx.matchDate);
    const message = getConversation(next, candidate.player.id)?.messages.at(-1);
    if (message) generated.push(message);
  }

  // Las oportunidades son el único tipo aleatorio del buzón. El objetivo del
  // intervalo se decide una vez con 70/20/10 y después se van repartiendo en
  // los días disponibles. No se tira un dado distinto por jugador y por día.
  const targetOpportunities = opportunityTargetCount(ctx.fixtures, ctx.teamId, ctx.matchDate);
  const alreadyGenerated = countOpportunityMessagesBetweenMatches(next, ctx.fixtures, ctx.teamId, ctx.matchDate);
  let opportunityRemaining = Math.max(0, targetOpportunities - alreadyGenerated);
  const ordinaryCapacityAfterEvent = Math.max(
    0,
    remainingMailboxCapacity(next, ctx.fixtures, ctx.teamId, ctx.matchDate),
  );
  opportunityRemaining = Math.min(opportunityRemaining, ordinaryCapacityAfterEvent);
  if (opportunityRemaining <= 0 || !nextFixture) {
    return { state: { ...next, promises: next.promises.slice(-40) }, messages: generated };
  }

  const opportunityCandidates = ctx.players
    .map((player) => ({ player, stats: ctx.stats[player.id] }))
    .filter(({ stats }) => !!stats)
    .map(({ player, stats }) => {
      const conversation = getConversation(next, player.id);
      const role = stats?.squadRole;
      const isInjured = ctx.injuredPlayerIds?.has(player.id) ?? false;
      const isSuspended = ctx.suspendedPlayerIds?.has(player.id) ?? false;
      if (isInjured || isSuspended || !["rotation", "prospect", "secondary"].includes(role ?? "")) return null;
      if (!cooldownAllows(conversation, "opportunity", ctx.matchDate)) return null;
      return {
        player,
        stats,
        priority: (role === "prospect" ? 30 : 20) + Math.max(0, 80 - (stats?.morale ?? 70)) + Number(stats?.satisfactionMissStreak ?? 0),
        sort: hashSeed(`${ctx.matchDate}:opportunity:${player.id}`),
      };
    })
    .filter((candidate): candidate is { player: Player; stats: NonNullable<MailboxContext["stats"][string]>; priority: number; sort: number } => !!candidate)
    .sort((a, b) => b.priority - a.priority || a.sort - b.sort);

  for (const candidate of opportunityCandidates.slice(0, opportunityRemaining)) {
    const conversation = getConversation(next, candidate.player.id);
    const recentTexts = (conversation?.messages.slice(-10) ?? [])
      .filter((message) => message.sender === "player")
      .map((message) => message.text);
    const text = pickVariant(
      "opportunity",
      `${ctx.matchDate}:${ctx.currentFixtureId}:${candidate.player.id}:opportunity:${next.sequence}`,
      recentTexts,
      opponent,
    );
    next = addMessage(next, candidate.player, {
      playerId: candidate.player.id,
      sender: "player",
      kind: "opportunity",
      text,
      date: ctx.matchDate,
      read: false,
      requiresResponse: true,
    });
    next = markGenerated(next, ctx.matchDate);
    const message = getConversation(next, candidate.player.id)?.messages.at(-1);
    if (message) generated.push(message);
  }

  return { state: { ...next, promises: next.promises.slice(-40) }, messages: generated };
}


function promiseResolutionVariants(performance: "great" | "normal" | "poor"): readonly string[] {
  if (performance === "great") {
    return [
      "Gracias por aprovechar la oportunidad, míster. Quería demostrarte que podía responder en el campo.",
      "Me vino genial tener ese momento y creo que pude devolverte la confianza con un buen partido. Gracias.",
      "Gracias por cumplir lo que hablamos. Espero que mi partido te haya dejado buenas sensaciones.",
    ];
  }
  if (performance === "poor") {
    return [
      "Lo siento por no haber estado al nivel que esperaba. Me dieron la oportunidad y no la aproveché como quería.",
      "Sé que el partido no fue bueno por mi parte. Me fastidia porque quería devolverte la confianza con una actuación mejor.",
      "No estuve a la altura, míster. Gracias por darme la oportunidad y perdón por no responder como debía.",
    ];
  }
  return [
    "Gracias por cumplir lo que hablamos, míster. Ahora quiero seguir trabajando para ganarme más minutos.",
    "Agradezco que hayas confiado en mí. Tener esa oportunidad me ha venido muy bien.",
    "Cumpliste tu palabra y yo también quería aprovechar mi momento. Gracias, míster.",
  ];
}

function responseVariants(kind: MailboxMessageKind, response: MailboxResponse, opponent: string): readonly string[] {
  const common: Record<MailboxResponse, readonly string[]> = {
    promise: [
      `Cuenta con minutos contra ${opponent}. Quiero que estés preparado.`,
      `Vas a tener tu oportunidad contra ${opponent}. Confío en que la aproveches.`,
      `Te lo has ganado. Tendrás minutos contra ${opponent}.`,
    ],
    encourage: [
      "Sigue trabajando. Tu oportunidad llegará y quiero que estés listo.",
      "No te prometo un partido concreto, pero estás en mis planes y tendrás oportunidades.",
      "Continúa así y mantén el nivel. Estoy pendiente de ti.",
    ],
    no: [
      "Ahora mismo no entras en mis planes para los próximos partidos, pero quiero que sigas trabajando.",
      "De momento voy a priorizar otras opciones. Prefiero ser claro contigo.",
      "Ahora mismo tienes menos espacio en la rotación. Lo hablaremos de nuevo más adelante.",
    ],
    discuss: [
      "Hablemos después de la jornada. Quiero valorar tu situación con calma.",
      "Lo vemos tras el próximo partido y te explico cómo encajas en mis planes.",
      "Prefiero hablarlo cara a cara después de la jornada y buscar una solución.",
    ],
    stay: [
      "Quiero que te quedes. Tu situación puede mejorar y sigo contando contigo.",
      "No quiero perderte. Voy a trabajar para darte un papel más importante.",
      "Cuento contigo. Dame un poco de margen y veremos cómo evoluciona tu situación.",
    ],
    transfer: [
      "Entiendo cómo te sientes. Hablaré con el club para estudiar una salida.",
      "De acuerdo, estudiaremos las opciones y buscaremos lo mejor para las dos partes.",
      "Lo entiendo. Vamos a valorar una cesión o un traspaso que tenga sentido.",
    ],
    recover: [
      "Recupérate con calma. No vamos a precipitar tu vuelta.",
      "Sigue el plan de recuperación y céntrate en volver bien. Los minutos llegarán después.",
      "Lo primero es que estés al cien por cien. Avísame de cualquier cambio.",
    ],
    praise: [
      "Me alegra escucharlo. Sigue así y mantén ese nivel.",
      "Eso es lo que quiero ver. Sigue trabajando y disfrutando del momento.",
      "Me alegra que estés cómodo. Quiero que sigas aportando como hasta ahora.",
    ],
  };
  const targeted: Record<MailboxMessageKind, Partial<Record<MailboxResponse, readonly string[]>>> = {
    opportunity: { encourage: ["Estás trabajando bien. Sigue así y tendrás tus oportunidades.", "Te tengo en cuenta. Quiero que aproveches cada entrenamiento."], no: ["Para este partido no te veo entrando, y prefiero decírtelo antes que prometerte algo que no puedo cumplir."] },
    complaint: { encourage: ["Quiero verte competir por el puesto. Sigue apretando y tendrás opciones.", "No estás fuera de mis planes. Necesito que mantengas el nivel para volver a entrar."], no: ["Ahora mismo otros compañeros están por delante. Prefiero ser honesto contigo."], praise: ["Aprecio que me lo digas de frente. Voy a tener tu situación en cuenta."] },
    wants_out: { stay: ["Quiero intentar cambiar tu situación antes de pensar en una salida.", "Prefiero que te quedes y veamos si podemos darte el papel que buscas."], transfer: ["No quiero retenerte contra tu voluntad. Vamos a hablar con el club y estudiar las opciones."] },
    positive: { praise: ["Me alegra verte así. Mantén esa energía porque el equipo la necesita.", "Ese es el espíritu. Sigue ayudando al grupo y disfrutando."], encourage: ["Sigue en esa línea. Quiero mantener esa dinámica durante la temporada."] },
    promise_success: { praise: ["Te lo ganaste en el campo. Sigue así y habrá más oportunidades."], encourage: ["Ahora que has aprovechado tu ocasión, sigue trabajando porque habrá más."] },
    promise_failure: { discuss: ["Sé que habíamos hablado de ello y entiendo tu enfado. Hablemos y te explicaré qué pasó.", "Tienes razón en pedir una explicación. Quiero hablar contigo de lo ocurrido."], no: ["El partido cambió los planes y no puedo garantizarte minutos en cada jornada."] },
    injury_update: { recover: ["Gracias por avisarme. Lo importante es que vuelvas bien, no rápido."], discuss: ["Hablamos cuando estés más cerca de volver y ajustamos tus objetivos."], encourage: ["Ánimo con la recuperación. El grupo te espera." ] },
  };
  return targeted[kind]?.[response] ?? common[response];
}

export function getMailboxResponseOptions(
  message: MailboxMessage,
  player: Player,
  nextFixture: Fixture | undefined,
  teamNames: ReadonlyMap<string, string>,
  seed = "default",
): MailboxResponseOption[] {
  const opponent = nextFixture
    ? teamNames.get(nextFixture.homeId === player.teamId ? nextFixture.awayId : nextFixture.homeId) ?? "el próximo rival"
    : "el próximo partido";
  const baseByKind: Record<MailboxMessageKind, readonly MailboxResponse[]> = {
    opportunity: nextFixture ? ["promise", "encourage", "no", "discuss"] : ["encourage", "no", "discuss"],
    complaint: nextFixture ? ["encourage", "promise", "discuss", "no"] : ["encourage", "discuss", "no"],
    wants_out: ["stay", "discuss", "transfer"],
    positive: ["praise", "encourage", "discuss"],
    promise_success: ["praise", "encourage", "discuss"],
    promise_failure: ["discuss", "encourage", "no"],
    injury_update: ["recover", "encourage", "discuss"],
  };
  const ids = [...baseByKind[message.kind]];
  const rotate = ids.length ? hashSeed(`${seed}:${message.id}:${player.id}`) % ids.length : 0;
  const ordered = [...ids.slice(rotate), ...ids.slice(0, rotate)];
  return ordered.map((id) => {
    const variants = responseVariants(message.kind, id, opponent);
    return { id, label: variants[seededIndex(`${seed}:${message.id}:${id}`, variants.length)] };
  });
}

export function answerMailboxMessage(
  state: MailboxState,
  player: Player,
  message: MailboxMessage,
  response: MailboxResponse,
  date: string,
  promisedFixture: Fixture | undefined,
  teamNames: ReadonlyMap<string, string> = new Map(),
): {
  state: MailboxState;
  responseMessage: MailboxMessage;
  promiseCreated: MailboxPromise | null;
  moraleDelta: number;
  applied: boolean;
} {
  const conversation = getConversation(state, player.id);
  const lastMessage = conversation?.messages.at(-1);
  if (!conversation || !lastMessage || lastMessage.id !== message.id || message.sender !== "player") {
    return { state, responseMessage: message, promiseCreated: null, moraleDelta: 0, applied: false };
  }
  const opponent = promisedFixture
    ? teamNames.get(promisedFixture.homeId === player.teamId ? promisedFixture.awayId : promisedFixture.homeId) ?? "el próximo rival"
    : "el próximo partido";
  const labels = responseVariants(message.kind, response, opponent);
  const recentManagerTexts = (conversation.messages.slice(-8) ?? [])
    .filter((entry) => entry.sender === "manager")
    .map((entry) => entry.text);
  const startIndex = seededIndex(`${message.id}:${state.sequence}:${response}`, labels.length);
  let text = labels[startIndex];
  for (let offset = 0; offset < labels.length; offset += 1) {
    const candidate = labels[(startIndex + offset) % labels.length];
    if (!recentManagerTexts.includes(candidate)) {
      text = candidate;
      break;
    }
  }
  const moraleByResponse: Record<MailboxResponse, number> = {
    promise: 3,
    encourage: 2,
    no: -2,
    discuss: 0,
    stay: 2,
    transfer: -1,
    recover: 1,
    praise: 2,
  };
  const moraleDelta = moraleByResponse[response];
  const promiseCreated: MailboxPromise | null = response === "promise" && promisedFixture
    ? {
        id: `promise-${state.sequence + 1}-${player.id}`,
        playerId: player.id,
        fixtureId: promisedFixture.id,
        fixtureDate: promisedFixture.date ?? date,
        promisedAt: date,
        status: "pending",
        resolutionPending: false,
      }
    : null;
  const withMessage = addMessage(state, player, {
    playerId: player.id,
    sender: "manager",
    kind: message.kind,
    text,
    date,
    read: true,
  });
  return {
    state: {
      ...withMessage,
      promises: promiseCreated
        ? [...withMessage.promises.filter((p) => p.playerId !== player.id || p.status !== "pending"), promiseCreated].slice(-40)
        : withMessage.promises,
      conversations: withMessage.conversations.map((entry) => entry.playerId === player.id ? { ...entry, unreadCount: 0 } : entry),
    },
    responseMessage: getConversation(withMessage, player.id)!.messages.at(-1)!,
    promiseCreated,
    moraleDelta,
    applied: true,
  };
}

export function markMailboxConversationRead(state: MailboxState, playerId: string): MailboxState {
  return {
    ...state,
    conversations: state.conversations.map((conversation) => conversation.playerId !== playerId ? conversation : {
      ...conversation,
      unreadCount: 0,
      messages: conversation.messages.map((message) => ({ ...message, read: true })),
    }),
  };
}

export function resolveMailboxPromises(
  state: MailboxState,
  fixtureId: string,
  participating: ReadonlyMap<string, { minutes: number; started: boolean; available: boolean; rating?: number; isMvp?: boolean; scored?: boolean }>,
  players: readonly Player[],
  date: string,
): { state: MailboxState; resolved: MailboxPromise[]; messages: MailboxMessage[]; moraleDeltas: Record<string, number> } {
  let next = state;
  const resolved: MailboxPromise[] = [];
  const messages: MailboxMessage[] = [];
  const moraleDeltas: Record<string, number> = {};
  for (const promise of state.promises) {
    if (promise.status !== "pending" || promise.fixtureId !== fixtureId) continue;
    const player = players.find((candidate) => candidate.id === promise.playerId);
    if (!player) continue;
    const data = participating.get(player.id);
    if (!data || !data.available) {
      const skipped = { ...promise, status: "skipped" as const, resolutionPending: false };
      next = { ...next, promises: next.promises.map((item) => item.id === promise.id ? skipped : item) };
      resolved.push(skipped);
      continue;
    }
    const fulfilled = data.started || data.minutes >= SATISFACTION_CONFIG.significantMinutes;
    const performance: "great" | "normal" | "poor" = !fulfilled
      ? "normal"
      : Boolean(data.isMvp || data.scored || (typeof data.rating === "number" && data.rating >= 8))
        ? "great"
        : typeof data.rating === "number" && data.rating <= 5.5
          ? "poor"
          : "normal";
    const status = fulfilled ? "fulfilled" : "failed";
    const delta = !fulfilled
      ? SATISFACTION_CONFIG.mailboxPromiseFailurePenalty
      : performance === "great"
        ? SATISFACTION_CONFIG.mailboxPromiseGreatBonus
        : performance === "poor"
          ? SATISFACTION_CONFIG.mailboxPromisePoorBonus
          : SATISFACTION_CONFIG.mailboxPromiseSuccessBonus;
    const updated = {
      ...promise,
      status: status as "fulfilled" | "failed",
      resolutionPending: true,
      ...(fulfilled ? { resolutionPerformance: performance } : {}),
    };
    next = { ...next, promises: next.promises.map((item) => item.id === promise.id ? updated : item) };
    resolved.push(updated);
    moraleDeltas[player.id] = delta;
  }
  return { state: next, resolved, messages, moraleDeltas };
}

export function releasePendingMailboxResolutions(
  state: MailboxState,
  players: readonly Player[],
  date: string,
  fixtures?: readonly Fixture[],
  teamId?: string,
): { state: MailboxState; messages: MailboxMessage[] } {
  let next = state;
  const messages: MailboxMessage[] = [];
  const pending = state.promises.filter((promise) => promise.resolutionPending && (promise.status === "fulfilled" || promise.status === "failed"));
  // Una resolución de promesa es obligatoria: nunca se descarta por el cupo
  // probabilístico del buzón ni por haber alcanzado ya dos mensajes ordinarios.
  for (const promise of pending) {
    const player = players.find((candidate) => candidate.id === promise.playerId);
    if (!player) continue;
    const kind: MailboxMessageKind = promise.status === "fulfilled" ? "promise_success" : "promise_failure";
    const conversation = getConversation(next, player.id);
    const recentTexts = (conversation?.messages.slice(-10) ?? [])
      .filter((message) => message.sender === "player")
      .map((message) => message.text);
    const variants = kind === "promise_success"
      ? promiseResolutionVariants(promise.resolutionPerformance ?? "normal")
      : VARIANTS.promise_failure;
    const startIndex = seededIndex(`${date}:${promise.id}:${next.sequence}`, variants.length);
    let text = variants[startIndex];
    for (let offset = 0; offset < variants.length; offset += 1) {
      const candidate = variants[(startIndex + offset) % variants.length];
      if (!recentTexts.includes(candidate)) { text = candidate; break; }
    }
    next = addMessage(next, player, { playerId: player.id, sender: "player", kind, text, date, read: false });
    next = markGenerated(next, date);
    next = {
      ...next,
      promises: next.promises.map((item) => item.id === promise.id ? { ...item, resolutionPending: false } : item),
    };
    const message = getConversation(next, player.id)?.messages.at(-1);
    if (message) messages.push(message);
  }
  return { state: next, messages };
}

