import { createFileRoute, Link, useNavigate, useSearch, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadSave,
  SaveGame,
  saveSave,
  setLineup,
  setFormation,
  setSubstitutes,
} from "@/lib/store";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import { TeamLogo } from "@/components/TeamLogo";
import { defaultLineup } from "@/data/players";
import { PlayersLoading, usePlayersReady } from "@/components/PlayersLoading";
import { usePlayersStore } from "@/store/playersStore";
import { FootballPitch, PlayerNode } from "@/components/FootballPitch";
import { PlayerFace } from "@/components/PlayerFace";
import { faceUrl } from "@/lib/playerFaces";
import {
  ALL_FORMATIONS,
  FORMATION_COORDINATES,
  getFormationPositions,
  slotPosCode,
  type FormationName,
  type PositionRole,
} from "@/lib/formations";
import {
  canPlayPosition,
  formatPositions,
  isNaturalFor,
  playerPosCodes,
  POS_NAME,
  type PosCode,
} from "@/lib/positions";
import { toast } from "sonner";
import {
  loadTactics,
  saveTactics,
  loadTacticPlans,
  saveTacticPlans,
  createTacticPlan,
  type TacticPlanState,
  type TeamTactics,
  type PlayStyle,
  type Pressure,
  type DefenseLine,
} from "@/lib/teamTactics";
import {
  Shield,
  Swords,
  Scale,
  ChevronsDown,
  ChevronsUp,
  Minus,
  Crown,
  Goal,
  Flag,
  CornerDownRight,
  CalendarClock,
  Plus,
} from "lucide-react";
import { loadLive, saveLive, subLimits, isFreeWindow, type LiveMatchState } from "@/lib/liveMatch";
import { btnPrimary, btnSecondary, infoChip } from "@/components/match/matchUi";

// Demarcación exacta que exige cada hueco del 11 titular (GK, DFC, MI, ED...).
function emptySlotLabel(posKey: string): PosCode {
  return slotPosCode(posKey);
}

export const Route = createFileRoute("/lineup")({ component: LineupPage });

/** Demarcaciones del jugador: principal y alternativas, todas al mismo nivel. */
function posCodesOf(player: { positions?: any; position?: string }): PosCode[] {
  return playerPosCodes(player as any);
}

function posLabelOf(player: { positions?: any; position?: string }): string {
  return formatPositions(posCodesOf(player));
}

/** ¿Puede este jugador ocupar un hueco que pide `slot`? */
function canPlayInSlot(player: { positions?: any; position?: string }, slot: PosCode): boolean {
  return canPlayPosition(posCodesOf(player), slot);
}

function invalidPositionMessage(
  player: { name: string; positions?: any; position?: string },
  slot: PosCode,
): string {
  return `Posición inválida: ${player.name} juega de ${posLabelOf(player)} y no puede jugar de ${POS_NAME[slot]} (${slot}).`;
}

function LineupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const search = useSearch({ from: "/lineup" });
  const { ready, loading } = usePlayersReady();
  const getSimSquad = usePlayersStore((s) => s.getSimSquad);
  // Suscripciones reactivas: `getSimSquad` es una referencia estable, así que
  // por sí sola nunca vuelve a ejecutar el `useMemo` de abajo. Al vender o
  // ceder a un jugador cambian `rosterIds` y `clubOverrides`, y es eso lo que
  // debe reconstruir la plantilla de Dirección de equipo en el acto.
  const rosterIds = usePlayersStore((s) => s.rosterIds);
  const clubOverrides = usePlayersStore((s) => s.clubOverrides);
  const [save, setSave] = useState<SaveGame | null>(null);
  const [selectedFormation, setSelectedFormation] = useState<FormationName>("Táctica 4-3-3");
  const [startingXI, setStartingXI] = useState<string[]>([]);
  const [bench, setBench] = useState<string[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [tacticPlanState, setTacticPlanState] = useState<TacticPlanState | null>(null);
  const initializedPlanTeamRef = useRef<string | null>(null);
  const processedForMdRef = useRef<number>(-1);
  const suspensionProcessedForMdRef = useRef<number>(-1);

  // Check if user navigated from "Temporada" screen
  const fromSeason = (search as any)?.from === "season";
  // Check if user navigated from "Match" screen
  const routerState = location.state as any;
  const fromMatch = routerState?.fromMatch === true;

  // Extract match metadata from router state (if passed from season or match page)
  const matchType = routerState?.matchType as "LEAGUE" | "CUP" | "UCL" | undefined;
  const cupRound = routerState?.cupRound as string | undefined;
  const fixtureId = routerState?.fixtureId as string | undefined;
  const returningFromLineupEdit = routerState?.returningFromLineupEdit === true;
  // Live mode: the match is paused and we must come back to the exact minute.
  const liveMode = routerState?.liveMatch === true;
  const [live, setLive] = useState<LiveMatchState | null>(null);
  const liveBaseXIRef = useRef<string[]>([]);
  // Players taken off the pitch during this live edit (cannot come back).
  const liveGoneRef = useRef<string[]>([]);

  useEffect(() => {
    const s = loadSave();
    if (!s) {
      navigate({ to: "/" });
      return;
    }
    setSave(s);

    if (liveMode) {
      const st = loadLive(fixtureId);
      if (st) {
        setLive(st);
        liveBaseXIRef.current = st.lineup;
        setStartingXI(st.lineup);
        setBench(st.bench);
        setSelectedFormation((st.formation || "Táctica 4-3-3") as FormationName);
        return;
      }
    }

    // Initialize lineup from save
    const savedLineup = s.lineups[s.myTeamId] ?? [];
    if (savedLineup.length > 0) {
      setStartingXI(savedLineup.slice(0, 11));
      const squad = getSimSquad(s.myTeamId);
      const benchPlayers = squad.filter((p) => !savedLineup.includes(p.id)).map((p) => p.id);
      setBench(benchPlayers);
    }

    // Initialize formation from save
    const savedFormation = s.formations[s.myTeamId] ?? "Táctica 4-3-3";
    setSelectedFormation(savedFormation as FormationName);
  }, [navigate, getSimSquad, liveMode, fixtureId]);

  // Tactical plans are independent presets: each one stores its own XI,
  // formation, 0-12 substitutes and advanced tactical instructions.
  useEffect(() => {
    if (liveMode || !save || !ready) return;
    if (initializedPlanTeamRef.current === save.myTeamId) return;

    const loaded = loadTacticPlans(save.myTeamId);
    const state =
      loaded && loaded.plans.length > 0
        ? loaded
        : {
            activeId: "plan-a",
            plans: [
              createTacticPlan({
                id: "plan-a",
                name: "Plan A",
                formation: save.formations[save.myTeamId] ?? "Táctica 4-3-3",
                lineup: save.lineups[save.myTeamId] ?? [],
                substitutes: save.substitutes?.[save.myTeamId] ?? [],
                tactics: loadTactics(save.myTeamId),
              }),
            ],
          };

    const active =
      state.plans.find((plan) => plan.id === state.activeId) ??
      state.plans[0];
    if (!active) return;

    setTacticPlanState(state);
    setSelectedFormation((active.formation || save.formations[save.myTeamId] || "Táctica 4-3-3") as FormationName);
    setStartingXI(
      active.lineup.length > 0 ? active.lineup.slice(0, 11) : (save.lineups[save.myTeamId] ?? []).slice(0, 11),
    );
    setBench(
      (active.substitutes.length > 0
        ? active.substitutes
        : (save.substitutes?.[save.myTeamId] ?? [])
      ).slice(0, 12),
    );
    setTactics(active.tactics);

    if (!loaded) {
      saveTacticPlans(save.myTeamId, state);
    }

    initializedPlanTeamRef.current = save.myTeamId;
  }, [save, ready, liveMode]);

  const squad = useMemo(
    () => (save && ready ? getSimSquad(save.myTeamId) : []),
    [save, ready, getSimSquad, rosterIds, clubOverrides],
  );
  const leagueMd = save ? save.currentMatchday[save.myLeague] : 0;

  // Sincronización inmediata de Dirección de equipo con la plantilla real.
  // Una venta/cesión cambia `squad` en el store en el mismo evento que cierra
  // la operación; el XI y el banquillo locales también deben eliminar al
  // futbolista en ese mismo render, sin esperar a avanzar días. El hueco que
  // deja en el once queda libre a propósito.
  useEffect(() => {
    if (liveMode || !save || !ready || squad.length === 0) return;
    const available = new Set(squad.map((player) => player.id));

    // Un jugador que ya no está en la plantilla deja su hueco VACÍO en la
    // pizarra: no se rellena solo con otro futbolista. El slot se conserva
    // como cadena vacía para no descolocar el resto del dibujo, y el usuario
    // decide a quién pone ahí.
    const nextXI = startingXI.map((id) => (id && available.has(id) ? id : ""));

    const inXI = new Set(nextXI.filter((id) => id));
    // Only the manually selected maximum of 12 players remain convocados.
    // New arrivals and the rest of the roster stay in Reservas until the user
    // explicitly promotes them to the bench.
    const nextBench = bench
      .filter((id) => available.has(id) && !inXI.has(id))
      .slice(0, 12);

    const sameArray = (a: string[], b: string[]) =>
      a.length === b.length && a.every((id, i) => id === b[i]);

    if (!sameArray(nextXI, startingXI)) setStartingXI(nextXI);
    if (!sameArray(nextBench, bench)) setBench(nextBench);
  }, [squad, liveMode, save, ready, startingXI, bench]);

  useEffect(() => {
    if (liveMode) return;
    if (!save || !ready || squad.length === 0) return;
    if (startingXI.length === 0) {
      const fallbackXI = defaultLineup(squad);
      setStartingXI(fallbackXI);
      return;
    }

    // Old saves did not distinguish convocados from reservas. On first load,
    // migrate them by taking the first 12 available players as the bench.
    const configured = save.substitutes?.[save.myTeamId];
    const activePlan = tacticPlanState?.plans.find((plan) => plan.id === tacticPlanState.activeId);
    const hasPlanSelection = !!activePlan && activePlan.substitutes.length > 0;
    if (bench.length === 0 && configured === undefined && !hasPlanSelection) {
      const defaults = squad
        .filter((player) => !startingXI.includes(player.id))
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 12)
        .map((player) => player.id);
      setBench(defaults);
    }
  }, [save, ready, squad, startingXI, bench.length, liveMode, tacticPlanState]);

  // Automated injury detection and handling
  useEffect(() => {
    if (liveMode) return; // during a live match the XI is controlled by the match screen
    if (!save || startingXI.length === 0) return;
    if (processedForMdRef.current === leagueMd) return;

    const injuredPlayers = squad.filter(
      (p) => startingXI.includes(p.id) && p.injuredUntil > leagueMd,
    );

    if (injuredPlayers.length > 0) {
      let newStartingXI = [...startingXI];
      let newBench = [...bench];

      // Process each injured player
      injuredPlayers.forEach((injuredPlayer) => {
        // Find a healthy replacement from bench with compatible position
        const healthyBench = squad.filter(
          (p) =>
            newBench.includes(p.id) &&
            p.injuredUntil <= leagueMd &&
            p.positions.some((pos) => injuredPlayer.positions.includes(pos)),
        );

        if (healthyBench.length > 0) {
          const replacement = healthyBench[0];
          newStartingXI = newStartingXI.map((id) =>
            id === injuredPlayer.id ? replacement.id : id,
          );
          newBench = newBench.map((id) => (id === replacement.id ? injuredPlayer.id : id));
        } else {
          newStartingXI = newStartingXI.filter((id) => id !== injuredPlayer.id);
          newBench = [...newBench, injuredPlayer.id];
        }
      });

      setStartingXI(newStartingXI);
      setBench(newBench);
      processedForMdRef.current = leagueMd;

      // Auto-save lineup exactly as if the user clicked Guardar
      if (save && newStartingXI.filter((id) => id && id.trim() !== "").length === 11) {
        const suspensions = save.suspensions[save.myTeamId] ?? [];
        const suspendedPlayerIds = new Set(
          suspensions.filter((s) => s.matchdaysRemaining > 0).map((s) => s.playerId),
        );
        const filteredXI = newStartingXI.filter((id) => !suspendedPlayerIds.has(id));
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
    if (liveMode) return;
    if (!save || startingXI.length === 0) return;
    if (suspensionProcessedForMdRef.current === leagueMd) return;

    const suspensions = save.suspensions[save.myTeamId] ?? [];
    const suspendedPlayerIds = new Set(
      suspensions.filter((s) => s.matchdaysRemaining > 0).map((s) => s.playerId),
    );

    const suspendedPlayers = squad.filter(
      (p) => startingXI.includes(p.id) && suspendedPlayerIds.has(p.id),
    );

    if (suspendedPlayers.length > 0) {
      let newStartingXI = [...startingXI];
      let newBench = [...bench];

      // Process each suspended player
      suspendedPlayers.forEach((suspendedPlayer) => {
        // Find a healthy replacement from bench (not injured or suspended)
        const healthyBench = squad.filter(
          (p) =>
            newBench.includes(p.id) &&
            p.injuredUntil <= leagueMd &&
            !suspendedPlayerIds.has(p.id) &&
            p.positions.some((pos) => suspendedPlayer.positions.includes(pos)),
        );

        if (healthyBench.length > 0) {
          const replacement = healthyBench[0];
          newStartingXI = newStartingXI.map((id) =>
            id === suspendedPlayer.id ? replacement.id : id,
          );
          newBench = newBench.map((id) => (id === replacement.id ? suspendedPlayer.id : id));
        } else {
          newStartingXI = newStartingXI.filter((id) => id !== suspendedPlayer.id);
          newBench = [...newBench, suspendedPlayer.id];
        }
      });

      setStartingXI(newStartingXI);
      setBench(newBench);
      suspensionProcessedForMdRef.current = leagueMd;

      // Auto-save lineup exactly as if the user clicked Guardar
      if (save && newStartingXI.filter((id) => id && id.trim() !== "").length === 11) {
        const filteredXI = newStartingXI.filter((id) => !suspendedPlayerIds.has(id));
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
    return startingXI.map((id) => squad.find((p) => p.id === id));
  }, [startingXI, squad]);

  const benchPlayers = useMemo(() => {
    return bench.map((id) => squad.find((p) => p.id === id)).filter(Boolean);
  }, [bench, squad]);

  const reservePlayers = useMemo(() => {
    const xiIds = new Set(startingXI.filter(Boolean));
    const benchIds = new Set(bench);
    return squad.filter((player) => !xiIds.has(player.id) && !benchIds.has(player.id));
  }, [squad, startingXI, bench]);

  // Count only valid, non-null players in starting XI
  const activeStartersCount = useMemo(() => {
    return startingXI.filter((id) => id && id.trim() !== "").length;
  }, [startingXI]);

  const isLineupComplete = activeStartersCount === 11;

  const formationPositions = getFormationPositions(selectedFormation);

  // ---- Tácticas / planes de juego ---------------------------------------
  const [tactics, setTactics] = useState<TeamTactics>(() => loadTactics(save?.myTeamId ?? ""));

  function persistCurrentPlan(commitSave = true) {
    if (!save || !tacticPlanState) {
      return { state: tacticPlanState, committedSave: save };
    }

    const selectedIds = Array.from(new Set(bench.filter((id) => id && !startingXI.includes(id)))).slice(0, 12);
    const nextState: TacticPlanState = {
      activeId: tacticPlanState.activeId,
      plans: tacticPlanState.plans.map((plan) =>
        plan.id === tacticPlanState.activeId
          ? {
              ...plan,
              formation: selectedFormation,
              lineup: [...startingXI],
              substitutes: selectedIds,
              tactics: { ...tactics },
            }
          : plan,
      ),
    };

    setTacticPlanState(nextState);
    saveTacticPlans(save.myTeamId, nextState);

    let committedSave = save;
    if (commitSave && startingXI.filter(Boolean).length === 11) {
      committedSave = setLineup(committedSave, save.myTeamId, startingXI.filter(Boolean));
      committedSave = setFormation(committedSave, save.myTeamId, selectedFormation);
      committedSave = setSubstitutes(committedSave, save.myTeamId, selectedIds);
      saveSave(committedSave);
      setSave(committedSave);
    }

    return { state: nextState, committedSave };
  }

  function handlePlanSelect(planId: string) {
    if (!save || liveMode || !tacticPlanState) return;
    if (planId === tacticPlanState.activeId) return;

    const current = persistCurrentPlan(isLineupComplete);
    if (!current.state) return;

    const target = current.state.plans.find((plan) => plan.id === planId);
    if (!target) return;

    const nextState: TacticPlanState = { ...current.state, activeId: target.id };
    saveTacticPlans(save.myTeamId, nextState);
    setTacticPlanState(nextState);
    setSelectedFormation(target.formation as FormationName);
    setStartingXI(target.lineup.slice(0, 11));
    setBench(target.substitutes.slice(0, 12));
    setTactics(target.tactics);

    const targetIsComplete = target.lineup.filter(Boolean).length === 11;
    if (targetIsComplete) {
      let nextSave = current.committedSave ?? save;
      nextSave = setLineup(nextSave, save.myTeamId, target.lineup.filter(Boolean));
      nextSave = setFormation(nextSave, save.myTeamId, target.formation);
      nextSave = setSubstitutes(nextSave, save.myTeamId, target.substitutes);
      saveSave(nextSave);
      setSave(nextSave);
    }

    toast.success(`${target.name} activado`);
  }

  function addTacticPlan() {
    if (!save || liveMode || !tacticPlanState) return;
    if (tacticPlanState.plans.length >= 3) {
      toast.info("Solo puedes tener hasta 3 planes de juego.");
      return;
    }

    const current = persistCurrentPlan(isLineupComplete);
    const basePlans = current.state?.plans ?? tacticPlanState.plans;
    const nextIndex = basePlans.length;
    const newPlan = createTacticPlan({
      id: `plan-${String.fromCharCode(97 + nextIndex)}`,
      name: `Plan ${String.fromCharCode(65 + nextIndex)}`,
      formation: selectedFormation,
      lineup: startingXI,
      substitutes: bench,
      tactics,
    });
    const nextState: TacticPlanState = {
      activeId: newPlan.id,
      plans: [...basePlans, newPlan].slice(0, 3),
    };

    saveTacticPlans(save.myTeamId, nextState);
    setTacticPlanState(nextState);
    setSelectedFormation(newPlan.formation as FormationName);
    setStartingXI(newPlan.lineup.slice(0, 11));
    setBench(newPlan.substitutes.slice(0, 12));
    setTactics(newPlan.tactics);
    toast.success(`${newPlan.name} creado. Ya puedes modificarlo libremente.`);
  }

  function updateTactics(patch: Partial<TeamTactics>) {
    const next = { ...tactics, ...patch };
    setTactics(next);
    if (save?.myTeamId) saveTactics(save.myTeamId, next);
    setTacticPlanState((state) =>
      state
        ? {
            ...state,
            plans: state.plans.map((plan) =>
              plan.id === state.activeId ? { ...plan, tactics: next } : plan,
            ),
          }
        : state,
    );
  }

  // Map players to formation positions
  const playerPositions = useMemo(() => {
    const positions: { [key: string]: any } = {};
    const positionKeys = Object.keys(FORMATION_COORDINATES[selectedFormation]);

    // Map directly from startingXI to position keys
    // startingXI maintains the correct order as built in handleFormationChange
    positionKeys.forEach((posKey, index) => {
      if (index < startingXI.length && startingXI[index]) {
        const player = squad.find((p) => p.id === startingXI[index]);
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

  // Next match (league only, simple lookup)
  const nextMatch = useMemo(() => {
    if (!save) return null;
    const myId = save.myTeamId;
    const all = save.fixtures[save.myLeague] ?? [];
    const upcoming = all.find((f) => !f.result && (f.homeId === myId || f.awayId === myId));
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
  function getSlotCodeForKey(posKey: string): PosCode {
    return slotPosCode(posKey);
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
        const player1 = squad.find((p) => p.id === selectedPlayer);
        const player2 = squad.find((p) => p.id === playerId);

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
        const slot1 = getSlotCodeForKey(posKey1);
        const slot2 = getSlotCodeForKey(posKey2);

        // Validate that player2 can play in player1's position
        if (!canPlayInSlot(player2, slot1)) {
          toast.error(invalidPositionMessage(player2, slot1));
          setSelectedPlayer(null);
          return;
        }

        // Validate that player1 can play in player2's position
        if (!canPlayInSlot(player1, slot2)) {
          toast.error(invalidPositionMessage(player1, slot2));
          setSelectedPlayer(null);
          return;
        }

        // Swap positions in startingXI array
        setStartingXI((prev) => {
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
    const player = squad.find((p) => p.id === playerId);
    if (!player) return;

    // Check if player is injured
    if (player.injuredUntil > leagueMd) {
      toast.error(`${player.name} está lesionado y no puede jugar.`);
      return;
    }

    // Check if player is suspended
    const suspensions = save?.suspensions[save.myTeamId] ?? [];
    const suspendedPlayerIds = new Set(
      suspensions.filter((s) => s.matchdaysRemaining > 0).map((s) => s.playerId),
    );
    if (suspendedPlayerIds.has(player.id)) {
      const suspension = suspensions.find((s) => s.playerId === player.id);
      const matchdays = suspension?.matchdaysRemaining || 0;
      toast.error(
        `${player.name} está suspendido por ${matchdays} partido${matchdays > 1 ? "s" : ""} y no puede jugar.`,
      );
      return;
    }

    if (selectedPlayer === null) {
      setSelectedPlayer(playerId);
    } else if (selectedPlayer === playerId) {
      setSelectedPlayer(null);
    } else if (startingXI.includes(selectedPlayer)) {
      // Pitch player selected, bench player clicked - swap
      handlePitchToBenchSwap(selectedPlayer, playerId);
    } else if (reservePlayers.some((p) => p.id === selectedPlayer)) {
      // Reserve player selected, bench player clicked - direct exchange.
      const reserveId = selectedPlayer;
      setBench((prev) => prev.map((id) => (id === playerId ? reserveId : id)));
      setSelectedPlayer(null);
    } else {
      // Both are on the bench - swap their order.
      setBench((prev) => {
        const newBench = [...prev];
        const idx1 = newBench.indexOf(selectedPlayer);
        const idx2 = newBench.indexOf(playerId);
        [newBench[idx1], newBench[idx2]] = [newBench[idx2], newBench[idx1]];
        return newBench;
      });
      setSelectedPlayer(null);
    }
  }

  /** Players that already left the pitch in this match and cannot come back. */
  function liveGoneIds(): Set<string> {
    if (!live) return new Set<string>();
    return new Set<string>([
      ...(live.gone || []),
      ...(live.subs || []).map((s: any) => s.outId),
      ...liveGoneRef.current,
    ]);
  }

  /**
   * In live mode the number of substitutions (and windows) is limited: block any
   * bench -> XI move once there are no changes/windows left. A player who has
   * already been substituted off can never return to the pitch.
   */
  function liveSubBlocked(benchPlayerId: string): boolean {
    if (!liveMode || !live) return false;
    if (liveGoneIds().has(benchPlayerId)) {
      toast.error("Ese jugador ya ha sido sustituido y no puede volver al campo.");
      setSelectedPlayer(null);
      return true;
    }
    const limits = subLimits(live.isExtraTime);
    const free = isFreeWindow(live.phase);
    const inIds = startingXI.filter((id) => !liveBaseXIRef.current.includes(id));
    const outIds = liveBaseXIRef.current.filter((id) => !startingXI.includes(id));
    const changes = Math.min(outIds.length, inIds.length);
    if (live.subsUsed + changes + 1 > limits.maxSubs) {
      toast.error(
        `No te quedan cambios disponibles (${live.subsUsed + changes}/${limits.maxSubs}).`,
      );
      setSelectedPlayer(null);
      return true;
    }
    if (!free && changes === 0 && live.windowsUsed >= limits.maxWindows) {
      toast.error(`No te quedan ventanas de cambio (${live.windowsUsed}/${limits.maxWindows}).`);
      setSelectedPlayer(null);
      return true;
    }
    return false;
  }

  function handlePitchToBenchSwap(pitchPlayerId: string, benchPlayerId: string) {
    const pitchPlayer = squad.find((p) => p.id === pitchPlayerId);
    const benchPlayer = squad.find((p) => p.id === benchPlayerId);

    if (!pitchPlayer || !benchPlayer) return;
    if (liveSubBlocked(benchPlayerId)) return;

    // Check if bench player is injured
    if (benchPlayer.injuredUntil > leagueMd) {
      toast.error(`${benchPlayer.name} está lesionado y no puede jugar.`);
      setSelectedPlayer(null);
      return;
    }

    // Check if bench player is suspended
    const suspensions = save?.suspensions[save.myTeamId] ?? [];
    const suspendedPlayerIds = new Set(
      suspensions.filter((s) => s.matchdaysRemaining > 0).map((s) => s.playerId),
    );
    if (suspendedPlayerIds.has(benchPlayer.id)) {
      const suspension = suspensions.find((s) => s.playerId === benchPlayer.id);
      const matchdays = suspension?.matchdaysRemaining || 0;
      toast.error(
        `${benchPlayer.name} está suspendido por ${matchdays} partido${matchdays > 1 ? "s" : ""} y no puede jugar.`,
      );
      setSelectedPlayer(null);
      return;
    }

    // Get the position key where the pitch player is currently
    const posKey = getPlayerPositionKey(pitchPlayerId);
    if (!posKey) return;

    // Get the role required for this position
    const requiredSlot = getSlotCodeForKey(posKey);

    // Validate that the bench player can play in this role
    if (!canPlayInSlot(benchPlayer, requiredSlot)) {
      toast.error(invalidPositionMessage(benchPlayer, requiredSlot));
      setSelectedPlayer(null);
      return;
    }

    // Perform the swap
    setStartingXI((prev) => prev.map((id) => (id === pitchPlayerId ? benchPlayerId : id)));
    if (liveMode) {
      // During a live match the player who comes off is out for good.
      if (!liveGoneRef.current.includes(pitchPlayerId)) {
        liveGoneRef.current = [...liveGoneRef.current, pitchPlayerId];
      }
      setBench((prev) => prev.filter((id) => id !== benchPlayerId));
    } else {
      setBench((prev) => prev.map((id) => (id === benchPlayerId ? pitchPlayerId : id)));
    }
    setSelectedPlayer(null);
  }

  function handlePitchToEmptySwap(playerId: string, emptyPosKey: string) {
    const player = squad.find((p) => p.id === playerId);
    if (!player) return;

    // Check if player is injured
    if (player.injuredUntil > leagueMd) {
      toast.error(`${player.name} está lesionado y no puede jugar.`);
      setSelectedPlayer(null);
      return;
    }

    // Check if player is suspended
    const suspensions = save?.suspensions[save.myTeamId] ?? [];
    const suspendedPlayerIds = new Set(
      suspensions.filter((s) => s.matchdaysRemaining > 0).map((s) => s.playerId),
    );
    if (suspendedPlayerIds.has(player.id)) {
      const suspension = suspensions.find((s) => s.playerId === player.id);
      const matchdays = suspension?.matchdaysRemaining || 0;
      toast.error(
        `${player.name} está suspendido por ${matchdays} partido${matchdays > 1 ? "s" : ""} y no puede jugar.`,
      );
      setSelectedPlayer(null);
      return;
    }

    // Get the role required for the empty position
    const requiredSlot = getSlotCodeForKey(emptyPosKey);

    // Validate that the player can play in this role
    if (!canPlayInSlot(player, requiredSlot)) {
      toast.error(invalidPositionMessage(player, requiredSlot));
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
    setStartingXI((prev) => {
      const newStarting = [...prev];
      newStarting[emptyPosIndex] = playerId;
      newStarting[currentPlayerPosIndex] = "";
      return newStarting;
    });

    setSelectedPlayer(null);
  }

  function handleBenchToPitchSwap(benchPlayerId: string, pitchTarget: string) {
    const benchPlayer = squad.find((p) => p.id === benchPlayerId);
    if (!benchPlayer) return;
    if (liveSubBlocked(benchPlayerId)) return;

    // Check if player is injured
    if (benchPlayer.injuredUntil > leagueMd) {
      toast.error(`${benchPlayer.name} está lesionado y no puede jugar.`);
      return;
    }

    // Check if player is suspended
    const suspensions = save?.suspensions[save.myTeamId] ?? [];
    const suspendedPlayerIds = new Set(
      suspensions.filter((s) => s.matchdaysRemaining > 0).map((s) => s.playerId),
    );
    if (suspendedPlayerIds.has(benchPlayer.id)) {
      const suspension = suspensions.find((s) => s.playerId === benchPlayer.id);
      const matchdays = suspension?.matchdaysRemaining || 0;
      toast.error(
        `${benchPlayer.name} está suspendido por ${matchdays} partido${matchdays > 1 ? "s" : ""} y no puede jugar.`,
      );
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
    const requiredSlot = getSlotCodeForKey(posKey);

    // Validate that the bench player can play in this role
    if (!canPlayInSlot(benchPlayer, requiredSlot)) {
      toast.error(invalidPositionMessage(benchPlayer, requiredSlot));
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
      setBench((prev) => prev.filter((id) => id !== benchPlayerId));
    } else {
      // Swap with existing player
      setStartingXI((prev) => prev.map((id) => (id === pitchTarget ? benchPlayerId : id)));
      setBench((prev) => prev.map((id) => (id === benchPlayerId ? pitchTarget : id)));
    }
    setSelectedPlayer(null);
  }

  function handleCallUpPlayer(playerId: string) {
    if (liveMode || bench.length >= 12) return;

    const player = squad.find((p) => p.id === playerId);
    if (!player) return;
    if (bench.includes(playerId) || startingXI.includes(playerId)) return;

    if (player.injuredUntil > leagueMd) {
      toast.error(`${player.name} está lesionado y no puede ser convocado.`);
      return;
    }

    const suspensions = save?.suspensions[save.myTeamId] ?? [];
    const suspended = suspensions.some(
      (s) => s.playerId === playerId && s.matchdaysRemaining > 0,
    );
    if (suspended) {
      toast.error(`${player.name} está suspendido y no puede ser convocado.`);
      return;
    }

    setBench((prev) => {
      if (prev.length >= 12 || prev.includes(playerId) || startingXI.includes(playerId)) {
        return prev;
      }
      return [...prev, playerId];
    });
    setSelectedPlayer(null);
  }

  function handleReservePlayerClick(playerId: string) {
    if (liveMode) return;

    const player = squad.find((p) => p.id === playerId);
    if (!player) return;

    if (player.injuredUntil > leagueMd) {
      toast.error(`${player.name} está lesionado y no puede ser convocado.`);
      return;
    }

    const suspensions = save?.suspensions[save.myTeamId] ?? [];
    const suspended = suspensions.some(
      (s) => s.playerId === playerId && s.matchdaysRemaining > 0,
    );
    if (suspended) {
      toast.error(`${player.name} está suspendido y no puede ser convocado.`);
      return;
    }

    if (selectedPlayer === null) {
      setSelectedPlayer(playerId);
      return;
    }

    if (selectedPlayer === playerId) {
      setSelectedPlayer(null);
      return;
    }

    if (bench.includes(selectedPlayer)) {
      const selectedBenchId = selectedPlayer;
      // Intercambio directo: el suplente pasa a reservas y el jugador de
      // reservas ocupa exactamente su plaza de suplente.
      setBench((prev) =>
        prev.map((id) => (id === selectedBenchId ? playerId : id)),
      );
      setSelectedPlayer(null);
      return;
    }

    // Si había otro jugador de reservas seleccionado, simplemente cambiamos
    // la selección para que el siguiente clic sea el segundo jugador.
    setSelectedPlayer(playerId);
  }

  function save_() {
    if (!save) return;
    if (!isLineupComplete) {
      toast.error("Plantilla incompleta. Faltan jugadores titulares.");
      return;
    }

    // Filter out suspended players from the lineup before saving.
    const suspensions = save.suspensions[save.myTeamId] ?? [];
    const suspendedPlayerIds = new Set(
      suspensions.filter((s) => s.matchdaysRemaining > 0).map((s) => s.playerId),
    );
    const filteredStartingXI = startingXI.filter((playerId) => !suspendedPlayerIds.has(playerId));
    const selectedSubstitutes = Array.from(
      new Set(bench.filter((id) => id && !filteredStartingXI.includes(id))),
    ).slice(0, 12);

    let next = setLineup(save, save.myTeamId, filteredStartingXI);
    next = setFormation(next, save.myTeamId, selectedFormation);
    next = setSubstitutes(next, save.myTeamId, selectedSubstitutes);
    saveSave(next);
    setSave(next);

    if (tacticPlanState) {
      const nextPlanState: TacticPlanState = {
        activeId: tacticPlanState.activeId,
        plans: tacticPlanState.plans.map((plan) =>
          plan.id === tacticPlanState.activeId
            ? {
                ...plan,
                formation: selectedFormation,
                lineup: [...filteredStartingXI],
                substitutes: selectedSubstitutes,
                tactics: { ...tactics },
              }
            : plan,
        ),
      };
      saveTacticPlans(save.myTeamId, nextPlanState);
      setTacticPlanState(nextPlanState);
    }

    toast.success("Plan de juego guardado correctamente");
  }

  function handleFormationChange(newFormation: FormationName) {
    setSelectedFormation(newFormation);

    const newFormationPositions = getFormationPositions(newFormation);

    // Reasignamos el 11 hueco a hueco por DEMARCACIÓN concreta.
    // Solo se permiten las posiciones que el jugador tenga realmente
    // declaradas (principal o alternativa); no se hacen conversiones.
    const availableIds = startingXI.filter((id) => !!id);
    const newStartingXI: string[] = [];

    newFormationPositions.forEach((posKey) => {
      const slot = slotPosCode(posKey);
      const pick = (predicate: (codes: PosCode[]) => boolean) =>
        availableIds.find((id) => {
          const player = squad.find((p) => p.id === id);
          return player ? predicate(posCodesOf(player)) : false;
        });

      const chosen = pick((codes) => isNaturalFor(codes, slot));

      if (chosen) {
        availableIds.splice(availableIds.indexOf(chosen), 1);
        newStartingXI.push(chosen);
      } else {
        // Sin jugador válido para esta demarcación: hueco vacío.
        newStartingXI.push("");
      }
    });

    // Keep empty strings to maintain correct position mapping.
    // Preserve the current convocados and move displaced starters to the bench
    // only while the 12-player limit still has room. Everyone else remains in
    // Reservas.
    setStartingXI(newStartingXI);
    const displacedStarters = startingXI.filter((id) => id && !newStartingXI.includes(id));
    const newBench = Array.from(
      new Set([
        ...bench.filter((id) => !newStartingXI.includes(id)),
        ...displacedStarters,
      ]),
    ).slice(0, 12);
    setBench(newBench);

    // No auto-save - only save when user explicitly clicks "Guardar".
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
              <p className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">
                OVR del 11
              </p>
              <p className="scoreline text-3xl font-black text-primary">{avgOvrXI || "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedFormation}
              onChange={(e) => handleFormationChange(e.target.value as FormationName)}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold transition hover:border-primary/60"
            >
              {ALL_FORMATIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            {!fromSeason && !fromMatch && (
              <button
                onClick={save_}
                disabled={!isLineupComplete}
                className="rounded-lg bg-primary px-5 py-2 text-sm font-bold text-primary-foreground glow-neon disabled:opacity-40 disabled:glow-cyan-0"
              >
                Guardar
              </button>
            )}
          </div>
        </div>
        <div className="border-t border-border/40 bg-background/40 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
                  isLineupComplete
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-destructive/40 bg-destructive/10 text-destructive"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${isLineupComplete ? "bg-emerald-400" : "bg-destructive"}`}
                />
                Titulares {activeStartersCount}/11
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs font-bold text-muted-foreground">
                Suplentes {bench.length}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs font-bold text-muted-foreground">
                Edad media {avgAgeXI}
              </span>
              {!isLineupComplete && (
                <span className="text-xs font-bold text-destructive">
                  La plantilla no está completa.
                </span>
              )}
            </div>
            <div className="scoreline text-xl font-black text-primary sm:text-2xl">
              {selectedFormation}
            </div>
          </div>
        </div>
      </div>

      {!liveMode && tacticPlanState && (
        <div className="panel mb-6 p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">
                Planes de juego
              </p>
              <p className="text-xs text-muted-foreground">
                Cada plan guarda su formación, 11, suplentes y tácticas avanzadas.
              </p>
            </div>
            <button
              type="button"
              onClick={addTacticPlan}
              disabled={tacticPlanState.plans.length >= 3}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-black text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              Añadir nueva táctica
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {tacticPlanState.plans.map((plan) => {
              const active = plan.id === tacticPlanState.activeId;
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => handlePlanSelect(plan.id)}
                  className={`rounded-xl border-2 p-3 text-left transition ${
                    active
                      ? "border-primary bg-primary/10 text-primary glow-cyan"
                      : "border-border/60 bg-card/60 hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-black">{plan.name}</span>
                    {active && (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[0.55rem] font-black uppercase">
                        Activo
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[0.65rem] text-muted-foreground">
                    {plan.formation}
                  </p>
                  <div className="mt-2 flex gap-2 text-[0.6rem] font-bold text-muted-foreground">
                    <span>{plan.lineup.filter(Boolean).length}/11 titulares</span>
                    <span>·</span>
                    <span>{plan.substitutes.length}/12 suplentes</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

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
              leagueName={
                LEAGUES[nextMatch.rival.league as LeagueId]?.name || nextMatch.rival.league
              }
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
                const suspendedPlayerIds = new Set(
                  suspensions.filter((s) => s.matchdaysRemaining > 0).map((s) => s.playerId),
                );
                const isSuspended = suspendedPlayerIds.has(player.id);
                return (
                  <PlayerNode
                    key={player.id}
                    player={{
                      id: player.id,
                      name: player.name,
                      rating: player.rating,
                      position: player.position,
                      slotLabel: getSlotCodeForKey(posKey),
                      otherPositions: posCodesOf(player).filter(
                        (c) => c !== getSlotCodeForKey(posKey),
                      ),
                      injured: player.injuredUntil > leagueMd,
                      suspended: isSuspended,
                      cardImage: player.cardImage,
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
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <div
                      className="w-[64px] h-[64px] rounded-full border-2 border-dashed border-primary/40 bg-background/40 flex flex-col items-center justify-center text-primary/70 text-[0.55rem] font-black leading-tight"
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

        {/* Convocados / reservas */}
        <div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Convocatoria
            </h2>
            <span className="text-[0.65rem] font-black text-muted-foreground">
              {bench.length}/12 suplentes
            </span>
          </div>

          <div className="panel p-4 space-y-2 max-h-[520px] overflow-y-auto">
            <div className="mb-3 flex items-center justify-between border-b border-border/50 pb-2">
              <div>
                <p className="text-xs font-black">Suplentes</p>
                <p className="text-[0.6rem] text-muted-foreground">
                  Son los únicos reservas disponibles para cambios durante el partido.
                </p>
              </div>
              <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-1 text-[0.6rem] font-black text-primary">
                {bench.length}/12
              </span>
            </div>

            {benchPlayers.map((player) => {
              if (!player) return null;
              const isInjured = player.injuredUntil > leagueMd;
              const suspensions = save?.suspensions[save.myTeamId] ?? [];
              const suspendedPlayerIds = new Set(
                suspensions.filter((s) => s.matchdaysRemaining > 0).map((s) => s.playerId),
              );
              const isSuspended = suspendedPlayerIds.has(player.id);
              const isUnavailable = isInjured || isSuspended;
              return (
                <div
                  key={player.id}
                  onClick={() => !isUnavailable && handleBenchPlayerClick(player.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition ${
                    isUnavailable
                      ? "opacity-40 cursor-not-allowed border-border bg-destructive/10"
                      : selectedPlayer === player.id
                        ? "border-primary bg-primary/10 glow-cyan cursor-pointer"
                        : "border-border bg-card hover:border-primary/60 cursor-pointer"
                  }`}
                >
                  <div className="relative shrink-0">
                    <PlayerFace
                      name={player.name}
                      image={faceUrl(player.id, player.cardImage)}
                      size={32}
                      showRing={false}
                      className="bg-secondary shadow"
                    />
                    <span className="absolute -bottom-1 -right-1 rounded-full bg-background/90 px-1 text-[0.55rem] font-black leading-tight text-foreground shadow">
                      {player.rating}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate text-sm flex items-center gap-1">
                      {player.name}
                      {isInjured && (
                        <span className="text-xs text-destructive">({player.injuredUntil - leagueMd}p)</span>
                      )}
                      {isSuspended && <span className="text-xs text-destructive">(SUS)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {posLabelOf(player)} · {player.age}a · {player.goals}G {player.assists}A
                    </div>
                  </div>
                  {selectedPlayer === player.id && <span className="text-primary text-lg">✓</span>}
                </div>
              );
            })}

            {bench.length === 0 && (
              <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                No hay suplentes convocados. Añade jugadores desde Reservas.
              </div>
            )}

            <div className="mt-5 border-t border-border/50 pt-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black">Reservas</p>
                  <p className="text-[0.6rem] text-muted-foreground">
                    No están convocados. Pulsa un suplente y después una reserva para intercambiarlos.
                  </p>
                </div>
                <span className="rounded-full border border-border/60 bg-card px-2 py-1 text-[0.6rem] font-black text-muted-foreground">
                  {reservePlayers.length}
                </span>
              </div>

              {reservePlayers.map((player) => {
                return (
                  <div
                    key={player.id}
                    onClick={() => handleReservePlayerClick(player.id)}
                    className={`mb-2 flex items-center gap-3 rounded-lg border-2 p-3 transition ${
                      selectedPlayer === player.id
                        ? "border-primary bg-primary/10 glow-cyan cursor-pointer"
                        : "border-border/60 bg-card/50 hover:border-primary/60 cursor-pointer"
                    }`}
                  >
                    <PlayerFace
                      name={player.name}
                      image={faceUrl(player.id, player.cardImage)}
                      size={30}
                      showRing={false}
                      className="bg-secondary shadow"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{player.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {posLabelOf(player)} · {player.age}a · OVR {player.rating}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {bench.length < 12 && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleCallUpPlayer(player.id);
                          }}
                          className="rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-[0.65rem] font-black text-primary transition hover:bg-primary/20"
                        >
                          Convocar
                        </button>
                      )}
                      {selectedPlayer === player.id && <span className="text-primary text-lg">✓</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Tactics panel */}
      <TacticsPanel tactics={tactics} updateTactics={updateTactics} xiPlayers={xiPlayers as any} />

      {liveMode &&
        live &&
        (() => {
          const limits = subLimits(live.isExtraTime);
          const outIds = liveBaseXIRef.current.filter((id) => !startingXI.includes(id));
          const inIds = startingXI.filter((id) => !liveBaseXIRef.current.includes(id));
          const changes = Math.min(outIds.length, inIds.length);
          const free = isFreeWindow(live.phase);
          const overSubs = live.subsUsed + changes > limits.maxSubs;
          const overWindows = changes > 0 && !free && live.windowsUsed >= limits.maxWindows;
          const blocked = overSubs || overWindows || !isLineupComplete;
          return (
            <div className="panel mt-8 p-5">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className={infoChip}>Partido en pausa · {live.minute}'</span>
                <span className={infoChip}>
                  Cambios {live.subsUsed + changes}/{limits.maxSubs}
                </span>
                <span className={infoChip}>
                  Ventanas {live.windowsUsed + (changes > 0 && !free ? 1 : 0)}/{limits.maxWindows}
                </span>
                {free && <span className={infoChip}>Descanso · no gasta ventana</span>}
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Cambia la táctica libremente. Si mueves jugadores del banquillo al once se contarán
                como sustituciones. Al volver, el partido sigue exactamente en el minuto{" "}
                {live.minute}.
              </p>
              {overSubs && (
                <p className="text-xs text-destructive mb-3">
                  Has superado el límite de sustituciones permitidas.
                </p>
              )}
              {overWindows && (
                <p className="text-xs text-destructive mb-3">
                  No te quedan ventanas de cambio: solo puedes ajustar la táctica.
                </p>
              )}
              <div className="flex justify-end">
                <button
                  disabled={blocked}
                  className={btnPrimary}
                  onClick={() => {
                    const goneList = Array.from(
                      new Set([...(live.gone || []), ...liveGoneRef.current, ...outIds]),
                    );
                    const nextBench = bench.filter(
                      (id) => !startingXI.includes(id) && !goneList.includes(id),
                    );
                    const stamina = { ...(live.stamina || {}) };
                    const subs = [...(live.subs || [])];
                    for (let i = 0; i < changes; i++) {
                      stamina[inIds[i]] = 100;
                      subs.push({
                        minute: live.minute,
                        outId: outIds[i],
                        outName: squad.find((p) => p.id === outIds[i])?.name ?? outIds[i],
                        inId: inIds[i],
                        inName: squad.find((p) => p.id === inIds[i])?.name ?? inIds[i],
                      });
                    }
                    saveLive({
                      ...live,
                      lineup: startingXI,
                      bench: nextBench,
                      gone: goneList,
                      formation: selectedFormation,
                      stamina,
                      subs,
                      subsUsed: live.subsUsed + changes,
                      windowsUsed: live.windowsUsed + (changes > 0 && !free ? 1 : 0),
                    });
                    navigate({
                      to: "/match",
                      state: { resumeLive: true, fixtureId: live.fixtureId } as any,
                    });
                  }}
                >
                  Volver al partido ({live.minute}') →
                </button>
              </div>
            </div>
          );
        })()}

      {!liveMode && (fromSeason || fromMatch) && (
        <div className="mt-8 flex justify-end">
          <button
            onClick={() => {
              if (!isLineupComplete) {
                toast.error("Plantilla incompleta. Faltan jugadores titulares.");
                return;
              }

              // Filter out suspended players from the lineup before passing to match
              const suspensions = save?.suspensions[save.myTeamId] ?? [];
              const suspendedPlayerIds = new Set(
                suspensions.filter((s) => s.matchdaysRemaining > 0).map((s) => s.playerId),
              );
              const filteredStartingXI = startingXI.filter(
                (playerId) => !suspendedPlayerIds.has(playerId),
              );

              // Persist the active plan itself even when this screen is editing
              // a one-off match configuration. The global SaveGame is still left
              // untouched until the match flow decides to restore it.
              persistCurrentPlan(false);

              // Pass temporary lineup to match engine via router state
              // This allows one-off changes for this specific match only
              // Also forward ALL match metadata (matchType, cupRound, fixtureId) for correct post-match simulation
              // If returning from lineup edit in a cup draw, pass returningFromLineupEdit to restore the draw state
              navigate({
                to: "/match",
                state: {
                  matchLineup: filteredStartingXI,
                  matchFormation: selectedFormation,
                  matchSubstitutes: bench
                    .filter((id) => id && !filteredStartingXI.includes(id))
                    .slice(0, 12),
                  matchType: matchType || "LEAGUE", // Default to LEAGUE if undefined
                  cupRound,
                  fixtureId,
                  returningFromLineupEdit: returningFromLineupEdit,
                } as any,
              });
            }}
            disabled={!isLineupComplete}
            className={
              isLineupComplete ? btnPrimary : `${btnSecondary} opacity-40 pointer-events-none`
            }
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
    {
      id: "defensive",
      label: "Defensivo",
      icon: Shield,
      tone: "border-sky-500/40 bg-sky-500/10 text-sky-300",
      desc: "Bloque bajo, contragolpe",
    },
    {
      id: "balanced",
      label: "Equilibrado",
      icon: Scale,
      tone: "border-primary/40 bg-primary/10 text-primary",
      desc: "Posesión y control",
    },
    {
      id: "offensive",
      label: "Ofensivo",
      icon: Swords,
      tone: "border-rose-500/40 bg-rose-500/10 text-rose-300",
      desc: "Presión arriba, ataque directo",
    },
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
                  active
                    ? `${s.tone} ring-2 ring-current/40`
                    : "border-border/60 bg-card/60 text-muted-foreground hover:border-primary/40"
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
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/60 bg-card/60 text-muted-foreground hover:border-primary/40"
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
                    active
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border/60 bg-card/60 text-muted-foreground hover:border-accent/40"
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
