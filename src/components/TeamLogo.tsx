import { useState, useMemo, useEffect } from "react";
import { getAllTeams, LEAGUES } from "@/data/teams";

interface TeamLogoProps {
  teamName: string;
  leagueName: string;
  size?: number;
  className?: string;
}

function normalizeName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function TeamLogo({ teamName, leagueName, size = 32, className = "" }: TeamLogoProps) {
  const [sourceIndex, setSourceIndex] = useState(0);

  // A club keeps its crest when its career-specific league changes. First try
  // the current league folder, then the club's base folder, then other folders
  // as a final compatibility fallback for older/custom saves.
  const sourceCandidates = useMemo(() => {
    const normalizedTeam = normalizeName(teamName);
    const baseTeam = getAllTeams({ teamLeagueOverrides: {} }).find(
      (team) => normalizeName(team.name) === normalizedTeam,
    );
    const baseLeagueName = baseTeam ? LEAGUES[String(baseTeam.league)]?.name : undefined;
    const knownLeagueNames = [
      leagueName,
      baseLeagueName,
      ...Object.values(LEAGUES).map((league) => league.name),
      // Include folders used by legacy player/logo data whose display labels
      // are not always identical to the current LEAGUES catalogue.
      "LALIGA EA SPORTS",
      "LALIGA HYPERMOTION",
      "Premier League",
      "EFL Championship",
      "EFL League One",
      "EFL League Two",
      "Serie A Enilive",
      "Serie BKT",
      "Bundesliga",
      "Bundesliga 2",
      "3. Liga",
      "Ligue 1 McDonald's",
      "Ligue 2 BKT",
    ].filter((value): value is string => typeof value === "string" && value.length > 0);
    const uniqueLeagueNames = [...new Set(knownLeagueNames)];
    return uniqueLeagueNames.flatMap((league) => {
      const encodedLeague = encodeURIComponent(league);
      const encodedTeam = encodeURIComponent(teamName);
      return [
        `/logos/${encodedLeague}/${encodedTeam}.png`,
        `/logos/${encodedLeague}/${encodedTeam}.svg`,
      ];
    });
  }, [teamName, leagueName]);

  useEffect(() => {
    setSourceIndex(0);
  }, [teamName, leagueName]);

  // Generate consistent background color based on team name.
  const backgroundColor = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < teamName.length; i++) {
      hash = teamName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 70%, 45%)`;
  }, [teamName]);

  const initials = useMemo(() => {
    const words = teamName.split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 1) return words[0].substring(0, 3).toUpperCase();
    return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  }, [teamName]);

  const src = sourceCandidates[sourceIndex];
  if (!src) {
    return (
      <div
        className={`flex items-center justify-center rounded-md font-bold text-white ${className}`}
        style={{
          width: size,
          height: size,
          backgroundColor,
          fontSize: size * 0.4,
          minWidth: size,
          minHeight: size,
        }}
        title={teamName}
        aria-label={`${teamName} (escudo no disponible)`}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={teamName}
      width={size}
      height={size}
      className={`object-contain ${className}`}
      onError={() => setSourceIndex((current) => Math.min(current + 1, sourceCandidates.length))}
      style={{ minWidth: size, minHeight: size }}
    />
  );
}
