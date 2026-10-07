import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import type { Fixture } from "@/lib/season";
import { TeamLogo } from "@/components/TeamLogo";

function leagueNameOf(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

/** Marcador igual que en Jornadas / Copa / Europa (prórroga y penaltis incluidos). */
export function formatFixtureScore(f: Fixture): string {
  const r = f.result;
  if (!r) return "vs";
  const etH = r.extraTime?.homeGoals ?? 0;
  const etA = r.extraTime?.awayGoals ?? 0;
  const th = r.homeGoals + etH;
  const ta = r.awayGoals + etA;
  if (r.penalties) return `${th} (${r.penalties.homeGoals}) - (${r.penalties.awayGoals}) ${ta}`;
  if (r.extraTime && th !== ta) return `${th} - ${ta} (prórroga)`;
  return `${th} - ${ta}`;
}

/**
 * Partido con el mismo aspecto que en Jornadas, Copa, Champions, Europa League...
 * Al pulsarlo se abren las estadísticas del partido.
 */
export function NewsMatchRow({
  fixture,
  myId,
  onOpen,
  className = "",
}: {
  fixture: Fixture;
  myId?: string;
  onOpen?: (f: Fixture) => void;
  className?: string;
}) {
  let home: ReturnType<typeof teamById> | null = null;
  let away: ReturnType<typeof teamById> | null = null;
  try {
    home = teamById(fixture.homeId);
    away = teamById(fixture.awayId);
  } catch {
    /* club desconocido */
  }
  if (!home || !away) return null;

  const mine = !!myId && (fixture.homeId === myId || fixture.awayId === myId);
  const clickable = !!fixture.result && !!onOpen;

  const content = (
    <div
      className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3 rounded-xl border border-border/50 ${
        mine ? "bg-primary/5" : "bg-background/40"
      } ${clickable ? "cursor-pointer hover:bg-accent/20 transition" : ""} ${className}`}
    >
      <div className="flex items-center gap-2.5 justify-end min-w-0">
        <span className={`font-semibold truncate ${mine && fixture.homeId === myId ? "text-primary" : ""}`}>
          {home.name}
        </span>
        <TeamLogo teamName={home.name} leagueName={leagueNameOf(home.league)} size={30} />
      </div>
      <div className="scoreline font-bold text-lg min-w-[70px] text-center whitespace-nowrap">
        {fixture.result ? (
          formatFixtureScore(fixture)
        ) : (
          <span className="text-muted-foreground text-sm font-normal">vs</span>
        )}
      </div>
      <div className="flex items-center gap-2.5 min-w-0">
        <TeamLogo teamName={away.name} leagueName={leagueNameOf(away.league)} size={30} />
        <span className={`font-semibold truncate ${mine && fixture.awayId === myId ? "text-primary" : ""}`}>
          {away.name}
        </span>
      </div>
    </div>
  );

  if (!clickable) return content;
  return (
    <button
      type="button"
      className="block w-full text-left"
      onClick={(e) => {
        e.stopPropagation();
        onOpen!(fixture);
      }}
      aria-label={`Ver estadísticas: ${home.name} ${formatFixtureScore(fixture)} ${away.name}`}
    >
      {content}
    </button>
  );
}
