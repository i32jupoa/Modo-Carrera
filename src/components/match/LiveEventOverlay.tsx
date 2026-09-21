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
};

function EventDiagram({ type }: { type: string }) {
  if (
    ![
      "goal",
      "goal_prelude",
      "danger_chance",
      "danger_save",
      "counter",
      "big_chance",
      "woodwork",
      "save",
      "dangerous_free_kick",
    ].includes(type)
  ) {
    return null;
  }

  const danger = type === "save" || type === "danger_save" ? "#60a5fa" : "#fb7185";
  const primary = "#67e8f9";

  return (
    <div className="mx-auto mt-4 w-full max-w-2xl overflow-hidden rounded-2xl border border-white/8 bg-black/10 p-2">
      <svg viewBox="0 0 360 92" className="w-full" aria-hidden>
        <defs>
          <linearGradient id="event-path" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={primary} stopOpacity=".25" />
            <stop offset="60%" stopColor={primary} />
            <stop offset="100%" stopColor={danger} />
          </linearGradient>
        </defs>
        <rect
          x="1"
          y="1"
          width="358"
          height="90"
          rx="14"
          fill="none"
          stroke="white"
          strokeOpacity=".08"
        />
        <path
          d="M278 12V80M278 28H349M278 64H349"
          stroke="white"
          strokeOpacity=".09"
          strokeWidth="2"
        />
        <motion.circle
          cx="68"
          cy="60"
          r="7"
          fill={primary}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        />
        <motion.path
          d="M84 59 C148 29, 214 28, 298 42"
          fill="none"
          stroke="url(#event-path)"
          strokeWidth="4"
          strokeDasharray="8 8"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.65 }}
        />
        <motion.circle
          cx="298"
          cy="42"
          r="10"
          fill="none"
          stroke={danger}
          strokeWidth="3"
          initial={{ scale: 0.65, opacity: 0.35 }}
          animate={{ scale: [0.8, 1.18, 0.95], opacity: [0.35, 1, 0.7] }}
          transition={{ duration: 0.7 }}
        />
        <motion.circle
          cx="298"
          cy="42"
          r="3"
          fill={danger}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.25, 1, 0.4] }}
          transition={{ duration: 0.7 }}
        />
        {type === "woodwork" && (
          <motion.line
            x1="320"
            y1="18"
            x2="350"
            y2="18"
            stroke="#a78bfa"
            strokeWidth="5"
            initial={{ opacity: 0.2 }}
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 0.55 }}
          />
        )}
      </svg>
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
                <div
                  className={`shrink-0 rounded-2xl border border-white/8 ${tone.soft} px-4 py-3 text-3xl shadow-inner`}
                >
                  {eventIcon}
                </div>
              </div>

              <div className="relative mt-5 grid gap-4 md:grid-cols-[7.5rem_minmax(0,1fr)] md:items-center">
                <div className="flex justify-start md:justify-center">
                  {event.playerName ? (
                    <div className="relative">
                      <div className={`absolute inset-0 -m-2 rounded-full blur-xl ${tone.soft}`} />
                      <PlayerFace
                        name={event.playerName}
                        image={faceUrl(event.playerId)}
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
                          image={faceUrl(event.playerId)}
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
              <EventDiagram type={event.type} />

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
                      {event.type === "penalty_intro" ? "Ir al lanzamiento" : "Siguiente"}
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
