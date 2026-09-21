import { Player } from "@/data/players";

import {
  ALL_FORMATIONS,
  FORMATION_COORDINATES,
  type FormationName,
  type PositionRole,
} from "@/lib/formations";
import { teamById } from "@/data/teams";
import { CardEvent, MatchEvent, InjuryEvent, SubstitutionEvent } from "@/lib/simulation";
import { PlayerFace, roleFromPosition } from "@/components/PlayerFace";
import { Zap } from "lucide-react";
import { faceUrl } from "@/lib/playerFaces";

interface MiniPitchProps {
  startingXI: Player[];
  formation: FormationName;
  teamId: string;
  className?: string;
  cards?: CardEvent[];
  ratings?: Array<{ playerId: string; rating: number }>;
  goals?: MatchEvent[];
  assists?: MatchEvent[];
  mvp?: string;
  injuries?: InjuryEvent[];
  substitutions?: SubstitutionEvent[];
  stamina?: Record<string, number>;
}

// Position role mappings for CPU lineup generation
const POSITION_ROLES: Record<string, PositionRole> = {
  GK: "GK",
  POR: "GK",
  CB: "DEF",
  RB: "DEF",
  LB: "DEF",
  RWB: "DEF",
  LWB: "DEF",
  DFC: "DEF",
  LD: "DEF",
  LI: "DEF",
  DEF: "DEF",
  CDM: "MID",
  CM: "MID",
  CAM: "MID",
  RM: "MID",
  LM: "MID",
  MCD: "MID",
  MC: "MID",
  MCO: "MID",
  MD: "MID",
  MI: "MID",
  MID: "MID",
  ST: "ATT",
  CF: "ATT",
  RW: "ATT",
  LW: "ATT",
  DC: "ATT",
  ED: "ATT",
  EI: "ATT",
  FWD: "ATT",
  ATT: "ATT",
};

function getPlayerRole(position: string): PositionRole | null {
  return POSITION_ROLES[position] || null;
}

// Helper function to determine if text should be black or white based on background color
function getContrastColor(hexColor: string): string {
  // Remove hash if present
  const color = hexColor.replace("#", "");

  // Convert to RGB
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);

  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Return black for light backgrounds, white for dark backgrounds
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

