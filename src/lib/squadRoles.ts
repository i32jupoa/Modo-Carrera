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

type PositionGroup = "GK" | "DEF" | "MID" | "ATT";

const DEFAULT_STARTING_SHAPE: Record<PositionGroup, number> = {
  GK: 1,
  DEF: 4,
  MID: 4,
  ATT: 2,
};

const STARTING_SHAPE_MIN: Record<PositionGroup, number> = {
  GK: 1,
  DEF: 3,
  MID: 3,
  ATT: 2,
};

const STARTING_SHAPE_MAX: Record<PositionGroup, number> = {
  GK: 1,
  DEF: 5,
  MID: 5,
  ATT: 4,
};

export type SquadRoleContext = {
  typicalXIIds?: ReadonlySet<string>;
  negotiatedRole?: SquadRole;
};

function groupOf(player: Player): PositionGroup {
  const positions = player.positions ?? [];
  if (positions.includes("GK")) return "GK";
  if (positions.some((p) => ["DFC", "LD", "LI"].includes(p))) return "DEF";
  if (positions.some((p) => ["MCD", "MC", "MCO", "MD", "MI"].includes(p))) return "MID";
  return "ATT";
}

function positionGroups(squad: readonly Player[]): Record<PositionGroup, Player[]> {
  return squad.reduce<Record<PositionGroup, Player[]>>(
    (acc, player) => {
      acc[groupOf(player)].push(player);
      return acc;
    },
    { GK: [], DEF: [], MID: [], ATT: [] },
  );
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
  // La media sigue siendo importante, pero siempre se compara dentro de su
  // propia demarcación. Así un delantero bueno no ocupa automáticamente la
  // plaza de titular de un centrocampista simplemente por tener más OVR.
  return (
    player.rating * 1.55 +
    positionalPercentile(player, squad) * 7 +
    (typicalXIIds.has(player.id) ? 3 : 0)
  );
}

function normalizeStartingShape(
  typicalXIIds: ReadonlySet<string>,
  squad: readonly Player[],
): Record<PositionGroup, number> {
  const groups = positionGroups(squad);
  const byGroup: Record<PositionGroup, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const player of squad) {
    if (typicalXIIds.has(player.id)) byGroup[groupOf(player)] += 1;
  }

  const typicalCount = Object.values(byGroup).reduce((sum, count) => sum + count, 0);
  const usableLineup = typicalCount === 11;
  const activeNonGoalkeeperGroups = (["DEF", "MID", "ATT"] as const).filter((group) => groups[group].length > 0);

  const shape: Record<PositionGroup, number> = usableLineup
    ? { ...byGroup }
    : { ...DEFAULT_STARTING_SHAPE };

  // Sin portero disponible, no reservamos una plaza imposible. En plantillas
  // artificiales de tests con una sola línea activa también dejamos que esa
  // línea absorba el once completo; en una plantilla real se aplican los
  // límites tácticos normales de 3-5 defensas, 3-5 medios y 2-4 atacantes.
  shape.GK = groups.GK.length > 0 ? 1 : 0;
  for (const group of ["DEF", "MID", "ATT"] as const) {
    const max = activeNonGoalkeeperGroups.length <= 1 ? 10 : STARTING_SHAPE_MAX[group];
    shape[group] = Math.max(0, Math.min(max, shape[group], groups[group].length));
    if (groups[group].length === 0) shape[group] = 0;
    if (usableLineup && byGroup[group] > 0) {
      shape[group] = Math.max(STARTING_SHAPE_MIN[group], Math.min(max, byGroup[group], groups[group].length));
    }
  }

  let total = shape.GK + shape.DEF + shape.MID + shape.ATT;
  const targetTotal = usableLineup
    ? Math.min(11, squad.length)
    : Math.min(13, Math.max(3, Math.round(squad.length * (SQUAD_ROLE_CONFIG.starFraction + SQUAD_ROLE_CONFIG.starterFraction))));

  while (total > targetTotal) {
    const candidates = (Object.keys(shape) as PositionGroup[])
      .filter((group) => group !== "GK" && shape[group] > 0)
      .sort((a, b) => shape[b] - shape[a]);
    const group = candidates[0];
    if (!group) break;
    const floor = activeNonGoalkeeperGroups.length <= 1 ? 0 : STARTING_SHAPE_MIN[group];
    if (shape[group] <= floor) break;
    shape[group] -= 1;
    total -= 1;
  }

  while (total < targetTotal) {
    const candidates = (Object.keys(shape) as PositionGroup[])
      .filter((group) => groups[group].length > shape[group])
      .sort((a, b) => {
        const maxA = a === "GK" ? 1 : activeNonGoalkeeperGroups.length <= 1 ? 10 : STARTING_SHAPE_MAX[a];
        const maxB = b === "GK" ? 1 : activeNonGoalkeeperGroups.length <= 1 ? 10 : STARTING_SHAPE_MAX[b];
        const roomA = Math.max(0, Math.min(maxA, groups[a].length) - shape[a]);
        const roomB = Math.max(0, Math.min(maxB, groups[b].length) - shape[b]);
        return roomB - roomA;
      });
    const group = candidates[0];
    if (!group) break;
    const max = group === "GK" ? 1 : activeNonGoalkeeperGroups.length <= 1 ? 10 : STARTING_SHAPE_MAX[group];
    if (shape[group] >= max) {
      // Todas las líneas activas ya están en su máximo táctico; no forzamos
      // un once imposible solo para llegar a 11.
      const fallback = candidates.find((candidate) => shape[candidate] < Math.min(max, groups[candidate].length));
      if (!fallback) break;
      shape[fallback] += 1;
    } else {
      shape[group] += 1;
    }
    total += 1;
  }

  return shape;
}

