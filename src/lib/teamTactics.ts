// Tácticas colectivas persistidas por equipo; los planes antiguos se migran
// al leerlos y conservan sus tres huecos y sus identificadores originales.
import { getPlayerCreativeStats, type Player } from "@/data/players";
import { TACTICS_BALANCE } from "@/lib/tacticsBalance";

export type PlayStyle = "defensive" | "balanced" | "offensive";
export type TacticalMentality = PlayStyle;
export type GameStyle = "balanced" | "possession" | "counter" | "wide" | "direct";
export type Pressure = "low" | "medium" | "high";
export type DefenseLine = "low" | "medium" | "high";
export type Tempo = "slow" | "normal" | "high";
export type TeamWidth = "narrow" | "normal" | "wide";
export type PassingStyle = "short" | "mixed" | "direct";
export type TimeWasting = "low" | "normal" | "high";
export type MarkingStyle = "zonal" | "man" | "intense";
export type AggressionLevel = "low" | "normal" | "high";

export type TacticalSystem =
  | "gegenpress"
  | "possession"
  | "low_block_counter"
  | "vertical_transition"
  | "wing_play"
  | "direct_play"
  | "offside_trap"
  | "inside_overload"
  | "set_piece"
  | "close_out"
  | "mid_block_press"
  | "build_up";

export type TacticalInstruction =
  | "counterpress"
  | "play_out"
  | "early_crosses"
  | "underlap"
  | "run_in_behind"
  | "switch_play"
  | "attack_set_pieces"
  | "regroup";

export type TeamTactics = {
  system: TacticalSystem;
  mentality: TacticalMentality;
  gameStyle: GameStyle;
  secondaryInstructions: TacticalInstruction[];
  /** Los sistemas generados para CPU se recalculan con el XI de cada partido. */
  aiManaged?: boolean;
  // Compatibilidad con partidas guardadas antes del rediseño.
  style: PlayStyle;
  pressure: Pressure;
  defenseLine: DefenseLine;
  tempo: Tempo;
  width: TeamWidth;
  attackingWidth: TeamWidth;
  passingStyle: PassingStyle;
  counterAttack: boolean;
  timeWasting: TimeWasting;
  marking: MarkingStyle;
  aggressionLevel: AggressionLevel;
  captainId: string | null;
  penaltyTakerId: string | null;
  freekickTakerId: string | null;
  cornerTakerId: string | null;
};

export type TacticPlan = {
  id: string;
  name: string;
  formation: string;
  lineup: string[];
  substitutes: string[];
  tactics: TeamTactics;
};

export type TacticPlanState = { activeId: string; plans: TacticPlan[] };

export type TacticalSystemDefinition = {
  id: TacticalSystem;
  name: string;
  description: string;
  identity: string;
  advantages: string[];
  risks: string[];
  vulnerableTo: TacticalSystem[];
  goodAgainst: TacticalSystem[];
  requirements: string;
  fitHint: string;
  compatibleInstructions: TacticalInstruction[];
  commentary: string[];
};

