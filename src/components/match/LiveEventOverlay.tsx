import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  CircleAlert,
  Clock3,
  Goal,
  ShieldAlert,
  Siren,
  Sparkles,
  SquareArrowOutUpRight,
  type LucideIcon,
} from "lucide-react";
import { PlayerFace } from "@/components/PlayerFace";
import { TeamLogo } from "@/components/TeamLogo";
import { faceUrl } from "@/lib/playerFaces";

export interface LiveEventOverlayData {
  id: string;
  type: string;
  minute: number;
  title: string;
  kicker?: string;
  body: string;
  playerName?: string;
  playerId?: string;
  playerImage?: string;
  teamName: string;
  teamLeagueName?: string;
  emoji: string;
  detail?: string;
  teamSide?: "home" | "away";
  choices?: Array<{
    id: string;
    label: string;
    description: string;
    tone?: "neutral" | "attack" | "defense" | "risk";
    effects?: Record<string, number>;
  }>;
  actionPrompt?: string;
}

const iconByType: Record<string, string> = {
  goal: "⚽",
  penalty_goal: "⚽",
  free_kick_goal: "🎯",
  own_goal: "⚽",
  penalty_missed: "❌",
  var_disallowed: "📺",
  save: "🧤",
  woodwork: "💥",
  big_chance: "🔥",
  counter: "⚡",
  dangerous_free_kick: "🎯",
  goal_prelude: "🚨",
  danger_chance: "🚨",
  danger_save: "🚨",
  injury: "🚑",
  red_card: "🟥",
  yellow_card: "🟨",
  halftime: "⏸️",
};

const eventTone: Record<
  string,
  { bar: string; soft: string; text: string; badge: string; icon: LucideIcon }
> = {
  goal: {
    bar: "from-emerald-400 via-green-300 to-cyan-300",
    soft: "bg-emerald-400/10",
    text: "text-emerald-300",
    badge: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
    icon: Goal,
  },
  penalty_goal: {
    bar: "from-emerald-400 via-cyan-300 to-primary",
    soft: "bg-emerald-400/10",
    text: "text-emerald-300",
    badge: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
    icon: Goal,
  },
  goal_prelude: {
    bar: "from-red-400 via-orange-300 to-amber-200",
    soft: "bg-red-500/10",
    text: "text-red-300",
    badge: "border-red-400/25 bg-red-500/10 text-red-200",
    icon: Siren,
  },
  danger_chance: {
    bar: "from-red-400 via-orange-300 to-amber-200",
    soft: "bg-red-500/10",
    text: "text-red-300",
    badge: "border-red-400/25 bg-red-500/10 text-red-200",
    icon: Siren,
  },
  danger_save: {
    bar: "from-blue-400 via-cyan-300 to-indigo-300",
    soft: "bg-blue-500/10",
    text: "text-blue-300",
    badge: "border-blue-400/25 bg-blue-500/10 text-blue-200",
    icon: ShieldAlert,
  },
  save: {
    bar: "from-blue-400 via-cyan-300 to-indigo-300",
    soft: "bg-blue-500/10",
    text: "text-blue-300",
    badge: "border-blue-400/25 bg-blue-500/10 text-blue-200",
    icon: ShieldAlert,
  },
  injury: {
    bar: "from-amber-300 via-orange-300 to-red-300",
    soft: "bg-amber-400/10",
    text: "text-amber-200",
    badge: "border-amber-300/25 bg-amber-400/10 text-amber-100",
    icon: AlertTriangle,
  },
  injury_substitution: {
    bar: "from-red-400 via-orange-300 to-emerald-400",
    soft: "bg-amber-400/10",
    text: "text-amber-200",
    badge: "border-orange-300/25 bg-orange-400/10 text-orange-100",
    icon: AlertTriangle,
  },
  red_card: {
    bar: "from-rose-500 via-red-400 to-orange-300",
    soft: "bg-rose-500/10",
    text: "text-rose-300",
    badge: "border-rose-400/25 bg-rose-500/10 text-rose-200",
    icon: SquareArrowOutUpRight,
  },
  yellow_card: {
    bar: "from-yellow-300 via-amber-300 to-orange-300",
    soft: "bg-yellow-400/10",
    text: "text-yellow-200",
    badge: "border-yellow-300/30 bg-yellow-400/10 text-yellow-100",
    icon: SquareArrowOutUpRight,
  },
  halftime: {
    bar: "from-sky-300 via-cyan-300 to-primary",
    soft: "bg-sky-400/10",
    text: "text-sky-200",
    badge: "border-sky-300/30 bg-sky-400/10 text-sky-100",
    icon: Clock3,
  },
};

