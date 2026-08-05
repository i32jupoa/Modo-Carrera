import { useMemo, useState } from "react";
import { teamById, getAllTeams, LEAGUES, type LeagueId } from "@/data/teams";
import { formatEuro } from "@/store/playersStore";
import {
  describeTransfer,
  getPlayer,
  type Rumor,
  type TransferRecord,
  type TransferSummary,
} from "@/lib/transfers";
import type { UserDeal } from "@/lib/transfers";
import { TeamLogo } from "@/components/TeamLogo";
import { LeagueLogo } from "@/components/LeagueLogo";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  rumors: Rumor[];
  history: TransferRecord[];
  summary: TransferSummary | null;
  /** Negociaciones del usuario, para el filtro "mi club". */
  userDeals?: UserDeal[];
  myTeamId?: string | null;
}

/** Ligas que forman las "5 grandes". */
const TOP5: LeagueId[] = ["premier", "laliga", "seriea", "bundesliga", "ligue1"] as LeagueId[];

type Scope = "all" | "top5" | LeagueId;

function clubName(clubId: string | null): string {
  if (!clubId) return "Agente libre";
  try {
    return teamById(clubId)?.name ?? clubId;
  } catch {
    return clubId;
  }
}

function leagueOfClub(clubId: string | null): string | null {
  if (!clubId) return null;
  try {
    return teamById(clubId)?.league ?? null;
  } catch {
    return null;
  }
}

function getLeagueName(leagueId: string | undefined | null): string {
  if (!leagueId) return "";
  return LEAGUES[leagueId as LeagueId]?.name ?? leagueId;
}

/** Club actual del jugador de un rumor (para filtrar "quién sale de mi club"). */
function playerClubOf(playerId: string | null): string | null {
  if (!playerId) return null;
  try {
    return getPlayer(playerId)?.clubId ?? null;
  } catch {
    return null;
  }
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
  return (
    <TeamLogo
      teamName={team.name}
      leagueName={getLeagueName(team.league)}
      size={size}
      className="shrink-0"
    />
  );
}

