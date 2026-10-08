import { create } from "zustand";
import { additionalWageCommitment } from "@/lib/transfers/BudgetManager";
import { getCurrentSaveId } from "@/lib/savedGames";
import { loadSave, saveSave } from "@/lib/store";
import { teamById, LEAGUES } from "@/data/teams";
import { registerDynamicMarketPlayer, unregisterDynamicMarketPlayer } from "@/lib/transfers/PlayerIndex";
import { registerDynamicPlayer, unregisterDynamicPlayer, usePlayersStore } from "@/store/playersStore";
import { academyPlayerToFcPlayer, academyPlayerToStats, academyContract, academyMarketValue } from "./academyAdapters";
import { ACADEMY_FACILITIES, ACADEMY_LIMITS, ACADEMY_ID_BASE } from "./academyConstants";
import { generateAcademyState, generateAnnualIntake } from "./academyGenerator";
import { advanceAcademyToDate } from "./academyProgression";
import { loadAcademySave, saveAcademySave, clearAcademySave } from "./academyPersistence";
import { DYNAMIC_BY_ID, DYNAMIC_MARKET_BY_ID, getAcademyPromotionEvents, recordAcademyPromotionEvent, setCalledUpPlayer, getCalledUpPlayers, clearCalledUpPlayer } from "./academyRuntime";
import { setUserPlayerLoanListed } from "@/lib/transfers/UserNegotiation";
import { syncCalledUpAcademyPlayer } from "./academyCallUp";
import { listForTransfer } from "@/lib/transfers/ContractEngine";
import { getPlayer } from "@/lib/transfers/PlayerIndex";
import { saveTransferSystem } from "@/lib/transfers/Persistence";
import type { AcademyPlayer, AcademyCareerRecord, ClubAcademyState } from "./academyTypes";
import type { MarketPlayer } from "@/lib/transfers/types";

