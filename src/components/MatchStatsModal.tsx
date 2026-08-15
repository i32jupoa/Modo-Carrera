import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TeamLogo } from "@/components/TeamLogo";
import { teamById, LEAGUES } from "@/data/teams";
import { usePlayersStore } from "@/store/playersStore";
import { Trophy, Target, AlertTriangle, Star, TrendingUp, Clock, Shield } from "lucide-react";
import type { Fixture } from "@/lib/season";

interface MatchStatsModalProps {
  fixture: Fixture | null;
  onClose: () => void;
}

export function MatchStatsModal({ fixture, onClose }: MatchStatsModalProps) {
  if (!fixture || !fixture.result) return null;

  const home = teamById(fixture.homeId);
  const away = teamById(fixture.awayId);
  const result = fixture.result;
  const store = usePlayersStore();

  if (!home || !away) return null;

  // Get player ratings
  const homeRatings = (result.ratings || []).filter(r => {
    const player = store.getSimPlayer(r.playerId);
    return player?.teamId === fixture.homeId;
  });

  const awayRatings = (result.ratings || []).filter(r => {
    const player = store.getSimPlayer(r.playerId);
    return player?.teamId === fixture.awayId;
  });

  // Get goals by team
  const homeGoals = (result.events || []).filter(e => e.type === "goal" && e.team === "home");
  const awayGoals = (result.events || []).filter(e => e.type === "goal" && e.team === "away");

  // Get cards by team
  const homeCards = (result.cards || []).filter(c => {
    const player = store.getSimPlayer(c.playerId);
    return player?.teamId === fixture.homeId;
  });

  const awayCards = (result.cards || []).filter(c => {
    const player = store.getSimPlayer(c.playerId);
    return player?.teamId === fixture.awayId;
  });

  // Get injuries by team
  const homeInjuries = (result.injuries || []).filter(i => {
    const player = store.getSimPlayer(i.playerId);
    return player?.teamId === fixture.homeId;
  });

  const awayInjuries = (result.injuries || []).filter(i => {
    const player = store.getSimPlayer(i.playerId);
    return player?.teamId === fixture.awayId;
  });

  const getLeagueName = (leagueId: string): string => {
    return LEAGUES[leagueId]?.name || leagueId;
  };

  return (
    <Dialog open={!!fixture} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={40} />
            <span className="text-2xl font-bold">
              {result.homeGoals} - {result.awayGoals}
            </span>
            <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={40} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Match Info */}
          <div className="flex items-center justify-between text-sm text-muted-foreground border-b pb-4">
            <div>
              <span className="font-semibold text-foreground">{home.name}</span> vs {away.name}
            </div>
            <div>
              {fixture.competition === "league" && `Jornada ${fixture.matchday}`}
              {fixture.competition === "cup" && fixture.round}
              {fixture.competition === "ucl" && (fixture.round || "Fase de Liga")}
            </div>
          </div>

          {/* Extra Time / Penalties Info */}
          {(result.extraTime || result.penalties) && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm">
              {result.extraTime && (
                <div className="flex items-center gap-2 text-amber-700">
                  <Clock className="w-4 h-4" />
                  <span>Prórroga: {result.extraTime.homeGoals} - {result.extraTime.awayGoals}</span>
                </div>
              )}
              {result.penalties && (
                <div className="flex items-center gap-2 text-amber-700">
                  <Target className="w-4 h-4" />
                  <span>Penaltis: {result.penalties.homeGoals} - {result.penalties.awayGoals}</span>
                </div>
              )}
            </div>
          )}

          {/* Expected Goals */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-semibold">xG</span>
              </div>
              <div className="text-2xl font-bold">
                {result.xgHome.toFixed(2)} - {result.xgAway.toFixed(2)}
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Star className="w-4 h-4 text-yellow-500" />
                <span className="text-sm font-semibold">MVP</span>
              </div>
              <div className="text-lg font-semibold">
                {result.mvp ? (() => {
                  const player = store.getSimPlayer(result.mvp.playerId);
                  return player ? `${player.name} (${result.mvp.rating.toFixed(1)})` : "N/A";
                })() : "N/A"}
              </div>
            </div>
          </div>

          {/* Goals */}
          <div className="space-y-4">
            <h3 className="font-bold flex items-center gap-2">
              <Target className="w-4 h-4" />
              Goles
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-muted-foreground">{home.name}</div>
                {homeGoals.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Sin goles</div>
                ) : (
                  homeGoals.map((goal, idx) => {
                    const scorer = store.getSimPlayer(goal.scorerId);
                    const assister = goal.assistId ? store.getSimPlayer(goal.assistId) : null;
                    return (
                      <div key={idx} className="text-sm flex items-center gap-2">
                        <span className="font-medium">{scorer?.name || goal.scorerName || "Desconocido"}</span>
                        {assister && <span className="text-muted-foreground">(asist: {assister.name || goal.assistName})</span>}
                        <span className="text-muted-foreground text-xs">{goal.minute}'</span>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-muted-foreground">{away.name}</div>
                {awayGoals.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Sin goles</div>
                ) : (
                  awayGoals.map((goal, idx) => {
                    const scorer = store.getSimPlayer(goal.scorerId);
                    const assister = goal.assistId ? store.getSimPlayer(goal.assistId) : null;
                    return (
                      <div key={idx} className="text-sm flex items-center gap-2">
                        <span className="font-medium">{scorer?.name || goal.scorerName || "Desconocido"}</span>
                        {assister && <span className="text-muted-foreground">(asist: {assister.name || goal.assistName})</span>}
                        <span className="text-muted-foreground text-xs">{goal.minute}'</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Cards */}
          <div className="space-y-4">
            <h3 className="font-bold flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Tarjetas
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-muted-foreground">{home.name}</div>
                {homeCards.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Sin tarjetas</div>
                ) : (
                  homeCards.map((card, idx) => {
                    const player = store.getSimPlayer(card.playerId);
                    return (
                      <div key={idx} className="text-sm flex items-center gap-2">
                        <span className="font-medium">{player?.name || card.playerName || "Desconocido"}</span>
                        <span className={`px-2 py-0.5 rounded text-xs ${card.cardType === "yellow" ? "bg-yellow-500/20 text-yellow-700" : "bg-red-500/20 text-red-700"}`}>
                          {card.cardType === "yellow" ? "Amarilla" : "Roja"}
                        </span>
                        <span className="text-muted-foreground text-xs">{card.minute}'</span>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-muted-foreground">{away.name}</div>
                {awayCards.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Sin tarjetas</div>
                ) : (
                  awayCards.map((card, idx) => {
                    const player = store.getSimPlayer(card.playerId);
                    return (
                      <div key={idx} className="text-sm flex items-center gap-2">
                        <span className="font-medium">{player?.name || card.playerName || "Desconocido"}</span>
                        <span className={`px-2 py-0.5 rounded text-xs ${card.cardType === "yellow" ? "bg-yellow-500/20 text-yellow-700" : "bg-red-500/20 text-red-700"}`}>
                          {card.cardType === "yellow" ? "Amarilla" : "Roja"}
                        </span>
                        <span className="text-muted-foreground text-xs">{card.minute}'</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Injuries */}
          {(homeInjuries.length > 0 || awayInjuries.length > 0) && (
            <div className="space-y-4">
              <h3 className="font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Lesiones
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-muted-foreground">{home.name}</div>
                  {homeInjuries.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Sin lesiones</div>
                  ) : (
                    homeInjuries.map((injury, idx) => {
                      const player = store.getSimPlayer(injury.playerId);
                      return (
                        <div key={idx} className="text-sm flex items-center gap-2">
                          <span className="font-medium">{player?.name || "Desconocido"}</span>
                          <span className="text-muted-foreground text-xs">{injury.reason}</span>
                          <span className="text-muted-foreground text-xs">{injury.minute}'</span>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-muted-foreground">{away.name}</div>
                  {awayInjuries.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Sin lesiones</div>
                  ) : (
                    awayInjuries.map((injury, idx) => {
                      const player = store.getSimPlayer(injury.playerId);
                      return (
                        <div key={idx} className="text-sm flex items-center gap-2">
                          <span className="font-medium">{player?.name || "Desconocido"}</span>
                          <span className="text-muted-foreground text-xs">{injury.reason}</span>
                          <span className="text-muted-foreground text-xs">{injury.minute}'</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Player Ratings */}
          <div className="space-y-4">
            <h3 className="font-bold flex items-center gap-2">
              <Star className="w-4 h-4" />
              Valoraciones
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-muted-foreground">{home.name}</div>
                {homeRatings.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Sin valoraciones</div>
                ) : (
                  <div className="space-y-1">
                    {homeRatings
                      .sort((a, b) => b.rating - a.rating)
                      .map((rating) => {
                        const player = store.getSimPlayer(rating.playerId);
                        return (
                          <div key={rating.playerId} className="text-sm flex items-center justify-between">
                            <span className="font-medium">{player?.name || "Desconocido"}</span>
                            <span className={`font-bold ${rating.rating >= 7 ? "text-green-600" : rating.rating >= 5 ? "text-yellow-600" : "text-red-600"}`}>
                              {rating.rating.toFixed(1)}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-muted-foreground">{away.name}</div>
                {awayRatings.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Sin valoraciones</div>
                ) : (
                  <div className="space-y-1">
                    {awayRatings
                      .sort((a, b) => b.rating - a.rating)
                      .map((rating) => {
                        const player = store.getSimPlayer(rating.playerId);
                        return (
                          <div key={rating.playerId} className="text-sm flex items-center justify-between">
                            <span className="font-medium">{player?.name || "Desconocido"}</span>
                            <span className={`font-bold ${rating.rating >= 7 ? "text-green-600" : rating.rating >= 5 ? "text-yellow-600" : "text-red-600"}`}>
                              {rating.rating.toFixed(1)}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