function countNegotiatedCore(
  squad: readonly Player[],
  negotiatedRoles: ReadonlyMap<string, SquadRole>,
): Record<PositionGroup, number> {
  const counts: Record<PositionGroup, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const player of squad) {
    const role = negotiatedRoles.get(player.id);
    if (role === "star" || role === "starter") counts[groupOf(player)] += 1;
  }
  return counts;
}

function countNegotiatedRotation(
  squad: readonly Player[],
  negotiatedRoles: ReadonlyMap<string, SquadRole>,
): Record<PositionGroup, number> {
  const counts: Record<PositionGroup, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const player of squad) {
    if (negotiatedRoles.get(player.id) === "rotation") counts[groupOf(player)] += 1;
  }
  return counts;
}

function rankedByGroup(
  squad: readonly Player[],
  typicalXIIds: ReadonlySet<string>,
): Record<PositionGroup, Player[]> {
  const groups = positionGroups(squad);
  for (const group of Object.keys(groups) as PositionGroup[]) {
    groups[group].sort(
      (a, b) => score(b, squad, typicalXIIds) - score(a, squad, typicalXIIds) || b.rating - a.rating || a.id.localeCompare(b.id),
    );
  }
  return groups;
}

function starCountForSquad(squad: readonly Player[]): number {
  return Math.min(
    SQUAD_ROLE_CONFIG.maxStars,
    Math.max(SQUAD_ROLE_CONFIG.minStars, Math.round(squad.length * SQUAD_ROLE_CONFIG.starFraction)),
  );
}

function isYoungProspect(player: Player, squad: readonly Player[]): boolean {
  const avgOvr = squad.reduce((sum, candidate) => sum + candidate.rating, 0) / Math.max(1, squad.length);
  const relativeOvr = player.rating - avgOvr;
  const potentialGap = player.potential - player.rating;
  return (
    player.age <= SQUAD_ROLE_CONFIG.prospectMaxAge &&
    potentialGap >= SQUAD_ROLE_CONFIG.prospectPotentialGap &&
    relativeOvr <= SQUAD_ROLE_CONFIG.prospectRelativeOvrMax
  );
}

/**
 * Determina el rol individual respetando siempre una condición negociada.
 * Para los roles automáticos la media se interpreta dentro de la demarcación,
 * no como un ranking global de los 25-30 jugadores de la plantilla.
 */
export function computeSquadRole(
  player: Player,
  squad: readonly Player[],
  context: SquadRoleContext = {},
): SquadRole {
  if (context.negotiatedRole) return context.negotiatedRole;
  if (squad.length === 0) return "secondary";

  const typicalXIIds = context.typicalXIIds ?? new Set<string>();
  const roles = assignSquadRolesInternal(squad, typicalXIIds, new Map());
  return roles[player.id] ?? "secondary";
}