/** Rumores del día y últimas operaciones cerradas por toda la liga. */
export function MarketFeed({ rumors, history, summary, userDeals = [], myTeamId = null }: Props) {
  const [scope, setScope] = useState<Scope>("all");
  const [teamId, setTeamId] = useState<string>("all");

  const leagueOptions = useMemo(
    () =>
      Object.values(LEAGUES).sort((a, b) =>
        a.name.localeCompare(b.name, "es"),
      ) as { id: string; name: string; flag: string }[],
    [],
  );

  // Equipos disponibles según el ámbito elegido.
  const teamOptions = useMemo(() => {
    const leagues: string[] =
      scope === "all" ? [] : scope === "top5" ? (TOP5 as string[]) : [scope as string];
    const teams = getAllTeams().filter((t) => leagues.length === 0 || leagues.includes(t.league));
    return teams
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map((t) => ({ id: t.id, name: t.name }));
  }, [scope]);

  /** ¿Está este club dentro del filtro activo? */
  const clubInScope = useMemo(() => {
    return (clubId: string | null): boolean => {
      if (!clubId) return false;
      if (teamId !== "all") return clubId === teamId;
      if (scope === "all") return true;
      const league = leagueOfClub(clubId);
      if (!league) return false;
      return scope === "top5" ? (TOP5 as string[]).includes(league) : league === scope;
    };
  }, [scope, teamId]);

  const noFilter = scope === "all" && teamId === "all";

  const filteredHistory = useMemo(() => {
    const ordered = history.slice().reverse();
    if (noFilter) return ordered.slice(0, 60);
    return ordered
      .filter((r) => clubInScope(r.fromClubId) || clubInScope(r.toClubId))
      .slice(0, 60);
  }, [history, clubInScope, noFilter]);

  const filteredRumors = useMemo(() => {
    if (noFilter) return rumors;
    return rumors.filter(
      (rumor) => clubInScope(rumor.clubId) || clubInScope(playerClubOf(rumor.playerId)),
    );
  }, [rumors, clubInScope, noFilter]);

  // Cuando el filtro apunta a tu club, tus negociaciones abiertas se leen
  // como rumores: las ofertas que haces y las que recibes.
  const myDeals = useMemo(() => {
    if (!myTeamId) return [];
    const targeted = teamId === myTeamId || (teamId === "all" && clubInScope(myTeamId));
    if (!targeted) return [];
    return userDeals.filter((deal) => deal.stage !== "failed");
  }, [userDeals, myTeamId, teamId, clubInScope]);

  const filteredSummary = useMemo(() => {
    if (noFilter || !summary) return summary;
    const scoped = history.filter((r) => clubInScope(r.fromClubId) || clubInScope(r.toClubId));
    const fees = scoped.reduce((sum, r) => sum + r.fee, 0);
    const record = scoped.reduce<TransferRecord | null>(
      (best, r) => (best === null || r.fee > best.fee ? r : best),
      null,
    );
    return { ...summary, total: scoped.length, totalFees: fees, record };
  }, [summary, history, clubInScope, noFilter]);

  return (
    <div className="space-y-4">
      {/* Filtros del feed */}
      <div className="panel p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground mr-1">Filtrar por</span>
        <Select
          value={scope}
          onValueChange={(value) => {
            setScope(value as Scope);
            setTeamId("all");
          }}
        >
          <SelectTrigger className="w-[15rem] bg-secondary">
            <SelectValue placeholder="Todas las ligas" />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value="all">Todas las ligas</SelectItem>
            <SelectItem value="top5">5 grandes ligas</SelectItem>
            {leagueOptions.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                <span className="flex items-center gap-2">
                  <LeagueLogo league={l.name} size="sm" fallback={<span>{l.flag}</span>} />
                  <span className="truncate">{l.name}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={teamId} onValueChange={setTeamId}>
          <SelectTrigger className="w-[15rem] bg-secondary">
            <SelectValue placeholder="Todos los equipos" />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value="all">Todos los equipos</SelectItem>
            {teamOptions.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                <span className="flex items-center gap-2">
                  <ClubBadge clubId={t.id} size={18} />
                  <span className="truncate">{t.name}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(scope !== "all" || teamId !== "all") && (
          <button
            type="button"
            onClick={() => {
              setScope("all");
              setTeamId("all");
            }}
            className="text-xs text-muted-foreground hover:text-primary"
          >
            Limpiar
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-4">
          <h2 className="font-bold mb-3">Rumores del mercado</h2>

          {myDeals.length > 0 && (
            <ul className="space-y-2 mb-3">
              {myDeals.map((deal) => (
                <li
                  key={deal.id}
                  className="flex items-start gap-2 text-sm rounded-lg bg-secondary/40 p-2"
                >
                  <ClubBadge clubId={deal.otherClubId} />
                  <div className="min-w-0">
                    <p>
                      {deal.direction === "in"
                        ? `Tu club negocia el fichaje de ${deal.playerName} con el ${clubName(deal.otherClubId)}.`
                        : `El ${clubName(deal.otherClubId)} ha ofertado por ${deal.playerName}.`}
                    </p>
                    <p className="text-[0.65rem] text-muted-foreground">
                      {deal.updatedOn} · {formatEuro(deal.offer?.amount ?? 0)} · negociación propia
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {filteredRumors.length === 0 && myDeals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay rumores para este filtro. Prueba con otra liga u otro equipo.
            </p>
          ) : (
            <ul className="space-y-2 max-h-[26rem] overflow-auto pr-1">
              {filteredRumors.map((rumor) => (
                <li
                  key={rumor.id}
                  className="flex items-start gap-2 text-sm border-b border-border/40 pb-2 last:border-0"
                >
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
          {filteredSummary && filteredSummary.total > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
              <div className="bg-secondary/50 rounded px-2 py-1.5">
                <p className="text-[0.6rem] uppercase text-muted-foreground">Operaciones</p>
                <p className="font-bold">{filteredSummary.total}</p>
              </div>
              <div className="bg-secondary/50 rounded px-2 py-1.5">
                <p className="text-[0.6rem] uppercase text-muted-foreground">Gasto total</p>
                <p className="font-bold">{formatEuro(filteredSummary.totalFees)}</p>
              </div>
              <div className="bg-secondary/50 rounded px-2 py-1.5">
                <p className="text-[0.6rem] uppercase text-muted-foreground">Récord</p>
                <p className="font-bold">
                  {filteredSummary.record ? formatEuro(filteredSummary.record.fee) : "—"}
                </p>
              </div>
            </div>
          )}
          {filteredHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {noFilter
                ? "Todavía no se ha cerrado ninguna operación."
                : "Este filtro no tiene operaciones cerradas todavía."}
            </p>
          ) : (
            <ul className="space-y-2 max-h-[26rem] overflow-auto pr-1">
              {filteredHistory.map((record) => (
                <li
                  key={record.id}
                  className="flex items-start gap-2 text-sm border-b border-border/40 pb-2 last:border-0"
                >
                  <div className="flex items-center gap-1 shrink-0 pt-0.5">
                    <ClubBadge clubId={record.fromClubId} size={18} />
                    <span className="text-muted-foreground text-xs">→</span>
                    <ClubBadge clubId={record.toClubId} size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold truncate">{record.playerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {clubName(record.fromClubId)} → {clubName(record.toClubId)} ·{" "}
                      {record.fee > 0 ? formatEuro(record.fee) : describeTransfer(record)} ·{" "}
                      {record.date}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