function EventVisual({ type }: { type: string }) {
  const visualByType: Record<string, { src: string; alt: string }> = {
    goal: { src: "/match-events/gol.png", alt: "Visualización de gol" },
    penalty_goal: { src: "/match-events/gol.png", alt: "Visualización de gol de penalti" },
    free_kick_goal: { src: "/match-events/gol.png", alt: "Visualización de gol de falta" },
    own_goal: { src: "/match-events/gol.png", alt: "Visualización de gol en propia puerta" },
    goal_prelude: { src: "/match-events/peligro.png", alt: "Visualización de peligro" },
    danger_chance: { src: "/match-events/peligro.png", alt: "Visualización de peligro" },
    danger_save: { src: "/match-events/peligro.png", alt: "Visualización de peligro" },
    counter: { src: "/match-events/peligro.png", alt: "Visualización de peligro" },
    dangerous_free_kick: { src: "/match-events/peligro.png", alt: "Visualización de peligro" },
    save: { src: "/match-events/parada.png", alt: "Visualización de parada" },
    woodwork: { src: "/match-events/palo.png", alt: "Visualización de tiro al palo" },
    big_chance: { src: "/match-events/fallo.png", alt: "Visualización de fallo" },
    penalty_missed: { src: "/match-events/fallo.png", alt: "Visualización de fallo de penalti" },
  };

  const visual = visualByType[type];
  if (!visual) return null;

  return (
    <div className="mx-auto mt-5 w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-[#080c12] shadow-[0_18px_55px_rgba(0,0,0,.35)]">
      <img
        src={visual.src}
        alt={visual.alt}
        className="block h-auto w-full select-none object-cover"
        draggable={false}
      />
    </div>
  );
}

function iconClass(type: string) {
  const tone = eventTone[type] || {
    bar: "from-cyan-300 via-primary to-blue-400",
    soft: "bg-primary/10",
    text: "text-primary",
    badge: "border-primary/25 bg-primary/10 text-primary-foreground",
    icon: Sparkles,
  };
  return tone;
}

function choiceClass(tone?: NonNullable<LiveEventOverlayData["choices"]>[number]["tone"]) {
  switch (tone) {
    case "attack":
      return "border-primary/40 bg-primary/10 hover:bg-primary/15";
    case "defense":
      return "border-sky-400/30 bg-sky-400/5 hover:bg-sky-400/10";
    case "risk":
      return "border-rose-400/35 bg-rose-400/5 hover:bg-rose-400/10";
    default:
      return "border-white/10 bg-white/[0.035] hover:border-primary/30 hover:bg-primary/5";
  }
}

