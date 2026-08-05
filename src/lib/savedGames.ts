import { teamById } from "@/data/teams";
import { SaveGame } from "./store";
import { usePlayersStore } from "@/store/playersStore";

const STORAGE_KEY = "fcsim:save:v2";
const STORAGE_KEY_MULTIPLE = "fcsim:saves:v2";
const CURRENT_SAVE_ID_KEY = "fcsim:save:current";
const PLAYERS_PERSIST_KEY = "fcsim:players:v1";
const SAVE_PERSIST_THROTTLE_MS = 1200;
let lastPersistAt = 0;
let pendingPersist: { id: string; save: SaveGame } | null = null;
let pendingPersistTimer: ReturnType<typeof setTimeout> | null = null;

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

export function getCurrentSaveId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CURRENT_SAVE_ID_KEY);
}

export function setCurrentSaveId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(CURRENT_SAVE_ID_KEY, id);
  else localStorage.removeItem(CURRENT_SAVE_ID_KEY);
}

function snapshotPlayersStore() {
  const s = usePlayersStore.getState();
  return {
    loaded: true,
    myTeamId: s.myTeamId,
    squad: s.squad,
    currentDate: s.currentDate,
    fixtures: s.fixtures,
    stats: s.stats,
    rosterIds: s.rosterIds,
    budget: s.budget,
    dismissedMatchIds: s.dismissedMatchIds,
  };
}

function saveKeyFor(id: string) {
  return `${STORAGE_KEY}:${id}`;
}

/**
 * Persist the current SaveGame and a fresh snapshot of the playersStore
 * into the active save slot. Called on every saveSave() during gameplay so
 * that the per-id save stays in sync with the actual progress.
 */
export function persistCurrentSave(save: SaveGame) {
  if (typeof window === "undefined") return;
  const id = getCurrentSaveId();
  if (!id) return;

  const flush = (targetId: string, targetSave: SaveGame) => {
    const payload = { ...targetSave, playersStoreState: snapshotPlayersStore() };
    localStorage.setItem(saveKeyFor(targetId), JSON.stringify(payload));
    lastPersistAt = Date.now();
    const saves = loadAllSaves();
    const meta = saves.find((s) => s.id === targetId);
    if (meta) {
      meta.lastPlayed = new Date().toISOString();
      saveMultipleSaves(saves);
    }
  };

  try {
    if (Date.now() - lastPersistAt >= SAVE_PERSIST_THROTTLE_MS) {
      flush(id, save);
      return;
    }

    pendingPersist = { id, save };
    if (!pendingPersistTimer) {
      pendingPersistTimer = setTimeout(() => {
        const pending = pendingPersist;
        pendingPersist = null;
        pendingPersistTimer = null;
        if (!pending) return;
        try {
          flush(pending.id, pending.save);
        } catch (err) {
          console.error("Error persisting current save:", err);
        }
      }, SAVE_PERSIST_THROTTLE_MS);
    }
  } catch (err) {
    console.error("Error persisting current save:", err);
  }
}

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
  if (typeof window === "undefined") return;
  const team = teamById(save.myTeamId);
  if (!team) {
    console.error("No se encontró el equipo con id:", save.myTeamId);
    return;
  }
  
  const saves = loadAllSaves();
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
  
  // Activar esta partida como la actual ANTES de persistir el snapshot
  setCurrentSaveId(meta.id);

  const payload = { ...save, playersStoreState: snapshotPlayersStore() };
  localStorage.setItem(saveKeyFor(meta.id), JSON.stringify(payload));

  // Añadir a la lista de metadatos
  saves.unshift(meta);
  saveMultipleSaves(saves);
}

export function deleteSave(id: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(saveKeyFor(id));
  // Borra también el mercado de esa partida (import perezoso para evitar un
  // ciclo de módulos: Persistence.ts ya importa `getCurrentSaveId` de aquí).
  import("@/lib/transfers/Persistence")
    .then(({ clearTransferSaveFor }) => clearTransferSaveFor(id))
    .catch(() => {
      /* si falla la importación no bloqueamos el borrado de la partida */
    });
  const saves = loadAllSaves().filter(s => s.id !== id);
  saveMultipleSaves(saves);
  // Si era la partida activa, desactivarla y limpiar estado en memoria
  if (getCurrentSaveId() === id) {
    setCurrentSaveId(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PLAYERS_PERSIST_KEY);
  }
}

export function loadSaveById(id: string): SaveGame | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(saveKeyFor(id));
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
  // Limpia el estado persistido del playersStore para evitar fugas entre partidas
  localStorage.removeItem(PLAYERS_PERSIST_KEY);

  const snap = save.playersStoreState;
  if (!snap) {
    // Partidas antiguas sin snapshot: dejar el estado limpio con sólo el equipo
    usePlayersStore.setState({
      loaded: false,
      myTeamId: save.myTeamId ?? null,
    } as any);
    return;
  }

  // Restaurar usando setState (mutar el objeto devuelto por getState NO notifica
  // a los componentes ni persiste). Mantener cualquier campo no incluido.
  usePlayersStore.setState({
    loaded: true,
    myTeamId: snap.myTeamId ?? save.myTeamId ?? null,
    squad: snap.squad ?? [],
    currentDate: snap.currentDate,
    fixtures: snap.fixtures ?? [],
    stats: snap.stats ?? {},
    rosterIds: snap.rosterIds ?? [],
    budget: snap.budget,
    dismissedMatchIds: snap.dismissedMatchIds ?? [],
  } as any);
}

export function clearPlayersStorePersist() {
  localStorage.removeItem(PLAYERS_PERSIST_KEY);
  setCurrentSaveId(null);
}
