import React from "react";
import { motion } from "framer-motion";
import { TeamLogo } from "@/components/TeamLogo";
import { MapPin } from "lucide-react";
import { overall, LEAGUES } from "@/data/teams";
import { getTeamCategory, getTeamDifficulty } from "@/lib/utils";

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
  const category = getTeamCategory(team);
  const difficulty = getTeamDifficulty(ov);
  
  // Usar color del equipo para fondo personalizado
  const teamColor = team.color || "#1a1a2e";
  const bgStyle = {
    background: `linear-gradient(135deg, ${teamColor}20 0%, ${teamColor}10 50%, transparent 100%)`
  };

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
      style={bgStyle}
    >
      <div className="team-card-bg" />

      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-700 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />

      <div className="relative z-10 p-3.5 h-full flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="team-logo-wrapper">
                <TeamLogo teamName={team.name} leagueName={LEAGUES[team.league]?.name ?? team.league} size={56} />
              </div>

              <div>
                <div className="text-xl font-black leading-tight mb-0.5">{team.name}</div>
                <div className="text-xs text-white/50 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {team.city}
                </div>
              </div>
            </div>

            <div className="overall-badge text-lg">{ov}</div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            {[{ label: "ATA", value: team.att, pct: attPct }, { label: "MED", value: team.mid, pct: midPct }, { label: "DEF", value: team.def, pct: defPct }].map((s, i) => (
              <div key={s.label} className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-xl p-2.5">
                <div className="text-[9px] uppercase tracking-[0.2em] text-white/40 mb-1.5">{s.label}</div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-lg font-black text-white">{s.value}</div>
                  <div className="text-xs text-white/50">{s.pct}%</div>
                </div>

                <div className="w-full h-1.5 rounded-full bg-white/[0.03] overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${s.pct}%` }} transition={{ duration: 0.8, delay: i * 0.06 }} className="h-1.5 bg-gradient-to-r from-primary to-accent" />
                </div>
              </div>
            ))}
          </div>

          <div className="mb-3">
            <div className="text-xs text-white/40 mb-1.5">Nivel del club</div>
            <div className="w-full h-2.5 rounded-full bg-white/[0.03] overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${level}%` }} transition={{ duration: 1 }} className="h-2.5 bg-gradient-to-r from-accent to-primary" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/50">Clasificación</span>
              <span className={`font-semibold px-2 py-0.5 rounded-full text-[0.7rem] ${
                category === 'Gigante' 
                  ? 'bg-yellow-500/20 text-yellow-300' 
                  : category === 'Aspirante' 
                  ? 'bg-blue-500/20 text-blue-300' 
                  : 'bg-gray-500/20 text-gray-300'
              }`}>{category}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-white/50">Dificultad</span>
              <span className={`font-semibold px-2 py-0.5 rounded-full text-[0.7rem] ${
                difficulty === 'Difícil' 
                  ? 'bg-red-500/20 text-red-300' 
                  : difficulty === 'Medio' 
                  ? 'bg-yellow-500/20 text-yellow-300' 
                  : 'bg-green-500/20 text-green-300'
              }`}>{difficulty}</span>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-white/10 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-white/40 mb-0.5">Estrella</div>
            <div className="font-bold text-sm">{team.topPlayer || "—"}</div>
          </div>

          <div className="text-xl font-black text-primary">{team.topRating || "—"}</div>
        </div>
      </div>
    </motion.button>
  );
}
