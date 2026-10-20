import {
  getPrimaryLeagueForCountry,
  getTeamLeagueId,
  LEAGUES,
} from "@/data/teams";
import type { SaveGame } from "@/lib/store";
import { selectEuropeanParticipants } from "./europeanQualification";
import { DEFAULT_PROMOTION_PYRAMIDS } from "./promotionRelegationCore";

export type LeagueZoneKind =
  | "champions"
  | "europa"
  | "conference"
  | "promotion"
  | "promotion-playoff"
  | "relegation"
  | "relegation-playoff";

export const LEAGUE_ZONE_PRESENTATION: Record<LeagueZoneKind, {
  label: string;
  shortLabel: string;
  borderClass: string;
  badgeClass: string;
  dotClass: string;
}> = {
  champions: {
    label: "Champions League",
    shortLabel: "UCL",
    borderClass: "border-l-sky-500",
    badgeClass: "bg-sky-500/15 text-sky-300",
    dotClass: "bg-sky-500",
  },
  europa: {
    label: "Europa League",
    shortLabel: "UEL",
    borderClass: "border-l-amber-500",
    badgeClass: "bg-amber-500/15 text-amber-300",
    dotClass: "bg-amber-500",
  },
  conference: {
    label: "Conference League",
    shortLabel: "UECL",
    borderClass: "border-l-emerald-500",
    badgeClass: "bg-emerald-500/15 text-emerald-300",
    dotClass: "bg-emerald-500",
  },
  promotion: {
    label: "Ascenso directo",
    shortLabel: "↑",
    borderClass: "border-l-emerald-500",
    badgeClass: "bg-emerald-500/15 text-emerald-300",
    dotClass: "bg-emerald-500",
  },
  "promotion-playoff": {
    label: "Playoff de ascenso",
    shortLabel: "PO↑",
    borderClass: "border-l-lime-500",
    badgeClass: "bg-lime-500/15 text-lime-300",
    dotClass: "bg-lime-500",
  },
  relegation: {
    label: "Descenso directo",
    shortLabel: "↓",
    borderClass: "border-l-destructive",
    badgeClass: "bg-destructive/15 text-destructive",
    dotClass: "bg-destructive",
  },
  "relegation-playoff": {
    label: "Playoff de permanencia",
    shortLabel: "PO↓",
    borderClass: "border-l-orange-500",
    badgeClass: "bg-orange-500/15 text-orange-300",
    dotClass: "bg-orange-500",
  },
};

const ZONE_ORDER: LeagueZoneKind[] = [
  "champions",
  "europa",
  "conference",
  "promotion",
  "promotion-playoff",
  "relegation-playoff",
  "relegation",
];

type StandingTeam = { teamId: string };
export type LeaguePositionZoneMap = Map<string, LeagueZoneKind[]>;

function addZone(zones: LeaguePositionZoneMap, teamId: string, kind: LeagueZoneKind): void {
  const existing = zones.get(teamId) ?? [];
  if (!existing.includes(kind)) zones.set(teamId, [...existing, kind]);
}

/**
 * Calculates the current projected qualification/movement zones for one table.
 * European places are sourced from the same qualification engine as the
 * season rollover; promotions/relegations come from the configured pyramids.
 * A team can carry more than one status (e.g. a cup winner sitting in a drop
 * zone), so callers should not collapse this map to a single category.
 */