export const TACTICAL_SYSTEMS: TacticalSystemDefinition[] = [
  {
    id: "low_block_counter", name: "Bloque bajo",
    description: "Defiende cerca del área, protege el centro y obliga al rival a atacar por fuera.",
    identity: "Proteger la portería y reducir espacios cerca del área.",
    advantages: ["Reduce las ocasiones y el peligro del rival", "Protege mejor la portería"],
    risks: ["Tu equipo genera menos ocasiones", "Cedes gran parte de la posesión"],
    vulnerableTo: ["possession", "wing_play"],
    goodAgainst: ["gegenpress", "inside_overload", "vertical_transition", "build_up"],
    requirements: "Centrales fuertes, laterales disciplinados y delanteros con velocidad para salir.",
    fitHint: "Defensa + físico + velocidad de los atacantes.",
    compatibleInstructions: ["regroup", "run_in_behind", "attack_set_pieces"],
    commentary: ["El equipo se junta cerca del área y cierra los espacios interiores.", "Tras recuperar, busca una salida rápida para alejar el peligro."],
  },
  {
    id: "close_out", name: "Bloque medio compacto",
    description: "Mantiene las líneas juntas en campo propio y protege el pasillo central.",
    identity: "Orden defensivo y distancias cortas entre líneas.",
    advantages: ["Reduce el peligro de los ataques rivales", "Concede menos espacios cerca del área"],
    risks: ["Generas menos ocasiones propias", "Llegas menos veces al área rival"],
    vulnerableTo: ["possession", "wing_play"],
    goodAgainst: ["vertical_transition", "inside_overload"],
    requirements: "Mediocentros disciplinados y defensas que mantengan bien la posición.",
    fitHint: "Defensa + físico + colocación colectiva.",
    compatibleInstructions: ["regroup", "play_out", "attack_set_pieces"],
    commentary: ["El bloque se mantiene compacto y obliga al rival a buscar los costados.", "El equipo cierra el centro y protege el área sin perseguir al rival por todo el campo."],
  },
  {
    id: "vertical_transition", name: "Repliegue y contraataque",
    description: "Repliega con orden y acelera en cuanto recupera el balón.",
    identity: "Defender juntos y atacar los espacios con pocos toques.",
    advantages: ["Aumenta los contraataques", "Genera más peligro tras recuperar"],
    risks: ["Pierdes posesión", "Necesitas energía para repetir las carreras"],
    vulnerableTo: ["low_block_counter", "close_out"],
    goodAgainst: ["possession", "gegenpress", "wing_play", "mid_block_press"],
    requirements: "Delanteros veloces, buenos pasadores y un bloque capaz de replegar unido.",
    fitHint: "Ritmo + pase + resistencia de los atacantes.",
    compatibleInstructions: ["run_in_behind", "switch_play", "early_crosses"],
    commentary: ["El equipo repliega y sale con velocidad tras recuperar.", "El primer pase busca el espacio antes de que el rival pueda ordenarse."],
  },
  {
    id: "possession", name: "Plan equilibrado",
    description: "Mantiene un bloque medio, combina cuando hay espacio y no asume riesgos innecesarios.",
    identity: "Una estructura estable para defender y atacar sin extremos.",
    advantages: ["No penaliza tu ataque ni tu defensa", "Mantiene un rendimiento estable"],
    risks: ["No aumenta especialmente tus ocasiones", "Tampoco refuerza una fase concreta"],
    vulnerableTo: ["gegenpress", "vertical_transition", "inside_overload"],
    goodAgainst: ["low_block_counter", "close_out", "mid_block_press"],
    requirements: "Un once compensado, con defensa fiable y centro del campo trabajador.",
    fitHint: "Atributos equilibrados en todas las líneas.",
    compatibleInstructions: ["play_out", "switch_play", "attack_set_pieces"],
    commentary: ["El equipo mantiene el orden y elige cuándo acelerar.", "Las líneas se mantienen juntas mientras el balón circula con paciencia."],
  },
  {
    id: "mid_block_press", name: "Presión en medio campo",
    description: "Espera en zona media y presiona cuando el rival entra en tu campo.",
    identity: "Robar en el centro sin adelantar demasiado la defensa.",
    advantages: ["Aumenta las recuperaciones en medio campo", "Dificulta la salida rival"],
    risks: ["Aumenta el desgaste y las faltas", "La presión puede dejar espacios si llegas tarde"],
    vulnerableTo: ["possession", "vertical_transition"],
    goodAgainst: ["build_up"],
    requirements: "Mediocampistas con resistencia, defensa coordinada y buena lectura del juego.",
    fitHint: "Resistencia + defensa + pase de los mediocampistas.",
    compatibleInstructions: ["counterpress", "regroup", "play_out"],
    commentary: ["El equipo espera en medio campo y salta a presionar cuando aparece la señal.", "La presión en zona media fuerza un pase precipitado y permite recuperar."],
  },
  {
    id: "build_up", name: "Salida desde atrás",
    description: "Inicia las jugadas con pases cortos y apoyos desde la defensa.",
    identity: "Superar la primera presión con pases seguros y cercanos.",
    advantages: ["Aumenta la posesión del equipo", "Mantiene el balón durante más fases del partido"],
    risks: ["Concedes más contraataques", "Sufres ante la presión en medio campo"],
    vulnerableTo: ["mid_block_press", "low_block_counter"],
    goodAgainst: ["gegenpress", "wing_play"],
    requirements: "Centrales y mediocentros con pase, control y serenidad.",
    fitHint: "Pase + control + apoyos en el centro del campo.",
    compatibleInstructions: ["play_out", "switch_play", "underlap"],
    commentary: ["El equipo sale desde atrás con pases cortos y apoyos cercanos.", "La salida limpia supera la primera línea de presión."],
  },
  {
    id: "gegenpress", name: "Presión alta",
    description: "Aprieta cerca del área rival para recuperar y atacar de inmediato.",
    identity: "Presionar arriba y provocar errores en la salida rival.",
    advantages: ["Aumenta los robos cerca del área rival", "Genera más ocasiones tras recuperar"],
    risks: ["Consume mucha energía", "Concedes más contraataques"],
    vulnerableTo: ["low_block_counter", "vertical_transition", "build_up"],
    goodAgainst: ["possession", "inside_overload"],
    requirements: "Jugadores rápidos, resistentes y coordinados para presionar juntos.",
    fitHint: "Ritmo + físico + resistencia.",
    compatibleInstructions: ["counterpress", "run_in_behind", "attack_set_pieces"],
    commentary: ["El equipo presiona arriba y recupera cerca del área rival.", "La presión fuerza un error y permite atacar con pocos pases."],
  },
  {
    id: "wing_play", name: "Ataque por bandas",
    description: "Abre el campo, busca el desborde y carga el área desde los costados.",
    identity: "Amplitud, uno contra uno y centros al área.",
    advantages: ["Aumenta el número de centros", "Genera más peligro por las bandas"],
    risks: ["Concedes más contraataques", "Aumenta el desgaste de los jugadores de banda"],
    vulnerableTo: ["vertical_transition", "build_up"],
    goodAgainst: ["close_out", "inside_overload", "low_block_counter"],
    requirements: "Extremos rápidos y laterales con resistencia y buenos centros.",
    fitHint: "Centros + regate + ritmo de bandas.",
    compatibleInstructions: ["early_crosses", "switch_play", "attack_set_pieces"],
    commentary: ["El equipo abre el campo y busca llegar a línea de fondo.", "Los extremos encaran y aparece el centro al área."],
  },
  {
    id: "inside_overload", name: "Ataque por dentro",
    description: "Junta jugadores entre líneas para combinar cerca del área.",
    identity: "Más presencia en zonas centrales y apoyo cerca del área.",
    advantages: ["Aumenta el peligro de tus ocasiones", "Genera más llegadas por el centro"],
    risks: ["Generas menos centros", "Concedes más contraataques"],
    vulnerableTo: ["close_out", "wing_play", "low_block_counter", "gegenpress"],
    goodAgainst: ["possession"],
    requirements: "Mediapunta o interiores creativos, buenos pasadores y regateadores.",
    fitHint: "Pase + regate + creatividad del centro del campo.",
    compatibleInstructions: ["underlap", "play_out", "run_in_behind"],
    commentary: ["La combinación interior encuentra un pase entre líneas.", "Los jugadores se juntan por dentro y aparece espacio para el último pase."],
  },
  // Sistemas antiguos: permanecen para leer partidas guardadas y se migran
  // automáticamente a las alternativas nuevas antes de llegar al motor.
  {
    id: "offside_trap", name: "Línea adelantada (antigua)",
    description: "Sistema antiguo que ya no se ofrece en la selección.", identity: "Compatibilidad de partidas guardadas.",
    advantages: ["Compatibilidad"], risks: ["Ya no está disponible"], vulnerableTo: [], goodAgainst: [],
    requirements: "Migración automática.", fitHint: "", compatibleInstructions: [], commentary: [],
  },
  {
    id: "direct_play", name: "Balón largo (antigua táctica)",
    description: "Sistema antiguo sustituido por el estilo de juego Balón largo.", identity: "Compatibilidad de partidas guardadas.",
    advantages: ["Compatibilidad"], risks: ["Ya no está disponible como táctica"], vulnerableTo: [], goodAgainst: [],
    requirements: "Migración automática.", fitHint: "", compatibleInstructions: [], commentary: [],
  },
  {
    id: "set_piece", name: "Balón parado (antigua táctica)",
    description: "Sistema antiguo sustituido por la selección independiente de estilo.", identity: "Compatibilidad de partidas guardadas.",
    advantages: ["Compatibilidad"], risks: ["Ya no está disponible como táctica"], vulnerableTo: [], goodAgainst: [],
    requirements: "Migración automática.", fitHint: "", compatibleInstructions: [], commentary: [],
  },
];