type AcademyState = {
  loaded: boolean;
  saveId: string | null;
  clubs: Record<string, ClubAcademyState>;
  loadForCurrentSave: (teamId: string, season: number | string, currentDate?: string) => Promise<ClubAcademyState>;
  ensureClub: (teamId: string, season: number | string, currentDate?: string) => Promise<ClubAcademyState>;
  save: () => Promise<void>;
  promoteForUser: (playerId: number, options?: { years?: number; wage?: number; releaseClause?: number; signingBonus?: number; squadRole?: import("@/lib/transfers/types").SquadRole }) => { ok: true } | { ok: false; reason: string };
  releaseForUser: (playerId: number) => Promise<{ ok: true } | { ok: false; reason: string }>;
  renewYouthContract: (playerId: number, years?: number, squadRole?: import("@/lib/transfers/types").SquadRole) => Promise<{ ok: true } | { ok: false; reason: string }>;
  loanForUser: (playerId: number, borrowerClubId: string, date: string) => Promise<{ ok: true; clubId: string } | { ok: false; reason: string }>;
  setLoanSearchForUser: (playerId: number, listed: boolean, date: string) => Promise<{ ok: true; listed: boolean } | { ok: false; reason: string }>;
  listTransferForUser: (playerId: number, date: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  listForSale: (playerId: number, futurePercentage?: number, buybackClause?: number) => Promise<{ ok: true } | { ok: false; reason: string }>;
  callUpForUser: (playerId: number) => Promise<{ ok: true } | { ok: false; reason: string }>;
  prepareForInternalContractNegotiation: (playerId: number, date: string) => MarketPlayer | null;
  uncallForUser: (playerId: number | string, date: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  demoteToAcademy: (playerId: string, date: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  assignMentor: (playerId: number, mentorId: number | null) => Promise<{ ok: true } | { ok: false; reason: string }>;
  retrainPosition: (playerId: number, position: AcademyPlayer["positions"][number], date: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  reconcileUserAcademy: (teamId: string) => Promise<void>;
  addAnnualIntake: (teamId: string, season: number | string) => Promise<{ ok: true; added: number } | { ok: false; reason: string }>;
  upgradeFacilities: (teamId: string) => Promise<{ ok: true; level: number; cost: number } | { ok: false; reason: string }>;
  upgradeYouthCoach: (teamId: string) => Promise<{ ok: true; level: number; cost: number } | { ok: false; reason: string }>;
  getUserPlayers: (teamId: string | null) => AcademyPlayer[];
  reset: () => Promise<void>;
};

function stateForPlayer(state: AcademyState, playerId: number | string): { club: ClubAcademyState; player: AcademyPlayer } | null {
  const normalizedId = Number(playerId);
  for (const club of Object.values(state.clubs)) {
    const player = club.players.find((candidate) => Number(candidate.id) === normalizedId);
    if (player) return { club, player };
  }
  return null;
}

function cloneClub(club: ClubAcademyState, players: AcademyPlayer[]): ClubAcademyState {
  return { ...club, players, updatedAt: new Date().toISOString() };
}

function dynamicMarketFromAcademy(player: AcademyPlayer, date: string, status: "academy" | "listed" | "loaned"): MarketPlayer | null {
  const team = teamById(player.teamId);
  const league = LEAGUES[team.league]?.name ?? team.league;
  const playersState = usePlayersStore.getState();
  const existingFc = DYNAMIC_BY_ID.get(String(player.id));
  const existingStats = playersState.stats[String(player.id)];
  const liveAttributes = existingStats?.dynamicStats?.attributes;
  const liveOvr = Math.round(Number(existingStats?.dynamicStats?.currentOVR ?? existingFc?.OVR ?? player.ovr));
  const livePotential = Math.round(Number(existingStats?.dynamicStats?.potentialOVR ?? existingFc?.potential ?? player.potential));
  const baseFc = existingFc ?? academyPlayerToFcPlayer(player, team.name, league);
  const fc = {
    ...baseFc,
    OVR: liveOvr,
    potential: livePotential,
    PAC: Number(liveAttributes?.PAC ?? baseFc.PAC),
    SHO: Number(liveAttributes?.SHO ?? baseFc.SHO),
    PAS: Number(liveAttributes?.PAS ?? baseFc.PAS),
    DRI: Number(liveAttributes?.DRI ?? baseFc.DRI),
    DEF: Number(liveAttributes?.DEF ?? baseFc.DEF),
    PHY: Number(liveAttributes?.PHY ?? baseFc.PHY),
    academyPromotionYear: undefined,
  };
  const contract = {
    ...academyContract(player),
    futureSalePercentage: player.saleFuturePercentage,
    buybackClause: player.buybackClause,
  };
  const marketValue = academyMarketValue(player);
  registerDynamicPlayer(fc, existingStats ?? academyPlayerToStats(player));
  registerDynamicMarketPlayer({
    id: String(fc.ID), name: fc.Name, age: fc.Age, ovr: fc.OVR, potential: fc.potential ?? fc.OVR,
    position: fc.Position, group: fc.Position === "GK" ? "GK" : ["CB"].includes(fc.Position) ? "CB" : ["LB", "RB"].includes(fc.Position) ? "FB" : ["ST", "CF"].includes(fc.Position) ? "ST" : ["LW", "RW"].includes(fc.Position) ? "WING" : "CM",
    nation: fc.Nation ?? "", clubId: team.id, leagueId: team.league, value: marketValue, contract,
    personality: { ambition: 0.66, loyalty: 0.85, greed: 0.16, playingTimeDesire: 0.95, adventure: 0.25 },
    transferListed: status === "listed", listReason: status === "listed" ? "user" : null, loanListed: false, loanClubId: null, loanOwnerClubId: null, loanEndDate: null, minutesShare: 0,
    attributes: { pace: fc.PAC, passing: fc.PAS, physical: fc.PHY, defending: fc.DEF },
    academyStatus: status, academyParentClubId: team.id,
  });
  const market = DYNAMIC_MARKET_BY_ID.get(String(fc.ID));
  if (market) {
    const normalized = { ...market, academyStatus: status, academyParentClubId: team.id };
    DYNAMIC_MARKET_BY_ID.set(String(fc.ID), normalized);
    return normalized;
  }
  void date;
  return null;
}

export const useAcademyStore = create<AcademyState>((set, get) => ({
  loaded: false,
  saveId: null,
  clubs: {},

  loadForCurrentSave: async (teamId, season, currentDate) => {
    const saveId = getCurrentSaveId();
    if (!saveId) throw new Error("No hay una partida activa.");
    const existing = await loadAcademySave(saveId);
    const userTeamId = usePlayersStore.getState().myTeamId ?? existing?.userTeamId ?? teamId;
    if (get().saveId !== saveId) set({ loaded: false, saveId, clubs: existing?.clubs ?? {} });
    const current = get().clubs[teamId];
    if (current) {
      for (const player of current.players.filter((candidate) => candidate.status === "called-up")) {
        const team = teamById(teamId);
        const league = LEAGUES[team.league]?.name ?? team.league;
        setCalledUpPlayer(teamId, academyPlayerToFcPlayer(player, team.name, league));
      }
      const advanced = currentDate ? advanceAcademyToDate(current, currentDate, saveId) : current;
      if (advanced !== current) {
        const nextClubs = { ...get().clubs, [teamId]: advanced };
        set({ loaded: true, clubs: nextClubs });
        if (teamId === userTeamId) {
          await saveAcademySave({ version: 1, savedAt: new Date().toISOString(), userTeamId, clubs: { [teamId]: advanced } }, saveId);
        }
        return advanced;
      }
      set({ loaded: true });
      return current;
    }
    const generated = generateAcademyState(saveId, teamId, season);
    const advanced = currentDate ? advanceAcademyToDate(generated, currentDate, saveId) : generated;
    const finalClubs = { ...get().clubs, [teamId]: advanced };
    set({ loaded: true, saveId, clubs: finalClubs });
    if (teamId === userTeamId) {
      await saveAcademySave({ version: 1, savedAt: new Date().toISOString(), userTeamId, clubs: { [teamId]: advanced } }, saveId);
    }
    return advanced;
  },

  ensureClub: async (teamId, season, currentDate) => {
    const found = get().clubs[teamId];
    if (!found) return get().loadForCurrentSave(teamId, season, currentDate);
    if (!currentDate) return found;
    const saveId = get().saveId ?? getCurrentSaveId();
    if (!saveId) return found;
    const advanced = advanceAcademyToDate(found, currentDate, saveId);
    if (advanced !== found) {
      const clubs = { ...get().clubs, [teamId]: advanced };
      set({ clubs });
      const userTeamId = usePlayersStore.getState().myTeamId ?? teamId;
      if (teamId === userTeamId) {
        await saveAcademySave({ version: 1, savedAt: new Date().toISOString(), userTeamId, clubs: { [teamId]: advanced } }, saveId);
      }
      return advanced;
    }
    return found;
  },

  save: async () => {
    const saveId = get().saveId ?? getCurrentSaveId();
    if (!saveId) return;
    const userTeamId = usePlayersStore.getState().myTeamId ?? Object.keys(get().clubs)[0] ?? null;
    if (!userTeamId) return;
    const userClub = get().clubs[userTeamId];
    if (!userClub) return;
    await saveAcademySave({ version: 1, savedAt: new Date().toISOString(), userTeamId, clubs: { [userTeamId]: userClub } }, saveId);
  },

  promoteForUser: (playerId, options) => {
    const state = get();
    const found = stateForPlayer(state, playerId);
    const saveId = state.saveId ?? getCurrentSaveId();
    if (!found || !saveId) return { ok: false, reason: "Canterano no encontrado." };
    const current = found.player;
    if (current.status === "promoted") return { ok: false, reason: "El canterano ya ha subido." };
    if (current.age < ACADEMY_LIMITS.professionalPromotionMinAge) return { ok: false, reason: "Debe tener al menos 18 años para firmar contrato profesional." };

    const playersState = usePlayersStore.getState();
    const team = teamById(current.teamId);
    const league = LEAGUES[team.league]?.name ?? team.league;
    const liveFc = DYNAMIC_BY_ID.get(String(current.id));
    const liveStats = playersState.stats[String(current.id)];
    const liveAttributes = liveStats?.dynamicStats?.attributes;
    const fc = {
      ...(liveFc ?? academyPlayerToFcPlayer(current, team.name, league)),
      OVR: Math.round(Number(liveStats?.dynamicStats?.currentOVR ?? liveFc?.OVR ?? current.ovr)),
      potential: Math.round(Number(liveStats?.dynamicStats?.potentialOVR ?? liveFc?.potential ?? current.potential)),
      PAC: Number(liveAttributes?.PAC ?? liveFc?.PAC ?? current.attributes.PAC),
      SHO: Number(liveAttributes?.SHO ?? liveFc?.SHO ?? current.attributes.SHO),
      PAS: Number(liveAttributes?.PAS ?? liveFc?.PAS ?? current.attributes.PAS),
      DRI: Number(liveAttributes?.DRI ?? liveFc?.DRI ?? current.attributes.DRI),
      DEF: Number(liveAttributes?.DEF ?? liveFc?.DEF ?? current.attributes.DEF),
      PHY: Number(liveAttributes?.PHY ?? liveFc?.PHY ?? current.attributes.PHY),
      academyPromotionYear: Number((usePlayersStore.getState().currentDate || new Date().toISOString().slice(0, 10)).slice(0, 4)) || undefined,
    };
    const stats = liveStats ?? academyPlayerToStats(current);
    const effectiveStats = options?.squadRole
      ? { ...stats, squadRole: options.squadRole, squadRoleIsNegotiated: true }
      : stats;
    const baseContract = academyContract(current);
    const professionalWage = Math.max(0, Math.round((options?.wage ?? baseContract.wage) / 1000) * 1000);
    // El presupuesto salarial que aparece en Mercado es la fuente de verdad.
    // No se crea una bolsa distinta ni se modifica el reparto al promocionar.
    const effectiveWageBudget = Math.min(
      Math.max(0, playersState.budget),
      Math.max(0, playersState.wageBudget > 0 ? playersState.wageBudget : Math.round(playersState.budget * 0.05)),
    );
    const wageCommitment = additionalWageCommitment(0, professionalWage);
    const availableWage = Math.max(0, Math.round(effectiveWageBudget));
    if (wageCommitment > availableWage) {
      return { ok: false, reason: `No hay suficiente margen salarial. Disponible: ${availableWage.toLocaleString("es-ES")} €.` };
    }
    const signingBonus = Math.max(0, Math.round((options?.signingBonus ?? 0) / 1_000) * 1_000);
    const transferBudget = Math.max(0, playersState.budget - effectiveWageBudget);
    if (signingBonus > transferBudget) {
      return { ok: false, reason: `No hay suficiente presupuesto de fichajes para una prima de ${signingBonus.toLocaleString("es-ES")} € (disponible: ${transferBudget.toLocaleString("es-ES")} €).` };
    }
    const contract = {
      ...baseContract,
      yearsLeft: Math.max(2, options?.years ?? baseContract.yearsLeft),
      wage: professionalWage,
      releaseClause: options?.releaseClause ?? baseContract.releaseClause,
      signingBonus,
    };
    const marketValue = academyMarketValue({ ...current, ovr: fc.OVR, potential: fc.potential, attributes: { PAC: fc.PAC, SHO: fc.SHO, PAS: fc.PAS, DRI: fc.DRI, DEF: fc.DEF, PHY: fc.PHY } });

    registerDynamicPlayer(fc, effectiveStats);
    registerDynamicMarketPlayer({
      id: String(fc.ID), name: fc.Name, age: fc.Age, ovr: fc.OVR, potential: fc.potential ?? fc.OVR,
      position: fc.Position, group: fc.Position === "GK" ? "GK" : ["CB"].includes(fc.Position) ? "CB" : ["LB", "RB"].includes(fc.Position) ? "FB" : ["ST", "CF"].includes(fc.Position) ? "ST" : ["LW", "RW"].includes(fc.Position) ? "WING" : "CM", nation: fc.Nation ?? "", clubId: team.id, leagueId: team.league, value: marketValue, contract: {
        ...contract,
      },
      personality: { ambition: 0.65, loyalty: 0.8, greed: 0.2, playingTimeDesire: 0.9, adventure: 0.25 },
      transferListed: false, listReason: null, loanListed: false, loanClubId: null, loanOwnerClubId: null, loanEndDate: null, minutesShare: 0,
      attributes: { pace: fc.PAC, passing: fc.PAS, physical: fc.PHY, defending: fc.DEF },
      academyStatus: "promoted", academyParentClubId: team.id,
    });

    const promotionDate = usePlayersStore.getState().currentDate || new Date().toISOString().slice(0, 10);
    const promoted = { ...current, status: "promoted" as const, contractYearsLeft: Math.max(2, options?.years ?? contract.yearsLeft), promotedAt: { date: promotionDate, reason: "Promoción manual del usuario" } };
    recordAcademyPromotionEvent({
      id: `academy-promotion:${current.teamId}:${current.id}:${promotionDate}:user`,
      date: promotionDate,
      playerId: current.id,
      playerName: current.name,
      teamId: current.teamId,
      reason: "Promoción manual del usuario",
      wasUserDecision: true,
    });
    clearCalledUpPlayer(found.club.teamId, String(playerId));
    const updatedClub = cloneClub(found.club, found.club.players.filter((p) => p.id !== playerId));
    const clubs = { ...state.clubs, [found.club.teamId]: updatedClub };
    set({ clubs });

    const rosterIds = playersState.rosterIds.includes(String(fc.ID)) ? playersState.rosterIds : [...playersState.rosterIds, String(fc.ID)];
    const wageBill = playersState.wageBill + professionalWage;
    // Un profesional que parte de 0 € de ficha consume el salario completo
    // como nueva obligación salarial. La prima sale exclusivamente del
    // presupuesto de fichajes.
    const budget = Math.max(0, playersState.budget - professionalWage - signingBonus);
    const wageBudget = Math.max(0, Math.round(playersState.wageBudget - professionalWage));
    usePlayersStore.setState({
      rosterIds,
      squad: playersState.squad.concat(fc),
      stats: { ...playersState.stats, [String(fc.ID)]: effectiveStats },
      wageBill,
      budget,
      wageBudget,
    });

    void get().save();
    const activeSave = loadSave();
    if (activeSave) void saveSave({ ...activeSave, academyEvents: getAcademyPromotionEvents() });
    void promoted;
    return { ok: true };
  },

  releaseForUser: async (playerId) => {
    const state = get();
    const found = stateForPlayer(state, playerId);
    if (!found) return { ok: false, reason: "Canterano no encontrado." };
    if (found.player.status === "loaned") return { ok: false, reason: "No puedes liberar a un canterano mientras está cedido." };
    clearCalledUpPlayer(found.club.teamId, String(playerId));
    unregisterDynamicMarketPlayer(String(playerId));
    unregisterDynamicPlayer(String(playerId));
    const next = cloneClub(found.club, found.club.players.filter((p) => p.id !== playerId));
    set({ clubs: { ...state.clubs, [found.club.teamId]: next } });
    await get().save();
    return { ok: true };
  },

  renewYouthContract: async (playerId, years = 2, squadRole) => {
    const state = get();
    const found = stateForPlayer(state, playerId);
    if (!found) return { ok: false, reason: "Canterano no encontrado." };
    const nextPlayer = { ...found.player, contractYearsLeft: Math.max(1, years) };
    const next = cloneClub(found.club, found.club.players.map((p) => p.id === playerId ? nextPlayer : p));
    const market = DYNAMIC_MARKET_BY_ID.get(String(playerId));
    if (market) {
      DYNAMIC_MARKET_BY_ID.set(String(playerId), {
        ...market,
        contract: {
          ...market.contract,
          yearsLeft: nextPlayer.contractYearsLeft,
        },
      });
    }
    const playersState = usePlayersStore.getState();
    const currentStats = playersState.stats[String(playerId)];
    if (squadRole && currentStats) {
      usePlayersStore.setState({
        stats: {
          ...playersState.stats,
          [String(playerId)]: { ...currentStats, squadRole, squadRoleIsNegotiated: true },
        },
      });
    }
    set({ clubs: { ...state.clubs, [found.club.teamId]: next } });
    await get().save();
    return { ok: true };
  },

  upgradeFacilities: async (teamId) => {
    const club = get().clubs[teamId];
    if (!club) return { ok: false, reason: "La cantera todavía no está cargada." };
    if (club.facilityLevel >= ACADEMY_FACILITIES.max) return { ok: false, reason: "Las instalaciones ya están al máximo." };
    const nextLevel = club.facilityLevel + 1;
    const cost = ACADEMY_LIMITS.facilityUpgradeCosts[nextLevel] ?? 0;
    if (!usePlayersStore.getState().spendBudget(cost)) return { ok: false, reason: "No hay suficiente presupuesto para mejorar las instalaciones." };
    const next = cloneClub(club, club.players);
    next.facilityLevel = nextLevel as ClubAcademyState["facilityLevel"];
    set({ clubs: { ...get().clubs, [teamId]: next } });
    await get().save();
    return { ok: true, level: nextLevel, cost };
  },

  upgradeYouthCoach: async (teamId) => {
    const club = get().clubs[teamId];
    if (!club) return { ok: false, reason: "La cantera todavía no está cargada." };
    const currentLevel = club.youthCoach?.level ?? 1;
    if (currentLevel >= 5) return { ok: false, reason: "El entrenador juvenil ya está al máximo." };
    const nextLevel = currentLevel + 1;
    const cost = ACADEMY_LIMITS.youthCoachUpgradeCosts[nextLevel] ?? 0;
    if (!usePlayersStore.getState().spendBudget(cost)) return { ok: false, reason: "No hay suficiente presupuesto para mejorar el cuerpo técnico juvenil." };
    const next = cloneClub(club, club.players);
    next.youthCoach = { specialty: next.youthCoach?.specialty ?? "MID", level: nextLevel };
    set({ clubs: { ...get().clubs, [teamId]: next } });
    await get().save();
    return { ok: true, level: nextLevel, cost };
  },

  addAnnualIntake: async (teamId, season) => {
    const state = get();
    const club = await get().ensureClub(teamId, season);
    const saveId = state.saveId ?? getCurrentSaveId();
    if (!saveId) return { ok: false, reason: "No hay una partida activa." };
    const numericSeason = Number(String(season).slice(0, 4));
    if (club.manualPromotionAvailable === false) return { ok: false, reason: `La promoción juvenil de ${numericSeason} ya está generada.` };
    if (club.players.length >= ACADEMY_LIMITS.maxPlayers) return { ok: false, reason: "La cantera está llena. Libera o promociona jugadores antes de generar otra promoción." };
    const additions = generateAnnualIntake(saveId, { ...club, lastIntakeSeason: Math.min(club.lastIntakeSeason, numericSeason - 1) }, numericSeason);
    if (!additions.length) return { ok: false, reason: "No hay hueco suficiente para una nueva promoción juvenil." };
    const next = cloneClub({ ...club, lastIntakeSeason: numericSeason, manualPromotionAvailable: false }, [...club.players, ...additions].slice(0, ACADEMY_LIMITS.maxPlayers));
    set({ clubs: { ...get().clubs, [teamId]: next } });
    await get().save();
    return { ok: true, added: additions.length };
  },

  loanForUser: async (playerId, borrowerClubId, date) => {
    const found = stateForPlayer(get(), playerId);
    if (!found || found.player.status !== "academy") return { ok: false, reason: "Canterano no encontrado." };
    if (borrowerClubId === found.player.teamId) return { ok: false, reason: "El destino debe ser otro club." };
    if (found.player.age < 16) return { ok: false, reason: "El canterano es demasiado joven para salir cedido." };
    dynamicMarketFromAcademy(found.player, date, "academy");
    try {
      const { withUserApproval } = await import("@/lib/transfers/MarketLocks");
      const { arrangeLoan } = await import("@/lib/transfers/LoanEngine");
      const result = withUserApproval(() => arrangeLoan(String(playerId), borrowerClubId, { date }));
      if (!result.agreed) {
        unregisterDynamicMarketPlayer(String(playerId));
        unregisterDynamicPlayer(String(playerId));
        return { ok: false, reason: result.message };
      }
      const market = DYNAMIC_MARKET_BY_ID.get(String(playerId));
      const updatedPlayer: AcademyPlayer = { ...found.player, status: "loaned", loanClubId: borrowerClubId, loanStartedAt: date, loanReturnDate: market?.loanEndDate ?? undefined, loanReports: [] };
      const clubs = { ...get().clubs, [found.club.teamId]: cloneClub(found.club, found.club.players.map((p) => p.id === playerId ? updatedPlayer : p)) };
      set({ clubs });
      await get().save();
      return { ok: true, clubId: borrowerClubId };
    } catch (error) {
      unregisterDynamicMarketPlayer(String(playerId));
      unregisterDynamicPlayer(String(playerId));
      return { ok: false, reason: error instanceof Error ? error.message : "No se pudo cerrar la cesión." };
    }
  },

  setLoanSearchForUser: async (playerId, listed, date) => {
    const found = stateForPlayer(get(), playerId);
    if (!found || !["academy", "called-up"].includes(found.player.status)) return { ok: false, reason: "Canterano no encontrado." };
    if (found.player.status === "called-up") clearCalledUpPlayer(found.club.teamId, String(playerId));
    dynamicMarketFromAcademy(found.player, date, "academy");
    setUserPlayerLoanListed(String(playerId), listed);
    await saveTransferSystem();
    return { ok: true, listed };
  },

  listTransferForUser: async (playerId, date) => {
    const found = stateForPlayer(get(), playerId);
    if (!found || !["academy", "called-up"].includes(found.player.status)) return { ok: false, reason: "Canterano no encontrado." };
    dynamicMarketFromAcademy(found.player, date, "listed");
    listForTransfer(String(playerId), "user");
    const next = cloneClub(found.club, found.club.players.map((p) => p.id === playerId ? { ...p, status: "listed" as const } : p));
    set({ clubs: { ...get().clubs, [found.club.teamId]: next } });
    await Promise.all([get().save(), saveTransferSystem()]);
    return { ok: true };
  },

  listForSale: async (playerId, futurePercentage = 0, buybackClause = 0) => {
    const found = stateForPlayer(get(), playerId);
    if (!found || (found.player.status !== "academy" && found.player.status !== "called-up")) return { ok: false, reason: "Canterano no encontrado." };
    if (found.player.status === "called-up") clearCalledUpPlayer(found.club.teamId, String(playerId));
    const percentage = Math.max(0, Math.min(ACADEMY_LIMITS.academySaleFuturePercentageMax, Math.round(futurePercentage)));
    const value = academyMarketValue(found.player);
    const buyback = Math.max(0, Math.round(Math.min(value * ACADEMY_LIMITS.academyBuybackMaxMultiplier, buybackClause || 0)));
    dynamicMarketFromAcademy(found.player, usePlayersStore.getState().currentDate, "listed");
    const market = DYNAMIC_MARKET_BY_ID.get(String(playerId));
    if (market) DYNAMIC_MARKET_BY_ID.set(String(playerId), { ...market, academyStatus: "listed", academyParentClubId: found.player.teamId });
    const next = cloneClub(found.club, found.club.players.map((p) => p.id === playerId ? { ...p, status: "listed", saleFuturePercentage: percentage, buybackClause: buyback } : p));
    set({ clubs: { ...get().clubs, [found.club.teamId]: next } });
    await get().save();
    return { ok: true };
  },

  callUpForUser: async (playerId) => {
    const found = stateForPlayer(get(), playerId);
    if (!found) return { ok: false, reason: "Canterano no encontrado." };
    if (found.player.age < 16) return { ok: false, reason: "El canterano todavía no puede entrenar con el primer equipo." };
    const team = teamById(found.player.teamId);
    const league = LEAGUES[team.league]?.name ?? team.league;
    const playersState = usePlayersStore.getState();
    const dynamicStats = playersState.stats[String(playerId)] ?? academyPlayerToStats(found.player);
    const liveDynamic = DYNAMIC_BY_ID.get(String(playerId));
    const fc = {
      ...(liveDynamic ?? academyPlayerToFcPlayer(found.player, team.name, league)),
      OVR: Math.round(Number(dynamicStats.dynamicStats?.currentOVR ?? liveDynamic?.OVR ?? found.player.ovr)),
      potential: Math.round(Number(dynamicStats.dynamicStats?.potentialOVR ?? liveDynamic?.potential ?? found.player.potential)),
    };
    registerDynamicPlayer(fc, dynamicStats);
    // Los convocados no deben conservar una entrada temporal de mercado
    // (creada al negociar o buscar cesión), porque esa entrada marca al
    // jugador como academy/loaned y podría impedir la progresión del primer equipo.
    unregisterDynamicMarketPlayer(String(playerId));
    setCalledUpPlayer(found.player.teamId, fc);
    const next = cloneClub(found.club, found.club.players.map((p) => p.id === playerId ? { ...p, status: "called-up" } : p));
    set({ clubs: { ...get().clubs, [found.club.teamId]: next } });
    await get().save();
    return { ok: true };
  },

  prepareForInternalContractNegotiation: (playerId, date) => {
    const found = stateForPlayer(get(), playerId);
    if (!found) return null;
    const existing = DYNAMIC_MARKET_BY_ID.get(String(playerId));
    if (existing) return existing;
    return dynamicMarketFromAcademy(found.player, date, "academy");
  },

  uncallForUser: async (playerId, date) => {
    const state = get();
    const normalizedPlayerId = Number(playerId);
    const found = stateForPlayer(state, playerId);
    if (!found) return { ok: false, reason: "Canterano no encontrado." };
    const runtimeCalledUp = getCalledUpPlayers(found.club.teamId).some((player) => Number(player.ID) === normalizedPlayerId);
    if (found.player.status !== "called-up" && !runtimeCalledUp) {
      return { ok: false, reason: "El canterano no está convocado." };
    }

    const activeSave = loadSave();
    const selectedXI = activeSave?.lineups?.[found.club.teamId] ?? [];
    const selectedBench = activeSave?.substitutes?.[found.club.teamId] ?? [];
    if (selectedXI.some((id) => Number(id) === normalizedPlayerId) || selectedBench.some((id) => Number(id) === normalizedPlayerId)) {
      return { ok: false, reason: "Retíralo primero del once/banquillo." };
    }

    const playersState = usePlayersStore.getState();
    const dynamicPlayer = DYNAMIC_BY_ID.get(String(normalizedPlayerId));
    const stats = playersState.stats[String(normalizedPlayerId)];
    const synced = syncCalledUpAcademyPlayer(found.player, dynamicPlayer, stats);
    const nextClub = cloneClub(found.club, found.club.players.map((player) => Number(player.id) === normalizedPlayerId ? synced : player));

    clearCalledUpPlayer(found.club.teamId, String(normalizedPlayerId));
    unregisterDynamicMarketPlayer(String(normalizedPlayerId));
    unregisterDynamicPlayer(String(normalizedPlayerId));
    set({ clubs: { ...state.clubs, [found.club.teamId]: nextClub } });

    // Conservamos stats y progresión para que, al volver a convocarlo más
    // adelante, parta de la media/atributos ganados sin duplicarlos.
    usePlayersStore.setState({
      stats: {
        ...playersState.stats,
        [String(normalizedPlayerId)]: {
          ...(stats ?? academyPlayerToStats(synced)),
          dynamicStats: {
            ...(stats?.dynamicStats ?? academyPlayerToStats(synced).dynamicStats!),
            currentOVR: synced.ovr,
            potentialOVR: synced.potential,
            attributes: { ...synced.attributes },
          },
        },
      },
    });
    await get().save();
    void date;
    return { ok: true };
  },

  demoteToAcademy: async (playerId, date) => {
    const state = get();
    const playersState = usePlayersStore.getState();
    const fc = playersState.squad.find((player) => String(player.ID) === String(playerId));
    if (!fc || !playersState.myTeamId) {
      return { ok: false, reason: "Jugador no encontrado en tu plantilla." };
    }

    const marketPlayer = getPlayer(String(playerId));
    const isAcademyOrigin =
      Boolean(fc.academyPromotionYear) ||
      String(fc.ID).startsWith(String(ACADEMY_ID_BASE)) ||
      marketPlayer?.academyStatus === "promoted";
    if (fc.Age > 21 || !isAcademyOrigin) {
      return { ok: false, reason: "Solo puedes bajar a cantera a jóvenes de hasta 21 años que hayan salido de la cantera." };
    }

    const club = await get().ensureClub(playersState.myTeamId, Number(date.slice(0, 4)), date);
    if (club.players.length >= ACADEMY_LIMITS.maxPlayers) {
      return { ok: false, reason: "La cantera está llena." };
    }

    // Nunca dependemos exclusivamente del Map en memoria: las partidas cargadas
    // también guardan `dynamicPlayers`, así que usamos ese registro como fallback.
    const base = DYNAMIC_BY_ID.get(String(playerId))
      ?? playersState.dynamicPlayers?.[String(playerId)]
      ?? fc;
    const stats = playersState.stats[String(playerId)];
    const liveAttributes = stats?.dynamicStats?.attributes;
    const currentOvr = Math.round(Number(stats?.dynamicStats?.currentOVR ?? fc.OVR));
    const currentPotential = Math.round(Number(stats?.dynamicStats?.potentialOVR ?? fc.potential ?? fc.OVR));
    const oldWage = Math.max(0, Math.round(Number(marketPlayer?.contract?.wage ?? 0)));

    const nextPlayer: AcademyPlayer = {
      id: Number(base.ID),
      teamId: playersState.myTeamId,
      name: base.Name,
      nation: base.Nation ?? "España",
      birthdate: base.birthdate ?? `${Math.max(2000, Number(date.slice(0, 4)) - base.Age)}-06-01`,
      age: base.Age,
      positions: [base.Position as AcademyPlayer["positions"][number]],
      ovr: currentOvr,
      potential: currentPotential,
      potentialEstimate: {
        min: Math.max(50, currentPotential - 8),
        max: Math.min(90, currentPotential + 3),
      },
      attributes: {
        PAC: Number(liveAttributes?.PAC ?? base.PAC),
        SHO: Number(liveAttributes?.SHO ?? base.SHO),
        PAS: Number(liveAttributes?.PAS ?? base.PAS),
        DRI: Number(liveAttributes?.DRI ?? base.DRI),
        DEF: Number(liveAttributes?.DEF ?? base.DEF),
        PHY: Number(liveAttributes?.PHY ?? base.PHY),
      },
      traits: ["hard-worker"],
      growthProfile: "normal",
      joinedSeason: Number(date.slice(0, 4)),
      contractYearsLeft: Math.max(1, Number(marketPlayer?.contract?.yearsLeft ?? 2)),
      status: "academy",
      minutesThisSeason: stats?.dynamicStats?.seasonMinutes ?? 0,
    };

    const nextClub = cloneClub(club, [...club.players, nextPlayer]);
    set({ clubs: { ...state.clubs, [club.teamId]: nextClub } });

    // El jugador deja definitivamente la plantilla profesional y cualquier
    // convocatoria guardada. Así no queda un ID fantasma en Dirección de equipo.
    clearCalledUpPlayer(playersState.myTeamId, String(playerId));
    unregisterDynamicMarketPlayer(String(playerId));
    unregisterDynamicPlayer(String(playerId));

    const nextStats = stats ?? academyPlayerToStats(nextPlayer);
    usePlayersStore.setState({
      squad: playersState.squad.filter((player) => String(player.ID) !== String(playerId)),
      rosterIds: playersState.rosterIds.filter((id) => String(id) !== String(playerId)),
      wageBill: Math.max(0, playersState.wageBill - oldWage),
      wageBudget: playersState.wageBudget,
      stats: {
        ...playersState.stats,
        [String(playerId)]: {
          ...nextStats,
          dynamicStats: {
            ...(nextStats.dynamicStats ?? academyPlayerToStats(nextPlayer).dynamicStats!),
            currentOVR,
            potentialOVR: currentPotential,
            attributes: { ...nextPlayer.attributes },
          },
        },
      },
    });

    // Limpia también XI y banquillo del SaveGame si el joven estaba configurado
    // allí antes de bajarlo. El jugador queda automáticamente en Reservas de cantera.
    const activeSave = loadSave();
    if (activeSave) {
      const teamId = playersState.myTeamId;
      const nextLineups = { ...activeSave.lineups, [teamId]: (activeSave.lineups?.[teamId] ?? []).filter((id) => String(id) !== String(playerId)) };
      const nextSubstitutes = { ...activeSave.substitutes, [teamId]: (activeSave.substitutes?.[teamId] ?? []).filter((id) => String(id) !== String(playerId)) };
      saveSave({ ...activeSave, lineups: nextLineups, substitutes: nextSubstitutes });
    }

    await get().save();
    return { ok: true };
  },

  assignMentor: async (playerId, mentorId) => {
    const found = stateForPlayer(get(), playerId);
    if (!found) return { ok: false, reason: "Canterano no encontrado." };
    if (mentorId !== null) {
      const mentor = usePlayersStore.getState().squad.find((p) => String(p.ID) === String(mentorId));
      if (!mentor || mentor.Age < 30) return { ok: false, reason: "El mentor debe tener al menos 30 años y pertenecer a tu plantilla." };
    }
    const next = cloneClub(found.club, found.club.players.map((p) => p.id === playerId ? { ...p, mentorId: mentorId ?? undefined } : p));
    set({ clubs: { ...get().clubs, [found.club.teamId]: next } });
    const currentStats = usePlayersStore.getState().stats[String(playerId)] ?? academyPlayerToStats(found.player);
    const moraleDelta = mentorId !== null ? 4 : -1;
    usePlayersStore.setState({
      stats: {
        ...usePlayersStore.getState().stats,
        [String(playerId)]: { ...currentStats, morale: Math.max(0, Math.min(100, Math.round((currentStats.morale ?? 70) + moraleDelta))) },
      },
    });
    await get().save();
    return { ok: true };
  },

  retrainPosition: async (playerId, position, date) => {
    const found = stateForPlayer(get(), playerId);
    if (!found || found.player.positions[0] === position) return { ok: false, reason: "Selecciona una posición diferente a la actual." };
    if (found.player.status !== "academy" && found.player.status !== "called-up") return { ok: false, reason: "La reconversión solo está disponible para jugadores de cantera." };
    const available = ["GK", "CB", "LB", "RB", "CM", "CAM", "CDM", "LW", "RW", "ST", "CF"] as const;
    if (!(available as readonly string[]).includes(position)) return { ok: false, reason: "Posición no válida." };
    if (!usePlayersStore.getState().spendBudget(ACADEMY_LIMITS.retrainingCost)) return { ok: false, reason: `No hay presupuesto suficiente para la reconversión (${ACADEMY_LIMITS.retrainingCost.toLocaleString("es-ES")} €).` };
    const positions = [position, ...found.player.positions.filter((x) => x !== position)].slice(0, 3) as AcademyPlayer["positions"];
    const retrainingUntil = addDaysToIso(date, 90);
    const next = cloneClub(found.club, found.club.players.map((p) => p.id === playerId ? { ...p, positions, retrainingPosition: position, retrainingUntil } : p));
    set({ clubs: { ...get().clubs, [found.club.teamId]: next } });
    await get().save();
    return { ok: true };
  },

  reconcileUserAcademy: async (teamId) => {
    const state = get();
    const club = state.clubs[teamId];
    if (!club) return;
    const nextPlayers = club.players.filter((p) => p.status !== "listed" || (DYNAMIC_MARKET_BY_ID.get(String(p.id))?.clubId === teamId));
    if (nextPlayers.length !== club.players.length) {
      set({ clubs: { ...state.clubs, [teamId]: cloneClub(club, nextPlayers) } });
      await get().save();
    }
  },

  getUserPlayers: (teamId) => teamId ? get().clubs[teamId]?.players.filter((p) => ["academy", "called-up", "listed", "loaned"].includes(p.status)) ?? [] : [],

  reset: async () => {
    const saveId = get().saveId ?? getCurrentSaveId();
    if (saveId) await clearAcademySave(saveId);
    for (const club of Object.values(get().clubs)) {
      for (const player of club.players) unregisterDynamicPlayer(String(player.id));
      for (const player of club.players) unregisterDynamicMarketPlayer(String(player.id));
    }
    set({ loaded: false, saveId: null, clubs: {} });
  },
}));

