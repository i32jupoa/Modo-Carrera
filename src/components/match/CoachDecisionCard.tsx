import { motion } from "framer-motion";
import { Brain, ShieldAlert, Swords, Zap } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { formatMatchMinuteWithMark, type MatchMinuteContext } from "@/lib/matchTime";
import type { CoachDecision as MatchCoachDecision, CoachDecisionOption as MatchCoachDecisionOption } from "@/lib/liveMatchEngine";

export type CoachDecisionOption = MatchCoachDecisionOption;
export type CoachDecisionData = MatchCoachDecision & MatchMinuteContext;

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
      className="fixed inset-0 z-[95] flex items-center justify-center overflow-y-auto bg-black/75 px-3 py-5 backdrop-blur-md md:px-6"
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
    >
      <div className="my-auto w-full max-w-4xl rounded-2xl border border-primary/45 bg-card/98 p-5 shadow-[0_28px_100px_rgba(0,0,0,.62)] md:p-7">
        <div className="flex flex-col gap-4">
          <div className="flex w-fit items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-primary">
            <Brain className="h-4 w-4" /> Partido en pausa · Decide con calma
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-primary">
              {team && <TeamLogo teamName={team.name} leagueName={team.leagueName} size={19} />}
              <span>{formatMatchMinuteWithMark(decision.minute, decision)}</span>
              <span>•</span>
              <span>Orden del entrenador</span>
            </div>
            <h3 className="mt-2 text-xl font-black leading-tight md:text-2xl">{decision.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground md:text-base">{decision.prompt}</p>
            <div className="mt-2 grid gap-3 md:grid-cols-3">
              {decision.options.map((option) => (
                <button
                  key={option.id}
                  onClick={() => onChoose(option.id)}
                  className="group min-h-32 rounded-xl border border-border bg-background/60 px-4 py-4 text-left transition hover:border-primary/60 hover:bg-primary/5 md:px-4 md:py-5"
                >
                  <div className="flex items-center gap-2 text-sm font-black md:text-base">
                    <span className="text-primary">{iconForTone(option.tone)}</span>
                    {option.label}
                  </div>
                  <div className="mt-2 text-sm leading-relaxed text-muted-foreground group-hover:text-foreground/80">
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
