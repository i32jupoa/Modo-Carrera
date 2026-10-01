import type { Player } from "@/data/players";
import type { SquadRole } from "@/lib/transfers/types";

export const SQUAD_ROLE_LABELS: Record<SquadRole, string> = {
  star: "Estrella",
  starter: "Titular",
  rotation: "Rotación",
  secondary: "Secundario",
  prospect: "Promesa",
};

export const SQUAD_ROLE_CONFIG = {
  starFraction: 0.08,
  starterFraction: 0.40,
  rotationFraction: 0.24,
  maxStars: 3,
  minStars: 1,
  minStarOvrLead: 2,
  prospectMaxAge: 21,
  prospectPotentialGap: 6,
  prospectRelativeOvrMax: -3,
} as const;

export type SquadRoleContext = {
  typicalXIIds?: ReadonlySet<string>;
  negotiatedRole?: SquadRole;
};

function groupOf(player: Player): "GK" | "DEF" | "MID" | "ATT" {
  const positions = player.positions ?? [];
  if (positions.includes("GK")) return "GK";
  if (positions.some((p) => ["DFC", "LD", "LI"].includes(p))) return "DEF";
  if (positions.some((p) => ["MCD", "MC", "MCO", "MD", "MI"].includes(p))) return "MID";
  return "ATT";
}

function positionalRank(player: Player, squad: readonly Player[]): number {
  const group = groupOf(player);
  const sameGroup = squad
    .filter((candidate) => groupOf(candidate) === group)
    .sort((a, b) => b.rating - a.rating || b.potential - a.potential || a.id.localeCompare(b.id));
  const index = sameGroup.findIndex((candidate) => candidate.id === player.id);
  return index < 0 ? sameGroup.length : index + 1;
}

function positionalPercentile(player: Player, squad: readonly Player[]): number {
  const group = groupOf(player);
  const sameGroup = squad.filter((candidate) => groupOf(candidate) === group).length;
  const rank = positionalRank(player, squad);
  return sameGroup <= 1 ? 1 : 1 - (rank - 1) / (sameGroup - 1);
}

function score(player: Player, squad: readonly Player[], typicalXIIds: ReadonlySet<string>): number {
  const avgOvr = squad.reduce((sum, candidate) => sum + candidate.rating, 0) / Math.max(1, squad.length);
  const relativeOvr = player.rating - avgOvr;
  return (
    relativeOvr * 1.55 +
    positionalPercentile(player, squad) * 7 +
    (typicalXIIds.has(player.id) ? 3 : 0)
  );
}

/**
 * Deterministic role assignment for one squad. Negotiated roles always win.
 * The percentile/count approach gives smaller clubs a local "star" too.
 */
export function computeSquadRole(
  player: Player,
  squad: readonly Player[],
  context: SquadRoleContext = {},
): SquadRole {
  if (context.negotiatedRole) return context.negotiatedRole;
  if (squad.length === 0) return "secondary";

  const typicalXIIds = context.typicalXIIds ?? new Set<string>();
  const ranked = squad
    .map((candidate) => ({ id: candidate.id, score: score(candidate, squad, typicalXIIds), rating: candidate.rating }))
    .sort((a, b) => b.score - a.score || b.rating - a.rating || a.id.localeCompare(b.id));
  const rank = Math.max(0, ranked.findIndex((entry) => entry.id === player.id));

  const starCount = Math.min(
    SQUAD_ROLE_CONFIG.maxStars,
    Math.max(SQUAD_ROLE_CONFIG.minStars, Math.round(squad.length * SQUAD_ROLE_CONFIG.starFraction)),
  );
  const starterCount = Math.min(11, Math.max(8, Math.round(squad.length * SQUAD_ROLE_CONFIG.starterFraction)));
  const rotationCount = Math.min(7, Math.max(5, Math.round(squad.length * SQUAD_ROLE_CONFIG.rotationFraction)));

  const topPlayer = ranked[0] ? squad.find((candidate) => candidate.id === ranked[0].id) : undefined;
  const topLead = !!topPlayer && player.rating >= topPlayer.rating - SQUAD_ROLE_CONFIG.minStarOvrLead;
  if (rank < starCount && topLead) return "star";

  const avgOvr = squad.reduce((sum, candidate) => sum + candidate.rating, 0) / squad.length;
  const relativeOvr = player.rating - avgOvr;
  const potentialGap = player.potential - player.rating;
  const youngProspect =
    player.age <= SQUAD_ROLE_CONFIG.prospectMaxAge &&
    potentialGap >= SQUAD_ROLE_CONFIG.prospectPotentialGap &&
    relativeOvr <= SQUAD_ROLE_CONFIG.prospectRelativeOvrMax;

  if (rank < starCount + starterCount) return "starter";
  if (rank < starCount + starterCount + rotationCount) return "rotation";
  if (youngProspect) return "prospect";
  return "secondary";
}

export function assignSquadRoles(
  squad: readonly Player[],
  typicalXIIds: ReadonlySet<string>,
  negotiatedRoles: ReadonlyMap<string, SquadRole> = new Map(),
): Record<string, SquadRole> {
  const roles: Record<string, SquadRole> = {};
  for (const player of squad) {
    roles[player.id] = computeSquadRole(player, squad, {
      typicalXIIds,
      negotiatedRole: negotiatedRoles.get(player.id),
    });
  }
  return roles;
}
