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
  prospectRelativeOvrMax: 0,
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
    player.rating < 75 &&
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

type RotationPositionGroup = Exclude<PositionGroup, "ATT"> | "WING" | "ST";

function rotationGroupOf(player: Player): RotationPositionGroup {
  const broadGroup = groupOf(player);
  if (broadGroup !== "ATT") return broadGroup;
  const positions = player.positions ?? [];
  return positions.some((position) => ["ST", "DC", "CF", "FW", "SD", "DEL"].includes(position))
    ? "ST"
    : "WING";
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
  const validTypicalXI = squad.filter((player) => typicalXIIds.has(player.id));
  let startingPlayers = validTypicalXI.length > 0
    ? validTypicalXI
    : [];

  // Para partidas antiguas o plantillas sin un once guardado, reconstruimos
  // un once equilibrado. En una partida normal se respeta exactamente el XI
  // óptimo creado/guardado, por lo que un suplente no asciende a titular solo
  // porque mejore su media durante la temporada.
  if (startingPlayers.length === 0) {
    const fallbackShape = normalizeStartingShape(typicalXIIds, squad);
    const selected = new Set<string>();
    const targetStartingCount = Math.min(
      11,
      Math.min(squad.length, Math.max(3, Math.round(squad.length * 0.48))),
    );
    const orderedGroups: PositionGroup[] = ["GK", "DEF", "MID", "ATT"];
    for (const group of orderedGroups) {
      const limit = Math.min(fallbackShape[group], targetStartingCount - selected.size);
      for (const player of groups[group].slice(0, Math.max(0, limit))) {
        selected.add(player.id);
      }
    }
    if (selected.size < targetStartingCount) {
      const remaining = squad
        .filter((player) => !selected.has(player.id))
        .sort((a, b) => score(b, squad, typicalXIIds) - score(a, squad, typicalXIIds) || b.rating - a.rating);
      for (const player of remaining) {
        if (selected.size >= targetStartingCount) break;
        selected.add(player.id);
      }
    }
    startingPlayers = squad.filter((player) => selected.has(player.id));
  }

  // Las estrellas salen exclusivamente del once inicial. Los jugadores del
  // banquillo nunca pasan a estrella/titular por una subida de media.
  const targetStars = Math.min(
    starCountForSquad(squad),
    Math.max(0, startingPlayers.length - 8),
  );
  const existingStars = Object.values(roles).filter((role) => role === "star").length;
  const starCandidates = startingPlayers
    .filter((player) => !roles[player.id])
    .sort((a, b) => score(b, squad, typicalXIIds) - score(a, squad, typicalXIIds) || b.rating - a.rating || a.id.localeCompare(b.id));

  for (const player of starCandidates.slice(0, Math.max(0, targetStars - existingStars))) {
    roles[player.id] = "star";
  }

  // El resto del once se etiqueta como titular. Las promesas pactadas en una
  // renovación/fichaje prevalecen siempre sobre esta clasificación automática.
  for (const player of startingPlayers) {
    if (!roles[player.id]) roles[player.id] = "starter";
  }

  // La rotación se reparte por puesto específico, no solo por una línea
  // genérica. Así el segundo delantero puede ser rotación aunque haya varios
  // extremos de mayor media, y lo mismo sucede con los laterales/centrales.
  const rotationOrder: RotationPositionGroup[] = ["GK", "DEF", "MID", "WING", "ST"];
  const rotationCaps: Record<RotationPositionGroup, number> = {
    GK: 1,
    DEF: 2,
    MID: 2,
    WING: 2,
    ST: 2,
  };
  const rotationCounts: Record<RotationPositionGroup, number> = {
    GK: 0,
    DEF: 0,
    MID: 0,
    WING: 0,
    ST: 0,
  };
  for (const player of squad) {
    if (roles[player.id] === "rotation") rotationCounts[rotationGroupOf(player)] += 1;
  }

  const rotationTarget = Math.min(
    8,
    Math.max(6, Math.round(squad.length * 0.24)),
    Math.max(0, squad.length - Object.keys(roles).length),
  );
  let remainingRotation = Math.max(
    0,
    rotationTarget - Object.values(roles).filter((role) => role === "rotation").length,
  );

  const candidatesByRotationGroup = new Map<RotationPositionGroup, Player[]>();
  for (const group of rotationOrder) {
    candidatesByRotationGroup.set(
      group,
      squad
        .filter((player) => rotationGroupOf(player) === group && !roles[player.id] && !isYoungProspect(player, squad))
        .sort((a, b) => score(b, squad, typicalXIIds) - score(a, squad, typicalXIIds) || b.rating - a.rating || a.id.localeCompare(b.id)),
    );
  }

  // Primero reservamos una alternativa por línea/puesto cuando existe.
  for (const group of rotationOrder) {
    if (!remainingRotation || rotationCounts[group] >= rotationCaps[group]) continue;
    const candidate = candidatesByRotationGroup.get(group)?.shift();
    if (!candidate) continue;
    roles[candidate.id] = "rotation";
    rotationCounts[group] += 1;
    remainingRotation -= 1;
  }

  // La segunda plaza prioriza los delanteros centro y los extremos para evitar
  // que todos los atacantes suplentes se conviertan en secundarios/promesas.
  const secondChoiceOrder: RotationPositionGroup[] = ["ST", "WING", "DEF", "MID", "GK"];
  while (remainingRotation > 0) {
    let assigned = false;
    for (const group of secondChoiceOrder) {
      if (!remainingRotation) break;
      if (rotationCounts[group] >= rotationCaps[group]) continue;
      const candidate = candidatesByRotationGroup.get(group)?.shift();
      if (!candidate) continue;
      roles[candidate.id] = "rotation";
      rotationCounts[group] += 1;
      remainingRotation -= 1;
      assigned = true;
    }
    if (!assigned) break;
  }

  // En plantillas con una demarcación muy corta redistribuimos las plazas que
  // sobren sin alterar los roles que ya estaban pactados.
  if (remainingRotation > 0) {
    const remaining = squad
      .filter((player) => !roles[player.id] && !isYoungProspect(player, squad))
      .sort((a, b) => score(b, squad, typicalXIIds) - score(a, squad, typicalXIIds) || b.rating - a.rating);
    for (const player of remaining.slice(0, remainingRotation)) roles[player.id] = "rotation";
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
