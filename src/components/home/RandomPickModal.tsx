import React, { useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getAllTeams, overall, LEAGUES } from "@/data/teams";
import { TeamLogo } from "@/components/TeamLogo";
import { LeagueLogo } from "@/components/LeagueLogo";
import { Dice5, Sparkles, Crown, Flame, Skull, Ghost, ArrowLeft } from "lucide-react";

type Difficulty = "easy" | "medium" | "hard" | "ultimate" | "legend";

const DIFFICULTIES: {
  id: Difficulty;
  title: string;
  subtitle: string;
  range: string;
  icon: React.ReactNode;
  color: string;
  gradient: string;
}[] = [
  {
    id: "easy",
    title: "Fácil",
    subtitle: "Equipo top mundial",
    range: "OVR ≥ 85",
    icon: <Crown className="h-5 w-5" />,
    color: "text-emerald-300",
    gradient: "from-emerald-500/20 to-emerald-700/10 border-emerald-500/40",
  },
  {
    id: "medium",
    title: "Media",
    subtitle: "Equipo de media tabla",
    range: "OVR 78–84",
    icon: <Sparkles className="h-5 w-5" />,
    color: "text-sky-300",
    gradient: "from-sky-500/20 to-sky-700/10 border-sky-500/40",
  },
  {
    id: "hard",
    title: "Difícil",
    subtitle: "Equipo pequeño de primera",
    range: "OVR 70–77",
    icon: <Flame className="h-5 w-5" />,
    color: "text-orange-300",
    gradient: "from-orange-500/20 to-orange-700/10 border-orange-500/40",
  },
  {
    id: "ultimate",
    title: "Desafío definitivo",
    subtitle: "Equipo de segunda/tercera",
    range: "OVR < 70",
    icon: <Skull className="h-5 w-5" />,
    color: "text-red-300",
    gradient: "from-red-500/20 to-red-700/10 border-red-500/40",
  },
  {
    id: "legend",
    title: "Leyenda",
    subtitle: "Histórico caído en categorías bajas",
    range: "Histórico · OVR < 72",
    icon: <Ghost className="h-5 w-5" />,
    color: "text-fuchsia-300",
    gradient: "from-fuchsia-500/20 to-fuchsia-700/10 border-fuchsia-500/40",
  },
];

const LEGEND_NAMES = new Set([
  "hamburger sv",
  "hsv",
  "schalke 04",
  "fc schalke 04",
  "sampdoria",
  "uc sampdoria",
  "parma",
  "calcio padova",
  "saint-etienne",
  "as saint-étienne",
  "fc nantes",
  "deportivo",
  "rc deportivo",
  "real zaragoza",
  "real oviedo",
  "r. oviedo",
  "real valladolid",
  "r. valladolid",
  "valencia cf",
  "sevilla fc",
  "leeds united",
  "sheffield wednesday",
  "nottingham forest",
  "nott'm forest",
  "sunderland",
  "burnley",
  "anderlecht",
  "feyenoord",
]);

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function poolForDifficulty(d: Difficulty) {
  const all = getAllTeams();
  switch (d) {
    case "easy":
      return all.filter((t) => overall(t) >= 85);
    case "medium":
      return all.filter((t) => overall(t) >= 78 && overall(t) <= 84);
    case "hard":
      return all.filter((t) => overall(t) >= 70 && overall(t) <= 77);
    case "ultimate":
      return all.filter((t) => overall(t) < 70);
    case "legend": {
      return all.filter((t) => {
        const n = norm(t.name);
        return LEGEND_NAMES.has(n) || Array.from(LEGEND_NAMES).some((k) => n.includes(k));
      });
    }
  }
}

function pickThree<T>(arr: T[]): T[] {
  if (arr.length <= 3) return arr.slice();
  const out: T[] = [];
  const used = new Set<number>();
  while (out.length < 3) {
    const i = Math.floor(Math.random() * arr.length);
    if (used.has(i)) continue;
    used.add(i);
    out.push(arr[i]);
  }
  return out;
}

