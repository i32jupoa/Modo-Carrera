import { PlayerFace } from "@/components/PlayerFace";
import { TeamLogo } from "@/components/TeamLogo";
import { LEAGUES } from "@/data/teams";
import { faceUrl } from "@/lib/playerFaces";
import { buildMatchChronicleItems } from "@/lib/matchChronicle";
import { formatMatchMinuteWithMark } from "@/lib/matchTime";

type ChronicleTeam = {
  id?: string;
  name: string;
  short?: string;
  league?: string;
  leagueName?: string;
};

type MatchChronicleProps = {
  home: ChronicleTeam;
  away: ChronicleTeam;
  events?: any[];
  cards?: any[];
  highlights?: any[];
  substitutions?: any[];
  moments?: any[];
  className?: string;
  emptyMessage?: string;
};

const HIGHLIGHT_META: Record<string, { icon: string; label: string }> = {
  woodwork: { icon: "🥅", label: "Al palo" },
  big_chance: { icon: "❌", label: "Fallo" },
  penalty_missed: { icon: "❌", label: "Penalti fallado" },
  penalty_save: { icon: "🧤", label: "Penalti detenido" },
  var_disallowed: { icon: "📺", label: "Gol anulado (VAR)" },
  injury: { icon: "🚑", label: "Lesión" },
  save: { icon: "🧤", label: "Paradón" },
};

