import { useState, useMemo } from "react";

interface TeamLogoProps {
  teamName: string;
  leagueName: string;
  size?: number;
  className?: string;
}

type LogoState = "png" | "svg" | "fallback";

export function TeamLogo({ teamName, leagueName, size = 32, className = "" }: TeamLogoProps) {
  const [logoState, setLogoState] = useState<LogoState>("png");
  const [hasError, setHasError] = useState(false);

  // Generate consistent background color based on team name
  const backgroundColor = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < teamName.length; i++) {
      hash = teamName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 70%, 45%)`;
  }, [teamName]);

  // Get initials (first 2-3 letters)
  const initials = useMemo(() => {
    const words = teamName.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 1) {
      return words[0].substring(0, 3).toUpperCase();
    }
    return words
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  }, [teamName]);

  // Build src based on current state
  const src = useMemo(() => {
    // URI encode both leagueName and teamName to handle spaces correctly
    const encodedLeague = encodeURIComponent(leagueName);
    const encodedTeam = encodeURIComponent(teamName);

    switch (logoState) {
      case "png":
        return `/logos/${encodedLeague}/${encodedTeam}.png`;
      case "svg":
        return `/logos/${encodedLeague}/${encodedTeam}.svg`;
      default:
        return null;
    }
  }, [logoState, teamName, leagueName]);

  const handleError = () => {
    if (hasError) return;
    setHasError(true);

    // Try next extension (png -> svg -> fallback)
    if (logoState === "png") {
      setLogoState("svg");
      setHasError(false);
    } else if (logoState === "svg") {
      setLogoState("fallback");
    }
  };

  // Fallback placeholder component
  if (logoState === "fallback") {
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
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src!}
      alt={teamName}
      width={size}
      height={size}
      className={`object-contain ${className}`}
      onError={handleError}
      style={{ minWidth: size, minHeight: size }}
    />
  );
}