/** Mentalidad general: los botones filtran las tres tácticas de cada grupo. */
export const TACTICAL_MENTALITIES: Array<{ id: TacticalMentality; name: string; description: string }> = [
  { id: "defensive", name: "Defensiva", description: "Proteger el área y esperar el momento de salir." },
  { id: "balanced", name: "Equilibrada", description: "Mantener el orden sin renunciar a atacar." },
  { id: "offensive", name: "Ofensiva", description: "Presionar y atacar con más jugadores." },
];

const SYSTEM_MENTALITY: Record<TacticalSystem, TacticalMentality> = {
  low_block_counter: "defensive",
  close_out: "defensive",
  vertical_transition: "defensive",
  possession: "balanced",
  mid_block_press: "balanced",
  build_up: "balanced",
  gegenpress: "offensive",
  wing_play: "offensive",
  inside_overload: "offensive",
  // IDs conservados solo para normalizar planes anteriores.
  offside_trap: "balanced",
  direct_play: "balanced",
  set_piece: "balanced",
};

const UI_SYSTEM_ORDER: TacticalSystem[] = [
  "low_block_counter", "close_out", "vertical_transition",
  "possession", "mid_block_press", "build_up",
  "gegenpress", "wing_play", "inside_overload",
];

export const TACTICAL_SYSTEMS_FOR_UI: TacticalSystemDefinition[] = UI_SYSTEM_ORDER
  .map((id) => TACTICAL_SYSTEMS.find((item) => item.id === id))
  .filter((item): item is TacticalSystemDefinition => Boolean(item));

export const TACTICAL_OPTIONS_BY_MENTALITY: Record<TacticalMentality, TacticalSystemDefinition[]> = {
  defensive: TACTICAL_SYSTEMS_FOR_UI.filter((item) => SYSTEM_MENTALITY[item.id] === "defensive"),
  balanced: TACTICAL_SYSTEMS_FOR_UI.filter((item) => SYSTEM_MENTALITY[item.id] === "balanced"),
  offensive: TACTICAL_SYSTEMS_FOR_UI.filter((item) => SYSTEM_MENTALITY[item.id] === "offensive"),
};

export const TACTICAL_GAME_STYLES: Array<{
  id: GameStyle;
  name: string;
  description: string;
  advantage: string;
  risk: string;
}> = [
  { id: "balanced", name: "Mixto", description: "Alterna ataques elaborados y rápidos.", advantage: "Mantiene el equilibrio de posesión y transiciones", risk: "No potencia una vía de ataque concreta" },
  { id: "possession", name: "Pases cortos", description: "Prioriza la posesión y la circulación por abajo.", advantage: "Aumenta la posesión del equipo", risk: "Reduce los contraataques y aumenta ligeramente el desgaste" },
  { id: "counter", name: "Transiciones rápidas", description: "Busca atacar rápido tras recuperar.", advantage: "Aumenta los contraataques", risk: "Reduce la posesión y deja más espacio para las contras rivales" },
  { id: "wide", name: "Centros laterales", description: "Busca el área con envíos desde las bandas.", advantage: "Aumenta el número de centros", risk: "Concedes más contraataques y gastas más energía" },
  { id: "direct", name: "Balón largo", description: "Busca avanzar con envíos largos y ataques directos.", advantage: "Aumenta el peligro en ataques directos", risk: "Pierdes posesión" },
];

const LEGACY_SYSTEM_MIGRATION: Partial<Record<TacticalSystem, TacticalSystem>> = {
  offside_trap: "mid_block_press",
  direct_play: "vertical_transition",
  set_piece: "possession",
};

export const TACTIC_MATCHUP_MATRIX: Record<TacticalSystem, { goodAgainst: TacticalSystem[]; vulnerableTo: TacticalSystem[] }> =
  Object.fromEntries(TACTICAL_SYSTEMS.map((item) => [item.id, { goodAgainst: item.goodAgainst, vulnerableTo: item.vulnerableTo }])) as any;

const STORAGE_PREFIX = "modo-carrera:tactics:";
const PLANS_STORAGE_PREFIX = "modo-carrera:tactic-plans:";
const CURRENT_SAVE_ID_KEY = "fcsim:save:current";

function activeCareerId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CURRENT_SAVE_ID_KEY);
}
function plansStorageKey(teamId: string): string {
  const careerId = activeCareerId();
  return careerId ? `${PLANS_STORAGE_PREFIX}${careerId}:${teamId}` : `${PLANS_STORAGE_PREFIX}${teamId}`;
}
function tacticsStorageKey(teamId: string): string {
  const careerId = activeCareerId();
  return careerId ? `${STORAGE_PREFIX}${careerId}:${teamId}` : `${STORAGE_PREFIX}${teamId}`;
}

