import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getAllTeams, overall, LEAGUES } from "@/data/teams";
import { TeamLogo } from "@/components/TeamLogo";
import { LeagueLogo } from "@/components/LeagueLogo";
import { motion } from "framer-motion";
import { getTeamCategory, getTeamDifficulty, getTeamObjectives, estimateTeamFinancials } from "@/lib/utils";

export default function ClubPreviewModal({
  teamId,
  open,
  onOpenChange,
  onStart,
}: {
  teamId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onStart: (id: string) => void;
}) {
  const team = teamId
    ? getAllTeams().find((t) => t.id === teamId) || null
    : null;

  if (!team) return null;

  const ov = overall(team);
  const category = getTeamCategory(team);
  const difficulty = getTeamDifficulty(ov);
  const objectives = getTeamObjectives(ov, category);
  const financials = estimateTeamFinancials(team);
  
  // Calcular salarios estimados (aproximadamente 30-40% del presupuesto anual)
  const estimatedSalaries = Math.round(financials.budget * 0.35);
  
  // Usar color del equipo para fondo personalizado
  const teamColor = team.color || "#1a1a2e";
  const leftBgStyle = {
    background: `linear-gradient(180deg, ${teamColor}30 0%, transparent 100%)`
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-full glass-dark p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.45, ease: "circOut" }}
        >
          <div className="relative flex flex-col lg:flex-row">
            {/* Panel Izquierdo */}
            <div className="lg:w-2/5 p-6 lg:p-8 border-b lg:border-b-0 lg:border-r border-white/10" style={leftBgStyle}>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-24 h-24 lg:w-32 lg:h-32 rounded-full bg-white/5 flex items-center justify-center p-2 flex-shrink-0">
                  <TeamLogo teamName={team.name} leagueName={LEAGUES[team.league]?.name ?? team.league} size={88} />
                </div>

                <div>
                  <div className="text-2xl lg:text-3xl font-black leading-tight">{team.name}</div>
                  <div className="text-xs lg:text-sm text-white/60 mt-1">{team.city}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <LeagueLogo league={LEAGUES[team.league]?.name ?? team.league} size="sm" />
                    <div className="text-xs text-white/50">{LEAGUES[team.league]?.name ?? team.league}</div>
                  </div>
                </div>
              </div>

              {/* Estadísticas Principales */}
              <div className="space-y-4 mb-6 pb-6 border-b border-white/10">
                <div>
                  <div className="text-xs uppercase text-white/40 mb-1">Overall</div>
                  <div className="text-4xl font-black text-primary">{ov}</div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs uppercase text-white/40 mb-1">Ataque</div>
                    <div className="text-2xl font-black">{team.att}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-white/40 mb-1">Medio</div>
                    <div className="text-2xl font-black">{team.mid}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-white/40 mb-1">Defensa</div>
                    <div className="text-2xl font-black">{team.def}</div>
                  </div>
                </div>
              </div>

              {/* Información del Equipo */}
              <div className="space-y-3 mb-6 pb-6 border-b border-white/10">
                <div>
                  <div className="text-xs uppercase text-white/40 mb-1">Clasificación</div>
                  <div className={`inline-block px-3 py-1.5 rounded-full text-xs font-semibold ${
                    category === 'Gigante' 
                      ? 'bg-yellow-500/20 text-yellow-300' 
                      : category === 'Aspirante' 
                      ? 'bg-blue-500/20 text-blue-300' 
                      : 'bg-gray-500/20 text-gray-300'
                  }`}>{category}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-white/40 mb-1">Dificultad</div>
                  <div className={`inline-block px-3 py-1.5 rounded-full text-xs font-semibold ${
                    difficulty === 'Difícil' 
                      ? 'bg-red-500/20 text-red-300' 
                      : difficulty === 'Medio' 
                      ? 'bg-yellow-500/20 text-yellow-300' 
                      : 'bg-green-500/20 text-green-300'
                  }`}>{difficulty}</div>
                </div>
              </div>

              {/* Objetivos */}
              <div>
                <div className="text-xs uppercase text-white/40 mb-2">Objetivos de la temporada</div>
                <div className="space-y-2">
                  {objectives.map((o, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="rounded-lg p-2.5 bg-white/[0.04] border border-white/8 text-sm font-medium text-white/90"
                    >
                      {o}
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            {/* Panel Derecho */}
            <div className="lg:w-3/5 p-6 lg:p-8">
              {/* Datos Económicos */}
              <div className="mb-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white/80 mb-3">Datos Económicos</h3>
                <div className="grid grid-cols-2 gap-3">
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0 }}
                    className="rounded-lg p-4 bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20"
                  >
                    <div className="text-xs text-white/50 mb-1">Presupuesto Inicial</div>
                    <div className="text-2xl font-black text-primary">{financials.budget}M €</div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className="rounded-lg p-4 bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20"
                  >
                    <div className="text-xs text-white/50 mb-1">Valor de Plantilla</div>
                    <div className="text-2xl font-black text-accent">{financials.value}M €</div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="rounded-lg p-4 bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/20"
                  >
                    <div className="text-xs text-white/50 mb-1">Ingresos Anuales Est.</div>
                    <div className="text-2xl font-black text-green-300">{financials.income}M €</div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="rounded-lg p-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20"
                  >
                    <div className="text-xs text-white/50 mb-1">Salarios Anuales Est.</div>
                    <div className="text-2xl font-black text-blue-300">{estimatedSalaries}M €</div>
                  </motion.div>
                </div>
              </div>

              {/* Expectativas de Directiva */}
              <div className="mb-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white/80 mb-3">Expectativas de Directiva</h3>
                <div className="space-y-2.5">
                  {[
                    { label: "Éxito nacional", value: Math.min(100, ov + 10) },
                    { label: "Éxito continental", value: Math.max(0, ov - 5) },
                    { label: "Finanzas sanas", value: Math.min(100, 50 + (ov - 70)) },
                    { label: "Desarrollo juvenil", value: Math.min(100, 40 + (ov - 70)) },
                    { label: "Prestigio", value: Math.min(100, ov) },
                  ].map((e) => (
                    <motion.div 
                      key={e.label}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.5 }}
                    >
                      <div className="flex items-center justify-between text-xs text-white/60 mb-1">
                        <div>{e.label}</div>
                        <div className="font-bold">{e.value}%</div>
                      </div>

                      <div className="w-full h-2 rounded-full bg-white/[0.08] overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${e.value}%` }}
                          transition={{ duration: 0.8, delay: 0.2 }}
                          className="h-2 bg-gradient-to-r from-primary to-accent rounded-full" 
                        />
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Estrellas del Equipo */}
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-white/80 mb-3">Jugadores Clave</h3>
                <div className="grid grid-cols-1 gap-2">
                  {team.stars && team.stars.length > 0 ? (
                    team.stars.slice(0, 6).map((star, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/8 text-sm font-medium text-white/90 flex items-center gap-2"
                      >
                        <span className="w-5 h-5 rounded-full bg-primary/30 inline-block" aria-hidden="true" />
                        {star}
                      </motion.div>
                    ))
                  ) : (
                    <div className="text-xs text-white/50 text-center py-4">No hay datos de jugadores</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Botones de Acción */}
          <div className="flex items-center gap-3 justify-end p-6 border-t border-white/10 bg-white/[0.02]">
            <button 
              onClick={() => onOpenChange(false)} 
              className="px-5 py-2.5 rounded-lg glass text-sm font-semibold hover:bg-white/10 transition border border-white/10"
            >
              Volver
            </button>

            <button
              onClick={() => {
                onOpenChange(false);
                onStart(team.id);
              }}
              className="button-premium px-6 py-2.5 text-sm font-black rounded-lg"
            >
              ¡Comenzar carrera!
            </button>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
