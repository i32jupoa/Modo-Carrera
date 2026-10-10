import type { ReactNode } from "react";
import type { ElevenSlot } from "@/lib/teamProfile";
import { FORMATION_COORDINATES, type FormationName } from "@/lib/formations";
import { PlayerFace } from "@/components/PlayerFace";
import { PlayerClubCrest } from "@/components/PlayerClubCrest";
import { TeamLogo } from "@/components/TeamLogo";
import { TeamBadge } from "@/components/TeamBadge";
import { LEAGUES, teamById } from "@/data/teams";

const FALLBACK: FormationName = "Táctica 4-3-3 con mediocentro ofensivo";

interface Props {
  eleven: ElevenSlot[];
  formation: string;
  className?: string;
}

export function TypicalElevenPitch({ eleven, formation, className = "" }: Props) {
  const coords =
    FORMATION_COORDINATES[formation as FormationName] ?? FORMATION_COORDINATES[FALLBACK];
  const layout = Object.keys(coords).map((k) => coords[k]);

  return (
    <div className={className}>
      <div
        className="relative w-full overflow-hidden rounded-xl border-2 border-green-600/30 bg-green-800/20"
        style={{ aspectRatio: "3 / 4" }}
      >
        {/* Líneas del campo, iguales al minimapa de Premios */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-green-500/35" />
          <div className="absolute left-0 right-0 top-1/2 h-px bg-green-500/35" />
          <div className="absolute left-1/2 top-0 h-12 w-28 -translate-x-1/2 border-2 border-t-0 border-green-500/35" />
          <div className="absolute bottom-0 left-1/2 h-12 w-28 -translate-x-1/2 border-2 border-b-0 border-green-500/35" />
        </div>

        {/* Jugadores */}
        {eleven.map((slot, i) => {
          const coord = layout[i] ?? { top: 50, left: 50 };
          const name = slot.player?.Name ?? "—";
          const surname = name.split(" ").slice(-1)[0];
          let crest: ReactNode = null;
          let clubTitle = "Club actual del jugador";
          if (slot.player) {
            if (slot.teamId) {
              try {
                const club = teamById(slot.teamId);
                const leagueName = LEAGUES[club.league]?.name ?? club.league;
                clubTitle = club.name;
                crest = <TeamLogo teamName={club.name} leagueName={leagueName} size={18} />;
              } catch {
                crest = <TeamBadge teamId={slot.teamId} size={18} />;
              }
            } else {
              crest = <PlayerClubCrest playerId={slot.player.ID} player={slot.player} size={18} />;
            }
          }

          return (
            <div
              key={`${slot.label}-${i}`}
              className="absolute flex w-[22%] flex-col items-center"
              style={{
                top: `${coord.top}%`,
                left: `${coord.left}%`,
                transform: "translate(-50%,-50%)",
              }}
            >
              <div className="relative">
                <PlayerFace
                  name={name}
                  image={slot.player?.card}
                  size={40}
                  className="bg-background/70 shadow-lg sm:!h-12 sm:!w-12"
                  showRing={false}
                />
                {slot.player && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-white/80 bg-white px-1 text-[0.58rem] font-black leading-tight text-black shadow sm:h-6 sm:min-w-6 sm:text-[0.62rem]">
                    {slot.matchRating !== undefined ? slot.matchRating.toFixed(1) : slot.player.OVR}
                  </span>
                )}
                {slot.player && crest && (
                  <div className="absolute -bottom-1 -left-1 rounded-full border border-white/70 bg-background p-0.5 shadow" title={clubTitle}>
                    {crest}
                  </div>
                )}
              </div>
              <span className="mt-0.5 max-w-full truncate rounded bg-background/90 px-1.5 py-0.5 text-[0.58rem] font-bold leading-tight text-foreground shadow-sm">
                {surname}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