export const DEFAULT_TACTICS: TeamTactics = {
  system: "possession",
  mentality: "balanced",
  gameStyle: "balanced",
  secondaryInstructions: [],
  aiManaged: false,
  style: "balanced",
  pressure: "medium",
  defenseLine: "medium",
  tempo: "normal",
  width: "normal",
  attackingWidth: "normal",
  passingStyle: "mixed",
  counterAttack: false,
  timeWasting: "normal",
  marking: "zonal",
  aggressionLevel: "normal",
  captainId: null,
  penaltyTakerId: null,
  freekickTakerId: null,
  cornerTakerId: null,
};

const VALID_SYSTEMS = new Set<TacticalSystem>(TACTICAL_SYSTEMS.map((item) => item.id));
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? value as T : fallback;

function inferLegacySystem(input: Record<string, any>): TacticalSystem {
  if (input.style === "defensive" && input.counterAttack && (input.defenseLine === "low" || input.pressure === "low")) return "low_block_counter";
  if (input.timeWasting === "high" && input.style === "defensive") return "close_out";
  if (input.marking === "man" && input.defenseLine === "high") return "close_out";
  if (input.passingStyle === "short" && input.tempo === "slow") return "possession";
  if (input.attackingWidth === "wide" || input.width === "wide") return "wing_play";
  if (input.passingStyle === "direct" && input.counterAttack) return "vertical_transition";
  if (input.passingStyle === "direct") return "vertical_transition";
  if (input.pressure === "high" && input.aggressionLevel === "high") return "gegenpress";
  if (input.attackingWidth === "narrow") return "inside_overload";
  if (input.style === "defensive" && input.pressure === "low") return "low_block_counter";
  return "possession";
}

function inferLegacyGameStyle(input: Record<string, any>, system: TacticalSystem): GameStyle {
  if (Object.keys(input).length === 0) return "balanced";
  if (input.system === "direct_play" || input.gameStyle === "direct") return "direct";
  if (input.system === "low_block_counter" || input.system === "vertical_transition" || input.counterAttack) return "counter";
  if (input.system === "wing_play" || input.width === "wide" || input.attackingWidth === "wide") return "wide";
  if (input.system === "possession" || input.system === "build_up" || input.passingStyle === "short") return "possession";
  if (input.passingStyle === "direct") return "direct";
  if (system === "wing_play") return "wide";
  if (system === "vertical_transition" || system === "low_block_counter") return "counter";
  return "balanced";
}

/** Migra esquemas antiguos y sanea los campos nuevos sin perder capitanes ni planes. */
export function normalizeTactics(input?: Partial<TeamTactics> | Record<string, any> | null): TeamTactics {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, any>;
  const storedSystem = oneOf(raw.system, [...VALID_SYSTEMS], inferLegacySystem(raw));
  const system = LEGACY_SYSTEM_MIGRATION[storedSystem] ?? storedSystem;
  const mentality = SYSTEM_MENTALITY[system] ?? oneOf(raw.mentality ?? raw.style, ["defensive", "balanced", "offensive"], "balanced");
  const gameStyle = oneOf(raw.gameStyle, ["balanced", "possession", "counter", "wide", "direct"], inferLegacyGameStyle(raw, system));
  const secondaryInstructions: TacticalInstruction[] = [];
  return {
    ...DEFAULT_TACTICS,
    system,
    mentality,
    gameStyle,
    secondaryInstructions,
    aiManaged: Boolean(raw.aiManaged),
    // `style` se mantiene como alias para partidas y consumidores antiguos.
    style: mentality,
    pressure: oneOf(raw.pressure, ["low", "medium", "high"], DEFAULT_TACTICS.pressure),
    defenseLine: oneOf(raw.defenseLine, ["low", "medium", "high"], DEFAULT_TACTICS.defenseLine),
    tempo: oneOf(raw.tempo, ["slow", "normal", "high"], DEFAULT_TACTICS.tempo),
    width: oneOf(raw.width, ["narrow", "normal", "wide"], DEFAULT_TACTICS.width),
    attackingWidth: oneOf(raw.attackingWidth, ["narrow", "normal", "wide"], DEFAULT_TACTICS.attackingWidth),
    passingStyle: oneOf(raw.passingStyle, ["short", "mixed", "direct"], DEFAULT_TACTICS.passingStyle),
    counterAttack: Boolean(raw.counterAttack),
    timeWasting: oneOf(raw.timeWasting, ["low", "normal", "high"], DEFAULT_TACTICS.timeWasting),
    marking: oneOf(raw.marking, ["zonal", "man", "intense"], DEFAULT_TACTICS.marking),
    aggressionLevel: oneOf(raw.aggressionLevel, ["low", "normal", "high"], DEFAULT_TACTICS.aggressionLevel),
    captainId: typeof raw.captainId === "string" ? raw.captainId : null,
    penaltyTakerId: typeof raw.penaltyTakerId === "string" ? raw.penaltyTakerId : null,
    freekickTakerId: typeof raw.freekickTakerId === "string" ? raw.freekickTakerId : null,
    cornerTakerId: typeof raw.cornerTakerId === "string" ? raw.cornerTakerId : null,
  };
}

const LEGACY_PRESETS: Partial<Record<TacticalSystem, Partial<TeamTactics>>> = {
  low_block_counter: { pressure: "low", defenseLine: "low", aggressionLevel: "low" },
  close_out: { pressure: "medium", defenseLine: "low", aggressionLevel: "normal" },
  vertical_transition: { pressure: "low", defenseLine: "medium", aggressionLevel: "normal" },
  possession: { pressure: "medium", defenseLine: "medium", aggressionLevel: "normal" },
  mid_block_press: { pressure: "medium", defenseLine: "medium", aggressionLevel: "high" },
  build_up: { pressure: "medium", defenseLine: "medium", aggressionLevel: "low" },
  gegenpress: { pressure: "high", defenseLine: "high", aggressionLevel: "high" },
  wing_play: { pressure: "medium", defenseLine: "medium", aggressionLevel: "normal" },
  inside_overload: { pressure: "medium", defenseLine: "medium", aggressionLevel: "normal" },
  offside_trap: { pressure: "high", defenseLine: "high", marking: "zonal" },
  direct_play: { pressure: "medium", defenseLine: "medium", aggressionLevel: "normal" },
  set_piece: { pressure: "medium", defenseLine: "medium", aggressionLevel: "normal" },
};

