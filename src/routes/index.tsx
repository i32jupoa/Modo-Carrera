import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getAllTeams, teamById, LEAGUES } from "@/data/teams";
import { loadSave, newSave, saveSave, clearSave } from "@/lib/store";
import { loadAllSaves, addSaveToMultiple, loadSaveById, restorePlayersStoreState, clearPlayersStorePersist } from "@/lib/savedGames";
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

  const savedGames = useMemo(() => loadAllSaves(), [hasSave]);

  // Generar partículas solo en el cliente para evitar error de hidratación
  const [particles, setParticles] = useState<any[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setParticles([...Array(20)].map((_, i) => ({
      left: `${Math.random() * 100}%`,
      animationDelay: `${Math.random() * 20}s`,
      animationDuration: `${15 + Math.random() * 10}s`,
      background: selectedTeamColor || undefined,
    })));
  }, [selectedTeamColor]);

  useEffect(() => {
    const saves = loadAllSaves();
    setHasSave(saves.length > 0);
    // Limpiar el estado persistente del playersStore solo si hay partidas guardadas
    // para evitar estado compartido entre partidas
    if (saves.length > 0) {
      localStorage.removeItem("fcsim:players:v1");
    } else {
      // Si no hay partidas guardadas, limpiar también el sistema antiguo
      localStorage.removeItem("fcsim:save:v2");
    }
    // Limpiar myTeamId del playersStore para evitar que aparezca el nombre de un equipo
    const playersStore = usePlayersStore.getState();
    if (playersStore.myTeamId) {
      playersStore.myTeamId = null;
    }
  }, []);

  function pickTeam(id: string) {
    setLoaderTeamId(id);
    setLoading(true);
    try {
      // Limpiar el estado persistente del playersStore para evitar estado compartido
      localStorage.removeItem("fcsim:players:v1");
      initPlayers();
      const s = newSave(id);
      setMyTeam(id);
      // addSaveToMultiple captura el estado del playersStore para independencia
      addSaveToMultiple(s);
      // Guardar en el sistema antiguo para compatibilidad con SeasonPage
      saveSave(s);
      // Esperar para mostrar la animación de stadium reveal
      setTimeout(() => navigate({ to: "/season" }), 2400);
    } catch (err) {
      console.error("Failed to start career:", err);
      setLoading(false);
      setLoaderTeamId(null);
    }
  }

  function quickStart() {
    const top = getAllTeams()
      .filter((t) => (t.att + t.mid + t.def) / 3 >= 80)
      .sort(() => Math.random() - 0.5);
    const pick = top[0] || getAllTeams()[Math.floor(Math.random() * getAllTeams().length)];
    if (pick) pickTeam(pick.id);
  }

  function resetGame() {
    clearSave();
    clearPlayersStorePersist();
    setHasSave(false);
  }

  function continueGame(save: any) {
    console.log("continueGame llamado con save:", save);
    // Limpiar el estado persistente del playersStore para evitar estado compartido
    localStorage.removeItem("fcsim:players:v1");
    // Restaurar el estado del playersStore para independencia entre partidas
    console.log("Restaurando estado del playersStore");
    restorePlayersStoreState(save);
    // Inicializar players después de restaurar el estado
    console.log("Inicializando players");
    initPlayers();
    console.log("Seteando myTeam:", save.myTeamId);
    setMyTeam(save.myTeamId);
    // Guardar en el sistema antiguo para compatibilidad con SeasonPage
    console.log("Guardando en sistema antiguo");
    saveSave(save);
    console.log("Navegando a /season");
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
            : undefined
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

      {/* Mensaje de partidas guardadas */}
      {!showWizard && !loading && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 animate-fade-in">
          {savedGames.length === 0 ? (
            <div className="px-6 py-3 rounded-xl bg-white/[0.05] border border-white/10 backdrop-blur-xl text-center">
              <div className="text-white/70 text-sm">No tienes partidas guardadas</div>
              <div className="text-white/50 text-xs mt-1">Inicia una nueva carrera para comenzar</div>
            </div>
          ) : (
            <button
              onClick={() => setSavedGamesOpen(true)}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-white font-bold text-sm shadow-lg shadow-primary/30 hover:brightness-125 transition border border-white/20 backdrop-blur-xl"
            >
              Cargar partida ({savedGames.length})
            </button>
          )}
        </div>
      )}

      {/* Transición entre Hero y Wizard */}
      {!showWizard ? (
        <div className="animate-fade-in">
          <HeroAAA hasSave={hasSave} resetGame={resetGame} loading={loading} onContinueGame={continueGame} />
          <div className="text-center pb-12">
            <button
              onClick={() => setShowWizard(true)}
              className="group relative px-10 py-4 rounded-2xl bg-gradient-to-r from-primary via-primary to-primary text-white font-black text-lg shadow-[0_0_40px_rgba(99,102,241,0.4)] hover:shadow-[0_0_60px_rgba(99,102,241,0.6)] hover:scale-105 transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shimmer" />
              <span className="relative flex items-center gap-3">
                <span className="text-2xl">🚀</span>
                Iniciar Carrera
              </span>
            </button>
          </div>
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

      <ClubPreviewModal teamId={selectedClub} open={modalOpen} onOpenChange={setModalOpen} onStart={(id) => pickTeam(id)} />

      {/* Modal de partidas guardadas */}
      <SavedGamesModal open={savedGamesOpen} onOpenChange={setSavedGamesOpen} onLoadGame={continueGame} onDeleteGame={handleDeleteGame} />

      {/* Loader temático */}
      {loading && (
        <StadiumRevealLoader teamName={loaderTeam?.name} teamColor={loaderTeam?.color} />
      )}
    </div>
  );
}

export const Route = createFileRoute("/")({
  component: Index,
});
