import { TeamLogo } from "@/components/TeamLogo";
import { resolveCurrentPlayerClub } from "@/lib/playerClub";
import type { FcPlayer } from "@/store/playersStore";

/** Escudo actual del jugador; la key obliga a reiniciar la caché visual al cambiar de club. */
export function PlayerClubCrest({
  playerId,
  player,
  size = 32,
  className,
}: {
  playerId: string | number;
  player?: Pick<FcPlayer, "Team" | "League">;
  size?: number;
  className?: string;
}) {
  const club = resolveCurrentPlayerClub(playerId, player);
  if (club.isFreeAgent) {
    return (
      <span
        className={`inline-grid shrink-0 place-items-center rounded-md border border-emerald-400/30 bg-emerald-400/10 text-[0.55rem] font-black text-emerald-300 ${className ?? ""}`}
        style={{ width: size, height: size }}
        title="Agente libre"
        aria-label="Agente libre"
      >
        FA
      </span>
    );
  }
  return (
    <TeamLogo
      key={`${club.clubId}:${club.teamName}:${club.leagueName}`}
      teamName={club.teamName}
      leagueName={club.leagueName}
      size={size}
      className={className}
    />
  );
}
