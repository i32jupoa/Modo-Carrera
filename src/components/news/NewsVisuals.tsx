import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { CountryFlag } from "@/components/CountryFlag";
import { PlayerFace } from "@/components/PlayerFace";
import { TeamLogo } from "@/components/TeamLogo";
import { getLeagueLogoUrl } from "@/components/LeagueLogo";
import { LEAGUES, teamById, type LeagueId } from "@/data/teams";
import { faceUrl } from "@/lib/playerFaces";

/** Escudo de un club a partir de su id (con placeholder si no existe). */
export function TeamCrest({ teamId, size = 28 }: { teamId: string; size?: number }) {
  let team: ReturnType<typeof teamById> | null = null;
  try {
    team = teamById(teamId);
  } catch {
    team = null;
  }
  if (!team) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-md bg-muted text-muted-foreground text-[0.55rem] font-bold shrink-0"
        style={{ width: size, height: size }}
      >
        ?
      </span>
    );
  }
  const leagueName = LEAGUES[team.league as LeagueId]?.name || team.league;
  return <TeamLogo teamName={team.name} leagueName={leagueName} size={size} />;
}

/** Escudo de una liga (logo oficial) a partir de su id. Se oculta si no existe. */
export function LeagueCrest({ leagueId, size = 20 }: { leagueId: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const league = (LEAGUES as Record<string, { name: string }>)[leagueId];
  if (!league || failed) return null;
  return (
    <img
      src={getLeagueLogoUrl(league.name)}
      alt={league.name}
      title={league.name}
      width={size}
      height={size}
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}

/** Ligas implicadas en una noticia (liga indicada + ligas de sus clubes), sin repetir. */
export function leaguesOfVisual(visual: { teamIds: string[]; leagueId?: string }, max = 2): string[] {
  const ids: string[] = [];
  const push = (id?: string) => {
    if (id && (LEAGUES as Record<string, unknown>)[id] && !ids.includes(id)) ids.push(id);
  };
  push(visual.leagueId);
  for (const t of visual.teamIds) {
    try {
      push(teamById(t)?.league);
    } catch {
      /* club desconocido */
    }
  }
  return ids.slice(0, max);
}

/** Cara de un jugador (sin aro de color por posición) con iniciales como respaldo. */
export function NewsPlayerFace({
  playerId,
  name,
  size = 36,
}: {
  playerId: string;
  name: string;
  size?: number;
}) {
  return <PlayerFace name={name} image={faceUrl(playerId)} size={size} showRing={false} />;
}

/** Club origen → flecha → club destino, como en el mercado. */
export function TransferArrow({
  fromId,
  toId,
  size = 28,
  className = "",
}: {
  fromId?: string;
  toId: string;
  size?: number;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {fromId ? (
        <>
          <TeamCrest teamId={fromId} size={size} />
          <ArrowRight className="shrink-0 text-muted-foreground" style={{ width: size * 0.6, height: size * 0.6 }} />
        </>
      ) : (
        <span className="text-[0.55rem] font-bold uppercase tracking-wider text-muted-foreground">Libre</span>
      )}
      <TeamCrest teamId={toId} size={size} />
    </div>
  );
}

export interface VisualLike {
  teamIds: string[];
  players: Array<{ id: string; name: string }>;
  countries: string[];
  leagueId?: string;
}

/**
 * Franja visual: caras de jugadores, escudos (pequeños), liga y banderas.
 * `size` controla el tamaño base de escudos y caras.
 */
export function VisualStrip({
  visual,
  transfer,
  size = 28,
  showFlags = true,
  showLeagues = true,
  hideTeams = false,
  className = "",
}: {
  visual: VisualLike;
  /** Si hay traspaso se pinta "origen → destino" en lugar de los escudos sueltos. */
  transfer?: { fromId?: string; toId: string };
  size?: number;
  showFlags?: boolean;
  showLeagues?: boolean;
  /** Oculta los escudos de clubes (p. ej. cuando el partido ya los muestra). */
  hideTeams?: boolean;
  className?: string;
}) {
  const leagues = showLeagues ? leaguesOfVisual(visual) : [];
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {visual.players.map((p) => (
        <NewsPlayerFace key={p.id} playerId={p.id} name={p.name} size={Math.round(size * 1.25)} />
      ))}
      {!hideTeams &&
        (transfer ? (
          <TransferArrow fromId={transfer.fromId} toId={transfer.toId} size={size} />
        ) : (
          visual.teamIds.map((id) => <TeamCrest key={id} teamId={id} size={size} />)
        ))}
      {leagues.length > 0 && (
        <div className="flex items-center gap-1 pl-1 border-l border-border/50">
          {leagues.map((lg) => (
            <LeagueCrest key={lg} leagueId={lg} size={Math.round(size * 0.7)} />
          ))}
        </div>
      )}
      {showFlags && visual.countries.length > 0 && (
        <div className="flex flex-col gap-0.5 ml-0.5">
          {visual.countries.slice(0, 2).map((c) => (
            <CountryFlag key={c} country={c} />
          ))}
        </div>
      )}
    </div>
  );
}
