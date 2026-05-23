import { useState } from "react";

/**
 * Get the URL for a league logo SVG
 * @param leagueName - The league name (e.g., "LALIGA EA SPORTS", "Premier League")
 * @returns The path to the league logo SVG (e.g., "/logos/LALIGA EA SPORTS/laliga-ea-sports.svg")
 */
export function getLeagueLogoUrl(leagueName: string): string {
  // Convert league name to lowercase and replace spaces with hyphens
  const formattedName = leagueName.toLowerCase().replace(/\s+/g, "-").replace(/[']/g, "");
  return `/logos/${leagueName}/${formattedName}.svg`;
}

interface LeagueLogoProps {
  league: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  fallback?: React.ReactNode;
}

export function LeagueLogo({ league, className = "", size = "sm", fallback }: LeagueLogoProps) {
  const [error, setError] = useState(false);
  
  const sizeClasses = size === "sm" ? "w-6 h-6" : size === "md" ? "w-8 h-8" : "w-10 h-10";
  const logoUrl = getLeagueLogoUrl(league);
  
  if (error) {
    return fallback || null; // Show fallback or hide if logo is missing
  }
  
  return (
    <img
      src={logoUrl}
      alt={league}
      className={`${sizeClasses} object-contain ${className}`}
      onError={() => setError(true)}
    />
  );
}
