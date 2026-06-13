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

// ======================================================
// Helper
// ======================================================

function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

// ======================================================
// Route
// ======================================================

export const Route = createFileRoute("/")({
  component: Index,
});

// ======================================================
// Main Component
// ======================================================

function Index() {
  const navigate = useNavigate();

  const [hasSave, setHasSave] = useState(false);
  const [selectedLeague, setSelectedLeague] =
    useState<LeagueId | null>(null);

  const [openCountry, setOpenCountry] =
    useState<string | null>(null);

  const [hoverTeam, setHoverTeam] =
    useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const teamsSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHasSave(!!loadSave());
  }, []);

  useEffect(() => {
    if (selectedLeague && teamsSectionRef.current) {
      teamsSectionRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [selectedLeague]);

  const teams = useMemo(() => {
    if (!selectedLeague) return [];

    return teamsByLeague(selectedLeague)
      .slice()
      .sort((a, b) => overall(b) - overall(a));
  }, [selectedLeague]);

  const setMyTeam = usePlayersStore((s) => s.setMyTeam);
  const initPlayers = usePlayersStore((s) => s.init);
  const getSimSquad = usePlayersStore((s) => s.getSimSquad);

  // ======================================================
  // Start Career
  // ======================================================

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

  // ======================================================
  // Reset Save
  // ======================================================

  function resetGame() {
    clearSave();
    setHasSave(false);
  }

  // ======================================================
  // Render
  // ======================================================

  return (
    <div className="min-h-screen overflow-hidden">
      {/* ====================================================== */}
      {/* Background */}
      {/* ====================================================== */}

      <div className="global-bg-aaa" />

      {/* Ambient particles */}

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

      {/* ====================================================== */}
      {/* HERO */}
      {/* ====================================================== */}

      <section className="hero-aaa relative flex items-center justify-center">
        <div
          className="hero-ambient-light bg-primary"
          style={{ top: "10%", left: "10%" }}
        />

        <div
          className="hero-ambient-light bg-accent"
          style={{ bottom: "20%", right: "15%" }}
        />

        <div className="relative z-10 text-center px-6 max-w-7xl mx-auto">
          <div className="animate-fade-in">
            {/* ====================================================== */}
            {/* Title */}
            {/* ====================================================== */}

            <div className="relative mb-10">
              <div className="absolute inset-0 blur-3xl opacity-30 bg-primary/20 rounded-full scale-150" />

              <div className="relative">
                <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-xl mb-8">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />

                  <span className="text-xs uppercase tracking-[0.25em] text-white/70 font-semibold">
                    Football Universe Simulation
                  </span>
                </div>

                <h1 className="hero-title-aaa mb-6">
                  DYNASTY
                  <br />
                  MANAGER
                </h1>

                <p className="hero-subtitle-aaa max-w-3xl mx-auto">
                  Construye una dinastía.
                  Controla cada decisión.
                  Domina el fútbol mundial.
                </p>
              </div>
            </div>

            {/* ====================================================== */}
            {/* Divider */}
            {/* ====================================================== */}

            <div className="flex items-center justify-center gap-6 mb-12">
              <div className="h-px w-32 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

              <span className="text-5xl animate-float">
                ⚽
              </span>

              <div className="h-px w-32 bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
            </div>

            {/* ====================================================== */}
            {/* Feature Cards */}
            {/* ====================================================== */}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto mt-14">
              {[
                {
                  title: "Mercado dinámico",
                  desc: "Negociaciones vivas",
                  icon: "💰",
                },
                {
                  title: "IA avanzada",
                  desc: "Clubes con identidad",
                  icon: "🧠",
                },
                {
                  title: "Universo procedural",
                  desc: "Historias únicas",
                  icon: "🌍",
                },
                {
                  title: "Simulación profunda",
                  desc: "Cada decisión importa",
                  icon: "⚽",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="feature-card-aaa"
                >
                  <div className="text-3xl mb-4">
                    {item.icon}
                  </div>

                  <div className="text-lg font-black mb-1">
                    {item.title}
                  </div>

                  <div className="text-sm text-white/60">
                    {item.desc}
                  </div>
                </div>
              ))}
            </div>

            {/* ====================================================== */}
            {/* Stats */}
            {/* ====================================================== */}

            <div className="flex items-center justify-center gap-4 flex-wrap mt-12 mb-12">
              <div className="hero-stat-badge">
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="h-4 w-4 text-primary" />

                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    Ligas
                  </span>
                </div>

                <div className="text-2xl font-black text-primary">
                  72
                </div>
              </div>

              <div className="hero-stat-badge">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="h-4 w-4 text-accent" />

                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    Jugadores
                  </span>
                </div>

                <div className="text-2xl font-black text-accent">
                  1500+
                </div>
              </div>

              <div className="hero-stat-badge">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-primary" />

                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    Simulación
                  </span>
                </div>

                <div className="text-2xl font-black text-primary">
                  Profunda
                </div>
              </div>

              <div className="hero-stat-badge">
                <div className="flex items-center gap-2 mb-1">
                  <Wallet className="h-4 w-4 text-accent" />

                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    Mercado
                  </span>
                </div>

                <div className="text-2xl font-black text-accent">
                  Dinámico
                </div>
              </div>
            </div>

            {/* ====================================================== */}
            {/* Continue Save */}
            {/* ====================================================== */}

            {hasSave && (
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <Link
                  to="/season"
                  className="continue-card-mega group"
                >
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-700 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10" />

                  <div className="relative z-10 flex items-center justify-between gap-8">
                    <div>
                      <div className="text-xs uppercase tracking-[0.25em] text-white/50 mb-3">
                        Continuar carrera
                      </div>

                      <div className="text-4xl font-black mb-2">
                        Tu carrera guardada
                      </div>

                      <div className="flex items-center gap-3 text-white/60 text-sm">
                        <span>Última sesión guardada</span>
                      </div>

                      <div className="flex gap-2 mt-5">
                        {["W", "W", "L", "D", "W"].map((r, i) => (
                          <div
                            key={i}
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black
                            ${
                              r === "W"
                                ? "bg-green-500/20 text-green-300"
                                : r === "L"
                                ? "bg-red-500/20 text-red-300"
                                : "bg-yellow-500/20 text-yellow-300"
                            }`}
                          >
                            {r}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm text-white/50 mb-2">
                        Próximo partido
                      </div>

                      <div className="text-2xl font-black">
                        Continuar →
                      </div>
                    </div>
                  </div>
                </Link>

                {/* ====================================================== */}
                {/* New Save */}
                {/* ====================================================== */}

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="px-8 py-5 rounded-2xl glass text-foreground font-semibold hover:bg-white/10 transition text-lg">
                      Nueva partida
                    </button>
                  </AlertDialogTrigger>

                  <AlertDialogContent className="glass-dark">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-2xl font-black gradient-text-premium">
                        ¿Borrar la partida guardada?
                      </AlertDialogTitle>

                      <AlertDialogDescription className="text-muted-foreground">
                        Esta acción eliminará permanentemente
                        tu progreso actual.
                      </AlertDialogDescription>
                    </AlertDialogHeader>

                    <AlertDialogFooter>
                      <AlertDialogCancel className="glass">
                        Cancelar
                      </AlertDialogCancel>

                      <AlertDialogAction
                        onClick={resetGame}
                        className="button-premium"
                      >
                        Borrar y empezar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ====================================================== */}
      {/* Teams */}
      {/* ====================================================== */}

      <section className="max-w-7xl mx-auto px-6 pb-20">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-black gradient-text-premium">
            Elige tu equipo
          </h2>

          <p className="text-sm text-muted-foreground">
            {getAllTeams().length} clubes disponibles
          </p>
        </div>

        {/* ====================================================== */}
        {/* Countries */}
        {/* ====================================================== */}

        <div className="mb-8 space-y-3">
          {Object.entries(LEAGUES_BY_COUNTRY).map(
            ([country, leagues]) => (
              <div
                key={country}
                className="country-module-aaa animate-slide-in"
              >
                <button
                  onClick={() =>
                    setOpenCountry(
                      openCountry === country
                        ? null
                        : country
                    )
                  }
                  className="w-full flex items-center justify-between country-header-aaa text-base font-semibold"
                >
                  <div className="flex items-center gap-3">
                    <CountryFlag country={country} />

                    <span className="text-lg">
                      {country}
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground">
                      {leagues.length} ligas
                    </span>

                    <span className="text-muted-foreground text-lg">
                      {openCountry === country
                        ? "▲"
                        : "▼"}
                    </span>
                  </div>
                </button>

                {openCountry === country && (
                  <div className="flex flex-wrap gap-3 px-6 py-4 bg-secondary/10 border-t border-border/20">
                    {leagues.map((lg) => (
                      <button
                        key={lg.id}
                        onClick={() =>
                          setSelectedLeague(
                            lg.id as LeagueId
                          )
                        }
                        className={`league-button-aaa flex items-center gap-2 text-sm font-semibold ${
                          selectedLeague === lg.id
                            ? "active"
                            : ""
                        }`}
                      >
                        <LeagueLogo
                          league={lg.name}
                          size="sm"
                        />

                        {lg.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          )}
        </div>

        {/* ====================================================== */}
        {/* Teams Grid */}
        {/* ====================================================== */}

        <div
          ref={teamsSectionRef}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
        >
          {teams.map((t) => {
            const ov = overall(t);

            const squad = getSimSquad(t.id);

            const bestPlayer =
              squad.length > 0
                ? squad.reduce((best, current) =>
                    current.rating > best.rating
                      ? current
                      : best
                  )
                : null;

            return (
              <button
                key={t.id}
                disabled={loading}
                onMouseEnter={() =>
                  setHoverTeam(t.id)
                }
                onMouseLeave={() =>
                  setHoverTeam(null)
                }
                onClick={() => pickTeam(t.id)}
                className="team-card-aaa text-left disabled:opacity-50 overflow-hidden group relative"
              >
                <div className="team-card-bg" />

                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-700 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />

                <div className="relative z-10">
                  {/* Header */}

                  <div className="flex items-start justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="team-logo-wrapper">
                        <TeamLogo
                          teamName={t.name}
                          leagueName={getLeagueName(
                            t.league
                          )}
                          size={72}
                        />
                      </div>

                      <div>
                        <div className="text-2xl font-black leading-none mb-2">
                          {t.name}
                        </div>

                        <div className="text-sm text-white/50 flex items-center gap-2">
                          <MapPin className="w-4 h-4" />

                          {t.city}
                        </div>
                      </div>
                    </div>

                    <div className="overall-badge">
                      {ov}
                    </div>
                  </div>

                  {/* Stats */}

                  <div className="grid grid-cols-3 gap-3 mb-6">
                    <Stat
                      label="ATA"
                      value={t.att}
                    />

                    <Stat
                      label="MED"
                      value={t.mid}
                    />

                    <Stat
                      label="DEF"
                      value={t.def}
                    />
                  </div>

                  {/* Details */}

                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/50">
                        Identidad
                      </span>

                      <span className="font-semibold text-primary">
                        Gigante Europeo
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/50">
                        Dificultad
                      </span>

                      <span className="font-semibold">
                        Media
                      </span>
                    </div>

                    {bestPlayer && (
                      <div className="pt-5 border-t border-white/10 flex items-center justify-between">
                        <div>
                          <div className="text-xs uppercase tracking-wider text-white/40 mb-1">
                            Jugador estrella
                          </div>

                          <div className="font-bold">
                            {bestPlayer.name}
                          </div>
                        </div>

                        <div className="text-2xl font-black text-primary">
                          {bestPlayer.rating}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ====================================================== */}
        {/* Loading */}
        {/* ====================================================== */}

        {loading && (
          <p className="text-center text-sm text-muted-foreground mt-8 animate-pulse">
            Generando plantillas,
            calendario y simulación...
          </p>
        )}
      </section>

      {/* ====================================================== */}
      {/* News Ticker */}
      {/* ====================================================== */}

      <div className="news-ticker fixed bottom-0 left-0 right-0 z-50">
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
            <span key={i} className="news-item">
              {news}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

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

