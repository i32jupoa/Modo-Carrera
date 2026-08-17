import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TeamLogo } from "@/components/TeamLogo";
import { MiniPitch } from "@/components/MiniPitch";
import { teamById, LEAGUES } from "@/data/teams";
import { usePlayersStore } from "@/store/playersStore";
import { Trophy, Target, AlertTriangle, Star, TrendingUp, Clock, Shield, Circle, Zap, XCircle, RefreshCw, UserMinus, UserPlus } from "lucide-react";
import type { Fixture } from "@/lib/season";
import type { Player } from "@/data/players";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { loadSave, getStartersWithFormation } from "@/lib/store";
import type { FormationName } from "@/lib/formations";

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
  const save = loadSave();

  if (!home || !away) return null;

  // Generate basic stats if not available
  const stats = result.stats || {
    home: {
      possession: 50,
      shots: result.events?.filter(e => e.team === 'home' && e.type === 'goal').length * 3 || 0,
      shotsOnTarget: result.events?.filter(e => e.team === 'home' && e.type === 'goal').length || 0,
      corners: Math.floor(Math.random() * 8) + 2,
      fouls: Math.floor(Math.random() * 15) + 5,
      offsides: Math.floor(Math.random() * 5) + 1,
      passAccuracy: 75 + Math.floor(Math.random() * 20),
      saves: Math.floor(Math.random() * 5) + 1,
      xg: result.xgHome || 0,
    },
    away: {
      possession: 50,
      shots: result.events?.filter(e => e.team === 'away' && e.type === 'goal').length * 3 || 0,
      shotsOnTarget: result.events?.filter(e => e.team === 'away' && e.type === 'goal').length || 0,
      corners: Math.floor(Math.random() * 8) + 2,
      fouls: Math.floor(Math.random() * 15) + 5,
      offsides: Math.floor(Math.random() * 5) + 1,
      passAccuracy: 75 + Math.floor(Math.random() * 20),
      saves: Math.floor(Math.random() * 5) + 1,
      xg: result.xgAway || 0,
    },
  };

  // Get player ratings - generate basic ratings if not available
  const generateBasicRatings = (players: Player[], teamId: string) => {
    return players.map(p => ({
      playerId: p.id,
      rating: 6.0 + Math.random() * 2.0, // 6.0 - 8.0
      teamId: p.teamId,
    }));
  };

  const homeRatings = (result.ratings || []).filter(r => {
    const player = store.getSimPlayer(r.playerId);
    return player?.teamId === fixture.homeId;
  });

  const awayRatings = (result.ratings || []).filter(r => {
    const player = store.getSimPlayer(r.playerId);
    return player?.teamId === fixture.awayId;
  });

  // Get players who played the match - use lineup data if available, otherwise use ratings, otherwise generate basic lineup
  const getBasicLineup = (teamId: string): { players: Player[]; formation: FormationName } => {
    if (save) {
      const { players, formation } = getStartersWithFormation(save, teamId);
      return { players, formation };
    }
    // Fallback if save is not available
    const getSimSquad = usePlayersStore.getState().getSimSquad;
    const squad = getSimSquad(teamId);
    // Sort by rating and take top 11
    return { players: squad.sort((a, b) => b.rating - a.rating).slice(0, 11), formation: "Táctica 4-4-2" };
  };

  const homeLineupData = (result.homeLineup && result.homeLineup.length > 0)
    ? { players: result.homeLineup, formation: (result.homeFormation || "Táctica 4-4-2") as FormationName }
    : homeRatings.length > 0
    ? { players: homeRatings.map(r => store.getSimPlayer(r.playerId)).filter((p): p is Player => p !== undefined), formation: (result.homeFormation || "Táctica 4-4-2") as FormationName }
    : getBasicLineup(fixture.homeId);

  const awayLineupData = (result.awayLineup && result.awayLineup.length > 0)
    ? { players: result.awayLineup, formation: (result.awayFormation || "Táctica 4-4-2") as FormationName }
    : awayRatings.length > 0
    ? { players: awayRatings.map(r => store.getSimPlayer(r.playerId)).filter((p): p is Player => p !== undefined), formation: (result.awayFormation || "Táctica 4-4-2") as FormationName }
    : getBasicLineup(fixture.awayId);

  const homePlayers = homeLineupData.players;
  const awayPlayers = awayLineupData.players;
  const homeFormation = homeLineupData.formation;
  const awayFormation = awayLineupData.formation;

  // Use generated ratings if no ratings exist
  const finalHomeRatings = homeRatings.length > 0 ? homeRatings : generateBasicRatings(homePlayers, fixture.homeId);
  const finalAwayRatings = awayRatings.length > 0 ? awayRatings : generateBasicRatings(awayPlayers, fixture.awayId);

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

  // Generate basic events for chronicle if no events exist (for old simulated matches)
  const generateBasicEvents = () => {
    if ((result.events || []).length > 0) return chronicleEvents;
    
    const basicEvents = [];
    const goals = result.homeGoals + result.awayGoals;
    
    // Generate goal events based on score
    for (let i = 0; i < result.homeGoals; i++) {
      const minute = Math.floor(Math.random() * 90) + 1;
      const scorer = homePlayers[Math.floor(Math.random() * Math.min(11, homePlayers.length))];
      basicEvents.push({
        kind: "goal" as const,
        minute,
        data: {
          minute,
          team: "home",
          type: "goal",
          scorerId: scorer?.id,
          scorerName: scorer?.name || "Jugador",
          assistName: null,
        }
      });
    }
    
    for (let i = 0; i < result.awayGoals; i++) {
      const minute = Math.floor(Math.random() * 90) + 1;
      const scorer = awayPlayers[Math.floor(Math.random() * Math.min(11, awayPlayers.length))];
      basicEvents.push({
        kind: "goal" as const,
        minute,
        data: {
          minute,
          team: "away",
          type: "goal",
          scorerId: scorer?.id,
          scorerName: scorer?.name || "Jugador",
          assistName: null,
        }
      });
    }
    
    // Generate random cards (2-4 per match)
    const numCards = Math.floor(Math.random() * 3) + 2;
    for (let i = 0; i < numCards; i++) {
      const team = Math.random() > 0.5 ? "home" : "away";
      const players = team === "home" ? homePlayers : awayPlayers;
      const player = players[Math.floor(Math.random() * Math.min(11, players.length))];
      const minute = Math.floor(Math.random() * 90) + 1;
      const isYellow = Math.random() > 0.2; // 80% yellow, 20% red
      
      basicEvents.push({
        kind: "card" as const,
        minute,
        data: {
          minute,
          team,
          playerId: player?.id,
          playerName: player?.name || "Jugador",
          cardType: isYellow ? "yellow" : "red",
          isSecondYellow: false,
        }
      });
    }
    
    // Generate random substitutions (3-5 per team)
    const numSubsHome = Math.floor(Math.random() * 3) + 3;
    const numSubsAway = Math.floor(Math.random() * 3) + 3;
    
    for (let i = 0; i < numSubsHome; i++) {
      const minute = 60 + Math.floor(Math.random() * 30);
      const playerOut = homePlayers[Math.floor(Math.random() * Math.min(11, homePlayers.length))];
      const playerIn = homePlayers[11 + Math.floor(Math.random() * Math.max(0, homePlayers.length - 11))];
      
      if (playerOut && playerIn) {
        basicEvents.push({
          kind: "sub" as const,
          minute,
          data: {
            minute,
            team: "home",
            playerOutId: playerOut.id,
            playerOutName: playerOut.name,
            playerInId: playerIn.id,
            playerInName: playerIn.name,
          }
        });
      }
    }
    
    for (let i = 0; i < numSubsAway; i++) {
      const minute = 60 + Math.floor(Math.random() * 30);
      const playerOut = awayPlayers[Math.floor(Math.random() * Math.min(11, awayPlayers.length))];
      const playerIn = awayPlayers[11 + Math.floor(Math.random() * Math.max(0, awayPlayers.length - 11))];
      
      if (playerOut && playerIn) {
        basicEvents.push({
          kind: "sub" as const,
          minute,
          data: {
            minute,
            team: "away",
            playerOutId: playerOut.id,
            playerOutName: playerOut.name,
            playerInId: playerIn.id,
            playerInName: playerIn.name,
          }
        });
      }
    }
    
    return basicEvents.sort((a, b) => b.minute - a.minute);
  };

  const finalChronicleEvents = chronicleEvents.length > 0 ? chronicleEvents : generateBasicEvents();

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
            {stats ? (
              <div className="space-y-4">
                {/* Possession */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={24} />
                      <span className="font-semibold">{stats.home.possession}%</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">Posesión</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{stats.away.possession}%</span>
                      <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={24} />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{ width: `${stats.home.possession}%`, backgroundColor: home.color || '#3b82f6' }}
                    />
                    <div
                      className="h-full"
                      style={{ width: `${stats.away.possession}%`, backgroundColor: away.color || '#ef4444' }}
                    />
                  </div>
                </div>

                {/* Shots */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={24} />
                      <span className="font-semibold text-2xl">{stats.home.shots}</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">Tiros</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-2xl">{stats.away.shots}</span>
                      <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={24} />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{ width: `${(stats.home.shots / (stats.home.shots + stats.away.shots)) * 100}%`, backgroundColor: home.color || '#3b82f6' }}
                    />
                    <div
                      className="h-full"
                      style={{ width: `${(stats.away.shots / (stats.home.shots + stats.away.shots)) * 100}%`, backgroundColor: away.color || '#ef4444' }}
                    />
                  </div>
                </div>

                {/* Shots on Target */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={24} />
                      <span className="font-semibold text-2xl">{stats.home.shotsOnTarget}</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">Tiros a puerta</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-2xl">{stats.away.shotsOnTarget}</span>
                      <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={24} />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{ width: `${(stats.home.shotsOnTarget / (stats.home.shotsOnTarget + stats.away.shotsOnTarget)) * 100}%`, backgroundColor: home.color || '#3b82f6' }}
                    />
                    <div
                      className="h-full"
                      style={{ width: `${(stats.away.shotsOnTarget / (stats.home.shotsOnTarget + stats.away.shotsOnTarget)) * 100}%`, backgroundColor: away.color || '#ef4444' }}
                    />
                  </div>
                </div>

                {/* Corners */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={24} />
                      <span className="font-semibold text-2xl">{stats.home.corners}</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">Córners</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-2xl">{stats.away.corners}</span>
                      <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={24} />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{ width: `${(stats.home.corners / (stats.home.corners + stats.away.corners)) * 100}%`, backgroundColor: home.color || '#3b82f6' }}
                    />
                    <div
                      className="h-full"
                      style={{ width: `${(stats.away.corners / (stats.home.corners + stats.away.corners)) * 100}%`, backgroundColor: away.color || '#ef4444' }}
                    />
                  </div>
                </div>

                {/* Fouls */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={24} />
                      <span className="font-semibold text-2xl">{stats.home.fouls}</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">Faltas</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-2xl">{stats.away.fouls}</span>
                      <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={24} />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{ width: `${(stats.home.fouls / (stats.home.fouls + stats.away.fouls)) * 100}%`, backgroundColor: home.color || '#3b82f6' }}
                    />
                    <div
                      className="h-full"
                      style={{ width: `${(stats.away.fouls / (stats.home.fouls + stats.away.fouls)) * 100}%`, backgroundColor: away.color || '#ef4444' }}
                    />
                  </div>
                </div>

                {/* Offsides */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={24} />
                      <span className="font-semibold text-2xl">{stats.home.offsides}</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">Fueras de juego</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-2xl">{stats.away.offsides}</span>
                      <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={24} />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{ width: `${(stats.home.offsides / (stats.home.offsides + stats.away.offsides)) * 100}%`, backgroundColor: home.color || '#3b82f6' }}
                    />
                    <div
                      className="h-full"
                      style={{ width: `${(stats.away.offsides / (stats.home.offsides + stats.away.offsides)) * 100}%`, backgroundColor: away.color || '#ef4444' }}
                    />
                  </div>
                </div>

                {/* Pass Accuracy */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={24} />
                      <span className="font-semibold">{stats.home.passAccuracy}%</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">Precisión de pase</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{stats.away.passAccuracy}%</span>
                      <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={24} />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{ width: `${stats.home.passAccuracy}%`, backgroundColor: home.color || '#3b82f6' }}
                    />
                    <div
                      className="h-full"
                      style={{ width: `${stats.away.passAccuracy}%`, backgroundColor: away.color || '#ef4444' }}
                    />
                  </div>
                </div>

                {/* Saves */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={24} />
                      <span className="font-semibold text-2xl">{stats.home.saves}</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">Paradas</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-2xl">{stats.away.saves}</span>
                      <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={24} />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{ width: `${(stats.home.saves / (stats.home.saves + stats.away.saves)) * 100}%`, backgroundColor: home.color || '#3b82f6' }}
                    />
                    <div
                      className="h-full"
                      style={{ width: `${(stats.away.saves / (stats.home.saves + stats.away.saves)) * 100}%`, backgroundColor: away.color || '#ef4444' }}
                    />
                  </div>
                </div>

                {/* xG */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={24} />
                      <span className="font-semibold text-2xl">{stats.home.xg.toFixed(2)}</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">xG en vivo</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-2xl">{stats.away.xg.toFixed(2)}</span>
                      <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={24} />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{ width: `${(stats.home.xg / (stats.home.xg + stats.away.xg)) * 100}%`, backgroundColor: home.color || '#3b82f6' }}
                    />
                    <div
                      className="h-full"
                      style={{ width: `${(stats.away.xg / (stats.home.xg + stats.away.xg)) * 100}%`, backgroundColor: away.color || '#ef4444' }}
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
              {finalChronicleEvents.length === 0 ? (
                <div className="text-sm text-muted-foreground">Sin eventos registrados</div>
              ) : (
                <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
                  {finalChronicleEvents.map((item, i) => {
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
                      formation={homeFormation}
                      teamId={fixture.homeId}
                      cards={result.cards || []}
                      ratings={finalHomeRatings}
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
                            const rating = finalHomeRatings.find(r => r.playerId === player.id);
                            return (
                              <div key={player.id} className="text-sm flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground">{player.positions?.[0] || "N/A"}</span>
                                  <span>{player.name}</span>
                                </div>
                                <span className="font-semibold">{rating?.rating.toFixed(1) || "N/A"}</span>
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
                      formation={awayFormation}
                      teamId={fixture.awayId}
                      cards={result.cards || []}
                      ratings={finalAwayRatings}
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
                            const rating = finalAwayRatings.find(r => r.playerId === player.id);
                            return (
                              <div key={player.id} className="text-sm flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-medium">{player.name}</span>
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
                        {finalAwayRatings
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
