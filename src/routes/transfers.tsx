import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadSave, SaveGame } from "@/lib/store";
import { TEAMS, teamById } from "@/data/teams";
import type { Position } from "@/data/players";
import { TeamBadge } from "@/components/TeamBadge";
import { PlayersLoading, usePlayersReady } from "@/components/PlayersLoading";
import {
  usePlayersStore,
  formatEuro,
  marketValueEuros,
  mapEaPosition,
  POS_LABEL_ES,
} from "@/store/playersStore";
import { toast } from "sonner";
import { Search, Wallet, UserPlus } from "lucide-react";
import { useTransferMarket } from "@/hooks/useTransferMarket";
import { MarketStatusBanner } from "@/components/MarketStatusBanner";

export const Route = createFileRoute("/transfers")({ component: TransfersPage });

const TEAM_NAME_TO_ID: Record<string, string> = Object.fromEntries(
  TEAMS.map((t) => [t.name, t.id]),
);

const POS_FILTERS: { value: Position | "all"; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "GK", label: "POR" },
  { value: "DEF", label: "DEF" },
  { value: "MID", label: "MED" },
  { value: "FWD", label: "DEL" },
];

function ovrBadgeClass(ovr: number): string {
  if (ovr >= 85) return "bg-green-500/20 text-green-300 border-green-500/40";
  if (ovr >= 75) return "bg-yellow-500/20 text-yellow-500/40";
  return "bg-muted text-muted-foreground border-border/40";
}

function TransfersPage() {
  const navigate = useNavigate();
  const { loading, ready } = usePlayersReady();
  const budget = usePlayersStore((s) => s.budget);
  const buyPlayer = usePlayersStore((s) => s.buyPlayer);
  const searchMarket = usePlayersStore((s) => s.searchMarket);
  const myTeamId = usePlayersStore((s) => s.myTeamId);
  const setMyTeam = usePlayersStore((s) => s.setMyTeam);
  const { isMarketOpen } = useTransferMarket();

  const [save, setSave] = useState<SaveGame | null>(null);
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<Position | "all">("all");

  useEffect(() => {
    const s = loadSave();
    if (!s) {
      navigate({ to: "/" });
      return;
    }
    setSave(s);
    if (!myTeamId) setMyTeam(s.myTeamId);
  }, [navigate, myTeamId, setMyTeam]);

  const players = useMemo(() => {
    if (!ready) return [];
    return searchMarket({ search, position: posFilter, limit: 100 });
  }, [ready, search, posFilter, searchMarket, budget]);

  function handleBuy(playerId: string, name: string, cost: number) {
    const result = buyPlayer(playerId, cost);
    if (result.ok) {
      toast.success(`${name} fichado`, {
        description: `Coste: ${formatEuro(cost)} · Saldo: ${formatEuro(usePlayersStore.getState().budget)}`,
      });
    } else {
      toast.error("No se pudo fichar", { description: result.reason });
    }
  }

  if (!save) return null;
  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <PlayersLoading message="Cargando mercado de fichajes…" />
      </div>
    );
  }

  const myTeam = myTeamId ? teamById(myTeamId) : null;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <MarketStatusBanner className="mb-6" />

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black">Mercado de fichajes</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Hasta 100 resultados · jugadores fuera de tu plantilla
            {myTeam ? ` · ${myTeam.name}` : ""}
          </p>
        </div>
        <div className="panel-glow px-4 py-3 flex items-center gap-3 min-w-[200px]">
          <Wallet className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Presupuesto</p>
            <p className="text-xl font-black scoreline text-primary">{formatEuro(budget)}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre…"
            className="w-full bg-secondary border border-border rounded-lg pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {POS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setPosFilter(f.value)}
              className={`px-3 py-2 rounded-lg text-xs font-bold border transition ${
                posFilter === f.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border hover:border-primary/50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {players.length === 0 ? (
        <div className="panel p-10 text-center text-sm text-muted-foreground">
          No hay jugadores que coincidan con los filtros.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {players.map((p) => {
            const id = String(p.ID);
            const pos = mapEaPosition(p.Position);
            const cost = marketValueEuros(p);
            const clubId = TEAM_NAME_TO_ID[p.Team];
            const club = clubId ? teamById(clubId) : null;
            const canAfford = budget >= cost;

            return (
              <article
                key={id}
                className="panel overflow-hidden flex flex-col hover:border-primary/40 transition"
              >
                <div className="flex gap-3 p-3 border-b border-border/40">
                  <div className="w-14 h-[4.5rem] shrink-0 rounded overflow-hidden bg-secondary/60 grid place-items-center">
                    {p.card ? (
                      <img
                        src={p.card}
                        alt=""
                        className="w-full h-full object-cover object-top"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-2xl opacity-40">⚽</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold truncate text-sm leading-tight">{p.Name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {POS_LABEL_ES[pos]} · {p.Age}a
                    </p>
                    {club && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <TeamBadge team={club} size={18} />
                        <span className="text-[0.65rem] text-muted-foreground truncate">{p.Team}</span>
                      </div>
                    )}
                  </div>
                  <span
                    className={`scoreline text-sm font-black px-2 py-1 rounded border h-fit ${ovrBadgeClass(p.OVR)}`}
                  >
                    {p.OVR}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 p-3 mt-auto">
                  <div>
                    <p className="text-[0.6rem] uppercase text-muted-foreground">Valor</p>
                    <p className="font-black scoreline text-primary">{formatEuro(cost)}</p>
                  </div>
                  <button
                    type="button"
                    disabled={!canAfford || !isMarketOpen}
                    onClick={() => handleBuy(id, p.Name, cost)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Fichar
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
