import { Award, Goal, ShieldCheck, Star, Users, UserRound, ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { PlayerRating } from "@/lib/matchStats";
import { PlayerFace } from "@/components/PlayerFace";
import { faceUrl } from "@/lib/playerFaces";

function ratingColor(r: number) {
  if (r >= 8) return "match-rating-elite";
  if (r >= 7) return "match-rating-good";
  if (r >= 6) return "match-rating-mid";
  return "match-rating-low";
}

function ratingLabel(rating: number) {
  if (rating >= 8.5) return "Excepcional";
  if (rating >= 7.5) return "Muy buen partido";
  if (rating >= 6.5) return "Buen partido";
  if (rating >= 5.5) return "Correcto";
  return "Día complicado";
}

function ratingRow(r: PlayerRating, index: number, participationLabel: string, participationKind: "starter" | "substitute") {
  return (
    <div key={r.playerId} className={`match-rating-row ${index === 0 ? "is-top-rated" : ""}`}>
      <span className="match-rating-rank">{String(index + 1).padStart(2, "0")}</span>
      <PlayerFace name={r.playerName} image={faceUrl(r.playerId)} size={29} showRing={false} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-bold text-foreground">{r.playerName}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.58rem] text-muted-foreground">
          {participationLabel && (
            <span className={`match-rating-participation ${participationKind === "starter" ? "is-starter" : "is-substitute"}`}>
              {participationKind === "starter" ? <ArrowDownRight className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
              {participationLabel}
            </span>
          )}
          {r.goals > 0 && <span className="inline-flex items-center gap-0.5 text-emerald-300"><Goal className="h-3 w-3" />{r.goals}</span>}
          {r.assists > 0 && <span>{r.assists} AST</span>}
          {r.red && <span className="text-rose-300">ROJA</span>}
          {!r.red && r.yellow > 0 && <span className="text-amber-300">AMARILLA</span>}
        </div>
      </div>
      <span className={`match-rating-score ${ratingColor(r.rating)}`}>{r.rating.toFixed(1)}</span>
    </div>
  );
}

export function PlayerRatingsPanel({
  ratings,
  mvp,
  homeName,
  awayName,
  homeStartingIds = [],
  awayStartingIds = [],
  substitutions = [],
  finalMinute = 90,
}: {
  ratings: PlayerRating[];
  mvp?: PlayerRating | null;
  homeName: string;
  awayName: string;
  homeStartingIds?: string[];
  awayStartingIds?: string[];
  substitutions?: Array<{ minute?: number; team?: "home" | "away"; playerOutId?: string; playerInId?: string; outId?: string; inId?: string }>;
  finalMinute?: number;
}) {
  if (!ratings || ratings.length === 0) return null;

  const renderTeam = (team: "home" | "away", title: string, startingIds: string[]) => {
    const teamRatings = ratings.filter((rating) => rating.team === team).sort((a, b) => b.rating - a.rating);
    const startingSet = new Set(startingIds);
    // Saved matches from older versions might not have a separate starting-XI
    // snapshot. In that case, minutes played provide a conservative fallback.
    const isStarter = (rating: PlayerRating) => startingSet.size > 0
      ? startingSet.has(rating.playerId)
      : Number(rating.minutes ?? 0) >= 45;
    const starters = teamRatings.filter(isStarter);
    const substitutesForTeam = substitutions.filter((sub) => sub.team === team);
    const substitutedOutAt = new Map<string, number>();
    const substitutedInAt = new Map<string, number>();
    substitutesForTeam.forEach((sub) => {
      const minute = Math.max(0, Number(sub.minute) || 0);
      const outId = String(sub.playerOutId ?? sub.outId ?? "");
      const inId = String(sub.playerInId ?? sub.inId ?? "");
      if (outId && !substitutedOutAt.has(outId)) substitutedOutAt.set(outId, minute);
      if (inId && !substitutedInAt.has(inId)) substitutedInAt.set(inId, minute);
    });
    const benchEnteredIds = new Set(substitutedInAt.keys());
    const substitutes = teamRatings.filter((rating) => !isStarter(rating));

    const participationLabel = (rating: PlayerRating, kind: "starter" | "substitute") => {
      if (kind === "starter") {
        const exitMinute = substitutedOutAt.get(rating.playerId);
        if (exitMinute !== undefined) return `Salió ${exitMinute}′`;
        if (rating.red) return "Expulsado";
        if (Number(rating.minutes ?? 0) > 0 && Number(rating.minutes ?? 0) < finalMinute) {
          return `Salió ${Number(rating.minutes)}′`;
        }
        return "";
      }
      const entryMinute = substitutedInAt.get(rating.playerId);
      if (entryMinute !== undefined) return `Entró ${entryMinute}′`;
      if (benchEnteredIds.has(rating.playerId)) return "Entró al partido";
      return Number(rating.minutes ?? 0) > 0 ? "Entró al partido" : "No participó";
    };

    const renderGroup = (label: string, players: PlayerRating[], kind: "starter" | "substitute") => (
      <div className="match-rating-group">
        <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
          <span className="flex items-center gap-1.5 text-[0.58rem] font-black uppercase tracking-[0.13em] text-muted-foreground">
            {kind === "starter" ? <Users className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
            {label}
          </span>
          <span className="rounded-full border border-border/60 bg-background/40 px-1.5 py-0.5 text-[0.55rem] font-bold tabular-nums text-muted-foreground">{players.length}</span>
        </div>
        {players.length > 0 ? (
          <div className="space-y-1">{players.map((player, index) => ratingRow(player, index, participationLabel(player, kind), kind))}</div>
        ) : (
          <p className="rounded-lg border border-dashed border-border/50 px-2.5 py-2 text-[0.62rem] text-muted-foreground">
            {kind === "substitute" ? "No han participado suplentes." : "No hay notas disponibles."}
          </p>
        )}
      </div>
    );

    return (
      <section className="match-rating-team min-w-0 space-y-2.5 rounded-xl border border-border/50 bg-background/20 p-2.5 sm:p-3">
        <h4 className="flex min-w-0 items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.13em] text-foreground">
          <span className={`match-rating-team-dot ${team === "home" ? "is-home" : "is-away"}`} />
          <span className="truncate">{title}</span>
        </h4>
        {renderGroup("Titulares", starters, "starter")}
        {renderGroup("Suplentes", substitutes, "substitute")}
      </section>
    );
  };

  return (
    <div className="match-data-panel match-ratings-panel min-w-0 space-y-3 rounded-xl border border-border/70 bg-card/75 p-3.5 backdrop-blur-sm sm:p-4">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2.5">
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-[0.14em]">Notas del partido</h3>
          <p className="mt-1 text-[0.62rem] text-muted-foreground">Titulares: minuto de salida · Suplentes: minuto de entrada</p>
        </div>
        <Award className="h-4 w-4 shrink-0 text-primary" />
      </div>

      {mvp && (
        <div className="match-mvp-card">
          <div className="match-mvp-crown"><Star className="h-4 w-4 fill-current" /></div>
          <PlayerFace name={mvp.playerName} image={faceUrl(mvp.playerId)} size={48} showRing={false} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[0.58rem] font-black uppercase tracking-[0.16em] text-emerald-200/70">Jugador del partido</div>
            <div className="mt-1 truncate text-sm font-extrabold text-white">{mvp.playerName}</div>
            <div className="mt-0.5 text-[0.62rem] text-white/55">{ratingLabel(mvp.rating)}</div>
          </div>
          <div className="match-mvp-rating">{mvp.rating.toFixed(1)}</div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {renderTeam("home", homeName, homeStartingIds)}
        {renderTeam("away", awayName, awayStartingIds)}
      </div>
      <div className="flex items-center gap-2 border-t border-border/50 pt-2 text-[0.58rem] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> Se muestra el minuto exacto del cambio cuando está registrado, junto a goles, asistencias y tarjetas.
      </div>
    </div>
  );
}
