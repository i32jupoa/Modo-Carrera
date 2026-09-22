import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
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

const eventTone: Record<
  string,
  { bar: string; soft: string; text: string; badge: string; icon: LucideIcon }
> = {
  goal: { bar: "from-emerald-400 via-cyan-300 to-blue-300", soft: "bg-emerald-400/10", text: "text-emerald-200", badge: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100", icon: Goal },
  penalty_goal: { bar: "from-emerald-400 via-cyan-300 to-primary", soft: "bg-emerald-400/10", text: "text-emerald-200", badge: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100", icon: Goal },
  free_kick_goal: { bar: "from-emerald-400 via-sky-300 to-fuchsia-300", soft: "bg-emerald-400/10", text: "text-emerald-200", badge: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100", icon: Goal },
  own_goal: { bar: "from-rose-400 via-orange-300 to-emerald-300", soft: "bg-rose-400/10", text: "text-rose-200", badge: "border-rose-300/25 bg-rose-400/10 text-rose-100", icon: Goal },
  goal_prelude: { bar: "from-rose-400 via-orange-300 to-amber-200", soft: "bg-rose-500/10", text: "text-rose-200", badge: "border-rose-300/25 bg-rose-500/10 text-rose-100", icon: Siren },
  danger_chance: { bar: "from-rose-400 via-orange-300 to-amber-200", soft: "bg-rose-500/10", text: "text-rose-200", badge: "border-rose-300/25 bg-rose-500/10 text-rose-100", icon: Siren },
  danger_save: { bar: "from-blue-400 via-cyan-300 to-indigo-300", soft: "bg-blue-500/10", text: "text-blue-200", badge: "border-blue-300/25 bg-blue-500/10 text-blue-100", icon: ShieldAlert },
  save: { bar: "from-blue-400 via-cyan-300 to-indigo-300", soft: "bg-blue-500/10", text: "text-blue-200", badge: "border-blue-300/25 bg-blue-500/10 text-blue-100", icon: ShieldAlert },
  woodwork: { bar: "from-fuchsia-400 via-rose-300 to-orange-200", soft: "bg-fuchsia-400/10", text: "text-fuchsia-200", badge: "border-fuchsia-300/25 bg-fuchsia-400/10 text-fuchsia-100", icon: Sparkles },
  injury: { bar: "from-amber-300 via-orange-300 to-red-300", soft: "bg-amber-400/10", text: "text-amber-200", badge: "border-amber-300/25 bg-amber-400/10 text-amber-100", icon: AlertTriangle },
  injury_substitution: { bar: "from-amber-300 via-orange-300 to-emerald-400", soft: "bg-amber-400/10", text: "text-amber-200", badge: "border-orange-300/25 bg-orange-400/10 text-orange-100", icon: AlertTriangle },
  red_card: { bar: "from-rose-500 via-red-400 to-orange-300", soft: "bg-rose-500/10", text: "text-rose-200", badge: "border-rose-400/25 bg-rose-500/10 text-rose-100", icon: SquareArrowOutUpRight },
  yellow_card: { bar: "from-yellow-300 via-amber-300 to-orange-300", soft: "bg-yellow-400/10", text: "text-yellow-200", badge: "border-yellow-300/30 bg-yellow-400/10 text-yellow-100", icon: SquareArrowOutUpRight },
  halftime: { bar: "from-sky-300 via-cyan-300 to-primary", soft: "bg-sky-400/10", text: "text-sky-100", badge: "border-sky-300/30 bg-sky-400/10 text-sky-100", icon: Clock3 },
};

const typeIcon: Record<string, string> = {
  goal: "⚽",
  penalty_goal: "⚽",
  free_kick_goal: "🎯",
  own_goal: "⚽",
  penalty_missed: "❌",
  var_disallowed: "📺",
  save: "🧤",
  danger_save: "🧤",
  woodwork: "💥",
  big_chance: "🔥",
  counter: "⚡",
  dangerous_free_kick: "🎯",
  goal_prelude: "🚨",
  danger_chance: "🚨",
  injury: "🚑",
  injury_substitution: "🚑",
  red_card: "🟥",
  yellow_card: "🟨",
  halftime: "⏸️",
};

function toneFor(type: string) {
  return eventTone[type] ?? {
    bar: "from-cyan-300 via-primary to-blue-400",
    soft: "bg-primary/10",
    text: "text-primary",
    badge: "border-primary/25 bg-primary/10 text-primary-foreground",
    icon: Sparkles,
  };
}

function shortName(name?: string) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  return parts.length <= 2 ? name : `${parts[0]} ${parts[parts.length - 1]}`;
}

function initials(name?: string) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function MirrorX({ x, attackSide }: { x: number; attackSide: "home" | "away" }) {
  return attackSide === "away" ? 100 - x : x;
}

function Player3D({
  x,
  y,
  side,
  name,
  image,
  active = false,
  delay = 0,
  number,
}: {
  x: number;
  y: number;
  side: "home" | "away";
  name?: string;
  image?: string;
  active?: boolean;
  delay?: number;
  number?: string;
}) {
  const home = side === "home";
  const shirt = home ? "from-sky-300 via-blue-600 to-blue-950" : "from-rose-300 via-rose-600 to-slate-950";
  const trim = home ? "#8ee8ff" : "#ffb1c2";
  const hasImage = Boolean(image);

  return (
    <motion.div
      className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${x}%`, top: `${y}%`, transformStyle: "preserve-3d" }}
      initial={{ opacity: 0, y: 12, scale: 0.82 }}
      animate={{ opacity: 1, y: [0, -2, 0], scale: active ? [1, 1.05, 1] : 1 }}
      transition={{ opacity: { duration: 0.22, delay }, scale: { duration: 0.7, delay, repeat: active ? Infinity : 0 }, y: { duration: 1.8, delay, repeat: Infinity, ease: "easeInOut" } }}
    >
      <div className="relative h-[74px] w-[62px] [transform-style:preserve-3d] [transform:rotateX(16deg)_rotateY(-10deg)]">
        <div className="absolute bottom-0 left-1/2 h-3 w-14 -translate-x-1/2 rounded-full bg-black/45 blur-[3px]" />
        <div className={`absolute bottom-4 left-1/2 h-10 w-10 -translate-x-1/2 rounded-[45%_45%_28%_28%] bg-gradient-to-br ${shirt} shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_8px_18px_rgba(0,0,0,.28)]`}>
          <div className="absolute inset-x-2 top-1 h-5 rounded-full border-b border-white/25" />
          <div className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-white/20" />
          {number && <span className="absolute inset-x-0 top-3 text-center text-[9px] font-black text-white/85">{number}</span>}
        </div>
        <div className="absolute bottom-1 left-[18px] h-8 w-2.5 -rotate-[9deg] rounded-full bg-slate-200/80 shadow-lg" />
        <div className="absolute bottom-1 right-[18px] h-8 w-2.5 rotate-[9deg] rounded-full bg-slate-200/80 shadow-lg" />
        <div className="absolute bottom-0 left-[12px] h-2 w-5 rounded-full bg-slate-50/90" />
        <div className="absolute bottom-0 right-[12px] h-2 w-5 rounded-full bg-slate-50/90" />
        <div className="absolute left-1/2 top-0 h-9 w-9 -translate-x-1/2 overflow-hidden rounded-full border-2 border-white/85 bg-gradient-to-br from-amber-100 to-orange-200 shadow-[0_8px_20px_rgba(0,0,0,.35)]">
          {hasImage ? (
            <img src={image} alt="" className="h-full w-full object-cover object-top" draggable={false} />
          ) : (
            <div className="grid h-full w-full place-items-center bg-gradient-to-br from-slate-400 via-slate-600 to-slate-900 text-[9px] font-black text-white/85">{initials(name)}</div>
          )}
        </div>
        {active && <motion.div className="absolute -inset-2 rounded-[1.1rem] border border-cyan-200/60 shadow-[0_0_24px_rgba(53,215,255,.35)]" animate={{ opacity: [0.35, 1, 0.35], scale: [0.94, 1.03, 0.94] }} transition={{ duration: 1.4, repeat: Infinity }} />}
        {name && (
          <div className="absolute left-1/2 -top-5 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-[#07101b]/90 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.12em] text-white shadow-xl backdrop-blur-sm">
            {shortName(name)}
          </div>
        )}
        <div className="absolute -right-1 bottom-[25px] h-2.5 w-2.5 rounded-full border border-white/50" style={{ background: trim, boxShadow: `0 0 10px ${trim}` }} />
      </div>
    </motion.div>
  );
}

function Ball3D({ x, y, animateTo }: { x: number; y: number; animateTo?: { x: number; y: number } }) {
  return (
    <motion.div
      className="absolute z-30 -translate-x-1/2 -translate-y-1/2"
      initial={{ left: `${x}%`, top: `${y}%`, scale: 0.8, opacity: 0 }}
      animate={{ left: `${animateTo?.x ?? x}%`, top: `${animateTo?.y ?? y}%`, scale: 1, opacity: 1, rotate: [0, 180, 360] }}
      transition={{ left: { duration: 1.0, ease: "easeOut" }, top: { duration: 1.0, ease: "easeOut" }, rotate: { duration: 1.2, repeat: Infinity, ease: "linear" }, scale: { duration: 0.3 }, opacity: { duration: 0.25 } }}
    >
      <div className="relative h-5 w-5 rounded-full bg-[radial-gradient(circle_at_30%_25%,#fff,#dfe6ef_52%,#78889d_100%)] shadow-[0_4px_14px_rgba(0,0,0,.55),0_0_18px_rgba(255,255,255,.28)]">
        <span className="absolute inset-[4px] rounded-full border border-slate-700/25" />
        <span className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-white/80" />
      </div>
    </motion.div>
  );
}

function Goal3D({ leftSide, accent }: { leftSide: boolean; accent: string }) {
  return (
    <div
      className="absolute top-[35%] z-10 h-[42%] w-[24%] [transform-style:preserve-3d]"
      style={{ left: leftSide ? "4%" : "72%", transform: leftSide ? "scaleX(-1)" : undefined }}
    >
      <div className="absolute inset-x-[10%] bottom-0 top-[18%] rounded-[0.9rem] border-[3px] border-white/90 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.22)_0_1px,transparent_1px_7px),repeating-linear-gradient(0deg,rgba(255,255,255,.18)_0_1px,transparent_1px_7px)] shadow-[0_18px_45px_rgba(0,0,0,.48)]" />
      <div className="absolute bottom-[14%] left-[4%] top-[14%] w-[5px] rounded-full bg-gradient-to-b from-white via-white to-slate-300 shadow-[0_0_15px_rgba(255,255,255,.7)]" />
      <div className="absolute bottom-[9%] right-[6%] top-[19%] w-[5px] rounded-full bg-gradient-to-b from-white via-white to-slate-300 shadow-[0_0_15px_rgba(255,255,255,.7)]" />
      <div className="absolute left-[3%] right-[6%] top-[11%] h-[5px] rounded-full bg-white shadow-[0_0_15px_rgba(255,255,255,.75)]" />
      <div className="absolute bottom-[6%] left-[10%] right-[10%] h-[3px] rounded-full bg-white/30 blur-[1px]" />
      <motion.div className="absolute inset-x-[18%] top-[32%] h-16 rounded-full" style={{ boxShadow: `inset 0 0 18px ${accent}22` }} animate={{ opacity: [0.3, 0.8, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }} />
    </div>
  );
}

function CornerFlag({ attackSide }: { attackSide: "home" | "away" }) {
  const left = attackSide === "home" ? "5%" : "90%";
  return (
    <motion.div
      className="absolute bottom-[72%] z-25"
      style={{ left, transform: attackSide === "away" ? "scaleX(-1)" : undefined }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="h-16 w-px bg-gradient-to-b from-white to-white/25 shadow-[0_0_8px_rgba(255,255,255,.4)]" />
      <motion.div className="absolute left-0 top-0 h-7 w-11 origin-left bg-gradient-to-r from-amber-300 via-yellow-400 to-orange-500 [clip-path:polygon(0_0,100%_15%,65%_55%,100%_100%,0_85%)] shadow-[0_0_18px_rgba(255,193,68,.35)]" animate={{ rotate: [0, 2, -1, 0] }} transition={{ duration: 1.7, repeat: Infinity }} />
    </motion.div>
  );
}

function PitchLines({ attackSide }: { attackSide: "home" | "away" }) {
  return (
    <div className="absolute inset-[6%] overflow-hidden rounded-[1.9rem] border border-white/25 bg-[#0f6a39] shadow-[inset_0_0_90px_rgba(0,0,0,.35),0_35px_80px_rgba(0,0,0,.45)]">
      <div className="absolute inset-0 opacity-90" style={{ backgroundImage: "repeating-linear-gradient(90deg,rgba(255,255,255,.018) 0 6%,rgba(0,0,0,.025) 6% 12%)" }} />
      <div className="absolute inset-0 opacity-60 [background:radial-gradient(circle_at_50%_45%,rgba(120,255,190,.12),transparent_32%),linear-gradient(180deg,rgba(255,255,255,.07),transparent_28%,rgba(0,0,0,.08))]" />
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/45" />
      <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/45" />
      <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/75" />
      <div className={`absolute top-[16%] h-[68%] w-[21%] rounded-[1rem] border-2 border-white/45 ${attackSide === "home" ? "right-0" : "left-0"}`} />
      <div className={`absolute top-[28%] h-[44%] w-[10%] rounded-[0.8rem] border-2 border-white/38 ${attackSide === "home" ? "right-0" : "left-0"}`} />
      <div className={`absolute top-[46%] h-3 w-3 -translate-y-1/2 rounded-full bg-white/70 ${attackSide === "home" ? "right-[20%]" : "left-[20%]"}`} />
      <div className={`absolute top-[42%] h-20 w-20 rounded-full border border-white/20 ${attackSide === "home" ? "right-[10%]" : "left-[10%]"}`} />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/12 to-transparent" />
    </div>
  );
}

function PathLine({ d, color = "#57e6ff", dashed = true }: { d: string; color?: string; dashed?: boolean }) {
  return (
    <svg className="pointer-events-none absolute inset-0 z-25 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <defs>
        <filter id="line-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="0.7" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <motion.path d={d} fill="none" stroke={color} strokeWidth="0.9" strokeLinecap="round" strokeDasharray={dashed ? "2.2 2" : undefined} filter="url(#line-glow)" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.9, ease: "easeOut" }} />
    </svg>
  );
}

function EventScene({ event }: { event: LiveEventOverlayData }) {
  const attackSide = event.teamSide || "home";
  const away = attackSide === "away";
  const tone = toneFor(event.type);
  const accent = event.type.includes("goal") ? "#6df7bf" : event.type === "woodwork" ? "#ff7aa0" : event.type.includes("save") ? "#7bbaff" : event.type.includes("free") ? "#8fd6ff" : event.type.includes("penalty") ? "#ff9be5" : "#64e7ff";
  const isGoal = ["goal", "penalty_goal", "free_kick_goal", "own_goal"].includes(event.type);
  const isFree = ["dangerous_free_kick", "free_kick_goal"].includes(event.type);
  const isPenalty = ["penalty_intro", "penalty_goal", "penalty_missed"].includes(event.type);
  const isSave = ["save", "danger_save"].includes(event.type);
  const isWoodwork = event.type === "woodwork";
  const isCorner = event.emoji === "🚩" || /córner/i.test(event.title) || /córner/i.test(event.kicker || "");
  const isChance = ["big_chance", "danger_chance", "goal_prelude", "counter"].includes(event.type);

  const x = (value: number) => MirrorX(value, attackSide);
  const activeImage = faceUrl(event.playerId, event.playerImage);

  return (
    <div className="relative mx-auto mt-4 w-full overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#061018] shadow-[0_28px_90px_rgba(0,0,0,.5)]">
      <div className="absolute inset-0 bg-[url('/replay/stadium-crowd.webp')] bg-cover bg-[center_top] opacity-45" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_42%_28%,rgba(90,220,255,.12),transparent_24%),linear-gradient(180deg,rgba(5,12,20,.1),rgba(5,10,15,.48))]" />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/40 to-transparent" />

      <div className="relative min-h-[360px] sm:min-h-[390px] md:min-h-[430px]">
        <div className="absolute inset-x-0 bottom-0 top-[23%] [perspective:1200px]">
          <div className="absolute inset-[2%_3%_5%] [transform-style:preserve-3d]" style={{ transform: "rotateX(21deg) rotateZ(-0.6deg) translateY(2%)" }}>
            <PitchLines attackSide={attackSide} />
            <div className="absolute inset-[6%] overflow-hidden rounded-[1.7rem]">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={`stripe-${i}`} className="absolute inset-y-0 opacity-10" style={{ left: `${i * 14.2857}%`, width: "14.2857%", background: i % 2 === 0 ? "#d7ffea" : "#001b10" }} />
              ))}
            </div>

            {isCorner && <CornerFlag attackSide={attackSide} />}
            <Goal3D leftSide={away} accent={accent} />

            {isCorner && (
              <>
                <Player3D x={x(72)} y={42} side={attackSide} active={Boolean(event.playerName)} name={event.playerName} image={activeImage} delay={0.05} />
                <Player3D x={x(79)} y={50} side={attackSide} delay={0.12} number="9" />
                <Player3D x={x(74)} y={60} side={attackSide} delay={0.18} number="8" />
                <Player3D x={x(83)} y={63} side={attackSide === "home" ? "away" : "home"} delay={0.22} number="4" />
                <Player3D x={x(70)} y={68} side={attackSide === "home" ? "away" : "home"} delay={0.28} number="5" />
                <Player3D x={x(60)} y={54} side={attackSide === "home" ? "away" : "home"} delay={0.34} number="3" />
                <PathLine d={`M ${x(12)} 76 C ${x(30)} 67, ${x(57)} 51, ${x(75)} 43`} color="#ffcf60" />
                <Ball3D x={x(12)} y={76} animateTo={{ x: x(75), y: 43 }} />
                <div className={`absolute bottom-[18%] ${away ? "right-[14%]" : "left-[14%]"} z-20 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[8px] font-black uppercase tracking-[.14em] text-amber-100 backdrop-blur-sm`}>Centro al área</div>
              </>
            )}

            {isFree && !isPenalty && (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <motion.div key={`wall-${i}`} className="absolute z-20" style={{ left: `${x(67 + i * 3)}%`, top: "35%" }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: [0, -1, 0] }} transition={{ delay: i * 0.05, duration: 1.4, repeat: Infinity }}>
                    <div className="relative h-12 w-7 rounded-[45%] bg-gradient-to-b from-slate-300 via-slate-700 to-slate-950 shadow-lg">
                      <div className="absolute -top-4 left-1/2 h-6 w-6 -translate-x-1/2 rounded-full border-2 border-white/80 bg-gradient-to-br from-amber-100 to-orange-200" />
                    </div>
                  </motion.div>
                ))}
                <div className="absolute left-1/2 top-[52%] z-25 -translate-x-1/2 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[8px] font-black uppercase tracking-[.2em] text-white/45 backdrop-blur-sm">BARRERA</div>
                <PathLine d={`M ${x(30)} 68 C ${x(42)} 24, ${x(59)} 18, ${x(78)} 36`} color={accent} />
                <Ball3D x={x(30)} y={68} animateTo={{ x: x(78), y: 36 }} />
                <Player3D x={x(31)} y={69} side={attackSide} active name={event.playerName} image={activeImage} delay={0.04} number="10" />
              </>
            )}

            {isPenalty && (
              <>
                <div className="absolute left-1/2 top-[58%] z-20 h-3 w-3 -translate-x-1/2 rounded-full bg-white shadow-[0_0_15px_rgba(255,255,255,.5)]" />
                <div className="absolute inset-y-[18%] right-[9%] z-15 w-[24%] rounded-[1rem] border border-white/10 bg-white/[0.025]" />
                <PathLine d={`M ${x(40)} 56 C ${x(52)} 53, ${x(66)} 45, ${x(81)} 35`} color="#ff9fe7" />
                <Ball3D x={x(40)} y={56} animateTo={{ x: x(81), y: 35 }} />
                <Player3D x={x(40)} y={60} side={attackSide} active name={event.playerName} image={activeImage} delay={0.04} number="9" />
                <div className="absolute right-[15%] top-[38%] z-20">
                  <motion.div className="h-12 w-9 rounded-[48%] border border-emerald-200/40 bg-gradient-to-b from-emerald-200 via-emerald-700 to-slate-950 shadow-[0_12px_22px_rgba(0,0,0,.4)]" animate={{ x: [0, -4, 3, 0], rotate: [0, -5, 4, 0] }} transition={{ duration: 1.05, repeat: Infinity }} />
                </div>
                <div className="absolute right-[10%] top-[23%] z-20 grid grid-cols-2 gap-1.5 rounded-xl border border-fuchsia-300/15 bg-black/30 p-1.5 backdrop-blur-sm">
                  {["↖", "↗", "●", "↙", "↘"].map((symbol, i) => (
                    <div key={symbol} className={`grid h-8 w-8 place-items-center rounded-lg border text-[10px] font-black ${i === 2 ? "border-fuchsia-300/50 bg-fuchsia-300/12 text-fuchsia-100" : "border-white/10 bg-white/5 text-white/55"} ${i === 2 ? "col-span-2 justify-self-center" : ""}`}>{symbol}</div>
                  ))}
                </div>
              </>
            )}

            {isGoal && (
              <>
                <Player3D x={x(42)} y={61} side={attackSide} active name={event.playerName} image={activeImage} delay={0.05} number="9" />
                <Player3D x={x(54)} y={48} side={attackSide} delay={0.14} number="5" />
                <Player3D x={x(65)} y={58} side={attackSide === "home" ? "away" : "home"} delay={0.21} number="4" />
                <Player3D x={x(70)} y={43} side={attackSide === "home" ? "away" : "home"} delay={0.27} number="6" />
                <PathLine d={`M ${x(39)} 60 C ${x(53)} 53, ${x(66)} 42, ${x(80)} 35`} color="#72f4c4" />
                <Ball3D x={x(39)} y={60} animateTo={{ x: x(80), y: 35 }} />
                <motion.div className="absolute right-[10%] top-[27%] z-30 h-20 w-20 rounded-full bg-emerald-300/20 blur-2xl" animate={{ scale: [0.8, 1.25, 0.8], opacity: [0.2, 0.75, 0.2] }} transition={{ duration: 0.9, repeat: Infinity }} />
                <motion.div className="absolute right-[12%] top-[32%] z-30 text-4xl" animate={{ scale: [1, 1.18, 1], rotate: [0, 5, -5, 0] }} transition={{ duration: 0.85, repeat: Infinity }}>⚽</motion.div>
                <div className="absolute right-[7%] top-[25%] z-20 rounded-full border border-emerald-200/30 bg-emerald-300/10 px-3 py-1 text-[8px] font-black uppercase tracking-[.18em] text-emerald-100 backdrop-blur-sm">¡Dentro!</div>
              </>
            )}

            {isWoodwork && (
              <>
                <Player3D x={x(44)} y={61} side={attackSide} active name={event.playerName} image={activeImage} delay={0.05} number="11" />
                <PathLine d={`M ${x(43)} 60 C ${x(54)} 52, ${x(67)} 42, ${x(82)} 31`} color="#ff7a9f" />
                <Ball3D x={x(43)} y={60} animateTo={{ x: x(82), y: 30 }} />
                <motion.div className="absolute right-[8%] top-[28%] z-30" animate={{ rotate: [0, -7, 7, 0], scale: [0.95, 1.12, 0.95] }} transition={{ duration: 0.65, repeat: Infinity }}>
                  <span className="block text-4xl drop-shadow-[0_0_16px_rgba(255,120,160,.7)]">💥</span>
                </motion.div>
                <div className="absolute right-[10%] top-[20%] z-20 rounded-full border border-rose-300/25 bg-rose-300/10 px-3 py-1 text-[8px] font-black uppercase tracking-[.18em] text-rose-100 backdrop-blur-sm">¡A LA MADERA!</div>
              </>
            )}

            {isSave && !isPenalty && (
              <>
                <Player3D x={x(44)} y={61} side={attackSide} active name={event.playerName} image={activeImage} delay={0.05} number="10" />
                <PathLine d={`M ${x(44)} 60 C ${x(58)} 51, ${x(70)} 42, ${x(81)} 34`} color="#79c1ff" />
                <Ball3D x={x(44)} y={60} animateTo={{ x: x(81), y: 34 }} />
                <motion.div className="absolute right-[9%] top-[33%] z-30 h-16 w-14 rounded-[45%] border border-sky-100/50 bg-gradient-to-br from-emerald-200 via-emerald-700 to-slate-950 shadow-[0_12px_35px_rgba(0,0,0,.45)]" animate={{ x: [0, -10, 4, 0], y: [0, -8, 4, 0], rotate: [0, -18, 8, 0] }} transition={{ duration: 1.0, repeat: Infinity }} />
                <motion.div className="absolute right-[10%] top-[28%] z-20 rounded-full border border-sky-300/25 bg-sky-300/10 px-3 py-1 text-[8px] font-black uppercase tracking-[.18em] text-sky-100 backdrop-blur-sm" animate={{ opacity: [0.35, 1, 0.35] }} transition={{ duration: 1.0, repeat: Infinity }}>¡PARADÓN!</motion.div>
              </>
            )}

            {isChance && !isCorner && !isFree && !isPenalty && !isGoal && !isWoodwork && !isSave && (
              <>
                <Player3D x={x(31)} y={65} side={attackSide} active name={event.playerName} image={activeImage} delay={0.05} number="10" />
                <Player3D x={x(43)} y={53} side={attackSide} delay={0.12} number="8" />
                <Player3D x={x(58)} y={47} side={attackSide === "home" ? "away" : "home"} delay={0.19} number="4" />
                <Player3D x={x(66)} y={60} side={attackSide === "home" ? "away" : "home"} delay={0.26} number="3" />
                <PathLine d={`M ${x(29)} 64 C ${x(41)} 57, ${x(53)} 48, ${x(64)} 57`} color="#63e6ff" />
                <PathLine d={`M ${x(43)} 52 C ${x(51)} 42, ${x(61)} 37, ${x(77)} 33`} color="#6df7bf" />
                <Ball3D x={x(29)} y={64} animateTo={{ x: x(66), y: 57 }} />
                <motion.div className="absolute right-[12%] top-[24%] z-20 rounded-full border border-cyan-200/25 bg-cyan-300/10 px-3 py-1 text-[8px] font-black uppercase tracking-[.18em] text-cyan-100 backdrop-blur-sm" animate={{ boxShadow: ["0 0 0 rgba(90,230,255,0)", "0 0 18px rgba(90,230,255,.25)", "0 0 0 rgba(90,230,255,0)"] }} transition={{ duration: 1.4, repeat: Infinity }}>Peligro</motion.div>
              </>
            )}
          </div>
        </div>

        <div className="absolute left-4 top-4 z-40 flex items-center gap-3 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[9px] font-black uppercase tracking-[.18em] text-white/65 backdrop-blur-xl">
          <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,255,203,.7)]" />
          REPETICIÓN 3D
          <span className="text-white/25">·</span>
          {event.minute}'
        </div>
        <div className="absolute right-4 top-4 z-40 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[9px] font-black uppercase tracking-[.16em] text-white/55 backdrop-blur-xl">
          {isCorner ? "CÓRNER" : isFree ? "BALÓN PARADO" : isPenalty ? "PENALTI" : isGoal ? "GOL" : isWoodwork ? "MADERA" : isSave ? "PARADA" : "ATAQUE"}
        </div>
      </div>

      <div className="relative z-40 border-t border-white/10 bg-[linear-gradient(180deg,rgba(5,10,17,.74),rgba(5,9,15,.96))] px-4 py-3 md:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 ${tone.soft} text-xl shadow-inner`}>{typeIcon[event.type] || event.emoji || "⚡"}</div>
            <div className="min-w-0">
              <div className="truncate text-[0.55rem] font-black uppercase tracking-[.18em] text-white/35">{event.teamName}</div>
              <div className="truncate text-[0.76rem] font-black uppercase tracking-tight text-white/90">{event.title}</div>
            </div>
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[9px] font-black uppercase tracking-[.14em] text-white/40">{event.playerName || "Jugada colectiva"}</div>
        </div>
      </div>
    </div>
  );
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
  const hasChoices = Boolean(event?.choices?.length);
  const tone = toneFor(event?.type || "");
  const ToneIcon = tone.icon;
  const eventIcon = event ? typeIcon[event.type] || event.emoji || "⚡" : "⚡";

  return (
    <AnimatePresence>
      {event && (
        <motion.div
          key={event.id}
          className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden p-2 touch-pan-y sm:p-3 md:p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(80,190,255,.08),transparent_30%),linear-gradient(rgba(2,5,9,.78),rgba(2,5,9,.93))] backdrop-blur-md" />

          <motion.div
            className="relative w-full max-w-5xl overflow-y-auto overscroll-contain rounded-[1.65rem] border border-white/10 bg-[#0a0f17]/98 shadow-[0_35px_120px_rgba(0,0,0,.62),inset_0_1px_0_rgba(255,255,255,.07)] [scrollbar-width:thin]"
            style={{ maxHeight: "calc(100dvh - 1rem)", WebkitOverflowScrolling: "touch" }}
            initial={{ opacity: 0, y: 20, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.99 }}
            transition={{ type: "spring", stiffness: 180, damping: 23 }}
          >
            <div className={`sticky top-0 z-50 h-1 bg-gradient-to-r ${tone.bar}`} />

            <div className="relative overflow-hidden border-b border-white/8 px-4 pb-4 pt-4 md:px-7 md:pt-5">
              <div className={`pointer-events-none absolute -right-36 -top-36 h-80 w-80 rounded-full ${tone.soft} blur-3xl`} />
              <div className="relative flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[0.61rem] font-black uppercase tracking-[.2em] text-white/45">
                    <Clock3 className="h-3.5 w-3.5" />
                    {event.minute}'
                    <span>·</span>
                    <span className="truncate">{event.teamName}</span>
                  </div>
                  <div className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.55rem] font-black uppercase tracking-[.16em] ${tone.badge}`}>
                    <ToneIcon className="h-3.5 w-3.5" />
                    {event.kicker || "Jugada en directo"}
                    {hasChoices && <span className="opacity-65">· Decide tú</span>}
                  </div>
                </div>
                <div className={`shrink-0 rounded-xl border border-white/8 ${tone.soft} px-3 py-2 text-2xl shadow-inner`}>{eventIcon}</div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[5.5rem_minmax(0,1fr)] md:items-center">
                <div className="flex justify-start md:justify-center">
                  {event.playerName ? (
                    <PlayerFace name={event.playerName} image={faceUrl(event.playerId, event.playerImage)} size={76} showRing className="shadow-2xl" />
                  ) : (
                    <div className={`grid h-[76px] w-[76px] place-items-center rounded-full border border-white/10 ${tone.soft}`}>
                      <ToneIcon className={`h-9 w-9 ${tone.text}`} />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  {event.playerName && (
                    <div className="mb-1 flex flex-wrap items-center gap-x-2 text-[0.58rem] font-black uppercase tracking-[.15em] text-white/40">
                      <span>Protagonista</span><span>·</span><span className="text-white/70">{event.playerName}</span>
                    </div>
                  )}
                  <h2 className="text-2xl font-black uppercase leading-none tracking-[-0.045em] text-white sm:text-3xl md:text-4xl">{event.title}</h2>
                  <p className="mt-2 max-w-3xl text-[0.8rem] font-medium leading-5 text-white/64 md:text-sm">{event.body}</p>
                </div>
              </div>

              {event.teamLeagueName && (
                <div className="mt-3 flex items-center gap-2 text-[0.55rem] font-black uppercase tracking-[.15em] text-white/35">
                  <TeamLogo teamName={event.teamName} leagueName={event.teamLeagueName} size={22} />
                  {event.teamName}
                </div>
              )}
            </div>

            <div className="px-3 pb-4 sm:px-4 md:px-6 md:pb-6">
              <EventScene event={event} />

              {event.detail && !hasChoices && (
                <div className="mx-auto mt-3 max-w-4xl rounded-xl border border-white/8 bg-white/[0.025] px-3.5 py-2.5 text-center text-[0.65rem] font-semibold leading-5 text-white/46">{event.detail}</div>
              )}

              {hasChoices && (
                <div className="mx-auto mt-4 max-w-4xl">
                  <div className="mb-2 text-[0.6rem] font-black uppercase tracking-[.18em] text-white/40">{event.actionPrompt || "¿Qué quieres hacer?"}</div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {event.choices!.map((choice) => (
                      <motion.button key={choice.id} type="button" whileHover={{ y: -1 }} whileTap={{ scale: 0.985 }} onClick={() => onChooseDanger?.(choice.id)} className={`rounded-2xl border p-3 text-left transition ${choiceClass(choice.tone)}`}>
                        <div className="text-xs font-black text-white">{choice.label}</div>
                        <div className="mt-1 text-[0.64rem] leading-relaxed text-white/45">{choice.description}</div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              {event.type === "injury_substitution" && (
                <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  <div className="rounded-2xl border border-rose-400/20 bg-rose-500/8 p-3.5">
                    <div className="text-[0.55rem] font-black uppercase tracking-[.17em] text-rose-200">Sale · lesionado</div>
                    <div className="mt-2 text-sm font-black text-white">{event.playerName}</div>
                  </div>
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/8 p-3.5">
                    <div className="text-[0.55rem] font-black uppercase tracking-[.17em] text-emerald-200">Cambio forzado</div>
                    <div className="mt-2 text-sm font-black text-white">{event.detail || "El entrenador debe realizar el cambio."}</div>
                  </div>
                </div>
              )}

              {!hasChoices && onContinue && (
                <div className="mt-5 flex justify-center pb-2">
                  <motion.button
                    type="button"
                    onClick={onContinue}
                    whileHover={{ scale: 1.015, y: -1 }}
                    whileTap={{ scale: 0.985 }}
                    className="group inline-flex min-w-48 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-5 py-3 text-[0.68rem] font-black uppercase tracking-[.14em] text-white shadow-lg transition hover:bg-white/[0.09]"
                  >
                    <span>{event.type === "penalty_intro" ? "Ir al lanzamiento" : "Continuar partido"}</span>
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
