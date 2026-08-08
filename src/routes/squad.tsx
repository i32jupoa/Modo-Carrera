import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadSave, saveSave } from "@/lib/store";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import { TeamLogo } from "@/components/TeamLogo";
import { PlayerFace, ROLE_TEXT, roleFromPosition } from "@/components/PlayerFace";
import {
  usePlayersStore,
  type FcPlayer,
  formatEuro,
  marketValueEuros,
  mapEaPosition,
  POS_LABEL_ES,
} from "@/store/playersStore";
import type { Position } from "@/data/players";
import { PlayersLoading, usePlayersReady } from "@/components/PlayersLoading";
import { toast } from "sonner";
import {
  Wallet,
  UserMinus,
  Smile,
  Meh,
  Frown,
  HeartHandshake,
  Tag,
  X,
  Activity,
  ShieldAlert,
  Goal,
  Sparkles,
} from "lucide-react";
import { useTransferMarket } from "@/hooks/useTransferMarket";
import { MarketStatusBanner } from "@/components/MarketStatusBanner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/squad")({ component: SquadPage });

function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

const POSITION_ORDER: Position[] = ["GK", "DEF", "MID", "FWD"];
const POSITION_FULL: Record<Position, string> = {
  GK: "Porteros",
  DEF: "Defensas",
  MID: "Centrocampistas",
  FWD: "Delanteros",
};
const POSITION_ACCENT: Record<Position, string> = {
  GK: "from-amber-500/30 to-amber-500/0 border-amber-500/40 text-amber-300",
  DEF: "from-sky-500/30 to-sky-500/0 border-sky-500/40 text-sky-300",
  MID: "from-emerald-500/30 to-emerald-500/0 border-emerald-500/40 text-emerald-300",
  FWD: "from-rose-500/30 to-rose-500/0 border-rose-500/40 text-rose-300",
};

function ovrTone(ovr: number): string {
  if (ovr >= 85) return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
  if (ovr >= 78) return "bg-primary/15 text-primary border-primary/40";
  if (ovr >= 70) return "bg-yellow-500/15 text-yellow-300 border-yellow-500/40";
  return "bg-muted text-muted-foreground border-border/40";
}

function moodLabel(m: number) {
  if (m >= 80) return { label: "Encantado", Icon: Smile, tone: "text-emerald-400" };
  if (m >= 60) return { label: "Satisfecho", Icon: Smile, tone: "text-primary" };
  if (m >= 40) return { label: "Indiferente", Icon: Meh, tone: "text-yellow-300" };
  if (m >= 20) return { label: "Descontento", Icon: Frown, tone: "text-orange-400" };
  return { label: "Furioso", Icon: Frown, tone: "text-destructive" };
}

function StatBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(99, value));
  const tone =
    v >= 85 ? "bg-emerald-400" : v >= 75 ? "bg-primary" : v >= 60 ? "bg-yellow-400" : "bg-muted-foreground";
  return (
    <div>
      <div className="flex items-center justify-between text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <span className="scoreline text-foreground">{v}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
        <div className={`h-full ${tone}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

function PlayerCard({
  p,
  onClick,
}: {
  p: FcPlayer;
  onClick: () => void;
}) {
  const stats = usePlayersStore((s) => s.stats[String(p.ID)]);
  const pos = mapEaPosition(p.Position);
  const morale = stats?.morale ?? 70;
  const mood = moodLabel(morale);
  const injured = (stats?.injuredUntil ?? 0) > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card/80 p-3 text-left transition hover:-translate-y-0.5 hover:border-primary/60 hover:bg-card"
    >
      <PlayerFace
        name={p.Name}
        image={p.card}
        role={roleFromPosition(p.Position)}
        size={48}
        className="bg-secondary/40"
      />
      <div
        className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg border scoreline text-lg font-black ${ovrTone(
          p.OVR,
        )}`}
      >
        {p.OVR}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-bold">{p.Name}</span>
          {injured && (
            <span title="Lesionado" className="text-destructive">
              <Activity className="h-3 w-3" />
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
          <span
            className={`rounded bg-secondary/60 px-1.5 py-0.5 font-black ${
              ROLE_TEXT[roleFromPosition(p.Position)]
            }`}
          >
            {POS_LABEL_ES[pos]}
          </span>
          <span>{p.Age}a</span>
          <span className="text-primary/80 scoreline">{formatEuro(marketValueEuros(p))}</span>
        </div>
      </div>
      <div className={`flex flex-col items-end gap-1 ${mood.tone}`}>
        <mood.Icon className="h-4 w-4" />
        <span className="text-[0.55rem] font-bold uppercase tracking-wider">{mood.label}</span>
      </div>
    </button>
  );
}

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listed, setListed] = useState<Set<string>>(() => new Set());

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

  const byPos = useMemo(() => {
    const buckets: Record<Position, FcPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    for (const p of squad) buckets[mapEaPosition(p.Position)].push(p);
    for (const k of POSITION_ORDER) buckets[k].sort((a, b) => b.OVR - a.OVR);
    return buckets;
  }, [squad]);

  const avgOvr = squad.length
    ? (squad.reduce((s, p) => s + p.OVR, 0) / squad.length).toFixed(1)
    : "—";
  const totalValue = squad.reduce((s, p) => s + marketValueEuros(p), 0);

  const selected = selectedId ? squad.find((p) => String(p.ID) === selectedId) ?? null : null;
  const selectedStats = selected ? usePlayersStore.getState().stats[String(selected.ID)] : undefined;

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
    setSelectedId(null);
  }

  function handleRenew(p: FcPlayer) {
    const cost = Math.round(marketValueEuros(p) * 0.18);
    toast.success(`${p.Name} ha renovado`, {
      description: `Nuevo contrato hasta 2029 · Prima de renovación: ${formatEuro(cost)}`,
    });
  }

  function handleToggleListed(p: FcPlayer) {
    const id = String(p.ID);
    setListed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        toast.info(`${p.Name} retirado del mercado`);
      } else {
        next.add(id);
        toast.success(`${p.Name} en el mercado`, {
          description: `Precio de salida: ${formatEuro(marketValueEuros(p))}`,
        });
      }
      return next;
    });
  }

  if (!myTeamId) return null;
  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <PlayersLoading message="Cargando datos de jugadores…" />
      </div>
    );
  }
  const team = teamById(myTeamId);

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <MarketStatusBanner className="mb-6" />

      {/* Header card */}
      <div className="panel-glow mb-6 overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 p-5 sm:flex sm:flex-wrap sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <TeamLogo teamName={team.name} leagueName={getLeagueName(team.league)} size={56} />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-black sm:text-2xl">{team.name}</h1>
              <p className="text-xs text-muted-foreground">Mi Plantilla · {getLeagueName(team.league)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-center">
              <p className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">Jugadores</p>
              <p className="scoreline text-lg font-black">{squad.length}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-center">
              <p className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">OVR Medio</p>
              <p className="scoreline text-lg font-black text-primary">{avgOvr}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-center">
              <p className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">Valor</p>
              <p className="scoreline text-lg font-black text-emerald-400">{formatEuro(totalValue)}</p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2">
              <Wallet className="h-4 w-4 text-primary" />
              <div>
                <p className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">Saldo</p>
                <p className="scoreline text-lg font-black text-primary">{formatEuro(budget)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {squad.length === 0 ? (
        <div className="panel p-6">
          <p className="text-sm text-muted-foreground">
            No hay jugadores en la base de datos local para <strong>{team.name}</strong>.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {POSITION_ORDER.map((pos) => {
            const players = byPos[pos];
            if (players.length === 0) return null;
            return (
              <section key={pos}>
                <div
                  className={`mb-3 flex items-center gap-3 rounded-xl border bg-gradient-to-r p-3 ${POSITION_ACCENT[pos]}`}
                >
                  <span className="scoreline text-2xl font-black">{POS_LABEL_ES[pos]}</span>
                  <div className="flex-1">
                    <p className="text-sm font-bold uppercase tracking-wider">
                      {POSITION_FULL[pos]}
                    </p>
                    <p className="text-[0.65rem] uppercase tracking-wider opacity-70">
                      {players.length} jugadores ·{" "}
                      OVR medio{" "}
                      {(players.reduce((s, p) => s + p.OVR, 0) / players.length).toFixed(1)}
                    </p>
                  </div>
                  {listed.size > 0 && (
                    <span className="rounded-full border border-current/30 bg-background/40 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider">
                      {players.filter((p) => listed.has(String(p.ID))).length} en mercado
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {players.map((p) => (
                    <PlayerCard
                      key={p.ID}
                      p={p}
                      onClick={() => setSelectedId(String(p.ID))}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Player detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          {selected && (() => {
            const pos = mapEaPosition(selected.Position);
            const morale = selectedStats?.morale ?? 70;
            const mood = moodLabel(morale);
            const injured = (selectedStats?.injuredUntil ?? 0) > 0;
            const isListed = listed.has(String(selected.ID));
            const value = marketValueEuros(selected);
            return (
              <>
                <div className={`bg-gradient-to-br p-5 ${POSITION_ACCENT[pos]}`}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="absolute right-3 top-3 rounded-full p-1 text-foreground/70 hover:bg-background/30"
                    aria-label="Cerrar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <DialogHeader className="space-y-3">
                    <div className="flex items-center gap-4">
                      <div className={`grid h-16 w-16 place-items-center rounded-xl border scoreline text-2xl font-black ${ovrTone(selected.OVR)}`}>
                        {selected.OVR}
                      </div>
                      <div className="min-w-0">
                        <DialogTitle className="truncate text-xl font-black">
                          {selected.Name}
                        </DialogTitle>
                        <DialogDescription className="text-xs uppercase tracking-wider">
                          {POS_LABEL_ES[pos]} · {selected.Age} años · {selected.Position}
                        </DialogDescription>
                      </div>
                    </div>
                  </DialogHeader>
                </div>

                <div className="space-y-5 p-5">
                  {/* Mood / Stats summary */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-border/60 bg-card/60 p-3 text-center">
                      <p className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">Valor</p>
                      <p className="scoreline text-sm font-black text-emerald-400">{formatEuro(value)}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-card/60 p-3 text-center">
                      <p className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">Goles</p>
                      <p className="scoreline text-sm font-black text-primary">
                        <Goal className="mr-1 inline h-3 w-3" />
                        {selectedStats?.goals ?? 0}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-card/60 p-3 text-center">
                      <p className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">Asist.</p>
                      <p className="scoreline text-sm font-black text-accent">
                        <Sparkles className="mr-1 inline h-3 w-3" />
                        {selectedStats?.assists ?? 0}
                      </p>
                    </div>
                  </div>

                  {/* Morale meter */}
                  <div className="rounded-lg border border-border/60 bg-card/60 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
                        Estado de ánimo
                      </span>
                      <span className={`flex items-center gap-1 text-sm font-bold ${mood.tone}`}>
                        <mood.Icon className="h-4 w-4" />
                        {mood.label}
                      </span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted/40">
                      <div
                        className={`h-full ${
                          morale >= 60 ? "bg-emerald-400" : morale >= 40 ? "bg-yellow-400" : "bg-destructive"
                        }`}
                        style={{ width: `${Math.max(4, morale)}%` }}
                      />
                    </div>
                  </div>

                  {/* Six stats */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <StatBar label="PAC" value={selected.PAC} />
                    <StatBar label="SHO" value={selected.SHO} />
                    <StatBar label="PAS" value={selected.PAS} />
                    <StatBar label="DRI" value={selected.DRI} />
                    <StatBar label="DEF" value={selected.DEF} />
                    <StatBar label="PHY" value={selected.PHY} />
                  </div>

                  {/* Status flags */}
                  {(injured || isListed) && (
                    <div className="flex flex-wrap gap-2">
                      {injured && (
                        <span className="flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-destructive">
                          <Activity className="h-3 w-3" />
                          Lesionado
                        </span>
                      )}
                      {isListed && (
                        <span className="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-amber-400">
                          <Tag className="h-3 w-3" />
                          En el mercado
                        </span>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => handleRenew(selected)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/20"
                    >
                      <HeartHandshake className="h-4 w-4" />
                      Renovar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleListed(selected)}
                      disabled={!isMarketOpen}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        isListed
                          ? "border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                          : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                      }`}
                    >
                      <Tag className="h-4 w-4" />
                      {isListed ? "Retirar" : "Mercado"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSell(selected)}
                      disabled={squad.length <= 11 || !isMarketOpen}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive transition hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-40"
                      title={squad.length <= 11 ? "Mínimo 11 jugadores" : "Vender al instante"}
                    >
                      <UserMinus className="h-4 w-4" />
                      Vender
                    </button>
                  </div>

                  {!isMarketOpen && (
                    <p className="flex items-center gap-1 text-[0.65rem] text-muted-foreground">
                      <ShieldAlert className="h-3 w-3" />
                      Mercado cerrado. Las operaciones se reanudarán en la próxima ventana.
                    </p>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
