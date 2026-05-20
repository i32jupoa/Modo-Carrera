import { PositionCoordinate } from "@/lib/formations";

interface FootballPitchProps {
  children: React.ReactNode;
}

export function FootballPitch({ children }: FootballPitchProps) {
  return (
    <div className="relative w-full max-w-md mx-auto aspect-[3/4] bg-gradient-to-b from-green-600 to-green-700 rounded-lg overflow-hidden border-4 border-white/20 shadow-2xl">
      {/* Pitch markings */}
      <div className="absolute inset-0">
        {/* Center line */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/40" />
        
        {/* Center circle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border-2 border-white/40" />
        
        {/* Center spot */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-white/60" />
        
        {/* Top penalty area */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-1/4 border-2 border-white/40 border-t-0" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-1/6 border-2 border-white/40 border-t-0" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full border-2 border-white/40 border-t-0" />
        
        {/* Bottom penalty area */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-1/4 border-2 border-white/40 border-b-0" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-1/6 border-2 border-white/40 border-b-0" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full border-2 border-white/40 border-b-0" />
        
        {/* Goal areas */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-8 border-2 border-white/30 border-t-0" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-8 border-2 border-white/30 border-b-0" />
        
        {/* Side lines */}
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-white/30" />
        <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-white/30" />
      </div>
      
      {/* Player nodes */}
      {children}
    </div>
  );
}

interface PlayerNodeProps {
  player: {
    id: string;
    name: string;
    rating: number;
    position: string;
    injured?: boolean;
  };
  coordinates: PositionCoordinate;
  isSelected: boolean;
  onClick: () => void;
}

// Helper to truncate name to surname or first word
function getShortName(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length === 1) return name;
  // Return last name (surname) or first name if it's short
  const lastName = parts[parts.length - 1];
  if (lastName.length <= 8) return lastName;
  // If last name is long, return first name
  const firstName = parts[0];
  if (firstName.length <= 8) return firstName;
  // Return first 8 chars of last name
  return lastName.substring(0, 8);
}

export function PlayerNode({ player, coordinates, isSelected, onClick }: PlayerNodeProps) {
  const shortName = getShortName(player.name);
  
  return (
    <button
      onClick={onClick}
      className={`absolute transform -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full flex flex-col items-center justify-center transition-all duration-200 ${
        isSelected
          ? "bg-primary text-primary-foreground scale-110 shadow-lg shadow-primary/50 ring-2 ring-white"
          : player.injured
          ? "bg-destructive/20 text-destructive border-2 border-destructive/50 opacity-60"
          : "bg-card text-foreground border-2 border-primary/50 hover:border-primary hover:scale-105"
      }`}
      style={{
        top: `${coordinates.top}%`,
        left: `${coordinates.left}%`,
      }}
      title={`${player.name} (${player.rating}) - ${player.position}`}
    >
      <span className="text-[0.7rem] font-bold leading-tight">{player.rating}</span>
      <span className="text-[0.55rem] leading-tight truncate max-w-full px-1">{shortName}</span>
      <span className="text-[0.45rem] leading-tight text-muted-foreground">{player.position}</span>
      {player.injured && <span className="absolute -top-1 -right-1 text-xs">🚑</span>}
    </button>
  );
}