function assignSquadRolesInternal(
  squad: readonly Player[],
  typicalXIIds: ReadonlySet<string>,
  negotiatedRoles: ReadonlyMap<string, SquadRole>,
): Record<string, SquadRole> {
  const roles: Record<string, SquadRole> = {};
  for (const player of squad) {
    const negotiated = negotiatedRoles.get(player.id);
    if (negotiated) roles[player.id] = negotiated;
  }

  const groups = rankedByGroup(squad, typicalXIIds);
  const startingShape = normalizeStartingShape(typicalXIIds, squad);
  const negotiatedCore = countNegotiatedCore(squad, negotiatedRoles);
  const negotiatedRotation = countNegotiatedRotation(squad, negotiatedRoles);
  const assignedCore: Record<PositionGroup, number> = { ...negotiatedCore };

  // Las estrellas se eligen entre los mejores de cada demarcación. Nunca se
  // permite que una sola línea consuma todas las estrellas si existen otras
  // líneas con capacidad real de titulares.
  const targetStars = Math.min(
    starCountForSquad(squad),
    squad.filter((player) => !negotiatedRoles.has(player.id)).length,
  );
  const starCandidates = squad
    .filter((player) => !negotiatedRoles.has(player.id))
    .sort((a, b) => score(b, squad, typicalXIIds) - score(a, squad, typicalXIIds) || b.rating - a.rating || a.id.localeCompare(b.id));

  const starGroupCount: Record<PositionGroup, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (let index = 0; index < starCandidates.length && Object.keys(roles).length < squad.length && Object.values(starGroupCount).reduce((s, n) => s + n, 0) < targetStars; index += 1) {
    const player = starCandidates[index];
    const group = groupOf(player);
    const freeStartingSpace = startingShape[group] - assignedCore[group];
    const canBeExtraStar = freeStartingSpace > 0 || Object.values(starGroupCount).reduce((s, n) => s + n, 0) === 0;
    if (!canBeExtraStar) continue;

    const bestInGroup = groups[group]?.[0];
    const topLead = !!bestInGroup && player.rating >= bestInGroup.rating - SQUAD_ROLE_CONFIG.minStarOvrLead;
    if (!topLead && Object.values(starGroupCount).reduce((s, n) => s + n, 0) > 0) continue;

    roles[player.id] = "star";
    starGroupCount[group] += 1;
    assignedCore[group] += 1;
  }

  // Una plantilla siempre tiene al menos una estrella automática cuando hay
  // jugadores libres de rol negociado. Este fallback solo se usa si la forma
  // táctica o los roles pactados dejaron bloqueadas todas las plazas normales.
  if (!Object.values(roles).some((role) => role === "star")) {
    const fallback = starCandidates[0];
    if (fallback) {
      roles[fallback.id] = "star";
      assignedCore[groupOf(fallback)] += 1;
    }
  }

  // Titulares: se reparten por línea según el once esperado. Un equipo con un
  // centro del campo débil podrá tener menos titulares de esa línea, pero nunca
  // convierte automáticamente a casi todos los delanteros en titulares.
  for (const group of ["GK", "DEF", "MID", "ATT"] as const) {
    const targetCore = Math.max(startingShape[group], assignedCore[group]);
    let remaining = targetCore - assignedCore[group];
    for (const player of groups[group]) {
      if (remaining <= 0) break;
      if (roles[player.id]) continue;
      roles[player.id] = "starter";
      assignedCore[group] += 1;
      remaining -= 1;
    }
  }

  // Rotación: un cupo de banquillo por línea, proporcional a las plazas del
  // once y a la profundidad real de esa posición. Si una línea está corta, no
  // gastamos sus plazas de rotación en delanteros sobrecargados.
  const rotationTarget = Math.min(
    Math.max(5, Math.round(squad.length * SQUAD_ROLE_CONFIG.rotationFraction)),
    Math.max(0, squad.length - Object.values(roles).filter((role) => role === "star" || role === "starter").length),
  );
  const rotationQuotas: Record<PositionGroup, number> = { GK: 1, DEF: 2, MID: 2, ATT: 1 };
  let remainingRotation = Math.max(0, rotationTarget - Object.values(roles).filter((role) => role === "rotation").length);
  const availableAfterCore = (group: PositionGroup) => groups[group].filter((player) => !roles[player.id]).length;

  for (const group of ["GK", "DEF", "MID", "ATT"] as const) {
    rotationQuotas[group] = Math.min(rotationQuotas[group], Math.max(0, availableAfterCore(group)));
  }

  for (const group of ["GK", "DEF", "MID", "ATT"] as const) {
    let quota = rotationQuotas[group];
    for (const player of groups[group]) {
      if (!quota || !remainingRotation) break;
      if (roles[player.id]) continue;
      roles[player.id] = "rotation";
      quota -= 1;
      remainingRotation -= 1;
    }
  }

  // Si una demarcación tiene poco fondo, redistribuimos las plazas de rotación
  // sobrantes, pero seguimos recorriendo grupos, no toda la plantilla mezclada.
  if (remainingRotation > 0) {
    for (const group of ["DEF", "MID", "ATT", "GK"] as const) {
      for (const player of groups[group]) {
        if (!remainingRotation) break;
        if (roles[player.id]) continue;
        roles[player.id] = "rotation";
        remainingRotation -= 1;
      }
    }
  }

  for (const player of squad) {
    if (roles[player.id]) continue;
    roles[player.id] = isYoungProspect(player, squad) ? "prospect" : "secondary";
  }

  return roles;
}

export function assignSquadRoles(
  squad: readonly Player[],
  typicalXIIds: ReadonlySet<string>,
  negotiatedRoles: ReadonlyMap<string, SquadRole> = new Map(),
): Record<string, SquadRole> {
  return assignSquadRolesInternal(squad, typicalXIIds, negotiatedRoles);
}
