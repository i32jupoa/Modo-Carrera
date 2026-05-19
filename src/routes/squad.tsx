import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { loadSave, saveSave } from "@/lib/store";
import { teamById } from "@/data/teams";
import { TeamBadge } from "@/components/TeamBadge";
import {
  usePlayersStore,
  type FcPlayer,
  formatEuro,
  marketValueEuros,
  mapEaPosition,
  POS_LABEL_ES,
} from "@/store/playersStore";
import { PlayersLoading, usePlayersReady } from "@/components/PlayersLoading";
import { toast } from "sonner";
import { Wallet, UserMinus } from "lucide-react";
import { useTransferMarket } from "@/hooks/useTransferMarket";
import { MarketStatusBanner } from "@/components/MarketStatusBanner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/squad")({ component: SquadPage });

function ovrColor(ovr: number): string {
  if (ovr >= 85) return "bg-green-500/20 text-green-300 border-green-500/40";
  if (ovr >= 75) return "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";
  return "bg-muted text-muted-foreground border-border/40";
}

function statColor(v: number): string {
  if (v >= 85) return "text-green-400";
  if (v >= 75) return "text-yellow-300";
  if (v >= 60) return "text-foreground";
  return "text-muted-foreground";
}

const STAT_COLS: { key: keyof Pick<FcPlayer, "PAC" | "SHO" | "PAS" | "DRI" | "DEF" | "PHY">; label: string }[] = [
  { key: "PAC", label: "PAC" },
  { key: "SHO", label: "SHO" },
  { key: "PAS", label: "PAS" },
  { key: "DRI", label: "DRI" },
  { key: "DEF", label: "DEF" },
  { key: "PHY", label: "PHY" },
];

function SquadPage() {
  const navigate = useNavigate();
  const { loading } = usePlayersReady();
  const myTeamId = usePlayersStore((s) => s.myTeamId);
  const squad = usePlayersStore((s) => s.squad);
  const budget = usePlayersStore((s) => s.budget);
  const setMyTeam = usePlayersStore((s) => s.setMyTeam);
  const hydrate = usePlayersStore((s) => s.hydrateMyTeam);
  const sellPlayer = usePlayersStore((s) => s.sellPlayer);
  const { isMarketOpen } = useTransferMarket();

  useEffect(() => {
    const save = loadSave();
    if (!save) {
      navigate({ to: "/" });
      return;
    }
    if (!myTeamId) {
      setMyTeam(save.myTeamId);
    } else if (squad.length === 0) {
      hydrate();
    }
  }, [myTeamId, squad.length, navigate, setMyTeam, hydrate]);

  const sorted = useMemo(
    () => squad.slice().sort((a, b) => b.OVR - a.OVR),
    [squad],
  );

  function handleSell(p: FcPlayer) {
    const id = String(p.ID);
    const price = marketValueEuros(p);
    const result = sellPlayer(id, price);
    if (!result.ok) {
      toast.error("No se pudo vender", { description: result.reason });
      return;
    }
    const save = loadSave();
    if (save && save.lineups[save.myTeamId]) {
      save.lineups[save.myTeamId] = save.lineups[save.myTeamId].filter((x) => x !== id);
      saveSave(save);
    }
    toast.success(`${p.Name} vendido`, {
      description: `Ingreso: ${formatEuro(price)} · Saldo: ${formatEuro(usePlayersStore.getState().budget)}`,
    });
  }

  if (!myTeamId) return null;
  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <PlayersLoading message="Cargando datos de jugadores…" />
      </div>
    );
  }
  const team = teamById(myTeamId);
  const avgOvr = sorted.length
    ? (sorted.reduce((s, p) => s + p.OVR, 0) / sorted.length).toFixed(1)
    : "—";

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <MarketStatusBanner className="mb-6" />

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <TeamBadge team={team} size={48} />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-black truncate">Mi Plantilla — {team.name}</h1>
          <p className="text-xs text-muted-foreground">
            {sorted.length} jugadores · OVR medio {avgOvr} · Datos EA FC 26
          </p>
        </div>
        <div className="panel-glow px-4 py-2.5 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <div>
            <p className="text-[0.6rem] uppercase text-muted-foreground">Presupuesto</p>
            <p className="text-lg font-black scoreline text-primary">{formatEuro(budget)}</p>
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="panel p-6">
          <p className="text-sm text-muted-foreground">
            No hay jugadores en la base de datos local para <strong>{team.name}</strong>.
            Añade entradas a <code className="text-primary">src/data/players.json</code> con
            <code className="text-primary"> Team: "{team.name}"</code>.
          </p>
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/40">
                <TableHead className="w-16">OVR</TableHead>
                <TableHead>Jugador</TableHead>
                <TableHead className="w-20 text-center">Pos</TableHead>
                <TableHead className="w-24 text-right">Valor</TableHead>
                <TableHead className="w-28" />
                {STAT_COLS.map((c) => (
                  <TableHead key={c.key} className="text-center w-14 scoreline">
                    {c.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((p) => (
                <TableRow key={p.ID} className="border-border/40">
                  <TableCell>
                    <span className={`scoreline text-sm font-black px-2 py-1 rounded border ${ovrColor(p.OVR)}`}>
                      {p.OVR}
                    </span>
                  </TableCell>
                  <TableCell className="font-semibold">{p.Name}</TableCell>
                  <TableCell className="text-center text-xs font-bold text-muted-foreground">
                    {POS_LABEL_ES[mapEaPosition(p.Position)]}
                  </TableCell>
                  <TableCell className="text-right text-xs scoreline font-bold text-primary">
                    {formatEuro(marketValueEuros(p))}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      type="button"
                      onClick={() => handleSell(p)}
                      disabled={sorted.length <= 11 || !isMarketOpen}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-destructive/50 text-destructive text-xs font-bold hover:bg-destructive/10 disabled:opacity-40 disabled:cursor-not-allowed transition"
                      title={sorted.length <= 11 ? "Mínimo 11 jugadores" : "Vender jugador"}
                    >
                      <UserMinus className="h-3 w-3" />
                      Vender
                    </button>
                  </TableCell>
                  {STAT_COLS.map((c) => (
                    <TableCell
                      key={c.key}
                      className={`text-center scoreline font-bold ${statColor(p[c.key])}`}
                    >
                      {p[c.key]}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
