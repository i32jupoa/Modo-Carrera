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

  function generateObjectives() {
    if (ov >= 80) {
      return [
        "Ganar la liga",
        "Llegar a semifinales de Champions",
        "Fichar una estrella mundial",
      ];
    }

    if (ov >= 65) {
      return ["Clasificarse para Europa", "Desarrollar jóvenes", "Mantener beneficios"];
    }

    return ["Evitar el descenso", "Descubrir talentos", "Crecer económicamente"];
  }

  const objectives = generateObjectives();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full glass-dark p-0 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.45, ease: "circOut" }}
        >
          <div className="relative flex flex-col lg:flex-row">
            <div className="lg:w-1/3 p-8 bg-gradient-to-b from-black/40 to-transparent">
              <div className="flex items-center gap-4">
                <div className="w-28 h-28 rounded-full bg-white/5 flex items-center justify-center p-2">
                  <TeamLogo teamName={team.name} leagueName={LEAGUES[team.league]?.name ?? team.league} size={88} />
                </div>

                <div>
                  <div className="text-2xl font-black">{team.name}</div>
                  <div className="text-sm text-white/60">{team.city} • {team.stadium || "Estadio"}</div>
                  <div className="mt-3 flex items-center gap-2">
                    <LeagueLogo league={LEAGUES[team.league]?.name ?? team.league} size="md" />
                    <div className="text-xs text-white/50">{LEAGUES[team.league]?.name ?? team.league}</div>
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-2">
                <div className="text-xs uppercase text-white/40">Media global</div>
                <div className="text-3xl font-black text-primary">{ov}</div>

                <div className="mt-4 text-sm text-white/60">Valor de plantilla: <span className="font-semibold text-white">{team.value || "N/A"}</span></div>
                <div className="text-sm text-white/60">Presupuesto inicial: <span className="font-semibold text-white">{team.budget || "N/A"}</span></div>
                <div className="text-sm text-white/60">Edad media: <span className="font-semibold text-white">{team.averageAge || "N/A"}</span></div>
              </div>

              <div className="mt-6">
                <div className="text-xs uppercase text-white/40 mb-2">Objetivos</div>
                <div className="grid grid-cols-1 gap-2">
                  {objectives.map((o) => (
                    <div key={o} className="rounded-lg p-3 bg-white/[0.03] border border-white/6">
                      <div className="text-sm font-semibold">{o}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:w-2/3 p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="text-sm text-white/40">Expectativas de la directiva</div>
                  <div className="mt-3 space-y-3">
                    {[
                      { label: "Éxito nacional", value: Math.min(100, ov + 10) },
                      { label: "Éxito continental", value: Math.min(100, ov - 5) },
                      { label: "Finanzas", value: 60 },
                      { label: "Desarrollo juvenil", value: 50 },
                      { label: "Prestigio", value: Math.min(100, ov) },
                    ].map((e) => (
                      <div key={e.label}>
                        <div className="flex items-center justify-between text-sm text-white/60 mb-1">
                          <div>{e.label}</div>
                          <div className="font-bold">{e.value}%</div>
                        </div>

                        <div className="w-full h-2 rounded-full bg-white/[0.03] overflow-hidden">
                          <div className="h-2 bg-gradient-to-r from-primary to-accent" style={{ width: `${e.value}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="w-1/3">
                  <div className="text-xs text-white/40">Plantilla</div>
                  <div className="mt-3 space-y-2">
                    {team.keyPlayers?.slice(0, 4).map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between">
                        <div className="text-sm">{p.name}</div>
                        <div className="font-bold">{p.rating}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <div className="text-xs text-white/40 mb-2">Datos económicos</div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg p-4 bg-white/[0.03] border border-white/6">
                    <div className="text-sm text-white/50">Presupuesto para fichajes</div>
                    <div className="text-lg font-black text-primary">{team.transferBudget || "N/A"}</div>
                  </div>

                  <div className="rounded-lg p-4 bg-white/[0.03] border border-white/6">
                    <div className="text-sm text-white/50">Salarios</div>
                    <div className="text-lg font-black text-accent">{team.salaries || "N/A"}</div>
                  </div>

                  <div className="rounded-lg p-4 bg-white/[0.03] border border-white/6">
                    <div className="text-sm text-white/50">Ingresos estimados</div>
                    <div className="text-lg font-black text-primary">{team.income || "N/A"}</div>
                  </div>

                  <div className="rounded-lg p-4 bg-white/[0.03] border border-white/6">
                    <div className="text-sm text-white/50">Valor de plantilla</div>
                    <div className="text-lg font-black text-accent">{team.value || "N/A"}</div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between">
                <div className="text-sm text-white/50">Dificultad del reto</div>
                <div className="flex items-center gap-2">
                  <div className="text-xs px-3 py-2 rounded-full bg-white/[0.03]">★★★☆☆ Intermedio</div>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-4 justify-end">
                <button onClick={() => onOpenChange(false)} className="glass px-4 py-2 rounded-lg">Volver</button>

                <button
                  onClick={() => {
                    onOpenChange(false);
                    onStart(team.id);
                  }}
                  className="button-premium px-6 py-3 text-lg font-black"
                >
                  Comenzar carrera
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
