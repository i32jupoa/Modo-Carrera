import { createFileRoute, Link, useNavigate, useSearch, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadSave, SaveGame, saveSave, setLineup, setFormation } from "@/lib/store";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import { TeamLogo } from "@/components/TeamLogo";
import { defaultLineup, Position } from "@/data/players";
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
import {
  loadTactics,
  saveTactics,
  type TeamTactics,
  type PlayStyle,
  type Pressure,
  type DefenseLine,
} from "@/lib/teamTactics";
import { Shield, Swords, Scale, ChevronsDown, ChevronsUp, Minus, Crown, Goal, Flag, CornerDownRight, CalendarClock } from "lucide-react";

// Friendly label for an empty slot, derived from formation position key.
function emptySlotLabel(posKey: string): string {
  const k = posKey.toLowerCase().replace(/\d+$/, "");
  const MAP: Record<string, string> = {
    gk: "POR", cb: "DFC", lb: "LD", rb: "LI", lwb: "CAD", rwb: "CAI",
    cdm: "MCD", cm: "MC", cam: "MCO", lm: "MI", rm: "MD",
    lw: "EI", rw: "ED", st: "DC", cf: "SD",
  };
  return MAP[k] ?? posKey.toUpperCase();
}

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
  "DEF": "DEF",

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
  "MID": "MID",

  // Attackers
  "ST": "ATT",
  "CF": "ATT",
  "RW": "ATT",
  "LW": "ATT",
  "DC": "ATT",
  "SD": "ATT",
  "ED": "ATT",
  "EI": "ATT",
  "FWD": "ATT",
  "ATT": "ATT",
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
  const search = useSearch({ from: "/lineup" });
  const { ready, loading } = usePlayersReady();
  const getSimSquad = usePlayersStore((s) => s.getSimSquad);
  const [save, setSave] = useState<SaveGame | null>(null);
  const [selectedFormation, setSelectedFormation] = useState<FormationName>("Táctica 4-3-3");
  const [startingXI, setStartingXI] = useState<string[]>([]);
  const [bench, setBench] = useState<string[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const processedForMdRef = useRef<number>(-1);
  const suspensionProcessedForMdRef = useRef<number>(-1);

  // Check if user navigated from "Temporada" screen
  const fromSeason = (search as any)?.from === "season";
  // Check if user navigated from "Match" screen
  const routerState = location.state as any;
  const fromMatch = routerState?.fromMatch === true;

  // Extract match metadata from router state (if passed from season or match page)
  const matchType = routerState?.matchType as 'LEAGUE' | 'CUP' | 'UCL' | undefined;
  const cupRound = routerState?.cupRound as string | undefined;
  const fixtureId = routerState?.fixtureId as string | undefined;
  const returningFromLineupEdit = routerState?.returningFromLineupEdit === true;

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

  useEffect(() => {
    if (!save || !ready || squad.length === 0) return;
    if (startingXI.length > 0 || bench.length > 0) return;

    const fallbackXI = defaultLineup(squad);
    setStartingXI(fallbackXI);
    setBench(squad.filter((player) => !fallbackXI.includes(player.id)).map((player) => player.id));
  }, [save, ready, squad, startingXI.length, bench.length]);

  // Automated injury detection and handling
  useEffect(() => {
    if (!save || startingXI.length === 0) return;
    if (processedForMdRef.current === leagueMd) return;

    const injuredPlayers = squad.filter(p => 
      startingXI.includes(p.id) && p.injuredUntil > leagueMd
    );

    if (injuredPlayers.length > 0) {
      let newStartingXI = [...startingXI];
      let newBench = [...bench];

      // Process each injured player
      injuredPlayers.forEach(injuredPlayer => {
        // Find a healthy replacement from bench
        const healthyBench = squad.filter(p => 
          newBench.includes(p.id) && p.injuredUntil <= leagueMd && p.position === injuredPlayer.position
        );
        
        if (healthyBench.length > 0) {
          const replacement = healthyBench[0];
          newStartingXI = newStartingXI.map(id => id === injuredPlayer.id ? replacement.id : id);
          newBench = newBench.map(id => id === replacement.id ? injuredPlayer.id : id);
        } else {
          newStartingXI = newStartingXI.filter(id => id !== injuredPlayer.id);
          newBench = [...newBench, injuredPlayer.id];
        }
      });

      setStartingXI(newStartingXI);
      setBench(newBench);
      processedForMdRef.current = leagueMd;

      // Auto-save lineup exactly as if the user clicked Guardar
      if (save && newStartingXI.filter(id => id && id.trim() !== "").length === 11) {
        const suspensions = save.suspensions[save.myTeamId] ?? [];
        const suspendedPlayerIds = new Set(suspensions.filter(s => s.matchdaysRemaining > 0).map(s => s.playerId));
        const filteredXI = newStartingXI.filter(id => !suspendedPlayerIds.has(id));
        const next = setLineup(save, save.myTeamId, filteredXI);
        const nextWithFormation = setFormation(next, save.myTeamId, selectedFormation);
        saveSave(nextWithFormation);
        setSave(nextWithFormation);
      }
    } else {
      processedForMdRef.current = leagueMd;
    }
  }, [save, squad, startingXI, bench, leagueMd, selectedFormation]);

  // Automated suspension detection and handling
  useEffect(() => {
    if (!save || startingXI.length === 0) return;
    if (suspensionProcessedForMdRef.current === leagueMd) return;

    const suspensions = save.suspensions[save.myTeamId] ?? [];
    const suspendedPlayerIds = new Set(suspensions.filter(s => s.matchdaysRemaining > 0).map(s => s.playerId));
    
    const suspendedPlayers = squad.filter(p => 
      startingXI.includes(p.id) && suspendedPlayerIds.has(p.id)
    );

    if (suspendedPlayers.length > 0) {
      let newStartingXI = [...startingXI];
      let newBench = [...bench];

      // Process each suspended player
      suspendedPlayers.forEach(suspendedPlayer => {
        // Find a healthy replacement from bench (not injured or suspended)
        const healthyBench = squad.filter(p => 
          newBench.includes(p.id) && 
          p.injuredUntil <= leagueMd && 
          !suspendedPlayerIds.has(p.id) &&
          p.position === suspendedPlayer.position
        );
        
        if (healthyBench.length > 0) {
          const replacement = healthyBench[0];
          newStartingXI = newStartingXI.map(id => id === suspendedPlayer.id ? replacement.id : id);
          newBench = newBench.map(id => id === replacement.id ? suspendedPlayer.id : id);
        } else {
          newStartingXI = newStartingXI.filter(id => id !== suspendedPlayer.id);
          newBench = [...newBench, suspendedPlayer.id];
        }
      });

      setStartingXI(newStartingXI);
      setBench(newBench);
      suspensionProcessedForMdRef.current = leagueMd;

      // Auto-save lineup exactly as if the user clicked Guardar
      if (save && newStartingXI.filter(id => id && id.trim() !== "").length === 11) {
        const filteredXI = newStartingXI.filter(id => !suspendedPlayerIds.has(id));
        const next = setLineup(save, save.myTeamId, filteredXI);
        const nextWithFormation = setFormation(next, save.myTeamId, selectedFormation);
        saveSave(nextWithFormation);
        setSave(nextWithFormation);
      }
    } else {
      suspensionProcessedForMdRef.current = leagueMd;
    }
  }, [save, squad, startingXI, bench, leagueMd, selectedFormation]);

  const startingPlayers = useMemo(() => {
    return startingXI.map(id => squad.find(p => p.id === id));
  }, [startingXI, squad]);

  const benchPlayers = useMemo(() => {
    return bench.map(id => squad.find(p => p.id === id)).filter(Boolean);
  }, [bench, squad]);

  // Count only valid, non-null players in starting XI
  const activeStartersCount = useMemo(() => {
    return startingXI.filter(id => id && id.trim() !== "").length;
  }, [startingXI]);

  const isLineupComplete = activeStartersCount === 11;

  const formationPositions = getFormationPositions(selectedFormation);

  // ---- Tactics (style / pressure / defense line / captain & set-piece takers) ----
  const [tactics, setTactics] = useState<TeamTactics>(() => loadTactics(save?.myTeamId ?? ""));
  useEffect(() => {
    if (save?.myTeamId) setTactics(loadTactics(save.myTeamId));
  }, [save?.myTeamId]);
  function updateTactics(patch: Partial<TeamTactics>) {
    setTactics((prev) => {
      const next = { ...prev, ...patch };
      if (save?.myTeamId) saveTactics(save.myTeamId, next);
      return next;
    });
  }

  // Map players to formation positions
  const playerPositions = useMemo(() => {
    const positions: { [key: string]: any } = {};
    const positionKeys = Object.keys(FORMATION_COORDINATES[selectedFormation]);

    // Map directly from startingXI to position keys
    // startingXI maintains the correct order as built in handleFormationChange
    positionKeys.forEach((posKey, index) => {
      if (index < startingXI.length && startingXI[index]) {
        const player = squad.find(p => p.id === startingXI[index]);
        if (player) {
          positions[posKey] = player;
        }
      }
    });

    return positions;
  }, [startingXI, selectedFormation, squad]);

  // Get the position key for a player on the pitch
  function getPlayerPositionKey(playerId: string): string | null {
    for (const [key, player] of Object.entries(playerPositions)) {
      if (player && player.id === playerId) {
        return key;
      }
    }
    return null;
  }

  // ---- XI summary metrics ----
  const xiPlayers = useMemo(
    () =>
      startingXI
        .map((id) => (id ? squad.find((p) => p.id === id) : null))
        .filter((p): p is NonNullable<typeof p> => !!p),
    [startingXI, squad],
  );
  const avgOvrXI = xiPlayers.length
    ? Math.round(xiPlayers.reduce((s, p) => s + (p.rating ?? 0), 0) / xiPlayers.length)
    : 0;
  const avgAgeXI = xiPlayers.length
    ? (xiPlayers.reduce((s, p) => s + (p.age ?? 0), 0) / xiPlayers.length).toFixed(1)
    : "—";

  // Chemistry: % of XI placed in their natural role
  const chemistry = useMemo(() => {
    if (xiPlayers.length === 0) return 0;
    let matched = 0;
    let total = 0;
    Object.entries(playerPositions).forEach(([posKey, player]) => {
      if (!player) return;
      total += 1;
      const requiredRole = FORMATION_COORDINATES[selectedFormation][posKey]?.role;
      const playerRole = getPlayerRole((player as any).position);
      if (requiredRole && playerRole && requiredRole === playerRole) matched += 1;
    });
    return total ? Math.round((matched / total) * 100) : 0;
  }, [playerPositions, selectedFormation, xiPlayers.length]);

  // Next match (league only, simple lookup)
  const nextMatch = useMemo(() => {
    if (!save) return null;
    const myId = save.myTeamId;
    const all = save.fixtures[save.myLeague] ?? [];
    const upcoming = all.find(
      (f) => !f.result && (f.homeId === myId || f.awayId === myId),
    );
    if (!upcoming) return null;
    const isHome = upcoming.homeId === myId;
    const rivalId = isHome ? upcoming.awayId : upcoming.homeId;
    return {
      rival: teamById(rivalId),
      isHome,
      matchday: upcoming.matchday,
      competition: "Liga" as const,
    };
  }, [save]);

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

    // Check if player is suspended
    const suspensions = save?.suspensions[save.myTeamId] ?? [];
    const suspendedPlayerIds = new Set(suspensions.filter(s => s.matchdaysRemaining > 0).map(s => s.playerId));
    if (suspendedPlayerIds.has(player.id)) {
      const suspension = suspensions.find(s => s.playerId === player.id);
      const matchdays = suspension?.matchdaysRemaining || 0;
      toast.error(`${player.name} está suspendido por ${matchdays} partido${matchdays > 1 ? 's' : ''} y no puede jugar.`);
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

    // Check if bench player is injured
    if (benchPlayer.injuredUntil > leagueMd) {
      toast.error(`${benchPlayer.name} está lesionado y no puede jugar.`);
      setSelectedPlayer(null);
      return;
    }

    // Check if bench player is suspended
    const suspensions = save?.suspensions[save.myTeamId] ?? [];
    const suspendedPlayerIds = new Set(suspensions.filter(s => s.matchdaysRemaining > 0).map(s => s.playerId));
    if (suspendedPlayerIds.has(benchPlayer.id)) {
      const suspension = suspensions.find(s => s.playerId === benchPlayer.id);
      const matchdays = suspension?.matchdaysRemaining || 0;
      toast.error(`${benchPlayer.name} está suspendido por ${matchdays} partido${matchdays > 1 ? 's' : ''} y no puede jugar.`);
      setSelectedPlayer(null);
      return;
    }

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

  function handlePitchToEmptySwap(playerId: string, emptyPosKey: string) {
    const player = squad.find(p => p.id === playerId);
    if (!player) return;

    // Check if player is injured
    if (player.injuredUntil > leagueMd) {
      toast.error(`${player.name} está lesionado y no puede jugar.`);
      setSelectedPlayer(null);
      return;
    }

    // Check if player is suspended
    const suspensions = save?.suspensions[save.myTeamId] ?? [];
    const suspendedPlayerIds = new Set(suspensions.filter(s => s.matchdaysRemaining > 0).map(s => s.playerId));
    if (suspendedPlayerIds.has(player.id)) {
      const suspension = suspensions.find(s => s.playerId === player.id);
      const matchdays = suspension?.matchdaysRemaining || 0;
      toast.error(`${player.name} está suspendido por ${matchdays} partido${matchdays > 1 ? 's' : ''} y no puede jugar.`);
      setSelectedPlayer(null);
      return;
    }

    // Get the role required for the empty position
    const requiredRole = getPositionRoleForKey(emptyPosKey);

    // Validate that the player can play in this role
    if (!canPlayInRole(player.position, requiredRole)) {
      const roleNames: Record<PositionRole, string> = {
        GK: "portero",
        DEF: "defensa",
        MID: "centrocampista",
        ATT: "delantero",
      };
      toast.error(
        `Posición inválida: ${player.name} es ${player.position} y no puede jugar de ${roleNames[requiredRole]}.`
      );
      setSelectedPlayer(null);
      return;
    }

    // Get the current position key of the player
    const currentPlayerPosKey = getPlayerPositionKey(playerId);
    if (!currentPlayerPosKey) return;

    // Get the indices of both positions
    const emptyPosIndex = formationPositions.indexOf(emptyPosKey);
    const currentPlayerPosIndex = formationPositions.indexOf(currentPlayerPosKey);

    // Swap: move player to empty position, make old position empty
    setStartingXI(prev => {
      const newStarting = [...prev];
      newStarting[emptyPosIndex] = playerId;
      newStarting[currentPlayerPosIndex] = "";
      return newStarting;
    });

    setSelectedPlayer(null);
  }

  function handleBenchToPitchSwap(benchPlayerId: string, pitchTarget: string) {
    const benchPlayer = squad.find(p => p.id === benchPlayerId);
    if (!benchPlayer) return;

    // Check if player is injured
    if (benchPlayer.injuredUntil > leagueMd) {
      toast.error(`${benchPlayer.name} está lesionado y no puede jugar.`);
      return;
    }

    // Check if player is suspended
    const suspensions = save?.suspensions[save.myTeamId] ?? [];
    const suspendedPlayerIds = new Set(suspensions.filter(s => s.matchdaysRemaining > 0).map(s => s.playerId));
    if (suspendedPlayerIds.has(benchPlayer.id)) {
      const suspension = suspensions.find(s => s.playerId === benchPlayer.id);
      const matchdays = suspension?.matchdaysRemaining || 0;
      toast.error(`${benchPlayer.name} está suspendido por ${matchdays} partido${matchdays > 1 ? 's' : ''} y no puede jugar.`);
      return;
    }

    // Check if pitchTarget is a position key (empty position) or a player ID
    const isPositionKey = formationPositions.includes(pitchTarget);
    let posKey: string | null = null;

    if (isPositionKey) {
      // Empty position - use the position key directly
      posKey = pitchTarget;
    } else {
      // Existing player - get their position key
      posKey = getPlayerPositionKey(pitchTarget);
    }

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

    if (isPositionKey) {
      // Empty position - add player to startingXI at the correct index
      const posIndex = formationPositions.indexOf(posKey);
      const newStartingXI = [...startingXI];
      
      // Ensure array is long enough
      while (newStartingXI.length < posIndex) {
        newStartingXI.push("");
      }
      
      newStartingXI[posIndex] = benchPlayerId;
      setStartingXI(newStartingXI);
      setBench(prev => prev.filter(id => id !== benchPlayerId));
    } else {
      // Swap with existing player
      setStartingXI(prev => prev.map(id => id === pitchTarget ? benchPlayerId : id));
      setBench(prev => prev.map(id => id === benchPlayerId ? pitchTarget : id));
    }
    setSelectedPlayer(null);
  }

  function save_() {
    if (!save) return;
    if (!isLineupComplete) {
      toast.error("Plantilla incompleta. Faltan jugadores titulares.");
      return;
    }
    
    // Filter out suspended players from the lineup before saving
    const suspensions = save.suspensions[save.myTeamId] ?? [];
    const suspendedPlayerIds = new Set(suspensions.filter(s => s.matchdaysRemaining > 0).map(s => s.playerId));
    const filteredStartingXI = startingXI.filter(playerId => !suspendedPlayerIds.has(playerId));
    
    const next = setLineup(save, save.myTeamId, filteredStartingXI);
    const nextWithFormation = setFormation(next, save.myTeamId, selectedFormation);
    saveSave(nextWithFormation);
    setSave(nextWithFormation);
    toast.success("Alineación guardada correctamente");
  }

  function handleFormationChange(newFormation: FormationName) {
    setSelectedFormation(newFormation);

    const newFormationPositions = getFormationPositions(newFormation);

    // Group current starting players by role
    const playersByRole: Record<PositionRole, string[]> = {
      GK: [],
      DEF: [],
      MID: [],
      ATT: [],
    };

    startingXI.forEach((playerId) => {
      const player = squad.find(p => p.id === playerId);
      if (player) {
        const role = getPlayerRole(player.position);
        if (role) {
          playersByRole[role].push(playerId);
        }
      }
    });

    // Fill new formation positions in the order they appear in the formation
    const newStartingXI: string[] = [];

    newFormationPositions.forEach((posKey) => {
      const requiredRole = FORMATION_COORDINATES[newFormation][posKey]?.role;

      if (requiredRole && playersByRole[requiredRole].length > 0) {
        newStartingXI.push(playersByRole[requiredRole].shift()!);
      } else {
        // No player available for this position - leave empty
        newStartingXI.push("");
      }
    });

    // Keep empty strings to maintain correct position mapping
    // The rendering will handle empty strings as empty positions
    // Array must have exactly 11 elements
    setStartingXI(newStartingXI);
    const newBench = squad.filter((p) => !newStartingXI.includes(p.id)).map((p) => p.id);
    setBench(newBench);

    // No auto-save - only save when user explicitly clicks "Guardar" button
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
      <div className="panel-glow mb-6 overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 p-5">
          <TeamLogo
            teamName={myTeam.name}
            leagueName={LEAGUES[myTeam.league as LeagueId]?.name || myTeam.league}
            size={72}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              Dirección de equipo · Pizarra del míster
            </p>
            <h1 className="truncate text-2xl font-black sm:text-3xl">{myTeam.name}</h1>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {LEAGUES[myTeam.league as LeagueId]?.name || myTeam.league} · {selectedFormation}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-center">
              <p className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">OVR del 11</p>
              <p className="scoreline text-2xl font-black text-primary">{avgOvrXI || "—"}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-center">
              <p className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">Química</p>
              <p className={`scoreline text-2xl font-black ${chemistry >= 85 ? "text-emerald-400" : chemistry >= 60 ? "text-yellow-300" : "text-destructive"}`}>
                {xiPlayers.length ? `${chemistry}%` : "—"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedFormation}
              onChange={(e) => handleFormationChange(e.target.value as FormationName)}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold transition hover:border-primary/60"
            >
              {ALL_FORMATIONS.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            {!fromSeason && !fromMatch && (
              <button onClick={save_} disabled={!isLineupComplete}
                className="rounded-lg bg-primary px-5 py-2 text-sm font-bold text-primary-foreground glow-neon disabled:opacity-40 disabled:glow-cyan-0">
                Guardar
              </button>
            )}
          </div>
        </div>
        <div className="border-t border-border/40 bg-background/40 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
                isLineupComplete
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-destructive/40 bg-destructive/10 text-destructive"
              }`}>
                <span className={`h-2 w-2 rounded-full ${isLineupComplete ? "bg-emerald-400" : "bg-destructive"}`} />
                Titulares {activeStartersCount}/11
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs font-bold text-muted-foreground">
                Suplentes {bench.length}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs font-bold text-muted-foreground">
                Edad media {avgAgeXI}
              </span>
              {!isLineupComplete && (
                <span className="text-xs font-bold text-destructive">La plantilla no está completa.</span>
              )}
            </div>
            <div className="scoreline text-xl font-black text-primary sm:text-2xl">
              {selectedFormation}
            </div>
          </div>
        </div>
      </div>

      {nextMatch && (
        <div className="panel mb-6 flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <CalendarClock className="h-5 w-5 text-primary" />
            <div>
              <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">
                Próximo partido · J{nextMatch.matchday} {nextMatch.competition}
              </p>
              <p className="text-sm font-bold">
                {nextMatch.isHome ? "Local" : "Visitante"} · vs {nextMatch.rival.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <TeamLogo
              teamName={nextMatch.rival.name}
              leagueName={LEAGUES[nextMatch.rival.league as LeagueId]?.name || nextMatch.rival.league}
              size={48}
            />
            <span className="scoreline text-lg font-black text-muted-foreground">
              {nextMatch.isHome ? "vs" : "@"}
            </span>
          </div>
        </div>
      )}

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
              if (!coords) return null;

              if (player) {
                const suspensions = save?.suspensions[save.myTeamId] ?? [];
                const suspendedPlayerIds = new Set(suspensions.filter(s => s.matchdaysRemaining > 0).map(s => s.playerId));
                const isSuspended = suspendedPlayerIds.has(player.id);
                return (
                  <PlayerNode
                    key={player.id}
                    player={{
                      id: player.id,
                      name: player.name,
                      rating: player.rating,
                      position: player.position,
                      injured: player.injuredUntil > leagueMd,
                      suspended: isSuspended,
                    }}
                    coordinates={coords}
                    isSelected={selectedPlayer === player.id}
                    onClick={() => handlePitchPlayerClick(player.id)}
                  />
                );
              } else {
                // Render empty placeholder for empty positions
                return (
                  <div
                    key={posKey}
                    onClick={() => {
                      if (selectedPlayer) {
                        if (bench.includes(selectedPlayer)) {
                          handleBenchToPitchSwap(selectedPlayer, posKey);
                        } else if (startingXI.includes(selectedPlayer)) {
                          // Swap starting player with empty position
                          handlePitchToEmptySwap(selectedPlayer, posKey);
                        }
                      }
                    }}
                    className="absolute cursor-pointer hover:scale-110 transition-transform"
                    style={{
                      top: `${coords.top}%`,
                      left: `${coords.left}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    <div
                      className="w-12 h-12 rounded-full border-2 border-dashed border-primary/40 bg-background/40 flex flex-col items-center justify-center text-primary/70 text-[0.55rem] font-black leading-tight"
                      title={`Hueco vacío: ${emptySlotLabel(posKey)}`}
                    >
                      <span className="scoreline text-[0.6rem]">{emptySlotLabel(posKey)}</span>
                      <span className="text-base leading-none">+</span>
                    </div>
                  </div>
                );
              }
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
              const suspensions = save?.suspensions[save.myTeamId] ?? [];
              const suspendedPlayerIds = new Set(suspensions.filter(s => s.matchdaysRemaining > 0).map(s => s.playerId));
              const isSuspended = suspendedPlayerIds.has(player.id);
              const isUnavailable = isInjured || isSuspended;
              return (
                <button
                  key={player.id}
                  onClick={() => handleBenchPlayerClick(player.id)}
                  disabled={isUnavailable}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition ${
                    isUnavailable
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
                      {isInjured && (
                        <span className="text-xs text-destructive flex items-center gap-1">
                          <span className="w-3 h-3 rounded-full bg-orange-400 inline-block" />
                          {player.injuredUntil - leagueMd}p
                        </span>
                      )}
                      {isSuspended && (() => {
                        const susp = save?.suspensions[save.myTeamId]?.find(s => s.playerId === player.id);
                        return (
                          <span className="text-xs text-destructive flex items-center gap-1">
                            <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
                            {susp?.matchdaysRemaining ?? 0}p
                          </span>
                        );
                      })()}
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

      {/* Tactics panel */}
      <TacticsPanel
        tactics={tactics}
        updateTactics={updateTactics}
        xiPlayers={xiPlayers as any}
      />

      {(fromSeason || fromMatch) && (
        <div className="mt-8 flex justify-end">
          <button
            onClick={() => {
              if (!isLineupComplete) {
                toast.error("Plantilla incompleta. Faltan jugadores titulares.");
                return;
              }
              
              // Filter out suspended players from the lineup before passing to match
              const suspensions = save?.suspensions[save.myTeamId] ?? [];
              const suspendedPlayerIds = new Set(suspensions.filter(s => s.matchdaysRemaining > 0).map(s => s.playerId));
              const filteredStartingXI = startingXI.filter(playerId => !suspendedPlayerIds.has(playerId));
              
              // Pass temporary lineup to match engine via router state
              // This allows one-off changes for this specific match only
              // Also forward ALL match metadata (matchType, cupRound, fixtureId) for correct post-match simulation
              // If returning from lineup edit in a cup draw, pass returningFromLineupEdit to restore the draw state
              navigate({
                to: "/match",
                state: {
                  matchLineup: filteredStartingXI,
                  matchFormation: selectedFormation,
                  matchType: matchType || 'LEAGUE',  // Default to LEAGUE if undefined
                  cupRound,
                  fixtureId,
                  returningFromLineupEdit: returningFromLineupEdit,
                } as any,
              });
            }}
            disabled={!isLineupComplete}
            className={`px-6 py-3 rounded-lg font-black ${isLineupComplete ? "bg-primary text-primary-foreground glow-neon" : "bg-secondary text-muted-foreground pointer-events-none opacity-40"}`}
          >
            Iniciar Partido →
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Tactics panel — style, pressure, defense line, set-piece roles
// ============================================================
type XiPlayer = { id: string; name: string; position: string; rating: number };

function TacticsPanel({
  tactics,
  updateTactics,
  xiPlayers,
}: {
  tactics: TeamTactics;
  updateTactics: (patch: Partial<TeamTactics>) => void;
  xiPlayers: XiPlayer[];
}) {
  const styles: { id: PlayStyle; label: string; icon: any; tone: string; desc: string }[] = [
    { id: "defensive", label: "Defensivo", icon: Shield, tone: "border-sky-500/40 bg-sky-500/10 text-sky-300", desc: "Bloque bajo, contragolpe" },
    { id: "balanced", label: "Equilibrado", icon: Scale, tone: "border-primary/40 bg-primary/10 text-primary", desc: "Posesión y control" },
    { id: "offensive", label: "Ofensivo", icon: Swords, tone: "border-rose-500/40 bg-rose-500/10 text-rose-300", desc: "Presión arriba, ataque directo" },
  ];
  const pressureOpts: { id: Pressure; label: string; icon: any }[] = [
    { id: "low", label: "Baja", icon: ChevronsDown },
    { id: "medium", label: "Media", icon: Minus },
    { id: "high", label: "Alta", icon: ChevronsUp },
  ];
  const lineOpts: { id: DefenseLine; label: string; icon: any }[] = [
    { id: "low", label: "Baja", icon: ChevronsDown },
    { id: "medium", label: "Media", icon: Minus },
    { id: "high", label: "Alta", icon: ChevronsUp },
  ];

  const TakerSelect = ({
    label,
    icon: Icon,
    value,
    onChange,
    tone,
  }: {
    label: string;
    icon: any;
    value: string | null;
    onChange: (id: string | null) => void;
    tone: string;
  }) => (
    <div className={`rounded-lg border ${tone} p-3`}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[0.6rem] font-bold uppercase tracking-wider">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-md border border-border/60 bg-background/60 px-2 py-1.5 text-xs font-semibold"
      >
        <option value="">— Sin asignar —</option>
        {xiPlayers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.position} · {p.rating})
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="panel-glow mt-6 mb-6 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-wider">Tácticas avanzadas</h2>
        <span className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">
          Auto-guardado
        </span>
      </div>

      {/* Play style */}
      <div className="mb-5">
        <p className="mb-2 text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">
          Estilo de juego
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {styles.map((s) => {
            const active = tactics.style === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => updateTactics({ style: s.id })}
                className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition ${
                  active ? `${s.tone} ring-2 ring-current/40` : "border-border/60 bg-card/60 text-muted-foreground hover:border-primary/40"
                }`}
              >
                <s.icon className="h-5 w-5" />
                <div className="min-w-0">
                  <p className="text-sm font-black">{s.label}</p>
                  <p className="truncate text-[0.65rem] opacity-80">{s.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Pressure + Defense line */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">
            Presión
          </p>
          <div className="grid grid-cols-3 gap-2">
            {pressureOpts.map((o) => {
              const active = tactics.pressure === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => updateTactics({ pressure: o.id })}
                  className={`flex flex-col items-center gap-1 rounded-lg border-2 py-2 text-xs font-bold transition ${
                    active ? "border-primary bg-primary/10 text-primary" : "border-border/60 bg-card/60 text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <o.icon className="h-4 w-4" />
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">
            Línea defensiva
          </p>
          <div className="grid grid-cols-3 gap-2">
            {lineOpts.map((o) => {
              const active = tactics.defenseLine === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => updateTactics({ defenseLine: o.id })}
                  className={`flex flex-col items-center gap-1 rounded-lg border-2 py-2 text-xs font-bold transition ${
                    active ? "border-accent bg-accent/10 text-accent" : "border-border/60 bg-card/60 text-muted-foreground hover:border-accent/40"
                  }`}
                >
                  <o.icon className="h-4 w-4" />
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Captain & set-piece takers */}
      <div>
        <p className="mb-2 text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">
          Capitán y lanzadores
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <TakerSelect
            label="Capitán"
            icon={Crown}
            value={tactics.captainId}
            onChange={(id) => updateTactics({ captainId: id })}
            tone="border-amber-500/40 bg-amber-500/10 text-amber-300"
          />
          <TakerSelect
            label="Penaltis"
            icon={Goal}
            value={tactics.penaltyTakerId}
            onChange={(id) => updateTactics({ penaltyTakerId: id })}
            tone="border-rose-500/40 bg-rose-500/10 text-rose-300"
          />
          <TakerSelect
            label="Faltas"
            icon={Flag}
            value={tactics.freekickTakerId}
            onChange={(id) => updateTactics({ freekickTakerId: id })}
            tone="border-primary/40 bg-primary/10 text-primary"
          />
          <TakerSelect
            label="Córners"
            icon={CornerDownRight}
            value={tactics.cornerTakerId}
            onChange={(id) => updateTactics({ cornerTakerId: id })}
            tone="border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          />
        </div>
      </div>
    </div>
  );
}
