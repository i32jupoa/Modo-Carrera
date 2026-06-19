import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getAllTeams, teamById } from "@/data/teams";
import { loadSave, newSave, saveSave, clearSave } from "@/lib/store";
import { usePlayersStore } from "@/store/playersStore";

import ClubPreviewModal from "@/components/home/ClubPreviewModal";
import HeroAAA from "@/components/home/HeroAAA";
import MainMenuWizard from "@/components/home/MainMenuWizard";
import StadiumRevealLoader from "@/components/home/StadiumRevealLoader";
import FloatingContinuePanel from "@/components/home/FloatingContinuePanel";
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

  const setMyTeam = usePlayersStore((s) => s.setMyTeam);
  const initPlayers = usePlayersStore((s) => s.init);

  const save = useMemo(() => (typeof window !== "undefined" ? loadSave() : null), [hasSave]);
  const savedTeam = save?.myTeamId ? teamById(save.myTeamId) : null;

  useEffect(() => {
    setHasSave(!!loadSave());
  }, []);

  function pickTeam(id: string) {
    setLoaderTeamId(id);
    setLoading(true);
    try {
      initPlayers();
      const s = newSave(id);
      saveSave(s);
      setMyTeam(id);
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
    setHasSave(false);
  }

  function continueGame() {
    navigate({ to: "/season" });
  }

  const loaderTeam = loaderTeamId ? teamById(loaderTeamId) : null;

  return (
    <div className="min-h-screen overflow-hidden relative">
      <div className="global-bg-aaa" />

      {/* Partículas */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="ambient-particle"
            style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 20}s`,
              animationDuration: `${15 + Math.random() * 10}s`,
            }}
          />
        ))}
      </div>

      {/* Sonido ambiente */}
      <SoundAmbient />

      {/* Continuar partida flotante */}
      <FloatingContinuePanel
        visible={hasSave && showContinue && !loading}
        teamName={savedTeam?.name}
        teamColor={savedTeam?.color}
        onContinue={continueGame}
        onDismiss={() => setShowContinue(false)}
      />

      {/* Transición entre Hero y Wizard */}
      <AnimatePresence mode="wait">
        {!showWizard ? (
          <motion.div
            key="hero"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.5 }}
          >
            <HeroAAA hasSave={hasSave} resetGame={resetGame} loading={loading} />
            <div className="text-center pb-12">
              <button
                onClick={() => setShowWizard(true)}
                className="px-8 py-4 rounded-2xl bg-primary text-white font-black text-base shadow-lg shadow-primary/40 hover:brightness-125 transition"
              >
                Comenzar selección de equipo
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="wizard"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <MainMenuWizard onPickTeam={(id) => { setSelectedClub(id); setModalOpen(true); }} onQuickStart={quickStart} loading={loading} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Noticias ticker */}
      <div className="news-ticker fixed bottom-0 left-0 right-0 z-30">
        <div className="news-ticker-content">
          {[
            "Manchester City ficha una joya brasileña",
            "Mbappé marca hat-trick histórico",
            "Arsenal entra en crisis tras derrota",
            "Real Madrid anuncia nuevo estadio",
            "Lewandowski rompe récord de goles",
            "Barcelona presenta proyecto renovación",
            "Liverpool confirma mega fichaje",
          ].map((news, i) => (
            <span key={i} className="news-item">{news}</span>
          ))}
        </div>
      </div>

      <ClubPreviewModal teamId={selectedClub} open={modalOpen} onOpenChange={setModalOpen} onStart={(id) => pickTeam(id)} />

      {/* Loader temático */}
      <AnimatePresence>
        {loading && (
          <StadiumRevealLoader teamName={loaderTeam?.name} teamColor={loaderTeam?.color} />
        )}
      </AnimatePresence>
    </div>
  );
}

export const Route = createFileRoute("/")({
  component: Index,
});
