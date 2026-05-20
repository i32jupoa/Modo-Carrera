import { createFileRoute, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadSave, SaveGame, saveSave, setLineup, setFormation } from "@/lib/store";
import { teamById } from "@/data/teams";
import { Position } from "@/data/players";
import { PlayersLoading, usePlayersReady } from "@/components/PlayersLoading";
import { usePlayersStore } from "@/store/playersStore";
import { FootballPitch, PlayerNode } from "@/components/FootballPitch";
import {
  ALL_FORMATIONS,
  FORMATION_COORDINATES,
  getFormationPositions,
  type FormationName,
  type PositionRole,
} from "@/lib/formations";
import { toast } from "sonner";

export const Route = createFileRoute("/lineup")({ component: LineupPage });

// Position validation mappings
const POSITION_ROLES: Record<string, PositionRole> = {
  // Goalkeepers
  "GK": "GK",
  "POR": "GK",
  
  // Defenders
  "CB": "DEF",
  "RB": "DEF",
  "LB": "DEF",
  "RWB": "DEF",
  "LWB": "DEF",
  "DFC": "DEF",
  "LD": "DEF",
  "LI": "DEF",
  "CAD": "DEF",
  "CAI": "DEF",
  
  // Midfielders
  "CDM": "MID",
  "CM": "MID",
  "CAM": "MID",
  "RM": "MID",
  "LM": "MID",
  "MCD": "MID",
  "MC": "MID",
  "MCO": "MID",
  "MD": "MID",
  "MI": "MID",
  
  // Attackers
  "ST": "ATT",
  "CF": "ATT",
  "RW": "ATT",
  "LW": "ATT",
  "DC": "ATT",
  "SD": "ATT",
  "ED": "ATT",
  "EI": "ATT",
};

function getPlayerRole(position: string): PositionRole | null {
  return POSITION_ROLES[position] || null;
}

function canPlayInRole(playerPosition: string, nodeRole: PositionRole): boolean {
  const playerRole = getPlayerRole(playerPosition);
  if (!playerRole) return false; // Unknown position cannot play anywhere
  return playerRole === nodeRole;
}

function LineupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { ready, loading } = usePlayersReady();
  const getSimSquad = usePlayersStore((s) => s.getSimSquad);
  const [save, setSave] = useState<SaveGame | null>(null);
  const [selectedFormation, setSelectedFormation] = useState<FormationName>("Táctica 4-3-3");
  const [startingXI, setStartingXI] = useState<string[]>([]);
  const [bench, setBench] = useState<string[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [injuryProcessed, setInjuryProcessed] = useState(false);

  // Check if user navigated from "Temporada" screen
  const fromSeason = (location.state as any)?.from === "season";

  useEffect(() => {
    const s = loadSave();
    if (!s) { navigate({ to: "/" }); return; }
    setSave(s);
    
    // Initialize lineup from save
    const savedLineup = s.lineups[s.myTeamId] ?? [];
    if (savedLineup.length > 0) {
      setStartingXI(savedLineup.slice(0, 11));
      const squad = getSimSquad(s.myTeamId);
      const benchPlayers = squad.filter(p => !savedLineup.includes(p.id)).map(p => p.id);
      setBench(benchPlayers);
    }
    
    // Initialize formation from save
    const savedFormation = s.formations[s.myTeamId] ?? "Táctica 4-3-3";
    setSelectedFormation(savedFormation as FormationName);
  }, [navigate, getSimSquad]);

  const squad = useMemo(
    () => (save && ready ? getSimSquad(save.myTeamId) : []),
    [save, ready, getSimSquad],
  );
  const leagueMd = save ? save.currentMatchday[save.myLeague] : 0;

  // Automated injury detection and handling
  useEffect(() => {
    if (!save || injuryProcessed || startingXI.length === 0) return;

    const injuredPlayers = squad.filter(p => 
      startingXI.includes(p.id) && p.injuredUntil > leagueMd
    );

    if (injuredPlayers.length > 0) {
      // Process each injured player
      injuredPlayers.forEach(injuredPlayer => {
        toast.error(`¡Atención! ${injuredPlayer.name} se ha lesionado y ha sido movido a los suplentes.`);
        
        // Find a healthy replacement from bench
        const healthyBench = squad.filter(p => 
          bench.includes(p.id) && p.injuredUntil <= leagueMd && p.position === injuredPlayer.position
        );
        
        if (healthyBench.length > 0) {
          const replacement = healthyBench[0];
          
          // Swap injured player with healthy bench player
          setStartingXI(prev => prev.map(id => id === injuredPlayer.id ? replacement.id : id));
          setBench(prev => prev.map(id => id === replacement.id ? injuredPlayer.id : id));
        } else {
          // No replacement available, just move to bench
          setStartingXI(prev => prev.filter(id => id !== injuredPlayer.id));
          setBench(prev => [...prev, injuredPlayer.id]);
        }
      });
      
      setInjuryProcessed(true);
    }
  }, [save, squad, startingXI, bench, leagueMd, injuryProcessed]);

  const startingPlayers = useMemo(() => {
    return startingXI.map(id => squad.find(p => p.id === id)).filter(Boolean);
  }, [startingXI, squad]);

  const benchPlayers = useMemo(() => {
    return bench.map(id => squad.find(p => p.id === id)).filter(Boolean);
  }, [bench, squad]);

  const formationPositions = getFormationPositions(selectedFormation);

  // Map players to formation positions
  const playerPositions = useMemo(() => {
    const positions: { [key: string]: any } = {};
    const positionKeys = Object.keys(FORMATION_COORDINATES[selectedFormation]);
    
    startingPlayers.forEach((player, index) => {
      if (index < positionKeys.length) {
        positions[positionKeys[index]] = player;
      }
    });
    
    return positions;
  }, [startingPlayers, selectedFormation]);

  // Get the position key for a player on the pitch
  function getPlayerPositionKey(playerId: string): string | null {
    for (const [key, player] of Object.entries(playerPositions)) {
      if (player && player.id === playerId) {
        return key;
      }
    }
    return null;
  }

  // Get the role for a position key in the current formation
  function getPositionRoleForKey(posKey: string): PositionRole {
    return FORMATION_COORDINATES[selectedFormation][posKey]?.role || "MID";
  }

  function handlePitchPlayerClick(playerId: string) {
    if (selectedPlayer === null) {
      setSelectedPlayer(playerId);
    } else if (selectedPlayer === playerId) {
      setSelectedPlayer(null);
    } else {
      // Both players are on the pitch - internal swap
      if (startingXI.includes(selectedPlayer) && startingXI.includes(playerId)) {
        // Validate pitch-to-pitch swap
        const player1 = squad.find(p => p.id === selectedPlayer);
        const player2 = squad.find(p => p.id === playerId);
        
        if (!player1 || !player2) {
          setSelectedPlayer(null);
          return;
        }
        
        // Get position keys for both players
        const posKey1 = getPlayerPositionKey(selectedPlayer);
        const posKey2 = getPlayerPositionKey(playerId);
        
        if (!posKey1 || !posKey2) {
          setSelectedPlayer(null);
          return;
        }
        
        // Get required roles for both positions
        const requiredRole1 = getPositionRoleForKey(posKey1);
        const requiredRole2 = getPositionRoleForKey(posKey2);
        
        // Validate that player2 can play in player1's position
        if (!canPlayInRole(player2.position, requiredRole1)) {
          const roleNames: Record<PositionRole, string> = {
            GK: "portero",
            DEF: "defensa",
            MID: "centrocampista",
            ATT: "delantero",
          };
          toast.error(
            `Posición inválida: ${player2.name} es ${player2.position} y no puede jugar de ${roleNames[requiredRole1]}.`
          );
          setSelectedPlayer(null);
          return;
        }
        
        // Validate that player1 can play in player2's position
        if (!canPlayInRole(player1.position, requiredRole2)) {
          const roleNames: Record<PositionRole, string> = {
            GK: "portero",
            DEF: "defensa",
            MID: "centrocampista",
            ATT: "delantero",
          };
          toast.error(
            `Posición inválida: ${player1.name} es ${player1.position} y no puede jugar de ${roleNames[requiredRole2]}.`
          );
          setSelectedPlayer(null);
          return;
        }
        
        // Swap positions in startingXI array
        setStartingXI(prev => {
          const newStarting = [...prev];
          const idx1 = newStarting.indexOf(selectedPlayer);
          const idx2 = newStarting.indexOf(playerId);
          [newStarting[idx1], newStarting[idx2]] = [newStarting[idx2], newStarting[idx1]];
          return newStarting;
        });
        setSelectedPlayer(null);
      } else if (bench.includes(selectedPlayer)) {
        // Bench player selected, pitch player clicked - swap
        handleBenchToPitchSwap(selectedPlayer, playerId);
      } else {
        // Pitch player selected, pitch player clicked - just change selection
        setSelectedPlayer(playerId);
      }
    }
  }

  function handleBenchPlayerClick(playerId: string) {
    const player = squad.find(p => p.id === playerId);
    if (!player) return;
    
    // Check if player is injured
    if (player.injuredUntil > leagueMd) {
      toast.error(`${player.name} está lesionado y no puede jugar.`);
      return;
    }

    if (selectedPlayer === null) {
      setSelectedPlayer(playerId);
    } else if (selectedPlayer === playerId) {
      setSelectedPlayer(null);
    } else if (startingXI.includes(selectedPlayer)) {
      // Pitch player selected, bench player clicked - swap
      handlePitchToBenchSwap(selectedPlayer, playerId);
    } else {
      // Both are on bench - swap bench positions
      setBench(prev => {
        const newBench = [...prev];
        const idx1 = newBench.indexOf(selectedPlayer);
        const idx2 = newBench.indexOf(playerId);
        [newBench[idx1], newBench[idx2]] = [newBench[idx2], newBench[idx1]];
        return newBench;
      });
      setSelectedPlayer(null);
    }
  }

  function handlePitchToBenchSwap(pitchPlayerId: string, benchPlayerId: string) {
    const pitchPlayer = squad.find(p => p.id === pitchPlayerId);
    const benchPlayer = squad.find(p => p.id === benchPlayerId);
    
    if (!pitchPlayer || !benchPlayer) return;
    
    // Get the position key where the pitch player is currently
    const posKey = getPlayerPositionKey(pitchPlayerId);
    if (!posKey) return;
    
    // Get the role required for this position
    const requiredRole = getPositionRoleForKey(posKey);
    
    // Validate that the bench player can play in this role
    if (!canPlayInRole(benchPlayer.position, requiredRole)) {
      const roleNames: Record<PositionRole, string> = {
        GK: "portero",
        DEF: "defensa",
        MID: "centrocampista",
        ATT: "delantero",
      };
      toast.error(
        `Posición inválida: ${benchPlayer.name} es ${benchPlayer.position} y no puede jugar de ${roleNames[requiredRole]}.`
      );
      setSelectedPlayer(null);
      return;
    }
    
    // Perform the swap
    setStartingXI(prev => prev.map(id => id === pitchPlayerId ? benchPlayerId : id));
    setBench(prev => prev.map(id => id === benchPlayerId ? pitchPlayerId : id));
    setSelectedPlayer(null);
  }

  function handleBenchToPitchSwap(benchPlayerId: string, pitchPlayerId: string) {
    const benchPlayer = squad.find(p => p.id === benchPlayerId);
    const pitchPlayer = squad.find(p => p.id === pitchPlayerId);
    
    if (!benchPlayer || !pitchPlayer) return;
    
    // Get the position key where the pitch player is currently
    const posKey = getPlayerPositionKey(pitchPlayerId);
    if (!posKey) return;
    
    // Get the role required for this position
    const requiredRole = getPositionRoleForKey(posKey);
    
    // Validate that the bench player can play in this role
    if (!canPlayInRole(benchPlayer.position, requiredRole)) {
      const roleNames: Record<PositionRole, string> = {
        GK: "portero",
        DEF: "defensa",
        MID: "centrocampista",
        ATT: "delantero",
      };
      toast.error(
        `Posición inválida: ${benchPlayer.name} es ${benchPlayer.position} y no puede jugar de ${roleNames[requiredRole]}.`
      );
      setSelectedPlayer(null);
      return;
    }
    
    // Perform the swap
    setStartingXI(prev => prev.map(id => id === pitchPlayerId ? benchPlayerId : id));
    setBench(prev => prev.map(id => id === benchPlayerId ? pitchPlayerId : id));
    setSelectedPlayer(null);
  }

  function save_() {
    if (!save || startingXI.length !== 11) return;
    const next = setLineup(save, save.myTeamId, startingXI);
    const nextWithFormation = setFormation(next, save.myTeamId, selectedFormation);
    saveSave(nextWithFormation);
    setSave(nextWithFormation);
    toast.success("Alineación guardada correctamente");
  }

  function autoFill() {
    if (!save) return;
    const available = squad.filter((p) => p.injuredUntil <= leagueMd);
    const pick = (pos: Position, n: number) =>
      available.filter((p) => p.position === pos).slice(0, n).map((p) => p.id);
    const newStarting = [...pick("GK", 1), ...pick("DEF", 4), ...pick("MID", 3), ...pick("FWD", 3)];
    setStartingXI(newStarting);
    const newBench = squad.filter(p => !newStarting.includes(p.id)).map(p => p.id);
    setBench(newBench);
    toast.success("Alineación completada automáticamente");
  }

  function handleFormationChange(newFormation: FormationName) {
    setSelectedFormation(newFormation);
    // Auto-save formation to global state
    if (save) {
      const next = setFormation(save, save.myTeamId, newFormation);
      saveSave(next);
      setSave(next);
    }
  }

  if (!save) return null;
  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <PlayersLoading message="Cargando datos de jugadores…" />
      </div>
    );
  }

  const myTeam = teamById(save.myTeamId);

  if (squad.length === 0) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <p className="text-sm text-muted-foreground text-center py-12">
          No hay jugadores en la base de datos para <strong>{myTeam.name}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black">Alineación</h1>
          <p className="text-xs text-muted-foreground">{myTeam.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedFormation}
            onChange={(e) => handleFormationChange(e.target.value as FormationName)}
            className="px-3 py-2 rounded-lg bg-card border border-border text-sm hover:border-accent transition"
          >
            {ALL_FORMATIONS.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <button onClick={autoFill} className="px-4 py-2 rounded-lg bg-card border border-border text-sm hover:border-accent transition">
            Auto
          </button>
          <button onClick={save_} disabled={startingXI.length !== 11}
            className="px-5 py-2 rounded-lg bg-primary text-primary-foreground font-bold text-sm glow-neon disabled:opacity-40 disabled:glow-cyan-0">
            Guardar
          </button>
        </div>
      </div>

      <div className="panel-glow p-4 mb-6">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <span className="font-bold text-primary">Titulares: {startingXI.length}/11</span>
            <span className="font-bold text-muted-foreground">Suplentes: {bench.length}</span>
          </div>
          <div className="text-2xl font-black scoreline text-primary">
            {selectedFormation}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Football Pitch */}
        <div className="flex flex-col items-center">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
            Titulares
          </h2>
          <FootballPitch>
            {formationPositions.map((posKey, index) => {
              const player = playerPositions[posKey];
              const coords = FORMATION_COORDINATES[selectedFormation][posKey];
              if (!player || !coords) return null;
              
              return (
                <PlayerNode
                  key={player.id}
                  player={{
                    id: player.id,
                    name: player.name,
                    rating: player.rating,
                    position: player.position,
                    injured: player.injuredUntil > leagueMd,
                  }}
                  coordinates={coords}
                  isSelected={selectedPlayer === player.id}
                  onClick={() => handlePitchPlayerClick(player.id)}
                />
              );
            })}
          </FootballPitch>
        </div>

        {/* Bench */}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
            Suplentes
          </h2>
          <div className="panel p-4 space-y-2 max-h-[600px] overflow-y-auto">
            {benchPlayers.map((player) => {
              if (!player) return null;
              const isInjured = player.injuredUntil > leagueMd;
              return (
                <button
                  key={player.id}
                  onClick={() => handleBenchPlayerClick(player.id)}
                  disabled={isInjured}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition ${
                    isInjured
                      ? "opacity-40 cursor-not-allowed border-border bg-destructive/10"
                      : selectedPlayer === player.id
                      ? "border-primary bg-primary/10 glow-cyan"
                      : "border-border bg-card hover:border-primary/60"
                  }`}
                >
                  <div className="w-10 h-10 grid place-items-center rounded text-sm font-black bg-secondary text-foreground">
                    {player.rating}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate text-sm flex items-center gap-1">
                      {player.name}
                      {isInjured && <span className="text-xs text-destructive">🚑</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {player.position} · {player.age}a · {player.goals}G {player.assists}A
                    </div>
                  </div>
                  {selectedPlayer === player.id && <span className="text-primary text-lg">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {fromSeason && (
        <div className="mt-8 flex justify-end">
          <Link to="/match" className={`px-6 py-3 rounded-lg font-black ${startingXI.length === 11 ? "bg-primary text-primary-foreground glow-neon" : "bg-secondary text-muted-foreground pointer-events-none opacity-40"}`}>
            Jugar Partido →
          </Link>
        </div>
      )}
    </div>
  );
}
