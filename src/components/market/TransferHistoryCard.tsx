import { ArrowDownLeft, ArrowUpRight, BadgeEuro, CalendarDays } from "lucide-react";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import { fcPlayerById } from "@/store/playersStore";
import { formatEuro } from "@/store/playersStore";
import { PlayerFace, roleFromPosition } from "@/components/PlayerFace";
import { TeamLogo } from "@/components/TeamLogo";
import type { TransferRecord } from "@/lib/transfers";

function typeLabel(type: TransferRecord["type"]): string {
  if (type === "loan") return "Cesión";
  if (type === "loan-option") return "Cesión con opción";
  if (type === "loan-obligation") return "Cesión con obligación";
  if (type === "free") return "Agente libre";
  return "Fichaje";
}

function leagueName(clubId: string | null): string {
  if (!clubId) return "";
  const team = teamById(clubId);
  return team ? (LEAGUES[team.league as LeagueId]?.name ?? team.league) : "";
}

function ClubSide({ clubId, muted = false }: { clubId: string | null; muted?: boolean }) {
  if (!clubId) return <span className="text-xs text-muted-foreground">Agente libre</span>;
  const club = teamById(clubId);
  if (!club) return <span className="text-xs">{clubId}</span>;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <TeamLogo teamName={club.name} leagueName={leagueName(clubId)} size={26} />
      <span className={`text-xs font-bold truncate ${muted ? "text-muted-foreground" : ""}`}>{club.name}</span>
    </div>
  );
}

export function TransferHistoryCard({ record, direction }: { record: TransferRecord; direction: "in" | "out" }) {
  const rawPlayer = fcPlayerById(record.playerId);
  const targetClubId = direction === "in" ? record.fromClubId : record.toClubId;
  const isLoan = record.type !== "permanent" && record.type !== "free";
  const title = direction === "in" ? "Entrada" : "Salida";
  const verb = direction === "in" ? "desde" : "hacia";

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${direction === "in" ? "bg-emerald-500" : "bg-orange-500"}`} />
      <div className="p-4 pl-5">
        <div className="flex items-center gap-3">
          <div className="relative">
            <PlayerFace
              name={record.playerName}
              image={rawPlayer?.card}
              role={roleFromPosition(rawPlayer?.Position ?? "MID")}
              size={62}
              showRing={false}
            />
            <span className={`absolute -right-1 -bottom-1 grid h-6 w-6 place-items-center rounded-full border-2 border-card ${direction === "in" ? "bg-emerald-500 text-white" : "bg-orange-500 text-white"}`}>
              {direction === "in" ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-black truncate">{record.playerName}</h4>
              <span className="rounded-full border border-border/60 bg-secondary/60 px-2 py-0.5 text-[0.58rem] font-black uppercase tracking-wide">{typeLabel(record.type)}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
              {isLoan ? <span>Cesión {verb}</span> : <span>{title} {verb}</span>}
              <ClubSide clubId={targetClubId} muted />
            </div>
          </div>
          <div className="hidden sm:block text-right">
            <p className="text-[0.58rem] uppercase font-black tracking-wider text-muted-foreground">{isLoan ? "Prima" : "Traspaso"}</p>
            <p className="font-black text-primary">{formatEuro(record.fee)}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl bg-secondary/50 border border-border/40 p-2.5">
            <p className="text-[0.58rem] uppercase font-black tracking-wider text-muted-foreground">Operación</p>
            <p className="mt-1 text-xs font-bold">{title}</p>
          </div>
          <div className="rounded-xl bg-secondary/50 border border-border/40 p-2.5">
            <p className="text-[0.58rem] uppercase font-black tracking-wider text-muted-foreground">{isLoan ? "Prima" : "Importe"}</p>
            <p className="mt-1 text-xs font-black">{formatEuro(record.fee)}</p>
          </div>
          <div className="rounded-xl bg-secondary/50 border border-border/40 p-2.5">
            <p className="text-[0.58rem] uppercase font-black tracking-wider text-muted-foreground">Ficha anual</p>
            <p className="mt-1 text-xs font-black">{formatEuro(record.wage)}</p>
          </div>
          <div className="rounded-xl bg-secondary/50 border border-border/40 p-2.5">
            <p className="text-[0.58rem] uppercase font-black tracking-wider text-muted-foreground">Fecha</p>
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold"><CalendarDays className="h-3 w-3" />{new Date(`${record.date}T12:00:00Z`).toLocaleDateString("es-ES")}</p>
          </div>
        </div>
      </div>
    </article>
  );
}
