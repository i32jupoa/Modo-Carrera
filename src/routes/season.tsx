import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";

import { useState, useEffect } from "react";

import { toast } from "sonner";

import {
  ALL_LEAGUES,
  loadSave,
  SaveGame,
  advanceMatchdayLayered,
  getSortedStandings,
  getMatchdayFixtures,
  getMyNextFixtureAny,
  getMyRecentResults,
  getTeamRecentResults,
  simulateCupMatchday,
  simulateNationalCupsThroughDate,
  simulateUCLMatchday,
  simulateEuropeanLeagueMatchday,
  simulatePendingEuropeanThroughDay,
  processEuropeanKnockoutProgress,
  saveSaveWithRetry,
  setLineup,
  setFormation,
  setSubstitutes,
} from "@/lib/store";

import {
  LEAGUES,
  teamById,
  teamsByLeague,
  type LeagueId,
  type Team,
  LEAGUES_BY_COUNTRY,
} from "@/data/teams";
import { europeanCalendar } from "@/data/europeanCompetitions";

import { type Fixture } from "@/lib/season";
import { getSeasonCalendarAnchors, getSeasonStartYear } from "@/lib/season/calendarFactory";
import { advanceToNextSeason, canAdvanceToNextSeason } from "@/lib/season/seasonRollover";
import { getSeasonArchive, getSeasonArchiveAwards, type SeasonArchive } from "@/lib/season/seasonHistory";
import { getCurrentSaveId } from "@/lib/savedGames";
import { getSeasonRolloverDates, type RolloverProgress } from "@/lib/season/seasonRolloverCore";
import { getCupFixtureDateIso, getEuropeanFixtureDateIso } from "@/lib/fixtureDates";
import {
  getLeaguePositionZones,
  LEAGUE_ZONE_PRESENTATION,
  orderedLeagueZoneKinds,
  primaryLeagueZone,
} from "@/lib/season/leaguePositionZones";

import { usePlayersStore, ensureStatsForLeague, useCurrentDate } from "@/store/playersStore";

import { TeamLogo } from "@/components/TeamLogo";
import { LeagueLogo } from "@/components/LeagueLogo";
import { CountryFlag } from "@/components/CountryFlag";
import { MatchStatsModal } from "@/components/MatchStatsModal";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  Award,
  AlertTriangle,
  Bell,
  Newspaper,
  Briefcase,
  Building2,
  Cloud,
  Flag,
  X,
  Trophy,
  Crown,
  Medal,
  History as HistoryIcon,
} from "lucide-react";
import {
  themeForFixture,
  refereeFor,
  weatherFor,
  trackPosition,
  getPositionHistory,
  getTrend,
  type CentralTheme,
} from "@/lib/seasonExtras";
import { NewsCarousel } from "@/components/news/NewsCarousel";
import { buildLatestTeamOfRoundsData } from "@/lib/teamOfRound";
import { getCachedGameNews } from "@/lib/news/newsCache";
import { getAllPlayedFixtures } from "@/lib/teamForm";

// Helper to get league name from league ID

function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

function formatArchiveTransferFee(fee: number, type: string) {
  if (type === "free" || fee <= 0) return "Libre";
  if (fee >= 1_000_000) return `${(fee / 1_000_000).toFixed(1).replace(/\.0$/, "")} M€`;
  if (fee >= 1_000) return `${Math.round(fee / 1_000)} mil €`;
  return `${Math.round(fee)} €`;
}

function archiveTransferTypeLabel(type: string) {
  if (type === "loan") return "Cesión";
  if (type === "loan-option") return "Cesión con opción";
  if (type === "loan-obligation") return "Cesión con obligación";
  if (type === "free") return "Agente libre";
  return "Traspaso";
}

