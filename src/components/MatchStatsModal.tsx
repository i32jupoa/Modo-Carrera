import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TeamLogo } from "@/components/TeamLogo";
import { MiniPitch } from "@/components/MiniPitch";
import { PlayerFace, roleFromPosition } from "@/components/PlayerFace";
import { faceUrl } from "@/lib/playerFaces";
import { teamById, LEAGUES } from "@/data/teams";
import { resolveMatchTeamColors } from "@/lib/matchPresentation";
import { usePlayersStore } from "@/store/playersStore";
import {
  Trophy,
  Target,
  AlertTriangle,
  Star,
  TrendingUp,
  Clock,
  Shield,
  Circle,
  Zap,
  XCircle,
  RefreshCw,
  UserMinus,
  UserPlus,
} from "lucide-react";
import type { Fixture } from "@/lib/season";
import type { Player } from "@/data/players";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { loadSave, getStartersWithFormation } from "@/lib/store";
import type { FormationName } from "@/lib/formations";
import { MatchFinalSummary } from "@/components/match/MatchShowcase";
import { MatchChronicle } from "@/components/match/MatchChronicle";
import { buildMatchChronicleItems } from "@/lib/matchChronicle";
import { formatMatchMinuteWithMark, getMatchMinuteElapsedValue, getMatchMinuteSortValue, markExtraTimeEvent } from "@/lib/matchTime";

interface MatchStatsModalProps {
  fixture: Fixture | null;
  onClose: () => void;
}

