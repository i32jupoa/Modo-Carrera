import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TeamLogo } from "@/components/TeamLogo";
import { MiniPitch } from "@/components/MiniPitch";
import { teamById, LEAGUES } from "@/data/teams";
import { usePlayersStore } from "@/store/playersStore";
import { Trophy, Target, AlertTriangle, Star, TrendingUp, Clock, Shield, Circle, Zap, XCircle, RefreshCw, UserMinus, UserPlus } from "lucide-react";
import type { Fixture } from "@/lib/season";
import type { Player } from "@/data/players";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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

  // Get players who played the match (have ratings) - these are the starting XI + subs
  const homePlayers = homeRatings.map(r => store.getSimPlayer(r.playerId)).filter((p): p is Player => p !== undefined);
  const awayPlayers = awayRatings.map(r => store.getSimPlayer(r.playerId)).filter((p): p is Player => p !== undefined);

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

  // Highlight types to keep in chronicle (like match.tsx)
  const KEEP: Record<string, { icon: string; label: string }> = {
    woodwork: { icon: "🥅", label: "Al palo" },
    penalty_missed: { icon: "❌", label: "Penalti fallado" },
    var_disallowed: { icon: "📺", label: "Gol anulado (VAR)" },
    injury: { icon: "🚑", label: "Lesión" },
    forced_sub: { icon: "🔁", label: "Cambio forzado" },
    save: { icon: "🧤", label: "Parada" },
  };

  // Combine all match events chronologically for the chronicle (like match.tsx)
  const chronicleEvents = (() => {
    const usedSaves: number[] = [];
    const filteredHighlights = (result.highlights || []).filter((h: any) => {
      if (!KEEP[h.type]) return false;
      if (h.type === "save") {
        if (h.detail !== "¡Paradón!" || usedSaves.length >= 3) return false;
        usedSaves.push(h.minute);
      }
      return true;
    });

    const items = [
      ...(result.cards || []).map((c: any) => ({ kind: "card" as const, minute: c.minute, data: c })),
      ...(result.events || []).filter((e: any) => 
        e.type === "goal" || e.type === "penalty_goal" || e.type === "free_kick_goal" || e.type === "own_goal" || e.type === "penalty"
      ).map((e: any) => ({ kind: "goal" as const, minute: e.minute, data: e })),
      ...filteredHighlights.map((h: any) => ({ kind: "highlight" as const, minute: h.minute, data: h })),
      ...(result.substitutions || []).map((s: any) => ({ kind: "sub" as const, minute: s.minute, data: s })),
    ].sort((a, b) => b.minute - a.minute);

    return items;
  })();

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

        <Tabs defaultValue="stats" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="stats">Estadísticas</TabsTrigger>
            <TabsTrigger value="chronicle">Crónica</TabsTrigger>
            <TabsTrigger value="lineups">Alineaciones</TabsTrigger>
          </TabsList>

          <TabsContent value="stats" className="space-y-6">
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

            {/* Detailed Stats */}
            {result.stats ? (
              <div className="space-y-4">
                {/* Possession */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={24} />
                      <span className="font-semibold">{result.stats.home.possession}%</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">Posesión</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{result.stats.away.possession}%</span>
                      <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={24} />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{ width: `${result.stats.home.possession}%`, backgroundColor: home.color || '#3b82f6' }}
                    />
                    <div
                      className="h-full"
                      style={{ width: `${result.stats.away.possession}%`, backgroundColor: away.color || '#ef4444' }}
                    />
                  </div>
                </div>

                {/* Shots */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={24} />
                      <span className="font-semibold text-2xl">{result.stats.home.shots}</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">Tiros</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-2xl">{result.stats.away.shots}</span>
                      <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={24} />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{ width: `${(result.stats.home.shots / (result.stats.home.shots + result.stats.away.shots)) * 100}%`, backgroundColor: home.color || '#3b82f6' }}
                    />
                    <div
                      className="h-full"
                      style={{ width: `${(result.stats.away.shots / (result.stats.home.shots + result.stats.away.shots)) * 100}%`, backgroundColor: away.color || '#ef4444' }}
                    />
                  </div>
                </div>

                {/* Shots on Target */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={24} />
                      <span className="font-semibold text-2xl">{result.stats.home.shotsOnTarget}</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">Tiros a puerta</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-2xl">{result.stats.away.shotsOnTarget}</span>
                      <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={24} />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{ width: `${(result.stats.home.shotsOnTarget / (result.stats.home.shotsOnTarget + result.stats.away.shotsOnTarget)) * 100}%`, backgroundColor: home.color || '#3b82f6' }}
                    />
                    <div
                      className="h-full"
                      style={{ width: `${(result.stats.away.shotsOnTarget / (result.stats.home.shotsOnTarget + result.stats.away.shotsOnTarget)) * 100}%`, backgroundColor: away.color || '#ef4444' }}
                    />
                  </div>
                </div>

                {/* Corners */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={24} />
                      <span className="font-semibold text-2xl">{result.stats.home.corners}</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">Córners</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-2xl">{result.stats.away.corners}</span>
                      <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={24} />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{ width: `${(result.stats.home.corners / (result.stats.home.corners + result.stats.away.corners)) * 100}%`, backgroundColor: home.color || '#3b82f6' }}
                    />
                    <div
                      className="h-full"
                      style={{ width: `${(result.stats.away.corners / (result.stats.home.corners + result.stats.away.corners)) * 100}%`, backgroundColor: away.color || '#ef4444' }}
                    />
                  </div>
                </div>

                {/* Fouls */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={24} />
                      <span className="font-semibold text-2xl">{result.stats.home.fouls}</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">Faltas</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-2xl">{result.stats.away.fouls}</span>
                      <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={24} />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{ width: `${(result.stats.home.fouls / (result.stats.home.fouls + result.stats.away.fouls)) * 100}%`, backgroundColor: home.color || '#3b82f6' }}
                    />
                    <div
                      className="h-full"
                      style={{ width: `${(result.stats.away.fouls / (result.stats.home.fouls + result.stats.away.fouls)) * 100}%`, backgroundColor: away.color || '#ef4444' }}
                    />
                  </div>
                </div>

                {/* Offsides */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={24} />
                      <span className="font-semibold text-2xl">{result.stats.home.offsides}</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">Fueras de juego</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-2xl">{result.stats.away.offsides}</span>
                      <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={24} />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{ width: `${(result.stats.home.offsides / (result.stats.home.offsides + result.stats.away.offsides)) * 100}%`, backgroundColor: home.color || '#3b82f6' }}
                    />
                    <div
                      className="h-full"
                      style={{ width: `${(result.stats.away.offsides / (result.stats.home.offsides + result.stats.away.offsides)) * 100}%`, backgroundColor: away.color || '#ef4444' }}
                    />
                  </div>
                </div>

                {/* Pass Accuracy */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={24} />
                      <span className="font-semibold">{result.stats.home.passAccuracy}%</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">Precisión pase</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{result.stats.away.passAccuracy}%</span>
                      <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={24} />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{ width: `${result.stats.home.passAccuracy}%`, backgroundColor: home.color || '#3b82f6' }}
                    />
                    <div
                      className="h-full"
                      style={{ width: `${result.stats.away.passAccuracy}%`, backgroundColor: away.color || '#ef4444' }}
                    />
                  </div>
                </div>

                {/* Saves */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={24} />
                      <span className="font-semibold text-2xl">{result.stats.home.saves}</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">Paradas</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-2xl">{result.stats.away.saves}</span>
                      <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={24} />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{ width: `${(result.stats.home.saves / (result.stats.home.saves + result.stats.away.saves)) * 100}%`, backgroundColor: home.color || '#3b82f6' }}
                    />
                    <div
                      className="h-full"
                      style={{ width: `${(result.stats.away.saves / (result.stats.home.saves + result.stats.away.saves)) * 100}%`, backgroundColor: away.color || '#ef4444' }}
                    />
                  </div>
                </div>

                {/* xG */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={24} />
                      <span className="font-semibold text-2xl">{result.stats.home.xg.toFixed(2)}</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">xG en vivo</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-2xl">{result.stats.away.xg.toFixed(2)}</span>
                      <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={24} />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{ width: `${(result.stats.home.xg / (result.stats.home.xg + result.stats.away.xg)) * 100}%`, backgroundColor: home.color || '#3b82f6' }}
                    />
                    <div
                      className="h-full"
                      style={{ width: `${(result.stats.away.xg / (result.stats.home.xg + result.stats.away.xg)) * 100}%`, backgroundColor: away.color || '#ef4444' }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                Las estadísticas detalladas no están disponibles para este partido
              </div>
            )}
          </TabsContent>

          <TabsContent value="chronicle" className="space-y-6">
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

            {/* Match Chronicle */}
            <div className="space-y-4">
              <h3 className="font-bold flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Crónica del partido
              </h3>
              {chronicleEvents.length === 0 ? (
                <div className="text-sm text-muted-foreground">Sin eventos registrados</div>
              ) : (
                <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
                  {chronicleEvents.map((item, i) => {
                    const teamOf = (t: string) => (t === "home" ? home : away);
                    if (item.kind === "card") {
                      const card = item.data;
                      const cardTeam = teamOf(card.team);
                      const cardText = card.isSecondYellow ? "2ª amarilla → roja" : card.cardType === "yellow" ? "Tarjeta amarilla" : "Tarjeta roja";
                      return (
                        <div key={`card-${i}`} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                          <span className="text-sm text-primary font-bold w-10">{card.minute}'</span>
                          <span className={`w-5 h-3 rounded-sm shrink-0 ${card.cardType === 'yellow' ? 'bg-yellow-400' : 'bg-red-500'}`} />
                          <TeamLogo teamName={cardTeam.name} leagueName={getLeagueName(cardTeam.league)} size={22} />
                          <div className="text-sm min-w-0">
                            <span className="font-bold">{card.playerName}</span>
                            <span className="text-muted-foreground"> · {cardText}</span>
                            <span className="text-muted-foreground"> ({cardTeam.short})</span>
                          </div>
                        </div>
                      );
                    }
                    if (item.kind === "sub") {
                      const s = item.data;
                      const subTeam = teamOf(s.team);
                      return (
                        <div key={`sub-${i}`} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                          <span className="text-sm text-primary font-bold w-10">{s.minute}'</span>
                          <span className="text-base w-5 text-center shrink-0">🔄</span>
                          <TeamLogo teamName={subTeam.name} leagueName={getLeagueName(subTeam.league)} size={22} />
                          <div className="text-sm min-w-0 truncate">
                            <span className="text-primary font-bold">{s.playerInName}</span>
                            <span className="text-muted-foreground"> por </span>
                            <span className="text-destructive">{s.playerOutName}</span>
                            <span className="text-muted-foreground"> ({subTeam.short})</span>
                          </div>
                        </div>
                      );
                    }
                    if (item.kind === "highlight") {
                      const h = item.data;
                      const hTeam = teamOf(h.team);
                      const meta = KEEP[h.type];
                      return (
                        <div key={`hl-${i}`} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                          <span className="text-sm text-muted-foreground font-bold w-10">{h.minute}'</span>
                          <span className="text-base w-5 text-center shrink-0">{meta.icon}</span>
                          <TeamLogo teamName={hTeam.name} leagueName={getLeagueName(hTeam.league)} size={22} />
                          <div className="text-sm min-w-0 truncate">
                            <span className="font-semibold">{h.playerName}</span>
                            <span className="text-muted-foreground"> · {h.detail || meta.label}</span>
                            <span className="text-muted-foreground"> ({hTeam.short})</span>
                          </div>
                        </div>
                      );
                    }
                    const e = item.data;
                    const scoringTeam = teamOf(e.team);
                    const isPenalty = e.type === 'penalty' || e.type === 'penalty_goal';
                    const isFreeKick = e.type === 'free_kick_goal';
                    const isOwnGoal = e.type === 'own_goal';
                    return (
                      <div key={`goal-${i}`} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                        <span className="text-sm text-primary font-bold w-10">{e.minute}'</span>
                        <span className="text-lg">
                          {isPenalty ? <span className="px-1.5 py-0.5 text-[0.8rem] font-bold rounded bg-white/6">P</span> : <span className="w-3 h-3 inline-block rounded-full bg-white/80" />}
                        </span>
                        <TeamLogo teamName={scoringTeam.name} leagueName={getLeagueName(scoringTeam.league)} size={22} />
                        <div className="text-sm min-w-0">
                          <span className="font-bold">{e.scorerName}</span>
                          {e.assistName && <span className="text-muted-foreground"> (asist: {e.assistName})</span>}
                          <span className="text-muted-foreground"> ({scoringTeam.short})</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="lineups">
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

              {/* MVP */}
              {result.mvp && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <Star className="w-5 h-5 text-yellow-500" />
                    <div>
                      <div className="font-bold text-yellow-700">MVP del partido</div>
                      <div className="text-sm">
                        {(() => {
                          const player = store.getSimPlayer(result.mvp.playerId);
                          return player ? `${player.name} (${result.mvp.rating.toFixed(1)})` : "N/A";
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Lineups */}
              {homePlayers.length > 0 && awayPlayers.length > 0 ? (
                <div className="grid grid-cols-2 gap-6">
                  {/* Home Team Lineup */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={32} />
                      <div>
                        <h3 className="font-bold">{home.name}</h3>
                        <p className="text-sm text-muted-foreground">Titulares y suplentes</p>
                      </div>
                    </div>
                    <MiniPitch
                      startingXI={homePlayers.slice(0, 11)}
                      formation={result.homeFormation || "Táctica 4-3-3"}
                      teamId={fixture.homeId}
                      cards={result.cards || []}
                      ratings={homeRatings}
                      goals={result.events || []}
                      assists={result.events || []}
                      mvp={result.mvp?.playerId}
                      injuries={result.injuries || []}
                      substitutions={result.substitutions || []}
                    />
                    {/* Substitutes */}
                    {homePlayers.length > 11 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-semibold mb-2">Suplentes</h4>
                        <div className="space-y-1">
                          {homePlayers.slice(11).map((player) => {
                            const rating = homeRatings.find(r => r.playerId === player.id);
                            return (
                              <div key={player.id} className="text-sm flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{player.name}</span>
                                  <span className="text-muted-foreground text-xs">({player.positions.join(", ")})</span>
                                </div>
                                {rating && (
                                  <span className={`font-bold text-sm ${rating.rating >= 7 ? "text-green-600" : rating.rating >= 5 ? "text-yellow-600" : "text-red-600"}`}>
                                    {rating.rating.toFixed(1)}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {/* Player Ratings */}
                    <div className="mt-4">
                      <h4 className="text-sm font-semibold mb-2">Notas del partido</h4>
                      <div className="space-y-1">
                        {homeRatings
                          .sort((a, b) => b.rating - a.rating)
                          .map((rating) => {
                            const player = store.getSimPlayer(rating.playerId);
                            const isMvp = result.mvp?.playerId === rating.playerId;
                            return (
                              <div key={rating.playerId} className="text-sm flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  {isMvp && <Star className="w-3 h-3 text-yellow-500" />}
                                  <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={16} />
                                  <span className="font-medium">{player?.name || "Desconocido"}</span>
                                </div>
                                <span className={`font-bold ${rating.rating >= 7 ? "text-green-600" : rating.rating >= 5 ? "text-yellow-600" : "text-red-600"}`}>
                                  {rating.rating.toFixed(1)}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>

                  {/* Away Team Lineup */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={32} />
                      <div>
                        <h3 className="font-bold">{away.name}</h3>
                        <p className="text-sm text-muted-foreground">Titulares y suplentes</p>
                      </div>
                    </div>
                    <MiniPitch
                      startingXI={awayPlayers.slice(0, 11)}
                      formation={result.awayFormation || "Táctica 4-3-3"}
                      teamId={fixture.awayId}
                      cards={result.cards || []}
                      ratings={awayRatings}
                      goals={result.events || []}
                      assists={result.events || []}
                      mvp={result.mvp?.playerId}
                      injuries={result.injuries || []}
                      substitutions={result.substitutions || []}
                    />
                    {/* Substitutes */}
                    {awayPlayers.length > 11 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-semibold mb-2">Suplentes</h4>
                        <div className="space-y-1">
                          {awayPlayers.slice(11).map((player) => {
                            const rating = awayRatings.find(r => r.playerId === player.id);
                            return (
                              <div key={player.id} className="text-sm flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{player.name}</span>
                                  <span className="text-muted-foreground text-xs">({player.positions.join(", ")})</span>
                                </div>
                                {rating && (
                                  <span className={`font-bold text-sm ${rating.rating >= 7 ? "text-green-600" : rating.rating >= 5 ? "text-yellow-600" : "text-red-600"}`}>
                                    {rating.rating.toFixed(1)}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {/* Player Ratings */}
                    <div className="mt-4">
                      <h4 className="text-sm font-semibold mb-2">Notas del partido</h4>
                      <div className="space-y-1">
                        {awayRatings
                          .sort((a, b) => b.rating - a.rating)
                          .map((rating) => {
                            const player = store.getSimPlayer(rating.playerId);
                            const isMvp = result.mvp?.playerId === rating.playerId;
                            return (
                              <div key={rating.playerId} className="text-sm flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  {isMvp && <Star className="w-3 h-3 text-yellow-500" />}
                                  <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={16} />
                                  <span className="font-medium">{player?.name || "Desconocido"}</span>
                                </div>
                                <span className={`font-bold ${rating.rating >= 7 ? "text-green-600" : rating.rating >= 5 ? "text-yellow-600" : "text-red-600"}`}>
                                  {rating.rating.toFixed(1)}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  Las alineaciones no están disponibles para este partido
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
