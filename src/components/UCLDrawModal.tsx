import { useState, useEffect } from "react";
import { SaveGame, applyUCLLeagueDraw, applyUCLPlayoffDraw, applyUCLKnockoutDraw } from "@/lib/store";
import { assignUCLPots, UCL_SEASON1_IDS, emptyTableEntry } from "@/data/ucl";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import { TeamLogo } from "@/components/TeamLogo";
import { runSwissDraw } from "@/lib/uclDraw";
import type { Fixture } from "@/lib/season";

function safeTeam(id: string) {
  try { return teamById(id); } catch { return { id, name: id, short: id.slice(0,3).toUpperCase(), city: "", league: "premier" as const, att: 75, mid: 75, def: 75, stars: [], color: "#334155" }; }
}
function teamName(id: string) { return safeTeam(id).name; }

function leagueDisplayName(leagueId: string): string {
  const entry = LEAGUES[leagueId as LeagueId];
  return entry?.name ?? leagueId;
}

function TeamIcon({ id, size = 32 }: { id: string; size?: number }) {
  const t = safeTeam(id);
  return <TeamLogo teamName={t.name} leagueName={leagueDisplayName(t.league)} size={size} />;
}

const POT_COLORS = [
  "from-yellow-900/40 border-yellow-600/40",
  "from-slate-700/40 border-slate-400/40",
  "from-amber-900/40 border-amber-700/40",
  "from-zinc-700/40 border-zinc-500/40",
];
const POT_TEXT = ["text-yellow-400", "text-slate-300", "text-amber-400", "text-zinc-400"];

interface UCLDrawModalProps {
  type: "league" | "playoff" | "knockout";
  save: SaveGame;
  onClose: () => void;
  onComplete: (updated: SaveGame) => void;
}

