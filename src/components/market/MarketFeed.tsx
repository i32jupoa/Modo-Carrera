import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import { formatEuro } from "@/store/playersStore";
import { describeTransfer, type Rumor, type TransferRecord, type TransferSummary } from "@/lib/transfers";
import { TeamLogo } from "@/components/TeamLogo";

interface Props {
  rumors: Rumor[];
  history: TransferRecord[];
  summary: TransferSummary | null;
}

function clubName(clubId: string | null): string {
  if (!clubId) return "Agente libre";
  try {
    return teamById(clubId)?.name ?? clubId;
  } catch {
    return clubId;
  }
}

function getLeagueName(leagueId: string | undefined): string {
  if (!leagueId) return "";
  return LEAGUES[leagueId as LeagueId]?.name ?? leagueId;
}

/** Escudo de un club a partir de su id (null = agente libre: sin escudo). */
function ClubBadge({ clubId, size = 20 }: { clubId: string | null; size?: number }) {
  if (!clubId) return null;
  let team: ReturnType<typeof teamById> | null = null;
  try {
    team = teamById(clubId);
  } catch {
    team = null;
  }
  if (!team) return null;
  return <TeamLogo teamName={team.name} leagueName={getLeagueName(team.league)} size={size} className="shrink-0" />;
}

/** Rumores del día y últimas operaciones cerradas por toda la liga. */
export function MarketFeed({ rumors, history, summary }: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="panel p-4">
        <h2 className="font-bold mb-3">Rumores del mercado</h2>
        {rumors.length === 0 ? (
          <p className="text-sm text-muted-foreground">Hoy no hay movimientos que contar.</p>
        ) : (
          <ul className="space-y-2">
            {rumors.map((rumor) => (
              <li key={rumor.id} className="flex items-start gap-2 text-sm border-b border-border/40 pb-2 last:border-0">
                <ClubBadge clubId={rumor.clubId} />
                <div>
                  <p>{rumor.text}</p>
                  <p className="text-[0.65rem] text-muted-foreground">
                    {rumor.date} · fiabilidad {Math.round(rumor.reliability * 100)}%
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel p-4">
        <h2 className="font-bold mb-3">Traspasos recientes</h2>
        {summary && summary.total > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
            <div className="bg-secondary/50 rounded px-2 py-1.5">
              <p className="text-[0.6rem] uppercase text-muted-foreground">Operaciones</p>
              <p className="font-bold">{summary.total}</p>
            </div>
            <div className="bg-secondary/50 rounded px-2 py-1.5">
              <p className="text-[0.6rem] uppercase text-muted-foreground">Gasto total</p>
              <p className="font-bold">{formatEuro(summary.totalFees)}</p>
            </div>
            <div className="bg-secondary/50 rounded px-2 py-1.5">
              <p className="text-[0.6rem] uppercase text-muted-foreground">Récord</p>
              <p className="font-bold">{summary.record ? formatEuro(summary.record.fee) : "—"}</p>
            </div>
          </div>
        )}
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no se ha cerrado ninguna operación.</p>
        ) : (
          <ul className="space-y-2 max-h-[26rem] overflow-auto pr-1">
            {history
              .slice()
              .reverse()
              .map((record) => (
                <li key={record.id} className="flex items-start gap-2 text-sm border-b border-border/40 pb-2 last:border-0">
                  <div className="flex items-center gap-1 shrink-0 pt-0.5">
                    <ClubBadge clubId={record.fromClubId} size={18} />
                    <span className="text-muted-foreground text-xs">→</span>
                    <ClubBadge clubId={record.toClubId} size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold truncate">{record.playerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {clubName(record.fromClubId)} → {clubName(record.toClubId)} ·{" "}
                      {record.fee > 0 ? formatEuro(record.fee) : describeTransfer(record)} · {record.date}
                    </p>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}
