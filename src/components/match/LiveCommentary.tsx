import { motion } from "framer-motion";
import { Radio, Clock3, Sparkles, ChevronRight, MessageCircle } from "lucide-react";
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
      return "match-commentary-tone-danger border-rose-400/30 bg-rose-500/[0.07]";
    case "dramatic":
      return "match-commentary-tone-dramatic border-amber-300/30 bg-amber-400/[0.07]";
    case "celebration":
      return "match-commentary-tone-celebration border-emerald-300/35 bg-emerald-400/[0.08]";
    default:
      return "match-commentary-tone-normal border-border/60 bg-background/35";
  }
}

function toneLabel(tone?: CommentaryEntry["tone"]) {
  switch (tone) {
    case "danger": return "Peligro";
    case "dramatic": return "Momento clave";
    case "celebration": return "Celebración";
    default: return "En juego";
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
    return entry.teamSide === "home" ? homeTeam ?? null : awayTeam ?? null;
  };

  const latestTeam = meta(latest);
  const secondaryEntries = entries.filter((entry) => entry.id !== latest?.id).slice(0, compact ? 3 : 6);

  return (
    <section className={`match-live-card match-commentary-card relative min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card/75 backdrop-blur ${compact ? "p-3" : "p-4"}`} aria-label="Retransmisión en directo">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color-mix(in_oklab,var(--comp-accent)_65%,transparent)] to-transparent" />

      <div className={`flex items-center justify-between gap-3 ${compact ? "mb-3" : "mb-4"}`}>
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="match-commentary-radio flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <Radio className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-[0.68rem] font-black uppercase tracking-[0.16em] text-foreground">Retransmisión</h3>
            <p className="mt-0.5 truncate text-[0.58rem] text-muted-foreground">La voz del partido · crónica en directo</p>
          </div>
        </div>
        <div className="match-commentary-live-indicator inline-flex shrink-0 items-center gap-1.5 rounded-full border border-rose-400/25 bg-rose-500/[0.07] px-2 py-1 text-[0.55rem] font-black uppercase tracking-[0.12em] text-rose-300">
          <span className="match-commentary-live-dot" aria-hidden="true" /> DIRECTO
        </div>
      </div>

      {latest ? (
        <motion.div
          key={latest.id}
          initial={{ opacity: 0, y: 7 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={`match-commentary-feature relative overflow-hidden rounded-xl border ${toneClasses(latest.tone)}`}
        >
          <div className="match-commentary-feature-accent absolute inset-y-0 left-0 w-1" aria-hidden="true" />
          <div className={`flex items-start gap-2.5 ${compact ? "p-2.5 pl-3.5" : "p-3.5 pl-4"}`}>
            <div className="match-commentary-minute flex shrink-0 flex-col items-center justify-center rounded-lg border border-border/60 bg-background/55 px-2 py-1.5">
              <Clock3 className="mb-1 h-3 w-3 text-primary" />
              <span className="scoreline text-sm font-black tabular-nums text-foreground">{latest.minute}'</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background/40 px-1.5 py-0.5 text-[0.53rem] font-black uppercase tracking-[0.1em] text-muted-foreground">
                  <Sparkles className="h-2.5 w-2.5 text-primary" /> {toneLabel(latest.tone)}
                </span>
                {latestTeam && <span className="truncate text-[0.6rem] font-bold text-foreground/70">{latestTeam.name}</span>}
              </div>
              <p className={`${compact ? "text-xs" : "text-sm"} font-semibold leading-relaxed text-foreground/95`}>{latest.text}</p>
              {latest.playerName && (
                <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[0.6rem] font-semibold text-muted-foreground">
                  <span className="h-1 w-1 shrink-0 rounded-full bg-primary" />
                  <span className="truncate">Protagonista: {latest.playerName}</span>
                </div>
              )}
            </div>
            {latest.playerId && latest.playerName ? (
              <PlayerFace name={latest.playerName} image={faceUrl(latest.playerId)} size={compact ? 28 : 34} showRing={false} className="shrink-0" />
            ) : latestTeam ? (
              <TeamLogo teamName={latestTeam.name} leagueName={latestTeam.leagueName} size={compact ? 26 : 32} className="shrink-0 rounded-md" />
            ) : null}
          </div>
        </motion.div>
      ) : (
        <div className="match-commentary-empty flex items-center gap-3 rounded-xl border border-dashed border-border/60 bg-background/25 px-3 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary/70 text-muted-foreground"><MessageCircle className="h-4 w-4" /></div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground">La retransmisión está preparada</p>
            <p className="mt-0.5 text-[0.62rem] leading-relaxed text-muted-foreground">Las jugadas destacadas y el análisis aparecerán aquí durante el encuentro.</p>
          </div>
        </div>
      )}

      {secondaryEntries.length > 0 && (
        <div className="match-commentary-feed mt-3 space-y-1.5">
          <div className="flex items-center justify-between px-0.5 pb-0.5">
            <span className="text-[0.55rem] font-black uppercase tracking-[0.15em] text-muted-foreground">Lo último</span>
            <span className="text-[0.55rem] font-medium tabular-nums text-muted-foreground">{secondaryEntries.length} apuntes</span>
          </div>
          {secondaryEntries.map((entry, index) => {
            const team = meta(entry);
            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: 5 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.025, duration: 0.16 }}
                className="group flex min-w-0 items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 transition-colors hover:border-border/50 hover:bg-background/35"
              >
                <span className="w-8 shrink-0 rounded-md bg-secondary/60 px-1 py-1 text-center text-[0.59rem] font-black tabular-nums text-foreground/80">{entry.minute}'</span>
                {team ? <TeamLogo teamName={team.name} leagueName={team.leagueName} size={18} className="shrink-0" /> : <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-primary/10"><Radio className="h-2.5 w-2.5 text-primary" /></span>}
                <span className="min-w-0 flex-1 truncate text-[0.64rem] leading-relaxed text-muted-foreground transition-colors group-hover:text-foreground">{entry.text}</span>
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/35 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </motion.div>
            );
          })}
        </div>
      )}
    </section>
  );
}
