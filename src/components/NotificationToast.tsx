import { ArrowRight, Bell, BriefcaseBusiness, CheckCircle2, Mail, XCircle } from "lucide-react";
import type { MarketNotification } from "@/store/notificationsStore";
import { TeamBadge } from "@/components/TeamBadge";
import { PlayerFace, roleFromPosition } from "@/components/PlayerFace";
import { CountryFlag } from "@/components/CountryFlag";
import { faceUrl } from "@/lib/playerFaces";
import { usePlayersStore } from "@/store/playersStore";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import { LeagueLogo } from "@/components/LeagueLogo";

function kindMeta(notification: MarketNotification) {
  switch (notification.kind) {
    case "good":
      return { icon: CheckCircle2, label: "Operación", className: "text-emerald-300" };
    case "bad":
      return { icon: XCircle, label: "Mercado", className: "text-red-300" };
    case "mailbox":
      return { icon: Mail, label: "Vestuario", className: "text-sky-300" };
    default:
      return { icon: Bell, label: "Mercado", className: "text-amber-300" };
  }
}

export function NotificationToast({ notification }: { notification: MarketNotification }) {
  const meta = kindMeta(notification);
  const Icon = meta.icon;
  const visual = notification.visual;
  const player = visual?.playerId ? usePlayersStore.getState().getSimPlayer(visual.playerId) : undefined;
  const from = visual?.fromTeamId ? teamById(visual.fromTeamId) : undefined;
  const to = visual?.toTeamId ? teamById(visual.toTeamId) : undefined;
  const league = visual?.leagueId ? LEAGUES[visual.leagueId as LeagueId] : undefined;

  return (
    <div className="w-[min(390px,calc(100vw-2rem))] rounded-2xl border border-border/70 bg-card/95 p-3 shadow-2xl backdrop-blur">
      <div className="flex items-start gap-3">
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary/70 ${meta.className}`}><Icon className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <div className="text-[0.55rem] font-black uppercase tracking-[0.18em] text-muted-foreground">{meta.label}</div>
          <p className="mt-0.5 text-sm font-bold leading-snug">{notification.text}</p>
        </div>
      </div>

      {(player || from || to) && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-border/50 bg-background/40 p-2">
          {player && <PlayerFace name={player.name} image={faceUrl(player.id, player.cardImage)} role={roleFromPosition(player.positions?.[0] ?? "MID")} size={38} showRing={false} />}
          {visual?.country && <CountryFlag country={visual.country} />}
          {from && <TeamBadge team={from} size={30} />}
          {from && to && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
          {to && <TeamBadge team={to} size={30} />}
          {league && <LeagueLogo league={league.name} size="sm" fallback={<span className="grid h-6 w-6 place-items-center rounded-md border border-border/50 text-[0.55rem] font-black text-muted-foreground">L</span>} />}
          {visual?.fee != null && visual.fee > 0 && <span className="ml-auto text-xs font-black">{visual.fee >= 1_000_000 ? `${(visual.fee / 1_000_000).toFixed(1)} M€` : `${Math.round(visual.fee / 1000)} K€`}</span>}
          {!player && visual?.playerId && <BriefcaseBusiness className="ml-auto h-4 w-4 text-muted-foreground" />}
        </div>
      )}
    </div>
  );
}