export function setTacticalSystem(current: TeamTactics, system: TacticalSystem): TeamTactics {
  const preset = LEGACY_PRESETS[system] ?? {};
  const allowed = TACTICAL_SYSTEMS.find((item) => item.id === system)?.compatibleInstructions ?? [];
  const mentality = SYSTEM_MENTALITY[system] ?? "balanced";
  return normalizeTactics({
    ...current,
    ...preset,
    system,
    mentality,
    style: mentality,
    secondaryInstructions: current.secondaryInstructions.filter((instruction) => allowed.includes(instruction)),
    aiManaged: false,
  });
}

const LEGACY_GAME_STYLE_PRESETS: Record<GameStyle, Partial<TeamTactics>> = {
  balanced: { passingStyle: "mixed", counterAttack: false, tempo: "normal", width: "normal", attackingWidth: "normal" },
  possession: { passingStyle: "short", counterAttack: false, tempo: "slow", width: "normal", attackingWidth: "normal" },
  counter: { passingStyle: "direct", counterAttack: true, tempo: "high", width: "normal", attackingWidth: "normal" },
  wide: { passingStyle: "mixed", counterAttack: false, tempo: "high", width: "wide", attackingWidth: "wide" },
  direct: { passingStyle: "direct", counterAttack: false, tempo: "high", width: "normal", attackingWidth: "normal" },
};

export function setTacticalGameStyle(current: TeamTactics, gameStyle: GameStyle): TeamTactics {
  // Mantiene sincronizados los campos antiguos que aún leen algunos módulos.
  // La mentalidad y el sistema no se alteran al cambiar el estilo de juego.
  return normalizeTactics({ ...current, ...LEGACY_GAME_STYLE_PRESETS[gameStyle], gameStyle, aiManaged: false });
}

export function toggleTacticalInstruction(current: TeamTactics, instruction: TacticalInstruction): TeamTactics {
  const compatible = TACTICAL_SYSTEMS.find((item) => item.id === current.system)?.compatibleInstructions ?? [];
  if (!compatible.includes(instruction)) return current;
  const selected = current.secondaryInstructions.includes(instruction)
    ? current.secondaryInstructions.filter((item) => item !== instruction)
    : current.secondaryInstructions.length < 2
      ? [...current.secondaryInstructions, instruction]
      : current.secondaryInstructions;
  return normalizeTactics({ ...current, secondaryInstructions: selected, aiManaged: false });
}

export function loadTacticPlans(teamId: string): TacticPlanState | null {
  if (typeof window === "undefined" || !teamId) return null;
  try {
    const rawPlans = window.localStorage.getItem(plansStorageKey(teamId));
    if (rawPlans) {
      const parsed = JSON.parse(rawPlans) as Partial<TacticPlanState>;
      const plans = Array.isArray(parsed.plans) ? parsed.plans
        .filter((plan): plan is TacticPlan => !!plan && typeof plan.id === "string")
        .slice(0, 3)
        .map((plan) => ({
          id: plan.id,
          name: plan.name || plan.id,
          formation: plan.formation || "Táctica 4-3-3",
          lineup: Array.isArray(plan.lineup) ? plan.lineup.filter(Boolean) : [],
          substitutes: Array.isArray(plan.substitutes) ? plan.substitutes.filter(Boolean).slice(0, 12) : [],
          tactics: normalizeTactics(plan.tactics),
        })) : [];
      if (plans.length) {
        const activeId = plans.some((plan) => plan.id === parsed.activeId) ? parsed.activeId as string : plans[0].id;
        return { activeId, plans };
      }
    }
    if (activeCareerId()) return null;
    const legacyRaw = window.localStorage.getItem(STORAGE_PREFIX + teamId);
    const legacy = legacyRaw ? JSON.parse(legacyRaw) : null;
    if (legacy) return { activeId: "plan-a", plans: [{
      id: "plan-a", name: "Plan A", formation: "Táctica 4-3-3", lineup: [], substitutes: [], tactics: normalizeTactics(legacy),
    }] };
  } catch { /* Datos antiguos mal formados: usar valores seguros. */ }
  return null;
}

export function saveTacticPlans(teamId: string, state: TacticPlanState): void {
  if (typeof window === "undefined" || !teamId) return;
  try {
    const plans = state.plans.slice(0, 3).map((plan) => ({
      ...plan,
      lineup: plan.lineup.filter(Boolean),
      substitutes: plan.substitutes.filter(Boolean).slice(0, 12),
      tactics: normalizeTactics({ ...plan.tactics, aiManaged: false }),
    }));
    const activeId = plans.some((plan) => plan.id === state.activeId) ? state.activeId : plans[0]?.id ?? "plan-a";
    window.localStorage.setItem(plansStorageKey(teamId), JSON.stringify({ activeId, plans }));
    const active = plans.find((plan) => plan.id === activeId);
    if (active) {
      window.localStorage.setItem(tacticsStorageKey(teamId), JSON.stringify(active.tactics));
      TACTICS_CACHE.set(teamId, active.tactics);
    }
  } catch { /* Cuota de almacenamiento o JSON no disponible. */ }
}

export function createTacticPlan(input: Partial<TacticPlan> & Pick<TacticPlan, "id" | "name">): TacticPlan {
  return {
    id: input.id,
    name: input.name,
    formation: input.formation ?? "Táctica 4-4-2",
    lineup: input.lineup ? [...input.lineup] : [],
    substitutes: input.substitutes ? input.substitutes.filter(Boolean).slice(0, 12) : [],
    tactics: normalizeTactics(input.tactics),
  };
}

