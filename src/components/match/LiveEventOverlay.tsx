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
  corner: "🚩",
  penalty_awarded: "🚨",
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
  corner: {
    bar: "from-amber-300 via-orange-300 to-yellow-200",
    soft: "bg-amber-400/10",
    text: "text-amber-200",
    badge: "border-amber-300/25 bg-amber-400/10 text-amber-100",
    icon: CircleAlert,
  },
  penalty_awarded: {
    bar: "from-rose-400 via-red-300 to-orange-300",
    soft: "bg-rose-500/10",
    text: "text-rose-200",
    badge: "border-rose-300/25 bg-rose-500/10 text-rose-100",
    icon: Goal,
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
  const supported = [
    "goal",
    "goal_prelude",
    "danger_chance",
    "danger_save",
    "counter",
    "big_chance",
    "woodwork",
    "save",
    "dangerous_free_kick",
    "corner",
    "penalty_awarded",
    "penalty_goal",
    "penalty_missed",
    "red_card",
  ];
  if (!supported.includes(type)) return null;

  const isSave = type === "save" || type === "danger_save";
  const isCounter = type === "counter";
  const isCorner = type === "corner";
  const isPenalty = type === "penalty_awarded" || type === "penalty_goal" || type === "penalty_missed";
  const isWoodwork = type === "woodwork";
  const isRed = type === "red_card";
  const accent = isSave ? "#67e8f9" : isRed ? "#fb7185" : "#f97316";
  const softAccent = isSave ? "#2563eb" : isRed ? "#991b1b" : "#be123c";
  const fieldGradient = `field-gradient-${type.replace(/[^a-z0-9]/gi, "-")}`;
  const ballPath = isCorner
    ? "M82 45 C148 71, 224 84, 330 55"
    : isCounter
      ? "M76 151 C154 142, 245 82, 392 54"
      : isPenalty
        ? "M118 142 C176 125, 206 101, 230 86"
        : "M94 147 C172 133, 273 75, 414 68";

  return (
    <motion.div
      className="mx-auto mt-5 w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-black/20 p-2 shadow-[0_18px_60px_rgba(0,0,0,.28)]"
      initial={{ opacity: 0, y: 10, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <div className="overflow-hidden rounded-[1.3rem] border border-white/8 bg-[#071b12]">
        <svg viewBox="0 0 520 226" className="block h-auto w-full" aria-hidden>
          <defs>
            <linearGradient id={fieldGradient} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#173d2a" />
              <stop offset="48%" stopColor="#0e2b1d" />
              <stop offset="100%" stopColor="#071911" />
            </linearGradient>
            <linearGradient id={`${fieldGradient}-stripe`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d7ffe7" stopOpacity=".09" />
              <stop offset="100%" stopColor="#d7ffe7" stopOpacity="0" />
            </linearGradient>
            <filter id={`${fieldGradient}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="5" stdDeviation="7" floodColor="#000" floodOpacity=".35" />
            </filter>
          </defs>

          {/* Pseudo-3D pitch */}
          <path
            d="M20 27 Q260 1 500 27 L454 203 Q260 222 66 203 Z"
            fill={`url(#${fieldGradient})`}
            stroke="#dcfce7"
            strokeOpacity=".16"
            strokeWidth="2"
            filter={`url(#${fieldGradient}-shadow)`}
          />
          <path d="M35 39 Q260 17 485 39" fill="none" stroke="#e2f9e9" strokeOpacity=".08" strokeWidth="1.5" />
          <path d="M55 67 Q260 48 465 67" fill="none" stroke="#e2f9e9" strokeOpacity=".05" strokeWidth="1" />
          <path d="M75 95 Q260 82 445 95" fill="none" stroke="#e2f9e9" strokeOpacity=".04" strokeWidth="1" />
          <path d="M94 123 Q260 116 426 123" fill="none" stroke="#e2f9e9" strokeOpacity=".04" strokeWidth="1" />
          <path d="M111 151 Q260 151 409 151" fill="none" stroke="#e2f9e9" strokeOpacity=".04" strokeWidth="1" />

          {/* Main lines */}
          <path d="M260 17 L260 215" stroke="#e8fff0" strokeOpacity=".18" strokeWidth="1.5" />
          <ellipse cx="260" cy="116" rx="31" ry="45" fill="none" stroke="#e8fff0" strokeOpacity=".11" />
          <circle cx="260" cy="116" r="3" fill="#e8fff0" fillOpacity=".22" />

          {/* Attacking third */}
          <path d="M365 31 L454 39 L409 193 L336 201 Z" fill={`url(#${fieldGradient}-stripe)`} opacity=".7" />
          <path d="M384 46 L453 51 L416 181 L357 187 Z" fill="none" stroke="#ecfdf5" strokeOpacity=".15" strokeWidth="2" />
          <path d="M414 62 L454 65 L432 168 L392 171 Z" fill="none" stroke="#ecfdf5" strokeOpacity=".13" strokeWidth="2" />

          {/* Goal frame / net */}
          <path d="M444 67 L486 64 L471 169 L429 172 Z" fill="rgba(255,255,255,.025)" stroke="#f8fafc" strokeOpacity=".55" strokeWidth="2.5" />
          <path d="M452 76 L479 74 M449 89 L477 87 M445 103 L475 101 M442 118 L472 116 M438 134 L469 132 M434 149 L466 147" stroke="#f8fafc" strokeOpacity=".12" />
          <path d="M452 76 L437 165 M462 74 L449 168 M472 74 L461 165 M480 75 L471 163" stroke="#f8fafc" strokeOpacity=".09" />

          {/* Scene-specific elements */}
          {isCorner ? (
            <>
              <motion.circle cx="393" cy="49" r="19" fill={softAccent} fillOpacity=".18" animate={{ scale: [0.96, 1.06, 0.96] }} transition={{ repeat: Infinity, duration: 1.7 }} />
              <path d="M393 50 L435 82 C451 94 459 105 468 121" fill="none" stroke={accent} strokeWidth="4" strokeDasharray="8 7" />
              <motion.circle cx="468" cy="121" r="7" fill="#fff7ed" stroke={accent} strokeWidth="4" animate={{ r: [6, 9, 6] }} transition={{ repeat: Infinity, duration: 1.1 }} />
              <path d="M393 49 V25" stroke="#f8fafc" strokeOpacity=".9" strokeWidth="2" />
              <path d="M394 26 L411 32 L394 39 Z" fill={accent} fillOpacity=".95" />
              <circle cx="393" cy="49" r="4" fill="#fff" />
            </>
          ) : isPenalty ? (
            <>
              <path d="M417 61 L452 64 L441 137 L408 134 Z" fill="none" stroke="#ecfdf5" strokeOpacity=".18" strokeWidth="3" />
              <motion.circle cx="420" cy="116" r="6" fill="#fff" stroke={accent} strokeWidth="3" animate={{ r: [5, 8, 5] }} transition={{ repeat: Infinity, duration: 1 }} />
              <motion.path d="M132 143 C190 126, 228 105, 420 116" fill="none" stroke={accent} strokeWidth="3.5" strokeDasharray="9 7" animate={{ pathLength: [0, 1] }} transition={{ duration: 0.9 }} />
              <circle cx="420" cy="116" r="19" fill="none" stroke={accent} strokeOpacity=".22" strokeWidth="2" />
            </>
          ) : (
            <>
              <motion.path d={ballPath} fill="none" stroke={accent} strokeWidth="4.2" strokeDasharray="10 8" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9 }} />
              <motion.circle cx={isCounter ? 392 : 414} cy={isCounter ? 54 : 68} r="7" fill="#fff" stroke={accent} strokeWidth="3" animate={{ scale: [0.9, 1.25, 0.92] }} transition={{ repeat: Infinity, duration: 1.1 }} />
              <circle cx="93" cy="147" r="8" fill={primaryDot(type)} stroke="#fff" strokeOpacity=".2" strokeWidth="2" />
              {isCounter && <circle cx="210" cy="112" r="7" fill="#e2e8f0" opacity=".75" />}
            </>
          )}

          {isSave && (
            <>
              <motion.path d="M434 84 L412 68 L398 89" fill="none" stroke="#dbeafe" strokeWidth="3.5" strokeLinecap="round" animate={{ x: [0, -7, 0], y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.9 }} />
              <motion.circle cx="398" cy="89" r="15" fill="none" stroke={accent} strokeOpacity=".45" strokeWidth="3" animate={{ scale: [0.8, 1.15, 0.85] }} transition={{ repeat: Infinity, duration: 1 }} />
              <text x="402" y="54" fill="#dbeafe" fillOpacity=".8" fontSize="10" fontWeight="900">🧤</text>
            </>
          )}

          {isWoodwork && (
            <motion.path d="M444 67 L486 64 L471 169" fill="none" stroke="#c4b5fd" strokeWidth="5" animate={{ opacity: [0.35, 1, 0.35] }} transition={{ repeat: Infinity, duration: 0.8 }} />
          )}

          {isRed && (
            <motion.rect x="94" y="119" width="19" height="27" rx="3" fill="#ef4444" animate={{ rotate: [-4, 4, -4] }} transition={{ repeat: Infinity, duration: 0.65 }} />
          )}
        </svg>
      </div>

      <div className="flex items-center justify-between px-2 pt-2 text-[0.55rem] font-black uppercase tracking-[0.18em] text-white/35">
        <span>Campo</span>
        <span>{isCorner ? "Saque de esquina" : isPenalty ? "11 metros" : isCounter ? "Transición" : isSave ? "Área / parada" : isRed ? "Expulsión" : "Zona de remate"}</span>
        <span>Portería</span>
      </div>
    </motion.div>
  );
}

function primaryDot(type: string) {
  if (type === "save" || type === "danger_save") return "#38bdf8";
  if (type === "red_card") return "#fb7185";
  return "#22d3ee";
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