export function MiniPitch({
  startingXI,
  formation,
  teamId,
  className = "",
  cards = [],
  ratings = [],
  goals = [],
  assists = [],
  mvp,
  injuries = [],
  substitutions = [],
  stamina = {},
}: MiniPitchProps) {
  const formationPositions = FORMATION_COORDINATES[formation];
  const positionKeys = Object.keys(formationPositions);
  const team = teamById(teamId);

  // Map players to positions (simple mapping by index)
  const playerPositions: Record<string, Player | null> = {};
  positionKeys.forEach((posKey, index) => {
    if (index < startingXI.length && startingXI[index]) {
      playerPositions[posKey] = startingXI[index];
    } else {
      playerPositions[posKey] = null;
    }
  });

  // Create a map of player IDs to their cards
  const playerCards: Record<string, CardEvent[]> = {};
  cards.forEach((card) => {
    if (!playerCards[card.playerId]) {
      playerCards[card.playerId] = [];
    }
    playerCards[card.playerId].push(card);
  });

  // Create a map of player IDs to their ratings
  const playerRatings: Record<string, number> = {};
  ratings.forEach((r) => {
    playerRatings[r.playerId] = r.rating;
  });

  // Create a map of player IDs to their goals
  const playerGoals: Record<string, number> = {};
  goals
    .filter(
      (g) =>
        (g.type === "goal" || g.type === "penalty_goal" || g.type === "free_kick_goal") &&
        g.scorerId,
    )
    .forEach((g) => {
      if (!playerGoals[g.scorerId]) {
        playerGoals[g.scorerId] = 0;
      }
      playerGoals[g.scorerId]++;
    });

  // Create a map of player IDs to their assists
  const playerAssists: Record<string, number> = {};
  assists
    .filter((a) => a.assistId)
    .forEach((a) => {
      if (a.assistId) {
        if (!playerAssists[a.assistId]) {
          playerAssists[a.assistId] = 0;
        }
        playerAssists[a.assistId]++;
      }
    });

  // Create a map of player IDs to their injuries
  const playerInjuries: Record<string, InjuryEvent[]> = {};
  injuries.forEach((i) => {
    if (!playerInjuries[i.playerId]) {
      playerInjuries[i.playerId] = [];
    }
    playerInjuries[i.playerId].push(i);
  });

  // Create a map of player IDs to their substitutions
  const playerSubstitutions: Record<string, SubstitutionEvent[]> = {};
  substitutions.forEach((s) => {
    if (!playerSubstitutions[s.playerOutId]) {
      playerSubstitutions[s.playerOutId] = [];
    }
    playerSubstitutions[s.playerOutId].push(s);
    if (!playerSubstitutions[s.playerInId]) {
      playerSubstitutions[s.playerInId] = [];
    }
    playerSubstitutions[s.playerInId].push(s);
  });

  const textColor = getContrastColor(team?.color || "#3b82f6");

  return (
    <div className={`relative ${className}`}>
      <div
        className="relative bg-green-800/20 border-2 border-green-600/30 rounded-lg overflow-hidden"
        style={{ aspectRatio: "3/4", width: "100%", maxWidth: "380px", minHeight: "380px" }}
      >
        {/* Pitch markings */}
        <div className="absolute inset-0">
          {/* Center circle */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 border-2 border-green-500/40 rounded-full" />
          {/* Halfway line */}
          <div className="absolute top-1/2 left-0 right-0 h-px bg-green-500/40" />
          {/* Goal areas */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-10 border-2 border-green-500/40 border-t-0" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-20 h-10 border-2 border-green-500/40 border-b-0" />
        </div>

        {/* Player nodes */}
        {positionKeys.map((posKey) => {
          const coord = formationPositions[posKey];
          const player = playerPositions[posKey];

          if (!player) return null;

          // Get cards for this player
          const playerCardList = playerCards[player.id] || [];
          const hasYellowCard = playerCardList.some((c) => c.cardType === "yellow");
          const hasRedCard = playerCardList.some((c) => c.cardType === "red");
          const cardType = hasRedCard ? "red" : hasYellowCard ? "yellow" : null;

          // Get rating for this player
          const rating = playerRatings[player.id];

          // Get goals for this player
          const goals = playerGoals[player.id] || 0;

          // Get assists for this player
          const assists = playerAssists[player.id] || 0;

          // Get injuries for this player
          const injuryList = playerInjuries[player.id] || [];
          const isInjured = injuryList.length > 0;

          // Get substitutions for this player
          const subList = playerSubstitutions[player.id] || [];
          const wasSubstituted = subList.length > 0;

          // Check if MVP
          const isMvp = mvp === player.id;
          const energy = stamina[player.id];
          const energyTone =
            energy === undefined
              ? ""
              : energy >= 70
                ? "border-emerald-400/40 bg-emerald-500/12 text-emerald-300"
                : energy >= 45
                  ? "border-amber-400/45 bg-amber-500/12 text-amber-300"
                  : "border-destructive/45 bg-destructive/10 text-destructive";

          return (
            <div
              key={posKey}
              className="absolute flex flex-col items-center justify-center"
              style={{
                top: `${coord.top}%`,
                left: `${coord.left}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <div className="relative">
                <PlayerFace
                  name={player.name}
                  image={faceUrl(player.id, player.cardImage)}
                  role={roleFromPosition(player.positions[0])}
                  size={34}
                  className="shadow-lg"
                  showRing={false}
                />
                {/* Rating - top right */}
                {rating !== undefined && (
                  <div className="absolute -top-1 -right-1 bg-white/90 rounded-full w-5 h-5 flex items-center justify-center text-[0.5rem] font-bold text-black shadow-sm">
                    {rating.toFixed(1)}
                  </div>
                )}
                {/* Energy stays attached to the player so the pitch keeps its full size. */}
                {energy !== undefined && (
                  <div
                    className={`absolute -top-5 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[0.48rem] font-black tabular-nums shadow-lg backdrop-blur-sm ${energyTone}`}
                    title={`Energía ${Math.round(energy)}%`}
                  >
                    <Zap className="h-2.5 w-2.5 fill-current" />
                    <span>{Math.round(energy)}</span>
                  </div>
                )}
                {/* Indicators - bottom right */}
                <div className="absolute -bottom-1 -right-1 flex flex-row gap-0.5">
                  {cardType === "yellow" && <span className="text-[0.45rem]">🟨</span>}
                  {cardType === "red" && <span className="text-[0.45rem]">🟥</span>}
                  {goals > 0 && <span className="text-[0.45rem]">⚽</span>}
                  {isMvp && <span className="text-[0.45rem]">⭐</span>}
                  {assists > 0 && <span className="text-[0.45rem]">👟</span>}
                  {isInjured && <span className="text-[0.45rem]">🚑</span>}
                  {wasSubstituted && <span className="text-[0.45rem]">🔄</span>}
                </div>
              </div>
              <div className="mt-0.5 text-[0.45rem] text-foreground font-medium text-center leading-tight">
                {player.name.split(" ").pop()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Helper function to generate CPU lineup
export function generateCPULineup(roster: Player[]): {
  lineup: Player[];
  formation: FormationName;
} {
  const formation: FormationName =
    ALL_FORMATIONS[Math.floor(Math.random() * ALL_FORMATIONS.length)];

  // Filter out injured players
  const availablePlayers = roster.filter((p) => p.injuredUntil <= 0);

  // Group by role
  const playersByRole: Record<PositionRole, Player[]> = {
    GK: [],
    DEF: [],
    MID: [],
    ATT: [],
  };

  availablePlayers.forEach((player) => {
    const role = getPlayerRole(player.positions[0]);
    if (role) {
      playersByRole[role].push(player);
    }
  });

  // Sort each group by OVR (highest first)
  Object.keys(playersByRole).forEach((role) => {
    playersByRole[role as PositionRole].sort((a, b) => b.rating - a.rating);
  });

  // Pick players based on formation requirements
  const formationCoords = FORMATION_COORDINATES[formation];
  const positionKeys = Object.keys(formationCoords);

  const lineup: Player[] = [];
  const usedPlayerIds = new Set<string>();

  // Fill positions in order
  positionKeys.forEach((posKey) => {
    const requiredRole = formationCoords[posKey].role;
    const availableForRole = playersByRole[requiredRole].filter((p) => !usedPlayerIds.has(p.id));

    if (availableForRole.length > 0) {
      const player = availableForRole[0];
      lineup.push(player);
      usedPlayerIds.add(player.id);
    } else {
      // Fallback: pick any available player
      const anyAvailable = availablePlayers.filter((p) => !usedPlayerIds.has(p.id));
      if (anyAvailable.length > 0) {
        lineup.push(anyAvailable[0]);
        usedPlayerIds.add(anyAvailable[0].id);
      }
    }
  });

  return { lineup, formation };
}
