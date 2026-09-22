import type { MatchEvent, CardEvent, HighlightEvent } from "@/lib/simulation";

export type MomentumPoint = { minute: number; value: number };

export type NarrativeTone = "normal" | "danger" | "dramatic" | "celebration";

export type NarrativeEntry = {
  id: string;
  minute: number;
  text: string;
  tone?: NarrativeTone;
};

export type DangerChoice = {
  id: string;
  label: string;
  description: string;
  tone?: "neutral" | "attack" | "defense" | "risk";
  effects: Partial<LiveManagerEffects>;
};

export type LiveMoment = {
  id: string;
  type: string;
  minute: number;
  title: string;
  kicker?: string;
  body: string;
  playerName?: string;
  teamName: string;
  emoji: string;
  playerImage?: string;
  detail?: string;
  hardPause?: boolean;
  teamSide?: "home" | "away";
  playerId?: string;
  choices?: DangerChoice[];
  actionPrompt?: string;
};

export type LiveManagerEffects = {
  attack: number;
  defense: number;
  staminaMultiplier: number;
  risk: number;
  momentumBias: number;
  width: number;
  central: number;
  counter: number;
  /** One-off energy change applied immediately when a manager decision is chosen. */
  immediateStamina?: number;
};

export function dangerChoicesFor(
  type: string,
  isSetPiece = false,
  perspective: "attacking" | "defending" = "attacking",
): DangerChoice[] {
  if (perspective === "defending") {
    if (isSetPiece || type === "dangerous_free_kick") {
      return [
        {
          id: "mark",
          label: "Marcar al rematador",
          description: "Sigues al hombre más peligroso y reduces la libertad dentro del área.",
          tone: "defense",
          effects: {
            defense: 1.04,
            risk: -2,
            staminaMultiplier: 1.01,
            momentumBias: 0.4,
            immediateStamina: -0.25,
          },
        },
        {
          id: "zone",
          label: "Defender en zona",
          description: "Mantienes la estructura y proteges primero el espacio central.",
          tone: "defense",
          effects: {
            defense: 1.055,
            central: 1.04,
            risk: -5,
            staminaMultiplier: 0.99,
            momentumBias: 0.2,
            immediateStamina: -0.15,
          },
        },
        {
          id: "break",
          label: "Salir al rebote",
          description:
            "Mandas a los más rápidos hacia la segunda jugada; si sale mal, queda espacio.",
          tone: "risk",
          effects: {
            defense: 1.015,
            counter: 1.03,
            risk: 5,
            momentumBias: 0.8,
            immediateStamina: -0.65,
          },
        },
      ];
    }
    if (type === "save" || type === "big_chance" || type === "woodwork" || type === "counter") {
      return [
        {
          id: "close-angle",
          label: "Cerrar el ángulo",
          description: "El bloque achica y obliga al atacante a rematar con menos portería.",
          tone: "defense",
          effects: {
            defense: 1.055,
            central: 1.03,
            risk: -4,
            staminaMultiplier: 1.005,
            momentumBias: 0.7,
            immediateStamina: -0.35,
          },
        },
        {
          id: "step-out",
          label: "Salir al balón",
          description: "Atacas la jugada antes de que el rival pueda armar el remate.",
          tone: "risk",
          effects: {
            defense: 1.035,
            attack: 0.99,
            risk: 4,
            staminaMultiplier: 1.025,
            momentumBias: 1.0,
            immediateStamina: -0.7,
          },
        },
        {
          id: "hold-line",
          label: "Mantener la línea",
          description:
            "Priorizas no desordenarte y confías en que el delantero termine la acción bajo presión.",
          tone: "neutral",
          effects: {
            defense: 1.025,
            risk: -6,
            staminaMultiplier: 0.98,
            momentumBias: 0.2,
            immediateStamina: -0.15,
          },
        },
      ];
    }
    return [
      {
        id: "close-angle",
        label: "Cerrar espacios",
        description: "Juntas líneas y reduces el hueco entre centrales y mediocentros.",
        tone: "defense",
        effects: {
          defense: 1.04,
          central: 1.04,
          risk: -4,
          staminaMultiplier: 0.99,
          momentumBias: 0.5,
          immediateStamina: -0.25,
        },
      },
      {
        id: "step-out",
        label: "Saltar a la presión",
        description: "Saltas sobre el poseedor para cortar la jugada antes del último pase.",
        tone: "risk",
        effects: {
          defense: 1.03,
          attack: 1.015,
          risk: 6,
          staminaMultiplier: 1.03,
          momentumBias: 1.2,
          immediateStamina: -0.75,
        },
      },
      {
        id: "hold-line",
        label: "No romper la línea",
        description: "Mantienes la forma y proteges la espalda incluso a costa de ceder un metro.",
        tone: "neutral",
        effects: {
          defense: 1.05,
          risk: -7,
          staminaMultiplier: 0.97,
          momentumBias: 0.1,
          immediateStamina: -0.1,
        },
      },
    ];
  }
  if (isSetPiece || type === "dangerous_free_kick") {
    return [
      {
        id: "direct",
        label: "Chutar directo",
        description: "Buscas el golpeo a portería antes de que la defensa pueda reaccionar.",
        tone: "attack",
        effects: {
          attack: 1.045,
          staminaMultiplier: 1.02,
          risk: 7,
          momentumBias: 1.2,
          immediateStamina: -0.6,
        },
      },
      {
        id: "second-post",
        label: "Segundo palo",
        description: "Cargas el área y buscas al compañero que entra desde atrás.",
        tone: "neutral",
        effects: {
          attack: 1.025,
          width: 1.035,
          risk: 3,
          momentumBias: 0.8,
          immediateStamina: -0.25,
        },
      },
      {
        id: "short",
        label: "Jugar en corto",
        description: "Sorprendes con una combinación para conservar la posesión y volver a cargar.",
        tone: "defense",
        effects: {
          attack: 0.99,
          central: 1.035,
          staminaMultiplier: 0.97,
          risk: -6,
          momentumBias: 0.1,
          immediateStamina: 0.3,
        },
      },
    ];
  }

  if (type === "save") {
    return [
      {
        id: "finish",
        label: "Primer toque",
        description: "Golpeas antes de que el portero termine de colocarse. Mucha agresividad.",
        tone: "attack",
        effects: {
          attack: 1.04,
          staminaMultiplier: 1.015,
          risk: 6,
          momentumBias: 1.1,
          immediateStamina: -0.8,
        },
      },
      {
        id: "place",
        label: "Buscar la escuadra",
        description: "Bajas potencia y priorizas precisión. Si sale mal, el portero gana tiempo.",
        tone: "neutral",
        effects: {
          attack: 1.025,
          central: 1.03,
          risk: 2,
          momentumBias: 0.8,
          immediateStamina: -0.45,
        },
      },
      {
        id: "assist",
        label: "Pase atrás",
        description: "Esperas una última décima para buscar a un compañero mejor colocado.",
        tone: "neutral",
        effects: {
          attack: 1.015,
          central: 1.05,
          staminaMultiplier: 0.99,
          risk: -2,
          momentumBias: 0.6,
          immediateStamina: -0.2,
        },
      },
    ];
  }

  if (type === "woodwork") {
    return [
      {
        id: "finish",
        label: "Atacar el rebote",
        description: "Sigues la jugada a toda velocidad por si el palo deja el balón muerto.",
        tone: "attack",
        effects: {
          attack: 1.045,
          staminaMultiplier: 1.02,
          risk: 4,
          momentumBias: 1.4,
          immediateStamina: -0.9,
        },
      },
      {
        id: "place",
        label: "Segundo remate",
        description: "Buscas el rebote con cabeza para evitar un nuevo remate precipitado.",
        tone: "neutral",
        effects: {
          attack: 1.025,
          central: 1.025,
          risk: 1,
          momentumBias: 0.8,
          immediateStamina: -0.5,
        },
      },
      {
        id: "reset",
        label: "Volver a cargar",
        description: "Renuncias al rebote fácil y mantienes al equipo instalado arriba.",
        tone: "defense",
        effects: {
          attack: 0.995,
          central: 1.025,
          staminaMultiplier: 0.965,
          risk: -5,
          momentumBias: 0.15,
          immediateStamina: 0.25,
        },
      },
    ];
  }

  if (type === "big_chance" || type === "counter") {
    return [
      {
        id: "finish",
        label: "Finalizar ya",
        description: "No das tiempo a que la defensa se reorganice. Potente y directo.",
        tone: "attack",
        effects: {
          attack: 1.04,
          staminaMultiplier: 1.01,
          risk: 5,
          momentumBias: 1.2,
          immediateStamina: -0.65,
        },
      },
      {
        id: "place",
        label: "Amagar y colocar",
        description: "Fintas el primer movimiento y buscas el lado más difícil para el portero.",
        tone: "neutral",
        effects: {
          attack: 1.03,
          central: 1.035,
          risk: 1,
          momentumBias: 1.0,
          immediateStamina: -0.4,
        },
      },
      {
        id: "assist",
        label: "Pase extra",
        description: "Aguantas una décima más para fabricar una ocasión todavía más limpia.",
        tone: "neutral",
        effects: {
          attack: 1.02,
          central: 1.05,
          staminaMultiplier: 0.99,
          risk: -3,
          momentumBias: 0.7,
          immediateStamina: -0.2,
        },
      },
    ];
  }

  return [
    {
      id: "finish",
      label: "Tirar",
      description: "Resuelves la jugada antes de que se cierre el hueco.",
      tone: "attack",
      effects: { attack: 1.025, risk: 3, momentumBias: 0.8, immediateStamina: -0.5 },
    },
    {
      id: "hold",
      label: "Aguantar",
      description: "Atraes al defensor para abrir una línea de pase mejor.",
      tone: "neutral",
      effects: { attack: 1.01, central: 1.02, risk: -1, momentumBias: 0.5, immediateStamina: -0.2 },
    },
    {
      id: "reset",
      label: "Asegurar",
      description: "Proteges la posesión y preparas el siguiente ataque.",
      tone: "defense",
      effects: {
        attack: 0.98,
        staminaMultiplier: 0.965,
        risk: -6,
        momentumBias: -0.2,
        immediateStamina: 0.35,
      },
    },
  ];
}

export const DEFAULT_MANAGER_EFFECTS: LiveManagerEffects = {
  attack: 1,
  defense: 1,
  staminaMultiplier: 1,
  risk: 50,
  momentumBias: 0,
  width: 1,
  central: 1,
  counter: 1,
  immediateStamina: 0,
};

export type CoachDecisionKind =
  | "space"
  | "intensity"
  | "fatigue"
  | "protect_lead"
  | "chase_goal"
  | "wing_pressure"
  | "tempo"
  | "width"
  | "counter"
  | "set_piece"
  | "late_game"
  | "calm"
  | "pressure_shape"
  | "build_up";

export type CoachDecisionOption = {
  id: string;
  label: string;
  description: string;
  tone?: "neutral" | "attack" | "defense" | "intense";
  effects: Partial<LiveManagerEffects>;
};