export function MatchChronicle({
  home,
  away,
  events = [],
  cards = [],
  highlights = [],
  substitutions = [],
  moments = [],
  className = "space-y-0.5",
  emptyMessage = "Sin eventos registrados",
}: MatchChronicleProps) {
  const items = buildMatchChronicleItems({ events, cards, highlights, substitutions, moments });
  const teamOf = (side?: string) => (side === "home" ? home : side === "away" ? away : null);
  const leagueName = (team: ChronicleTeam) =>
    team.leagueName || (team.league ? LEAGUES[team.league]?.name || team.league : "");
  const shortName = (team: ChronicleTeam) => team.short || team.name;
  const avatar = (playerId?: string, playerName?: string, size = 24) => (
    <PlayerFace
      name={playerName || "Jugador"}
      image={playerId ? faceUrl(playerId) : undefined}
      size={size}
      showRing={false}
      className="shrink-0"
    />
  );
  const logo = (team: ChronicleTeam | null, size = 22) =>
    team ? <TeamLogo teamName={team.name} leagueName={leagueName(team)} size={size} /> : <span className="w-[22px] shrink-0" />;

  if (items.length === 0) {
    return <div className="text-sm text-muted-foreground">{emptyMessage}</div>;
  }

  return (
    <div className={className}>
      {items.map((item, index) => {
        const data = item.data;
        const minute = formatMatchMinuteWithMark(item.minute, data);
        if (item.kind === "moment") {
          const side = data.teamSide ?? data.team;
          const team = teamOf(side);
          return (
            <div
              key={`moment-${data.id || `${item.minute}-${data.type}-${index}`}`}
              className="match-event-row flex items-start gap-2.5 rounded-lg border-b border-border/40 px-1.5 py-2.5 last:border-b-0"
            >
              <span className="scoreline w-10 shrink-0 pt-0.5 text-sm font-bold text-primary">{minute}</span>
              <span className="w-5 shrink-0 text-center text-base">{data.emoji || data.kicker?.slice(0, 2) || "⚡"}</span>
              {logo(team)}
              {data.playerId ? avatar(data.playerId, data.playerName, 24) : <span className="w-6 shrink-0" />}
              <div className="min-w-0 text-sm">
                <span className="font-black">{data.playerName || data.title || data.kicker || "Jugada"}</span>
                {data.playerName && data.title && <span className="text-muted-foreground"> · {data.title}</span>}
                {data.body && <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{data.body}</div>}
                {!data.body && data.detail && <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{data.detail}</div>}
                {team && <span className="ml-1 text-muted-foreground">({shortName(team)})</span>}
              </div>
            </div>
          );
        }

        if (item.kind === "card") {
          const team = teamOf(data.team);
          const isRed = data.cardType === "red" || data.isSecondYellow;
          const cardText = data.isSecondYellow
            ? "2ª amarilla → roja"
            : data.cardType === "yellow"
              ? "Tarjeta amarilla"
              : "Tarjeta roja";
          return (
            <div key={`card-${item.minute}-${data.playerId || index}`} className="match-event-row flex items-center gap-2.5 rounded-lg border-b border-border/40 px-1.5 py-2 last:border-0">
              <span className="scoreline w-10 shrink-0 text-sm font-bold text-primary">{minute}</span>
              <span className={`h-3 w-5 shrink-0 rounded-sm ${isRed ? "bg-red-500" : "bg-yellow-400"}`} />
              {logo(team)}
              {avatar(data.playerId, data.playerName, 24)}
              <div className="min-w-0 text-sm">
                <span className="font-bold">{data.playerName || "Jugador"}</span>
                <span className="text-muted-foreground"> · {cardText}</span>
                {team && <span className="text-muted-foreground"> ({shortName(team)})</span>}
              </div>
            </div>
          );
        }

        if (item.kind === "sub") {
          const team = teamOf(data.team);
          const inId = data.playerInId ?? data.inId;
          const outId = data.playerOutId ?? data.outId;
          const inName = data.playerInName ?? data.inName ?? "Entra";
          const outName = data.playerOutName ?? data.outName ?? "Sale";
          return (
            <div key={`sub-${item.minute}-${inId || index}`} className="match-event-row flex items-center gap-2.5 rounded-lg border-b border-border/40 px-1.5 py-2 last:border-0">
              <span className="scoreline w-10 shrink-0 text-sm font-bold text-primary">{minute}</span>
              <span className="w-5 shrink-0 text-center text-base">🔄</span>
              <div className="flex shrink-0 -space-x-2">
                {avatar(inId, inName, 24)}
                {avatar(outId, outName, 24)}
              </div>
              {logo(team)}
              <div className="min-w-0 truncate text-sm">
                <span className="font-bold text-primary">{inName}</span>
                <span className="text-muted-foreground"> por </span>
                <span className="text-destructive">{outName}</span>
                {team && <span className="text-muted-foreground"> ({shortName(team)})</span>}
              </div>
            </div>
          );
        }

        if (item.kind === "highlight") {
          const team = teamOf(data.team);
          const meta = HIGHLIGHT_META[data.type] || { icon: "⚡", label: "Acción destacada" };
          return (
            <div key={`highlight-${item.minute}-${data.type}-${data.playerId || index}`} className="match-event-row flex items-center gap-2.5 rounded-lg border-b border-border/40 px-1.5 py-2 last:border-0">
              <span className="scoreline w-10 shrink-0 text-sm font-bold text-muted-foreground">{minute}</span>
              <span className="w-5 shrink-0 text-center text-base">{meta.icon}</span>
              {logo(team)}
              {avatar(data.playerId, data.playerName, 24)}
              <div className="min-w-0 truncate text-sm">
                <span className="font-semibold">{data.playerName || meta.label}</span>
                <span className="text-muted-foreground"> · {data.detail || meta.label}</span>
                {team && <span className="text-muted-foreground"> ({shortName(team)})</span>}
              </div>
            </div>
          );
        }

        const team = teamOf(data.team);
        const isPenalty = data.type === "penalty" || data.type === "penalty_goal";
        const isFreeKick = data.type === "free_kick_goal";
        const isOwnGoal = data.type === "own_goal";
        return (
          <div key={`goal-${item.minute}-${data.scorerId || data.scorerName || index}`} className="match-event-row flex items-center gap-2.5 rounded-lg border-b border-border/40 px-1.5 py-2 last:border-0">
            <span className="scoreline w-10 shrink-0 text-sm font-bold text-primary">{minute}</span>
            <span className="text-lg">
              {isPenalty ? <span className="rounded bg-white/6 px-1.5 py-0.5 text-[0.8rem] font-bold">P</span> : <span className="inline-block h-3 w-3 rounded-full bg-white/80" />}
            </span>
            {logo(team)}
            {avatar(data.scorerId, data.scorerName || data.playerName, 24)}
            <div className="min-w-0 text-sm">
              <span className="font-bold">{data.scorerName || data.playerName || "Gol"}</span>
              {isOwnGoal && <span className="text-muted-foreground"> · en propia puerta</span>}
              {isPenalty && data.detail && <span className="text-muted-foreground"> · {data.detail}</span>}
              {isFreeKick && <span className="text-muted-foreground"> · {data.detail || "falta directa"}</span>}
              {!isPenalty && !isFreeKick && !isOwnGoal && data.assistName && <span className="text-muted-foreground"> · asist. {data.assistName}</span>}
              {!isPenalty && !isFreeKick && !isOwnGoal && data.detail && <span className="text-muted-foreground"> · {data.detail}</span>}
              {team && <span className="text-muted-foreground"> ({shortName(team)})</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
