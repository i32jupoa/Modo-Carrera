import { Player } from "@/data/players";
import { FORMATION_COORDINATES, type FormationName, type PositionRole } from "@/lib/formations";
import { teamById } from "@/data/teams";

interface MiniPitchProps {
  startingXI: Player[];
  formation: FormationName;
  teamId: string;
  className?: string;
}

// Position role mappings for CPU lineup generation
const POSITION_ROLES: Record<string, PositionRole> = {
  "GK": "GK", "POR": "GK",
  "CB": "DEF", "RB": "DEF", "LB": "DEF", "RWB": "DEF", "LWB": "DEF",
  "DFC": "DEF", "LD": "DEF", "LI": "DEF", "CAD": "DEF", "CAI": "DEF", "DEF": "DEF",
  "CDM": "MID", "CM": "MID", "CAM": "MID", "RM": "MID", "LM": "MID",
  "MCD": "MID", "MC": "MID", "MCO": "MID", "MD": "MID", "MI": "MID", "MID": "MID",
  "ST": "ATT", "CF": "ATT", "RW": "ATT", "LW": "ATT",
  "DC": "ATT", "SD": "ATT", "ED": "ATT", "EI": "ATT", "FWD": "ATT", "ATT": "ATT",
};

function getPlayerRole(position: string): PositionRole | null {
  return POSITION_ROLES[position] || null;
}

// Helper function to determine if text should be black or white based on background color
function getContrastColor(hexColor: string): string {
  // Remove hash if present
  const color = hexColor.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);
  
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return black for light backgrounds, white for dark backgrounds
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

export function MiniPitch({ startingXI, formation, teamId, className = "" }: MiniPitchProps) {
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

  const textColor = getContrastColor(team?.color || '#3b82f6');

  return (
    <div className={`relative ${className}`}>
      <div className="relative bg-green-800/20 border-2 border-green-600/30 rounded-lg overflow-hidden" style={{ aspectRatio: '3/4', width: '100%', maxWidth: '320px', minHeight: '320px' }}>
        {/* Pitch markings */}
        <div className="absolute inset-0">
          {/* Center circle */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 border-2 border-green-500/40 rounded-full" />
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

          return (
            <div
              key={posKey}
              className="absolute flex flex-col items-center justify-center"
              style={{
                top: `${coord.top}%`,
                left: `${coord.left}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div 
                className="font-bold rounded-full flex items-center justify-center shadow-lg border-2"
                style={{
                  width: '28px',
                  height: '28px',
                  backgroundColor: team?.color || '#3b82f6',
                  borderColor: team?.color || '#3b82f6',
                  color: textColor,
                  fontSize: '0.55rem',
                }}
              >
                {player.rating}
              </div>
              <div className="mt-0.5 text-[0.5rem] text-foreground font-medium text-center leading-tight">
                {player.name.split(' ').pop()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Helper function to generate CPU lineup
export function generateCPULineup(roster: Player[]): { lineup: Player[]; formation: FormationName } {
  // Default formation for CPU
  const formation: FormationName = "Táctica 4-4-2";
  
  // Filter out injured players
  const availablePlayers = roster.filter(p => p.injuredUntil <= 0);
  
  // Group by role
  const playersByRole: Record<PositionRole, Player[]> = {
    GK: [],
    DEF: [],
    MID: [],
    ATT: [],
  };
  
  availablePlayers.forEach(player => {
    const role = getPlayerRole(player.position);
    if (role) {
      playersByRole[role].push(player);
    }
  });
  
  // Sort each group by OVR (highest first)
  Object.keys(playersByRole).forEach(role => {
    playersByRole[role as PositionRole].sort((a, b) => b.rating - a.rating);
  });
  
  // Pick players based on formation requirements
  const formationCoords = FORMATION_COORDINATES[formation];
  const positionKeys = Object.keys(formationCoords);
  
  const lineup: Player[] = [];
  const usedPlayerIds = new Set<string>();
  
  // Fill positions in order
  positionKeys.forEach(posKey => {
    const requiredRole = formationCoords[posKey].role;
    const availableForRole = playersByRole[requiredRole].filter(p => !usedPlayerIds.has(p.id));
    
    if (availableForRole.length > 0) {
      const player = availableForRole[0];
      lineup.push(player);
      usedPlayerIds.add(player.id);
    } else {
      // Fallback: pick any available player
      const anyAvailable = availablePlayers.filter(p => !usedPlayerIds.has(p.id));
      if (anyAvailable.length > 0) {
        lineup.push(anyAvailable[0]);
        usedPlayerIds.add(anyAvailable[0].id);
      }
    }
  });
  
  return { lineup, formation };
}