const TACTICS_CACHE = new Map<string, TeamTactics>();
export function loadTactics(teamId: string): TeamTactics {
  const cached = TACTICS_CACHE.get(teamId);
  if (cached) return { ...cached, secondaryInstructions: [...cached.secondaryInstructions] };
  const state = loadTacticPlans(teamId);
  const active = state?.plans.find((plan) => plan.id === state.activeId);
  if (active) {
    const tactics = { ...active.tactics, aiManaged: false };
    TACTICS_CACHE.set(teamId, tactics);
    return { ...tactics };
  }
  if (typeof window === "undefined") {
    const tactics = { ...DEFAULT_TACTICS, aiManaged: true };
    TACTICS_CACHE.set(teamId, tactics);
    return { ...tactics };
  }
  try {
    const raw = window.localStorage.getItem(tacticsStorageKey(teamId));
    if (raw) {
      const tactics = normalizeTactics(JSON.parse(raw));
      TACTICS_CACHE.set(teamId, tactics);
      return { ...tactics };
    }
  } catch { /* Datos antiguos mal formados. */ }
  const generated = { ...DEFAULT_TACTICS, aiManaged: true };
  TACTICS_CACHE.set(teamId, generated);
  return { ...generated };
}

export function saveTactics(teamId: string, tactics: TeamTactics): void {
  const normalized = normalizeTactics({ ...tactics, aiManaged: false });
  TACTICS_CACHE.set(teamId, normalized);
  const state = loadTacticPlans(teamId);
  if (state?.plans.length) {
    saveTacticPlans(teamId, { ...state, plans: state.plans.map((plan) =>
      plan.id === state.activeId ? { ...plan, tactics: normalized } : plan,
    ) });
    return;
  }
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(tacticsStorageKey(teamId), JSON.stringify(normalized)); }
  catch { /* Cuota de almacenamiento. */ }
}

// ---------------------------------------------------------------------------
// Encaje del sistema con el once
// ---------------------------------------------------------------------------
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const average = (values: number[], fallback = 65) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
function playerStat(player: Player, key: "PAC" | "SHO" | "PAS" | "DRI" | "DEF" | "PHY" | "crossing" | "longPassing"): number {
  const dynamic = player.attributes ?? player.dynamicStats?.attributes;
  if (key === "crossing" || key === "longPassing") {
    const creative = getPlayerCreativeStats(player.id, dynamic);
    const raw = key === "crossing" ? creative.crossing : (player.longPassing ?? creative.longPassing);
    return clamp(Number(raw ?? dynamic?.PAS ?? player.rating) || player.rating, 1, 99);
  }
  return clamp(Number(dynamic?.[key] ?? player.rating) || player.rating, 1, 99);
}
function hasPosition(player: Player, codes: string[]): boolean {
  return (player.positions ?? []).some((position) => codes.includes(String(position)));
}

export function calculateTacticalFit(systemOrTactics: TacticalSystem | TeamTactics, xi: Player[] = []): number {
  if (!xi.length) return 70;
  const system = typeof systemOrTactics === "string" ? systemOrTactics : systemOrTactics.system;
  const outfield = xi.filter((player) => !hasPosition(player, ["GK"]));
  const defenders = xi.filter((player) => hasPosition(player, ["DFC", "LD", "LI"]));
  const mids = xi.filter((player) => hasPosition(player, ["MCD", "MC", "MCO", "MD", "MI"]));
  const forwards = xi.filter((player) => hasPosition(player, ["DC", "ED", "EI"]));
  const wide = xi.filter((player) => hasPosition(player, ["LD", "LI", "MD", "MI", "ED", "EI"]));
  const gk = xi.filter((player) => hasPosition(player, ["GK"]));
  const all = (key: Parameters<typeof playerStat>[1]) => average(outfield.map((player) => playerStat(player, key)), 66);
  const role = (players: Player[], key: Parameters<typeof playerStat>[1]) => average(players.map((player) => playerStat(player, key)), all(key));
  let quality = 0;
  let coveragePenalty = 0;
  switch (system) {
    case "gegenpress":
      quality = all("PAC") * 0.38 + all("PHY") * 0.34 + all("DEF") * 0.28;
      if (mids.length < 3) coveragePenalty += 5;
      if (outfield.filter((p) => Number(p.energy ?? 100) >= 70).length < 7) coveragePenalty += 4;
      break;
    case "possession":
      quality = (all("PAC") + all("PAS") + all("DEF") + all("PHY")) / 4;
      if (outfield.length < 10) coveragePenalty += 2;
      break;
    case "low_block_counter":
      quality = role(defenders, "DEF") * 0.36 + role(defenders, "PHY") * 0.24 + role(forwards, "PAC") * 0.28 + role(gk, "DEF") * 0.12;
      if (defenders.length < 3 || forwards.length < 2) coveragePenalty += 6;
      break;
    case "vertical_transition":
      quality = role(forwards, "PAC") * 0.38 + role(forwards, "SHO") * 0.24 + all("PAS") * 0.20 + all("PHY") * 0.18;
      if (forwards.length < 3) coveragePenalty += 6;
      break;
    case "wing_play":
      quality = role(wide, "crossing") * 0.38 + role(wide, "PAC") * 0.28 + role(wide, "DRI") * 0.24 + all("PHY") * 0.10;
      if (wide.length < 4) coveragePenalty += 8;
      break;
    case "direct_play":
      quality = role(forwards, "PHY") * 0.34 + role(forwards, "SHO") * 0.22 + role(defenders, "PAS") * 0.22 + all("PHY") * 0.22;
      if (!xi.some((p) => hasPosition(p, ["DC"]))) coveragePenalty += 8;
      break;
    case "mid_block_press":
      quality = role(mids, "DEF") * 0.34 + role(mids, "PHY") * 0.28 + role(mids, "PAS") * 0.20 + role(defenders, "DEF") * 0.18;
      if (mids.length < 3 || defenders.length < 3) coveragePenalty += 5;
      break;
    case "build_up":
      quality = role(defenders, "PAS") * 0.34 + role(mids, "PAS") * 0.36 + role(mids, "DRI") * 0.20 + all("PHY") * 0.10;
      if (defenders.length < 3 || mids.length < 3) coveragePenalty += 5;
      break;
    case "offside_trap":
      quality = role(defenders, "PAC") * 0.38 + role(defenders, "DEF") * 0.38 + role(gk, "DEF") * 0.12 + all("PAS") * 0.12;
      if (defenders.length < 3 || !gk.length) coveragePenalty += 6;
      break;
    case "inside_overload":
      quality = role(mids, "PAS") * 0.37 + role(mids, "DRI") * 0.35 + role(mids, "SHO") * 0.18 + all("PAC") * 0.10;
      if (!xi.some((p) => hasPosition(p, ["MCO"])) || mids.length < 3) coveragePenalty += 8;
      break;
    case "set_piece":
      quality = all("PHY") * 0.34 + all("SHO") * 0.26 + all("PAS") * 0.20 + role(defenders, "PHY") * 0.20;
      if (defenders.length < 3) coveragePenalty += 4;
      break;
    case "close_out":
      quality = role(defenders, "DEF") * 0.42 + all("PHY") * 0.28 + all("DEF") * 0.20 + average(outfield.map((p) => Number(p.energy ?? 100)), 80) * 0.10;
      if (defenders.length < 4) coveragePenalty += 5;
      break;
  }
  const rules = TACTICS_BALANCE.fit;
  return Math.round(clamp(rules.base + quality * rules.qualityWeight - coveragePenalty, rules.min, rules.max));
}

