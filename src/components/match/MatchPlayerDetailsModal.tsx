import { Activity, CalendarDays, Footprints, Goal, ShieldCheck, Star, TrendingUp } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlayerFace, roleFromPosition } from "@/components/PlayerFace";
import { TeamLogo } from "@/components/TeamLogo";
import { faceUrl } from "@/lib/playerFaces";
import { usePlayersStore } from "@/store/playersStore";
import type { Player } from "@/data/players";

type PlayerMatchInfo = {
  goals: number;
  assists: number;
  rating?: number;
  hasYellow?: boolean;
  hasRed?: boolean;
};

export function MatchPlayerDetailsModal({
  player,
  teamName,
  teamLeagueName,
  matchInfo,
  energy,
  phase,
  onOpenChange,
}: {
  player: Player | null;
  teamName: string;
  teamLeagueName: string;
  matchInfo?: PlayerMatchInfo;
  energy?: number;
  phase: string;
  onOpenChange: (open: boolean) => void;
}) {
  // En la previa usamos solo las estadísticas acumuladas de la temporada.
  // Se leen del store persistente y se usa el objeto del minimapa como fallback
  // para soportar plantillas dinámicas y partidas guardadas antiguas.
  const storedPlayerStats = usePlayersStore((state) => (player ? state.stats[player.id] : undefined));
  const seasonStats = storedPlayerStats?.dynamicStats ?? player?.dynamicStats;
  // Un cero en dynamicStats puede proceder de una migración antigua mientras
  // las estadísticas históricas siguen en PlayerStats. Preferimos el primer
  // valor positivo disponible para no ocultar datos ya registrados.
  const statCount = (...values: unknown[]) => {
    for (const value of values) {
      const number = Number(value);
      if (Number.isFinite(number) && number > 0) return Math.max(0, Math.round(number));
    }
    return 0;
  };
  const seasonAppearances = statCount(seasonStats?.seasonAppearances, storedPlayerStats?.appearances, player?.appearances);
  const seasonMinutes = statCount(seasonStats?.seasonMinutes, seasonAppearances * 90);
  const seasonGoals = statCount(seasonStats?.seasonGoals, storedPlayerStats?.goals, player?.goals);
  const seasonAssists = statCount(seasonStats?.seasonAssists, storedPlayerStats?.assists, player?.assists);
  const ratingCount = Math.max(0, Number(seasonStats?.seasonRatingCount ?? 0) || 0);
  const rawSeasonAverage = Number(seasonStats?.seasonAverageRating);
  const seasonAverage = (ratingCount > 0 || seasonAppearances > 0) && Number.isFinite(rawSeasonAverage) && rawSeasonAverage > 0
    ? rawSeasonAverage.toFixed(2)
    : "—";
  const seasonCleanSheets = statCount(seasonStats?.seasonCleanSheets, storedPlayerStats?.cleanSheets);
  const seasonMvpCount = statCount(seasonStats?.seasonMVPs, storedPlayerStats?.motm);
  const isGoalkeeper = roleFromPosition(player?.positions?.[0] ?? "MC") === "GK";

  return (
    <Dialog open={!!player} onOpenChange={onOpenChange}>
      <DialogContent className="match-player-dialog max-h-[88vh] overflow-y-auto sm:max-w-lg">
        {player && (
          <>
            <DialogHeader>
              <DialogTitle className="sr-only">Ficha de {player.name}</DialogTitle>
              <DialogDescription className="sr-only">Datos del jugador seleccionado durante el partido.</DialogDescription>
            </DialogHeader>
            <div className="match-player-profile-head relative -mx-6 -mt-6 overflow-hidden px-6 pb-5 pt-6">
              <div className="match-player-profile-aura" aria-hidden="true" />
              <div className="relative flex items-center gap-4">
                <div className="match-player-profile-face">
                  <PlayerFace name={player.name} image={faceUrl(player.id, player.cardImage)} role={roleFromPosition(player.positions?.[0] ?? "MC")} size={76} showRing={false} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-[0.6rem] font-black uppercase tracking-[0.16em] text-white/55">
                    <TeamLogo teamName={teamName} leagueName={teamLeagueName} size={20} />
                    <span>{teamName}</span>
                  </div>
                  <div className="flex min-w-0 items-baseline gap-2">
                    <h2 className="min-w-0 truncate text-xl font-black leading-tight text-white sm:text-2xl">{player.name}</h2>
                    {phase === "preview" && <span className="shrink-0 text-[0.65rem] font-medium leading-none text-white/55">{player.age} años</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(player.positions ?? []).slice(0, 4).map((position) => <span key={position} className="match-player-position-chip">{position}</span>)}
                  </div>
                </div>
                <div className="match-player-overall shrink-0">
                  <span>{Math.round(Number(player.rating) || 0)}</span>
                  <small>MEDIA</small>
                </div>
              </div>
            </div>

            {phase === "preview" ? (
              <section aria-label="Estadísticas de la temporada" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="match-player-metric"><CalendarDays className="h-4 w-4" /><span>Partidos</span><strong>{seasonAppearances}</strong></div>
                <div className="match-player-metric"><Activity className="h-4 w-4" /><span>Minutos</span><strong>{seasonMinutes.toLocaleString("es-ES")}</strong></div>
                <div className="match-player-metric"><Star className="h-4 w-4" /><span>Media</span><strong>{seasonAverage}</strong></div>
                <div className="match-player-metric"><Goal className="h-4 w-4" /><span>Goles</span><strong>{seasonGoals}</strong></div>
                <div className="match-player-metric"><Footprints className="h-4 w-4" /><span>Asistencias</span><strong>{seasonAssists}</strong></div>
                {isGoalkeeper && <div className="match-player-metric"><ShieldCheck className="h-4 w-4" /><span>Porterías a 0</span><strong>{seasonCleanSheets}</strong></div>}
                <div className="match-player-metric"><Star className="h-4 w-4" /><span>MVP</span><strong>{seasonMvpCount}</strong></div>
              </section>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="match-player-metric"><CalendarDays className="h-4 w-4" /><span>Edad</span><strong>{player.age}</strong></div>
                <div className="match-player-metric"><TrendingUp className="h-4 w-4" /><span>Potencial</span><strong>{Math.round(Number(player.potential) || Number(player.rating) || 0)}</strong></div>
                <div className="match-player-metric"><Goal className="h-4 w-4" /><span>Goles temporada</span><strong>{Math.max(0, Math.round(Number(player.goals) || 0))}</strong></div>
                <div className="match-player-metric"><Footprints className="h-4 w-4" /><span>Asistencias</span><strong>{Math.max(0, Math.round(Number(player.assists) || 0))}</strong></div>
              </div>
            )}

            {phase !== "preview" && (
              <section className="match-player-match-section">
                <div className="mb-3 flex items-center gap-2 text-[0.62rem] font-black uppercase tracking-[0.16em] text-muted-foreground">
                  <Activity className="h-4 w-4 text-primary" /> Rendimiento en este partido
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="match-player-match-stat"><span>Valoración</span><strong>{matchInfo?.rating != null ? Number(matchInfo.rating).toFixed(1) : "—"}</strong></div>
                  <div className="match-player-match-stat"><span>Goles</span><strong>{matchInfo?.goals ?? 0}</strong></div>
                  <div className="match-player-match-stat"><span>Asistencias</span><strong>{matchInfo?.assists ?? 0}</strong></div>
                  <div className="match-player-match-stat"><span>Energía</span><strong>{energy != null ? `${Math.round(energy)}%` : "—"}</strong></div>
                </div>
                {(matchInfo?.hasRed || matchInfo?.hasYellow) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {matchInfo.hasYellow && <span className="match-player-discipline-chip is-yellow"><ShieldCheck className="h-3.5 w-3.5" /> Amarilla</span>}
                    {matchInfo.hasRed && <span className="match-player-discipline-chip is-red"><ShieldCheck className="h-3.5 w-3.5" /> Expulsado</span>}
                  </div>
                )}
              </section>
            )}

            {phase !== "preview" && (
              <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/25 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                <Star className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <span>La media y el potencial corresponden a la ficha del jugador. La valoración del partido se muestra cuando el motor dispone de una nota calculada.</span>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
