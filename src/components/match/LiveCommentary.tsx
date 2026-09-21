import { motion } from "framer-motion";
import { PlayerFace } from "@/components/PlayerFace";
import { TeamLogo } from "@/components/TeamLogo";
import { faceUrl } from "@/lib/playerFaces";

export interface CommentaryEntry {
  id: string;
  minute: number;
  text: string;
  tone?: "normal" | "danger" | "dramatic" | "celebration";
  playerId?: string;
  playerName?: string;
  teamSide?: "home" | "away";
}

function toneClasses(tone?: CommentaryEntry["tone"]) {
  switch (tone) {
    case "danger":
      return "border-destructive/30 bg-destructive/5";
    case "dramatic":
      return "border-primary/30 bg-primary/5";
    case "celebration":
      return "border-primary/50 bg-primary/10";
    default:
      return "border-border/50 bg-background/30";
  }
}

export function LiveCommentary({
  latest,
  entries,
  compact = false,
  homeTeam,
  awayTeam,
}: {
  latest: CommentaryEntry | null;
  entries: CommentaryEntry[];
  compact?: boolean;
  homeTeam?: { name: string; leagueName: string };
  awayTeam?: { name: string; leagueName: string };
}) {
  const meta = (entry: CommentaryEntry | null) => {
    if (!entry?.teamSide) return null;
    return entry.teamSide === "home" ? homeTeam : awayTeam;
  };

  return (
    <div className={`rounded-xl border border-border/70 bg-card/70 backdrop-blur ${compact ? "p-2.5" : "p-3.5"}`}>
      <div className={`flex items-center justify-between gap-2 ${compact ? "mb-2" : "mb-3"}`}>
        <div className="text-[0.58rem] font-black uppercase tracking-[0.16em] text-muted-foreground">
          Retransmisión
        </div>
        <div className="hidden md:block text-[0.58rem] text-muted-foreground">Lectura del partido</div>
      </div>
      {latest && (
        <motion.div
          key={latest.id}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-xl border p-2.5 ${toneClasses(latest.tone)}`}
        >
          <div className="flex items-start gap-2.5">
            <div className="shrink-0 pt-0.5">
              {meta(latest) ? (
                <TeamLogo teamName={meta(latest)!.name} leagueName={meta(latest)!.leagueName} size={22} />
              ) : (
                <span className="scoreline text-[0.68rem] font-black text-primary">{latest.minute}'</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[0.62rem] font-black text-primary">
                <span>{latest.minute}'</span>
                {latest.playerName && <span className="truncate text-foreground/80">· {latest.playerName}</span>}
              </div>
              <div className={`${compact ? "text-xs" : "text-sm"} font-semibold leading-relaxed mt-0.5`}>{latest.text}</div>
            </div>
            {latest.playerId && latest.playerName && (
              <PlayerFace
                name={latest.playerName}
                image={faceUrl(latest.playerId)}
                size={30}
                showRing={false}
                className="shrink-0 shadow"
              />
            )}
          </div>
        </motion.div>
      )}
      {entries.length > 1 && (
        <div className="mt-2 space-y-1 max-h-28 overflow-y-auto pr-1">
          {entries.slice(1, 8).map((entry) => {
            const team = meta(entry);
            return (
              <div key={entry.id} className="flex gap-2 rounded-lg px-2 py-1.5 hover:bg-secondary/40">
                <span className="w-7 shrink-0 text-[0.58rem] font-black text-muted-foreground tabular-nums">
                  {entry.minute}'
                </span>
                {team ? <TeamLogo teamName={team.name} leagueName={team.leagueName} size={18} /> : <span className="w-[18px]" />}
                <span className="min-w-0 flex-1 text-[0.65rem] text-muted-foreground leading-relaxed">{entry.text}</span>
                {entry.playerId && entry.playerName && (
                  <PlayerFace name={entry.playerName} image={faceUrl(entry.playerId)} size={21} showRing={false} className="shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