export type TacticsModifiers = {
  attack: number;
  defense: number;
  stamina: number;
  aggression: number;
  possession: number;
  chanceCreation: number;
  defensiveRisk: number;
  foulRisk: number;
  tacticalFit: number;
  highRecoveries: number;
  counterThreat: number;
  crossThreat: number;
  throughThreat: number;
  setPieceThreat: number;
  centralThreat: number;
  longBallThreat: number;
  injuryRisk: number;
};

/** Multiplicadores de partido + perfil de ocasiones, ya ponderados por encaje. */
export function tacticsModifiers(
  input?: Partial<TeamTactics> | null,
  xi: Player[] = [],
  context: { minute?: number; scoreDiff?: number; averageStamina?: number } = {},
): TacticsModifiers {
  const t = normalizeTactics(input);
  const system = TACTICS_BALANCE.systems[t.system];
  const fit = calculateTacticalFit(t, xi);
  const fitRules = TACTICS_BALANCE.fit;
  const fitPerformance = fit < fitRules.poorThreshold
    ? 1 - (fitRules.poorThreshold - fit) * fitRules.poorPenaltyPerPoint
    : 1 + (fit - fitRules.goodThreshold) * fitRules.goodBonusPerPoint;
  let attack = system.attack * fitPerformance;
  let defense = system.defense * fitPerformance;
  let stamina = system.stamina;
  let possession = system.possession;
  let chanceCreation = system.chanceCreation * fitPerformance;
  let defensiveRisk = system.defensiveRisk;
  let foulRisk = system.foulRisk;
  let aggression = 1;
  let highRecoveries = system.highRecoveries;
  let counterThreat = system.counterThreat;
  let crossThreat = system.crossThreat;
  let throughThreat = system.throughThreat;
  let setPieceThreat = system.setPieceThreat;
  let centralThreat = system.centralThreat;
  let longBallThreat = system.longBallThreat;
  let injuryRisk = system.injuryRisk;

  for (const instruction of t.secondaryInstructions) {
    switch (instruction) {
      case "counterpress": highRecoveries += 0.07; stamina *= 1.035; foulRisk *= 1.045; injuryRisk *= 1.025; break;
      case "play_out": possession *= 1.035; attack *= 0.99; defensiveRisk *= 1.025; break;
      case "early_crosses": crossThreat += 0.12; chanceCreation *= 1.015; possession *= 0.985; stamina *= 1.015; break;
      case "underlap": centralThreat += 0.09; crossThreat -= 0.06; possession *= 1.015; break;
      case "run_in_behind": throughThreat += 0.12; counterThreat += 0.035; stamina *= 1.025; break;
      case "switch_play": crossThreat += 0.055; possession *= 1.015; chanceCreation *= 1.01; break;
      case "attack_set_pieces": setPieceThreat += 0.12; foulRisk *= 1.015; break;
      case "regroup": defense *= 1.025; stamina *= 0.965; defensiveRisk *= 0.94; highRecoveries -= 0.025; break;
    }
  }

  // Los ajustes antiguos siguen teniendo efecto moderado, pero el sistema
  // principal ya no se diluye entre ocho selectores casi independientes.
  if (t.mentality === "offensive") { attack *= 1.018; defense *= 0.99; defensiveRisk *= 1.025; }
  if (t.mentality === "defensive") { attack *= 0.99; defense *= 1.018; defensiveRisk *= 0.97; }

  // El estilo de juego es independiente de la mentalidad y modifica el tipo
  // de acciones que busca el equipo, no solo el multiplicador global de ataque.
  const gameStyle = TACTICS_BALANCE.gameStyles[t.gameStyle];
  possession *= gameStyle.possession;
  stamina *= gameStyle.stamina;
  counterThreat += gameStyle.counterThreat;
  crossThreat += gameStyle.crossThreat;
  throughThreat += gameStyle.throughThreat;
  centralThreat += gameStyle.centralThreat;
  longBallThreat += gameStyle.longBallThreat;
  defensiveRisk *= gameStyle.defensiveRisk;
  chanceCreation *= gameStyle.chanceCreation;
  if (t.pressure === "high") { attack *= 1.012; stamina *= 1.025; aggression *= 1.08; foulRisk *= 1.035; }
  if (t.pressure === "low") { stamina *= 0.985; aggression *= 0.94; foulRisk *= 0.96; }
  if (t.tempo === "high") { attack *= 1.012; chanceCreation *= 1.015; stamina *= 1.025; }
  if (t.tempo === "slow") { possession *= 1.015; stamina *= 0.985; }
  if (t.passingStyle === "short") possession *= 1.015;
  if (t.passingStyle === "direct") { counterThreat += 0.025; longBallThreat += 0.025; possession *= 0.985; }
  if (t.counterAttack) counterThreat += 0.035;
  if (t.timeWasting === "high") { attack *= 0.985; stamina *= 0.985; defensiveRisk *= 0.97; }
  if (t.marking === "intense") { defense *= 1.012; stamina *= 1.02; foulRisk *= 1.07; }
  if (t.aggressionLevel === "high") { aggression *= 1.08; foulRisk *= 1.06; stamina *= 1.01; }
  if (t.aggressionLevel === "low") { aggression *= 0.93; foulRisk *= 0.94; }

  const minute = Number(context.minute ?? 0);
  const energy = Number(context.averageStamina ?? (xi.length ? average(xi.map((p) => Number(p.energy ?? 100))) : 100));
  if (t.system === "gegenpress" && minute >= TACTICS_BALANCE.lateGame.gegenpressFadeMinute && energy < TACTICS_BALANCE.lateGame.gegenpressLowEnergy) {
    attack *= TACTICS_BALANCE.lateGame.gegenpressFade;
    highRecoveries *= TACTICS_BALANCE.lateGame.gegenpressFade;
    defensiveRisk *= 1.045;
  }
  if (t.system === "mid_block_press" && minute >= TACTICS_BALANCE.lateGame.highPressFadeMinute && energy < TACTICS_BALANCE.lateGame.highPressLowEnergy) {
    highRecoveries *= TACTICS_BALANCE.lateGame.highPressFade;
    stamina *= 0.985;
  }
  if (t.system === "close_out" && context.scoreDiff !== undefined) {
    if (context.scoreDiff > 0 && minute >= TACTICS_BALANCE.lateGame.leadingCloseOutMinute) {
      defense *= 1.035;
      defensiveRisk *= 0.94;
    } else if (context.scoreDiff < 0) {
      attack *= 0.96;
      chanceCreation *= 0.96;
    }
  }
  if (context.scoreDiff !== undefined && context.scoreDiff < 0 && minute >= TACTICS_BALANCE.lateGame.trailingIntensityMinute) {
    attack *= TACTICS_BALANCE.lateGame.trailingIntensity;
    stamina *= 1.025;
    defensiveRisk *= 1.02;
  }

  const b = TACTICS_BALANCE.bounds;
  return {
    attack: clamp(attack, ...b.attack), defense: clamp(defense, ...b.defense),
    stamina: clamp(stamina, ...b.stamina), aggression: clamp(aggression, 0.75, 1.28),
    possession: clamp(possession, ...b.possession), chanceCreation: clamp(chanceCreation, ...b.chanceCreation),
    defensiveRisk: clamp(defensiveRisk, ...b.risk), foulRisk: clamp(foulRisk, ...b.discipline),
    tacticalFit: fit, highRecoveries: clamp(highRecoveries, -0.08, 0.42),
    counterThreat: clamp(counterThreat, -0.08, 0.36), crossThreat: clamp(crossThreat, -0.12, 0.42),
    throughThreat: clamp(throughThreat, -0.10, 0.38), setPieceThreat: clamp(setPieceThreat, -0.04, 0.48),
    centralThreat: clamp(centralThreat, -0.12, 0.36), longBallThreat: clamp(longBallThreat, -0.12, 0.36),
    injuryRisk: clamp(injuryRisk * (fit < 62 ? 1.06 : 1), 0.82, 1.22),
  };
}