export type CoachDecision = {
  id: string;
  kind: CoachDecisionKind;
  minute: number;
  title: string;
  prompt: string;
  options: CoachDecisionOption[];
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function teamScoreLabel(side: "home" | "away", homeName: string, awayName: string) {
  return side === "home" ? homeName : awayName;
}

function narrativeIndex(seed: unknown, length: number) {
  if (length <= 0) return 0;
  const text = String(seed ?? "");
  let hash = 17;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  hash = Math.abs(hash);
  return hash % length;
}

function pickNarrativeVariant(variants: string[], seed: unknown = Math.random()) {
  if (!variants.length) return "";
  return variants[narrativeIndex(seed, variants.length)];
}

export function buildMissDetail({
  attackerName,
  defenderName,
  minute,
  eventType = "goal",
}: {
  attackerName: string;
  defenderName?: string;
  minute?: number;
  eventType?: MatchEvent["type"] | "open_play";
}) {
  const defender = defenderName || "la defensa";
  const common = [
    `${attackerName} recibe en carrera, se abre un metro y cruza el remate. El balón se marcha fuera por muy poco.`,
    `Gran acción individual de ${attackerName}: supera a su primer rival, entra en el área y finaliza demasiado cruzado.`,
    `${attackerName} encuentra el hueco tras una combinación rápida, pero su disparo sale rozando el poste.`,
    `Pase al espacio y carrera de ${attackerName}. Llega antes que la defensa, aunque el remate se le va ligeramente alto.`,
    `${attackerName} controla orientado, se gira hacia portería y prueba un disparo que acaba fuera por centímetros.`,
    `La jugada cambia de velocidad y ${attackerName} termina la acción de primeras. Le faltaron unos centímetros para encontrar portería.`,
    `${attackerName} gana la espalda, encara al guardameta y busca el palo largo. El balón se pierde por poco.`,
    `Con el área abierta, ${attackerName} arma la pierna desde la frontal. El golpeo sale fuerte, pero se marcha rozando el travesaño.`,
    `${attackerName} llega desde segunda línea y conecta un remate limpio. La pelota pasa muy cerca de la escuadra.`,
    `Centro raso al corazón del área y ${attackerName} aparece para rematar. El toque final se va ligeramente desviado.`,
    `${attackerName} recibe entre líneas, conduce unos metros y prueba suerte. El disparo se abre demasiado y sale por línea de fondo.`,
    `Pared rápida que deja a ${attackerName} perfilado dentro del área. Busca el hueco entre central y portero, pero no lo encuentra.`,
    `${attackerName} se inventa una salida individual y termina la jugada con un remate que se marcha lamiendo el palo.`,
    `Cambio de ritmo de ${attackerName}, recorte hacia dentro y disparo. La trayectoria parecía buena, pero acaba fuera por muy poco.`,
    `${attackerName} ataca el espacio en el segundo palo y llega al centro con ventaja. El remate de primeras se pierde por encima de la portería.`,
    `Recuperación en campo rival y salida inmediata de ${attackerName}. Tiene ventaja al entrar en el área, pero el golpeo se va demasiado cruzado.`,
    `${attackerName} amaga hacia fuera, vuelve a entrar y encuentra una línea de tiro. El balón pasa rozando la base del poste.`,
    `Control con el pecho de ${attackerName} dentro del área y remate en el segundo toque. La pelota sale por encima del larguero.`,
    `${attackerName} recibe de espaldas, gira entre dos rivales y consigue finalizar. El disparo pierde precisión justo al final.`,
    `El pase atrás deja a ${attackerName} de frente al área. Golpea con potencia, pero la trayectoria se abre demasiado.`,
    `${attackerName} ataca el primer palo y anticipa el centro. Su remate toca en un rival y termina alejándose de la portería.`,
    `Una diagonal de ${attackerName} rompe la línea defensiva. Llega al balón y define de primeras, pero no logra ajustar el tiro.`,
  ];
  const blocked = [
    `${attackerName} se prepara para rematar, pero ${defender} se cruza a tiempo y bloquea el disparo. El defensor despeja el peligro.`,
    `${attackerName} encuentra sitio dentro del área y arma la pierna; ${defender} mete el pie justo a tiempo y desvía el remate.`,
    `Remate de ${attackerName} tras una gran maniobra, pero ${defender} aguanta la posición, tapa el golpeo y despeja.`,
    `${attackerName} consigue girarse en el área, aunque ${defender} lee la jugada y se lanza al bloqueo para evitar el disparo limpio.`,
    `${attackerName} prueba el disparo entre varias piernas y ${defender} pone el cuerpo. La defensa consigue despejar el rechace.`,
    `La combinación deja a ${attackerName} en buena posición, pero ${defender} llega desde atrás, bloquea el remate y corta la ocasión.`,
    `${attackerName} intenta encontrar el palo corto; ${defender} cierra el ángulo y desvía la pelota antes de que llegue a portería.`,
    `${attackerName} pisa área y prepara el golpeo, pero ${defender} anticipa el movimiento y limpia la jugada de inmediato.`,
    `El disparo de ${attackerName} iba buscando portería, aunque ${defender} se interpone y consigue que el balón salga rechazado.`,
    `${attackerName} tiene el hueco durante un instante. ${defender} recupera terreno, mete la pierna y evita una finalización limpia.`,
    `${attackerName} arma el derechazo dentro del área, pero ${defender} se lanza al suelo, tapa la trayectoria y fuerza el despeje.`,
    `El recorte deja a ${attackerName} con el disparo preparado. ${defender} aguanta el amago, mete la pierna y salva la jugada.`,
    `${attackerName} busca el remate de primeras, pero ${defender} llega un segundo antes, bloquea el golpeo y aleja el balón del área.`,
    `Centro atrás y remate de ${attackerName}. ${defender} se coloca en la trayectoria y evita que el balón llegue al portero.`,
    `${attackerName} gana la posición para disparar, aunque ${defender} aparece por el costado y desvía el remate con el cuerpo.`,
  ]
  const setPieces = [
    `${attackerName} ejecuta la falta directa con rosca buscando la escuadra, pero el balón se marcha rozando el larguero.`,
    `Golpeo de falta de ${attackerName}. Supera la barrera, aunque pierde el punto de caída y se va fuera por muy poco.`,
    `${attackerName} se encarga de la falta y busca el palo del portero. La pelota pasa cerca, pero no encuentra portería.`,
    `Falta directa lanzada por ${attackerName}; el disparo baja tarde y termina saliendo por centímetros.`,
  ];
  const headers = [
    `${attackerName} gana el duelo aéreo y cabecea con potencia, pero el balón se va por encima del larguero.`,
    `Centro medido para ${attackerName}, que cabecea picado. El remate bota y sale rozando el poste.`,
    `${attackerName} entra con ventaja al área pequeña y remata de cabeza, aunque no consigue dirigirlo entre los tres palos.`,
  ];

  let pool = common;
  if (eventType === "free_kick_goal") pool = [...common.slice(0, 4), ...setPieces];
  else if (eventType === "own_goal") pool = [...common, ...blocked];
  else pool = [...common, ...blocked, ...headers];

  return pickNarrativeVariant(pool, `${minute ?? 0}:${attackerName}:${defenderName ?? ""}:${eventType}`);
}

export function updateMomentum({
  previous,
  minute,
  userSide,
  homeScore,
  awayScore,
  events,
  cards,
  highlights,
  managerEffects,
  timeline,
}: {
  previous: number;
  minute: number;
  userSide: "home" | "away";
  homeScore: number;
  awayScore: number;
  events: MatchEvent[];
  cards: CardEvent[];
  highlights: HighlightEvent[];
  managerEffects: LiveManagerEffects;
  timeline?: any[];
  avgUserStamina?: number;
}) {
  // Momentum is a reading of the match, not a possession meter. It should
  // normally live in a broad central band and only approach the extremes for
  // sustained domination, a red card, or a sequence of decisive chances.
  let delta = (50 - previous) * 0.055;

  for (const event of events) {
    const sign = event.team === userSide ? 1 : -1;
    const weight =
      event.type === "penalty_goal"
        ? 8
        : event.type === "free_kick_goal"
          ? 8
          : event.type === "own_goal"
            ? 7
            : event.type === "goal"
              ? 9
              : 1.5;
    delta += sign * weight;
  }

  for (const card of cards) {
    const sign = card.team === userSide ? -1 : 1;
    delta += sign * (card.cardType === "red" ? 7 : 0.8);
  }

  for (const highlight of highlights) {
    const isNegativeOutcome = ["var_disallowed", "penalty_missed"].includes(highlight.type);
    const sign = highlight.team === userSide ? (isNegativeOutcome ? -1 : 1) : isNegativeOutcome ? 1 : -1;
    const weight =
      highlight.type === "big_chance"
        ? 4.2
        : highlight.type === "woodwork"
          ? 3.5
          : highlight.type === "save"
            ? 2.2
            : highlight.type === "var_disallowed"
              ? 2.8
              : highlight.type === "penalty_missed"
                ? 3
                : highlight.type === "injury"
                  ? 0.8
                  : highlight.type === "forced_sub"
                    ? 0.5
                    : 0.35;
    delta += sign * weight;
  }

  const minuteRows = (timeline ?? []).filter((row: any) => row.minute === minute);
  for (const row of minuteRows) {
    const sign = row.team === userSide ? 1 : -1;
    delta +=
      sign *
      ((row.shot ?? 0) * 0.5 +
        (row.shotOnTarget ?? 0) * 0.9 +
        (row.corner ?? 0) * 0.18 +
        (row.xg ?? 0) * 2.8);
  }

  if (homeScore !== awayScore) {
    const userLeading = userSide === "home" ? homeScore > awayScore : awayScore > homeScore;
    const diff = Math.min(2, Math.abs(homeScore - awayScore));
    delta += (userLeading ? 0.75 : -0.75) * diff;
  }

  // Tactical settings from Dirección de equipo can influence the flow, but
  // they no longer create giant in-match swings.
  delta += managerEffects.momentumBias * 0.22;
  delta += (managerEffects.attack - 1) * 1.8;
  delta += (managerEffects.counter - 1) * 0.7;
  delta -= (managerEffects.defense - 1) * 0.8;
  delta += (managerEffects.risk - 50) * 0.004;

  // Clamp each update so one event cannot turn a balanced match into 90/10.
  const step = Math.max(-5.5, Math.min(5.5, delta));
  return Math.max(22, Math.min(78, previous + step));
}

export function momentumStatus(value: number, userTeamName: string, opponentName: string) {
  if (value >= 72) return `🔥 ${userTeamName} está dominando`;
  if (value >= 61) return `🔥 ${userTeamName} está imponiendo el ritmo`;
  if (value >= 53) return `↗ ${userTeamName} está creciendo`;
  if (value <= 28) return `⚠️ ${userTeamName} está sufriendo`;
  if (value <= 39) return `⚠️ ${opponentName} está apretando`;
  if (value <= 47) return `↘ ${opponentName} gana terreno`;
  return "⚖ Partido muy equilibrado";
}

export function buildNarrativeCommentary({
  minute,
  userTeamName,
  opponentName,
  momentum,
  homeScore,
  awayScore,
  userSide,
  recentEvents,
  recentHighlights,
  recentSubs,
  decisionApplied,
  recentNarratives = [],
}: {
  minute: number;
  userTeamName: string;
  opponentName: string;
  momentum: number;
  homeScore: number;
  awayScore: number;
  userSide: "home" | "away";
  recentEvents: MatchEvent[];
  recentHighlights: HighlightEvent[];
  recentSubs: any[];
  decisionApplied?: string | null;
  recentNarratives?: NarrativeEntry[];
}): NarrativeEntry {
  const trailing = userSide === "home" ? homeScore < awayScore : awayScore < homeScore;
  const leading = userSide === "home" ? homeScore > awayScore : awayScore > homeScore;
  const draw = homeScore === awayScore;
  const uid = `narrative-${minute}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const recentText = new Set(recentNarratives.slice(0, 8).map((x) => x.text));
  const pick = (variants: string[]) => {
    const available = variants.filter((text) => !recentText.has(text));
    const pool = available.length > 0 ? available : variants;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const goal = recentEvents.find((e) => e.minute === minute);
  const big = recentHighlights.find((h) => h.minute === minute && h.type === "big_chance");
  const save = recentHighlights.find((h) => h.minute === minute && h.type === "save");
  const wood = recentHighlights.find((h) => h.minute === minute && h.type === "woodwork");
  const varDecision = recentHighlights.find(
    (h) => h.minute === minute && h.type === "var_disallowed",
  );
  const injury = recentHighlights.find((h) => h.minute === minute && h.type === "injury");
  const sub = recentSubs.find((item) => item.minute === minute);

  if (goal) {
    const scorerTeam = goal.team === userSide ? userTeamName : opponentName;
    if (goal.team === userSide) {
      return {
        id: uid,
        minute,
        tone: "celebration",
        text: pick(
          leading
            ? [
                `${goal.scorerName} aparece cuando más falta hacía y el ${userTeamName} golpea en el momento perfecto.`,
                `El ${userTeamName} encuentra el hueco. ${goal.scorerName} no perdona y el partido cambia de guion.`,
                `Hay premio para la insistencia: ${goal.scorerName} culmina la jugada y pone al ${userTeamName} por delante.`,
              ]
            : trailing
              ? [
                  `¡Reacción inmediata! ${goal.scorerName} vuelve a meter al ${userTeamName} en el partido.`,
                  `Contra el momento del encuentro, el ${userTeamName} encuentra una vida. ${goal.scorerName} recorta distancias.`,
                  `El ${userTeamName} necesitaba un golpe y llega con ${goal.scorerName}. Ahora cambia por completo la dinámica.`,
                ]
              : [
                  `El ${userTeamName} transforma su dominio en gol. ${goal.scorerName} culmina la jugada y el encuentro se enciende.`,
                  `La presión termina dando resultado. ${goal.scorerName} aparece en el área y abre el marcador.`,
                  `El ${userTeamName} acelera, encuentra una rendija y ${goal.scorerName} la convierte en gol.`,
                ],
        ),
      };
    }
    return {
      id: uid,
      minute,
      tone: "danger",
      text: pick([
        `${scorerTeam} encuentra el golpe. El ${userTeamName} tendrá que reaccionar rápido para que el rival no se adueñe del partido.`,
        `Golpe del rival en un momento incómodo. El ${userTeamName} necesita recomponerse y volver a llevar el juego donde le interesa.`,
        `El marcador se pone del lado de ${scorerTeam}. Ahora cada pérdida de balón puede tener mucho más peso.`,
        `${scorerTeam} convierte una fase de presión en gol. El ${userTeamName} debe volver a encontrar su salida.`,
      ]),
    };
  }

  if (varDecision) {
    return {
      id: uid,
      minute,
      tone: "dramatic",
      text: pick([
        `El VAR entra en escena. La jugada cambia por unos instantes el pulso del partido.`,
        `Hay revisión. El ${userTeamName} ya estaba celebrando la jugada, pero ahora toca esperar la decisión.`,
        `El árbitro recibe la señal del VAR y el encuentro se detiene mientras se revisan los detalles.`,
      ]),
    };
  }

  if (injury) {
    return {
      id: uid,
      minute,
      tone: "danger",
      text: pick([
        `${injury.playerName} necesita atención médica y el juego se detiene. El ${userTeamName} tendrá que reorganizarse.`,
        `Problemas físicos para ${injury.playerName}. En un partido tan exigente, el banquillo gana protagonismo.`,
        `El ritmo se corta por la lesión de ${injury.playerName}. Ahora toca decidir cómo ajustar la estructura.`,
      ]),
    };
  }

  if (big) {
    const player = big.playerName ? `${big.playerName} ` : "";
    return {
      id: uid,
      minute,
      tone: "dramatic",
      text: pick(
        big.team === userSide
          ? [
              `${player}vuelve a aparecer en zona peligrosa. El ${userTeamName} está llegando con mucha más claridad que hace unos minutos.`,
              `El ${userTeamName} pisa el área con intención. ${player}obliga a la defensa a correr hacia su propia portería.`,
              `Se empieza a notar el dominio. ${player}encuentra un espacio y genera una ocasión que pudo cambiar el marcador.`,
              `El ${userTeamName} está consiguiendo lo que buscaba: fijar al rival y atacar los espacios que aparecen detrás.`,
            ]
          : [
              `${opponentName} acaba de tener la ocasión más clara del tramo. El ${userTeamName} tiene que ajustar varias cosas.`,
              `El rival ha encontrado un agujero entre líneas y casi lo aprovecha. El ${userTeamName} está concediendo demasiado.`,
              `Momento de aviso para el ${userTeamName}: ${player}ha tenido tiempo y espacio donde no debería.`,
            ],
      ),
    };
  }

  if (save) {
    const keeper = save.playerName || "El portero";
    return {
      id: uid,
      minute,
      tone: save.team === userSide ? "celebration" : "danger",
      text: pick(
        save.team === userSide
          ? [
              `${keeper} aparece en el momento justo. Una intervención de mucho valor para sostener al ${userTeamName}.`,
              `¡Salvados! ${keeper} responde bajo presión y evita que el partido cambie de manos.`,
              `El ${userTeamName} necesita a su portero y ${keeper} cumple con una intervención que puede valer muchísimo.`,
            ]
          : [
              `El portero rival ha tenido que intervenir. ${userTeamName} está poniendo a prueba a la defensa.`,
              `${keeper} evita el gol y mantiene con vida al rival. El ${userTeamName} sigue insistiendo.`,
              `Otra llegada del ${userTeamName}, otra intervención del guardameta rival. El dominio empieza a traducirse en peligro real.`,
            ],
      ),
    };
  }

  if (wood) {
    return {
      id: uid,
      minute,
      tone: "dramatic",
      text: pick([
        `${wood.playerName} hace temblar la portería. Por centímetros no llega el segundo gran susto del partido.`,
        `¡Al palo! ${wood.playerName} roza un gol que habría cambiado por completo la dinámica.`,
        `La madera salva al rival. ${wood.playerName} había encontrado el camino y se queda a nada del gol.`,
      ]),
    };
  }

  if (sub) {
    return {
      id: uid,
      minute,
      tone: "dramatic",
      text: pick([
        `${sub.inName} entra para cambiar la energía del equipo. Ahora el ${userTeamName} tiene una pieza con piernas frescas.`,
        `Movimiento desde el banquillo: ${sub.inName} toma el relevo y el cuerpo técnico busca otra dinámica.`,
        `Cambio en el ${userTeamName}. ${sub.inName} entra con la misión de alterar un partido que estaba pidiendo un nuevo impulso.`,
        `El relevo ya está sobre el césped. A ver si ${sub.inName} consigue trasladar esa frescura al juego.`,
      ]),
    };
  }

  if (decisionApplied) {
    return {
      id: uid,
      minute,
      tone: "dramatic",
      text: pick([
        `Orden: ${decisionApplied}. El equipo cambia la manera de gestionar este tramo y tendrá que asumir sus consecuencias.`,
        `${decisionApplied}. Ahora toca ver si la nueva consigna mejora el partido sin pagar demasiado en energía.`,
        `El banquillo mueve ficha: ${decisionApplied}. La respuesta se verá en los próximos minutos.`,
      ]),
    };
  }

  if (
    recentSubs.length > 0 &&
    recentSubs.some((item) => item.minute >= minute - 2 && item.minute <= minute)
  ) {
    const latest = recentSubs.find((item) => item.minute === minute) ?? recentSubs[0];
    return {
      id: uid,
      minute,
      tone: "dramatic",
      text: pick([
        `El banquillo acaba de mover ficha: ${latest.inName} ya busca cambiar el ritmo del ${userTeamName}.`,
        `${latest.inName} lleva apenas unos instantes en el campo y el ${userTeamName} ya prueba una dinámica distinta.`,
        `Nuevo aire para el ${userTeamName}. ${latest.inName} entra justo cuando el partido empieza a pedir piernas frescas.`,
        `El cambio ya se nota en la estructura: ${latest.inName} toma el relevo y el ${userTeamName} reajusta piezas.`,
      ]),
    };
  }

  if (minute >= 76 && !draw) {
    return {
      id: uid,
      minute,
      tone: trailing ? "dramatic" : leading ? "normal" : "danger",
      text: pick(
        trailing
          ? [
              `El reloj empieza a pesar para el ${userTeamName}. Cada ataque tiene que tener intención.`,
              `Queda poco para cambiar el guion y el ${userTeamName} ya juega con otra urgencia.`,
              `Los minutos vuelan. El ${userTeamName} necesita convertir el próximo tramo de dominio en una ocasión de verdad.`,
            ]
          : leading
            ? [
                `La ventaja acompaña al ${userTeamName}, pero el rival ya empieza a encontrar metros para el último empujón.`,
                `Entramos en terreno de gestión: cada pérdida puede abrir una carrera y cada recuperación vale oro.`,
                `El resultado está de nuestro lado. Ahora importa tanto saber atacar como elegir cuándo no acelerar.`,
              ]
            : [
                `El partido se ha abierto y cualquier transición puede convertirse en la jugada decisiva.`,
                `Los dos equipos encuentran metros. El tramo final promete intercambio de golpes.`,
                `Nadie termina de adueñarse del encuentro; el siguiente golpe puede cambiarlo todo.`,
              ],
      ),
    };
  }

  if (momentum >= 78) {
    return {
      id: uid,
      minute,
      tone: "dramatic",
      text: pick([
        `El ${userTeamName} está jugando con una marcha más. Recupera rápido y vuelve a cargar el área una y otra vez.`,
        `Ahora mismo el partido se juega donde quiere el ${userTeamName}. El rival apenas consigue salir de su bloque.`,
        `La presión del ${userTeamName} está inclinando el encuentro. Cada pérdida rival se convierte en una nueva amenaza.`,
        `El dominio ya no es una sensación: el ${userTeamName} está acumulando acciones peligrosas y empujando al rival hacia atrás.`,
      ]),
    };
  }

  if (momentum >= 62) {
    return {
      id: uid,
      minute,
      tone: "normal",
      text: pick([
        `El ${userTeamName} está encontrando espacios entre líneas y empieza a mover al rival de un costado al otro.`,
        `El ${userTeamName} gana metros poco a poco. Hay más continuidad con balón y menos pérdidas comprometidas.`,
        `La sensación cambia: el ${userTeamName} está llegando antes a las segundas jugadas y controla mejor el ritmo.`,
        `El ${userTeamName} está creciendo desde la posesión y ya consigue instalarse con frecuencia cerca del área rival.`,
      ]),
    };
  }

  if (momentum <= 26) {
    return {
      id: uid,
      minute,
      tone: "danger",
      text: pick([
        `El ${opponentName} está jugando muy arriba y al ${userTeamName} le cuesta muchísimo salir con claridad.`,
        `El ${userTeamName} está sufriendo. Cada pérdida parece convertirse en una carrera hacia atrás.`,
        `El rival ha impuesto el ritmo y el ${userTeamName} necesita recuperar metros y pausa con balón.`,
        `El ${userTeamName} está demasiado atrás y empieza a llegar tarde a las coberturas.`,
      ]),
    };
  }

  if (momentum <= 39) {
    return {
      id: uid,
      minute,
      tone: "danger",
      text: pick([
        `El ${opponentName} gana terreno y está obligando al ${userTeamName} a defender más cerca de su área.`,
        `El partido se ha inclinado hacia el rival. Al ${userTeamName} le falta una posesión larga para recuperar el control.`,
        `El ${userTeamName} no consigue enlazar ataques y el ${opponentName} empieza a jugar cada vez más cerca del último tercio.`,
        `Hay señales de alerta: el ${opponentName} está encontrando demasiadas recepciones cómodas en campo rival.`,
      ]),
    };
  }

  if (draw) {
    return {
      id: uid,
      minute,
      tone: "normal",
      text: pick([
        `El partido sigue muy equilibrado. Nadie consigue convertir sus mejores fases en una ocasión realmente decisiva.`,
        `Mucho equilibrio y pocos espacios. Ambos equipos están midiendo cada riesgo antes de dar el siguiente paso.`,
        `La igualdad manda. Se juega con bastante control y cualquier pérdida peligrosa puede romper el guion.`,
        `El marcador sigue sin moverse y el encuentro pide una acción que rompa la dinámica.`,
      ]),
    };
  }

  if (leading) {
    return {
      id: uid,
      minute,
      tone: "normal",
      text: pick([
        `El ${userTeamName} protege la ventaja sin renunciar a salir cuando aparece espacio.`,
        `La ventaja obliga a gestionar bien los tiempos. El ${userTeamName} no tiene prisa, pero tampoco puede desconectarse.`,
        `El ${userTeamName} lleva el marcador a favor y ahora el reto es evitar que una mala decisión devuelva al rival al partido.`,
        `El resultado favorece al ${userTeamName}, aunque el encuentro sigue exigiendo concentración en cada transición.`,
      ]),
    };
  }

  if (trailing) {
    return {
      id: uid,
      minute,
      tone: "dramatic",
      text: pick([
        `El ${userTeamName} necesita un paso adelante. Hay que encontrar una forma de llevar más jugadores a zonas de remate.`,
        `Con el marcador en contra, el ${userTeamName} empieza a asumir más riesgos con balón.`,
        `El resultado obliga al ${userTeamName} a acelerar. La siguiente llegada puede tener muchísimo peso.`,
        `El ${userTeamName} busca una respuesta sin perder del todo el equilibrio defensivo.`,
      ]),
    };
  }

  return {
    id: uid,
    minute,
    tone: "normal",
    text: pick([
      `El encuentro entra en una fase de estudio. Ambos equipos esperan el momento para acelerar.`,
      `Se juega con mucha atención a las transiciones y todavía cuesta encontrar un hueco limpio.`,
      `El ${userTeamName} busca el siguiente pase que rompa líneas sin regalar una contra peligrosa.`,
      `El ritmo es cambiante y ninguna de las dos partes consigue instalarse durante demasiado tiempo en campo rival.`,
      `Partido de paciencia: el ${userTeamName} intenta atraer al rival y encontrar el espacio en el momento adecuado.`,
    ]),
  };
}

export function buildGoalPrelude({
  event,
  homeName,
  awayName,
}: {
  event: MatchEvent;
  homeName: string;
  awayName: string;
}): LiveMoment {
  const teamName = event.team === "home" ? homeName : awayName;
  const isFreeKick = event.type === "free_kick_goal";
  const isCorner = event.detail === "A la salida de un córner";
  const player = event.scorerName || "El lanzador";

  if (isFreeKick) {
    const variants = [
      `${player} se coloca frente al balón, mide la distancia y empieza a buscar el ángulo de tiro. La barrera ya está colocada.`,
      `El árbitro da permiso y ${player} se prepara para el golpeo. El portero ordena la barrera y nadie quiere pestañear.`,
      `${player} coloca el balón con mimo. Hay espacio suficiente para intentar una falta directa y la defensa sabe dónde está el peligro.`,
      `Todo listo para el golpeo: ${player} toma carrerilla mientras el guardameta rival corrige un paso hacia su palo.`,
      `${player} se perfila para lanzar. El estadio baja el ruido por un instante y todas las miradas apuntan al área.`,
      `La falta está en una distancia ideal. ${player} espera la señal, observa la colocación del portero y se prepara para pegarle.`,
      `${player} se acerca al balón con decisión. La barrera queda a medio camino entre el lanzador y una oportunidad enorme.`,
      `Hay una falta frontal y ${player} se hace cargo. La portería está al alcance de un golpeo preciso.`,
      `${player} acomoda el balón, da unos pasos atrás y fija la mirada en la escuadra. La defensa prepara el salto.`,
      `Ocasión a balón parado para ${teamName}: ${player} se perfila y el guardameta ya está avisando a sus compañeros.`,
      `${player} pide unos segundos para colocar a todos. Tiene el remate directo en la cabeza y la barrera trata de tapar el camino.`,
      `El especialista aparece en el balón parado. ${player} estudia la barrera y busca el punto exacto por donde hacer pasar el disparo.`,
    ]
    return {
      id: `prelude-fk-${event.minute}-${event.scorerId}`,
      type: "dangerous_free_kick",
      minute: event.minute,
      kicker: "🎯 Falta peligrosa",
      title: pickNarrativeVariant(["FALTA DIRECTA", "PELIGRO A BALÓN PARADO", "OCASIÓN DE FALTA", "EL BALÓN PIDE DISPARO"], `${event.minute}:${player}:title`),
      body: pickNarrativeVariant(variants, `${event.minute}:${player}`),
      playerName: player,
      playerId: event.scorerId,
      teamName,
      choices: dangerChoicesFor("dangerous_free_kick", true),
      actionPrompt: "¿Cómo quieres atacar esta falta?",
      emoji: "🎯",
      detail: "Siguiente: el golpeo…",
      hardPause: true,
      teamSide: event.team,
    };
  }

  if (isCorner) {
    const variants = [
      `${teamName} carga el área. El córner cae en una zona caliente y ${player} ya busca el espacio entre los centrales.`,
      `${player} levanta la cabeza y espera el movimiento de sus compañeros. El área se llena y el primer toque puede ser decisivo.`,
      `El envío de ${player} está preparado. Los centrales se empujan y ${teamName} mete hombres en el primer y segundo palo.`,
      `${player} se prepara para colgarla. La defensa ha cerrado la zona, pero hay varios atacantes esperando el centro.`,
      `Córner para ${teamName}: ${player} coloca el balón y señala hacia qué zona quiere ponerlo. La marca se ajusta a última hora.`,
      `El saque de esquina está a punto de ejecutarse. ${player} observa el desmarque y el portero rival ordena a sus centrales.`,
      `${player} se acerca al banderín. Hay centímetros para atacar en el primer palo y espacio libre detrás de la última línea.`,
      `La pelota está en el córner y ${player} prepara el centro. El área parece un embudo de piernas, marcas y carreras.`,
      `Todos saben lo que viene: centro de ${player}. ${teamName} acumula rematadores y el rival protege como puede el punto de penalti.`,
    ]
    return {
      id: `prelude-corner-${event.minute}-${event.scorerId}`,
      type: "goal_prelude",
      minute: event.minute,
      kicker: "🚩 Córner peligroso",
      title: pickNarrativeVariant(["CENTRO AL ÁREA", "CÓRNER PELIGROSO", "PUEDE CAER EL GOL", "BALÓN AL ÁREA"], `${event.minute}:${player}:corner:title`),
      body: pickNarrativeVariant(variants, `${event.minute}:${player}:corner`),
      playerName: player,
      playerId: event.scorerId,
      teamName,
      choices: dangerChoicesFor("dangerous_free_kick", true),
      actionPrompt: "¿Cómo quieres jugar el córner?",
      emoji: "🚩",
      detail: "Siguiente: el remate…",
      hardPause: true,
      teamSide: event.team,
    };
  }

  const variants = [
    `${player} rompe hacia dentro y recibe entre líneas. Tiene un defensor delante y una ventana para probar el disparo.`,
    `${player} arranca a la espalda del lateral y gana unos metros. La defensa retrocede y el remate se acerca.`,
    `Pared rápida y carrera de ${player}. El último pase lo deja en una zona donde una sola decisión puede cambiar la jugada.`,
    `${player} controla orientado, levanta la cabeza y ve un pasillo hacia el área. El rival empieza a cerrar tarde.`,
    `La jugada se acelera y ${player} recibe con ventaja en el pico del área. Ya prepara el siguiente toque.`,
    `${player} ataca el intervalo entre central y lateral. Si consigue girarse, tendrá la portería de frente.`,
    `El ${teamName} encuentra una transición limpia. ${player} conduce con metros por delante y la defensa corre hacia su propia área.`,
    `${player} aparece en el segundo palo después de una combinación por banda. El centro está a punto de llegar.`,
    `Un pase filtrado deja a ${player} en el límite del área. El control es bueno y el hueco se abre durante un instante.`,
    `${player} gana el uno contra uno y entra en zona de remate. El defensor ya está reculando para impedirle perfilarse.`,
    `El balón cambia de lado y encuentra a ${player} con espacio. Recorta hacia su pierna buena y la portería queda a un toque.`,
    `${player} recibe de espaldas, aguanta el contacto y se gira. La acción termina entrando de lleno en zona de definición.`,
    `La defensa pierde una referencia y ${player} aparece solo unos metros por delante. El siguiente control puede dejarle de cara al gol.`,
    `${player} llega desde segunda línea, recoge un rechace y arma la pierna antes de que la defensa pueda salir.`,
    `El ${teamName} combina rápido alrededor del área y ${player} encuentra una línea de pase que rompe el bloque.`,
    `${player} ataca la diagonal, recibe dentro del área y levanta la cabeza para decidir entre disparar o buscar al compañero.`,
    `Con una conducción agresiva, ${player} obliga a dos defensores a cerrarle. Aun así encuentra un hueco para finalizar.`,
    `${player} se mete entre centrales con un movimiento corto. El pase llega y todo queda preparado para el último gesto.`,
  ];
  return {
    id: `prelude-goal-${event.minute}-${event.scorerId}`,
    type: "goal_prelude",
    minute: event.minute,
    kicker: "🚨 Peligro",
    title: pickNarrativeVariant(["¡PELIGRO!", "OCASIÓN EN EL ÁREA", "SE ABRE EL HUECO", "ALERTA EN LA PORTERÍA", "LLEGA EL REMATE"], `${event.minute}:${player}:goal:title`),
    body: pickNarrativeVariant(variants, `${event.minute}:${player}:goal`),
    playerName: player,
    playerId: event.scorerId,
    teamName,
    choices: dangerChoicesFor(event.type),
    actionPrompt: "¿Qué hacemos con el peligro?",
    emoji: "🚨",
    detail: event.assistName
      ? `Siguiente: pase de ${event.assistName} y resolución…`
      : "Siguiente: el remate…",
    hardPause: true,
    teamSide: event.team,
  };
}

export function buildSavePrelude({
  highlight,
  homeName,
  awayName,
}: {
  highlight: HighlightEvent;
  homeName: string;
  awayName: string;
}): LiveMoment {
  const teamName = highlight.team === "home" ? homeName : awayName;
  const player = highlight.playerName || "El delantero";
  const variants = [
    `${player} arma la pierna y cruza el disparo. El portero aguanta hasta el último instante antes de intentar la intervención.`,
    `${player} recibe dentro del área y remata de primeras. El guardameta ya está bajando el centro de gravedad para responder.`,
    `Pase al espacio para ${player}. Gana medio metro y prepara un golpeo al palo largo mientras el portero mide el ángulo.`,
    `${player} se planta de frente a la portería. Tiene una ventana mínima para finalizar antes de que llegue la cobertura.`,
    `La jugada termina en los pies de ${player}. Control corto, mirada al segundo palo y el disparo está a punto de salir.`,
    `${player} encuentra un pasillo en la frontal y golpea con decisión. El balón viaja rápido hacia una portería que parece encogerse.`,
    `Centro raso que atraviesa el área y encuentra a ${player}. La finalización de primeras puede ser letal.`,
    `${player} ataca el espacio a la espalda del central y llega al balón con ventaja. El portero sale a proteger su zona.`,
    `Recorte de ${player} dentro del área. El defensor queda atrás y el guardameta espera el golpeo con los pies preparados.`,
    `${player} gana el duelo individual y entra en zona de remate. El siguiente toque será seguramente el disparo.`,
    `El balón queda suelto en la frontal y ${player} llega antes que nadie. Levanta la cabeza y se prepara para pegarle.`,
    `Transición rápida del ${teamName}: ${player} conduce hasta el área y el portero rival tiene que colocarse a toda prisa.`,
    `${player} aparece en el segundo palo y espera el centro. El defensor no termina de llegar a tiempo para cerrar la línea de tiro.`,
    `La pared deja a ${player} perfilado. El portero se mueve un paso y la ocasión ya está lista para ser resuelta.`,
    `${player} recibe entre dos defensores, protege el balón y consigue girarse. La portería está a pocos metros.`,
    `El ataque encuentra el último pase para ${player}. Hay una fracción de segundo antes de que la defensa vuelva a cerrarse.`,
    `${player} engancha un balón dividido dentro del área y se prepara para un remate potente antes de que lo encimen.`,
    `${player} llega de frente tras una segunda jugada. El disparo está armado y el guardameta ya se prepara para el vuelo.`,
  ];
  return {
    id: `prelude-save-${highlight.minute}-${highlight.playerId}`,
    type: "goal_prelude",
    minute: highlight.minute,
    kicker: "🚨 Peligro en el área",
    title: pickNarrativeVariant(["DISPARO PELIGROSO", "OCASIÓN CLARA", "EL PORTERO TIENE TRABAJO", "SE PERFILA EL REMATE", "PELIGRO INMINENTE"], `${highlight.minute}:${player}:save:title`),
    body: pickNarrativeVariant(variants, `${highlight.minute}:${player}:save`),
    playerName: player,
    playerId: highlight.playerId,
    teamName,
    choices: dangerChoicesFor("save"),
    actionPrompt: "¿Cómo quieres resolver la jugada?",
    emoji: "🚨",
    detail: "Siguiente: el disparo…",
    hardPause: true,
    teamSide: highlight.team,
  };
}

export function buildMomentFromEvent({
  event,
  homeName,
  awayName,
}: {
  event: MatchEvent;
  homeName: string;
  awayName: string;
}): LiveMoment {
  const teamName = event.team === "home" ? homeName : awayName;
  const type = event.type;
  if (type === "penalty_goal") {
    return {
      id: `penalty-${event.minute}-${event.scorerId}`,
      type,
      minute: event.minute,
      kicker: "🚨 Penalti",
      title: "PENALTI",
      body: `${teamName} tiene una oportunidad enorme desde los once metros.`,
      playerName: event.scorerName,
      playerId: event.scorerId,
      teamName,
      emoji: "🚨",
      detail: event.detail,
      teamSide: event.team,
      hardPause: true,
    };
  }
  if (type === "free_kick_goal") {
    return {
      id: `fk-${event.minute}-${event.scorerId}`,
      type,
      minute: event.minute,
      kicker: "🎯 Gol de falta",
      title: "GOLAZO DE FALTA",
      body: `${event.scorerName} encuentra una trayectoria imposible desde una falta peligrosa.`,
      playerName: event.scorerName,
      playerId: event.scorerId,
      teamName,
      teamSide: event.team,
      detail: event.detail,
      emoji: "🎯",
      hardPause: true,
    };
  }
  if (type === "own_goal") {
    const ownGoalTeam = event.team === "home" ? awayName : homeName;
    return {
      id: `og-${event.minute}-${event.scorerId}`,
      type,
      minute: event.minute,
      kicker: "⚽ Gol en propia",
      title: "GOL EN PROPIA",
      body: `${event.scorerName} desvía el balón hacia su propia portería. El tanto sube al marcador para ${teamName}.`,
      playerName: event.scorerName,
      teamName,
      emoji: "⚽",
      detail: `${event.scorerName} · gol en propia de ${ownGoalTeam}`,
      hardPause: true,
    };
  }
  return {
    id: `goal-${event.minute}-${event.scorerId}`,
    type,
    minute: event.minute,
    kicker: "⚽ GOOOOL",
    title: "GOOOOOL",
    body: `${event.scorerName} culmina la jugada. ${event.detail || (event.assistName ? `Asistencia de ${event.assistName}.` : "El estadio se viene abajo.")}`,
    playerName: event.scorerName,
    playerId: event.scorerId,
    teamName,
    emoji: "⚽",
    detail: event.assistName ? `Asistencia: ${event.assistName}` : undefined,
    hardPause: true,
  };
}

export function buildDangerPreludeFromHighlight({
  highlight,
  homeName,
  awayName,
}: {
  highlight: HighlightEvent;
  homeName: string;
  awayName: string;
}): LiveMoment {
  const teamName = highlight.team === "home" ? homeName : awayName;
  const player = highlight.playerName || "El atacante";

  const configs: Record<
    string,
    {
      title: string[];
      kicker: string[];
      emoji: string;
      variants: string[];
    }
  > = {
    woodwork: {
      // Esta es la escena previa: todavía NO revelamos que la pelota tocará
      // la madera. El desenlace "AL PALO" se muestra únicamente al resolverla.
      title: ["REMATE PELIGROSO", "SE PREPARA EL DISPARO", "OCASIÓN AL LÍMITE", "PELIGRO EN LA FRONTAL"],
      kicker: ["💥 Remate preparado", "💥 Ocasión de máxima tensión", "💥 La portería entra en alerta"],
      emoji: "🚨",
      variants: [
        `${player} recibe perfilado y carga el remate. La portería queda de frente y el defensor llega tarde.`,
        `${player} encuentra un metro en la frontal y prepara un golpeo seco que puede acabar en la escuadra.`,
        `El balón le cae a ${player} después de una segunda jugada. Controla y dispara antes de que se cierre el espacio.`,
        `${player} ataca el segundo palo y llega con tiempo para rematar. La defensa pierde su referencia por un instante.`,
        `Una combinación rápida deja a ${player} entrando de cara. El siguiente toque puede mandar el balón contra la red o contra la madera.`,
        `${player} recorta hacia dentro y prepara la pierna buena. El ángulo parece pequeño, pero la ocasión es enorme.`,
        `El ataque cambia de ritmo y ${player} recibe justo en el borde del área. Todos esperan el disparo.`,
        `${player} gana la espalda y recibe dentro del área. Tiene el cuerpo preparado para buscar el palo largo.`,
        `El rechace cae a ${player}. Sin pensárselo dos veces, arma el golpeo y la defensa solo puede intentar tapar.`,
        `${player} se hace sitio entre dos rivales y consigue sacar la pierna. El remate lleva veneno.`,
        `Pase atrás al punto de penalti y ${player} aparece de frente. Hay una ventana limpia de remate.`,
        `${player} ataca el intervalo y controla orientado hacia portería. El rival corre hacia atrás sin poder frenarle.`,
      ],
    },
    big_chance: {
      title: ["GRAN PELIGRO", "OCASIÓN CLARÍSIMA", "¡SE HUELE EL GOL!", "MANO A MANO", "OCASIÓN DE ORO"],
      kicker: ["🔥 Ocasión clarísima", "🔥 El área arde", "🔥 Peligro máximo", "🔥 Todo a punto de decidirse"],
      emoji: "🚨",
      variants: [
        `${player} recibe solo dentro del área y tiene tiempo para escoger dónde colocar el remate.`,
        `Pase filtrado a la espalda de la defensa y ${player} entra con ventaja. El guardameta ya sale a achicar.`,
        `${player} rompe la línea, controla a un toque y queda frente a la portería con una ocasión enorme.`,
        `El ${teamName} mueve la defensa de lado a lado y encuentra a ${player} en el hueco que estaba buscando.`,
        `${player} aparece entre central y lateral, recibe de cara y levanta la cabeza: hay compañeros y portería esperando.`,
        `Una recuperación alta deja a ${player} cerca del área. La defensa todavía está desordenada y la ocasión es de las grandes.`,
        `${player} gana el uno contra uno y pisa el área. El defensor intenta aguantar, pero la ventaja está del lado del atacante.`,
        `Centro raso al corazón del área y ${player} llega de frente. Tiene una sola cosa en la cabeza: finalizar.`,
        `La combinación en corto deja a ${player} perfilado en el punto de penalti. El siguiente gesto puede cambiar el marcador.`,
        `${player} recibe detrás de la última línea y entra con campo abierto. El portero se prepara para el duelo.`,
        `Rebote favorable para ${player}, que se encuentra con el balón a pocos metros del arco y con la defensa fuera de sitio.`,
        `${player} ataca la espalda del lateral, supera la ayuda y se planta en zona de remate con todo a favor.`,
        `Pase atrás desde línea de fondo para ${player}. El área se abre y la ocasión aparece limpia por primera vez en la jugada.`,
        `${player} se mete entre dos defensores, aguanta el contacto y consigue un metro para terminar la acción.`,
        `El balón llega a ${player} en el segundo palo. Tiene tiempo para controlar y decidir cómo atacar la portería.`,
      ],
    },
    save: {
      title: ["DISPARO PELIGROSO", "EL PORTERO TIENE TRABAJO", "SE CARGA EL REMATE", "PELIGRO EN EL ÁREA"],
      kicker: ["🧤 Peligro en el área", "🧤 Remate preparado", "🧤 El guardameta entra en acción"],
      emoji: "🚨",
      variants: [
        `${player} encuentra el pasillo y se prepara para un disparo que va a exigir una reacción inmediata del portero.`,
        `El balón llega a ${player} con ventaja. Se perfila hacia el palo largo y arma la pierna.`,
        `${player} recibe tras una pared y pisa la frontal. Tiene espacio para sacar un golpeo limpio.`,
        `Una pérdida en salida deja a ${player} con metros. El portero adelanta la posición para reducir la portería.`,
        `${player} entra por dentro después de superar la primera presión. La cobertura llega, pero el remate ya está preparado.`,
        `Centro hacia el segundo palo y ${player} gana la posición. La defensa intenta cerrar con el último paso.`,
        `${player} se acomoda tras un control orientado y busca un disparo raso antes de que llegue el central.`,
        `El ataque encuentra una línea de pase vertical y ${player} recibe de cara. El remate está a punto de salir.`,
        `${player} ataca un balón dividido dentro del área. Tiene un instante para elegir entre potencia y colocación.`,
        `La jugada acaba en la frontal con ${player} mirando a portería. El guardameta ajusta el ángulo y espera.`,
        `${player} recibe a la espalda del mediocentro y conduce hacia la zona de disparo. El bloque rival se rompe.`,
        `Un centro rechazado cae a ${player}. El remate de segunda jugada puede sorprender a toda la defensa.`,
      ],
    },
  };

  const meta = configs[highlight.type] ?? configs.big_chance;
  return {
    id: `prelude-highlight-${highlight.type}-${highlight.minute}-${highlight.playerId}`,
    type: highlight.type === "save" ? "danger_save" : "danger_chance",
    minute: highlight.minute,
    kicker: pickNarrativeVariant(meta.kicker, `${highlight.minute}:${player}:kicker`),
    title: pickNarrativeVariant(meta.title, `${highlight.minute}:${player}:title`),
    body: pickNarrativeVariant(meta.variants, `${highlight.minute}:${player}:body`),
    playerName: player,
    playerId: highlight.playerId,
    teamName,
    choices: dangerChoicesFor(highlight.type),
    actionPrompt: "Decide cómo resolver la jugada",
    emoji: meta.emoji,
    detail: "Tu decisión tendrá efecto en esta jugada y en el tramo siguiente.",
    hardPause: true,
    teamSide: highlight.team,
  };
}

export function buildMomentFromHighlight({
  highlight,
  homeName,
  awayName,
}: {
  highlight: HighlightEvent;
  homeName: string;
  awayName: string;
}): LiveMoment {
  const teamName = highlight.team === "home" ? homeName : awayName;
  const common = {
    id: `${highlight.type}-${highlight.minute}-${highlight.playerId}`,
    type: highlight.type,
    minute: highlight.minute,
    teamName,
    playerName: highlight.playerName,
    playerId: highlight.playerId,
    detail: highlight.detail,
    teamSide: highlight.team,
  };
  switch (highlight.type) {
    case "save":
      return {
        ...common,
        kicker: "🧤 Parada",
        title: highlight.detail === "¡Paradón!" ? "PARADÓN" : "PARADA CLAVE",
        body: `${highlight.playerName} aparece para evitar el gol.`,
        emoji: "🧤",
        hardPause: true,
      };
    case "woodwork":
      return {
        ...common,
        kicker: "💥 Larguero",
        title: "AL PALO",
        body:
          highlight.detail ||
          pickNarrativeVariant(
            [
              `${highlight.playerName} se saca un remate cruzado que se estrella en el palo.`,
              `${highlight.playerName} conecta un disparo potente y la madera evita el gol por centímetros.`,
              `Remate de ${highlight.playerName} al segundo palo: la pelota toca la madera y se va fuera.`,
              `${highlight.playerName} encuentra la escuadra en su golpeo, pero el travesaño escupe el balón.`,
            ],
            `${highlight.minute}:${highlight.playerName}:woodwork`,
          ),
        emoji: "💥",
        hardPause: true,
      };
    case "var_disallowed":
      return {
        ...common,
        kicker: "📺 VAR",
        title: "GOL ANULADO",
        body: `${highlight.playerName} celebra, pero el árbitro revisa la jugada.`,
        emoji: "📺",
        hardPause: true,
      };
    case "penalty_missed":
      return {
        ...common,
        kicker: "❌ Penalti",
        title: "PENALTI FALLADO",
        body: `${highlight.playerName} no consigue convertir desde los once metros.`,
        emoji: "❌",
        hardPause: true,
      };
    case "injury":
      return {
        ...common,
        kicker: "🚑 Lesión",
        title: "PROBLEMAS FÍSICOS",
        body: `${highlight.playerName} necesita atención y el juego se detiene.`,
        emoji: "🚑",
        hardPause: true,
      };
    case "forced_sub":
      return {
        ...common,
        kicker: "🔁 Cambio forzado",
        title: "CAMBIO OBLIGADO",
        body: `${highlight.playerName} entra para cubrir la lesión de un compañero.`,
        emoji: "🔁",
        hardPause: false,
      };
    case "big_chance":
      return {
        ...common,
        kicker: "❌ Fallo",
        title: "OCASIÓN DESPERDICIADA",
        body:
          highlight.detail ||
          pickNarrativeVariant(
            [
              `${highlight.playerName} finaliza la jugada, pero el balón se marcha fuera por muy poco.`,
              `${highlight.playerName} consigue el espacio, aunque el remate se va desviado en el último instante.`,
              `La ocasión era muy clara para ${highlight.playerName}, que no consigue encontrar portería.`,
              `${highlight.playerName} prueba el golpeo, pero la defensa consigue bloquear la finalización.`,
              `El ataque había dejado la portería de frente; ${highlight.playerName} no logra convertir la oportunidad.`,
              `${highlight.playerName} llega con ventaja al área, pero el último toque le hace perder el remate.`,
            ],
            `${highlight.minute}:${highlight.playerName}:big_chance`,
          ),
        emoji: "❌",
        hardPause: true,
      };
    default:
      return {
        ...common,
        kicker: "🔥 Momento clave",
        title: highlight.detail || "OCASIÓN",
        body: highlight.detail || `${highlight.playerName} protagoniza una acción peligrosa.`,
        emoji: "🔥",
        hardPause: true,
      };
  }
}

export function buildSyntheticMoment({
  type,
  minute,
  teamName,
  playerName,
  body,
  teamSide,
}: {
  type: string;
  minute: number;
  teamName: string;
  playerName?: string;
  body: string;
  teamSide?: "home" | "away";
}): LiveMoment {
  const meta: Record<string, { kicker: string; title: string; emoji: string }> = {
    chance: { kicker: "⚡ Ocasión", title: "¡QUÉ OCASIÓN!", emoji: "⚡" },
    counter: { kicker: "⚡ Contraataque", title: "CONTRAATAQUE", emoji: "⚡" },
    corner: { kicker: "🚩 Córner", title: "CÓRNER", emoji: "🚩" },
    dangerous_free_kick: { kicker: "🎯 Falta peligrosa", title: "FALTA PELIGROSA", emoji: "🎯" },
    big_chance: { kicker: "🔥 Gran ocasión", title: "GRAN OCASIÓN", emoji: "🔥" },
  };
  const m = meta[type] ?? meta.chance;
  return {
    id: `synthetic-${type}-${minute}-${Date.now()}`,
    type,
    minute,
    teamName,
    playerName,
    body,
    ...m,
    hardPause: type === "big_chance",
    teamSide,
  };
}

export function buildCoachDecision({
  minute,
  homeScore,
  awayScore,
  userSide,
  userTeamName,
  opponentName,
  momentum,
  avgStamina,
  avoidKinds = [],
  lastDecisionKind,
}: {
  minute: number;
  homeScore: number;
  awayScore: number;
  userSide: "home" | "away";
  userTeamName: string;
  opponentName: string;
  momentum: number;
  avgStamina: number;
  avoidKinds?: CoachDecisionKind[];
  lastDecisionKind?: CoachDecisionKind | null;
}): CoachDecision | null {
  const diff = userSide === "home" ? homeScore - awayScore : awayScore - homeScore;
  const trailing = diff < 0;
  const leading = diff > 0;
  const draw = diff === 0;
  if (minute < 20 || minute > 88) return null;

  const candidates: CoachDecision[] = [];
  const push = (decision: CoachDecision) => {
    if (avoidKinds.includes(decision.kind)) return;
    if (decision.kind === lastDecisionKind) return;
    candidates.push(decision);
  };

  if (avgStamina < 58 && minute >= 52) {
    push({
      id: `fatigue-${minute}`,
      kind: "fatigue",
      minute,
      title: "El equipo empieza a pagar el esfuerzo",
      prompt:
        "Las piernas pesan y las coberturas llegan un poco tarde. ¿Priorizamos energía o seguimos apretando?",
      options: [
        {
          id: "manage-energy",
          label: "Bajar revoluciones",
          description: "Posesiones más largas y menos carreras sin balón.",
          tone: "defense",
          effects: {
            staminaMultiplier: 0.82,
            risk: -12,
            attack: 0.96,
            defense: 1.03,
            immediateStamina: 2.2,
            momentumBias: -1,
          },
        },
        {
          id: "burst",
          label: "Un último arreón",
          description: "Subimos el ritmo durante este tramo, aunque el depósito cae antes.",
          tone: "intense",
          effects: {
            staminaMultiplier: 1.18,
            risk: 15,
            attack: 1.07,
            counter: 1.06,
            immediateStamina: -4.2,
            momentumBias: 4,
          },
        },
        {
          id: "rotate-next",
          label: "Preparar piernas frescas",
          description:
            "Bajamos el desgaste y dejamos al banquillo preparado para el siguiente parón.",
          tone: "neutral",
          effects: { staminaMultiplier: 0.94, risk: -3, immediateStamina: 0.8 },
        },
      ],
    });
  }

  if (momentum <= 40) {
    push({
      id: `space-${minute}`,
      kind: "space",
      minute,
      title: "Nos están encontrando a la espalda",
      prompt: `${opponentName} está acelerando cada transición y tus centrales están corriendo demasiado hacia su propia portería.`,
      options: [
        {
          id: "lower-line",
          label: "Replegar 5-7 metros",
          description: "Cerramos profundidad y protegemos el espacio a la espalda.",
          tone: "defense",
          effects: {
            defense: 1.08,
            attack: 0.95,
            staminaMultiplier: 0.9,
            risk: -12,
            momentumBias: 1,
          },
        },
        {
          id: "press-source",
          label: "Presionar al origen",
          description:
            "En lugar de correr hacia atrás, mordemos al pasador antes de que pueda lanzar la transición.",
          tone: "intense",
          effects: {
            defense: 1.03,
            attack: 1.02,
            staminaMultiplier: 1.1,
            risk: 9,
            momentumBias: 3,
            counter: 1.05,
            immediateStamina: -1.7,
          },
        },
        {
          id: "protect-center",
          label: "Cerrar dentro",
          description:
            "Priorizamos el pasillo central y aceptamos que nos intenten superar por fuera.",
          tone: "defense",
          effects: {
            defense: 1.06,
            central: 1.12,
            width: 0.9,
            risk: -6,
            momentumBias: 1,
            immediateStamina: 0.5,
          },
        },
      ],
    });
  }

  if (momentum >= 68) {
    push({
      id: `dominance-${minute}`,
      kind: "intensity",
      minute,
      title: "El rival está contra las cuerdas",
      prompt: "Tenemos iniciativa y campo. ¿Aprovechamos el momento o lo gestionamos?",
      options: [
        {
          id: "press-even-more",
          label: "Seguir presionando",
          description: "Intentamos recuperar todavía más arriba.",
          tone: "intense",
          effects: {
            attack: 1.08,
            defense: 1.02,
            staminaMultiplier: 1.14,
            risk: 12,
            momentumBias: 4,
            immediateStamina: -3.1,
          },
        },
        {
          id: "attack-width",
          label: "Abrir el campo",
          description: "Buscamos aislar laterales y generar situaciones de uno contra uno.",
          tone: "attack",
          effects: { attack: 1.06, width: 1.14, risk: 5, momentumBias: 2, immediateStamina: -1.3 },
        },
        {
          id: "circulate",
          label: "Moverlos hasta abrir hueco",
          description: "Menos vértigo, más paciencia y mejor selección del último pase.",
          tone: "neutral",
          effects: {
            attack: 1.02,
            risk: -5,
            staminaMultiplier: 0.9,
            momentumBias: 1,
            immediateStamina: 1.2,
            central: 1.04,
          },
        },
      ],
    });
  }

  if (trailing && minute >= 54) {
    push({
      id: `chase-${minute}`,
      kind: "chase_goal",
      minute,
      title: "Necesitamos cambiar el partido",
      prompt: `El marcador obliga al ${userTeamName} a asumir algo más de riesgo.`,
      options: [
        {
          id: "all-out",
          label: "Volcarnos",
          description: "Más hombres por delante del balón. Mucho más peligro… también a la contra.",
          tone: "intense",
          effects: {
            attack: 1.1,
            staminaMultiplier: 1.15,
            risk: 20,
            momentumBias: 6,
            counter: 1.08,
            immediateStamina: -3.8,
          },
        },
        {
          id: "direct",
          label: "Juego directo",
          description: "Buscamos la espalda de la última línea y el segundo balón.",
          tone: "attack",
          effects: { attack: 1.05, counter: 1.12, risk: 12, momentumBias: 4, immediateStamina: -2 },
        },
        {
          id: "inside-combination",
          label: "Combinar por dentro",
          description: "Más apoyos entre líneas y menos dependencia del centro al área.",
          tone: "attack",
          effects: { attack: 1.07, central: 1.14, risk: 9, momentumBias: 3, immediateStamina: -1 },
        },
      ],
    });
  }

  if (leading && minute >= 60) {
    push({
      id: `lead-${minute}`,
      kind: "protect_lead",
      minute,
      title: "Tenemos que decidir cómo gestionar la ventaja",
      prompt: `${opponentName} está empezando a arriesgar. ¿Protegemos el resultado o seguimos atacando?`,
      options: [
        {
          id: "close-game",
          label: "Cerrar el partido",
          description: "Bloque algo más bajo, menos ida y vuelta.",
          tone: "defense",
          effects: {
            defense: 1.09,
            attack: 0.91,
            staminaMultiplier: 0.84,
            risk: -18,
            momentumBias: -2,
            immediateStamina: 2.5,
          },
        },
        {
          id: "controlled-counter",
          label: "Esperar y salir",
          description:
            "Cedemos algo de balón para castigar los espacios cuando el rival se adelante.",
          tone: "attack",
          effects: {
            defense: 1.03,
            counter: 1.13,
            attack: 1.02,
            risk: -3,
            momentumBias: 1,
            immediateStamina: 0.5,
          },
        },
        {
          id: "keep-control",
          label: "Seguir con el plan",
          description: "No cambiamos nada y seguimos jugando con la misma estructura.",
          tone: "neutral",
          effects: { staminaMultiplier: 0.97 },
        },
      ],
    });
  }

  if (draw && minute >= 38 && minute <= 82) {
    push({
      id: `tempo-${minute}`,
      kind: "tempo",
      minute,
      title: "El partido pide un cambio de ritmo",
      prompt:
        "Hay demasiado control y pocas rupturas. Podemos romper el guion o mantener la paciencia.",
      options: [
        {
          id: "accelerate",
          label: "Acelerar",
          description: "Más ritmo en las transiciones y pases verticales.",
          tone: "intense",
          effects: {
            attack: 1.05,
            staminaMultiplier: 1.1,
            risk: 9,
            momentumBias: 3,
            immediateStamina: -2,
          },
        },
        {
          id: "slow-down",
          label: "Bajar pulsaciones",
          description: "Reducimos pérdidas y buscamos cansar al rival con posesiones largas.",
          tone: "neutral",
          effects: {
            staminaMultiplier: 0.84,
            risk: -8,
            momentumBias: -1,
            immediateStamina: 1.8,
            central: 1.03,
          },
        },
        {
          id: "change-side",
          label: "Cambiar de orientación",
          description: "Más amplitud para mover el bloque rival de lado a lado.",
          tone: "attack",
          effects: { width: 1.16, attack: 1.03, risk: 3, momentumBias: 2 },
        },
      ],
    });
  }

  if (minute >= 55 && minute <= 78) {
    push({
      id: `width-${minute}`,
      kind: "width",
      minute,
      title: "El rival nos está cerrando los pasillos centrales",
      prompt: "Hay espacio fuera, pero para llegar al área nos falta desordenar su bloque.",
      options: [
        {
          id: "overlap",
          label: "Doblar por fuera",
          description: "Los laterales pasan más arriba y cargamos banda.",
          tone: "attack",
          effects: {
            width: 1.16,
            attack: 1.04,
            staminaMultiplier: 1.08,
            risk: 8,
            immediateStamina: -1.8,
          },
        },
        {
          id: "half-spaces",
          label: "Atacar los intervalos",
          description: "Extremos y mediapuntas se meten dentro para combinar.",
          tone: "attack",
          effects: { central: 1.13, attack: 1.05, risk: 7, momentumBias: 2 },
        },
        {
          id: "patience",
          label: "No forzar",
          description: "Seguimos moviendo al rival hasta que aparezca una ventaja clara.",
          tone: "neutral",
          effects: { risk: -6, staminaMultiplier: 0.92, immediateStamina: 1 },
        },
      ],
    });
  }

  if (minute >= 58 && minute <= 83) {
    push({
      id: `counter-${minute}`,
      kind: "counter",
      minute,
      title: "Cada recuperación puede hacernos daño",
      prompt: "El partido está dejando metros. ¿Cómo queremos atacar cuando recuperemos?",
      options: [
        {
          id: "fast-break",
          label: "Salir disparados",
          description: "Transiciones muy verticales y menos pases de seguridad.",
          tone: "intense",
          effects: {
            counter: 1.15,
            attack: 1.04,
            staminaMultiplier: 1.08,
            risk: 10,
            momentumBias: 3,
          },
        },
        {
          id: "secure-first",
          label: "Primer pase seguro",
          description: "Aseguramos la primera posesión y atacamos con más jugadores colocados.",
          tone: "neutral",
          effects: { counter: 0.94, risk: -8, staminaMultiplier: 0.92, immediateStamina: 1.2 },
        },
        {
          id: "mix",
          label: "Alternar",
          description: "A veces aceleramos y a veces paramos la jugada.",
          tone: "attack",
          effects: { counter: 1.05, attack: 1.03, risk: 2, momentumBias: 1 },
        },
      ],
    });
  }

  if (minute >= 45 && minute <= 84 && avgStamina >= 55) {
    push({
      id: `calm-${minute}`,
      kind: "calm",
      minute,
      title: "Hay que elegir dónde gastar la energía",
      prompt:
        "El partido no está roto todavía. Una decisión pequeña ahora puede cambiar el tramo siguiente.",
      options: [
        {
          id: "burst-five",
          label: "Apretar 5 minutos",
          description: "Un acelerón corto para intentar cambiar el momentum.",
          tone: "intense",
          effects: {
            staminaMultiplier: 1.2,
            attack: 1.06,
            momentumBias: 4,
            risk: 9,
            immediateStamina: -2.2,
          },
        },
        {
          id: "circulate-more",
          label: "Controlar con balón",
          description: "Quitamos minutos al rival y protegemos las piernas.",
          tone: "neutral",
          effects: {
            staminaMultiplier: 0.82,
            attack: 0.99,
            defense: 1.02,
            risk: -8,
            immediateStamina: 1.7,
          },
        },
        {
          id: "stay",
          label: "No tocar nada",
          description: "La estructura actual sigue siendo válida.",
          tone: "neutral",
          effects: {},
        },
      ],
    });
  }

  if (minute >= 70) {
    push({
      id: `late-${minute}`,
      kind: "late_game",
      minute,
      title: leading
        ? "Último tramo: toca administrar"
        : trailing
          ? "Último tramo: toca arriesgar"
          : "Último tramo: ¿cómo queremos acabar?",
      prompt: leading
        ? "El resultado es bueno. El rival se va a lanzar y cada metro que dejemos puede ser peligroso."
        : trailing
          ? "Quedan minutos para cambiar la historia. Hay que decidir cuánto estamos dispuestos a arriesgar."
          : "El partido sigue abierto y un buen último tramo puede decidirlo.",
      options: [
        {
          id: "maximum-risk",
          label: "Todo al ataque",
          description:
            "Abrimos muchísimo el partido. Gran premio potencial, gran peligro de contra.",
          tone: "intense",
          effects: {
            attack: 1.11,
            defense: 0.9,
            staminaMultiplier: 1.16,
            risk: 24,
            momentumBias: 6,
            immediateStamina: -4,
          },
        },
        {
          id: "balanced-finish",
          label: "Buscar el momento",
          description: "Presionamos sin perder del todo la estructura.",
          tone: "attack",
          effects: {
            attack: 1.04,
            defense: 0.99,
            risk: 7,
            momentumBias: 2,
            staminaMultiplier: 1.03,
          },
        },
        {
          id: "lock-result",
          label: "Gestionar",
          description: "Reducimos espacios y buscamos dormir el partido.",
          tone: "defense",
          effects: {
            defense: 1.1,
            attack: 0.9,
            staminaMultiplier: 0.82,
            risk: -20,
            immediateStamina: 2.8,
            momentumBias: -2,
          },
        },
      ],
    });
  }

  if (minute >= 28 && minute <= 82) {
    push({
      id: `pressure-shape-${minute}`,
      kind: "pressure_shape",
      minute,
      title: "¿Cómo defendemos este tramo?",
      prompt:
        momentum >= 62
          ? `El ${userTeamName} está imponiendo el ritmo. ¿Mantenemos la presión o bajamos unos metros para no rompernos?`
          : momentum <= 38
            ? `El ${opponentName} nos está empujando. Podemos morder arriba o protegernos detrás del balón.`
            : "El encuentro está pidiendo una decisión clara sobre la altura del bloque.",
      options: [
        {
          id: "press-high",
          label: "Presionar arriba",
          description:
            "Recuperar cerca de su área. Más energía gastada, más opciones de robar y atacar rápido.",
          tone: "intense",
          effects: {
            attack: 1.05,
            defense: 1.04,
            staminaMultiplier: 1.12,
            risk: 10,
            momentumBias: 3.5,
            counter: 1.04,
            immediateStamina: -2.6,
          },
        },
        {
          id: "mid-block",
          label: "Bloque medio",
          description: "Juntamos líneas y esperamos el error sin correr de más.",
          tone: "neutral",
          effects: {
            attack: 1.01,
            defense: 1.04,
            staminaMultiplier: 0.93,
            risk: -2,
            momentumBias: 0.5,
            immediateStamina: 0.5,
          },
        },
        {
          id: "drop-deep",
          label: "Echarse atrás",
          description: "Protegemos la espalda y damos metros, pero reducimos la presión.",
          tone: "defense",
          effects: {
            attack: 0.94,
            defense: 1.09,
            staminaMultiplier: 0.83,
            risk: -14,
            momentumBias: -1.5,
            counter: 1.1,
            immediateStamina: 2.6,
          },
        },
      ],
    });
  }

  if (minute >= 32 && minute <= 80) {
    push({
      id: `build-up-${minute}`,
      kind: "build_up",
      minute,
      title: "La salida de balón está marcando el partido",
      prompt:
        "Podemos atraer, acelerar o saltar líneas. La elección cambia el ritmo y el desgaste.",
      options: [
        {
          id: "short-build",
          label: "Salir en corto",
          description: "Atraemos al rival y buscamos al hombre libre.",
          tone: "neutral",
          effects: {
            central: 1.08,
            attack: 1.03,
            risk: -4,
            staminaMultiplier: 0.96,
            immediateStamina: 0.4,
          },
        },
        {
          id: "vertical-build",
          label: "Ser verticales",
          description: "Primer pase hacia delante y a atacar los espacios antes de que se cierren.",
          tone: "attack",
          effects: { attack: 1.06, counter: 1.1, risk: 7, momentumBias: 2, immediateStamina: -1.4 },
        },
        {
          id: "direct-forward",
          label: "Jugar directo",
          description: "Saltamos líneas y peleamos la segunda jugada cerca del área rival.",
          tone: "intense",
          effects: {
            attack: 1.04,
            counter: 1.14,
            width: 1.04,
            risk: 11,
            momentumBias: 2.5,
            immediateStamina: -1.8,
          },
        },
      ],
    });
  }

  if (minute >= 50 && minute <= 86) {
    push({
      id: `pressing-${minute}`,
      kind: "pressure_shape",
      minute,
      title:
        momentum >= 58 ? "Tenemos al rival saliendo con dificultad" : "Nos cuesta recuperar arriba",
      prompt:
        momentum >= 58
          ? "Hay una ventana para decidir cómo presionar: ¿mordemos arriba, esperamos el error o protegemos el centro?"
          : "La primera presión no está llegando a tiempo. Puedes subir la intensidad, orientar al rival hacia fuera o esperar en bloque.",
      options: [
        {
          id: "press-trap",
          label: "Presionar y encerrar",
          description: "Saltamos sobre el primer pase y tratamos de robar cerca del área rival.",
          tone: "intense",
          effects: {
            attack: 1.05,
            defense: 1.03,
            staminaMultiplier: 1.15,
            risk: 11,
            momentumBias: 4,
            immediateStamina: -3.0,
          },
        },
        {
          id: "press-wide",
          label: "Cerrar una banda",
          description:
            "Forzamos la salida rival hacia una zona concreta y ahorramos carreras centrales.",
          tone: "defense",
          effects: {
            defense: 1.07,
            width: 0.92,
            staminaMultiplier: 0.96,
            risk: -4,
            momentumBias: 1,
            immediateStamina: 0.4,
          },
        },
        {
          id: "mid-block",
          label: "Esperar en bloque medio",
          description:
            "Menos carreras, más control de las distancias y opción de lanzar una contra limpia.",
          tone: "neutral",
          effects: {
            defense: 1.05,
            staminaMultiplier: 0.86,
            risk: -10,
            counter: 1.08,
            momentumBias: -1,
            immediateStamina: 1.8,
          },
        },
      ],
    });
  }

  if (trailing && minute >= 65 && minute <= 87) {
    push({
      id: `desperation-${minute}`,
      kind: "late_game",
      minute,
      title: "El reloj empieza a jugar en nuestra contra",
      prompt: `Necesitamos transformar posesiones en remates sin regalar el partido a la contra.`,
      options: [
        {
          id: "overload-box",
          label: "Llenar el área",
          description: "Más presencia de remate y segundas jugadas, con más riesgo tras pérdida.",
          tone: "intense",
          effects: {
            attack: 1.08,
            width: 1.08,
            staminaMultiplier: 1.12,
            risk: 16,
            momentumBias: 5,
            counter: 1.07,
            immediateStamina: -2.8,
          },
        },
        {
          id: "patient-final-third",
          label: "Paciencia en tres cuartos",
          description:
            "Evita la precipitación y busca una ventaja clara antes de centrar o disparar.",
          tone: "attack",
          effects: {
            attack: 1.04,
            central: 1.08,
            risk: 4,
            staminaMultiplier: 0.94,
            momentumBias: 2,
            immediateStamina: -0.5,
          },
        },
        {
          id: "force_mistake",
          label: "Buscar el error rival",
          description:
            "Subimos presión sobre sus centrales y portero, aunque dejamos más metros atrás.",
          tone: "intense",
          effects: {
            attack: 1.06,
            defense: 0.96,
            staminaMultiplier: 1.16,
            risk: 18,
            momentumBias: 6,
            immediateStamina: -3.6,
          },
        },
      ],
    });
  }

  if (leading && minute >= 68 && minute <= 86 && avgStamina > 62) {
    push({
      id: `game-control-${minute}`,
      kind: "calm",
      minute,
      title: "Podemos enfriar el partido o seguir castigando",
      prompt: "El rival tiene que abrirse. La decisión está en cuánto riesgo quieres aceptar.",
      options: [
        {
          id: "slow-rhythm",
          label: "Enfriar el ritmo",
          description: "Posesiones más largas y menos intercambios de golpes.",
          tone: "defense",
          effects: {
            staminaMultiplier: 0.8,
            attack: 0.95,
            risk: -14,
            momentumBias: -1,
            immediateStamina: 2.2,
          },
        },
        {
          id: "keep-pressing",
          label: "Seguir ahogándolos",
          description: "Aprovechamos que el rival está obligado a salir para robar arriba.",
          tone: "intense",
          effects: {
            staminaMultiplier: 1.12,
            attack: 1.05,
            defense: 1.02,
            risk: 10,
            momentumBias: 3,
            immediateStamina: -2.4,
          },
        },
        {
          id: "bait-counter",
          label: "Ceder y lanzar la contra",
          description: "Invitamos al rival a adelantar piezas para atacar el espacio después.",
          tone: "attack",
          effects: {
            defense: 1.04,
            counter: 1.16,
            attack: 1.03,
            risk: 1,
            momentumBias: 1,
            immediateStamina: 0.6,
          },
        },
      ],
    });
  }

  if (draw && minute >= 68 && minute <= 84 && momentum >= 54) {
    push({
      id: `winning-push-${minute}`,
      kind: "tempo",
      minute,
      title: "Hay una ventana para ir a por el partido",
      prompt:
        "El rival está perdiendo metros. ¿Quieres aprovechar el momento o asegurar que no se rompa el equilibrio?",
      options: [
        {
          id: "press-final",
          label: "Apretar ahora",
          description: "Un tramo corto de máxima intensidad para buscar la primera gran ocasión.",
          tone: "intense",
          effects: {
            attack: 1.08,
            staminaMultiplier: 1.17,
            risk: 13,
            momentumBias: 5,
            immediateStamina: -3.0,
          },
        },
        {
          id: "probe-wide",
          label: "Insistir por fuera",
          description: "Más centros y uno contra uno, buscando que el bloque se estire.",
          tone: "attack",
          effects: {
            width: 1.16,
            attack: 1.04,
            staminaMultiplier: 1.05,
            risk: 7,
            momentumBias: 2,
            immediateStamina: -1.4,
          },
        },
        {
          id: "keep-balance",
          label: "No rompernos",
          description: "Mantenemos el control y esperamos otra grieta sin correr de más.",
          tone: "neutral",
          effects: { defense: 1.03, staminaMultiplier: 0.9, risk: -5, immediateStamina: 1.1 },
        },
      ],
    });
  }

  if (!candidates.length) return null;

  const preferred = candidates.filter((c) => c.kind !== lastDecisionKind);
  const pool = preferred.length ? preferred : candidates;
  const weighted = pool.map((decision) => {
    let weight = 1;
    if (avoidKinds.includes(decision.kind)) weight *= 0.08;
    if (decision.kind === "fatigue" && avgStamina < 62) weight += 3.5;
    if (decision.kind === "protect_lead" && leading) weight += 4;
    if (decision.kind === "chase_goal" && trailing) weight += 4;
    if (decision.kind === "pressure_shape" && (momentum >= 65 || momentum <= 35)) weight += 3;
    if (decision.kind === "build_up" && Math.abs(momentum - 50) < 18) weight += 2;
    if (decision.kind === "late_game" && minute >= 74) weight += 3;
    if (decision.kind === "tempo" && draw) weight += 2;
    if (decision.kind === "width" && minute >= 55 && minute <= 78) weight += 1.5;
    if (decision.kind === "counter" && Math.abs(momentum - 50) > 15) weight += 1.5;
    return { decision, weight };
  });
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) return item.decision;
  }
  return weighted[weighted.length - 1]?.decision ?? null;
}

export function shouldTriggerCoachDecision(lastDecisionMinute: number, minute: number) {
  const gap = minute - lastDecisionMinute;
  // Keep decisions special: never spam them, but allow the next situation to
  // arrive at a different point of the match rather than on a fixed cadence.
  const requiredGap = lastDecisionMinute <= 0 ? 18 : 9 + (lastDecisionMinute % 4);
  return gap >= requiredGap;
}

export function avg(values: number[]) {
  if (!values.length) return 100;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