function archiveSeasonLabel(startYear: number) {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export const Route = createFileRoute("/season")({ component: SeasonPage });

function SeasonPage() {
  const navigate = useNavigate();

  const [save, setSave] = useState<SaveGame | null>(null);

  const [viewLeague, setViewLeague] = useState<LeagueId>("laliga");

  const [isSimulating, setIsSimulating] = useState(false);
  const [isRollingOver, setIsRollingOver] = useState(false);
  const [rolloverProgress, setRolloverProgress] = useState<RolloverProgress | null>(null);
  const [seasonSummary, setSeasonSummary] = useState<SeasonArchive | null>(null);
  const [showSeasonSummary, setShowSeasonSummary] = useState(false);

  const [simProgress, setSimProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    const s = loadSave();

    console.log("Season page loaded save:", s?.myTeamId);

    if (!s) {
      navigate({ to: "/" });
      return;
    }

    setSave(s);

    setViewLeague(s.myLeague);
  }, [navigate]);

  // Red de seguridad: si el navegador restaura esta pantalla desde la caché
  // de retroceso (bfcache) al volver de "/match" sin volver a ejecutar el
  // JavaScript de montaje, o si la pestaña recupera el foco, releemos el
  // guardado por si el resultado del último partido se persistió con algo
  // de retraso. Así la central nunca se queda mostrando el partido que
  // acabamos de jugar como si siguiera pendiente.
  useEffect(() => {
    const onAutomaticRollover = (event: Event) => {
      const detail = (event as CustomEvent<{ reason?: string; fromSeason?: string }>).detail;
      const latest = loadSave();
      if (latest) setSave(latest);
      if (detail?.reason !== "season-rollover" || !detail.fromSeason) return;
      const saveId = getCurrentSaveId();
      if (!saveId) return;
      const archive = getSeasonArchive(saveId, detail.fromSeason);
      if (archive) {
        setSeasonSummary(archive);
        setShowSeasonSummary(true);
      }
    };
    window.addEventListener("fcsim:save-updated", onAutomaticRollover);
    return () => window.removeEventListener("fcsim:save-updated", onAutomaticRollover);
  }, []);

  useEffect(() => {
    function refresh() {
      if (document.visibilityState !== "visible") return;
      const s = loadSave();
      if (s) setSave(s);
    }
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("fcsim:save-updated", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("fcsim:save-updated", refresh);
    };
  }, []);

  // Generate stats on-demand when league changes

  useEffect(() => {
    if (viewLeague) {
      ensureStatsForLeague(viewLeague);
    }
  }, [viewLeague]);

  const currentDate = useCurrentDate();

  const fixtures = usePlayersStore((s) => s.fixtures);

  const [selectedFixture, setSelectedFixture] = useState<Fixture | null>(null);

  async function handleAdvanceSeason() {
    if (!save || isRollingOver) return;
    const completedSeason = save.season;
    const careerId = getCurrentSaveId();
    setIsRollingOver(true);
    setRolloverProgress({ stage: "checkpoint", progress: 0, message: "Preparando la transición…" });
    try {
      const nextSave = await advanceToNextSeason(save, {
        onProgress: (progress) => setRolloverProgress(progress),
      });
      setSave(nextSave);
      setViewLeague(nextSave.myLeague);
      const archive = careerId ? getSeasonArchive(careerId, completedSeason) : null;
      setSeasonSummary(archive);
      setShowSeasonSummary(Boolean(archive));
      toast.success(`Temporada ${nextSave.season} preparada`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cerrar la temporada.");
    } finally {
      setIsRollingOver(false);
    }
  }

  if (!save) return null;

  const rolloverReadiness = canAdvanceToNextSeason(save);
  const myTeam = teamById(save.myTeamId);

  const nextFixture = getMyNextFixtureAny(save);

  const recent = getMyRecentResults(save, 5);

  const standings = getSortedStandings(save, viewLeague);

  const myLeagueTotalMatchdays = (teamsByLeague(save.myLeague).length - 1) * 2;

  const seasonComplete = save.currentMatchday[save.myLeague] > myLeagueTotalMatchdays;

  const myPos = standings.findIndex((s) => s.teamId === save.myTeamId) + 1;

  const myLineup = save?.lineups[save.myTeamId] || [];
  const activeStartersCount = myLineup.filter((id: string) => id && id.trim() !== "").length;
  const isLineupComplete = activeStartersCount === 11;

  // Theme (changes UI based on the next match: liga / champions / copa)
  const theme: CentralTheme = themeForFixture(nextFixture);

  // Trend: track current position in history and compare to previous matchday
  const currentMd = save.currentMatchday[save.myLeague];
  const posHistory =
    myPos > 0
      ? trackPosition(save.myLeague, save.myTeamId, currentMd, myPos)
      : getPositionHistory(save.myLeague, save.myTeamId);
  const trend = getTrend(posHistory);

  // Injured count for notifications
  let injuredCount = 0;
  try {
    const ps = usePlayersStore.getState();
    const md = save.currentMatchday[save.myLeague];
    for (const id of myLineup) {
      if (!id) continue;
      const st = (ps as any).stats?.[id];
      if (st && st.injuredUntil && st.injuredUntil > md) injuredCount++;
    }
  } catch {
    /* intentionally ignored */
  }

  // Alertas persistentes de la última incidencia sufrida por el equipo del usuario.
  const latestMyFixture = getAllPlayedFixtures(save)
    .filter((fixture) => fixture.homeId === save.myTeamId || fixture.awayId === save.myTeamId)
    .sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")) || a.matchday - b.matchday)
    .at(-1);
  const latestMySide = latestMyFixture?.homeId === save.myTeamId ? "home" : "away";
  const latestInjuries = latestMyFixture?.result?.injuries?.filter((injury) => injury.team === latestMySide) ?? [];
  const latestDismissals = latestMyFixture?.result?.cards?.filter((card) => card.team === latestMySide && (card.cardType === "red" || card.isSecondYellow)) ?? [];
  const unreadMatchAlerts = latestMyFixture && latestMyFixture.id !== save.matchAlertsReadFixtureId && (latestInjuries.length > 0 || latestDismissals.length > 0);

  function markMatchAlertsRead() {
    if (!save || !latestMyFixture) return;
    const nextSave = { ...save, matchAlertsReadFixtureId: latestMyFixture.id };
    saveSaveWithRetry(nextSave);
    setSave(nextSave);
  }

  // Noticias reales derivadas de lo ocurrido en la partida (con caché por estado)
  const generatedNews = getCachedGameNews(save);
  const teamsOfRounds = buildLatestTeamOfRoundsData(save);
  const teamOfRoundNews = teamsOfRounds.map((teamOfRound) => ({
    id: teamOfRound.id,
    cat: teamOfRound.category === "ucl" || teamOfRound.category === "uel" || teamOfRound.category === "uecl" ? "europa" as const : "liga" as const,
    icon: "🏅",
    title: "Equipo de la jornada",
    lead: `El XI ideal de ${teamOfRound.competitionLabel}, ${teamOfRound.roundLabel.toLowerCase()}, seleccionado según las notas de los partidos disputados.`,
    body: [
      `Este equipo reúne a los futbolistas mejor valorados de ${teamOfRound.competitionLabel} en ${teamOfRound.roundLabel.toLowerCase()}.`,
      teamOfRound.playerOfRound ? `Jugador de la jornada: ${teamOfRound.playerOfRound.player.Name ?? "Jugador destacado"} (${teamOfRound.playerOfRound.rating}).` : "",
      "Pulsa en la noticia para ver la alineación en el campo y la nota de cada jugador.",
    ].filter(Boolean),
    facts: [
      { label: "Competición", value: teamOfRound.competitionLabel },
      { label: "Jornada", value: teamOfRound.roundLabel },
      { label: "Fecha", value: teamOfRound.dateLabel },
      ...(teamOfRound.playerOfRound ? [{ label: "Jugador de la jornada", value: `${teamOfRound.playerOfRound.player.Name ?? "Jugador destacado"} · ${teamOfRound.playerOfRound.rating}` }] : []),
    ],
    visual: { teamIds: teamOfRound.teamIds, players: [], countries: [], leagueId: undefined },
    score: 100,
    when: `${teamOfRound.competitionLabel} · ${teamOfRound.roundLabel} · ${teamOfRound.dateLabel}`,
    mine: teamOfRound.teamIds.includes(save.myTeamId),
    theme: teamOfRound.category,
    teamOfRound,
  }));
  const news = [...teamOfRoundNews, ...generatedNews.filter((item) => !item.id.startsWith("team-of-round:"))];

  // La clasificación lateral sigue la competición del próximo encuentro, no
  // la liga doméstica por defecto. Se admiten los tres torneos europeos.
  const nextCompetitionCode = String(
    nextFixture?.europeanCompetition
      ?? (nextFixture as unknown as { competition?: string } | undefined)?.competition
      ?? "",
  );
  const nextEuropeanCompetition = (["ucl", "uel", "uecl"].includes(nextCompetitionCode)
    ? nextCompetitionCode
    : undefined) as "ucl" | "uel" | "uecl" | undefined;
  const europeanTableState = nextEuropeanCompetition === "ucl"
    ? save.ucl
    : nextEuropeanCompetition === "uel"
      ? save.uel
      : nextEuropeanCompetition === "uecl"
        ? save.uecl
        : undefined;
  const activeEuropeanTable = europeanTableState?.leaguePhaseTable ?? europeanTableState?.table ?? [];
  const activeEuropeanTitle = nextEuropeanCompetition === "ucl"
    ? "Champions · Fase de Liga"
    : nextEuropeanCompetition === "uel"
      ? "Europa League · Fase de Liga"
      : nextEuropeanCompetition === "uecl"
        ? "Conference League · Fase de Liga"
        : "Clasificación";

  function handlePlayMatch(fixture: Fixture) {
    if (!save || !isLineupComplete) {
      alert(
        "La alineación no está completa. Debes tener 11 jugadores titulares para jugar el partido.",
      );
      return;
    }
    if (!save.myTeamId) return;

    // Starting a new match is the same checkpoint as pressing "Guardar" in
    // Dirección de equipo: persist the exact XI, formation and the exact 0-12
    // convocados BEFORE opening the match engine. This avoids any dependency on
    // transient React/tactical-plan state and guarantees that "Saltar al final"
    // receives the same squad the manager had selected.
    const current = loadSave() ?? save;
    const currentXI = (current.lineups?.[current.myTeamId] ?? []).filter(Boolean).slice(0, 11);
    const squad = usePlayersStore.getState().getSimSquad(current.myTeamId);
    const currentBench = Array.from(
      new Set((current.substitutes?.[current.myTeamId] ?? []).filter(Boolean)),
    )
      .filter((id) => !currentXI.includes(id))
      .filter((id) => squad.some((p) => p.id === id))
      .slice(0, 12);
    const fallbackBench =
      currentBench.length > 0
        ? currentBench
        : squad
            .filter((p) => !currentXI.includes(p.id))
            .sort((a, b) => b.rating - a.rating)
            .slice(0, 12)
            .map((p) => p.id);

    let checkpoint = setLineup(current, current.myTeamId, currentXI);
    checkpoint = setFormation(
      checkpoint,
      current.myTeamId,
      current.formations?.[current.myTeamId] ?? "Táctica 4-3-3",
    );
    checkpoint = setSubstitutes(checkpoint, current.myTeamId, fallbackBench);
    saveSaveWithRetry(checkpoint);
    setSave(checkpoint);

    // Determine match type from the fixture
    const matchType =
      fixture.competition === "league" ? "LEAGUE" : fixture.competition === "cup" ? "CUP" : "UCL";
    const cupRound = fixture.competition === "cup" ? fixture.round : undefined;

    navigate({
      to: "/match",
      state: {
        matchType,
        cupRound,
        fixtureId: fixture.id,
        matchLineup: currentXI,
        matchFormation: current.formations?.[current.myTeamId] ?? "Táctica 4-3-3",
        matchSubstitutes: fallbackBench,
      } as any,
    });
  }

  async function simulateRest() {
    if (!save || isSimulating) return;

    setIsSimulating(true);

    setSimProgress({ done: 0, total: 0 });

    try {
      console.time("simulateRest");

      let next: SaveGame;

      // Find the last played match to determine competition type
      let lastPlayedFixture: Fixture | null = null;
      let competitionType: "league" | "cup" | "ucl" | "uel" | "uecl" | null = null;

      // Check league fixtures
      const leagueFixtures = save.fixtures[save.myLeague].filter(
        (f) => f.result && (f.homeId === save.myTeamId || f.awayId === save.myTeamId),
      );
      if (leagueFixtures.length > 0) {
        lastPlayedFixture = leagueFixtures[leagueFixtures.length - 1];
        competitionType = "league";
      }

      // Check cup fixtures
      for (const lg of Object.keys(save.cupFixtures)) {
        const cupFixtures = save.cupFixtures[lg as LeagueId].filter(
          (f) => f.result && (f.homeId === save.myTeamId || f.awayId === save.myTeamId),
        );
        if (cupFixtures.length > 0) {
          const lastCupFixture = cupFixtures[cupFixtures.length - 1];
          if (!lastPlayedFixture || lastCupFixture.matchday > lastPlayedFixture.matchday) {
            lastPlayedFixture = lastCupFixture;
            competitionType = "cup";
          }
        }
      }

      // Check European fixtures (Champions, Europa, Conference)
      for (const [comp, list] of [
        ["ucl", save.uclFixtures],
        ["uel", save.uelFixtures],
        ["uecl", save.ueclFixtures],
      ] as const) {
        const europeanFixtures = (list ?? []).filter(
          (f) => f.result && (f.homeId === save.myTeamId || f.awayId === save.myTeamId),
        );
        if (europeanFixtures.length > 0) {
          const lastEuropeanFixture = europeanFixtures[europeanFixtures.length - 1];
          if (!lastPlayedFixture || lastEuropeanFixture.matchday > lastPlayedFixture.matchday) {
            lastPlayedFixture = lastEuropeanFixture;
            competitionType = comp as any;
          }
        }
      }

      if (!competitionType) {
        competitionType = "league"; // Default to league
      }

      // Simulate based on competition type
      if (competitionType === "cup") {
        // Simulate cup fixtures for the matchday ONLY
        next = simulateCupMatchday(
          save,
          save.myLeague,
          lastPlayedFixture?.matchday || save.currentMatchday[save.myLeague],
        );
      } else if (competitionType === "ucl") {
        next = simulateUCLMatchday(save, lastPlayedFixture?.matchday || save.currentMatchday[save.myLeague]);
      } else if (competitionType === "uel" || competitionType === "uecl") {
        const absoluteEuropeanDay = Number(
          lastPlayedFixture?.matchday ?? save.currentMatchday[save.myLeague],
        );
        next = simulatePendingEuropeanThroughDay(
          save,
          competitionType,
          absoluteEuropeanDay,
          save.myTeamId,
        );
        next = processEuropeanKnockoutProgress(next, competitionType, absoluteEuropeanDay);
      } else {
        // Simulate league fixtures
        next = await advanceMatchdayLayered(save, (done, total) => {
          setSimProgress({ done, total });
          console.log(`Matches: ${done}/${total}`);
        });
      }

      // Europa League and Conference League must progress independently of the
      // competition in which the user's club plays. Previously `simulateRest`
      // only advanced the last competition detected above, so an AI-only UECL
      // could stop before the R16 draw while the user's UEL continued normally.
      if (competitionType === "uel" || competitionType === "uecl") {
        const europeanDay = Number(lastPlayedFixture?.matchday ?? 0);
        if (europeanDay > 0) {
          for (const comp of ["uel", "uecl"] as const) {
            next = simulatePendingEuropeanThroughDay(next, comp, europeanDay, next.myTeamId);
            next = processEuropeanKnockoutProgress(next, comp, europeanDay);
          }
        }
      }

      console.timeEnd("simulateRest");

      // El mercado (lo que más pesaba, con diferencia) ya no vive en
      // localStorage, así que esto ya casi nunca debería fallar por cuota.
      // Si aun así falla (disco realmente lleno, modo privado muy
      // restrictivo...), avisamos sin bloquear: el resultado ya está
      // aplicado en memoria y el jugador puede seguir jugando.
      if (!saveSaveWithRetry(next)) {
        toast.error(
          "No se pudo guardar en el dispositivo (almacenamiento lleno). La jornada se ha jugado igualmente, pero conviene liberar espacio pronto.",
        );
      }

      setSave(next);
    } catch (err) {
      console.error("Error al simular jornada:", err);

      alert("Error al simular: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSimulating(false);

      setSimProgress({ done: 0, total: 0 });
    }
  }

  async function simulateUntilEnd() {
    if (!save || isSimulating) return;

    setIsSimulating(true);

    try {
      console.time("simulateUntilEnd");

      let cur = save;

      let safety = 0;

      while (cur.currentMatchday[cur.myLeague] <= myLeagueTotalMatchdays && safety < 100) {
        cur = await advanceMatchdayLayered(cur);

        // "Saltar al final" is an explicit full-season simulation, so national
        // cup matches involving the user's own club must also be resolved.
        const leagueDates = (cur.fixtures?.[cur.myLeague] ?? [])
          .filter((f) => f.result)
          .map((f) => f.date)
          .filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d))
          .sort();
        const cupCutoff = leagueDates.at(-1);
        if (cupCutoff) {
          cur = simulateNationalCupsThroughDate(cur, cupCutoff, true);
        }

        safety++;

        // Yield control every 5 matchdays

        if (safety % 5 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      if (!saveSaveWithRetry(cur)) {
        toast.error(
          "No se pudo guardar en el dispositivo (almacenamiento lleno). La temporada se ha simulado igualmente, pero conviene liberar espacio pronto.",
        );
      }

      setSave(cur);

      console.timeEnd("simulateUntilEnd");
    } catch (err) {
      console.error("Error al simular temporada:", err);

      alert("Error al simular: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSimulating(false);
    }
  }

  return (
    <>
      <div className={`p-4 md:p-6 max-w-6xl mx-auto relative ${theme.bgOverlay}`}>
        {unreadMatchAlerts && latestMyFixture && (
          <section className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3" role="status" aria-live="polite">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-wider text-amber-300">Incidencias del último partido</p>
                <p className="mt-1 text-[0.72rem] text-foreground/90">{myTeam.name} · {latestMyFixture.date ?? `Jornada ${latestMyFixture.matchday}`}</p>
                <div className="mt-2 space-y-1.5">
                  {latestInjuries.map((injury, i) => <p key={`injury-${injury.playerId}-${i}`} className="text-xs">🩹 <strong>{injury.playerName}</strong>: {injury.injuryType ?? "lesión"}{injury.bodyPart ? ` (${injury.bodyPart})` : ""}; baja estimada de {injury.weeks} semana(s){injury.durationDays ? ` · ${injury.durationDays} días` : ""}.</p>)}
                  {latestDismissals.map((card, i) => {
                    const suspension = save.suspensions?.[save.myTeamId]?.find((item: any) => String(item.playerId) === String(card.playerId));
                    return <p key={`red-${card.playerId}-${i}`} className="text-xs">🟥 <strong>{card.playerName}</strong>: expulsión en el {card.minute}′{card.isSecondYellow ? " por doble amarilla" : " por roja directa"}{suspension?.matchdaysRemaining ? ` · sanción pendiente: ${suspension.matchdaysRemaining} partido(s)` : ""}.</p>;
                  })}
                </div>
              </div>
              <button type="button" onClick={markMatchAlertsRead} className="rounded-lg border border-amber-400/30 px-3 py-2 text-[0.65rem] font-black text-amber-200 hover:bg-amber-400/10">Marcar como leídas</button>
            </div>
          </section>
        )}
        {/* Theme banner */}
        {theme.id !== "default" && (
          <div
            className={`mb-4 flex items-center justify-between gap-3 px-4 py-2 rounded-lg border ${theme.cardBorder} ${theme.badge}`}
          >
            <div className="flex items-center gap-2 text-sm font-bold tracking-wide">
              {theme.id === "ucl" ? "⭐" : "🏆"} Modo {theme.label} activo
            </div>
            <span className="text-[0.65rem] uppercase tracking-widest opacity-80">
              Próximo partido
            </span>
          </div>
        )}

        {/* Resumen de temporada compacto: una única fila en escritorio. */}
        <div className={`mb-4 panel rounded-2xl border ${theme.cardBorder} px-3 py-2.5`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-[0.6rem] font-black uppercase tracking-[0.16em] text-primary">Central</p>
            <span className={`rounded-full border px-2 py-1 text-[0.6rem] font-black ${seasonComplete ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-border/60 bg-secondary/40 text-muted-foreground"}`}>
              {seasonComplete ? "Finalizada" : `J${Math.min(currentMd, myLeagueTotalMatchdays)}/${myLeagueTotalMatchdays}`}
            </span>
            <div className="flex min-w-0 items-center gap-2">
              <TeamLogo teamName={myTeam.name} leagueName={getLeagueName(myTeam.league)} size={30} />
              <div className="min-w-0">
                <h1 className="truncate text-sm font-black leading-tight">{myTeam.name}</h1>
                <p className="truncate text-[0.6rem] text-muted-foreground">{LEAGUES[save.myLeague].name}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              <span className="chip text-[0.58rem]">PJ {standings.find((s) => s.teamId === save.myTeamId)?.played ?? 0}</span>
              <span className="chip text-[0.58rem]">V {standings.find((s) => s.teamId === save.myTeamId)?.won ?? 0}</span>
              <span className="chip text-[0.58rem]">E {standings.find((s) => s.teamId === save.myTeamId)?.drawn ?? 0}</span>
              <span className="chip text-[0.58rem]">D {standings.find((s) => s.teamId === save.myTeamId)?.lost ?? 0}</span>
              <span className="chip text-[0.58rem]">DG {(standings.find((s) => s.teamId === save.myTeamId)?.gd ?? 0) > 0 ? "+" : ""}{standings.find((s) => s.teamId === save.myTeamId)?.gd ?? 0}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <MiniTrendChart history={posHistory} />
              <div className="text-right">
                <div className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">Posición</div>
                <div className={`text-xl font-black scoreline ${theme.accent}`}>{myPos || "-"}º</div>
                {trend.delta !== 0 && <div className={`flex items-center justify-end gap-0.5 text-[0.6rem] font-bold ${trend.delta > 0 ? "text-emerald-400" : "text-destructive"}`}>{trend.delta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}{Math.abs(trend.delta)}</div>}
              </div>
            </div>
          </div>
        </div>

        {/* Notificaciones */}
        <NotificationsBar
          isLineupComplete={isLineupComplete}
          injuredCount={injuredCount}
          nextFixture={nextFixture}
          theme={theme}
        />

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {nextFixture ? (
              <NextMatchCard
                fixture={nextFixture}
                myId={save.myTeamId}
                onPlayMatch={handlePlayMatch}
                theme={theme}
              />
            ) : seasonComplete ? (
              <div className="panel-glow p-8 text-center">
                <span className="chip mb-3">Temporada finalizada</span>

                <h2 className="text-3xl font-black mb-2">¡Liga completada!</h2>

                <p className="text-muted-foreground">
                  Posición final: <span className="text-primary font-bold">{myPos}º</span>
                </p>
              </div>
            ) : null}

            {!rolloverReadiness.ok && (save.currentDate ?? "") >= getSeasonRolloverDates(save.season).endDate && (
              <section className="panel border border-amber-500/40 bg-amber-500/5 p-5" role="alert" aria-live="polite">
                <p className="text-[0.62rem] font-black uppercase tracking-[0.16em] text-amber-500">Temporada bloqueada</p>
                <h3 className="mt-1 text-lg font-black">No se puede iniciar la siguiente temporada todavía</h3>
                <p className="mt-2 text-sm text-muted-foreground">{rolloverReadiness.reason}</p>
                <Link to="/calendar" className="mt-3 inline-flex rounded-xl border border-amber-500/40 px-4 py-2 text-sm font-bold hover:bg-amber-500/10">Ir al calendario para resolver pendientes</Link>
              </section>
            )}

            {rolloverReadiness.ok && !(save.seasonRolloverLedger ?? []).includes(save.season) && (
              <section className="panel border border-primary/30 bg-primary/5 p-5" aria-live="polite">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[0.62rem] font-black uppercase tracking-[0.16em] text-primary">Cierre de temporada</p>
                    <h3 className="mt-1 text-lg font-black">Preparar {save.season.split(/[/-]/)[0] ? `${Number(save.season.split(/[/-]/)[0]) + 1}/${String((Number(save.season.split(/[/-]/)[0]) + 2) % 100).padStart(2, "0")}` : "la próxima temporada"}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Se archivarán los resultados y se actualizarán contratos, cesiones, plantillas y competiciones.</p>
                  </div>
                  <button type="button" onClick={() => void handleAdvanceSeason()} disabled={isRollingOver} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground disabled:cursor-wait disabled:opacity-60">
                    {isRollingOver ? "Procesando…" : "Cerrar temporada y ver resumen"}
                  </button>
                </div>
                {isRollingOver && rolloverProgress && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between gap-3 text-xs"><span className="text-foreground/90">{rolloverProgress.message}</span><span className="scoreline font-bold">{rolloverProgress.progress}%</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${rolloverProgress.progress}%` }} /></div>
                  </div>
                )}
              </section>
            )}

            {!seasonComplete && null}

            <div className="panel p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold">Últimos resultados</h3>
              </div>

              {recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no has jugado ningún partido.</p>
              ) : (
                <div className="space-y-2">
                  {recent.map((f) => (
                    <ResultRow
                      key={f.id}
                      fixture={f}
                      myId={save.myTeamId}
                      onClick={setSelectedFixture}
                    />
                  ))}
                </div>
              )}
            </div>

            <NewsCarousel news={news} theme={theme} myId={save.myTeamId} />


            <OtherLeaguesPanel save={save} />
          </div>

          <div className="space-y-6">
            <div className={`panel p-5 border ${theme.cardBorder}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold">
                  {activeEuropeanTitle}
                </h3>

                {!nextEuropeanCompetition && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="bg-secondary border border-border rounded px-2 py-1 text-xs flex items-center gap-2 hover:border-primary/60 transition">
                        <LeagueLogo
                          league={LEAGUES[viewLeague].name}
                          size="sm"
                          fallback={<span className="text-xs">{LEAGUES[viewLeague].flag}</span>}
                        />
                        {LEAGUES[viewLeague].name}
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {ALL_LEAGUES.map((lg) => (
                        <DropdownMenuItem
                          key={lg}
                          onClick={() => setViewLeague(lg)}
                          className="flex items-center gap-2"
                        >
                          <LeagueLogo
                            league={LEAGUES[lg].name}
                            size="sm"
                            fallback={<span className="text-xs">{LEAGUES[lg].flag}</span>}
                          />
                          {LEAGUES[lg].name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {nextEuropeanCompetition && activeEuropeanTable.length > 0 ? (
                <UCLMiniTable table={activeEuropeanTable} myTeamId={save.myTeamId} />
              ) : (
                <StandingsTable standings={standings} myTeamId={save.myTeamId} save={save} leagueId={viewLeague} />
              )}
            </div>
          </div>
        </div>
      </div>

      <MatchStatsModal fixture={selectedFixture} onClose={() => setSelectedFixture(null)} />
      {showSeasonSummary && seasonSummary && (
        <SeasonSummaryModal
          archive={seasonSummary}
          nextSeason={save?.season ?? ""}
          onContinue={() => setShowSeasonSummary(false)}
          onClose={() => setShowSeasonSummary(false)}
        />
      )}
    </>
  );
}

function SeasonSummaryModal({
  archive,
  nextSeason,
  onContinue,
  onClose,
}: {
  archive: SeasonArchive;
  nextSeason: string;
  onContinue: () => void;
  onClose: () => void;
}) {
  const myLeague = archive.leagues.find((league) => league.leagueId === archive.myLeague);
  const myPosition = archive.myFinalPosition ?? myLeague?.table.find((row) => row.teamId === archive.myTeamId)?.position ?? null;
  const archiveAwards = getSeasonArchiveAwards(archive);
  const trophies = [
    ...(archive.europeanChampions.ucl ? [{ key: "ucl", title: "Champions League", teamId: archive.europeanChampions.ucl, Icon: Crown }] : []),
    ...(archive.europeanChampions.uel ? [{ key: "uel", title: "Europa League", teamId: archive.europeanChampions.uel, Icon: Medal }] : []),
    ...(archive.europeanChampions.uecl ? [{ key: "uecl", title: "Conference League", teamId: archive.europeanChampions.uecl, Icon: Trophy }] : []),
    ...archive.domesticCupChampions.map((cup) => ({ key: `cup-${cup.leagueId}`, title: `Copa · ${LEAGUES[cup.leagueId as LeagueId]?.name ?? cup.leagueId}`, teamId: cup.teamId, Icon: Trophy })),
  ];
  const teamLabel = (id: string | null) => {
    if (!id) return "Sin determinar";
    const team = teamById(id);
    return team.id === id ? team.name : id;
  };
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="season-summary-heading">
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-border/70 bg-background shadow-2xl">
        <header className="relative overflow-hidden border-b border-border/60 bg-gradient-to-br from-card via-card to-primary/10 p-5 md:p-7">
          <div className="pointer-events-none absolute -right-8 -top-12 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
          <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-lg border border-border/60 bg-background/70 p-2 text-muted-foreground transition hover:text-foreground" aria-label="Cerrar resumen"><X className="h-4 w-4" /></button>
          <div className="relative flex flex-wrap items-start justify-between gap-4 pr-8">
            <div><p className="flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.2em] text-primary"><Trophy className="h-4 w-4" /> Campaña archivada</p><h2 id="season-summary-heading" className="mt-2 text-3xl font-black tracking-tight">Resumen de {archive.season}</h2><p className="mt-2 text-sm text-muted-foreground">Resultados, campeones, premios y movimientos guardados en la historia de tu carrera.</p></div>
            <div className="rounded-2xl border border-primary/20 bg-background/70 px-4 py-3"><div className="text-[0.6rem] font-black uppercase tracking-wider text-muted-foreground">Tu resultado</div><div className="mt-1 text-xl font-black">{myPosition ? `${myPosition}.º puesto` : "Sin clasificación"}</div><div className="mt-1 text-xs text-muted-foreground">{archive.myLeague ? (LEAGUES[archive.myLeague as LeagueId]?.name ?? archive.myLeague) : "Liga"}</div></div>
          </div>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 md:p-6">
          <section>
            <div className="mb-3 flex items-end justify-between gap-3"><div><h3 className="text-lg font-black">Campeones de liga</h3><p className="text-xs text-muted-foreground">Todos los campeones domésticos archivados.</p></div><span className="text-xs text-muted-foreground">{archive.leagues.filter((league) => league.championId).length} ligas</span></div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{archive.leagues.filter((league) => league.championId).map((league) => {
              const team = teamById(league.championId!);
              const known = team.id === league.championId;
              const leagueName = LEAGUES[league.leagueId as LeagueId]?.name ?? league.leagueId;
              return <div key={league.leagueId} className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/60 p-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Trophy className="h-4 w-4" /></div>{known && <TeamLogo teamName={team.name} leagueName={getLeagueName(team.league)} size={28} />}<div className="min-w-0"><div className="truncate text-[0.62rem] font-black uppercase tracking-wider text-muted-foreground">{leagueName}</div><div className="truncate text-sm font-black">{known ? team.name : league.championId}</div></div></div>;
            })}</div>
          </section>
          <section>
            <div className="mb-3"><h3 className="text-lg font-black">Copas y Europa</h3><p className="text-xs text-muted-foreground">Campeones de competiciones eliminatorias y continentales.</p></div>
            {trophies.length ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{trophies.map(({ key, title, teamId, Icon }) => {
              const team = teamById(teamId); const known = team.id === teamId;
              return <div key={key} className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/60 p-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>{known && <TeamLogo teamName={team.name} leagueName={getLeagueName(team.league)} size={28} />}<div className="min-w-0"><div className="truncate text-[0.62rem] font-black uppercase tracking-wider text-muted-foreground">{title}</div><div className="truncate text-sm font-black">{teamLabel(teamId)}</div></div></div>;
            })}</div> : <p className="rounded-xl bg-secondary/20 p-4 text-sm text-muted-foreground">No se registraron campeones de copa o Europa en esta temporada.</p>}
          </section>
          <section className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-border/50 p-4"><h3 className="font-black">Premios individuales</h3><div className="mt-3 space-y-2">{archiveAwards.length ? archiveAwards.map((winner) => <div key={`${winner.category}-${winner.playerId ?? winner.playerName}`} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/25 px-3 py-2"><div className="min-w-0"><div className="truncate text-sm font-bold">{winner.playerName}</div><div className="text-[0.65rem] text-muted-foreground">{winner.category}</div></div><Award className="h-4 w-4 shrink-0 text-primary" /></div>) : <p className="text-xs text-muted-foreground">No hay premios individuales archivados.</p>}</div></div>
            <div className="rounded-2xl border border-border/50 p-4"><h3 className="font-black">Máximos goleadores</h3><div className="mt-3 space-y-2">{archive.topScorers.slice(0, 5).length ? archive.topScorers.slice(0, 5).map((player, index) => <div key={player.playerId} className="flex items-center gap-3 rounded-lg bg-secondary/25 px-3 py-2"><span className="w-5 text-center text-xs font-black text-muted-foreground">{index + 1}</span><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{player.playerName}</div><div className="text-[0.65rem] text-muted-foreground">{player.clubId ? teamLabel(player.clubId) : "Sin club registrado"}</div></div><span className="text-lg font-black tabular-nums">{player.goals}</span></div>) : <p className="text-xs text-muted-foreground">No hay goleadores registrados.</p>}</div></div>
          </section>
          <section className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-border/50 p-4"><h3 className="flex items-center gap-2 font-black"><ArrowUpRight className="h-4 w-4 text-primary" />Fichajes destacados</h3><div className="mt-3 space-y-2">{(archive.featuredTransfers ?? []).length ? (archive.featuredTransfers ?? []).slice(0, 6).map((transfer) => <div key={transfer.id} className="rounded-lg bg-secondary/25 px-3 py-2"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-bold">{transfer.playerName}</div><div className="text-[0.62rem] text-muted-foreground">{transfer.date} · {archiveTransferTypeLabel(transfer.type)}</div></div><span className="shrink-0 text-xs font-black text-primary">{formatArchiveTransferFee(transfer.fee, transfer.type)}</span></div><div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-xs"><span className="truncate">{transfer.fromClubId ? teamLabel(transfer.fromClubId) : "Agente libre"}</span><ArrowUpRight className="h-3 w-3 text-muted-foreground" /><span className="truncate text-right">{teamLabel(transfer.toClubId)}</span></div></div>) : <p className="text-xs text-muted-foreground">No hay fichajes archivados para esta campaña.</p>}</div></div>
            <div className="rounded-2xl border border-border/50 p-4"><h3 className="flex items-center gap-2 font-black"><Trophy className="h-4 w-4 text-primary" />Clasificación europea siguiente</h3><p className="mt-1 text-xs text-muted-foreground">{archive.nextSeasonEuropeanQualification ? archiveSeasonLabel(archive.nextSeasonEuropeanQualification.seasonStartYear) : "Temporada siguiente"}</p><div className="mt-3 space-y-2">{archive.nextSeasonEuropeanQualification ? ([ ["ucl", "Champions League"], ["uel", "Europa League"], ["uecl", "Conference League"] ] as const).map(([key, label]) => { const participants = archive.nextSeasonEuropeanQualification?.[key] ?? []; return <details key={key} className="rounded-lg bg-secondary/25 px-3 py-2"><summary className="cursor-pointer text-sm font-bold">{label} · {participants.length} clubes</summary><div className="mt-2 grid gap-1 sm:grid-cols-2">{participants.map((teamId, index) => <div key={`${key}-${teamId}`} className="flex min-w-0 items-center gap-2 text-xs"><span className="w-5 shrink-0 text-right text-muted-foreground">{index + 1}.</span><span className="truncate">{teamLabel(teamId)}</span></div>)}</div></details>; }) : <p className="text-xs text-muted-foreground">Este archivo no contiene las plazas de la campaña siguiente.</p>}</div></div>
          </section>
          {(archive.retirements.length > 0 || archive.promotions.length > 0 || archive.relegations.length > 0) && <section className="grid gap-3 sm:grid-cols-3">{[
            { title: "Retiradas", rows: archive.retirements.map((player) => `${player.playerName} · ${player.age} años`) },
            { title: "Ascensos", rows: archive.promotions.map((move) => `${teamLabel(move.teamId)} · ${move.fromLeague} → ${move.toLeague}`) },
            { title: "Descensos", rows: archive.relegations.map((move) => `${teamLabel(move.teamId)} · ${move.fromLeague} → ${move.toLeague}`) },
          ].map((section) => <div key={section.title} className="rounded-xl border border-border/50 p-3"><h4 className="text-sm font-black">{section.title} <span className="text-muted-foreground">({section.rows.length})</span></h4><div className="mt-2 space-y-1">{section.rows.slice(0, 8).map((row) => <p key={row} className="text-xs text-muted-foreground">{row}</p>)}{section.rows.length > 8 && <p className="text-xs font-bold text-primary">y {section.rows.length - 8} más…</p>}{section.rows.length === 0 && <p className="text-xs text-muted-foreground">Ninguno registrado.</p>}</div></div>)}</section>}
          <div className="rounded-xl border border-border/50 p-3"><h3 className="font-black">Clasificaciones finales de todas las ligas</h3><p className="mt-1 text-xs text-muted-foreground">Abre una liga para cargar sus filas y estadísticas.</p><div className="mt-2 flex flex-wrap gap-2">{archive.leagues.map((league) => <LazyLeagueStandingsDetails key={league.leagueId} league={league} myTeamId={archive.myTeamId} leagueTitle={LEAGUES[league.leagueId as LeagueId]?.name ?? league.leagueId} teamLabel={teamLabel} />)}</div></div>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-card/70 p-4 md:px-6"><Link to="/history" onClick={onClose} className="inline-flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2 text-xs font-black hover:bg-secondary/60"><HistoryIcon className="h-4 w-4" /> Abrir Historia y palmarés</Link><button type="button" onClick={onContinue} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground hover:bg-primary/90">Continuar a {nextSeason}</button></footer>
      </div>
    </div>
  );
}

function LazyLeagueStandingsDetails({
  league,
  myTeamId,
  leagueTitle,
  teamLabel,
}: {
  league: SeasonArchive["leagues"][number];
  myTeamId?: string;
  leagueTitle: string;
  teamLabel: (id: string | null) => string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="w-full rounded-lg bg-secondary/20 p-2"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-bold">{leagueTitle} · {league.table.length} equipos</summary>
      {open && (
        <div className="mt-2 space-y-1">
          {league.table.map((row) => (
            <div
              key={row.teamId}
              className={`grid grid-cols-[26px_minmax(0,1fr)_auto] gap-2 rounded px-2 py-1 text-xs ${row.teamId === myTeamId ? "bg-primary/10 font-black" : ""}`}
            >
              <span>{row.position}.</span>
              <span className="truncate">{teamLabel(row.teamId)}</span>
              <span className="tabular-nums">{row.points} pts · DG {row.gd > 0 ? `+${row.gd}` : row.gd}</span>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

function NextMatchCard({
  fixture,
  myId,
  onPlayMatch,
  theme,
}: {
  fixture: Fixture;
  myId: string;
  onPlayMatch: (fixture: Fixture) => void;
  theme: CentralTheme;
}) {
  const navigate = useNavigate();

  const home = teamById(fixture.homeId);

  const away = teamById(fixture.awayId);

  const isHome = fixture.homeId === myId;

  const fixtures = usePlayersStore((s) => s.fixtures);

  const myTeamId = usePlayersStore((s) => s.myTeamId);

  const dismissMatch = usePlayersStore((s) => s.dismissMatch);

  const save = loadSave();

  const currentDate = useCurrentDate();

  // Determine competition type and header text
  const roundNames: Record<string, string> = {
    R32: "Treintaidosavos",
    R16: "Dieciseisavos",
    Octavos: "Octavos de Final",
    QF: "Cuartos de Final",
    SF: "Semifinales",
    Final: "Final",
    Preliminar: "Preliminar",
  };

  let headerText = "";
  if (fixture.competition === "cup") {
    headerText = `Copa Nacional · ${roundNames[fixture.round || ""] || fixture.round || ""}`;
  } else if (fixture.competition === "ucl") {
    const europeanName = fixture.europeanCompetition === "uel"
      ? "Europa League"
      : fixture.europeanCompetition === "uecl"
        ? "Conference League"
        : "Champions League";
    headerText = `${europeanName} · ${fixture.round || "Fase de Liga"}`;
  } else {
    headerText = `Liga · Jornada ${fixture.matchday}`;
  }

  // Check if user's lineup is complete (11 valid players)

  const myLineup = save?.lineups[myId] || [];

  const activeStartersCount = myLineup.filter((id: string) => id && id.trim() !== "").length;

  const isLineupComplete = activeStartersCount === 11;

  // Calculate match date based on competition type
  const seasonStartYear = getSeasonStartYear(save!.season);
  const seasonAnchors = getSeasonCalendarAnchors(seasonStartYear);
  const seasonStart = new Date(`${seasonAnchors.leagueKickoffSaturday}T12:00:00Z`);
  const cupStart = new Date(`${seasonAnchors.nationalCupStart}T00:00:00Z`);

  let matchDateIso: string;
  let matchDate: Date;

  if (fixture.competition === "league") {
    // La fixture de la partida es la fuente de verdad. El store secundario de
    // jugadores puede quedarse atrasado después de migrar/recargar una carrera
    // y no debe hacer desaparecer ni cambiar la fecha del próximo partido.
    matchDateIso = fixture.date || currentDate;
    matchDate = new Date(matchDateIso + "T12:00:00Z");
  } else if (fixture.competition === "cup") {
    matchDateIso = getCupFixtureDateIso(fixture, seasonStartYear) || currentDate;
    matchDate = new Date(`${matchDateIso}T12:00:00Z`);
  } else {
    const competition = fixture.europeanCompetition === "uecl"
      ? "uecl"
      : fixture.europeanCompetition === "uel"
        ? "uel"
        : "ucl";
    matchDateIso = getEuropeanFixtureDateIso(fixture, competition, seasonStartYear) || currentDate;
    matchDate = new Date(`${matchDateIso}T12:00:00Z`);
  }

  const isMatchDay = currentDate === matchDateIso;

  // Calculate days remaining
  const currentDateObj = new Date(currentDate + "T00:00:00Z");
  const matchDateObj = new Date(matchDateIso + "T00:00:00Z");
  const daysDiff = Math.ceil(
    (matchDateObj.getTime() - currentDateObj.getTime()) / (1000 * 60 * 60 * 24),
  );

  let daysRemainingText = "";
  if (daysDiff === 0) {
    daysRemainingText = "Hoy";
  } else if (daysDiff === 1) {
    daysRemainingText = "Mañana";
  } else if (daysDiff > 1) {
    daysRemainingText = `En ${daysDiff} días`;
  } else {
    daysRemainingText = `Hace ${Math.abs(daysDiff)} días`;
  }

  // Get recent results for both teams

  const homeRecent = save ? getTeamRecentResults(save, fixture.homeId, save.myLeague, 5) : [];

  const awayRecent = save ? getTeamRecentResults(save, fixture.awayId, save.myLeague, 5) : [];

  const referee = refereeFor(fixture.id, fixture);
  const weather = weatherFor(fixture.id);

  return (
    <div className={`panel-glow p-6 border ${theme.cardBorder} ${theme.bgOverlay}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col gap-1">
          <span
            className={`inline-flex items-center w-fit px-2 py-0.5 rounded text-[0.7rem] border ${theme.badge}`}
          >
            {headerText}
          </span>

          <span className={`text-xs font-medium ${theme.accent}`}>
            {new Date(matchDateIso + "T00:00:00Z").toLocaleDateString("es-ES", {
              weekday: "long",
              year: "numeric",
              month: "short",
              day: "numeric",
            })}{" "}
            · <span className="text-primary font-semibold">{daysRemainingText}</span>
          </span>
        </div>

        <span className="text-xs text-muted-foreground uppercase tracking-wider">
          {isHome ? "Local" : "Visitante"}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center text-center mb-6">
        <TeamSide team={home} side="left" recentResults={homeRecent} label="LOCAL" />
        <div className="text-3xl font-black text-muted-foreground">VS</div>
        <TeamSide team={away} side="right" recentResults={awayRecent} label="VISITANTE" />
      </div>

      {/* Referee + weather */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <section className="rounded-xl border border-border/60 bg-card/65 p-3" aria-label="Información del árbitro">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <Flag className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[0.6rem] font-black uppercase tracking-[0.16em] text-muted-foreground">Árbitro principal</span>
                <span className={`rounded-full px-2 py-0.5 text-[0.58rem] font-black ${referee.strictness >= 70 ? "bg-amber-500/10 text-amber-300" : referee.strictness <= 35 ? "bg-emerald-500/10 text-emerald-300" : "bg-secondary text-muted-foreground"}`}>
                  {referee.strictness >= 70 ? "Estricto" : referee.strictness <= 35 ? "Permisivo" : "Equilibrado"}
                </span>
              </div>
              <p className="mt-1 truncate text-sm font-black">{referee.name}</p>
              <div className="mt-2 flex items-center gap-2" title="Indicador orientativo de severidad disciplinaria">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, referee.strictness))}%` }} /></div>
                <span className="scoreline text-[0.65rem] font-bold">{referee.strictness}/100</span>
              </div>
              <p className="mt-1 text-[0.6rem] text-muted-foreground">Severidad disciplinaria estimada</p>
            </div>
          </div>
        </section>
        <section className="rounded-xl border border-border/60 bg-card/65 p-3" aria-label="Previsión meteorológica">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-2xl">{weather.icon}</div>
            <div className="min-w-0 flex-1">
              <span className="text-[0.6rem] font-black uppercase tracking-[0.16em] text-muted-foreground">Condiciones del partido</span>
              <p className="mt-1 truncate text-sm font-black">{weather.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">Temperatura prevista: <span className="font-bold text-foreground">{weather.temp}°C</span></p>
              <p className="mt-1 text-[0.6rem] text-muted-foreground">Información contextual previa al encuentro.</p>
            </div>
          </div>
        </section>
      </div>

      {/* Action buttons */}

      <div className="space-y-2">
        {/* Play button - only enabled on match day with complete lineup */}

        <button
          onClick={() => onPlayMatch(fixture)}
          disabled={!isLineupComplete || !isMatchDay}
          className={`w-full py-3 rounded-lg font-black tracking-wide transition ${
            isLineupComplete && isMatchDay
              ? `${theme.primaryBtn} glow-neon hover:brightness-110`
              : "bg-secondary text-muted-foreground pointer-events-none opacity-50"
          }`}
        >
          {!isLineupComplete
            ? "ALINEACIÓN INCOMPLETA"
            : !isMatchDay
              ? `${daysRemainingText} · ${matchDateIso}`
              : "JUGAR"}
        </button>
      </div>
    </div>
  );
}

function TeamSide({
  team,
  side,
  recentResults,
  label,
}: {
  team: ReturnType<typeof teamById>;
  side: "left" | "right";
  recentResults: Fixture[];
  label?: string;
}) {
  const getSimSquad = usePlayersStore((s) => s.getSimSquad);
  const squad = getSimSquad(team.id);
  const bestPlayer =
    squad.length > 0
      ? squad.reduce((best, current) => (current.rating > best.rating ? current : best))
      : null;

  return (
    <div className="flex flex-col items-center gap-2">
      {label && (
        <span className="text-[0.6rem] font-bold text-muted-foreground uppercase tracking-widest bg-secondary/50 px-2 py-0.5 rounded">
          {label}
        </span>
      )}

      <div className={`flex items-center gap-3 ${side === "right" ? "flex-row-reverse" : ""}`}>
        <TeamLogo teamName={team.name} leagueName={getLeagueName(team.league)} size={56} />

        <div className={side === "right" ? "text-right" : "text-left"}>
          <div className="font-bold leading-tight">{team.name}</div>

          <div className="text-xs text-muted-foreground">
            {bestPlayer ? bestPlayer.name : team.city}
          </div>
        </div>
      </div>

      {recentResults.length > 0 && (
        <div className="flex gap-1">
          {recentResults.map((f) => {
            const r = f.result!;

            const teamGoals = f.homeId === team.id ? r.homeGoals : r.awayGoals;

            const oppGoals = f.homeId === team.id ? r.awayGoals : r.homeGoals;

            const outcome = teamGoals > oppGoals ? "V" : teamGoals < oppGoals ? "D" : "E";

            const outcomeColor =
              outcome === "V"
                ? "bg-emerald-500 text-white shadow-sm shadow-emerald-950/30"
                : outcome === "D"
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-muted text-foreground";

            return (
              <div
                key={f.id}
                className={`w-5 h-5 rounded grid place-items-center text-[0.65rem] font-black ${outcomeColor}`}
              >
                {outcome}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ResultRow({
  fixture,
  myId,
  onClick,
}: {
  fixture: Fixture;
  myId: string;
  onClick?: (fixture: Fixture) => void;
}) {
  const home = teamById(fixture.homeId);

  const away = teamById(fixture.awayId);

  const r = fixture.result!;

  const myGoals = fixture.homeId === myId ? r.homeGoals : r.awayGoals;

  const oppGoals = fixture.homeId === myId ? r.awayGoals : r.homeGoals;

  const outcome = myGoals > oppGoals ? "V" : myGoals < oppGoals ? "D" : "E";

  const outcomeColor =
    outcome === "V"
      ? "bg-emerald-500 text-white shadow-sm shadow-emerald-950/30"
      : outcome === "D"
        ? "bg-destructive text-destructive-foreground"
        : "bg-muted text-foreground";

  const isHome = fixture.homeId === myId;

  return (
    <div
      className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0 cursor-pointer hover:bg-accent/20 transition"
      onClick={() => onClick?.(fixture)}
    >
      <div className={`w-6 h-6 rounded grid place-items-center text-xs font-black ${outcomeColor}`}>
        {outcome}
      </div>

      <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={24} />

      <span className="text-sm flex-1 truncate">{home.short}</span>

      <span className="scoreline text-lg">
        {r.homeGoals} <span className="text-muted-foreground">-</span> {r.awayGoals}
      </span>

      <span className="text-sm flex-1 truncate text-right">{away.short}</span>

      <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={24} />

      <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold w-6 text-center">
        {isHome ? "H" : "A"}
      </span>
    </div>
  );
}

function StandingsTable({
  standings,
  myTeamId,
  save,
  leagueId,
}: {
  standings: ReturnType<typeof getSortedStandings>;
  myTeamId: string;
  save: SaveGame;
  leagueId: LeagueId;
}) {
  const zones = getLeaguePositionZones(save, leagueId, standings);
  return (
    <div className="text-xs">
      <div className="grid grid-cols-[24px_1fr_24px_28px_32px] gap-2 text-muted-foreground uppercase tracking-wider pb-2 border-b border-border/60">
        <span>#</span>
        <span>Equipo</span>
        <span className="text-center">PJ</span>
        <span className="text-center">DG</span>
        <span className="text-center">Pts</span>
      </div>

      {standings.map((s, i) => {
        const t = teamById(s.teamId, { teamLeagueOverrides: save.teamLeagueOverrides ?? {} });
        const isMe = s.teamId === myTeamId;
        const rowZones = zones.get(s.teamId) ?? [];
        const primaryZone = primaryLeagueZone(rowZones);
        const zonePresentation = primaryZone ? LEAGUE_ZONE_PRESENTATION[primaryZone] : null;
        const zoneTitle = rowZones.map((kind) => LEAGUE_ZONE_PRESENTATION[kind].label).join(" · ");
        const zoneColor = zonePresentation?.borderClass ?? "border-l-transparent";

        return (
          <div
            key={s.teamId}
            title={zoneTitle || undefined}
            className={`grid grid-cols-[24px_1fr_24px_28px_32px] gap-2 py-1.5 border-b border-border/30 last:border-0 border-l-2 pl-2 ${zoneColor} ${isMe ? "bg-primary/10 text-primary font-bold" : ""}`}
          >
            <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-0.5 ${zonePresentation?.badgeClass ?? "text-muted-foreground"}`}>{i + 1}</span>

            <span className="flex items-center gap-1.5 min-w-0">
              <TeamLogo teamName={t.name} leagueName={getLeagueName(t.league)} size={18} />

              <span className="truncate">{t.short}</span>
              {rowZones.map((kind) => <span key={kind} title={LEAGUE_ZONE_PRESENTATION[kind].label} className={`hidden xl:inline-flex shrink-0 rounded px-1 py-0.5 text-[0.5rem] font-black ${LEAGUE_ZONE_PRESENTATION[kind].badgeClass}`}>{LEAGUE_ZONE_PRESENTATION[kind].shortLabel}</span>)}
            </span>

            <span className="text-center scoreline">{s.played}</span>

            <span className="text-center scoreline">{s.gd > 0 ? `+${s.gd}` : s.gd}</span>

            <span className="text-center scoreline font-bold">{s.points}</span>
          </div>
        );
      })}

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[0.6rem] text-muted-foreground">
        {orderedLeagueZoneKinds(zones).map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-sm ${LEAGUE_ZONE_PRESENTATION[kind].dotClass}`} />
            {LEAGUE_ZONE_PRESENTATION[kind].label}
          </span>
        ))}
      </div>
    </div>
  );
}

// Big 5 European leagues only

const BIG5_LEAGUES: LeagueId[] = ["laliga", "premier", "bundesliga", "ligue1", "seriea"];

function OtherLeaguesPanel({ save }: { save: SaveGame }) {
  // Only show Big 5 leagues (excluding user's current league if it's one of them)

  const others = BIG5_LEAGUES.filter((l) => l !== save.myLeague);

  return (
    <div className="panel p-5">
      <h3 className="font-bold mb-4">Resultados en Europa</h3>

      <div className="grid sm:grid-cols-2 gap-4">
        {others.map((lg) => {
          // Find the highest matchday with results that is <= current matchday

          const fixtures = save.fixtures[lg];

          const currentMd = save.currentMatchday[lg];

          const matchdaysWithResults = new Set(
            fixtures.filter((f) => f.result && f.matchday <= currentMd).map((f) => f.matchday),
          );

          const highestMd =
            matchdaysWithResults.size > 0 ? Math.max(1, ...matchdaysWithResults) : currentMd;

          const allFixtures = getMatchdayFixtures(save, lg, highestMd);

          const fixturesWithResults = allFixtures.filter((f) => f.result);

          return (
            <div key={lg}>
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                <CountryFlag country={LEAGUES[lg].country} />
                {LEAGUES[lg].name} · J{highestMd}
              </div>

              {fixturesWithResults.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {allFixtures.length === 0
                    ? `Sin partidos en esta jornada (MD actual: ${save.currentMatchday[lg]}, fixtures totales: ${save.fixtures[lg]?.length || 0})`
                    : `Partidos no jugados aún (${allFixtures.length} partidos) - Usa "Simular resto de la jornada"`}
                </p>
              ) : (
                <div className="space-y-1">
                  {fixturesWithResults.slice(0, 5).map((f) => {
                    const h = teamById(f.homeId);

                    const a = teamById(f.awayId);

                    return (
                      <div key={f.id} className="flex items-center gap-2 text-xs">
                        <span className="flex-1 text-right truncate flex items-center justify-end gap-1.5">
                          {h.short}

                          <TeamLogo
                            teamName={h.name}
                            leagueName={getLeagueName(h.league)}
                            size={16}
                          />
                        </span>

                        <span className="scoreline font-bold">
                          {f.result!.homeGoals}-{f.result!.awayGoals}
                        </span>

                        <span className="flex-1 truncate flex items-center gap-1.5">
                          <TeamLogo
                            teamName={a.name}
                            leagueName={getLeagueName(a.league)}
                            size={16}
                          />

                          {a.short}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===== Extra components =====

function MiniTrendChart({ history }: { history: { matchday: number; pos: number }[] }) {
  if (history.length < 2) {
    return (
      <div className="hidden sm:flex flex-col items-center justify-center text-[0.6rem] text-muted-foreground w-28 h-14 border border-dashed border-border/40 rounded-md">
        Sin histórico
      </div>
    );
  }
  const w = 112;
  const h = 56;
  const pad = 4;
  const positions = history.map((h) => h.pos);
  const maxPos = Math.max(...positions);
  const minPos = Math.min(...positions);
  const range = Math.max(1, maxPos - minPos);
  const pts = history.map((p, i) => {
    const x = pad + (i * (w - pad * 2)) / (history.length - 1);
    // invert: lower pos number is better → higher in chart
    const y = pad + ((p.pos - minPos) / range) * (h - pad * 2);
    return [x, y] as const;
  });
  const d = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(" ");
  const last = pts[pts.length - 1];
  return (
    <div className="hidden sm:block">
      <div className="text-[0.55rem] uppercase tracking-wider text-muted-foreground mb-1 text-center">
        Evolución
      </div>
      <svg width={w} height={h} className="block">
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-primary/70"
        />
        <circle cx={last[0]} cy={last[1]} r="2.5" className="fill-primary" />
      </svg>
    </div>
  );
}

function NotificationsBar({
  isLineupComplete,
  injuredCount,
  nextFixture,
  theme,
}: {
  isLineupComplete: boolean;
  injuredCount: number;
  nextFixture: Fixture | null;
  theme: CentralTheme;
}) {
  const items: { icon: any; text: string; tone: string }[] = [];
  if (!isLineupComplete) {
    items.push({
      icon: AlertTriangle,
      text: "Alineación incompleta — completa tu 11 titular",
      tone: "text-destructive border-destructive/40 bg-destructive/10",
    });
  }
  if (injuredCount > 0) {
    items.push({
      icon: AlertTriangle,
      text: `${injuredCount} titular${injuredCount === 1 ? "" : "es"} con problemas físicos`,
      tone: "text-amber-300 border-amber-400/40 bg-amber-500/10",
    });
  }
  if (nextFixture?.competition === "ucl") {
    const name = nextFixture.europeanCompetition === "uel"
      ? "Europa League"
      : nextFixture.europeanCompetition === "uecl"
        ? "Conference League"
        : "Champions League";
    const tone = nextFixture.europeanCompetition === "uel"
      ? "text-orange-200 border-orange-400/40 bg-orange-500/10"
      : nextFixture.europeanCompetition === "uecl"
        ? "text-green-200 border-green-400/40 bg-green-500/10"
        : "text-blue-200 border-blue-400/40 bg-blue-500/10";
    items.push({ icon: Bell, text: `Próximo: ${name} — partido especial`, tone });
  } else if (nextFixture?.competition === "cup") {
    items.push({
      icon: Bell,
      text: "Próximo: Copa Nacional — eliminación directa",
      tone: "text-amber-200 border-amber-400/40 bg-amber-500/10",
    });
  }
  if (items.length === 0) {
    items.push({
      icon: Bell,
      text: "Todo en orden. ¡Suerte en la próxima jornada!",
      tone: `text-muted-foreground border-border/50 bg-secondary/20`,
    });
  }
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {items.map((it, i) => {
        const Icon = it.icon;
        return (
          <div
            key={i}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs ${it.tone}`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span>{it.text}</span>
          </div>
        );
      })}
    </div>
  );
}