export function tacticalMatchupMultiplier(own: TacticalSystem, opponent: TacticalSystem): number {
  const matchup = TACTIC_MATCHUP_MATRIX[own];
  const advantage = matchup.goodAgainst.includes(opponent);
  const weakness = matchup.vulnerableTo.includes(opponent);
  const result = (advantage ? TACTICS_BALANCE.matchupBonus : 0) - (weakness ? TACTICS_BALANCE.matchupPenalty : 0);
  return clamp(1 + result, 1 - TACTICS_BALANCE.maxMatchupSwing, 1 + TACTICS_BALANCE.maxMatchupSwing);
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

/** Selección de CPU estable: encaje alto + pequeño sesgo de identidad y contexto. */
export function chooseAITactics(
  xi: Player[], teamId: string,
  context: { minute?: number; scoreDiff?: number } = {},
): TeamTactics {
  const minute = Number(context.minute ?? 0);
  const diff = Number(context.scoreDiff ?? 0);
  const candidates = TACTICAL_SYSTEMS_FOR_UI.map((definition, index) => {
    const fit = calculateTacticalFit(definition.id, xi);
    let score = fit + ((stableHash(`${teamId}:${definition.id}`) % 100) / 100) * 3;
    if (minute >= 68 && diff > 0) score += definition.id === "low_block_counter" ? 8 : 0;
    if (minute >= 72 && diff < 0) score += ["gegenpress", "vertical_transition", "wing_play", "inside_overload"].includes(definition.id) ? 12 : 0;
    return { id: definition.id, score, index };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  const chosen = candidates[0]?.id ?? "possession";
  const systemTactics = setTacticalSystem(DEFAULT_TACTICS, chosen);
  const gameStyle: GameStyle = chosen === "wing_play" ? "wide"
    : chosen === "vertical_transition" ? "counter"
      : chosen === "build_up" || chosen === "possession" || chosen === "inside_overload" ? "possession" : "balanced";
  return { ...setTacticalGameStyle(systemTactics, gameStyle), aiManaged: true };
}

export function resolveMatchTactics(
  tactics: Partial<TeamTactics> | null | undefined,
  xi: Player[], teamId: string,
  context: { minute?: number; scoreDiff?: number } = {},
): TeamTactics {
  if (!tactics || tactics.aiManaged) return chooseAITactics(xi, teamId, context);
  return normalizeTactics(tactics);
}
