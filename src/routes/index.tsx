import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import {
  LEAGUES_BY_COUNTRY,
  LEAGUES,
  LeagueId,
  getAllTeams,
  teamsByLeague,
  overall,
} from "@/data/teams";

import {
  loadSave,
  newSave,
  saveSave,
  clearSave,
} from "@/lib/store";

import { usePlayersStore } from "@/store/playersStore";

import { TeamLogo } from "@/components/TeamLogo";
import { CountryFlag } from "@/components/CountryFlag";
import { LeagueLogo } from "@/components/LeagueLogo";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import {
  Wallet,
  MapPin,
  Globe,
  Users,
  TrendingUp,
} from "lucide-react";
import ClubPreviewModal from "@/components/home/ClubPreviewModal";
import ClubCardPremium from "@/components/home/ClubCardPremium";
import HeroAAA from "@/components/home/HeroAAA";
import LeagueExplorerVisual from "@/components/home/LeagueExplorerVisual";

// ======================================================
// Helper
// ======================================================

function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

function Index() {
  const navigate = useNavigate();

  const [hasSave, setHasSave] = useState(false);
  const [selectedLeague, setSelectedLeague] = useState<LeagueId | null>(null);
  const [openCountry, setOpenCountry] = useState<string | null>(null);
  const [hoverTeam, setHoverTeam] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const teamsSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHasSave(!!loadSave());
  }, []);

  useEffect(() => {
    if (selectedLeague && teamsSectionRef.current) {
      teamsSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedLeague]);

  const teams = useMemo(() => {
    if (!selectedLeague) return [];

    return teamsByLeague(selectedLeague).slice().sort((a, b) => overall(b) - overall(a));
  }, [selectedLeague]);

  const setMyTeam = usePlayersStore((s) => s.setMyTeam);
  const initPlayers = usePlayersStore((s) => s.init);
  const getSimSquad = usePlayersStore((s) => s.getSimSquad);

  function pickTeam(id: string) {
    setLoading(true);

    try {
      initPlayers();

      const s = newSave(id);

      saveSave(s);

      setMyTeam(id);

      navigate({ to: "/season" });
    } catch (err) {
      console.error("Failed to start career:", err);

      setLoading(false);

      alert("Error al iniciar la carrera.");
    }
  }

  function resetGame() {
    clearSave();
    setHasSave(false);
  }

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedClub, setSelectedClub] = useState<string | null>(null);

  return (
    <div className="min-h-screen overflow-hidden">
      <div className="global-bg-aaa" />

      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="ambient-particle"
            style={{ left: `${Math.random() * 100}%`, animationDelay: `${Math.random() * 20}s`, animationDuration: `${15 + Math.random() * 10}s` }}
          />
        ))}
      </div>

      <HeroAAA hasSave={hasSave} resetGame={resetGame} loading={loading} />

      <section className="max-w-7xl mx-auto px-6 pb-20">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-black gradient-text-premium">Elige tu equipo</h2>

          <p className="text-sm text-muted-foreground">{getAllTeams().length} clubes disponibles</p>
        </div>

        <LeagueExplorerVisual openCountry={openCountry} setOpenCountry={setOpenCountry} setSelectedLeague={(l) => setSelectedLeague(l as any)} />

        <div ref={teamsSectionRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {teams.map((t) => {
            const topPlayer = t.stars && t.stars.length > 0 ? t.stars[0] : undefined;
            const topRating = Math.max(t.att || 0, t.mid || 0, t.def || 0);

            return (
              <ClubCardPremium
                key={t.id}
                team={{ ...t, topPlayer, topRating }}
                onPreview={(id: string) => {
                  setSelectedClub(id);
                  setModalOpen(true);
                }}
                onHover={() => setHoverTeam(t.id)}
                onLeave={() => setHoverTeam(null)}
                disabled={loading}
              />
            );
          })}
        </div>

        {loading && <p className="text-center text-sm text-muted-foreground mt-8 animate-pulse">Generando plantillas, calendario y simulación...</p>}
      </section>

      <div className="news-ticker fixed bottom-0 left-0 right-0 z-50">
        <div className="news-ticker-content">
          {["Manchester City ficha una joya brasileña","Mbappé marca hat-trick histórico","Arsenal entra en crisis tras derrota","Real Madrid anuncia nuevo estadio","Lewandowski rompe récord de goles","Barcelona presenta proyecto renovación","Liverpool confirma mega fichaje"].map((news, i) => (
            <span key={i} className="news-item">{news}</span>
          ))}
        </div>
      </div>

      <ClubPreviewModal teamId={selectedClub} open={modalOpen} onOpenChange={(v) => setModalOpen(v)} onStart={(id) => pickTeam(id)} />
    </div>
  );
}

// ======================================================
// Route
// ======================================================

export const Route = createFileRoute("/")({
  component: Index,
});


// ======================================================
// Stat Card
// ======================================================

function Stat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent" />

      <div className="relative z-10 text-center">
        <div className="text-[10px] uppercase tracking-[0.25em] text-white/40 mb-2">
          {label}
        </div>

        <div className="text-2xl font-black text-white">
          {value}
        </div>
      </div>
    </div>
  );
}