export function LiveEventOverlay({
  event,
  onContinue,
  onChooseDanger,
}: {
  event: LiveEventOverlayData | null;
  onContinue?: () => void;
  onChooseDanger?: (choiceId: string) => void;
}) {
  const hasChoices = !!event?.choices?.length;
  const tone = event ? iconClass(event.type) : iconClass("");
  const ToneIcon = tone.icon;
  const eventIcon = event ? event.emoji || iconByType[event.type] || "⚡" : "⚡";

  return (
    <AnimatePresence>
      {event && (
        <motion.div
          key={event.id}
          className="fixed inset-0 z-[90] flex items-center justify-center p-3 md:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,.07),transparent_28%),linear-gradient(rgba(4,6,10,.72),rgba(4,6,10,.90))] backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          />

          <motion.div
            className="relative w-full max-w-3xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#11151f]/98 shadow-[0_28px_100px_rgba(0,0,0,.58)]"
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.985 }}
            transition={{ type: "spring", stiffness: 180, damping: 21 }}
          >
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${tone.bar}`} />

            <div className="relative overflow-hidden border-b border-white/8 px-5 pb-5 pt-5 md:px-8 md:pt-7">
              <div
                className={`absolute -right-24 -top-24 h-64 w-64 rounded-full ${tone.soft} blur-3xl`}
              />
              <div className="relative flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[0.62rem] font-black uppercase tracking-[0.19em] text-white/50">
                    <Clock3 className="h-3.5 w-3.5" />
                    <span>{event.minute}'</span>
                    <span>·</span>
                    <span className="truncate">{event.teamName}</span>
                  </div>
                  <div
                    className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.55rem] font-black uppercase tracking-[0.16em] ${tone.badge}`}
                  >
                    <ToneIcon className="h-3.5 w-3.5" />
                    <span>{event.kicker || "Momento clave"}</span>
                    {hasChoices && <span className="opacity-65">· Decide tú</span>}
                  </div>
                </div>
                {![
                  "goal",
                  "penalty_goal",
                  "free_kick_goal",
                  "own_goal",
                  "goal_prelude",
                  "danger_chance",
                  "danger_save",
                  "counter",
                  "dangerous_free_kick",
                  "save",
                  "woodwork",
                  "big_chance",
                  "penalty_missed",
                ].includes(event.type) && (
                  <div
                    className={`shrink-0 rounded-2xl border border-white/8 ${tone.soft} px-4 py-3 text-3xl shadow-inner`}
                  >
                    {eventIcon}
                  </div>
                )}
              </div>

              <div className="relative mt-5 grid gap-4 md:grid-cols-[7.5rem_minmax(0,1fr)] md:items-center">
                <div className="flex justify-start md:justify-center">
                  {event.playerName ? (
                    <div className="relative">
                      <div className={`absolute inset-0 -m-2 rounded-full blur-xl ${tone.soft}`} />
                      <PlayerFace
                        name={event.playerName}
                        image={faceUrl(event.playerId, event.playerImage)}
                        size={94}
                        showRing
                        className="relative shadow-2xl"
                      />
                    </div>
                  ) : (
                    <div
                      className={`flex h-[94px] w-[94px] items-center justify-center rounded-full border border-white/10 ${tone.soft} shadow-inner`}
                    >
                      <ToneIcon className={`h-10 w-10 ${tone.text}`} />
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  {event.playerName && (
                    <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.58rem] font-black uppercase tracking-[0.15em] text-white/40">
                      <span>Protagonista</span>
                      <span>·</span>
                      <span className="text-white/70">{event.playerName}</span>
                    </div>
                  )}
                  <h2 className="text-3xl font-black uppercase tracking-[-0.04em] text-white md:text-5xl">
                    {event.title}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-white/65 md:text-base">
                    {event.body}
                  </p>
                </div>
              </div>

              {event.type === "injury_substitution" ? (
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4">
                    <div className="text-[0.58rem] font-black uppercase tracking-[0.17em] text-red-300">
                      Sale · lesionado
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      {event.playerName && (
                        <PlayerFace
                          name={event.playerName}
                          image={faceUrl(event.playerId, event.playerImage)}
                          size={66}
                          showRing
                          className="shadow-2xl"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-white">
                          {event.playerName}
                        </div>
                        <div className="mt-1 text-[0.64rem] leading-5 text-red-200/75">
                          {event.detail || "No puede continuar"}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                    <div className="text-[0.58rem] font-black uppercase tracking-[0.17em] text-emerald-300">
                      Banquillo · sustituto
                    </div>
                    <div className="mt-3 flex min-h-[66px] items-center gap-3">
                      <div className="grid h-[66px] w-[66px] place-items-center rounded-full border border-emerald-400/25 bg-emerald-400/10 text-2xl text-emerald-200">
                        +
                      </div>
                      <div>
                        <div className="text-sm font-black text-white">
                          {(event as any).forceLineupEdit === false
                            ? "Sin cambios disponibles"
                            : "Elige quién entra"}
                        </div>
                        <div className="mt-1 text-[0.64rem] leading-5 text-emerald-100/65">
                          {(event as any).forceLineupEdit === false
                            ? "El equipo continuará con uno menos."
                            : "La posición queda libre hasta que selecciones un sustituto."}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {event.teamLeagueName && (
                <div className="mt-4 flex items-center gap-2 text-[0.58rem] font-black uppercase tracking-[0.15em] text-white/35">
                  <TeamLogo teamName={event.teamName} leagueName={event.teamLeagueName} size={22} />
                  <span>{event.teamName}</span>
                </div>
              )}
            </div>

            <div className="px-5 py-5 md:px-8 md:py-6">
              <EventVisual type={event.type} />

              {event.detail && !hasChoices && (
                <div className="mx-auto mt-4 max-w-2xl rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3 text-center text-[0.68rem] font-semibold leading-5 text-white/45">
                  {event.detail}
                </div>
              )}

              {hasChoices && (
                <div className="mx-auto mt-4 max-w-2xl">
                  <div className="mb-2 text-[0.6rem] font-black uppercase tracking-[0.18em] text-white/40">
                    {event.actionPrompt || "¿Qué quieres hacer?"}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {event.choices!.map((choice) => (
                      <motion.button
                        key={choice.id}
                        type="button"
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onChooseDanger?.(choice.id)}
                        className={`rounded-2xl border p-3 text-left transition ${choiceClass(choice.tone)}`}
                      >
                        <div className="text-xs font-black text-white">{choice.label}</div>
                        <div className="mt-1 text-[0.64rem] leading-relaxed text-white/45">
                          {choice.description}
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              {!hasChoices && onContinue && (
                <div className="mt-5 flex justify-center">
                  <motion.button
                    type="button"
                    onClick={onContinue}
                    whileHover={{ scale: 1.015, y: -1 }}
                    whileTap={{ scale: 0.985 }}
                    className={`group inline-flex min-w-52 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-6 py-3.5 text-xs font-black uppercase tracking-[0.15em] text-white shadow-lg transition hover:bg-white/[0.09]`}
                  >
                    <span>
                      {event.type === "penalty_intro" ? "Ir al lanzamiento" : "Continuar partido"}
                    </span>
                    <ArrowRight className="h-4 w-4 text-white/55 transition group-hover:translate-x-0.5" />
                  </motion.button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
