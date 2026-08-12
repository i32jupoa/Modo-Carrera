import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getAllTeams, teamById, LEAGUES } from "@/data/teams";
import { loadSave, newSave, saveSave } from "@/lib/store";
import {
  loadAllSaves,
  addSaveToMultiple,
  loadSaveById,
  restorePlayersStoreState,
  setCurrentSaveId,
} from "@/lib/savedGames";
import { resetTransferSystem, clearAllTransferSaves } from "@/lib/transfers";
import { resetMarketIndex } from "@/lib/transfers/PlayerIndex";
import { resetSquadReports } from "@/lib/transfers/SquadAnalyzer";
import { resetClubOverrides } from "@/store/playersStore";
import { usePlayersStore } from "@/store/playersStore";

import ClubPreviewModal from "@/components/home/ClubPreviewModal";
import HeroAAA from "@/components/home/HeroAAA";
import MainMenuWizard from "@/components/home/MainMenuWizard";
import StadiumRevealLoader from "@/components/home/StadiumRevealLoader";
import SavedGamesModal from "@/components/home/SavedGamesModal";
import SoundAmbient from "@/components/home/SoundAmbient";

function Index() {
  const navigate = useNavigate();
  const [hasSave, setHasSave] = useState(false);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedClub, setSelectedClub] = useState<string | null>(null);
  const [loaderTeamId, setLoaderTeamId] = useState<string | null>(null);
  const [showContinue, setShowContinue] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [selectedTeamColor, setSelectedTeamColor] = useState<string | null>(null);
  const [savedGamesOpen, setSavedGamesOpen] = useState(false);

  const setMyTeam = usePlayersStore((s) => s.setMyTeam);
  const initPlayers = usePlayersStore((s) => s.init);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const savedGames = useMemo(() => loadAllSaves(), [hasSave]);

  // Generar partículas solo en el cliente para evitar error de hidratación
  const [particles, setParticles] = useState<any[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setParticles(
      [...Array(20)].map((_, i) => ({
        left: `${Math.random() * 100}%`,
        animationDelay: `${Math.random() * 20}s`,
        animationDuration: `${15 + Math.random() * 10}s`,
        background: selectedTeamColor || undefined,
      })),
    );
  }, [selectedTeamColor]);

  useEffect(() => {
    setMounted(true);
    const saves = loadAllSaves();
    setHasSave(saves.length > 0);
    // Limpiar el ID de partida activa al cargar la página principal para evitar contaminación
    setCurrentSaveId(null);
  }, []);

  useEffect(() => {
    const saves = loadAllSaves();
    // Limpiar el estado persistente del playersStore solo si hay partidas guardadas
    // para evitar estado compartido entre partidas
    if (saves.length > 0) {
      localStorage.removeItem("fcsim:players:v1");
    } else {
      // Si no hay partidas guardadas, limpiar también el sistema antiguo
      localStorage.removeItem("fcsim:save:v2");
    }
  }, []);

  function pickTeam(id: string) {
    setLoaderTeamId(id);
    setLoading(true);
    try {
      // Primero borrar cualquier dato persistente del mercado de localStorage
      // ANTES de limpiar el saveId, para borrar TODOS los mercados guardados
      clearAllTransferSaves();
      
      // Limpiar el estado persistente del playersStore para evitar estado compartido
      localStorage.removeItem("fcsim:players:v1");
      // Limpiar la partida activa previa y resetear el playersStore en memoria
      setCurrentSaveId(null);
      usePlayersStore.getState().clear();
      usePlayersStore.getState().resetAllStats();
      
      // Resetear completamente el sistema de transferencias y plantillas para nueva partida
      resetTransferSystem();
      resetMarketIndex();
      resetSquadReports();
      
      // Resetear los overrides de club para que los fichajes no persistan entre partidas
      resetClubOverrides();
      
      initPlayers();
      const s = newSave(id);
      setMyTeam(id);
      // addSaveToMultiple captura el estado del playersStore para independencia
      addSaveToMultiple(s);
      // Guardar en el sistema antiguo para compatibilidad con SeasonPage
      saveSave(s);
      // Verificar que el save se guardó correctamente
      const saved = loadSave();
      if (!saved || saved.myTeamId !== id) {
        throw new Error("Save no se guardó correctamente");
      }
      console.log("Save verificado correctamente:", saved.myTeamId);
      // Esperar para mostrar la animación de stadium reveal
      setTimeout(() => {
        console.log("Navigating to season with save:", s.myTeamId);
        navigate({ to: "/season" });
      }, 2400);
    } catch (err) {
      console.error("Failed to start career:", err);
      setLoading(false);
      setLoaderTeamId(null);
      alert("Error al crear la partida: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  function quickStart() {
    const top = getAllTeams()
      .filter((t) => (t.att + t.mid + t.def) / 3 >= 80)
      .sort(() => Math.random() - 0.5);
    const pick = top[0] || getAllTeams()[Math.floor(Math.random() * getAllTeams().length)];
    if (pick) pickTeam(pick.id);
  }

  function continueGame(save: any, id?: string) {
    // Activar la partida cargada como la actual (para que saveSave la mantenga)
    if (id) {
      setCurrentSaveId(id);
    } else {
      const saves = loadAllSaves();
      const meta = saves.find((m) => m.teamId === save.myTeamId && m.season === save.season);
      if (meta) setCurrentSaveId(meta.id);
    }

    // Limpiar el playersStore en memoria y el estado persistido antes de restaurar
    usePlayersStore.getState().clear();
    usePlayersStore.getState().resetAllStats();
    localStorage.removeItem("fcsim:players:v1");

    // Restaurar el snapshot completo (NO llamar a setMyTeam ni init después:
    // ambas reescribirían rosterIds/squad y perderías los fichajes).
    restorePlayersStoreState(save);

    // Sincronizar el sistema antiguo (clave única) con la partida cargada
    saveSave(save);

    navigate({ to: "/season" });
  }

  function handleDeleteGame() {
    setHasSave(loadAllSaves().length > 0);
  }

  const loaderTeam = loaderTeamId ? teamById(loaderTeamId) : null;

  return (
    <div className="min-h-screen overflow-hidden relative">
      <div
        className="global-bg-aaa"
        style={{
          background: selectedTeamColor
            ? `radial-gradient(circle at 50% 50%, ${selectedTeamColor}22 0%, #050505 70%)`
            : undefined,
        }}
      />

      {/* Partículas */}
      {mounted && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          {particles.map((particle, i) => (
            <div
              key={i}
              className="ambient-particle"
              style={{
                left: particle.left,
                animationDelay: particle.animationDelay,
                animationDuration: particle.animationDuration,
                background: particle.background,
              }}
            />
          ))}
        </div>
      )}

      {/* Sonido ambiente */}
      <SoundAmbient />

      {/* Transición entre Hero y Wizard */}
      {!showWizard ? (
        <div className="animate-fade-in">
          <HeroAAA
            savedGamesCount={mounted ? savedGames.length : 0}
            loading={loading}
            onLoadGame={() => setSavedGamesOpen(true)}
            onNewGame={() => setShowWizard(true)}
          />
        </div>
      ) : (
        <div className="animate-slide-in">
          <MainMenuWizard
            onPickTeam={(id) => {
              const team = teamById(id);
              setSelectedTeamColor(team?.color || null);
              setSelectedClub(id);
              setModalOpen(true);
            }}
            onQuickStart={quickStart}
            loading={loading}
          />
        </div>
      )}

      <ClubPreviewModal
        teamId={selectedClub}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onStart={(id) => pickTeam(id)}
      />

      {/* Modal de partidas guardadas */}
      <SavedGamesModal
        open={savedGamesOpen}
        onOpenChange={setSavedGamesOpen}
        onLoadGame={continueGame}
        onDeleteGame={handleDeleteGame}
      />

      {/* Loader temático */}
      {loading && <StadiumRevealLoader teamName={loaderTeam?.name} teamColor={loaderTeam?.color} />}
    </div>
  );
}

export const Route = createFileRoute("/")({
  component: Index,
});
