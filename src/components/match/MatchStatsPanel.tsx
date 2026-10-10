import type { TeamStats } from "@/lib/matchStats";

function Bar({
  label,
  home,
  away,
  suffix = "",
  homeColor,
  awayColor,
}: {
  label: string;
  home: number;
  away: number;
  suffix?: string;
  homeColor: string;
  awayColor: string;
}) {
  const total = home + away;
  const homePct = total > 0 ? (home / total) * 100 : 50;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold tabular-nums">
          {home}
          {suffix}
        </span>
        <span className="text-muted-foreground uppercase tracking-wide">{label}</span>
        <span className="font-semibold tabular-nums">
          {away}
          {suffix}
        </span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="transition-all duration-500" style={{ width: `${homePct}%`, backgroundColor: homeColor }} />
        <div
          className="transition-all duration-500"
          style={{ width: `${100 - homePct}%`, backgroundColor: awayColor }}
        />
      </div>
    </div>
  );
}

export function MatchStatsPanel({ home, away, homeColor, awayColor }: { home: TeamStats; away: TeamStats; homeColor: string; awayColor: string }) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide">Estadísticas</h3>
      <Bar
        label="Posesión"
        home={Math.round(home.possession)}
        away={Math.round(away.possession)}
        suffix="%"
        homeColor={homeColor}
        awayColor={awayColor}
      />
      <Bar label="Tiros" home={home.shots} away={away.shots} homeColor={homeColor} awayColor={awayColor} />
      <Bar label="Tiros a puerta" home={home.shotsOnTarget} away={away.shotsOnTarget} homeColor={homeColor} awayColor={awayColor} />
      <Bar label="Córners" home={home.corners} away={away.corners} homeColor={homeColor} awayColor={awayColor} />
      <Bar label="Faltas" home={home.fouls} away={away.fouls} homeColor={homeColor} awayColor={awayColor} />
      <Bar label="Fueras de juego" home={home.offsides} away={away.offsides} homeColor={homeColor} awayColor={awayColor} />
      <Bar
        label="Precisión pase"
        home={Math.round(home.passAccuracy)}
        away={Math.round(away.passAccuracy)}
        suffix="%"
        homeColor={homeColor}
        awayColor={awayColor}
      />
      <Bar label="Paradas" home={home.saves} away={away.saves} homeColor={homeColor} awayColor={awayColor} />
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold tabular-nums">{home.xg.toFixed(2)}</span>
          <span className="text-muted-foreground uppercase tracking-wide">xG en vivo</span>
          <span className="font-semibold tabular-nums">{away.xg.toFixed(2)}</span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="transition-all duration-500"
            style={{
              backgroundColor: homeColor,
              width: `${home.xg + away.xg > 0 ? (home.xg / (home.xg + away.xg)) * 100 : 50}%`,
            }}
          />
          <div
            className="transition-all duration-500"
            style={{
              backgroundColor: awayColor,
              width: `${home.xg + away.xg > 0 ? (away.xg / (home.xg + away.xg)) * 100 : 50}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
