import React from "react";
import { motion } from "framer-motion";
import { TeamLogo } from "@/components/TeamLogo";
import { MapPin } from "lucide-react";
import { overall, LEAGUES } from "@/data/teams";

export default function ClubCardPremium({
  team,
  onPreview,
  onHover,
  onLeave,
  disabled,
}: {
  team: any;
  onPreview: (id: string) => void;
  onHover?: () => void;
  onLeave?: () => void;
  disabled?: boolean;
}) {
  const ov = overall(team);
  const level = Math.min(100, Math.max(30, ov));
  const attPct = Math.round((team.att / 100) * 100);
  const midPct = Math.round((team.mid / 100) * 100);
  const defPct = Math.round((team.def / 100) * 100);

  return (
    <motion.button
      layout
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.99 }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      disabled={disabled}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={() => onPreview(team.id)}
      className="team-card-aaa text-left disabled:opacity-50 overflow-hidden group relative"
    >
      <div className="team-card-bg" />

      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-700 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />

      <div className="relative z-10 p-4 h-full flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="team-logo-wrapper">
                {/** Map league id -> display name so logos load from /public/logos correctly */}
                <TeamLogo teamName={team.name} leagueName={LEAGUES[team.league]?.name ?? team.league} size={72} />
              </div>

              <div>
                <div className="text-2xl font-black leading-none mb-1">{team.name}</div>
                <div className="text-sm text-white/50 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  {team.city}
                </div>
              </div>
            </div>

            <div className="overall-badge">{ov}</div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            {[{ label: "ATA", value: team.att, pct: attPct }, { label: "MED", value: team.mid, pct: midPct }, { label: "DEF", value: team.def, pct: defPct }].map((s, i) => (
              <div key={s.label} className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl p-3">
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/40 mb-2">{s.label}</div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-2xl font-black text-white">{s.value}</div>
                  <div className="text-xs text-white/50">{s.pct}%</div>
                </div>

                <div className="w-full h-2 rounded-full bg-white/[0.03] overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${s.pct}%` }} transition={{ duration: 0.8, delay: i * 0.06 }} className="h-2 bg-gradient-to-r from-primary to-accent" />
                </div>
              </div>
            ))}
          </div>

          <div className="mb-4">
            <div className="text-xs text-white/40 mb-2">Nivel del club</div>
            <div className="w-full h-3 rounded-full bg-white/[0.03] overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${level}%` }} transition={{ duration: 1 }} className="h-3 bg-gradient-to-r from-accent to-primary" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Identidad</span>
              <span className="font-semibold text-primary">Gigante Europeo</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Dificultad</span>
              <span className="font-semibold">Media</span>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-white/10 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-white/40 mb-1">Jugador estrella</div>
            <div className="font-bold">{team.topPlayer || "—"}</div>
          </div>

          <div className="text-2xl font-black text-primary">{team.topRating || "—"}</div>
        </div>
      </div>
    </motion.button>
  );
}