function UCLMiniTable({ table, myTeamId }: { table: any[]; myTeamId: string }) {
  const sorted = [...table].sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
  return (
    <div className="text-xs">
      <div className="grid grid-cols-[24px_1fr_24px_28px_32px] gap-2 text-muted-foreground uppercase tracking-wider pb-2 border-b border-blue-500/30">
        <span>#</span>
        <span>Equipo</span>
        <span className="text-center">PJ</span>
        <span className="text-center">DG</span>
        <span className="text-center">Pts</span>
      </div>
      {sorted.slice(0, 12).map((s, i) => {
        const t = teamById(s.teamId);
        const isMe = s.teamId === myTeamId;
        const zone =
          i < 8 ? "border-l-blue-400" : i < 24 ? "border-l-indigo-400/60" : "border-l-destructive";
        return (
          <div
            key={s.teamId}
            className={`grid grid-cols-[24px_1fr_24px_28px_32px] gap-2 py-1.5 border-b border-blue-500/20 last:border-0 border-l-2 pl-2 ${zone} ${isMe ? "bg-blue-500/15 text-blue-200 font-bold" : ""}`}
          >
            <span className="text-muted-foreground">{i + 1}</span>
            <span className="flex items-center gap-1.5 min-w-0">
              <TeamLogo teamName={t.name} leagueName={getLeagueName(t.league)} size={18} />
              <span className="truncate">{t.short}</span>
            </span>
            <span className="text-center scoreline">{s.played}</span>
            <span className="text-center scoreline">{s.gd > 0 ? `+${s.gd}` : s.gd}</span>
            <span className="text-center scoreline font-bold">{s.points}</span>
          </div>
        );
      })}
      <p className="text-[0.65rem] text-muted-foreground mt-3 leading-relaxed">
        <span className="text-blue-400">●</span> Top 8 (Octavos) ·{" "}
        <span className="text-indigo-400">●</span> Playoff ·{" "}
        <span className="text-destructive">●</span> Eliminado
      </p>
    </div>
  );
}
