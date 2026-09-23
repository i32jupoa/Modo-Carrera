import { createFileRoute, Link, useNavigate, useSearch, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadSave,
  SaveGame,
  saveSave,
  setLineup,
  setFormation,
  setSubstitutes,
  getMyNextFixtureAny,
} from "@/lib/store";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import { TeamLogo } from "@/components/TeamLogo";
import { defaultLineup } from "@/data/players";
import { PlayersLoading, usePlayersReady } from "@/components/PlayersLoading";
import { injuryRemainingDays, isPlayerInjuredAtDate, usePlayersStore } from "@/store/playersStore";
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
  Zap,
  Ambulance,
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

function formatInjuryShort(player: any, currentDate: string, leagueMd: number): string {
  const days = injuryRemainingDays(player, currentDate, leagueMd);
  if (days <= 0) return "recuperado";
  if (days < 7) return `${days}d`;
  if (days < 14) return "1 semana";
  if (days < 28) return `${Math.round(days / 7)} semanas`;
  return `${Math.max(1, Math.round(days / 30))} ${Math.round(days / 30) === 1 ? "mes" : "meses"}`;
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
  const currentDate = usePlayersStore((s) => s.currentDate);
  const clubOverrides = usePlayersStore((s) => s.clubOverrides);
  const playerStats = usePlayersStore((s) => s.stats);
  const [save, setSave] = useState<SaveGame | null>(null);
  const [selectedFormation, setSelectedFormation] = useState<FormationName>("Táctica 4-3-3");
  const [startingXI, setStartingXI] = useState<string[]>([]);
  const [bench, setBench] = useState<string[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  // A normal empty slot (including an injury/🚑 slot) can be selected first and
  // then filled by a starter, substitute or reserve.
  const [selectedEmptySlot, setSelectedEmptySlot] = useState<string | null>(null);
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
  const activeCompetition = matchType
    ? matchType === "CUP"
      ? "cup"
      : matchType === "UCL"
        ? "ucl"
        : "league"
    : save
      ? getMyNextFixtureAny(save)?.competition ?? "league"
      : "league";
  const [live, setLive] = useState<LiveMatchState | null>(null);
  const liveBaseXIRef = useRef<string[]>([]);
  // Players taken off the pitch during this live edit (cannot come back).
  const liveGoneRef = useRef<string[]>([]);
  // Red cards leave a vacancy that the manager chooses explicitly. No formation
  // slot is assigned automatically; once chosen, the hole can be moved again by
  // rearranging a player already on the pitch.
  const liveGoneSlotIndexesRef = useRef<Record<string, number>>({});
  // Clicking a placed red-card hole arms a dedicated move mode. The manager
  // then clicks the player whose current position should become the new hole.
  const [selectedRedHolePlayerId, setSelectedRedHolePlayerId] = useState<string | null>(null);
  // Injury replacements are mandatory when a change is available.
  const livePendingForcedInjurySlotsRef = useRef<Record<string, number>>({});

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
        liveGoneRef.current = [...(st.gone || [])];
        liveGoneSlotIndexesRef.current = { ...((st as any).goneSlotIndexes || {}) };
        livePendingForcedInjurySlotsRef.current = { ...((st as any).pendingForcedInjurySlots || {}) };
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

    const active = state.plans.find((plan) => plan.id === state.activeId) ?? state.plans[0];
    if (!active) return;

    setTacticPlanState(state);
    setSelectedFormation(
      (active.formation || save.formations[save.myTeamId] || "Táctica 4-3-3") as FormationName,
    );
    setStartingXI(
      active.lineup.length > 0
        ? active.lineup.slice(0, 11)
        : (save.lineups[save.myTeamId] ?? []).slice(0, 11),
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
    [save, ready, getSimSquad, rosterIds, clubOverrides, playerStats],
  );
  const leagueMd = save ? save.currentMatchday[save.myLeague] : 0;
  const isCurrentlyInjured = (player: any) => isPlayerInjuredAtDate(player, currentDate, leagueMd);

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
    const nextXI = startingXI.map((id) => {
      if (!id || !available.has(id)) return "";
      const player = squad.find((p) => p.id === id);
      return player && !isCurrentlyInjured(player) ? id : "";
    });

    const inXI = new Set(nextXI.filter((id) => id));
    // Only the manually selected maximum of 12 healthy players remain
    // convocados. Injured players are deliberately moved to Reservas.
    const nextBench = bench
      .filter((id) => {
        if (!available.has(id) || inXI.has(id)) return false;
        const player = squad.find((p) => p.id === id);
        return !!player && !isCurrentlyInjured(player);
      })
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
        .filter((player) => !startingXI.includes(player.id) && !isCurrentlyInjured(player))
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 12)
        .map((player) => player.id);
      setBench(defaults);
    }
  }, [save, ready, squad, startingXI, bench.length, liveMode, tacticPlanState]);

  // Automated injury handling: an injured player is NEVER allowed in the XI
  // or in the 12 convocados. The player is left in Reservas until recovery.
  useEffect(() => {
    if (liveMode || !save || !ready || squad.length === 0) return;

    const injuredIds = new Set(squad.filter((p) => isCurrentlyInjured(p)).map((p) => p.id));
    if (injuredIds.size === 0) return;

    const nextXI = startingXI.map((id) => (id && injuredIds.has(id) ? "" : id));
    const nextBench = bench.filter((id) => !injuredIds.has(id)).slice(0, 12);

    const cleanedPlans = tacticPlanState
      ? tacticPlanState.plans.map((plan) => ({
          ...plan,
          lineup: plan.lineup.filter((id) => !injuredIds.has(id)),
          substitutes: plan.substitutes.filter((id) => !injuredIds.has(id)).slice(0, 12),
        }))
      : [];
    const plansChanged = tacticPlanState
      ? cleanedPlans.some(
          (plan, index) =>
            plan.lineup.length !== tacticPlanState.plans[index].lineup.length ||
            plan.lineup.some((id, i) => id !== tacticPlanState.plans[index].lineup[i]) ||
            plan.substitutes.length !== tacticPlanState.plans[index].substitutes.length ||
            plan.substitutes.some((id, i) => id !== tacticPlanState.plans[index].substitutes[i]),
        )
      : false;

    const lineupChanged =
      nextXI.length !== startingXI.length ||
      nextXI.some((id, index) => id !== startingXI[index]) ||
      nextBench.length !== bench.length ||
      nextBench.some((id, index) => id !== bench[index]);

    if (!lineupChanged && !plansChanged) return;

    setStartingXI(nextXI);
    setBench(nextBench);
    setSelectedPlayer((selected) => (selected && injuredIds.has(selected) ? null : selected));

    let nextSave = setLineup(save, save.myTeamId, nextXI.filter(Boolean));
    nextSave = setSubstitutes(nextSave, save.myTeamId, nextBench);
    saveSave(nextSave);
    setSave(nextSave);

    if (tacticPlanState && plansChanged) {
      const nextPlanState: TacticPlanState = {
        activeId: tacticPlanState.activeId,
        plans: cleanedPlans,
      };
      setTacticPlanState(nextPlanState);
      saveTacticPlans(save.myTeamId, nextPlanState);
    }
  }, [save, squad, startingXI, bench, currentDate, ready, liveMode, tacticPlanState]);

  // Automated suspension detection and handling
  useEffect(() => {
    if (liveMode) return;
    if (!save || startingXI.length === 0) return;
    if (suspensionProcessedForMdRef.current === leagueMd) return;

    const suspensions = save.suspensions[save.myTeamId] ?? [];
    const suspendedPlayerIds = new Set(
      suspensions.filter((s) => s.matchdaysRemaining > 0 && (s.competition ?? "league") === activeCompetition).map((s) => s.playerId),
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
            !isCurrentlyInjured(p) &&
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
  const liveRedCardIds = useMemo(() => {
    if (!liveMode || !live || !save) return [] as string[];
    const side = live.result?.homeId === save.myTeamId ? "home" : "away";
    return Array.from(
      new Set(
        (live.result?.cards || [])
          .filter(
            (card: any) =>
              card.team === side &&
              (card.cardType === "red" || card.isSecondYellow) &&
              Number(card.minute ?? 0) <= Number(live.minute ?? 0),
          )
          .map((card: any) => card.playerId)
          .filter(Boolean),
      ),
    );
  }, [liveMode, live, save]);

  const liveRedUnassignedIds = useMemo(() => {
    if (liveRedCardIds.length === 0) return [];
    return liveRedCardIds.filter(
      (id) => !Number.isInteger(
        liveGoneSlotIndexesRef.current[id] ?? (live as any)?.goneSlotIndexes?.[id],
      ),
    );
  }, [liveRedCardIds, live, startingXI]);

  const liveNoChangeInjuryIds = useMemo(() => {
    if (!liveMode || !live || !save) return [] as string[];
    const side = live.result?.homeId === save.myTeamId ? "home" : "away";
    const pendingIds = new Set(Object.keys(livePendingForcedInjurySlotsRef.current));
    return Array.from(
      new Set(
        (live.result?.injuries || [])
          .filter(
            (injury: any) =>
              injury.team === side &&
              Number(injury.minute ?? 0) <= Number(live.minute ?? 0) &&
              !pendingIds.has(injury.playerId) &&
              !startingXI.includes(injury.playerId),
          )
          .map((injury: any) => injury.playerId)
          .filter(Boolean),
      ),
    );
  }, [liveMode, live, save, startingXI]);

  const intentionalLiveVacancyCount = useMemo(
    () =>
      new Set([
        ...liveRedCardIds,
        ...liveNoChangeInjuryIds,
        ...Object.keys(livePendingForcedInjurySlotsRef.current),
      ]).size,
    [liveRedCardIds, liveNoChangeInjuryIds, startingXI],
  );
  const liveCanRemainUnderfilled =
    liveMode &&
    activeStartersCount < 11 &&
    11 - activeStartersCount <= intentionalLiveVacancyCount;

  const formationPositions = getFormationPositions(selectedFormation);

  // ---- Tácticas / planes de juego ---------------------------------------
  const [tactics, setTactics] = useState<TeamTactics>(() => loadTactics(save?.myTeamId ?? ""));

  function persistCurrentPlan(commitSave = true) {
    if (!save || !tacticPlanState) {
      return { state: tacticPlanState, committedSave: save };
    }

    const selectedIds = Array.from(
      new Set(bench.filter((id) => id && !startingXI.includes(id))),
    ).slice(0, 12);
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

    const healthyTargetXI = target.lineup
      .slice(0, 11)
      .map((id) => squad.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p && !isCurrentlyInjured(p))
      .map((p) => p.id);
    const healthyTargetBench = target.substitutes
      .slice(0, 12)
      .map((id) => squad.find((p) => p.id === id))
      .filter(
        (p): p is NonNullable<typeof p> =>
          !!p && !isCurrentlyInjured(p) && !healthyTargetXI.includes(p.id),
      )
      .map((p) => p.id);

    // Sanitise the plan itself so an injured player can never reappear by
    // switching A/B/C while the player is still unavailable.
    const nextState: TacticPlanState = {
      activeId: target.id,
      plans: current.state.plans.map((plan) =>
        plan.id === target.id
          ? {
              ...plan,
              lineup: healthyTargetXI.slice(0, 11),
              substitutes: healthyTargetBench.slice(0, 12),
            }
          : plan,
      ),
    };
    saveTacticPlans(save.myTeamId, nextState);
    setTacticPlanState(nextState);
    setSelectedFormation(target.formation as FormationName);
    setStartingXI(healthyTargetXI);
    setBench(healthyTargetBench);
    setTactics(target.tactics);

    const targetIsComplete = healthyTargetXI.length === 11;
    if (targetIsComplete) {
      let nextSave = current.committedSave ?? save;
      nextSave = setLineup(nextSave, save.myTeamId, healthyTargetXI);
      nextSave = setFormation(nextSave, save.myTeamId, target.formation);
      nextSave = setSubstitutes(nextSave, save.myTeamId, healthyTargetBench);
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
      lineup: startingXI.filter((id) => {
        const player = squad.find((p) => p.id === id);
        return !!player && !isCurrentlyInjured(player);
      }),
      substitutes: bench.filter((id) => {
        const player = squad.find((p) => p.id === id);
        return !!player && !isCurrentlyInjured(player);
      }),
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
    for (const [key, player] of Object.entries(playerPositions) as Array<[string, any]>) {
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

  // Next match: use the real next fixture across Liga, Copa and Champions so
  // the suspension state shown in this screen follows the competition that
  // will actually be played next.
  const nextMatch = useMemo(() => {
    if (!save) return null;
    const upcoming = getMyNextFixtureAny(save);
    if (!upcoming) return null;
    const myId = save.myTeamId;
    const isHome = upcoming.homeId === myId;
    const rivalId = isHome ? upcoming.awayId : upcoming.homeId;
    const competition =
      upcoming.competition === "cup"
        ? "Copa"
        : upcoming.competition === "ucl"
          ? "Champions"
          : "Liga";
    return {
      rival: teamById(rivalId),
      isHome,
      matchday: upcoming.matchday,
      competition,
    };
  }, [save]);

  // Get the role for a position key in the current formation
  function getSlotCodeForKey(posKey: string): PosCode {
    return slotPosCode(posKey);
  }

  function handlePitchPlayerClick(playerId: string) {
    if (liveMode && selectedRedHolePlayerId) {
      moveLiveRedCardHole(selectedRedHolePlayerId, playerId);
      return;
    }

    if (liveMode && liveRedUnassignedIds.length > 0) {
      const posKey = getPlayerPositionKey(playerId);
      const index = posKey ? formationPositions.indexOf(posKey) : -1;
      if (index >= 0) {
        assignLiveRedHole(liveRedUnassignedIds[0], index);
      }
      return;
    }

    // Empty-first interaction: click a vacancy and then click the player on
    // the pitch who should move into it. The player's former slot becomes the
    // new vacancy (and keeps the injury marker if the selected vacancy was an
    // injury vacancy).
    if (selectedEmptySlot) {
      const emptySlot = selectedEmptySlot;
      setSelectedEmptySlot(null);
      handlePitchToEmptySwap(playerId, emptySlot);
      return;
    }

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
      } else if (!liveMode && reservePlayers.some((p) => p.id === selectedPlayer)) {
        // Reserve player selected, pitch player clicked - direct exchange.
        // This is only allowed in Dirección de equipo; reserves never become
        // live-match substitutes through this interaction.
        handleReserveToPitchSwap(selectedPlayer, playerId);
      } else {
        // Pitch player selected, pitch player clicked - just change selection
        setSelectedPlayer(playerId);
      }
    }
  }

  function handleBenchPlayerClick(playerId: string) {
    if (liveMode && selectedRedHolePlayerId) {
      toast.error("El hueco de la expulsión no puede rellenarse con un suplente. Solo puede moverse entre jugadores del 11 titular.");
      return;
    }
    if (selectedRedHolePlayerId) setSelectedRedHolePlayerId(null);
    const player = squad.find((p) => p.id === playerId);
    if (!player) return;

    // Check if player is injured
    if (isCurrentlyInjured(player)) {
      toast.error(`${player.name} está lesionado y no puede jugar.`);
      return;
    }

    // Check if player is suspended
    const suspensions = save?.suspensions[save.myTeamId] ?? [];
    const suspendedPlayerIds = new Set(
      suspensions.filter((s) => s.matchdaysRemaining > 0 && (s.competition ?? "league") === activeCompetition).map((s) => s.playerId),
    );
    if (suspendedPlayerIds.has(player.id)) {
      const suspension = suspensions.find((s) => s.playerId === player.id);
      const matchdays = suspension?.matchdaysRemaining || 0;
      toast.error(
        `${player.name} está suspendido por ${matchdays} partido${matchdays > 1 ? "s" : ""} y no puede jugar.`,
      );
      return;
    }

    if (selectedEmptySlot) {
      const emptySlot = selectedEmptySlot;
      setSelectedEmptySlot(null);
      handleBenchToPitchSwap(playerId, emptySlot);
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

  function isKeeperForLiveLineup(player: any) {
    const positions = posCodesOf(player);
    return positions.some((p) => ["GK", "POR"].includes(String(p).toUpperCase()));
  }

  function liveRedCardPlayerAtSlot(slotIndex: number): string | null {
    if (!live || slotIndex < 0) return null;
    const side = live.result?.homeId === save?.myTeamId ? "home" : "away";
    const cards = live.result?.cards || [];
    for (const card of cards) {
      const isRed = card.team === side &&
        (card.cardType === "red" || card.isSecondYellow) &&
        Number(card.minute ?? 0) <= Number(live.minute ?? 0);
      if (!isRed) continue;
      const idx = Number(
        liveGoneSlotIndexesRef.current[card.playerId] ??
          (live as any).goneSlotIndexes?.[card.playerId],
      );
      if (Number.isInteger(idx) && idx === slotIndex) return card.playerId;
    }
    return null;
  }

  function isLiveRedCardHole(posKey: string) {
    if (!liveMode || !live) return false;
    const index = formationPositions.indexOf(posKey);
    return index >= 0 && liveRedCardPlayerAtSlot(index) !== null;
  }

  function assignLiveRedHole(redPlayerId: string, targetIndex: number) {
    if (!liveMode || !live) return;
    if (!liveRedUnassignedIds.includes(redPlayerId)) return;
    if (targetIndex < 0 || targetIndex >= formationPositions.length) return;

    const assignedIndexes = new Set(
      Object.values(liveGoneSlotIndexesRef.current).filter((value) => Number.isInteger(value)),
    );
    const injuryIndexes = new Set(
      Object.values(livePendingForcedInjurySlotsRef.current).filter((value) => Number.isInteger(value)),
    );
    if (assignedIndexes.has(targetIndex)) {
      toast.error("Ese hueco ya pertenece a otra expulsión.");
      return;
    }
    if (injuryIndexes.has(targetIndex)) {
      toast.error("Ese espacio está reservado para un jugador lesionado.");
      return;
    }
    if (!startingXI[targetIndex]) {
      toast.error("Elige una posición ocupada para colocar el hueco de la expulsión.");
      return;
    }

    const sourceIndex = startingXI.findIndex(
      (id, index) => !id && !assignedIndexes.has(index) && !injuryIndexes.has(index),
    );
    if (sourceIndex < 0) {
      toast.error("No se ha encontrado la vacante que dejó la expulsión.");
      return;
    }

    const targetPlayer = squad.find((p) => p.id === startingXI[targetIndex]);
    const sourceSlot = formationPositions[sourceIndex];
    if (targetPlayer && isKeeperForLiveLineup(targetPlayer) && getSlotCodeForKey(sourceSlot) !== "GK") {
      toast.error("El portero no puede desplazarse a una posición de jugador de campo.");
      return;
    }

    setStartingXI((prev) => {
      const next = [...prev];
      if (targetIndex !== sourceIndex) {
        next[sourceIndex] = next[targetIndex] || "";
        next[targetIndex] = "";
      }
      return next;
    });
    liveGoneSlotIndexesRef.current = {
      ...liveGoneSlotIndexesRef.current,
      [redPlayerId]: targetIndex,
    };
    setSelectedPlayer(null);
    setSelectedRedHolePlayerId(null);
    toast.success(`Hueco de ${"expulsión"} colocado en ${emptySlotLabel(formationPositions[targetIndex])}.`);
  }

  function livePendingForcedInjurySlotAt(slotIndex: number): string | null {
    if (!live || slotIndex < 0) return null;
    for (const [playerId, index] of Object.entries(livePendingForcedInjurySlotsRef.current)) {
      if (Number(index) === slotIndex) return playerId;
    }
    return null;
  }

  function moveLiveRedCardHole(redPlayerId: string, targetPlayerId: string) {
    if (!liveMode || !live) return;
    const holeIndex = Number(
      liveGoneSlotIndexesRef.current[redPlayerId] ?? (live as any)?.goneSlotIndexes?.[redPlayerId],
    );
    const targetIndex = startingXI.indexOf(targetPlayerId);
    if (!Number.isInteger(holeIndex) || holeIndex < 0 || targetIndex < 0) return;

    if (livePendingForcedInjurySlotAt(targetIndex)) {
      toast.error("Ese jugador ocupa una vacante reservada para una lesión.");
      setSelectedRedHolePlayerId(null);
      return;
    }

    const targetPlayer = squad.find((p) => p.id === targetPlayerId);
    const holeSlot = formationPositions[holeIndex];
    const requiredHoleSlot = getSlotCodeForKey(holeSlot);
    if (targetPlayer && !canPlayInSlot(targetPlayer, requiredHoleSlot)) {
      toast.error(invalidPositionMessage(targetPlayer, requiredHoleSlot));
      setSelectedRedHolePlayerId(null);
      return;
    }

    setStartingXI((prev) => {
      const next = [...prev];
      next[holeIndex] = next[targetIndex] || "";
      next[targetIndex] = "";
      return next;
    });
    liveGoneSlotIndexesRef.current = {
      ...liveGoneSlotIndexesRef.current,
      [redPlayerId]: targetIndex,
    };
    setSelectedRedHolePlayerId(null);
    setSelectedPlayer(null);
    toast.success(`Hueco de expulsión desplazado a ${emptySlotLabel(formationPositions[targetIndex])}.`);
  }

  function liveForcedInjuryIds(): Set<string> {
    if (!live) return new Set<string>();
    return new Set(Object.keys(livePendingForcedInjurySlotsRef.current));
  }

  function pendingForcedInjuryAssignments(): Array<{ playerId: string; slotIndex: number; replacementId: string | null }> {
    if (!live) return [];
    return Object.entries(livePendingForcedInjurySlotsRef.current).map(([playerId, slotIndex]) => {
      const index = Number(slotIndex);
      return {
        playerId,
        slotIndex: index,
        replacementId: startingXI[index] || null,
      };
    });
  }

  function hasUnresolvedLiveInjury(): boolean {
    // The ambulance marker represents an ordinary movable vacancy. Filling it
    // from the bench is optional; moving a starter through it simply moves the
    // vacancy to the starter's previous slot.
    return false;
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
    if (isCurrentlyInjured(benchPlayer)) {
      toast.error(`${benchPlayer.name} está lesionado y no puede jugar.`);
      setSelectedPlayer(null);
      return;
    }

    // Check if bench player is suspended
    const suspensions = save?.suspensions[save.myTeamId] ?? [];
    const suspendedPlayerIds = new Set(
      suspensions.filter((s) => s.matchdaysRemaining > 0 && (s.competition ?? "league") === activeCompetition).map((s) => s.playerId),
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

    // Perform the swap. In live mode this is only a TEMPORARY edit: the
    // outgoing player stays selectable until the manager presses
    // “Guardar cambios y volver”. Only that final action makes the change
    // permanent and blocks the outgoing player from returning.
    setStartingXI((prev) => prev.map((id) => (id === pitchPlayerId ? benchPlayerId : id)));
    if (liveMode) {
      setBench((prev) => {
        const withoutIn = prev.filter((id) => id !== benchPlayerId);
        return withoutIn.includes(pitchPlayerId) ? withoutIn : [...withoutIn, pitchPlayerId];
      });
    } else {
      setBench((prev) => prev.map((id) => (id === benchPlayerId ? pitchPlayerId : id)));
    }
    setSelectedPlayer(null);
  }

  function handlePitchToEmptySwap(playerId: string, emptyPosKey: string) {
    const player = squad.find((p) => p.id === playerId);
    if (!player) return;

    // Check if player is injured
    if (isCurrentlyInjured(player)) {
      toast.error(`${player.name} está lesionado y no puede jugar.`);
      setSelectedPlayer(null);
      return;
    }

    // Check if player is suspended
    const suspensions = save?.suspensions[save.myTeamId] ?? [];
    const suspendedPlayerIds = new Set(
      suspensions.filter((s) => s.matchdaysRemaining > 0 && (s.competition ?? "league") === activeCompetition).map((s) => s.playerId),
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

    const emptyPosIndex = formationPositions.indexOf(emptyPosKey);
    const redCardHole = isLiveRedCardHole(emptyPosKey);

    // A red-card hole can only be filled by rearranging a player who is already
    // on the pitch. A goalkeeper may not be moved into an outfield red-card hole.
    if (redCardHole && isKeeperForLiveLineup(player) && getSlotCodeForKey(emptyPosKey) !== "GK") {
      toast.error("El hueco de la expulsión no puede cubrirse colocando al portero ahí.");
      setSelectedPlayer(null);
      return;
    }

    // Every player must remain in a valid natural position. A red-card hole
    // is movable, but it is not a free-position exception: the player who
    // moves into the hole must be able to play that exact role.
    const requiredSlot = getSlotCodeForKey(emptyPosKey);
    if (!canPlayInSlot(player, requiredSlot)) {
      toast.error(invalidPositionMessage(player, requiredSlot));
      setSelectedPlayer(null);
      return;
    }

    // Get the current position key of the player
    const currentPlayerPosKey = getPlayerPositionKey(playerId);
    if (!currentPlayerPosKey) return;

    // Get the indices of both positions
    const currentPlayerPosIndex = formationPositions.indexOf(currentPlayerPosKey);
    if (emptyPosIndex < 0 || currentPlayerPosIndex < 0) {
      setSelectedPlayer(null);
      return;
    }

    if (redCardHole && live) {
      const redPlayerId = liveRedCardPlayerAtSlot(emptyPosIndex);
      if (redPlayerId) {
        liveGoneSlotIndexesRef.current = {
          ...liveGoneSlotIndexesRef.current,
          [redPlayerId]: currentPlayerPosIndex,
        };
      }
    }

    const injuryHolePlayerId = liveMode ? livePendingForcedInjurySlotAt(emptyPosIndex) : null;
    if (injuryHolePlayerId && liveMode) {
      // Exactly like a normal empty slot: when a starter moves into the injury
      // vacancy, the vacancy moves to the starter's previous position.
      livePendingForcedInjurySlotsRef.current = {
        ...livePendingForcedInjurySlotsRef.current,
        [injuryHolePlayerId]: currentPlayerPosIndex,
      };
    }

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
    if (isCurrentlyInjured(benchPlayer)) {
      toast.error(`${benchPlayer.name} está lesionado y no puede jugar.`);
      return;
    }

    // Check if player is suspended
    const suspensions = save?.suspensions[save.myTeamId] ?? [];
    const suspendedPlayerIds = new Set(
      suspensions.filter((s) => s.matchdaysRemaining > 0 && (s.competition ?? "league") === activeCompetition).map((s) => s.playerId),
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
    if (isPositionKey && isLiveRedCardHole(pitchTarget)) {
      toast.error("La plaza está bloqueada por una expulsión. Solo puedes mover a otro jugador del campo a ese hueco.");
      setSelectedPlayer(null);
      return;
    }
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
      // Empty position (including an injury vacancy): a substitute may fill it exactly like
      // any other vacancy. If it was an injury vacancy, the ambulance marker
      // disappears because the slot has been filled.
      const posIndex = formationPositions.indexOf(posKey);
      const newStartingXI = [...startingXI];

      while (newStartingXI.length <= posIndex) {
        newStartingXI.push("");
      }

      newStartingXI[posIndex] = benchPlayerId;
      setStartingXI(newStartingXI);
      setBench((prev) => prev.filter((id) => id !== benchPlayerId));

      if (liveMode) {
        const injuryPlayerId = livePendingForcedInjurySlotAt(posIndex);
        if (injuryPlayerId) {
          const next = { ...livePendingForcedInjurySlotsRef.current };
          delete next[injuryPlayerId];
          livePendingForcedInjurySlotsRef.current = next;
        }
      }
    } else {
      // Swap with an existing player. In live mode this is a TEMPORARY edit:
      // the player who leaves is not blocked yet, so the manager can undo the
      // move before saving.
      setStartingXI((prev) => prev.map((id) => (id === pitchTarget ? benchPlayerId : id)));
      if (liveMode) {
        setBench((prev) => {
          const withoutIn = prev.filter((id) => id !== benchPlayerId);
          return withoutIn.includes(pitchTarget) ? withoutIn : [...withoutIn, pitchTarget];
        });
      } else {
        setBench((prev) => prev.map((id) => (id === benchPlayerId ? pitchTarget : id)));
      }
    }
    setSelectedPlayer(null);
  }

  function handleReserveToPitchSwap(reservePlayerId: string, pitchPlayerId: string) {
    if (liveMode) return;

    const reservePlayer = squad.find((p) => p.id === reservePlayerId);
    const pitchPlayer = squad.find((p) => p.id === pitchPlayerId);
    if (!reservePlayer || !pitchPlayer || !startingXI.includes(pitchPlayerId)) {
      setSelectedPlayer(null);
      return;
    }

    if (isCurrentlyInjured(reservePlayer)) {
      toast.error(`${reservePlayer.name} está lesionado y no puede entrar en el 11.`);
      setSelectedPlayer(null);
      return;
    }

    const suspensions = save?.suspensions[save.myTeamId] ?? [];
    const suspended = suspensions.some(
      (s) => s.playerId === reservePlayerId && s.matchdaysRemaining > 0,
    );
    if (suspended) {
      const suspension = suspensions.find((s) => s.playerId === reservePlayerId);
      const matchdays = suspension?.matchdaysRemaining || 0;
      toast.error(
        `${reservePlayer.name} está suspendido por ${matchdays} partido${matchdays > 1 ? "s" : ""} y no puede jugar.`,
      );
      setSelectedPlayer(null);
      return;
    }

    const posKey = getPlayerPositionKey(pitchPlayerId);
    if (!posKey) {
      setSelectedPlayer(null);
      return;
    }

    const requiredSlot = getSlotCodeForKey(posKey);
    if (!canPlayInSlot(reservePlayer, requiredSlot)) {
      toast.error(invalidPositionMessage(reservePlayer, requiredSlot));
      setSelectedPlayer(null);
      return;
    }

    // The reserve takes exactly the starter's slot. The former starter becomes
    // a reserve automatically because the reserve list is derived from the
    // squad minus XI and substitutes. The substitutes list is untouched.
    setStartingXI((prev) => prev.map((id) => (id === pitchPlayerId ? reservePlayerId : id)));
    setSelectedPlayer(null);
  }

  function handleCallUpPlayer(playerId: string) {
    if (liveMode || bench.length >= 12) return;

    const player = squad.find((p) => p.id === playerId);
    if (!player) return;
    if (bench.includes(playerId) || startingXI.includes(playerId)) return;

    if (isCurrentlyInjured(player)) {
      toast.error(`${player.name} está lesionado y no puede ser convocado.`);
      return;
    }

    const suspensions = save?.suspensions[save.myTeamId] ?? [];
    const suspended = suspensions.some((s) => s.playerId === playerId && s.matchdaysRemaining > 0);
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

  function handleReserveToEmptySwap(reservePlayerId: string, emptyPosKey: string) {
    if (liveMode) return;

    const reservePlayer = squad.find((p) => p.id === reservePlayerId);
    if (!reservePlayer) {
      setSelectedPlayer(null);
      return;
    }

    if (isCurrentlyInjured(reservePlayer)) {
      toast.error(`${reservePlayer.name} está lesionado y no puede entrar en el 11.`);
      setSelectedPlayer(null);
      return;
    }

    const suspensions = save?.suspensions[save.myTeamId] ?? [];
    const suspended = suspensions.some(
      (s) =>
        s.playerId === reservePlayerId &&
        s.matchdaysRemaining > 0 &&
        (s.competition ?? "league") === activeCompetition,
    );
    if (suspended) {
      const suspension = suspensions.find((s) => s.playerId === reservePlayerId);
      const matchdays = suspension?.matchdaysRemaining || 0;
      toast.error(
        `${reservePlayer.name} está suspendido por ${matchdays} partido${matchdays > 1 ? "s" : ""} y no puede jugar.`,
      );
      setSelectedPlayer(null);
      return;
    }

    const posIndex = formationPositions.indexOf(emptyPosKey);
    if (posIndex < 0) {
      setSelectedPlayer(null);
      return;
    }

    const requiredSlot = getSlotCodeForKey(emptyPosKey);
    if (!canPlayInSlot(reservePlayer, requiredSlot)) {
      toast.error(invalidPositionMessage(reservePlayer, requiredSlot));
      setSelectedPlayer(null);
      return;
    }

    setStartingXI((prev) => {
      const next = [...prev];
      while (next.length <= posIndex) next.push("");
      next[posIndex] = reservePlayerId;
      return next;
    });
    setSelectedPlayer(null);
  }

  function handleReservePlayerClick(playerId: string) {
    if (liveMode) return;

    const player = squad.find((p) => p.id === playerId);
    if (!player) return;

    if (isCurrentlyInjured(player)) {
      toast.error(`${player.name} está lesionado y no puede ser convocado.`);
      return;
    }

    const suspensions = save?.suspensions[save.myTeamId] ?? [];
    const suspended = suspensions.some((s) => s.playerId === playerId && s.matchdaysRemaining > 0);
    if (suspended) {
      toast.error(`${player.name} está suspendido y no puede ser convocado.`);
      return;
    }

    if (selectedEmptySlot) {
      const emptySlot = selectedEmptySlot;
      setSelectedEmptySlot(null);
      handleReserveToEmptySwap(playerId, emptySlot);
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
      setBench((prev) => prev.map((id) => (id === selectedBenchId ? playerId : id)));
      setSelectedPlayer(null);
      return;
    }

    if (startingXI.includes(selectedPlayer)) {
      // Direct exchange between a starter and a reserve.
      handleReserveToPitchSwap(playerId, selectedPlayer);
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

    // Never persist an injured player in the XI or convocados, even if an
    // injury was registered between renders.
    if (
      startingXI.some((id) => {
        const player = squad.find((p) => p.id === id);
        return !!player && isCurrentlyInjured(player);
      })
    ) {
      toast.error("Hay un jugador lesionado en el 11. Debe quedar en Reservas hasta recuperarse.");
      return;
    }

    // Filter out suspended players from the lineup before saving.
    const suspensions = save.suspensions[save.myTeamId] ?? [];
    const suspendedPlayerIds = new Set(
      suspensions.filter((s) => s.matchdaysRemaining > 0 && (s.competition ?? "league") === activeCompetition).map((s) => s.playerId),
    );
    const filteredStartingXI = startingXI.filter((playerId) => !suspendedPlayerIds.has(playerId));
    const selectedSubstitutes = Array.from(
      new Set(
        bench.filter((id) => {
          if (!id || filteredStartingXI.includes(id)) return false;
          const player = squad.find((p) => p.id === id);
          return !!player && !isCurrentlyInjured(player);
        }),
      ),
    ).slice(0, 12);

    let next = setLineup(save, save.myTeamId, filteredStartingXI);
    next = setFormation(next, save.myTeamId, selectedFormation);
    next = setSubstitutes(next, save.myTeamId, selectedSubstitutes);
    saveSave(next);
    setSave(next);
    setSelectedEmptySlot(null);
    setSelectedPlayer(null);

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
    setSelectedEmptySlot(null);
    setSelectedRedHolePlayerId(null);

    const newFormationPositions = getFormationPositions(newFormation);

    if (liveMode) {
      // Rebuild with every player who is still on the pitch first. Then assign
      // the existing special vacancies (red/ambulance) to the resulting empty
      // slots. This prevents a formation change from turning unrelated empty
      // positions into 🚑 holes.
      const availableIds = startingXI.filter(Boolean);
      const nextStartingXI: string[] = [];

      const takePlayer = (predicate: (player: any) => boolean) => {
        const idx = availableIds.findIndex((id) => {
          const player = squad.find((p) => p.id === id);
          return !!player && predicate(player);
        });
        if (idx < 0) return "";
        return availableIds.splice(idx, 1)[0] || "";
      };

      for (const posKey of newFormationPositions) {
        const slot = slotPosCode(posKey);
        // Match Dirección de equipo: changing the formation may leave a slot
        // empty, but it must never place a player outside one of his declared
        // positions. Any displaced player goes to the bench/substitutes.
        const chosen = takePlayer((player) => isNaturalFor(posCodesOf(player), slot)) || "";
        nextStartingXI.push(chosen);
      }

      const redEntries = Object.entries(liveGoneSlotIndexesRef.current)
        .filter(([playerId, index]) => liveRedCardIds.includes(playerId) && Number.isInteger(index))
        .sort((a, b) => Number(a[1]) - Number(b[1]));
      const injuryEntries = Object.entries(livePendingForcedInjurySlotsRef.current)
        .filter(([, index]) => Number.isInteger(index))
        .sort((a, b) => Number(a[1]) - Number(b[1]));
      const markerEntries = [
        ...redEntries.map(([playerId, index]) => ({ kind: "red" as const, playerId, oldIndex: Number(index) })),
        ...injuryEntries.map(([playerId, index]) => ({ kind: "injury" as const, playerId, oldIndex: Number(index) })),
      ].sort((a, b) => a.oldIndex - b.oldIndex);

      const emptyIndexes = nextStartingXI
        .map((id, index) => (!id ? index : -1))
        .filter((index) => index >= 0);
      const nextRedSlots: Record<string, number> = {};
      const nextInjurySlots: Record<string, number> = {};
      const remainingEmpty = [...emptyIndexes];

      for (const marker of markerEntries) {
        if (remainingEmpty.length === 0) break;
        let best = 0;
        let bestDistance = Infinity;
        for (let i = 0; i < remainingEmpty.length; i++) {
          const distance = Math.abs(remainingEmpty[i] - marker.oldIndex);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = i;
          }
        }
        const [slotIndex] = remainingEmpty.splice(best, 1);
        if (marker.kind === "red") nextRedSlots[marker.playerId] = slotIndex;
        else nextInjurySlots[marker.playerId] = slotIndex;
      }

      liveGoneSlotIndexesRef.current = nextRedSlots;
      livePendingForcedInjurySlotsRef.current = nextInjurySlots;
      setStartingXI(nextStartingXI);

      const displacedStarters = startingXI.filter((id) => id && !nextStartingXI.includes(id));
      setBench(
        Array.from(
          new Set([...bench.filter((id) => !nextStartingXI.includes(id)), ...displacedStarters]),
        ).slice(0, 12),
      );
      return;
    }

    const availableIds = startingXI.filter(Boolean);
    const nextStartingXI: string[] = [];
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
        nextStartingXI.push(chosen);
      } else {
        nextStartingXI.push("");
      }
    });

    setStartingXI(nextStartingXI);
    const displacedStarters = startingXI.filter((id) => id && !nextStartingXI.includes(id));
    setBench(
      Array.from(
        new Set([...bench.filter((id) => !nextStartingXI.includes(id)), ...displacedStarters]),
      ).slice(0, 12),
    );
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
                  isLineupComplete || liveCanRemainUnderfilled
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-destructive/40 bg-destructive/10 text-destructive"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${isLineupComplete || liveCanRemainUnderfilled ? "bg-emerald-400" : "bg-destructive"}`}
                />
                Titulares {activeStartersCount}/11
                {liveCanRemainUnderfilled ? " · partido con uno menos" : ""}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs font-bold text-muted-foreground">
                Suplentes {bench.length}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs font-bold text-muted-foreground">
                Edad media {avgAgeXI}
              </span>
              {!isLineupComplete && !liveCanRemainUnderfilled && (
                <span className="text-xs font-bold text-destructive">
                  La plantilla no está completa.
                </span>
              )}
              {liveCanRemainUnderfilled && (
                <span className="text-xs font-bold text-amber-300">
                  Se permite jugar con {activeStartersCount} por la expulsión.
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
                  suspensions.filter((s) => s.matchdaysRemaining > 0 && (s.competition ?? "league") === activeCompetition).map((s) => s.playerId),
                );
                const isSuspended = suspendedPlayerIds.has(player.id);
                const liveForcedInjury = liveMode && liveForcedInjuryIds().has(player.id);
                return (
                  <PlayerNode
                    key={player.id}
                    player={{
                      id: player.id,
                      name: player.name,
                      rating: player.rating,
                      energy: player.energy,
                      position: player.position,
                      slotLabel: getSlotCodeForKey(posKey),
                      otherPositions: posCodesOf(player).filter(
                        (c) => c !== getSlotCodeForKey(posKey),
                      ),
                      injured: isCurrentlyInjured(player) && !liveForcedInjury,
                      forcedInjury: liveForcedInjury,
                      suspended: isSuspended,
                      cardImage: player.cardImage,
                    }}
                    coordinates={coords}
                    isSelected={selectedPlayer === player.id}
                    onClick={() => handlePitchPlayerClick(player.id)}
                  />
                );
              } else {
                const redCardHole = isLiveRedCardHole(posKey);
                const injuryHolePlayerId = liveMode ? livePendingForcedInjurySlotAt(index) : null;
                const injuryHole = !!injuryHolePlayerId;
                const pendingRedHole = liveMode && liveRedUnassignedIds.length > 0 && !injuryHole;

                // During a live match every real vacancy is visible. The 🚑 is
                // only a marker for an injury-caused hole; functionally it is
                // the same as a normal empty slot.
                return (
                  <div
                    key={posKey}
                    onClick={() => {
                      if (pendingRedHole) {
                        assignLiveRedHole(liveRedUnassignedIds[0], index);
                        return;
                      }

                      if (redCardHole) {
                        const redPlayerId = liveRedCardPlayerAtSlot(index);
                        if (redPlayerId) {
                          setSelectedRedHolePlayerId(redPlayerId);
                          setSelectedEmptySlot(null);
                          setSelectedPlayer(null);
                        }
                        return;
                      }

                      // A normal vacancy and an injury vacancy behave identically in the live
                      // lineup editor. A 🟥 vacancy is different: it can only
                      // be moved using another starter and can never be filled
                      // by a substitute/reserve during the match.
                      if (selectedPlayer) {
                        if (bench.includes(selectedPlayer)) {
                          setSelectedEmptySlot(null);
                          handleBenchToPitchSwap(selectedPlayer, posKey);
                        } else if (startingXI.includes(selectedPlayer)) {
                          setSelectedEmptySlot(null);
                          handlePitchToEmptySwap(selectedPlayer, posKey);
                        } else if (reservePlayers.some((p) => p.id === selectedPlayer)) {
                          setSelectedEmptySlot(null);
                          handleReserveToEmptySwap(selectedPlayer, posKey);
                        }
                        return;
                      }

                      setSelectedEmptySlot(posKey);
                      setSelectedRedHolePlayerId(null);
                    }}
                    className={`absolute cursor-pointer transition-transform duration-200 ${
                      (selectedRedHolePlayerId && redCardHole) || selectedEmptySlot === posKey
                        ? "scale-110"
                        : "hover:scale-105"
                    }`}
                    style={{
                      top: `${coords.top}%`,
                      left: `${coords.left}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <div
                      className={`group relative flex h-[68px] w-[68px] flex-col items-center justify-center overflow-hidden rounded-full border text-[0.55rem] font-black leading-tight backdrop-blur-md transition-all duration-200 ${
                        redCardHole || pendingRedHole
                          ? "border-red-400/35 bg-[radial-gradient(circle_at_35%_25%,rgba(248,113,113,.12),transparent_42%),linear-gradient(145deg,rgba(127,29,29,.32),rgba(127,29,29,.12))] text-red-100 shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_8px_24px_rgba(127,29,29,.18)]"
                          : injuryHole
                            ? "border-amber-300/30 bg-[radial-gradient(circle_at_35%_25%,rgba(251,191,36,.13),transparent_42%),linear-gradient(145deg,rgba(120,79,12,.24),rgba(120,79,12,.10))] text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_8px_24px_rgba(120,79,12,.14)]"
                            : "border-white/18 bg-[radial-gradient(circle_at_35%_25%,rgba(255,255,255,.08),transparent_42%),linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.025))] text-foreground/85 shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_8px_22px_rgba(0,0,0,.18)]"
                      }`}
                      title={
                        redCardHole
                          ? `Hueco por expulsión: ${emptySlotLabel(posKey)} · pulsa para moverlo`
                          : pendingRedHole
                            ? `Colocar aquí el hueco de la expulsión (${emptySlotLabel(posKey)})`
                            : injuryHole
                              ? `Hueco por lesión (${emptySlotLabel(posKey)})`
                              : `Hueco vacío: ${emptySlotLabel(posKey)}`
                      }
                    >
                      <span className="pointer-events-none absolute inset-[3px] rounded-full border border-white/[0.045]" />
                      <span className="scoreline relative z-10 mb-1 text-[0.54rem] font-black tracking-[0.12em] text-foreground/65">
                        {emptySlotLabel(posKey)}
                      </span>
                      {redCardHole || pendingRedHole ? (
                        <span
                          aria-label="Expulsión"
                          className="relative z-10 h-7 w-[18px] rotate-[-5deg] rounded-[3px] border border-red-200/70 bg-gradient-to-br from-red-400 via-red-500 to-red-700 shadow-[0_4px_12px_rgba(239,68,68,.28)]"
                        >
                          <span className="absolute left-0.5 right-0.5 top-1.5 h-px bg-white/55" />
                          <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-white/30" />
                        </span>
                      ) : injuryHole ? (
                        <span
                          aria-label="Lesión"
                          className="relative z-10 grid h-7 w-7 place-items-center rounded-full border border-amber-200/40 bg-amber-300/10 text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_4px_12px_rgba(245,158,11,.14)]"
                        >
                          <Ambulance className="h-4 w-4 stroke-[2.1]" />
                        </span>
                      ) : (
                        <span
                          aria-label="Hueco vacío"
                          className="relative z-10 grid h-7 w-7 place-items-center rounded-full border border-dashed border-white/25 bg-white/[0.025] text-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]"
                        >
                          <Plus className="h-4 w-4 stroke-[1.8]" />
                        </span>
                      )}
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
              {liveMode ? "Suplentes disponibles" : "Convocatoria"}
            </h2>
            <span className="text-[0.65rem] font-black text-muted-foreground">
              {liveMode
                ? `${(() => {
                    const availableCount = bench.filter((id) => {
                      const p = squad.find((q) => q.id === id);
                      if (!p) return false;
                      if (liveGoneIds().has(id)) return false;
                      if (isCurrentlyInjured(p)) return false;
                      return true;
                    }).length;
                    const injuredCount = bench.filter((id) => {
                      const p = squad.find((q) => q.id === id);
                      return !!p && (isCurrentlyInjured(p) || liveForcedInjuryIds().has(id));
                    }).length;
                    return `${availableCount}/12 disponibles${injuredCount ? ` · ${injuredCount} lesionado(s)` : ""}`;
                  })()}`
                : `${bench.length}/12 suplentes`}
            </span>
          </div>

          <div className="panel p-4 space-y-2 max-h-[520px] overflow-y-auto">
            <div className="mb-3 flex items-center justify-between border-b border-border/50 pb-2">
              <div>
                <p className="text-xs font-black">Suplentes</p>
                <p className="text-[0.6rem] text-muted-foreground">
                  Los movimientos son provisionales mientras editas. Los jugadores que salgan
                  quedan bloqueados solo después de pulsar “Guardar cambios y volver”.
                </p>
              </div>
              <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-1 text-[0.6rem] font-black text-primary">
                {bench.length}/12
              </span>
            </div>

            {benchPlayers.map((player) => {
              if (!player) return null;
              const isInjured = isCurrentlyInjured(player);
              const isForcedOut = liveMode && liveGoneIds().has(player.id);
              const isLiveForcedInjury = isForcedOut && liveForcedInjuryIds().has(player.id);
              const suspensions = save?.suspensions[save.myTeamId] ?? [];
              const suspendedPlayerIds = new Set(
                suspensions.filter((s) => s.matchdaysRemaining > 0 && (s.competition ?? "league") === activeCompetition).map((s) => s.playerId),
              );
              const isSuspended = suspendedPlayerIds.has(player.id);
              const redHoleSelected = liveMode && !!selectedRedHolePlayerId;
              const isUnavailable = isInjured || isSuspended || isForcedOut || redHoleSelected;
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
                    {isForcedOut && (
                      <span
                        className="absolute -top-1 -left-1 grid h-5 w-5 place-items-center rounded-full border border-destructive/30 bg-background text-[0.62rem] shadow"
                        title="No puede volver a jugar"
                      >
                        🔒
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate text-sm flex items-center gap-1">
                      {player.name}
                      {(isInjured || isLiveForcedInjury) && (
                        <span className="text-xs font-bold text-destructive">
                          (
                          {isLiveForcedInjury && !isInjured
                            ? "lesionado"
                            : formatInjuryShort(player, currentDate, leagueMd)}
                          )
                        </span>
                      )}
                      {isSuspended && <span className="text-xs text-destructive">(SUS)</span>}
                      {isForcedOut && (
                        <span className="text-[0.55rem] font-black uppercase tracking-wider text-muted-foreground">
                          · Bloqueado
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {posLabelOf(player)} · {player.age}a · {player.goals}G {player.assists}A
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[0.55rem] font-black ${
                        (player.energy ?? 100) >= 80
                          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                          : (player.energy ?? 100) >= 55
                            ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                            : "border-destructive/30 bg-destructive/10 text-destructive"
                      }`}>
                        <Zap className="h-2.5 w-2.5 fill-current" />
                        <span>{Math.round(player.energy ?? 100)}%</span>
                      </span>
                    </div>
                  </div>
                  {selectedPlayer === player.id && <span className="text-primary text-lg">✓</span>}
                </div>
              );
            })}

            {bench.length === 0 && (
              <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                No hay suplentes convocados.{!liveMode && " Añade jugadores desde Reservas."}
              </div>
            )}

            {!liveMode && (
              <div className="mt-5 border-t border-border/50 pt-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black">Reservas</p>
                    <p className="text-[0.6rem] text-muted-foreground">
                      No están convocados. Pulsa un titular o un suplente y después una reserva para
                      intercambiarlos directamente.
                    </p>
                  </div>
                  <span className="rounded-full border border-border/60 bg-card px-2 py-1 text-[0.6rem] font-black text-muted-foreground">
                    {reservePlayers.length}
                  </span>
                </div>

                {reservePlayers.map((player) => {
                  const isInjured = isCurrentlyInjured(player);
                  return (
                    <div
                      key={player.id}
                      onClick={() => {
                        if (!isInjured) handleReservePlayerClick(player.id);
                      }}
                      className={`mb-2 flex items-center gap-3 rounded-xl border-2 p-3 transition ${
                        isInjured
                          ? "border-destructive/30 bg-destructive/5 opacity-75 cursor-not-allowed"
                          : selectedPlayer === player.id
                            ? "border-primary bg-primary/10 glow-cyan cursor-pointer"
                            : "border-border/60 bg-card/50 hover:border-primary/60 cursor-pointer"
                      }`}
                    >
                      <div className="relative shrink-0">
                        <PlayerFace
                          name={player.name}
                          image={faceUrl(player.id, player.cardImage)}
                          size={30}
                          showRing={false}
                          className="bg-secondary shadow"
                        />
                        {isInjured && (
                          <span className="absolute -right-1 -bottom-1 grid h-5 w-5 place-items-center rounded-full border border-destructive/30 bg-background text-[0.65rem] shadow">
                            🔒
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold">{player.name}</p>
                          {isInjured && (
                            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[0.55rem] font-black uppercase tracking-wider text-destructive">
                              Lesionado
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {posLabelOf(player)} · {player.age}a · OVR {player.rating}
                        </p>
                        <div className="mt-1">
                          <span className={`inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[0.55rem] font-black ${
                            (player.energy ?? 100) >= 80
                              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                              : (player.energy ?? 100) >= 55
                                ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                                : "border-destructive/30 bg-destructive/10 text-destructive"
                          }`}>
                            <Zap className="h-2.5 w-2.5 fill-current" />
                            <span>{Math.round(player.energy ?? 100)}%</span>
                          </span>
                        </div>
                        {isInjured && (
                          <p className="mt-1 text-[0.62rem] font-semibold text-destructive">
                            {player.injuryReason || "Lesión"} ·{" "}
                            {formatInjuryShort(player, currentDate, leagueMd)} restantes
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {isInjured ? (
                          <span className="rounded-md border border-destructive/20 bg-destructive/5 px-2 py-1 text-[0.6rem] font-black text-destructive">
                            Bloqueado
                          </span>
                        ) : (
                          <>
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
                            {selectedPlayer === player.id && (
                              <span className="text-primary text-lg">✓</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {liveMode && live && (() => {
        const unassignedRedIds = liveRedUnassignedIds;
        if (unassignedRedIds.length === 0) return null;

        const assignHole = (redPlayerId: string, targetIndex: number) => {
          assignLiveRedHole(redPlayerId, targetIndex);
        };

        return (
          <div className="panel mt-5 p-4 border-destructive/30">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-destructive">
                  Posición del hueco por expulsión
                </p>
                <p className="text-[0.65rem] text-muted-foreground mt-1">
                  El hueco no se fija automáticamente. Elige dónde quieres reorganizarlo.
                </p>
              </div>
              <span
                aria-label="Expulsión"
                className="h-7 w-4 rounded-[3px] border border-destructive/70 bg-destructive shadow-[0_4px_12px_rgba(239,68,68,.18)]"
              />
            </div>
            {unassignedRedIds.map((redId) => {
              const redCard = (live.result?.cards || []).find((c: any) => c.playerId === redId && (c.cardType === "red" || c.isSecondYellow));
              return (
                <div key={redId} className="rounded-lg border border-border/60 bg-card/50 p-3 mb-2 last:mb-0">
                  <div className="text-xs font-bold mb-2">{redCard?.playerName || "Jugador expulsado"}</div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                    {formationPositions.map((posKey, index) => (
                      <button
                        key={posKey}
                        type="button"
                        onClick={() => assignHole(redId, index)}
                        disabled={isLiveRedCardHole(posKey)}
                        className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[0.58rem] font-black text-destructive hover:bg-destructive/15 disabled:opacity-35 disabled:cursor-not-allowed"
                        title={`Dejar hueco en ${emptySlotLabel(posKey)}`}
                      >
                        {emptySlotLabel(posKey)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <p className="mt-2 text-[0.58rem] text-muted-foreground">
              Para mover un hueco ya colocado, pulsa el indicador de expulsión en el campo y después pulsa el jugador cuya posición quieres dejar vacía.
            </p>
          </div>
        );
      })()}

      {/* Tactics panel */}
      <TacticsPanel tactics={tactics} updateTactics={updateTactics} xiPlayers={xiPlayers as any} />

      {liveMode &&
        live &&
        (() => {
          const limits = subLimits(live.isExtraTime);
          const baseOutIds = liveBaseXIRef.current.filter((id) => id && !startingXI.includes(id));
          const baseInIds = startingXI.filter((id) => id && !liveBaseXIRef.current.includes(id));
          const pendingInjuryAssignments = pendingForcedInjuryAssignments();
          const pendingReplacementIds = new Set(
            pendingInjuryAssignments.map((item) => item.replacementId).filter(Boolean) as string[],
          );
          const resolvedInjuryAssignments = pendingInjuryAssignments.filter(
            (item) =>
              item.replacementId &&
              !liveGoneIds().has(item.replacementId) &&
              !liveBaseXIRef.current.includes(item.replacementId),
          );
          const normalOutIds = baseOutIds.filter((id) => !pendingInjuryAssignments.some((item) => item.playerId === id));
          const normalInIds = baseInIds.filter((id) => !pendingReplacementIds.has(id));
          const forcedOutIds = (live.gone || []).filter(
            (id: string) => !normalOutIds.includes(id) && !pendingInjuryAssignments.some((item) => item.playerId === id) && !startingXI.includes(id),
          );
          const effectiveOutIds = [
            ...normalOutIds,
            ...forcedOutIds.filter((id) => !normalOutIds.includes(id)),
          ];
          const normalChanges = Math.min(effectiveOutIds.length, normalInIds.length);
          const injuryChanges = resolvedInjuryAssignments.length;
          const changes = normalChanges + injuryChanges;
          const intentionalVacancies =
            !isLineupComplete &&
            11 - activeStartersCount <= intentionalLiveVacancyCount;
          const free = isFreeWindow(live.phase);
          const overSubs = live.subsUsed + changes > limits.maxSubs;
          const overWindows = changes > 0 && !free && live.windowsUsed >= limits.maxWindows;
          const unresolvedInjury = hasUnresolvedLiveInjury();
          const blocked =
            overSubs ||
            overWindows ||
            unresolvedInjury ||
            (!isLineupComplete && !intentionalVacancies);
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
              {unresolvedInjury && (
                <p className="text-xs font-semibold text-destructive mb-3">
                  Hay una lesión pendiente. Debes cubrir el hueco con un suplente antes de volver al partido.
                </p>
              )}
              <div className="flex justify-end">
                <button
                  disabled={blocked}
                  className={btnPrimary}
                  onClick={() => {
                    // Commit permanent departures only now. A player moved out
                    // during editing is not blocked until the manager saves. If the
                    // move was undone before saving, that player is still in the
                    // original live XI and therefore does not enter `gone`.
                    const goneList = Array.from(
                      new Set([
                        ...(live.gone || []),
                        ...(live.subs || []).map((s: any) => s.outId),
                        ...effectiveOutIds,
                      ]),
                    );

                    // A player who was forced off through injury remains visible
                    // on the bench as a blocked/lesionado entry. Healthy players
                    // that have already left the pitch stay out of the bench.
                    const forcedInjuryIds = new Set<string>(
                      (live.result?.injuries || [])
                        .filter((i: any) => Number(i.minute ?? 0) <= Number(live.minute ?? 0))
                        .map((i: any) => i.playerId),
                    );
                    // Every player who has already left the pitch remains
                    // visible on the live bench as a blocked entry. This applies
                    // equally to normal substitutions, injuries and no-change
                    // forced exits.
                    const nextBench = Array.from(
                      new Set([
                        ...bench.filter((id) => !startingXI.includes(id)),
                        ...goneList.filter((id) => id && !startingXI.includes(id)),
                      ]),
                    );

                    // Keep injured players visible even if the injury has not yet
                    // propagated into the normal player store.
                    for (const injuredId of forcedInjuryIds) {
                      if (!nextBench.includes(injuredId) && !startingXI.includes(injuredId)) {
                        nextBench.push(injuredId);
                      }
                    }

                    const stamina = { ...(live.stamina || {}) };
                    const subs = [...(live.subs || [])];
                    const recordedForcedOutIds = new Set(subs.map((s: any) => s.outId));

                    for (const assignment of resolvedInjuryAssignments) {
                      if (!assignment.replacementId || recordedForcedOutIds.has(assignment.playerId)) continue;
                      const outId = assignment.playerId;
                      const inId = assignment.replacementId;
                      stamina[inId] = 100;
                      subs.push({
                        minute: live.minute,
                        outId,
                        outName: squad.find((p) => p.id === outId)?.name ?? outId,
                        inId,
                        inName: squad.find((p) => p.id === inId)?.name ?? inId,
                      });
                      recordedForcedOutIds.add(outId);
                    }

                    for (let i = 0; i < normalChanges; i++) {
                      const outId = effectiveOutIds[i];
                      const inId = normalInIds[i];
                      if (!outId || !inId) continue;
                      stamina[inId] = 100;
                      subs.push({
                        minute: live.minute,
                        outId,
                        outName: squad.find((p) => p.id === outId)?.name ?? outId,
                        inId,
                        inName: squad.find((p) => p.id === inId)?.name ?? inId,
                      });
                    }
                    const nextLive: LiveMatchState = {
                      ...live,
                      phase: live.phase,
                      lineup: startingXI,
                      bench: nextBench,
                      gone: goneList,
                      goneSlotIndexes: { ...liveGoneSlotIndexesRef.current },
                      pendingForcedInjurySlots: {},
                      formation: selectedFormation,
                      stamina,
                      subs,
                      subsUsed: live.subsUsed + changes,
                      windowsUsed: live.windowsUsed + (changes > 0 && !free ? 1 : 0),
                    };
                    livePendingForcedInjurySlotsRef.current = {};
                    setSelectedRedHolePlayerId(null);
                    saveLive(nextLive);
                    navigate({
                      to: "/match",
                      state: { resumeLive: true, fixtureId: live.fixtureId } as any,
                    });
                  }}
                >
                  {free
                    ? `Aplicar cambios y volver al partido (${live.minute}') →`
                    : `Guardar cambios y volver (${live.minute}') →`}
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
                suspensions.filter((s) => s.matchdaysRemaining > 0 && (s.competition ?? "league") === activeCompetition).map((s) => s.playerId),
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
