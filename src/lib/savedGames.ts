import { teamById } from "@/data/teams";
import { SaveGame } from "./store";
import { usePlayersStore } from "@/store/playersStore";

const STORAGE_KEY = "fcsim:save:v2";
const STORAGE_KEY_MULTIPLE = "fcsim:saves:v2";

export type SavedGameMeta = {
  id: string;
  teamId: string;
  teamName: string;
  teamColor: string;
  league: string;
  season: string;
  createdAt: string;
  lastPlayed: string;
};

export function loadAllSaves(): SavedGameMeta[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MULTIPLE);
    if (!raw) return [];
    return JSON.parse(raw) as SavedGameMeta[];
  } catch (err) {
    console.error("Error loading all saves:", err);
    return [];
  }
}

export function saveMultipleSaves(saves: SavedGameMeta[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY_MULTIPLE, JSON.stringify(saves));
}

export function addSaveToMultiple(save: SaveGame) {
  console.log("addSaveToMultiple llamado con save:", save);
  if (typeof window === "undefined") return;
  const team = teamById(save.myTeamId);
  if (!team) {
    console.error("No se encontró el equipo con id:", save.myTeamId);
    return;
  }
  
  const saves = loadAllSaves();
  console.log("Saves actuales:", saves);
  const now = new Date().toISOString();
  
  const meta: SavedGameMeta = {
    id: crypto.randomUUID(),
    teamId: save.myTeamId,
    teamName: team.name,
    teamColor: team.color,
    league: team.league,
    season: save.season,
    createdAt: now,
    lastPlayed: now,
  };
  
  console.log("Meta creado:", meta);
  
  // Capturar el estado del playersStore para independencia entre partidas
  const playersStoreState = usePlayersStore.getState();
  const saveWithPlayersState = {
    ...save,
    playersStoreState: {
      loaded: playersStoreState.loaded,
      myTeamId: playersStoreState.myTeamId,
      squad: playersStoreState.squad,
      currentDate: playersStoreState.currentDate,
      fixtures: playersStoreState.fixtures,
      stats: playersStoreState.stats,
      rosterIds: playersStoreState.rosterIds,
      budget: playersStoreState.budget,
      dismissedMatchIds: playersStoreState.dismissedMatchIds,
    },
  };
  
  // Guardar también el save completo con el ID
  localStorage.setItem(`${STORAGE_KEY}:${meta.id}`, JSON.stringify(saveWithPlayersState));
  console.log("Save guardado con ID:", meta.id);
  
  // Agregar a la lista de metadatos
  saves.unshift(meta);
  saveMultipleSaves(saves);
  console.log("Saves después de agregar:", saves);
}

export function deleteSave(id: string) {
  if (typeof window === "undefined") return;
  
  // Eliminar el save completo
  localStorage.removeItem(`${STORAGE_KEY}:${id}`);
  
  // Eliminar de la lista de metadatos
  const saves = loadAllSaves().filter(s => s.id !== id);
  saveMultipleSaves(saves);
}

export function loadSaveById(id: string): SaveGame | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${id}`);
    if (!raw) return null;
    return JSON.parse(raw) as SaveGame;
  } catch (err) {
    console.error("Error loading save by id:", err);
    return null;
  }
}

export function updateSaveLastPlayed(id: string) {
  if (typeof window === "undefined") return;
  
  const saves = loadAllSaves();
  const save = saves.find(s => s.id === id);
  if (save) {
    save.lastPlayed = new Date().toISOString();
    saveMultipleSaves(saves);
  }
}

export function restorePlayersStoreState(save: SaveGame & { playersStoreState?: any }) {
  const playersStore = usePlayersStore.getState();
  
  // Limpiar el estado persistente para evitar interferencia
  localStorage.removeItem("fcsim:players:v1");
  
  // Si no hay playersStoreState, usar los datos del save directamente
  if (!save.playersStoreState) {
    // Compatibilidad con partidas guardadas anteriormente
    if (save.myTeamId) {
      playersStore.myTeamId = save.myTeamId;
    }
    return;
  }
  
  // Restaurar el estado del playersStore
  if (save.playersStoreState.loaded !== undefined) {
    playersStore.loaded = save.playersStoreState.loaded;
  }
  if (save.playersStoreState.myTeamId !== undefined) {
    playersStore.myTeamId = save.playersStoreState.myTeamId;
  }
  if (save.playersStoreState.squad !== undefined) {
    playersStore.squad = save.playersStoreState.squad;
  }
  if (save.playersStoreState.currentDate !== undefined) {
    playersStore.currentDate = save.playersStoreState.currentDate;
  }
  if (save.playersStoreState.fixtures !== undefined) {
    playersStore.fixtures = save.playersStoreState.fixtures;
  }
  if (save.playersStoreState.stats !== undefined) {
    playersStore.stats = save.playersStoreState.stats;
  }
  if (save.playersStoreState.rosterIds !== undefined) {
    playersStore.rosterIds = save.playersStoreState.rosterIds;
  }
  if (save.playersStoreState.budget !== undefined) {
    playersStore.budget = save.playersStoreState.budget;
  }
  if (save.playersStoreState.dismissedMatchIds !== undefined) {
    playersStore.dismissedMatchIds = save.playersStoreState.dismissedMatchIds;
  }
}

export function clearPlayersStorePersist() {
  // Limpiar el estado persistente del playersStore para evitar estado compartido
  localStorage.removeItem("fcsim:players:v1");
}
