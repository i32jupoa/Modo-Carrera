import { motion } from "framer-motion";
import { Brain, ShieldAlert, Swords, Zap } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";

export interface CoachDecisionOption {
  id: string;
  label: string;
  description: string;
  tone?: "neutral" | "attack" | "defense" | "intense";
  effects?: Record<string, number>;
}

export interface CoachDecisionData {
  id: string;
  minute: number;
  title: string;
  prompt: string;
  options: CoachDecisionOption[];
}

const iconForTone = (tone?: CoachDecisionOption["tone"]) => {
  if (tone === "attack") return <Swords className="h-4 w-4" />;
  if (tone === "defense") return <ShieldAlert className="h-4 w-4" />;
  if (tone === "intense") return <Zap className="h-4 w-4" />;
  return <Brain className="h-4 w-4" />;
};

export function CoachDecisionCard({
  decision,
  onChoose,
  team,
}: {
  decision: CoachDecisionData | null;
  onChoose: (optionId: string) => void;
  team?: { name: string; leagueName: string };
}) {
  if (!decision) return null;

  return (
    <motion.div
      className="fixed inset-x-0 bottom-2 z-[80] flex justify-center px-2"
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
    >
      <div className="w-full max-w-3xl rounded-xl border border-primary/40 bg-card/95 backdrop-blur-xl shadow-2xl p-3">
        <div className="flex flex-col md:flex-row md:items-start gap-3">
          <div className="hidden md:flex shrink-0 rounded-lg bg-primary/10 border border-primary/20 p-2 text-primary">
            <Brain className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.18em] text-primary">
              {team && <TeamLogo teamName={team.name} leagueName={team.leagueName} size={19} />}
              <span>{decision.minute}'</span>
              <span>•</span>
              <span>Orden del entrenador</span>
            </div>
            <h3 className="mt-1 text-base md:text-lg font-black">{decision.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{decision.prompt}</p>
            <div className="mt-2 grid gap-1.5 md:grid-cols-3">
              {decision.options.map((option) => (
                <button
                  key={option.id}
                  onClick={() => onChoose(option.id)}
                  className="group rounded-lg border border-border bg-background/60 px-3 py-2.5 text-left transition hover:border-primary/60 hover:bg-primary/5"
                >
                  <div className="flex items-center gap-2 text-xs font-black">
                    <span className="text-primary">{iconForTone(option.tone)}</span>
                    {option.label}
                  </div>
                  <div className="mt-1 text-[0.68rem] text-muted-foreground group-hover:text-foreground/80 line-clamp-2">
                    {option.description}
                  </div>
                  {option.effects && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {typeof option.effects.immediateStamina === "number" && option.effects.immediateStamina !== 0 && (
                        <span className={`rounded-full px-2 py-0.5 text-[0.58rem] font-black ${
                          option.effects.immediateStamina > 0
                            ? "bg-primary/10 text-primary"
                            : "bg-destructive/10 text-destructive"
                        }`}>
                          Energía {option.effects.immediateStamina > 0 ? "+" : ""}{option.effects.immediateStamina.toFixed(1)}
                        </span>
                      )}
                      {typeof option.effects.risk === "number" && option.effects.risk !== 0 && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.58rem] font-black text-muted-foreground">
                          Riesgo {option.effects.risk > 0 ? "+" : ""}{option.effects.risk}
                        </span>
                      )}
                      {typeof option.effects.staminaMultiplier === "number" && option.effects.staminaMultiplier !== 1 && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.58rem] font-black text-muted-foreground">
                          Desgaste {option.effects.staminaMultiplier < 1 ? "↓" : "↑"}
                        </span>
                      )}
                      {typeof option.effects.attack === "number" && option.effects.attack !== 1 && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.58rem] font-black text-muted-foreground">
                          Ataque {option.effects.attack > 1 ? "↑" : "↓"}
                        </span>
                      )}
                      {typeof option.effects.defense === "number" && option.effects.defense !== 1 && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.58rem] font-black text-muted-foreground">
                          Defensa {option.effects.defense > 1 ? "↑" : "↓"}
                        </span>
                      )}
                      {typeof option.effects.momentumBias === "number" && option.effects.momentumBias !== 0 && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.58rem] font-black text-primary">
                          Momentum {option.effects.momentumBias > 0 ? "+" : ""}{option.effects.momentumBias}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
