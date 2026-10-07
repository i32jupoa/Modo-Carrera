import React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAllTeams, getLeagueTier, overall, LEAGUES } from "@/data/teams";
import { TeamLogo } from "@/components/TeamLogo";
import { LeagueLogo } from "@/components/LeagueLogo";
import {
  getTeamCategory,
  getTeamDifficulty,
  getTeamObjectives,
  CATEGORY_COLORS,
  DIFFICULTY_COLORS,
} from "@/lib/utils";
import { getRivals } from "@/data/teamExtras";
import { realRecentTrophies } from "@/data/leagueWinners";
import { getClubExtra } from "@/data/clubExtras";
import { squadForTeam, marketValueEuros } from "@/store/playersStore";
import { getClubProfile } from "@/lib/transfers/ClubStrategy";
import { initialBudget } from "@/lib/transfers/BudgetManager";
import { getClubWageBill } from "@/lib/transfers/PlayerIndex";
import { buildPositions, formatPositionLabel, formatShortPositions } from "@/lib/positions";
import { Trophy, Users, Building2, Target, Wallet, Swords, History, Sparkles } from "lucide-react";

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
  const team = teamId ? getAllTeams().find((t) => t.id === teamId) || null : null;

  // Build full squad from players JSON, deterministic order by OVR
  const squad = React.useMemo(() => {
    if (!teamId) return [];
    return squadForTeam(teamId).slice().sort((a, b) => (b.OVR || 0) - (a.OVR || 0)).slice(0, 50);
  }, [teamId]);

  if (!team) return null;

  const ov = overall(team);
  const category = getTeamCategory(team);
  const difficulty = getTeamDifficulty(ov);
  const objectives = getTeamObjectives(ov, category);
  const clubProfile = getClubProfile(team.id);
  const startBudget = initialBudget(clubProfile);
  const wageBill = getClubWageBill(team.id);
  const initialWageBudget = Math.round(startBudget * 0.2);
  const squadAverage = squad.length > 0
    ? squad.reduce((sum, player) => sum + (player.OVR || 0), 0) / squad.length
    : overall(team);
  const squadValue = Math.round(
    squad.reduce(
      (sum, player) => sum + marketValueEuros(player, team.id, team.league, squadAverage),
      0,
    ) / 1_000_000,
  );
  const rivals = getRivals(team);
  const recentTrophies = realRecentTrophies(team.name, team.league);
  const topPlayers = squad.slice(0, 5);
  const leagueTier = getLeagueTier(team.league);
  const teamColor = team.color || "#1a1a2e";
  const extra = getClubExtra(team.name);
  const catCol = CATEGORY_COLORS[category];
  const difCol = DIFFICULTY_COLORS[difficulty];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl w-full p-0 overflow-hidden max-h-[92vh] overflow-y-auto border-white/10"
        style={{
          background: `linear-gradient(180deg, ${teamColor}25 0%, rgba(8,8,15,0.98) 50%)`,
        }}
      >
        <div className="animate-fade-in">
          {/* HEADER cinemático */}
          <div
            className="relative h-44 overflow-hidden border-b border-white/10"
            style={{
              background: `radial-gradient(circle at 30% 50%, ${teamColor}aa, transparent 60%), linear-gradient(135deg, ${teamColor}55, #0a0a14)`,
            }}
          >
            <div className="absolute inset-0 opacity-30">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="absolute h-full w-1"
                  style={{
                    left: `${15 + i * 15}%`,
                    background: `linear-gradient(180deg, transparent, ${teamColor}aa, transparent)`,
                    filter: "blur(8px)",
                  }}
                />
              ))}
            </div>
            <div className="relative z-10 h-full flex items-center gap-6 px-6 md:px-8">
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/15 flex items-center justify-center p-3 flex-shrink-0 shadow-2xl">
                <TeamLogo
                  teamName={team.name}
                  leagueName={LEAGUES[team.league]?.name ?? team.league}
                  size={96}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="text-3xl md:text-4xl font-black leading-tight text-white truncate"
                  style={{ textShadow: "0 2px 20px rgba(0,0,0,0.6)" }}
                >
                  {team.name}
                </div>
                <div className="text-sm text-white/70 mt-1">{team.city}</div>
                <div className="mt-3 flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-black/40 border border-white/10">
                    <LeagueLogo league={LEAGUES[team.league]?.name ?? team.league} size="sm" />
                    <span className="text-xs text-white/80">
                      {LEAGUES[team.league]?.name ?? team.league}
                    </span>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${catCol.bg} ${catCol.text} ${catCol.border}`}
                  >
                    {category}
                  </span>
                  <span
                    className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${difCol.bg} ${difCol.text} ${difCol.border}`}
                  >
                    Dificultad: {difficulty}
                  </span>
                </div>
              </div>
              <div className="hidden md:flex flex-col items-end">
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">Overall</div>
                <div
                  className="text-6xl font-black text-white leading-none"
                  style={{ color: teamColor, textShadow: `0 0 30px ${teamColor}` }}
                >
                  {ov}
                </div>
              </div>
            </div>
          </div>

          {/* DATOS REALES DE ARRANQUE */}
          <div className="px-4 md:px-6 pt-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] backdrop-blur-xl p-4 shadow-xl">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.25em] text-primary font-black">Datos de la partida</div>
                  <div className="text-sm font-semibold text-white mt-1">
                    Estos valores se calculan con las mismas fuentes que usa la nueva partida.
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 min-w-0">
                  <Mini label="Presupuesto" value={formatCompactMoney(startBudget)} />
                  <Mini label="Bolsa salarial" value={formatCompactMoney(initialWageBudget)} />
                  <Mini label="Masa salarial" value={formatCompactMoney(wageBill)} />
                  <Mini label="Valor plantilla" value={formatCompactMoney(squadValue * 1_000_000)} />
                </div>
              </div>
            </div>
          </div>

          {/* TABS */}
          <Tabs defaultValue="resumen" className="p-4 md:p-6">
            <TabsList className="bg-white/[0.04] border border-white/10 h-auto flex-wrap gap-1">
              <TabsTrigger value="resumen" className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Resumen
              </TabsTrigger>
              <TabsTrigger value="plantilla" className="gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Plantilla
              </TabsTrigger>
              <TabsTrigger value="estadio" className="gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                Estadio
              </TabsTrigger>
              <TabsTrigger value="objetivos" className="gap-1.5">
                <Target className="h-3.5 w-3.5" />
                Objetivos
              </TabsTrigger>
              <TabsTrigger value="finanzas" className="gap-1.5">
                <Wallet className="h-3.5 w-3.5" />
                Finanzas
              </TabsTrigger>
              <TabsTrigger value="rivales" className="gap-1.5">
                <Swords className="h-3.5 w-3.5" />
                Rivales
              </TabsTrigger>
              <TabsTrigger value="historial" className="gap-1.5">
                <History className="h-3.5 w-3.5" />
                Palmarés
              </TabsTrigger>
            </TabsList>

            {/* RESUMEN */}
            <TabsContent value="resumen" className="mt-5 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <StatBlock label="Ataque" value={team.att} color={teamColor} />
                <StatBlock label="Medio" value={team.mid} color={teamColor} />
                <StatBlock label="Defensa" value={team.def} color={teamColor} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Mini label="Nivel de liga" value={leagueTier === 1 ? "1ª división" : `${leagueTier}º nivel`} />
                <Mini label="Plantilla" value={`${squad.length} jugadores`} />
                <Mini label="Media plantilla" value={`${Math.round(squadAverage)} OVR`} />
                <Mini label="Potencia financiera" value={`${Math.round(clubProfile.financialPower * 100)}/100`} />
              </div>
              <div className="rounded-xl p-4 border border-white/10 bg-white/[0.03]">
                <div className="text-xs uppercase tracking-wider text-white/50 mb-2">
                  Resumen del proyecto
                </div>
                <p className="text-sm text-white/85 leading-relaxed">
                  {category === "Elite Mundial" || category === "Gigante"
                    ? `${team.name} parte con una plantilla de primer nivel. El reto está en mantener el nivel competitivo, gestionar el vestuario y convertir la superioridad deportiva en títulos.`
                    : category === "Aspirante"
                      ? `${team.name} tiene una base competitiva para pelear por objetivos ambiciosos. El proyecto pasa por reforzar las posiciones clave y mantener una progresión sostenible.`
                      : category === "Media tabla"
                        ? `${team.name} cuenta con margen para crecer. La prioridad es consolidar el rendimiento, mejorar la plantilla y convertir el proyecto en una presencia habitual en la zona alta.`
                        : `${team.name} parte con un reto de reconstrucción. El objetivo es hacer crecer el club paso a paso, proteger la economía y elevar el nivel de la plantilla.`}
                </p>
              </div>
              <div className="rounded-xl p-4 border border-white/10 bg-white/[0.03]">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs uppercase tracking-wider text-white/50">Jugadores clave</div>
                  <div className="text-[10px] text-white/40">Datos de la plantilla inicial</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {topPlayers.slice(0, 4).map((player, i) => (
                    <div key={String(player.ID ?? i)} className="flex items-center gap-3 rounded-lg bg-white/[0.035] border border-white/8 p-2.5">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white" style={{ background: teamColor }}>
                        {player.OVR}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-white truncate">{player.Name}</div>
                        <div className="text-[11px] text-white/45">{formatPositionLabel(player.Position)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* PLANTILLA */}
            <TabsContent value="plantilla" className="mt-5">
              <SquadView squad={squad} teamColor={teamColor} fallbackStars={team.stars || []} />
            </TabsContent>

            {/* ESTADIO */}
            <TabsContent value="estadio" className="mt-5">
              <div className="rounded-xl p-6 border border-white/10 bg-gradient-to-br from-emerald-900/30 to-black/50 text-center">
                <Building2 className="h-12 w-12 mx-auto mb-3 text-white/60" />
                <div className="text-lg font-black text-white">
                  {extra?.stadium ?? "Datos no disponibles"}
                </div>
                <div className="text-xs text-white/60 mt-1 mb-4">
                  Casa de {team.name} · {extra?.country ?? LEAGUES[team.league]?.country ?? "País no registrado"}
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <Mini
                    label="Aforo"
                    value={extra?.capacity ? `${extra.capacity.toLocaleString("es-ES")} pl.` : "—"}
                  />
                  <Mini label="Año constr." value={extra?.year ? `${extra.year}` : "—"} />
                  <Mini
                    label="Ambiente"
                    value={ov > 80 ? "Caldera" : ov > 70 ? "Vibrante" : "Familiar"}
                  />
                </div>
              </div>
            </TabsContent>

            {/* OBJETIVOS */}
            <TabsContent value="objetivos" className="mt-5">
              <div className="text-xs uppercase tracking-wider text-white/50 mb-3">
                Objetivos de temporada
              </div>
              <div className="space-y-2">
                {objectives.map((o, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.04] border border-white/8 animate-slide-in"
                    style={{ animationDelay: `${i * 0.05}s` }}
                  >
                    <Trophy className="h-4 w-4 flex-shrink-0" style={{ color: teamColor }} />
                    <span className="text-sm text-white/90">{o}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 text-xs uppercase tracking-wider text-white/50 mb-3">
                Perfil de reto estimado
              </div>
              <div className="space-y-2.5">
                {[
                  { label: "Éxito nacional", value: Math.min(100, ov + 10) },
                  { label: "Éxito continental", value: Math.max(0, ov - 5) },
                  { label: "Finanzas sanas", value: Math.min(100, 50 + (ov - 70)) },
                  { label: "Desarrollo juvenil", value: Math.min(100, 40 + (ov - 70)) },
                  { label: "Prestigio", value: Math.min(100, ov) },
                ].map((e) => (
                  <div key={e.label}>
                    <div className="flex items-center justify-between text-xs text-white/60 mb-1">
                      <div>{e.label}</div>
                      <div className="font-bold">{e.value}%</div>
                    </div>
                    <div className="w-full h-2 rounded-full bg-white/[0.08] overflow-hidden">
                      <div
                        className="h-2 rounded-full transition-all duration-800"
                        style={{
                          background: `linear-gradient(90deg, ${teamColor}, #ffffff66)`,
                          width: `${e.value}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* FINANZAS */}
            <TabsContent value="finanzas" className="mt-5 space-y-4">
              <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-4">
                <div className="flex items-start gap-3">
                  <Wallet className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <div className="text-sm font-black text-white">Economía inicial de la partida</div>
                    <div className="text-xs text-white/55 mt-1">
                      El presupuesto mostrado aquí es el que recibe el club al crear la carrera. La bolsa salarial inicial es el 20% de ese presupuesto, exactamente igual que en el estado inicial del juego.
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FinBlock label="Presupuesto inicial" value={formatCompactMoney(startBudget)} color={teamColor} />
                <FinBlock label="Bolsa salarial inicial" value={formatCompactMoney(initialWageBudget)} color="#f97316" />
                <FinBlock label="Masa salarial actual" value={formatCompactMoney(wageBill)} color="#3b82f6" />
                <FinBlock label="Valor de plantilla" value={formatCompactMoney(squadValue * 1_000_000)} color="#22c55e" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Mini label="Poder financiero del club" value={`${Math.round(clubProfile.financialPower * 100)}/100`} />
                <Mini label="Reputación del club" value={`${Math.round(clubProfile.reputation * 100)}/100`} />
              </div>
            </TabsContent>

            {/* RIVALES */}
            <TabsContent value="rivales" className="mt-5">
              <div className="text-xs uppercase tracking-wider text-white/50 mb-3">
                Rivales clásicos
              </div>
              {rivals.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {rivals.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.04]"
                      style={{ borderLeft: `4px solid ${r.color || "#ef4444"}` }}
                    >
                      <div className="w-12 h-12 rounded-lg bg-black/40 flex items-center justify-center p-1.5 flex-shrink-0">
                        <TeamLogo
                          teamName={r.name}
                          leagueName={LEAGUES[r.league]?.name ?? r.league}
                          size={40}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">{r.name}</div>
                        <div className="text-xs text-white/50">
                          OVR {overall(r)} · {r.city}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-white/50">Sin rivalidades históricas registradas.</div>
              )}
            </TabsContent>

            {/* PALMARÉS */}
            <TabsContent value="historial" className="mt-5">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-4">
                <div className="text-sm font-black text-white">Palmarés reciente registrado</div>
                <div className="text-xs text-white/50 mt-1">Solo se muestran títulos que están documentados en la base histórica del juego; no se generan posiciones ni goleadores ficticios.</div>
              </div>
              <div className="space-y-2">
                {Object.entries(recentTrophies).map(([season, trophies]) => (
                  <div key={season} className="flex items-center gap-4 p-3 rounded-lg bg-white/[0.04] border border-white/8">
                    <div className="text-xs font-mono text-white/50 w-12">{season}</div>
                    <div className="flex-1 flex flex-wrap gap-1.5">
                      {trophies.length > 0 ? trophies.map((trophy, i) => (
                        <span key={`${season}-${i}`} className="text-[10px] px-2 py-1 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold uppercase">
                          🏆 {trophy}
                        </span>
                      )) : (
                        <span className="text-xs text-white/30">Sin títulos registrados</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          {/* CTA */}
          <div className="flex items-center gap-3 justify-end p-5 border-t border-white/10 bg-black/40 sticky bottom-0">
            <button
              onClick={() => onOpenChange(false)}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold border border-white/15 text-white/80 hover:bg-white/10 transition"
            >
              Volver
            </button>
            <button
              onClick={() => {
                onOpenChange(false);
                onStart(team.id);
              }}
              className="px-6 py-2.5 text-sm font-black rounded-lg text-white shadow-lg transition hover:brightness-125"
              style={{
                background: `linear-gradient(135deg, ${teamColor}, ${teamColor}cc)`,
                boxShadow: `0 8px 24px ${teamColor}66`,
              }}
            >
              ¡Iniciar carrera!
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatBlock({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl p-4 border border-white/10 bg-white/[0.03] text-center">
      <div className="text-[10px] uppercase tracking-wider text-white/50 mb-2">{label}</div>
      <div className="text-3xl font-black" style={{ color }}>
        {value}
      </div>
      <div className="mt-2 w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}
function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg p-3 bg-white/[0.05] border border-white/8">
      <div className="text-[10px] uppercase tracking-wider text-white/50">{label}</div>
      <div className="text-sm font-bold text-white mt-1">{value}</div>
    </div>
  );
}
function formatCompactMoney(value: number): string {
  const amount = Math.max(0, Math.round(value));
  const millions = amount / 1_000_000;
  if (millions >= 1) return `€${millions.toLocaleString("es-ES", { maximumFractionDigits: 1 })} M`;
  const thousands = amount / 1_000;
  return `€${thousands.toLocaleString("es-ES", { maximumFractionDigits: 0 })} K`;
}

function FinBlock({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl p-4 border bg-white/[0.03]" style={{ borderColor: `${color}33` }}>
      <div className="text-xs text-white/50 mb-1">{label}</div>
      <div className="text-2xl font-black" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

// Group player positions into lines (GK / DEF / MID / FWD)
function posLine(pos: string | undefined): "GK" | "DEF" | "MID" | "FWD" | "—" {
  if (!pos) return "—";
  if (pos === "GK") return "GK";
  if (["CB", "LB", "RB", "LWB", "RWB"].includes(pos)) return "DEF";
  if (["CM", "CDM", "CAM", "LM", "RM"].includes(pos)) return "MID";
  if (["ST", "CF", "LW", "RW", "LF", "RF"].includes(pos)) return "FWD";
  return "MID";
}

function SquadView({
  squad,
  teamColor,
  fallbackStars,
}: {
  squad: any[];
  teamColor: string;
  fallbackStars: string[];
}) {
  if (!squad || squad.length === 0) {
    return (
      <div>
        <div className="text-xs uppercase tracking-wider text-white/50 mb-3">Jugadores clave</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {fallbackStars.length > 0 ? (
            fallbackStars.slice(0, 10).map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.04] border border-white/10"
              >
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white"
                  style={{ background: teamColor }}
                >
                  {i + 1}
                </span>
                <span className="text-sm font-semibold text-white/90">{s}</span>
              </div>
            ))
          ) : (
            <div className="text-xs text-white/50">Sin datos de plantilla</div>
          )}
        </div>
      </div>
    );
  }

  const groups: Record<"GK" | "DEF" | "MID" | "FWD", any[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of squad) {
    const ln = posLine(p.Position);
    if (ln === "—") continue;
    groups[ln].push(p);
  }
  const order: { key: "GK" | "DEF" | "MID" | "FWD"; label: string }[] = [
    { key: "GK", label: "Porteros" },
    { key: "DEF", label: "Defensas" },
    { key: "MID", label: "Centrocampistas" },
    { key: "FWD", label: "Delanteros" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-white/50">Plantilla completa</div>
        <div className="text-[11px] text-white/60">
          {squad.length} jugadores · OVR medio{" "}
          <span className="font-bold text-white">
            {Math.round(squad.reduce((s, p) => s + (p.OVR || 70), 0) / squad.length)}
          </span>
        </div>
      </div>
      {order.map(({ key, label }) =>
        groups[key].length === 0 ? null : (
          <div key={key}>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider text-white"
                style={{ background: teamColor }}
              >
                {key}
              </span>
              <span className="text-xs text-white/60">
                {label} ({groups[key].length})
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {groups[key].map((p, i) => {
                const ovr = p.OVR ?? 70;
                const ovrTone =
                  ovr >= 85
                    ? "from-amber-400 to-amber-600 text-black"
                    : ovr >= 80
                      ? "from-emerald-400 to-emerald-600 text-black"
                      : ovr >= 75
                        ? "from-sky-400 to-sky-600 text-black"
                        : "from-zinc-500 to-zinc-700 text-white";
                return (
                  <div
                    key={`${p.Name}-${i}`}
                    className="animate-slide-in flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.04] border border-white/10 hover:border-white/25 transition"
                    style={{ animationDelay: `${i * 0.015}s` }}
                  >
                    <div
                      className={`w-10 h-10 rounded-lg bg-gradient-to-br ${ovrTone} flex items-center justify-center font-black text-sm flex-shrink-0 shadow`}
                    >
                      {ovr}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-white truncate">{p.Name ?? "—"}</div>
                      <div className="text-[11px] text-white/55 flex items-center gap-2">
                        {(() => {
                          const positions = buildPositions(p.Position, p["Alternative positions"]);
                          const primary = positions[0] ? formatShortPositions([positions[0]]) : formatPositionLabel(p.Position);
                          const secondary = positions.length > 1 ? formatShortPositions(positions.slice(1)) : "";
                          return (
                            <span className="flex items-baseline gap-1.5 whitespace-nowrap">
                              <span className="font-mono font-black text-white/90">{primary}</span>
                              {secondary && <span className="font-mono text-[9px] text-white/40">{secondary}</span>}
                            </span>
                          );
                        })()}
                        {p.Nation && <span className="truncate">· {p.Nation}</span>}
                        {typeof p.Age === "number" && <span>· {p.Age}a</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ),
      )}
    </div>
  );
}