export function getLeaguePositionZones(
  save: SaveGame,
  leagueId: string,
  standings: readonly StandingTeam[],
): LeaguePositionZoneMap {
  const zones: LeaguePositionZoneMap = new Map();
  const rankedIds = standings.map((row) => row.teamId);

  const league = LEAGUES[leagueId];
  const primaryLeague = league?.country ? getPrimaryLeagueForCountry(league.country) : undefined;
  if (league && primaryLeague === leagueId) {
    try {
      const european = selectEuropeanParticipants(save);
      // Colorear rangos de puestos, no los clubes que casualmente aparecen en
      // las listas europeas actuales. El número de plazas por competición se
      // calcula para esta liga y luego se aplica a las posiciones de la tabla.
      const participantsForLeague = (ids: readonly string[]) => ids.filter((teamId) => {
        const override = save.teamLeagueOverrides?.[teamId];
        if (override) return override === leagueId;
        // Los participantes de primera división se identifican por su liga
        // base; los cambios de categoría se resuelven mediante overrides.
        return getTeamLeagueId(teamId, save) === leagueId;
      }).length;
      const uclCount = participantsForLeague(european.ucl);
      const uelCount = participantsForLeague(european.uel);
      const ueclCount = participantsForLeague(european.uecl);
      let position = 0;
      for (let i = 0; i < Math.min(uclCount, rankedIds.length); i += 1) {
        addZone(zones, rankedIds[position++], "champions");
      }
      for (let i = 0; i < Math.min(uelCount, rankedIds.length - position); i += 1) {
        addZone(zones, rankedIds[position++], "europa");
      }
      for (let i = 0; i < Math.min(ueclCount, rankedIds.length - position); i += 1) {
        addZone(zones, rankedIds[position++], "conference");
      }
    } catch (error) {
      console.warn("No se pudieron calcular las plazas europeas de la tabla:", error);
    }
  }

  const pyramid = DEFAULT_PROMOTION_PYRAMIDS.find((entry) => entry.leagueIds.includes(leagueId));
  if (!pyramid || rankedIds.length === 0) return zones;

  const pyramidIndex = pyramid.leagueIds.indexOf(leagueId);
  // In a lower tier, the first two go up directly. The following places are
  // playoff positions; Germany/France use 3rd place against the upper-tier
  // survival-playoff club instead of a four-team promotion playoff.
  if (pyramidIndex > 0) {
    const directPromotionCount = Math.min(2, rankedIds.length);
    for (let index = 0; index < directPromotionCount; index += 1) {
      addZone(zones, rankedIds[index], "promotion");
    }

    const playoffCount = pyramid.mode === "promotion-playoff"
      ? Math.min(pyramid.playoffCandidates ?? 4, Math.max(0, rankedIds.length - directPromotionCount))
      : Math.min(1, Math.max(0, rankedIds.length - directPromotionCount));
    for (let index = directPromotionCount; index < directPromotionCount + playoffCount; index += 1) {
      addZone(zones, rankedIds[index], "promotion-playoff");
    }
  }

  // For divisions that feed a lower tier, mirror the configured actual movement
  // rules: three automatic relegations in Spain/England/Italy, and two plus a
  // survival playoff in Germany/France.
  if (pyramidIndex < pyramid.leagueIds.length - 1) {
    const directRelegationCount = pyramid.mode === "promotion-playoff" ? 3 : 2;
    const relegationStart = Math.max(0, rankedIds.length - directRelegationCount);
    for (let index = relegationStart; index < rankedIds.length; index += 1) {
      addZone(zones, rankedIds[index], "relegation");
    }
    if (pyramid.mode === "relegation-playoff" && rankedIds.length >= 3) {
      addZone(zones, rankedIds[rankedIds.length - 3], "relegation-playoff");
    }
  }

  return zones;
}

export function orderedLeagueZoneKinds(zones: LeaguePositionZoneMap): LeagueZoneKind[] {
  const present = new Set<LeagueZoneKind>();
  for (const kinds of zones.values()) for (const kind of kinds) present.add(kind);
  return ZONE_ORDER.filter((kind) => present.has(kind));
}

/** The most important row edge when a team qualifies for one place but is also in a movement zone. */
export function primaryLeagueZone(kinds: readonly LeagueZoneKind[]): LeagueZoneKind | null {
  const priority: LeagueZoneKind[] = [
    "relegation",
    "relegation-playoff",
    "promotion",
    "promotion-playoff",
    "champions",
    "europa",
    "conference",
  ];
  return priority.find((kind) => kinds.includes(kind)) ?? null;
}