export function MatchStatsModal({ fixture, onClose }: MatchStatsModalProps) {
  const store = usePlayersStore();
  const save = loadSave();

  if (!fixture) return null;

  const home = teamById(fixture.homeId);
  const away = teamById(fixture.awayId);
  if (!home || !away) return null;

  const getLeagueName = (leagueId: string): string => LEAGUES[leagueId]?.name || leagueId;
  const percentagePart = (value: number, other: number): number => {
    const total = Number(value || 0) + Number(other || 0);
    return total > 0 ? (Number(value || 0) / total) * 100 : 50;
  };

  if (!fixture.result) {
    const roundLabel = fixture.round?.startsWith("Playoff")
      ? "Play-off"
      : fixture.round?.startsWith("R16")
        ? "Octavos de final"
        : fixture.round?.startsWith("QF")
          ? "Cuartos de final"
          : fixture.round?.startsWith("SF")
            ? "Semifinal"
            : fixture.round === "Final"
              ? "Final"
              : "Champions League";
    const legLabel = fixture.round?.endsWith("Leg1")
      ? "Ida"
      : fixture.round?.endsWith("Leg2")
        ? "Vuelta"
        : "Partido único";
    const formattedDate = fixture.date && /^\d{4}-\d{2}-\d{2}$/.test(fixture.date)
      ? new Date(`${fixture.date}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })
      : "Fecha por confirmar";

    return (
      <Dialog open={!!fixture} onOpenChange={onClose}>
        <DialogContent className="max-w-md border-border/70 bg-background/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black">Partido pendiente</DialogTitle>
            <DialogDescription>{roundLabel} · {legLabel}</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-border/70 bg-card/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
                <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={48} />
                <span className="text-sm font-bold">{home.name}</span>
              </div>
              <span className="shrink-0 text-xs font-black uppercase tracking-widest text-muted-foreground">vs</span>
              <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
                <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={48} />
                <span className="text-sm font-bold">{away.name}</span>
              </div>
            </div>
            <p className="mt-4 border-t border-border/60 pt-3 text-center text-xs text-muted-foreground">{formattedDate}</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const matchColors = resolveMatchTeamColors(home, away);
  const result = fixture.result;

  // Older career saves may not contain aggregate stats. Keep the fallback
  // stable (never random on render) and visibly mark those figures as an
  // estimate in the tab below.
  const stableSeed = `${fixture.id}|${fixture.homeId}|${fixture.awayId}`;
  let statsHash = 2166136261;
  for (let index = 0; index < stableSeed.length; index += 1) {
    statsHash ^= stableSeed.charCodeAt(index);
    statsHash = Math.imul(statsHash, 16777619);
  }
  const stableValue = (offset: number, span: number) => ((statsHash >>> (offset % 24)) + offset * 31) % span;
  const homeXg = Number(result.xgHome) || Number(result.homeGoals) * 0.72;
  const awayXg = Number(result.xgAway) || Number(result.awayGoals) * 0.72;
  const xgTotal = Math.max(0.1, homeXg + awayXg);
  const homePossession = Math.max(30, Math.min(70, Math.round(50 + ((homeXg - awayXg) / xgTotal) * 12)));
  const fallbackHomeGoals = (result.events || []).filter((event) => event.team === "home" && ["goal", "penalty_goal", "free_kick_goal", "own_goal"].includes(event.type)).length;
  const fallbackAwayGoals = (result.events || []).filter((event) => event.team === "away" && ["goal", "penalty_goal", "free_kick_goal", "own_goal"].includes(event.type)).length;
  const savedStatsFallback = {
    home: {
      possession: homePossession,
      shots: Math.max(fallbackHomeGoals, Math.round(homeXg * 3.1) + 4 + stableValue(3, 4)),
      shotsOnTarget: Math.max(fallbackHomeGoals, Math.round(homeXg * 1.6) + stableValue(7, 2)),
      corners: 2 + stableValue(11, 8),
      fouls: 7 + stableValue(13, 11),
      offsides: stableValue(17, 5),
      passAccuracy: 76 + stableValue(19, 15),
      saves: (result.highlights || []).filter((event: any) => event.type === "save" && event.team === "home").length,
      xg: homeXg,
    },
    away: {
      possession: 100 - homePossession,
      shots: Math.max(fallbackAwayGoals, Math.round(awayXg * 3.1) + 4 + stableValue(5, 4)),
      shotsOnTarget: Math.max(fallbackAwayGoals, Math.round(awayXg * 1.6) + stableValue(9, 2)),
      corners: 2 + stableValue(15, 8),
      fouls: 7 + stableValue(21, 11),
      offsides: stableValue(23, 5),
      passAccuracy: 76 + stableValue(25, 15),
      saves: (result.highlights || []).filter((event: any) => event.type === "save" && event.team === "away").length,
      xg: awayXg,
    },
  };
  const hasStoredStats = Boolean(result.stats?.home && result.stats?.away);
  const stats = result.stats || savedStatsFallback;

  // Get player ratings - generate basic ratings if not available
  const generateBasicRatings = (players: Player[], teamId: string) => {
    return players.map((p) => ({
      playerId: p.id,
      // Deterministic fallback for old saves that predate stored match ratings.
      rating: Math.round(Math.max(4.5, Math.min(8.5, 5.5 + (p.rating - 65) * 0.08)) * 10) / 10,
      teamId,
      minutes: 90,
    }));
  };

  // Los eventos históricos pertenecen al equipo que aparece en el partido,
  // no al club actual del jugador. Esto es imprescindible después de un
  // traspaso: un jugador que hoy está en PSG puede seguir teniendo una nota
  // válida de un partido anterior con Barcelona.
  const homeRatings = (result.ratings || []).filter((r) => r.team === "home");
  const awayRatings = (result.ratings || []).filter((r) => r.team === "away");

  // Get players who played the match - use lineup data if available, otherwise use ratings, otherwise generate basic lineup
  const getBasicLineup = (teamId: string): { players: Player[]; formation: FormationName } => {
    if (save) {
      const { players, formation } = getStartersWithFormation(save, teamId);
      return { players, formation };
    }
    // Fallback if save is not available
    const getSimSquad = usePlayersStore.getState().getSimSquad;
    const squad = getSimSquad(teamId);
    // Sort by rating and take top 11
    return {
      players: squad.sort((a, b) => b.rating - a.rating).slice(0, 11),
      formation: "Táctica 4-4-2",
    };
  };

  const homeStartingLineup = (result as any).homeStartingLineup;
  const awayStartingLineup = (result as any).awayStartingLineup;

  // Some older saved/live results only stored the XI that was on the pitch at
  // full time. Rebuild the true starting XI by reversing substitutions. This
  // keeps a starter who was later replaced (e.g. Bernardo Silva) in the
  // "Titulares" section and on the mini-pitch. For fast-simulated results the
  // stored lineup can contain starters first and incoming substitutes after
  // them; in that case the first 11 are already the real starters and the
  // reverse pass is a no-op.
  const reconstructStartingLineup = (
    team: "home" | "away",
    teamId: string,
    lineupValue: unknown,
  ): Player[] => {
    const raw = Array.isArray(lineupValue) ? lineupValue.filter(Boolean) : [];
    if (raw.length === 0) return [];

    const starters = raw.slice(0, 11) as Player[];
    if (starters.length < 11) return starters;

    const teamSubs = (result.substitutions || [])
      .filter((s: any) => s.team === team)
      .slice()
      .sort((a: any, b: any) => (Number(b.minute) || 0) - (Number(a.minute) || 0));

    if (teamSubs.length === 0) return starters;

    const squad = store.getSimSquad(teamId);
    const resolve = (id: string) =>
      starters.find((p) => p.id === id) ||
      squad.find((p) => p.id === id) ||
      store.getSimPlayer(id);

    for (const sub of teamSubs) {
      const outId = sub.playerOutId;
      const inId = sub.playerInId;
      if (!outId || !inId) continue;

      // When the persisted XI is actually the final XI, the incoming player is
      // present in the starting slots and the outgoing starter is missing.
      // Reverse that substitution. If the incoming player is only appended
      // after the first 11 (fast simulation format), nothing changes here.
      const inIndex = starters.findIndex((p) => p.id === inId);
      const outAlreadyPresent = starters.some((p) => p.id === outId);
      if (inIndex < 0 || outAlreadyPresent) continue;

      const outgoing = resolve(outId);
      if (outgoing) starters[inIndex] = outgoing;
    }

    return starters;
  };

  const homeRecoveredStartingLineup =
    Array.isArray(homeStartingLineup) && homeStartingLineup.length > 0
      ? homeStartingLineup
      : reconstructStartingLineup("home", fixture.homeId, result.homeLineup);
  const awayRecoveredStartingLineup =
    Array.isArray(awayStartingLineup) && awayStartingLineup.length > 0
      ? awayStartingLineup
      : reconstructStartingLineup("away", fixture.awayId, result.awayLineup);

  const homeLineupData =
    homeRecoveredStartingLineup.length > 0
      ? {
          players: homeRecoveredStartingLineup,
          formation: (result.homeFormation || "Táctica 4-4-2") as FormationName,
        }
      : homeRatings.length > 0
        ? {
            players: homeRatings
              .map((r) => store.getSimPlayer(r.playerId))
              .filter((p): p is Player => p !== undefined),
            formation: (result.homeFormation || "Táctica 4-4-2") as FormationName,
          }
        : getBasicLineup(fixture.homeId);

  const awayLineupData =
    awayRecoveredStartingLineup.length > 0
      ? {
          players: awayRecoveredStartingLineup,
          formation: (result.awayFormation || "Táctica 4-4-2") as FormationName,
        }
      : awayRatings.length > 0
        ? {
            players: awayRatings
              .map((r) => store.getSimPlayer(r.playerId))
              .filter((p): p is Player => p !== undefined),
            formation: (result.awayFormation || "Táctica 4-4-2") as FormationName,
          }
        : getBasicLineup(fixture.awayId);

  const homePlayers = homeLineupData.players;
  const awayPlayers = awayLineupData.players;
  const homeFormation = homeLineupData.formation;
  const awayFormation = awayLineupData.formation;

  // Use generated ratings if no ratings exist
  const finalHomeRatings =
    homeRatings.length > 0 ? homeRatings : generateBasicRatings(homePlayers, fixture.homeId);
  const finalAwayRatings =
    awayRatings.length > 0 ? awayRatings : generateBasicRatings(awayPlayers, fixture.awayId);

  // Fall back to the best-rated player among the (possibly generated) ratings
  // if the stored result doesn't carry an explicit MVP.
  const displayMvp =
    result.mvp ??
    [...finalHomeRatings, ...finalAwayRatings].sort((a, b) => b.rating - a.rating)[0] ??
    null;

  // Resolve historical players by id first, then by name. Match chronicles may
  // outlive a transfer, so using the current team is not reliable enough.
  const resolveChroniclePlayer = (playerId?: string, playerName?: string) => {
    if (playerId) {
      const fromStore = store.getSimPlayer(playerId);
      if (fromStore) return fromStore;
      const fromLineups = [...homePlayers, ...awayPlayers].find((p) => p.id === playerId);
      if (fromLineups) return fromLineups;
      const fromRatings = [...finalHomeRatings, ...finalAwayRatings].find((r) => r.playerId === playerId);
      if (fromRatings) return store.getSimPlayer(fromRatings.playerId);
    }
    if (playerName) {
      return [...homePlayers, ...awayPlayers].find((p) => p.name === playerName);
    }
    return undefined;
  };

  const PlayerChronicleFace = ({ playerId, playerName, size = 30 }: { playerId?: string; playerName?: string; size?: number }) => {
    const player = resolveChroniclePlayer(playerId, playerName);
    const name = player?.name || playerName || "Jugador";
    return (
      <PlayerFace
        name={name}
        image={faceUrl(player?.id || playerId, player?.cardImage)}
        role={roleFromPosition(player?.positions?.[0] || "MID")}
        size={size}
        showRing={false}
        className="border border-border/60 shadow-sm"
      />
    );
  };

  // ---- Prórroga y penaltis ------------------------------------------------
  // result.homeGoals/awayGoals son SOLO los 90 minutos. Los goles de la
  // prórroga viven en result.extraTime, y la tanda en result.penalties.
  const extraTime = (result as any).extraTime as
    | { homeGoals: number; awayGoals: number; events?: any[]; highlights?: any[] }
    | undefined;
  const penalties = (result as any).penalties as
    | {
        homeGoals: number;
        awayGoals: number;
        shootout?: Array<{ team: "home" | "away"; scored: boolean; playerId?: string }>;
      }
    | undefined;

  const displayHomeGoals = result.homeGoals + (extraTime?.homeGoals || 0);
  const displayAwayGoals = result.awayGoals + (extraTime?.awayGoals || 0);
  const decisionLabel = penalties ? "Penaltis" : extraTime ? "Prórroga" : null;

  // Los eventos y highlights de la prórroga se fusionan con los del partido
  // (evitando duplicados cuando el motor ya los guardó juntos).
  const extraTimeEvents: any[] = (extraTime?.events || []) as any[];
  const sameEvent = (a: any, b: any) =>
    getMatchMinuteSortValue(a.minute, a) === getMatchMinuteSortValue(b.minute, b) &&
    a.team === b.team &&
    (a.scorerId ?? a.playerName) === (b.scorerId ?? b.playerName) &&
    a.type === b.type;
  // Some simulation paths store extra-time goals both in result.events and in
  // result.extraTime.events. Tag both representations before merging so a
  // 94th-minute goal in extra time stays 94', while a regular-time 94 is 90+4'.
  const baseEvents: any[] = ((result.events || []) as any[]).map((event) =>
    extraTimeEvents.some((extraEvent) => sameEvent(event, extraEvent))
      ? markExtraTimeEvent(event)
      : event,
  );
  const mergedEvents: any[] = [
    ...baseEvents,
    ...extraTimeEvents
      .filter((e) => !baseEvents.some((b) => sameEvent(b, e)))
      .map((event) => markExtraTimeEvent(event)),
  ];
  const baseHighlights: any[] = (result.highlights || []) as any[];
  const extraTimeHighlights: any[] = (extraTime?.highlights || []) as any[];
  const mergedHighlights: any[] = [
    ...baseHighlights.map((highlight) =>
      extraTimeHighlights.some((extraHighlight) =>
        extraHighlight.minute === highlight.minute &&
        extraHighlight.team === highlight.team &&
        extraHighlight.type === highlight.type,
      )
        ? markExtraTimeEvent(highlight)
        : highlight,
    ),
    ...((extraTime?.highlights || []) as any[]).filter(
      (h) =>
        !baseHighlights.some(
          (b) => b.minute === h.minute && b.team === h.team && b.type === h.type,
        ),
    ).map((highlight) => markExtraTimeEvent(highlight)),
  ];
  const extraTimeSubstitutions: any[] = (result.extraTime?.substitutions || []) as any[];
  const isSameSubstitution = (a: any, b: any) =>
    Number(a.minute) === Number(b.minute) &&
    a.team === b.team &&
    (a.playerInId ?? a.inId) === (b.playerInId ?? b.inId) &&
    (a.playerOutId ?? a.outId) === (b.playerOutId ?? b.outId);
  const matchSubstitutions = [
    ...(result.substitutions || []).map((substitution: any) =>
      extraTimeSubstitutions.some((extraSubstitution) => isSameSubstitution(substitution, extraSubstitution))
        ? markExtraTimeEvent(substitution)
        : substitution,
    ),
    ...extraTimeSubstitutions
      .filter((sub: any) => !(result.substitutions || []).some((base: any) => isSameSubstitution(base, sub)))
      .map((substitution) => markExtraTimeEvent(substitution)),
  ].filter(Boolean).filter((sub: any, index: number, all: any[]) =>
    all.findIndex((candidate: any) =>
      isSameSubstitution(candidate, sub),
    ) === index,
  );

  // The Moments tab is built from the persisted match report. Keep the five
  // lists local to this fixture and sort each from the first to the last minute.
  const byMinuteAscending = (a: any, b: any) =>
    getMatchMinuteSortValue(a.minute, a) - getMatchMinuteSortValue(b.minute, b);
  const goalMoments = mergedEvents
    .filter((event: any) => ["goal", "penalty_goal", "free_kick_goal", "own_goal"].includes(event.type))
    .slice()
    .sort(byMinuteAscending);
  const woodworkMoments = mergedHighlights
    .filter((event: any) => event.type === "woodwork")
    .slice()
    .sort(byMinuteAscending);
  const extraTimeCards: any[] = ((extraTime as any)?.cards || []) as any[];
  const mergedCards = [
    ...(result.cards || []).map((card: any) =>
      extraTimeCards.some((extraCard) =>
        getMatchMinuteSortValue(extraCard.minute, extraCard) === getMatchMinuteSortValue(card.minute, card) &&
        extraCard.team === card.team &&
        extraCard.playerId === card.playerId &&
        extraCard.cardType === card.cardType,
      )
        ? markExtraTimeEvent(card)
        : card,
    ),
    ...extraTimeCards
      .filter((card: any) => !(result.cards || []).some((base: any) =>
        getMatchMinuteSortValue(base.minute, base) === getMatchMinuteSortValue(card.minute, card) &&
        base.team === card.team &&
        base.playerId === card.playerId &&
        base.cardType === card.cardType,
      ))
      .map((card: any) => markExtraTimeEvent(card)),
  ];
  const cardMoments = mergedCards
    .slice()
    .sort(byMinuteAscending);

  const rawKeyMoments: any[] = Array.isArray((result as any).keyMoments) ? (result as any).keyMoments : [];
  const mergedKeyMoments = rawKeyMoments.map((moment: any) => {
    if (moment.matchPeriod || moment.phase || moment.isExtraTime) return moment;
    const minute = getMatchMinuteSortValue(moment.minute, moment);
    const momentTeam = moment.teamSide ?? moment.team;
    const hasExtraTimeMatch = [...extraTimeEvents, ...extraTimeHighlights, ...extraTimeCards, ...extraTimeSubstitutions].some((candidate: any) => {
      if (getMatchMinuteSortValue(candidate.minute, candidate) !== minute) return false;
      if (momentTeam && candidate.team && momentTeam !== candidate.team) return false;
      const candidatePlayer = candidate.playerId ?? candidate.scorerId ?? candidate.playerInId ?? candidate.inId;
      if (moment.playerId && candidatePlayer && String(moment.playerId) !== String(candidatePlayer)) return false;
      return Boolean(moment.playerId && candidatePlayer) || Boolean(momentTeam && candidate.team);
    });
    return hasExtraTimeMatch ? markExtraTimeEvent(moment) : moment;
  });
  const substitutionMoments = matchSubstitutions
    .slice()
    .sort(byMinuteAscending);

  // Prefer the structured injury records (they include diagnosis and recovery
  // time). Use highlight records only when the save has no matching injury, so
  // the same incident is never shown twice.
  const storedInjuries = (result.injuries || []).map((injury: any) => ({
    ...injury,
    type: "injury",
    minute: getMatchMinuteElapsedValue(injury.minute, injury) ?? 0,
    detail: injury.reason || injury.diagnosis || injury.injuryType || "Lesión",
  }));
  const storedInjuryKeys = new Set(
    storedInjuries.map((injury: any) => `${injury.team}:${injury.playerId || injury.playerName}`),
  );
  const injuryHighlights = mergedHighlights
    .filter((event: any) => ["injury", "injury_substitution"].includes(event.type))
    .filter((event: any) => !storedInjuryKeys.has(`${event.team}:${event.playerId || event.playerName}`))
    .map((event: any) => ({ ...event, type: "injury" }));

  const foulVerbs = ["derriba", "hace falta sobre", "agarra a", "pisa a", "comete mano ante"];
  const getPenaltyOffender = (detail?: string) => {
    const text = String(detail || "").replace(/^Penalti:\s*/i, "");
    const verb = foulVerbs.find((candidate) => text.toLowerCase().includes(` ${candidate} `));
    if (!verb) return "";
    return text.slice(0, text.toLowerCase().indexOf(` ${verb} `)).trim();
  };
  const penaltyIncidents = [
    ...mergedEvents
      .filter((event: any) => event.type === "penalty_goal" && /^Penalti:/i.test(String(event.detail || "")))
      .map((event: any) => ({
        ...event,
        team: event.team === "home" ? "away" : "home",
        type: "penalty_conceded",
        playerName: getPenaltyOffender(event.detail) || "Jugador rival",
      })),
    ...mergedHighlights
      .filter((event: any) => event.type === "penalty_missed" && /^Penalti:/i.test(String(event.detail || "")))
      .map((event: any) => ({
        ...event,
        team: event.team === "home" ? "away" : "home",
        type: "penalty_conceded",
        playerName: getPenaltyOffender(event.detail) || "Jugador rival",
      })),
  ];
  const otherIncidentHighlights = mergedHighlights
    .filter((event: any) => ["var_disallowed", "penalty_awarded"].includes(event.type))
    .map((event: any) => ({ ...event, type: event.type === "penalty_awarded" ? "penalty_conceded" : event.type }));
  const incidentMoments = [
    ...storedInjuries,
    ...injuryHighlights,
    ...penaltyIncidents,
    ...otherIncidentHighlights,
  ].sort(byMinuteAscending);

  const matchCompetitionLabel = (() => {
    const competitionCode = String(fixture.europeanCompetition ?? fixture.competition ?? "").toLowerCase();
    if (competitionCode === "ucl") return `Champions League · ${fixture.round || "Fase de liga"}`;
    if (competitionCode === "uel") return `Europa League · ${fixture.round || "Competición"}`;
    if (competitionCode === "uecl") return `Conference League · ${fixture.round || "Competición"}`;
    if (fixture.promotionPlayoff) {
      return `${fixture.promotionPlayoff.stage === "survival" ? "Playoff de permanencia" : "Playoff de ascenso"} · ${fixture.round || "Eliminatoria"}`;
    }
    if (fixture.competition === "cup") return `Copa Nacional · ${fixture.round || "Eliminatoria"}`;
    return `${getLeagueName(fixture.league)} · Jornada ${fixture.matchday ?? "—"}`;
  })();

  // Get goals by team
  const homeGoals = mergedEvents.filter((e) => e.type === "goal" && e.team === "home");
  const awayGoals = mergedEvents.filter((e) => e.type === "goal" && e.team === "away");

  // Get cards by team
  // Igual para tarjetas y lesiones: usar el equipo registrado en el evento
  // evita que un fichaje posterior cambie retrospectivamente el partido.
  const homeCards = (result.cards || []).filter((c) => c.team === "home");
  const awayCards = (result.cards || []).filter((c) => c.team === "away");

  // Get injuries by team
  const homeInjuries = (result.injuries || []).filter((i) => i.team === "home");
  const awayInjuries = (result.injuries || []).filter((i) => i.team === "away");

  // Highlight types to keep in chronicle (like match.tsx)
  const KEEP: Record<string, { icon: string; label: string }> = {
    woodwork: { icon: "🥅", label: "Al palo" },
    penalty_missed: { icon: "❌", label: "Penalti fallado" },
    var_disallowed: { icon: "📺", label: "Gol anulado (VAR)" },
    injury: { icon: "🚑", label: "Lesión" },
    penalty_conceded: { icon: "⚖️", label: "Penalti cometido" },
    forced_sub: { icon: "🔁", label: "Cambio forzado" },
    save: { icon: "🧤", label: "Parada" },
  };

  // Combine all match events chronologically for the chronicle (like match.tsx)
  const chronicleEvents = (() => {
    const usedSaves: number[] = [];
    const filteredHighlights = mergedHighlights.filter((h: any) => {
      if (!KEEP[h.type]) return false;
      if (h.type === "save") {
        if (h.detail !== "¡Paradón!" || usedSaves.length >= 3) return false;
        usedSaves.push(h.minute);
      }
      return true;
    });

    const items = [
      ...mergedCards.map((c: any) => ({
        kind: "card" as const,
        minute: c.minute,
        data: c,
      })),
      ...mergedEvents
        .filter(
          (e: any) =>
            e.type === "goal" ||
            e.type === "penalty_goal" ||
            e.type === "free_kick_goal" ||
            e.type === "own_goal" ||
            e.type === "penalty",
        )
        .map((e: any) => ({ kind: "goal" as const, minute: e.minute, data: e })),
      ...filteredHighlights.map((h: any) => ({
        kind: "highlight" as const,
        minute: h.minute,
        data: h,
      })),
      ...(result.substitutions || []).map((s: any) => ({
        kind: "sub" as const,
        minute: s.minute,
        data: s,
      })),
    ].sort((a, b) => getMatchMinuteSortValue(b.minute, b.data) - getMatchMinuteSortValue(a.minute, a.data));

    return items;
  })();

  // Never invent scorers, cards or minutes for historical fixtures. Older saves
  // can lack event-level data; those matches show only what was actually stored.
  const finalChronicleEvents = chronicleEvents;

  // Events used to draw goal ⚽ / assist 👟 icons on the mini pitch. If an older
  // save has no individual events, leave the pitch without invented scorers.
  const displayEvents =
    mergedEvents.length > 0
      ? mergedEvents
      : finalChronicleEvents.filter((e) => e.kind === "goal").map((e) => e.data);

  const summaryMvpPlayer = displayMvp?.playerId
    ? resolveChroniclePlayer(displayMvp.playerId, displayMvp.playerName)
    : undefined;
  const summaryMvp = displayMvp
    ? {
        ...displayMvp,
        playerName: displayMvp.playerName || summaryMvpPlayer?.name || "Jugador destacado",
        team: displayMvp.team || (displayMvp.teamId === fixture.awayId || awayPlayers.some((player) => player.id === displayMvp.playerId) ? "away" : "home"),
      }
    : null;
  const summaryGoalEvents = mergedEvents.length > 0
    ? mergedEvents
    : finalChronicleEvents.filter((item) => item.kind === "goal").map((item) => item.data);
  const modalChronicleItems = buildMatchChronicleItems({
    events: mergedEvents,
    cards: mergedCards,
    highlights: mergedHighlights,
    substitutions: matchSubstitutions,
    moments: mergedKeyMoments,
  });
  const summaryTimelineEvents = modalChronicleItems.map(({ kind, minute, data }: any) => ({
    ...data,
    kind: kind === "sub" ? "substitution" : kind,
    type: kind === "card"
      ? (data.cardType === "red" || data.isSecondYellow ? "red_card" : "yellow_card")
      : data.type || kind,
    minute,
    team: data.team ?? data.teamSide,
    playerName: data.scorerName || data.playerName,
    playerInName: data.playerInName || data.inName,
    playerOutName: data.playerOutName || data.outName,
  }));

  // Las alineaciones guardadas contienen el XI inicial. Los ratings, en cambio,
  // también incluyen a los jugadores que entraron desde el banquillo. Separamos
  // ambos grupos por ID para que las notas no mezclen titulares y suplentes.
  const homeStarterIds = new Set<string>(homePlayers.slice(0, 11).map((p) => p.id));
  const awayStarterIds = new Set<string>(awayPlayers.slice(0, 11).map((p) => p.id));

  // Extra-time substitutions are stored in result.extraTime.substitutions in
  // addition to the top-level list in newer saves. Always merge both sources
  // here so a player who entered in minutes 91-120 is treated exactly like a
  // normal substitute in the match notes.
  const getSubstituteIds = (team: "home" | "away", starterIds: Set<string>) => {
    const ids = new Set<string>(
      matchSubstitutions
        .filter((s: any) => s.team === team)
        .map((s: any) => s.playerInId ?? s.inId)
        .filter(Boolean),
    );
    const ratings = team === "home" ? finalHomeRatings : finalAwayRatings;
    for (const rating of ratings) {
      if (!starterIds.has(rating.playerId)) ids.add(rating.playerId);
    }
    return ids;
  };

  const homeSubstituteIds = getSubstituteIds("home", homeStarterIds);
  const awaySubstituteIds = getSubstituteIds("away", awayStarterIds);

  // Some live/legacy matches calculate player ratings at the end of the 90
  // minutes and therefore never create a rating for a player who entered only
  // during extra time. Build a deterministic display rating for those players
  // so they cannot disappear from "Notas del partido - Suplentes".
  const buildMissingSubstituteRatings = (
    team: "home" | "away",
    ids: Set<string>,
    existing: typeof finalHomeRatings,
    teamId: string,
  ) => {
    const existingIds = new Set(existing.map((r) => r.playerId));
    const extras: any[] = [];
    for (const id of ids) {
      if (!id || existingIds.has(id)) continue;
      const player = store.getSimPlayer(id);
      if (!player) continue;
      const sub = matchSubstitutions
        .filter((s: any) => s.team === team)
        .map((s: any) => ({ ...s, playerInId: s.playerInId ?? s.inId }))
        .filter((s: any) => s.playerInId === id)
        .sort((a: any, b: any) => Number(a.minute ?? 120) - Number(b.minute ?? 120))[0];
      const enteredMinute = Number(sub?.minute ?? 91);
      const minutes = Math.max(1, 120 - enteredMinute);
      const base = Math.max(4.5, Math.min(8.5, 5.5 + (player.rating - 65) * 0.08));
      const rating = Math.round((base + (minutes / 30) * 0.1) * 10) / 10;
      extras.push({
        playerId: player.id,
        playerName: player.name,
        team,
        teamId,
        position: player.positions?.[0] || "MC",
        rating,
        goals: 0,
        assists: 0,
        saves: 0,
        yellow: 0,
        red: false,
        minutes,
      });
    }
    return extras;
  };

  const homeDisplayRatings = [
    ...finalHomeRatings,
    ...buildMissingSubstituteRatings("home", homeSubstituteIds, finalHomeRatings, fixture.homeId),
  ];
  const awayDisplayRatings = [
    ...finalAwayRatings,
    ...buildMissingSubstituteRatings("away", awaySubstituteIds, finalAwayRatings, fixture.awayId),
  ];

  return (
    <Dialog open={!!fixture} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-1rem)] min-w-0 max-w-4xl max-h-[90vh] overflow-x-hidden overflow-y-auto sm:w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3">
            <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={40} />
            <span className="text-2xl font-bold">
              {displayHomeGoals}
              {penalties && <span className="text-base font-bold"> ({penalties.homeGoals})</span>}
              {" - "}
              {penalties && <span className="text-base font-bold">({penalties.awayGoals}) </span>}
              {displayAwayGoals}
            </span>
            <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={40} />
            {decisionLabel && (
              <span className="text-sm font-normal text-muted-foreground">({decisionLabel})</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="stats" className="w-full min-w-0">
          <TabsList className="grid h-10 w-full min-w-0 grid-cols-5 items-stretch gap-1 overflow-hidden p-1">
            <TabsTrigger value="stats" className="h-full min-h-8 w-full min-w-0 whitespace-nowrap px-0.5 py-1 text-[10px] leading-none sm:px-2 sm:text-xs">
              <span className="sm:hidden">Estad.</span>
              <span className="hidden sm:inline">Estadísticas</span>
            </TabsTrigger>
            <TabsTrigger value="summary" className="h-full min-h-8 w-full min-w-0 whitespace-nowrap px-0.5 py-1 text-[10px] leading-none sm:px-2 sm:text-xs">Resumen</TabsTrigger>
            <TabsTrigger value="moments" className="h-full min-h-8 w-full min-w-0 whitespace-nowrap px-0.5 py-1 text-[10px] leading-none sm:px-2 sm:text-xs">Momentos</TabsTrigger>
            <TabsTrigger value="chronicle" className="h-full min-h-8 w-full min-w-0 whitespace-nowrap px-0.5 py-1 text-[10px] leading-none sm:px-2 sm:text-xs">Crónica</TabsTrigger>
            <TabsTrigger value="lineups" className="h-full min-h-8 w-full min-w-0 whitespace-nowrap px-0.5 py-1 text-[10px] leading-none sm:px-2 sm:text-xs">
              <span className="sm:hidden">Alineac.</span>
              <span className="hidden sm:inline">Alineaciones</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stats" className="space-y-6">
            {/* Match Info */}
            <div className="flex items-center justify-between text-sm text-muted-foreground border-b pb-4">
              <div>
                <span className="font-semibold text-foreground">{home.name}</span> vs {away.name}
              </div>
              <div>
                {fixture.competition === "league" && `Jornada ${fixture.matchday}`}
                {fixture.competition === "cup" && fixture.round}
                {fixture.competition === "ucl" && (fixture.round || "Fase de Liga")}
              </div>
            </div>

            {/* Detailed Stats */}
            {stats ? (
              <div className="space-y-4">
                {!hasStoredStats && (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
                    Este partido pertenece a un guardado antiguo sin estadísticas completas. Se muestran estimaciones estables a partir del resultado y los datos conservados.
                  </p>
                )}
                {/* Possession */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo
                        teamName={home.name}
                        leagueName={getLeagueName(home.league)}
                        size={24}
                      />
                      <span className="font-semibold">{stats.home.possession}%</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">Posesión</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{stats.away.possession}%</span>
                      <TeamLogo
                        teamName={away.name}
                        leagueName={getLeagueName(away.league)}
                        size={24}
                      />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{
                        width: `${stats.home.possession}%`,
                        backgroundColor: matchColors.homeColor,
                      }}
                    />
                    <div
                      className="h-full"
                      style={{
                        width: `${stats.away.possession}%`,
                        backgroundColor: matchColors.awayColor,
                      }}
                    />
                  </div>
                </div>

                {/* Shots */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo
                        teamName={home.name}
                        leagueName={getLeagueName(home.league)}
                        size={24}
                      />
                      <span className="font-semibold text-2xl">{stats.home.shots}</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">Tiros</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-2xl">{stats.away.shots}</span>
                      <TeamLogo
                        teamName={away.name}
                        leagueName={getLeagueName(away.league)}
                        size={24}
                      />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{
                        width: `${percentagePart(stats.home.shots, stats.away.shots)}%`,
                        backgroundColor: matchColors.homeColor,
                      }}
                    />
                    <div
                      className="h-full"
                      style={{
                        width: `${percentagePart(stats.away.shots, stats.home.shots)}%`,
                        backgroundColor: matchColors.awayColor,
                      }}
                    />
                  </div>
                </div>

                {/* Shots on Target */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo
                        teamName={home.name}
                        leagueName={getLeagueName(home.league)}
                        size={24}
                      />
                      <span className="font-semibold text-2xl">{stats.home.shotsOnTarget}</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">
                      Tiros a puerta
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-2xl">{stats.away.shotsOnTarget}</span>
                      <TeamLogo
                        teamName={away.name}
                        leagueName={getLeagueName(away.league)}
                        size={24}
                      />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{
                        width: `${percentagePart(stats.home.shotsOnTarget, stats.away.shotsOnTarget)}%`,
                        backgroundColor: matchColors.homeColor,
                      }}
                    />
                    <div
                      className="h-full"
                      style={{
                        width: `${percentagePart(stats.away.shotsOnTarget, stats.home.shotsOnTarget)}%`,
                        backgroundColor: matchColors.awayColor,
                      }}
                    />
                  </div>
                </div>

                {/* Corners */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo
                        teamName={home.name}
                        leagueName={getLeagueName(home.league)}
                        size={24}
                      />
                      <span className="font-semibold text-2xl">{stats.home.corners}</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">Córners</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-2xl">{stats.away.corners}</span>
                      <TeamLogo
                        teamName={away.name}
                        leagueName={getLeagueName(away.league)}
                        size={24}
                      />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{
                        width: `${percentagePart(stats.home.corners, stats.away.corners)}%`,
                        backgroundColor: matchColors.homeColor,
                      }}
                    />
                    <div
                      className="h-full"
                      style={{
                        width: `${percentagePart(stats.away.corners, stats.home.corners)}%`,
                        backgroundColor: matchColors.awayColor,
                      }}
                    />
                  </div>
                </div>

                {/* Fouls */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo
                        teamName={home.name}
                        leagueName={getLeagueName(home.league)}
                        size={24}
                      />
                      <span className="font-semibold text-2xl">{stats.home.fouls}</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">Faltas</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-2xl">{stats.away.fouls}</span>
                      <TeamLogo
                        teamName={away.name}
                        leagueName={getLeagueName(away.league)}
                        size={24}
                      />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{
                        width: `${percentagePart(stats.home.fouls, stats.away.fouls)}%`,
                        backgroundColor: matchColors.homeColor,
                      }}
                    />
                    <div
                      className="h-full"
                      style={{
                        width: `${percentagePart(stats.away.fouls, stats.home.fouls)}%`,
                        backgroundColor: matchColors.awayColor,
                      }}
                    />
                  </div>
                </div>

                {/* Offsides */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo
                        teamName={home.name}
                        leagueName={getLeagueName(home.league)}
                        size={24}
                      />
                      <span className="font-semibold text-2xl">{stats.home.offsides}</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">
                      Fueras de juego
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-2xl">{stats.away.offsides}</span>
                      <TeamLogo
                        teamName={away.name}
                        leagueName={getLeagueName(away.league)}
                        size={24}
                      />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{
                        width: `${percentagePart(stats.home.offsides, stats.away.offsides)}%`,
                        backgroundColor: matchColors.homeColor,
                      }}
                    />
                    <div
                      className="h-full"
                      style={{
                        width: `${percentagePart(stats.away.offsides, stats.home.offsides)}%`,
                        backgroundColor: matchColors.awayColor,
                      }}
                    />
                  </div>
                </div>

                {/* Pass Accuracy */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo
                        teamName={home.name}
                        leagueName={getLeagueName(home.league)}
                        size={24}
                      />
                      <span className="font-semibold">{stats.home.passAccuracy}%</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">
                      Precisión de pase
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{stats.away.passAccuracy}%</span>
                      <TeamLogo
                        teamName={away.name}
                        leagueName={getLeagueName(away.league)}
                        size={24}
                      />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{
                        width: `${stats.home.passAccuracy}%`,
                        backgroundColor: matchColors.homeColor,
                      }}
                    />
                    <div
                      className="h-full"
                      style={{
                        width: `${stats.away.passAccuracy}%`,
                        backgroundColor: matchColors.awayColor,
                      }}
                    />
                  </div>
                </div>

                {/* Saves */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo
                        teamName={home.name}
                        leagueName={getLeagueName(home.league)}
                        size={24}
                      />
                      <span className="font-semibold text-2xl">{stats.home.saves}</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">Paradas</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-2xl">{stats.away.saves}</span>
                      <TeamLogo
                        teamName={away.name}
                        leagueName={getLeagueName(away.league)}
                        size={24}
                      />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{
                        width: `${percentagePart(stats.home.saves, stats.away.saves)}%`,
                        backgroundColor: matchColors.homeColor,
                      }}
                    />
                    <div
                      className="h-full"
                      style={{
                        width: `${percentagePart(stats.away.saves, stats.home.saves)}%`,
                        backgroundColor: matchColors.awayColor,
                      }}
                    />
                  </div>
                </div>

                {/* xG */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo
                        teamName={home.name}
                        leagueName={getLeagueName(home.league)}
                        size={24}
                      />
                      <span className="font-semibold text-2xl">{stats.home.xg.toFixed(2)}</span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">xG en vivo</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-2xl">{stats.away.xg.toFixed(2)}</span>
                      <TeamLogo
                        teamName={away.name}
                        leagueName={getLeagueName(away.league)}
                        size={24}
                      />
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full"
                      style={{
                        width: `${percentagePart(stats.home.xg, stats.away.xg)}%`,
                        backgroundColor: matchColors.homeColor,
                      }}
                    />
                    <div
                      className="h-full"
                      style={{
                        width: `${percentagePart(stats.away.xg, stats.home.xg)}%`,
                        backgroundColor: matchColors.awayColor,
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                Las estadísticas detalladas no están disponibles para este partido
              </div>
            )}
          </TabsContent>

          <TabsContent value="summary" className="space-y-5">
            <MatchFinalSummary
              competition={matchCompetitionLabel}
              home={{
                id: fixture.homeId,
                name: home.name,
                short: home.short,
                leagueName: getLeagueName(home.league),
                formation: homeFormation,
              }}
              away={{
                id: fixture.awayId,
                name: away.name,
                short: away.short,
                leagueName: getLeagueName(away.league),
                formation: awayFormation,
              }}
              homeScore={displayHomeGoals}
              awayScore={displayAwayGoals}
              homeColor={matchColors.homeColor}
              awayColor={matchColors.awayColor}
              result={{
                ...result,
                mvp: summaryMvp,
                momentumUserSide: result.momentumUserSide ?? (fixture.homeId === save?.myTeamId ? "home" : "away"),
              }}
              goalEvents={summaryGoalEvents}
              timelineEvents={summaryTimelineEvents}
            />
          </TabsContent>

          <TabsContent value="moments" className="space-y-5">
            <div className="border-b border-border/60 pb-3">
              <h3 className="font-black">Momentos destacados</h3>
              <p className="mt-1 text-xs text-muted-foreground">Cada apartado está ordenado cronológicamente, del primer al último minuto.</p>
            </div>

            <section className="space-y-2">
              <h4 className="flex items-center gap-2 text-sm font-black"><span>⚽</span> Goles</h4>
              {goalMoments.length ? goalMoments.map((event: any, index: number) => {
                const scoringTeam = event.team === "home" ? home : away;
                const kind = event.type === "own_goal" ? "Gol en propia puerta" : event.type === "penalty_goal" ? "Gol de penalti" : event.type === "free_kick_goal" ? "Gol de falta directa" : "Gol";
                return <div key={`goal-moment-${index}`} className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2">
                  <span className="w-10 shrink-0 text-sm font-black text-primary">{formatMatchMinuteWithMark(event.minute, event)}</span>
                  <PlayerChronicleFace playerId={event.scorerId} playerName={event.scorerName} size={30} />
                  <TeamLogo teamName={scoringTeam.name} leagueName={getLeagueName(scoringTeam.league)} size={22} />
                  <div className="min-w-0 text-sm"><span className="font-bold">{event.scorerName || "Autor no registrado"}</span><span className="text-muted-foreground"> · {kind} · {scoringTeam.short}</span>{event.assistName && <div className="text-xs text-muted-foreground">Asistencia: {event.assistName}</div>}</div>
                </div>;
              }) : (displayHomeGoals + displayAwayGoals > 0
                ? <p className="rounded-lg border border-border/50 px-3 py-2 text-xs text-muted-foreground">El marcador refleja {displayHomeGoals + displayAwayGoals} gol(es), pero este registro antiguo no conserva sus autores ni minutos.</p>
                : <p className="text-xs text-muted-foreground">No hubo goles.</p>)}
            </section>

            <section className="space-y-2">
              <h4 className="flex items-center gap-2 text-sm font-black"><span>🥅</span> Al palo</h4>
              {woodworkMoments.length ? woodworkMoments.map((event: any, index: number) => {
                const eventTeam = event.team === "home" ? home : away;
                return <div key={`woodwork-${index}`} className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2"><span className="w-10 shrink-0 text-sm font-black text-primary">{formatMatchMinuteWithMark(event.minute, event)}</span><PlayerChronicleFace playerId={event.playerId} playerName={event.playerName} size={28}/><TeamLogo teamName={eventTeam.name} leagueName={getLeagueName(eventTeam.league)} size={22}/><div className="min-w-0 text-sm"><span className="font-bold">{event.playerName || "Jugador"}</span><span className="text-muted-foreground"> · {event.detail || "Remate al palo"} ({eventTeam.short})</span></div></div>;
              }) : <p className="text-xs text-muted-foreground">No se registraron remates al palo.</p>}
            </section>

            <section className="space-y-2">
              <h4 className="flex items-center gap-2 text-sm font-black"><span>🟨</span> Tarjetas</h4>
              {cardMoments.length ? cardMoments.map((card: any, index: number) => {
                const cardTeam = card.team === "home" ? home : away;
                const label = card.isSecondYellow ? "Segunda amarilla y expulsión" : card.cardType === "yellow" ? "Tarjeta amarilla" : "Tarjeta roja";
                return <div key={`card-moment-${index}`} className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2"><span className="w-10 shrink-0 text-sm font-black text-primary">{formatMatchMinuteWithMark(card.minute, card)}</span><span className={`h-4 w-3 shrink-0 rounded-sm ${card.cardType === "yellow" ? "bg-yellow-400" : "bg-red-500"}`}/><PlayerChronicleFace playerId={card.playerId} playerName={card.playerName} size={28}/><TeamLogo teamName={cardTeam.name} leagueName={getLeagueName(cardTeam.league)} size={22}/><div className="min-w-0 text-sm"><span className="font-bold">{card.playerName}</span><span className="text-muted-foreground"> · {label} ({cardTeam.short})</span>{card.reason && <div className="text-xs text-muted-foreground">{card.reason}</div>}</div></div>;
              }) : <p className="text-xs text-muted-foreground">No se mostraron tarjetas.</p>}
            </section>

            <section className="space-y-2">
              <h4 className="flex items-center gap-2 text-sm font-black"><span>🔄</span> Sustituciones</h4>
              {substitutionMoments.length ? substitutionMoments.map((sub: any, index: number) => {
                const subTeam = sub.team === "home" ? home : away;
                return <div key={`sub-moment-${index}`} className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2"><span className="w-10 shrink-0 text-sm font-black text-primary">{formatMatchMinuteWithMark(sub.minute, sub)}</span><div className="flex shrink-0 -space-x-2"><PlayerChronicleFace playerId={sub.playerInId ?? sub.inId} playerName={sub.playerInName ?? sub.inName} size={28}/><PlayerChronicleFace playerId={sub.playerOutId ?? sub.outId} playerName={sub.playerOutName ?? sub.outName} size={26}/></div><TeamLogo teamName={subTeam.name} leagueName={getLeagueName(subTeam.league)} size={22}/><div className="min-w-0 text-sm"><span className="font-bold text-primary">{sub.playerInName ?? sub.inName ?? "Entra"}</span><span className="text-muted-foreground"> por </span><span className="font-semibold text-destructive">{sub.playerOutName ?? sub.outName ?? "Sale"}</span><span className="text-muted-foreground"> ({subTeam.short})</span></div></div>;
              }) : <p className="text-xs text-muted-foreground">No se registraron sustituciones.</p>}
            </section>

            <section className="space-y-2">
              <h4 className="flex items-center gap-2 text-sm font-black"><span>🚑</span> Incidencias</h4>
              {incidentMoments.length ? incidentMoments.map((event: any, index: number) => {
                const eventTeam = event.team === "home" ? home : away;
                const meta = KEEP[event.type] || { icon: "⚠️", label: "Incidencia" };
                const label = event.type === "penalty_conceded" ? "Penalti cometido" : meta.label;
                return <div key={`incident-${index}`} className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2"><span className="w-10 shrink-0 text-sm font-black text-primary">{formatMatchMinuteWithMark(event.minute, event)}</span><span className="w-6 shrink-0 text-center">{meta.icon}</span>{event.playerId && <PlayerChronicleFace playerId={event.playerId} playerName={event.playerName} size={28}/>}<TeamLogo teamName={eventTeam.name} leagueName={getLeagueName(eventTeam.league)} size={22}/><div className="min-w-0 text-sm"><span className="font-bold">{event.playerName || label}</span><span className="text-muted-foreground"> · {event.detail || label} ({eventTeam.short})</span>{event.weeks && <div className="text-xs text-muted-foreground">Baja estimada: {event.weeks} semana(s)</div>}</div></div>;
              }) : <p className="text-xs text-muted-foreground">No se registraron lesiones, penaltis cometidos ni otras incidencias.</p>}
            </section>
          </TabsContent>

          <TabsContent value="chronicle" className="mt-2 w-full min-w-0 max-w-full space-y-6 overflow-x-hidden">
            {/* Match Info */}
            <div className="flex items-center justify-between text-sm text-muted-foreground border-b pb-4">
              <div>
                <span className="font-semibold text-foreground">{home.name}</span> vs {away.name}
              </div>
              <div>
                {fixture.competition === "league" && `Jornada ${fixture.matchday}`}
                {fixture.competition === "cup" && fixture.round}
                {fixture.competition === "ucl" && (fixture.round || "Fase de Liga")}
              </div>
            </div>

            {/* La misma crónica compartida con el partido en directo */}
            <div className="space-y-4">
              <h3 className="font-bold flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Crónica del partido
              </h3>
              <MatchChronicle
                home={home}
                away={away}
                events={mergedEvents}
                cards={[
                  ...mergedCards,
                ]}
                highlights={mergedHighlights}
                substitutions={matchSubstitutions}
                moments={mergedKeyMoments}
                className="w-full min-w-0 max-w-full space-y-0.5 max-h-96 overflow-x-hidden overflow-y-auto pr-1"
                emptyMessage="Sin eventos registrados"
              />
            </div>

            {/* Tanda de penaltis */}
            {penalties && (
              <div className="space-y-3">
                <h3 className="font-bold flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Tanda de penaltis · {penalties.homeGoals} - {penalties.awayGoals}
                </h3>
                {penalties.shootout && penalties.shootout.length > 0 ? (
                  <div className="space-y-1">
                    {(() => {
                      let h = 0;
                      let a = 0;
                      return penalties.shootout.map((shot, i) => {
                        if (shot.scored) {
                          if (shot.team === "home") h += 1;
                          else a += 1;
                        }
                        const shotTeam = shot.team === "home" ? home : away;
                        const shooter = shot.playerId
                          ? store.getSimPlayer(shot.playerId)
                          : undefined;
                        return (
                          <div
                            key={`pen-${i}`}
                            className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0"
                          >
                            <span className="text-sm text-muted-foreground font-bold w-10">
                              {i + 1}
                            </span>
                            <span className="text-base w-5 text-center shrink-0">
                              {shot.scored ? "✅" : "❌"}
                            </span>
                            <PlayerChronicleFace
                              playerId={shot.playerId}
                              playerName={shooter?.name}
                              size={30}
                            />
                            <TeamLogo
                              teamName={shotTeam.name}
                              leagueName={getLeagueName(shotTeam.league)}
                              size={22}
                            />
                            <div className="text-sm min-w-0 truncate">
                              <span className="font-bold">{shooter?.name || "Jugador"}</span>
                              <span className="text-muted-foreground">
                                {" "}
                                · {shot.scored ? "Gol" : "Fallado"} ({shotTeam.short})
                              </span>
                            </div>
                            <span className="ml-auto text-sm font-bold tabular-nums">
                              {h} - {a}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    No se guardó el detalle de los lanzamientos de este partido.
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="lineups">
            <div className="space-y-6">
              {/* Match Info */}
              <div className="flex items-center justify-between text-sm text-muted-foreground border-b pb-4">
                <div>
                  <span className="font-semibold text-foreground">{home.name}</span> vs {away.name}
                </div>
                <div>
                  {fixture.competition === "league" && `Jornada ${fixture.matchday}`}
                  {fixture.competition === "cup" && fixture.round}
                  {fixture.competition === "ucl" && (fixture.round || "Fase de Liga")}
                </div>
              </div>

              {/* MVP */}
              {displayMvp && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <Star className="w-5 h-5 text-yellow-500" />
                    <div>
                      <div className="font-bold text-yellow-700">MVP del partido</div>
                      <div className="text-sm">
                        {(() => {
                          const player = store.getSimPlayer(displayMvp.playerId);
                          return player
                            ? `${player.name} (${displayMvp.rating.toFixed(1)})`
                            : "N/A";
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Lineups */}
              {homePlayers.length > 0 && awayPlayers.length > 0 ? (
                <div className="grid grid-cols-2 gap-6">
                  {/* Home Team Lineup */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <TeamLogo
                        teamName={home.name}
                        leagueName={getLeagueName(home.league)}
                        size={32}
                      />
                      <div>
                        <h3 className="font-bold">{home.name}</h3>
                        <p className="text-sm text-muted-foreground">Titulares y suplentes</p>
                      </div>
                    </div>
                    <MiniPitch
                      startingXI={homePlayers.slice(0, 11)}
                      formation={homeFormation}
                      teamId={fixture.homeId}
                      cards={result.cards || []}
                      ratings={finalHomeRatings}
                      goals={displayEvents}
                      assists={displayEvents}
                      mvp={displayMvp?.playerId}
                      injuries={result.injuries || []}
                      substitutions={result.substitutions || []}
                    />

                    {/* Player Ratings - Starters */}
                    <div className="mt-4">
                      <h4 className="text-sm font-semibold mb-2">Notas del partido - Titulares</h4>
                      <div className="space-y-1">
                        {finalHomeRatings
                          .filter((rating) => homeStarterIds.has(rating.playerId))
                          .slice()
                          .sort((a, b) => b.rating - a.rating)
                          .map((rating) => {
                            const player = store.getSimPlayer(rating.playerId);
                            const isMvp = displayMvp?.playerId === rating.playerId;
                            const substitution = matchSubstitutions.find(
                              (s: any) => s.team === "home" && (s.playerOutId ?? s.outId) === rating.playerId,
                            );
                            return (
                              <div
                                key={rating.playerId}
                                className="text-sm flex items-center justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  {isMvp && <Star className="w-3 h-3 text-yellow-500" />}
                                  <TeamLogo
                                    teamName={home.name}
                                    leagueName={getLeagueName(home.league)}
                                    size={16}
                                  />
                                  <span className="font-medium">
                                    {player?.name || "Desconocido"}
                                  </span>
                                  {substitution && (
                                    <span className="text-xs text-muted-foreground">
                                      (salida {formatMatchMinuteWithMark(substitution.minute, substitution)})
                                    </span>
                                  )}
                                </div>
                                <span
                                  className={`font-bold ${rating.rating >= 7 ? "text-green-600" : rating.rating >= 5 ? "text-yellow-600" : "text-red-600"}`}
                                >
                                  {rating.rating.toFixed(1)}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>

                    {/* Player Ratings - Substitutes */}
                    <div className="mt-4">
                      <h4 className="text-sm font-semibold mb-2">Notas del partido - Suplentes</h4>
                      <div className="space-y-1">
                        {homeDisplayRatings
                          .filter((rating) => homeSubstituteIds.has(rating.playerId))
                          .slice()
                          .sort((a, b) => b.rating - a.rating)
                          .map((rating) => {
                            const player = store.getSimPlayer(rating.playerId);
                            const isMvp = displayMvp?.playerId === rating.playerId;
                            const substitution = matchSubstitutions.find(
                              (s: any) => s.team === "home" && (s.playerInId ?? s.inId) === rating.playerId,
                            );
                            return (
                              <div
                                key={rating.playerId}
                                className="text-sm flex items-center justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  {isMvp && <Star className="w-3 h-3 text-yellow-500" />}
                                  <TeamLogo
                                    teamName={home.name}
                                    leagueName={getLeagueName(home.league)}
                                    size={16}
                                  />
                                  <span className="font-medium">
                                    {player?.name || "Desconocido"}
                                  </span>
                                  {substitution && (
                                    <span className="text-xs text-muted-foreground">
                                      ({formatMatchMinuteWithMark(substitution.minute, substitution)})
                                    </span>
                                  )}
                                </div>
                                <span
                                  className={`font-bold ${rating.rating >= 7 ? "text-green-600" : rating.rating >= 5 ? "text-yellow-600" : "text-red-600"}`}
                                >
                                  {rating.rating.toFixed(1)}
                                </span>
                              </div>
                            );
                          })}
                        {!Array.from(homeSubstituteIds).some((id) =>
                          homeDisplayRatings.some((rating) => rating.playerId === id),
                        ) && (
                          <p className="text-sm text-muted-foreground">Sin notas de suplentes.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Away Team Lineup */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <TeamLogo
                        teamName={away.name}
                        leagueName={getLeagueName(away.league)}
                        size={32}
                      />
                      <div>
                        <h3 className="font-bold">{away.name}</h3>
                        <p className="text-sm text-muted-foreground">Titulares y suplentes</p>
                      </div>
                    </div>
                    <MiniPitch
                      startingXI={awayPlayers.slice(0, 11)}
                      formation={awayFormation}
                      teamId={fixture.awayId}
                      cards={result.cards || []}
                      ratings={finalAwayRatings}
                      goals={displayEvents}
                      assists={displayEvents}
                      mvp={displayMvp?.playerId}
                      injuries={result.injuries || []}
                      substitutions={result.substitutions || []}
                    />

                    {/* Player Ratings - Starters */}
                    <div className="mt-4">
                      <h4 className="text-sm font-semibold mb-2">Notas del partido - Titulares</h4>
                      <div className="space-y-1">
                        {finalAwayRatings
                          .filter((rating) => awayStarterIds.has(rating.playerId))
                          .slice()
                          .sort((a, b) => b.rating - a.rating)
                          .map((rating) => {
                            const player = store.getSimPlayer(rating.playerId);
                            const isMvp = displayMvp?.playerId === rating.playerId;
                            const substitution = matchSubstitutions.find(
                              (s: any) => s.team === "away" && (s.playerOutId ?? s.outId) === rating.playerId,
                            );
                            return (
                              <div
                                key={rating.playerId}
                                className="text-sm flex items-center justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  {isMvp && <Star className="w-3 h-3 text-yellow-500" />}
                                  <TeamLogo
                                    teamName={away.name}
                                    leagueName={getLeagueName(away.league)}
                                    size={16}
                                  />
                                  <span className="font-medium">
                                    {player?.name || "Desconocido"}
                                  </span>
                                  {substitution && (
                                    <span className="text-xs text-muted-foreground">
                                      (salida {formatMatchMinuteWithMark(substitution.minute, substitution)})
                                    </span>
                                  )}
                                </div>
                                <span
                                  className={`font-bold ${rating.rating >= 7 ? "text-green-600" : rating.rating >= 5 ? "text-yellow-600" : "text-red-600"}`}
                                >
                                  {rating.rating.toFixed(1)}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>

                    {/* Player Ratings - Substitutes */}
                    <div className="mt-4">
                      <h4 className="text-sm font-semibold mb-2">Notas del partido - Suplentes</h4>
                      <div className="space-y-1">
                        {awayDisplayRatings
                          .filter((rating) => awaySubstituteIds.has(rating.playerId))
                          .slice()
                          .sort((a, b) => b.rating - a.rating)
                          .map((rating) => {
                            const player = store.getSimPlayer(rating.playerId);
                            const isMvp = displayMvp?.playerId === rating.playerId;
                            const substitution = matchSubstitutions.find(
                              (s: any) => s.team === "away" && (s.playerInId ?? s.inId) === rating.playerId,
                            );
                            return (
                              <div
                                key={rating.playerId}
                                className="text-sm flex items-center justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  {isMvp && <Star className="w-3 h-3 text-yellow-500" />}
                                  <TeamLogo
                                    teamName={away.name}
                                    leagueName={getLeagueName(away.league)}
                                    size={16}
                                  />
                                  <span className="font-medium">
                                    {player?.name || "Desconocido"}
                                  </span>
                                  {substitution && (
                                    <span className="text-xs text-muted-foreground">
                                      ({formatMatchMinuteWithMark(substitution.minute, substitution)})
                                    </span>
                                  )}
                                </div>
                                <span
                                  className={`font-bold ${rating.rating >= 7 ? "text-green-600" : rating.rating >= 5 ? "text-yellow-600" : "text-red-600"}`}
                                >
                                  {rating.rating.toFixed(1)}
                                </span>
                              </div>
                            );
                          })}
                        {!Array.from(awaySubstituteIds).some((id) =>
                          awayDisplayRatings.some((rating) => rating.playerId === id),
                        ) && (
                          <p className="text-sm text-muted-foreground">Sin notas de suplentes.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  Las alineaciones no están disponibles para este partido
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