export default function RandomPickModal({
  open,
  onOpenChange,
  onPickTeam,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPickTeam: (id: string) => void;
}) {
  const [diff, setDiff] = useState<Difficulty | null>(null);
  const pool = useMemo(() => (diff ? poolForDifficulty(diff) : []), [diff]);
  const [rollSeed, setRollSeed] = useState(0);
  const candidates = useMemo(() => pickThree(pool), [pool, rollSeed]);
  const [showCandidates, setShowCandidates] = useState(false);

  function close() {
    onOpenChange(false);
    setTimeout(() => {
      setDiff(null);
      setShowCandidates(false);
    }, 300);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) close();
        else onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden border-white/10 bg-gradient-to-br from-slate-950 via-black to-slate-950">
        <div className="p-6 md:p-8">
          <div className="flex items-center gap-3 mb-1">
            <Dice5 className="h-6 w-6 text-amber-400" />
            <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber-300">
              Elección aleatoria
            </div>
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-white">
            {showCandidates ? "Tus 3 candidatos" : "Escoge un nivel de dificultad"}
          </h2>
          <p className="text-sm text-white/55 mt-1">
            {showCandidates
              ? "Elige uno para previsualizar el club, o tira de nuevo el dado."
              : "Cuanto mayor sea la dificultad, más pequeño será tu club."}
          </p>

          {!showCandidates ? (
            <div key="diffs" className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in">
              {DIFFICULTIES.map((d) => {
                const count = poolForDifficulty(d.id).length;
                return (
                  <button
                    key={d.id}
                    disabled={count === 0}
                    onClick={() => {
                      setDiff(d.id);
                      setRollSeed((x) => x + 1);
                      setShowCandidates(true);
                    }}
                    className={`text-left p-4 rounded-xl border bg-gradient-to-br ${d.gradient} hover:brightness-125 transition disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className={d.color}>{d.icon}</span>
                      <span className="text-lg font-black text-white">{d.title}</span>
                    </div>
                    <div className="text-xs text-white/70">{d.subtitle}</div>
                    <div className="mt-2 flex items-center justify-between text-[11px]">
                      <span className={`font-mono ${d.color}`}>{d.range}</span>
                      <span className="text-white/50">{count} equipos</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div key="picks" className="mt-6 animate-fade-in">
              {candidates.length === 0 ? (
                <div className="rounded-xl p-6 border border-white/10 bg-white/[0.03] text-center text-white/70">
                  No hay equipos para esta dificultad.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {candidates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        onOpenChange(false);
                        setTimeout(() => onPickTeam(t.id), 80);
                      }}
                      className="p-4 rounded-xl border border-white/10 bg-white/[0.04] hover:border-primary/50 text-left transition hover:scale-105 active:scale-95"
                      style={{
                        background: `linear-gradient(135deg, ${t.color}22, transparent 60%)`,
                        borderColor: `${t.color}55`,
                      }}
                    >
                      <div className="w-16 h-16 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center mb-3 p-2">
                        <TeamLogo
                          teamName={t.name}
                          leagueName={LEAGUES[t.league]?.name ?? t.league}
                          size={56}
                        />
                      </div>
                      <div className="text-sm font-black text-white truncate">{t.name}</div>
                      <div className="text-[11px] text-white/55 mb-2 truncate">{t.city}</div>
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5 text-white/70">
                          <LeagueLogo league={LEAGUES[t.league]?.name ?? t.league} size="sm" />
                          <span className="truncate max-w-[120px]">
                            {LEAGUES[t.league]?.name ?? t.league}
                          </span>
                        </div>
                        <span className="font-black text-base" style={{ color: t.color || "#fff" }}>
                          {overall(t)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-6 flex items-center justify-between gap-2 flex-wrap">
                <button
                  onClick={() => setShowCandidates(false)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border border-white/15 text-white/75 hover:bg-white/10 transition"
                >
                  <ArrowLeft className="h-4 w-4" /> Cambiar dificultad
                </button>
                <button
                  onClick={() => setRollSeed((x) => x + 1)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-black text-white bg-gradient-to-r from-amber-500 to-orange-600 shadow-lg shadow-orange-500/30 hover:brightness-110 transition"
                >
                  <Dice5 className="h-4 w-4" /> Tirar de nuevo
                </button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