export function UCLDrawModal({ type, save, onClose, onComplete }: UCLDrawModalProps) {
  const [step, setStep] = useState<"intro" | "revealing" | "done">("intro");
  const [result, setResult] = useState<SaveGame | null>(null);
  const [myFixtures, setMyFixtures] = useState<Fixture[]>([]);
  const [fixturePotIdx, setFixturePotIdx] = useState<number[]>([]);
  const [drawPots, setDrawPots] = useState<string[][]>([]);
  const [drawMatrix, setDrawMatrix] = useState<boolean[][] | null>(null);
  const [drawTeamIndex, setDrawTeamIndex] = useState<Map<string, number> | null>(null);
  const [showMatrixModal, setShowMatrixModal] = useState(false);
  // How many fixtures revealed so far (manual button)
  const [visibleCount, setVisibleCount] = useState(0);

  // Transform matrix data to team-with-opponents format
  const getTeamOpponents = () => {
    if (!drawMatrix || !drawTeamIndex) return [];
    
    const introPots = assignUCLPots(UCL_SEASON1_IDS);
    
    // Re-run draw to get assignments with correct home/away info
    const { assignments } = runSwissDraw(UCL_SEASON1_IDS);
    
    return introPots.map((pot, potIndex) => {
      return pot.map(teamId => {
        const teamOpponents = assignments.get(teamId) || [];
        
        return {
          team: teamId,
          pot: potIndex + 1,
          opponents: teamOpponents.map(opp => ({
            opponent: opp.teamId,
            isHome: opp.isHome
          }))
        };
      });
    });
  };

  const teamOpponents = getTeamOpponents();

  // Always use canonical IDs regardless of stale save
  function ensureUcl(s: SaveGame): SaveGame {
    const participants = UCL_SEASON1_IDS;
    return {
      ...s,
      ucl: {
        phase: s.ucl?.phase ?? ("league" as const),
        seasonNumber: s.ucl?.seasonNumber ?? 1,
        participants,
        table: s.ucl?.table?.length === 36 ? s.ucl.table : participants.map(emptyTableEntry),
        drawState: s.ucl?.drawState ?? { leagueDone: false, playoffDone: false, knockoutDone: false },
        leaguePhaseTable: s.ucl?.leaguePhaseTable ?? null,
        bracket: s.ucl?.bracket ?? [],
      },
    };
  }

  useEffect(() => {
    if (type === "playoff" && save.ucl?.drawState.playoffDone) {
      setResult(ensureUcl(save));
      setMyFixtures([]);
      setStep("done");
    }
  }, [type, save]);

  function revealNext() {
    setVisibleCount(c => {
      const next = c + 1;
      if (next >= myFixtures.length) setStep("done");
      return next;
    });
  }

  function runDraw() {
    const currentSave = ensureUcl(save);
    const myTeamId = currentSave.myTeamId;
    try {
      let updated: SaveGame;
      let fixtures: Fixture[];

      if (type === "league") {
        // Capture matrix from runSwissDraw before applying
        const drawResult = runSwissDraw(UCL_SEASON1_IDS);
        console.log("drawResult.matrix:", drawResult.matrix);
        console.log("drawResult.teamIndex:", drawResult.teamIndex);
        setDrawMatrix(drawResult.matrix);
        setDrawTeamIndex(drawResult.teamIndex);

        updated = applyUCLLeagueDraw(currentSave, drawResult);
        const pots = assignUCLPots(UCL_SEASON1_IDS);
        setDrawPots(pots);
        const potOf = new Map<string, number>();
        pots.forEach((pot, i) => pot.forEach(id => potOf.set(id, i)));
        fixtures = updated.uclFixtures.filter(
          f => (f.homeId === myTeamId || f.awayId === myTeamId) && f.round?.startsWith("Jornada")
        );
        fixtures = [...fixtures].sort((a, b) => {
          const rA = a.homeId === myTeamId ? a.awayId : a.homeId;
          const rB = b.homeId === myTeamId ? b.awayId : b.homeId;
          return (potOf.get(rA) ?? 9) - (potOf.get(rB) ?? 9);
        });
        setFixturePotIdx(fixtures.map(f => {
          const rival = f.homeId === myTeamId ? f.awayId : f.homeId;
          return potOf.get(rival) ?? 0;
        }));
      } else if (type === "playoff") {
        updated = currentSave.ucl?.drawState.playoffDone
          ? currentSave
          : applyUCLPlayoffDraw(currentSave);
        fixtures = updated.uclFixtures.filter(
          f => (f.homeId === myTeamId || f.awayId === myTeamId) &&
               (f.round === "Playoff-Leg1" || f.round === "Playoff-Leg2")
        );
      } else {
        updated = applyUCLKnockoutDraw(currentSave);
        fixtures = updated.uclFixtures.filter(
          f => (f.homeId === myTeamId || f.awayId === myTeamId) && f.round === "R16-Leg1"
        );
      }

      if (fixtures.length === 0) {
        setResult(updated);
        setMyFixtures([]);
        setStep("done");
        return;
      }

      setResult(updated);
      setMyFixtures(fixtures);
      setVisibleCount(0);
      setStep("revealing");
    } catch (e) {
      console.error(e);
      alert(`Error en el sorteo: ${String(e)}`);
    }
  }

  // Pot panel shared between intro and reveal
  const introPots = assignUCLPots(UCL_SEASON1_IDS);
  const potsToShow = drawPots.length === 4 ? drawPots : introPots;

  const titles = {
    league:   "Sorteo · Fase de Liga UCL",
    playoff:  "Sorteo · Play-offs UCL",
    knockout: "Sorteo · Octavos de Final UCL",
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2">
        <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-5xl flex flex-col" style={{ height: "calc(100vh - 2rem)" }}>

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-950 to-indigo-900 px-6 py-3 rounded-t-xl flex items-center gap-3 shrink-0">
          <span className="text-2xl">🏆</span>
          <div>
            <h2 className="text-white font-bold text-base">{titles[type]}</h2>
            <p className="text-blue-300 text-xs">UEFA Champions League</p>
          </div>
        </div>

        {/* Body — two columns for league draw, single column for others */}
        <div className="flex-1 overflow-hidden flex gap-0 min-h-0">

          {/* LEFT: Pots panel (league draw always; others single col) */}
          {type === "league" && (
            <div className="w-72 shrink-0 border-r border-border overflow-y-auto p-3 space-y-2 bg-black/10">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Bombos</p>
              {potsToShow.map((pot, i) => {
                // Rivals of my team in this pot (revealed so far)
                const myRivalsInPot = myFixtures
                  .filter((_, fi) => fixturePotIdx[fi] === i)
                  .map(f => f.homeId === save.myTeamId ? f.awayId : f.homeId);

                return (
                  <div key={i} className={`rounded-lg border bg-gradient-to-b p-2 ${POT_COLORS[i]}`}>
                    <div className={`text-[0.65rem] font-bold uppercase tracking-widest mb-1.5 ${POT_TEXT[i]}`}>
                      Bombo {i + 1}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {pot.map(id => {
                        const isMyTeam = id === save.myTeamId;
                        const isRival = myRivalsInPot.includes(id);
                        return (
                          <span
                            key={id}
                            className={`flex items-center gap-1.5 rounded px-1 py-0.5 text-[0.7rem] transition-colors
                              ${isMyTeam ? "bg-blue-500/30 text-blue-200 font-bold" : ""}
                              ${isRival ? "bg-white/10 text-white font-semibold" : ""}
                              ${!isMyTeam && !isRival ? "text-muted-foreground" : ""}
                            `}
                          >
                            <TeamIcon id={id} size={14} />
                            <span className="truncate">{teamName(id)}</span>
                            {isMyTeam && <span className="ml-auto text-[0.55rem] text-blue-300 font-bold shrink-0">TÚ</span>}
                            {isRival && <span className="ml-auto text-[0.55rem] text-green-400 font-bold shrink-0">RIVAL</span>}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* RIGHT: Main content */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">

            {/* INTRO */}
            {step === "intro" && (
              <div className="flex flex-col gap-2 flex-1 justify-center items-center text-center">
                <div className="text-5xl mb-2">🎰</div>
                <h3 className="text-lg font-bold text-white">¿Listo para el sorteo?</h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                  {type === "league"
                    ? "Se sortearán 8 rivales para tu equipo: 2 de cada bombo. Pulsa para revelarlos uno a uno."
                    : type === "playoff"
                    ? "Los clasificados 9º–24º disputarán una eliminatoria a ida y vuelta."
                    : "Los 8 mejores se enfrentan a los ganadores del play-off."}
                </p>
              </div>
            )}

            {/* REVEALING / DONE */}
            {(step === "revealing" || step === "done") && (
              <>
                <p className="text-sm font-semibold text-blue-300 shrink-0">
                  {type === "league"
                    ? `Tus rivales — ${visibleCount} / ${myFixtures.length} revelados`
                    : type === "playoff" ? "Tu eliminatoria de play-off:" : "Tu eliminatoria de octavos:"}
                </p>

                {/* League: group by pot */}
                {type === "league" ? (
                  <div className="space-y-4">
                    {[0, 1, 2, 3].map(potIdx => {
                      const group = myFixtures
                        .map((f, i) => ({ f, i }))
                        .filter(({ i }) => fixturePotIdx[i] === potIdx);
                      if (group.length === 0) return null;
                      return (
                        <div key={potIdx}>
                          <div className={`text-xs font-bold uppercase tracking-widest mb-2 ${POT_TEXT[potIdx]}`}>
                            Bombo {potIdx + 1}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {group.map(({ f, i }) => {
                              const isHome = f.homeId === save.myTeamId;
                              const rivalId = isHome ? f.awayId : f.homeId;
                              const visible = i < visibleCount;
                              return (
                                <div
                                  key={f.id}
                                  className={`transition-all duration-500 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"}`}
                                >
                                  <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-xl px-3 py-2.5">
                                    <div className="flex flex-col items-center gap-0.5 flex-1">
                                      <TeamIcon id={isHome ? save.myTeamId : rivalId} size={32} />
                                      <span className="text-[0.65rem] font-semibold text-center leading-tight max-w-[70px] truncate">
                                        {teamName(isHome ? save.myTeamId : rivalId)}
                                      </span>
                                      {isHome && <span className="text-[0.55rem] text-blue-400 font-bold">TÚ</span>}
                                    </div>
                                    <div className="flex flex-col items-center shrink-0">
                                      <span className="text-[0.65rem] font-bold text-muted-foreground">VS</span>
                                      <span className="text-[0.5rem] text-muted-foreground">{isHome ? "Local" : "Visit."}</span>
                                    </div>
                                    <div className="flex flex-col items-center gap-0.5 flex-1">
                                      <TeamIcon id={isHome ? rivalId : save.myTeamId} size={32} />
                                      <span className="text-[0.65rem] font-semibold text-center leading-tight max-w-[70px] truncate">
                                        {teamName(isHome ? rivalId : save.myTeamId)}
                                      </span>
                                      {!isHome && <span className="text-[0.55rem] text-blue-400 font-bold">TÚ</span>}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {myFixtures.map((f, i) => {
                      const isHome = f.homeId === save.myTeamId;
                      const rivalId = isHome ? f.awayId : f.homeId;
                      return (
                        <div
                          key={f.id}
                          className={`transition-all duration-500 ${i < visibleCount ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"}`}
                        >
                          <div className="flex items-center gap-3 bg-muted/40 border border-border rounded-xl px-4 py-3">
                            <div className="flex flex-col items-center gap-1 flex-1">
                              <TeamIcon id={isHome ? save.myTeamId : rivalId} size={36} />
                              <span className="text-xs font-semibold text-center max-w-[90px] truncate">{teamName(isHome ? save.myTeamId : rivalId)}</span>
                              {isHome && <span className="text-[0.6rem] text-blue-400 font-bold">TÚ</span>}
                            </div>
                            <div className="flex flex-col items-center shrink-0">
                              <span className="text-xs font-bold text-muted-foreground">VS</span>
                              <span className="text-[0.55rem] text-muted-foreground">{isHome ? "Local" : "Visitante"}</span>
                            </div>
                            <div className="flex flex-col items-center gap-1 flex-1">
                              <TeamIcon id={isHome ? rivalId : save.myTeamId} size={36} />
                              <span className="text-xs font-semibold text-center max-w-[90px] truncate">{teamName(isHome ? rivalId : save.myTeamId)}</span>
                              {!isHome && <span className="text-[0.6rem] text-blue-400 font-bold">TÚ</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {step === "done" && (
                  <p className="text-sm text-green-400 font-semibold text-center py-2 shrink-0">
                    {type === "playoff" && myFixtures.length === 0
                      ? "✓ Clasificación directa a octavos — cuadro completo generado"
                      : `✓ Sorteo completado — ${myFixtures.length} partidos generados`}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex justify-between items-center shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded text-sm text-muted-foreground hover:bg-muted transition"
          >
            {step === "done" ? "Cerrar" : "Cancelar"}
          </button>

          <div className="flex gap-2">
            {step === "intro" && (
              <button
                onClick={runDraw}
                className="px-5 py-2 rounded bg-primary text-primary-foreground text-sm font-bold hover:brightness-110 transition"
              >
                🎰 Realizar Sorteo
              </button>
            )}
            {step === "revealing" && visibleCount < myFixtures.length && (
              <button
                onClick={revealNext}
                className="px-5 py-2 rounded bg-blue-600 text-white text-sm font-bold hover:bg-blue-500 transition"
              >
                Revelar siguiente →
              </button>
            )}
            {step === "done" && type === "league" && !showMatrixModal && (
              <button
                onClick={() => {
                  console.log("Ver Matriz clicked, opening modal");
                  setShowMatrixModal(true);
                }}
                className="px-5 py-2 rounded bg-purple-600 text-white text-sm font-bold hover:bg-purple-500 transition"
              >
                Ver Matriz
              </button>
            )}
            {step === "done" && result && (
              <button
                onClick={() => onComplete(result)}
                className="px-5 py-2 rounded bg-primary text-primary-foreground text-sm font-bold hover:brightness-110 transition"
              >
                Continuar →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* Matrix Full-Screen Modal */}
    {showMatrixModal && drawMatrix && drawTeamIndex && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
        <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-950 to-indigo-900 px-6 py-4 rounded-t-xl flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-white font-bold text-lg">Matriz de Emparejamientos UCL</h2>
              <p className="text-blue-300 text-xs">36 equipos × 36 equipos</p>
            </div>
            <button
              onClick={() => setShowMatrixModal(false)}
              className="px-4 py-2 rounded bg-muted text-muted-foreground hover:bg-muted/80 transition font-semibold"
            >
              Cerrar
            </button>
          </div>

          {/* Matrix Content - 2x2 Grid Layout */}
          <div className="flex-1 overflow-auto p-4 bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950">
            <div className="grid grid-cols-2 gap-4 h-full">
              {teamOpponents.map((pot, potIndex) => (
                <div key={potIndex} className="bg-black/30 rounded-lg p-3 border border-blue-900/50">
                  <h3 className="text-blue-300 font-bold text-sm mb-3 text-center">Bombo {potIndex + 1}</h3>
                  <div className="space-y-2">
                    {pot.map((teamData, teamIdx) => (
                      <div
                        key={teamData.team}
                        className="flex items-center gap-2 p-2 rounded hover:bg-white/5 transition cursor-pointer group"
                      >
                        {/* Team Logo (Left Column) */}
                        <div className="w-10 h-10 shrink-0 bg-white rounded flex items-center justify-center shadow-lg">
                          <TeamIcon id={teamData.team} size={20} />
                        </div>
                        
                        {/* 8 Opponents (Right Columns) */}
                        <div className="flex gap-1 flex-1">
                          {teamData.opponents.map((opp, oppIdx) => (
                            <div key={oppIdx} className="relative w-10 h-10 shrink-0">
                              <div className="w-full h-full bg-slate-800 rounded flex items-center justify-center">
                                <TeamIcon id={opp.opponent} size={20} />
                              </div>
                              {/* Home/Away Badge */}
                              <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[0.5rem] font-bold shadow">
                                {opp.isHome ? (
                                  <span className="bg-green-500 text-white">🏠</span>
                                ) : (
                                  <span className="bg-blue-500 text-white">✈️</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
