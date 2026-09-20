import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, Crown, Filter, Goal, ListOrdered, Medal, Shield, Swords, Star, Trophy } from "lucide-react";
import { loadSave, type SaveGame } from "@/lib/store";
import {
  getAllLeagueIds,
  getAwardPlayers,
  getAwardsSnapshot,
  getMonthlyAward,
  getMonthlyPeriods,
  type AwardPlayer,
  type BallonDorCandidate,
  type GoldenPassCandidate,
  type GoldenShoeCandidate,
  type ChampionsRankingEntry,
  type MonthlyAward,
  type MonthlyPeriod,
  type SeasonAward,
} from "@/lib/awards";
import { PlayersLoading, usePlayersReady } from "@/components/PlayersLoading";
import { TeamLogo } from "@/components/TeamLogo";
import { LeagueLogo } from "@/components/LeagueLogo";
import { faceUrl } from "@/lib/playerFaces";
import { LEAGUES, teamById, type LeagueId } from "@/data/teams";
import { usePlayersStore } from "@/store/playersStore";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/awards")({ component: AwardsPage });

function PlayerIdentity({ player, size = "md" }: { player: AwardPlayer; size?: "sm" | "md" }) {
  const imageSize = size === "sm" ? "h-9 w-9" : "h-14 w-14";
  return (
    <div className="flex min-w-0 items-center gap-3">
      <img
        src={faceUrl(player.id, player.cardImage)}
        alt={player.name}
        className={`${imageSize} rounded-full border border-border/60 bg-secondary/50 object-cover object-top`}
        loading="lazy"
      />
      <div className="min-w-0">
        <div className={`truncate font-black ${size === "sm" ? "text-sm" : "text-lg"}`}>{player.name}</div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <TeamLogo teamName={player.teamName} leagueName={player.leagueName} size={size === "sm" ? 16 : 18} />
          <span className="truncate">{player.teamName}</span>
        </div>
      </div>
    </div>
  );
}

function AwardCard({ icon, title, award }: { icon: ReactNode; title: string; award: SeasonAward }) {
  return (
    <Card className="overflow-hidden border-border/60 bg-card/70">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
          {icon}
          {title}
          {award.provisional && <Badge variant="secondary" className="ml-auto text-[0.6rem]">Provisional</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {award.player ? (
          <div className="space-y-2">
            <PlayerIdentity player={award.player} />
            <div className="text-xs text-muted-foreground">{award.detail}</div>
          </div>
        ) : (
          <div className="py-7 text-sm text-muted-foreground">{award.detail}</div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-secondary/20 p-2.5">
      <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-black">{value}</div>
    </div>
  );
}

function RankPill({ rank }: { rank: number }) {
  return <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/50 bg-secondary/40 text-xs font-black">{rank}</div>;
}

function RankingRow({ rank, player, stat }: { rank: number; player: AwardPlayer; stat?: string }) {
  return (
    <div className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border/40 bg-secondary/10 px-3 py-2.5">
      <RankPill rank={rank} />
      <PlayerIdentity player={player} size="sm" />
      {stat && <div className="text-right text-[0.68rem] text-muted-foreground">{stat}</div>}
    </div>
  );
}

function RankingList({
  title,
  icon,
  entries,
  renderStat,
  maxHeight = "max-h-[760px]",
}: {
  title: string;
  icon: ReactNode;
  entries: AwardPlayer[];
  renderStat?: (entry: AwardPlayer) => string;
  maxHeight?: string;
}) {
  return (
    <Card className="border-border/60 bg-card/70">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-black">{icon}{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length ? (
          <div className={`space-y-2 overflow-auto pr-1 ${maxHeight}`}>
            {entries.map((entry, index) => <RankingRow key={`${entry.id}-${index}`} rank={index + 1} player={entry} stat={renderStat?.(entry)} />)}
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-muted-foreground">No hay datos suficientes.</div>
        )}
      </CardContent>
    </Card>
  );
}

const AWARDS_PITCH_SLOTS = [
  { key: "gk", top: 90, left: 50 },
  { key: "lb", top: 76, left: 14 },
  { key: "cb1", top: 80, left: 35 },
  { key: "cb2", top: 80, left: 65 },
  { key: "rb", top: 76, left: 86 },
  { key: "cm1", top: 59, left: 31 },
  { key: "cm2", top: 59, left: 69 },
  { key: "cam", top: 42, left: 50 },
  { key: "lw", top: 27, left: 14 },
  { key: "st", top: 18, left: 50 },
  { key: "rw", top: 27, left: 86 },
] as const;

function XIPlayers({ players, ratingByPlayer }: { players: AwardPlayer[]; ratingByPlayer?: Map<string, number> }) {
  return (
    <div className="space-y-2">
      {players.map((player, index) => {
        const rating = ratingByPlayer?.get(player.id) ?? player.averageRating;
        return (
          <div key={player.id} className="flex items-center gap-2 rounded-lg border border-border/40 bg-secondary/20 px-2.5 py-2">
            <span className="w-5 text-center text-[0.65rem] font-black text-muted-foreground">{index + 1}</span>
            <img src={faceUrl(player.id, player.cardImage)} alt={player.name} loading="lazy" className="h-8 w-8 rounded object-cover object-top" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{player.name}</div>
              <div className="flex min-w-0 items-center gap-1.5 text-[0.65rem] text-muted-foreground">
                <TeamLogo teamName={player.teamName} leagueName={player.leagueName} size={16} />
                <span className="truncate">{player.teamName}</span>
              </div>
            </div>
            <div className="text-xs font-black">{rating.toFixed(2)}</div>
          </div>
        );
      })}
    </div>
  );
}

function AwardsPitch({ players, ratingByPlayer }: { players: AwardPlayer[]; ratingByPlayer?: Map<string, number> }) {
  return (
    <div className="relative mx-auto w-full max-w-[500px]">
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl border-2 border-green-600/30 bg-green-800/20">
        <div className="absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-green-500/35" />
          <div className="absolute left-0 right-0 top-1/2 h-px bg-green-500/35" />
          <div className="absolute left-1/2 top-0 h-12 w-28 -translate-x-1/2 border-2 border-t-0 border-green-500/35" />
          <div className="absolute bottom-0 left-1/2 h-12 w-28 -translate-x-1/2 border-2 border-b-0 border-green-500/35" />
        </div>

        {AWARDS_PITCH_SLOTS.map((slot, index) => {
          const player = players[index];
          if (!player) return null;
          const rating = ratingByPlayer?.get(player.id) ?? player.averageRating;
          return (
            <div
              key={slot.key}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ top: `${slot.top}%`, left: `${slot.left}%` }}
            >
              <div className="relative">
                <img
                  src={faceUrl(player.id, player.cardImage)}
                  alt={player.name}
                  loading="lazy"
                  className="h-12 w-12 rounded-full border-2 border-white/80 bg-background object-cover object-top shadow-lg sm:h-14 sm:w-14"
                />
                <div className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full border border-white/80 bg-white px-1 text-[0.62rem] font-black text-black shadow">
                  {rating.toFixed(1)}
                </div>
                <div className="absolute -bottom-1 -left-1 rounded-full border border-white/70 bg-background p-0.5 shadow">
                  <TeamLogo teamName={player.teamName} leagueName={player.leagueName} size={18} />
                </div>
              </div>
              <div className="mt-0.5 max-w-[92px] truncate rounded bg-background/90 px-1.5 py-0.5 text-[0.58rem] font-bold shadow-sm">
                {player.name.split(" ").pop()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function XIBlock({ title, subtitle, players, ratingByPlayer }: { title: string; subtitle: string; players: AwardPlayer[]; ratingByPlayer?: Map<string, number> }) {
  return (
    <Card className="border-border/60 bg-card/70">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-black"><Trophy className="h-4 w-4" />{title}</CardTitle>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </CardHeader>
      <CardContent className="grid items-start gap-5 lg:grid-cols-[minmax(420px,500px)_1fr]">
        {players.length === 11 ? (
          <AwardsPitch players={players} ratingByPlayer={ratingByPlayer} />
        ) : (
          <div className="grid min-h-[420px] place-items-center rounded-xl border border-dashed border-border/60 px-8 text-center text-sm text-muted-foreground">
            Aún no hay 11 jugadores con datos suficientes para formar el 4-3-3 con MCO respetando sus demarcaciones.
          </div>
        )}
        <XIPlayers players={players} ratingByPlayer={ratingByPlayer} />
      </CardContent>
    </Card>
  );
}

function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/50 bg-secondary/10 p-3"><Filter className="mb-2 h-4 w-4 text-muted-foreground" />{children}</div>;
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><div className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>{children}</div>;
}

function LeagueSelect({ value, onChange }: { value: LeagueId; onChange: (value: LeagueId) => void }) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as LeagueId)}>
      <SelectTrigger className="w-[290px]">
        <SelectValue placeholder="Selecciona una liga" />
      </SelectTrigger>
      <SelectContent className="max-h-[420px]">
        {getAllLeagueIds().map((id) => (
          <SelectItem key={id} value={id}>
            <div className="flex items-center gap-2">
              <LeagueLogo league={LEAGUES[id]?.name ?? id} size="sm" className="shrink-0" />
              <span>{LEAGUES[id]?.name ?? id}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function BallonDorView({ ranking }: { ranking: BallonDorCandidate[] }) {
  const winner = ranking[0];
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.9fr)_1.4fr]">
      <div className="space-y-4">
        {winner ? (
          <Card className="overflow-hidden border-border/60 bg-card/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-black"><Crown className="h-4 w-4" />Ganador del Balón de Oro</CardTitle>
              <div className="text-xs text-muted-foreground">Rendimiento individual, partidos importantes, Champions, títulos y contexto competitivo pesan más que una sola estadística.</div>
            </CardHeader>
            <CardContent className="space-y-5">
              <PlayerIdentity player={winner} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Metric label="Media" value={winner.averageRating.toFixed(2)} />
                <Metric label="G+A" value={String(winner.seasonGoals + winner.seasonAssists)} />
                <Metric label="MVP" value={String(winner.seasonMVPs)} />
                <Metric label="Títulos" value={String(winner.titles)} />
                <Metric label="Champions" value={`${winner.uclGoals}G · ${winner.uclAssists}A`} />
                <Metric label="Puntos" value={winner.points.toFixed(1)} />
              </div>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between"><span>Media</span><span>{winner.ratingPoints.toFixed(1)}</span></div>
                <div className="flex justify-between"><span>Producción</span><span>{winner.productionPoints.toFixed(1)}</span></div>
                <div className="flex justify-between"><span>MVP</span><span>{winner.mvpPoints.toFixed(1)}</span></div>
                <div className="flex justify-between"><span>Champions</span><span>{winner.championsPoints.toFixed(1)}</span></div>
                <div className="flex justify-between"><span>Partidos decisivos</span><span>{winner.decisivePoints.toFixed(1)}{winner.uclFinalMvp ? " · MVP final" : ""}</span></div>
                <div className="flex justify-between"><span>Títulos</span><span>{winner.trophyPoints.toFixed(1)}</span></div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/60 bg-card/70"><CardContent className="py-16 text-center text-sm text-muted-foreground">No hay candidatos suficientes.</CardContent></Card>
        )}
      </div>

      <RankingList
        title="Top 30 — Balón de Oro"
        icon={<ListOrdered className="h-4 w-4" />}
        entries={ranking}
        renderStat={(entry) => `${entry.averageRating.toFixed(2)} media · ${entry.seasonGoals + entry.seasonAssists} G+A`}
        maxHeight="max-h-[820px]"
      />
    </div>
  );
}

function GoldenShoeView({ leaderboard, award }: { leaderboard: GoldenShoeCandidate[]; award: SeasonAward }) {
  return (
    <div className="space-y-4">
      <AwardCard icon={<Goal className="h-4 w-4" />} title="Bota de Oro" award={award} />
      <RankingList
        title="Top 30 — Bota de Oro"
        icon={<Goal className="h-4 w-4" />}
        entries={leaderboard}
        renderStat={(entry) => `${entry.leagueGoals} goles · ×${entry.leagueMultiplier} = ${entry.points.toFixed(1)} pts`}
        maxHeight="max-h-[820px]"
      />
    </div>
  );
}

function GoldenPassView({ leaderboard, award }: { leaderboard: GoldenPassCandidate[]; award: SeasonAward }) {
  return (
    <div className="space-y-4">
      <AwardCard icon={<Medal className="h-4 w-4" />} title="Pase de Oro" award={award} />
      <RankingList
        title="Top 30 — Pase de Oro"
        icon={<Medal className="h-4 w-4" />}
        entries={leaderboard}
        renderStat={(entry) => `${entry.leagueAssists} asistencias · ×${entry.leagueMultiplier} = ${entry.points.toFixed(1)} pts`}
        maxHeight="max-h-[820px]"
      />
    </div>
  );
}

function ChampionsView({ ranking, award, xi }: { ranking: ChampionsRankingEntry[]; award: SeasonAward; xi: AwardPlayer[] }) {
  return (
    <div className="space-y-4">
      <AwardCard icon={<Swords className="h-4 w-4" />} title="Mejor jugador Champions" award={award} />
      <XIBlock title="11 de la Champions" subtitle="4-3-3 con MCO. Los partidos de octavos, cuartos, semifinales y final tienen un peso especial." players={xi} />
      <RankingList
        title="Top Champions"
        icon={<Swords className="h-4 w-4" />}
        entries={ranking}
        renderStat={(entry) => `${entry.uclGoals} G · ${entry.uclAssists} A · ${entry.uclMotm} MVP`}
      />
    </div>
  );
}

function LeagueView({
  leagueId,
  setLeagueId,
  periods,
  periodKey,
  setPeriodKey,
  monthly,
}: {
  leagueId: LeagueId;
  setLeagueId: (id: LeagueId) => void;
  periods: MonthlyPeriod[];
  periodKey: string;
  setPeriodKey: (value: string) => void;
  monthly: MonthlyAward | null;
}) {
  const leagueName = LEAGUES[leagueId]?.name ?? leagueId;
  return (
    <div className="space-y-4">
      <FilterBar>
        <FilterField label="Liga">
          <LeagueSelect value={leagueId} onChange={setLeagueId} />
        </FilterField>
        <FilterField label="Mes">
          <Select value={periodKey} onValueChange={setPeriodKey}>
            <SelectTrigger className="w-[260px]"><SelectValue placeholder="Selecciona el mes" /></SelectTrigger>
            <SelectContent className="max-h-[420px]">
              {periods.map((period) => (
                <SelectItem key={`${period.year}-${period.month}`} value={`${period.year}-${period.month}`}>
                  {period.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
      </FilterBar>

      {monthly && !monthly.published ? (
        <Card className="border-border/60 bg-card/70">
          <CardContent className="py-16 text-center">
            <div className="text-base font-black">Mes en curso</div>
            <div className="mt-1 text-sm text-muted-foreground">El jugador del mes y el 11 del mes se publicarán cuando termine {monthly.label}.</div>
          </CardContent>
        </Card>
      ) : monthly?.available ? (
        <div className="space-y-4">
          <AwardCard
            icon={<Star className="h-4 w-4" />}
            title={`Jugador del mes · ${leagueName}`}
            award={{
              player: monthly.player,
              score: monthly.player?.points ?? 0,
              label: "Jugador del mes",
              detail: monthly.player
                ? `${monthly.player.monthlyStats.goals} goles · ${monthly.player.monthlyStats.assists} asistencias · ${monthly.player.monthlyStats.mvpCount} MVP · ${monthly.player.monthlyStats.averageRating.toFixed(2)} de media`
                : `No hay datos para ${monthly.label}.`,
              provisional: false,
            }}
          />
          <XIBlock
            title={`11 del mes · ${leagueName}`}
            subtitle={`${monthly.label} · sistema 4-3-3 con mediocentro ofensivo.`}
            players={monthly.xi}
            ratingByPlayer={new Map(monthly.ranking.map((entry) => [entry.id, entry.monthlyStats.averageRating]))}
          />
        </div>
      ) : (
        <Card className="border-border/60 bg-card/70"><CardContent className="py-16 text-center text-sm text-muted-foreground">No hay partidos registrados para {leagueName} en {periods.find((p) => `${p.year}-${p.month}` === periodKey)?.label ?? "ese mes"}.</CardContent></Card>
      )}
    </div>
  );
}

function SummaryView({ snapshot }: { snapshot: ReturnType<typeof getAwardsSnapshot> }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AwardCard icon={<Crown className="h-4 w-4" />} title="Balón de Oro" award={snapshot.ballon} />
        <AwardCard icon={<Star className="h-4 w-4" />} title="Golden Boy" award={snapshot.goldenBoy} />
        <AwardCard icon={<Goal className="h-4 w-4" />} title="Bota de Oro" award={snapshot.shoe.award} />
        <AwardCard icon={<Shield className="h-4 w-4" />} title="Guante de Oro" award={snapshot.glove} />
      </div>
      <XIBlock title="11 de la temporada" subtitle="Selección global de la temporada en 4-3-3 con mediocentro ofensivo y demarcaciones naturales." players={snapshot.seasonXI} />
      <Card className="border-border/60 bg-card/70">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base font-black"><Medal className="h-4 w-4" />Cómo se decide</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoTile title="Balón de Oro" text="30 puestos. La calidad del jugador es una condición previa; después pesan media, títulos, MVP y, especialmente, la Champions y sus rondas decisivas." />
          <InfoTile title="Bota de Oro" text="Estadística pura: goles de liga multiplicados por el coeficiente de cada competición." />
          <InfoTile title="Champions" text="Premio, top de rendimiento y XI propios. Un MVP en la final suma mucho, pero no garantiza el premio por sí solo." />
          <InfoTile title="Ligas" text="Elige cualquier liga y cualquier mes disponible para consultar jugador del mes, XI 4-3-3 y rendimiento mensual." />
        </CardContent>
      </Card>
    </div>
  );
}

function InfoTile({ title, text }: { title: string; text: string }) {
  return <div className="rounded-xl border border-border/40 bg-secondary/10 p-4"><div className="font-bold">{title}</div><div className="mt-1 text-xs leading-5 text-muted-foreground">{text}</div></div>;
}

function findCurrentOrFirstPeriod(periods: MonthlyPeriod[], currentDate?: string): string {
  if (!periods.length) return "";
  const parts = (currentDate ?? "").split("-").map(Number);
  const currentYear = parts[0];
  const currentMonth = Number.isFinite(parts[1]) ? parts[1] - 1 : NaN;
  if (Number.isFinite(currentYear) && Number.isFinite(currentMonth)) {
    const finalized = periods.find((period) => period.year < currentYear || (period.year === currentYear && period.month < currentMonth));
    if (finalized) return `${finalized.year}-${finalized.month}`;
  }
  return `${periods[0].year}-${periods[0].month}`;
}

function createAwardsShellError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "No se han podido calcular los premios de esta partida.";
}

function safeCalculateAwards(save: SaveGame, players: AwardPlayer[]) {
  try {
    return { snapshot: getAwardsSnapshot(save, players), error: null as string | null };
  } catch (error) {
    console.error("Awards calculation failed", error);
    return { snapshot: null, error: createAwardsShellError(error) };
  }
}

function AwardsPage() {
  const navigate = useNavigate();
  const { loading, ready } = usePlayersReady();
  const currentDate = usePlayersStore((state) => state.currentDate);
  const [save, setSave] = useState<SaveGame | null>(null);
  const [activeTab, setActiveTab] = useState("resumen");
  const [leagueId, setLeagueId] = useState<LeagueId>(() => getAllLeagueIds()[0] ?? "laliga");
  const [periodKey, setPeriodKey] = useState("");
  const [awardData, setAwardData] = useState<{
    players: AwardPlayer[];
    periods: MonthlyPeriod[];
    snapshot: ReturnType<typeof getAwardsSnapshot> | null;
    error: string | null;
  }>({ players: [], periods: [], snapshot: null, error: null });

  useEffect(() => {
    const loaded = loadSave();
    if (!loaded) {
      navigate({ to: "/" });
      return;
    }
    setSave(loaded);
    if (LEAGUES[loaded.myLeague]) setLeagueId(loaded.myLeague);
  }, [navigate, currentDate]);

  useEffect(() => {
    if (!save) {
      setAwardData({ players: [], periods: [], snapshot: null, error: null });
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      try {
        const nextPlayers = ready ? getAwardPlayers(save) : [];
        if (!ready) {
          if (!cancelled) setAwardData((current) => ({ ...current, error: null }));
          return;
        }
        const result = safeCalculateAwards(save, nextPlayers);
        if (!cancelled) {
          setAwardData((current) => ({ ...current, players: nextPlayers, snapshot: result.snapshot, error: result.error }));
        }
      } catch (error) {
        console.error("Awards page initialization failed", error);
        if (!cancelled) setAwardData((current) => ({ ...current, error: createAwardsShellError(error) }));
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [ready, save, currentDate]);

  const players = awardData.players;
  const periods = awardData.periods;
  const snapshot = awardData.snapshot;

  useEffect(() => {
    if (!ready || !save || activeTab !== "ligas" || !players.length) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const nextPeriods = getMonthlyPeriods(leagueId, players, save);
      if (!cancelled) setAwardData((current) => ({ ...current, periods: nextPeriods }));
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [ready, save, players, leagueId, activeTab, currentDate]);

  useEffect(() => {
    if (!periodKey && periods.length) setPeriodKey(findCurrentOrFirstPeriod(periods, currentDate));
  }, [periodKey, periods, currentDate]);

  useEffect(() => {
    if (periodKey && periods.length && !periods.some((p) => `${p.year}-${p.month}` === periodKey)) {
      setPeriodKey(findCurrentOrFirstPeriod(periods, currentDate));
    }
  }, [periodKey, periods, currentDate]);

  const selectedPeriod = useMemo(() => {
    const match = periods.find((p) => `${p.year}-${p.month}` === periodKey);
    return match ?? periods[0] ?? null;
  }, [periods, periodKey]);

  const [monthly, setMonthly] = useState<MonthlyAward | null>(null);
  const [monthlyError, setMonthlyError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !save || activeTab !== "ligas" || !selectedPeriod || !players.length) {
      setMonthly(null);
      setMonthlyError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      try {
        const result = getMonthlyAward(leagueId, selectedPeriod.year, selectedPeriod.month, players, save);
        if (!cancelled) {
          setMonthly(result);
          setMonthlyError(null);
        }
      } catch (error) {
        console.error("Monthly awards calculation failed", error);
        if (!cancelled) {
          setMonthly(null);
          setMonthlyError(createAwardsShellError(error));
        }
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [ready, save, activeTab, selectedPeriod, leagueId, players, currentDate]);

  if (!save) {
    return <div className="mx-auto max-w-7xl p-4 md:p-6"><PlayersLoading message="Cargando partida…" /></div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Premios</h1>
          <p className="mt-1 text-sm text-muted-foreground">Centro histórico de premios de la temporada, Champions y meses de cada liga.</p>
        </div>
        <Badge variant="outline" className="h-8 gap-2 px-3"><CalendarDays className="h-3.5 w-3.5" />{save.season}</Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto p-1">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="balon">Balón de Oro</TabsTrigger>
          <TabsTrigger value="bota">Bota de Oro</TabsTrigger>
          <TabsTrigger value="pase">Pase de Oro</TabsTrigger>
          <TabsTrigger value="champions">Champions</TabsTrigger>
          <TabsTrigger value="ligas">Ligas</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen">
          {snapshot ? <SummaryView snapshot={snapshot} /> : <PlayersLoading message={loading || !ready ? "Cargando datos de premios…" : (awardData.error ?? "Calculando premios…")} />}
        </TabsContent>
        <TabsContent value="balon">
          {snapshot ? <BallonDorView ranking={snapshot.ballonRanking} /> : <PlayersLoading message={loading || !ready ? "Cargando datos de premios…" : (awardData.error ?? "Calculando Balón de Oro…")} />}
        </TabsContent>
        <TabsContent value="bota">
          {snapshot ? <GoldenShoeView leaderboard={snapshot.shoe.leaderboard} award={snapshot.shoe.award} /> : <PlayersLoading message={loading || !ready ? "Cargando datos de premios…" : (awardData.error ?? "Calculando Bota de Oro…")} />}
        </TabsContent>
        <TabsContent value="pase">
          {snapshot ? <GoldenPassView leaderboard={snapshot.pass.leaderboard} award={snapshot.pass.award} /> : <PlayersLoading message={loading || !ready ? "Cargando datos de premios…" : (awardData.error ?? "Calculando Pase de Oro…")} />}
        </TabsContent>
        <TabsContent value="champions">
          {snapshot ? <ChampionsView ranking={snapshot.championsRanking} award={snapshot.championsPlayer} xi={snapshot.championsXI} /> : <PlayersLoading message={loading || !ready ? "Cargando datos de Champions…" : (awardData.error ?? "Calculando Champions…")} />}
        </TabsContent>
        <TabsContent value="ligas">
          {monthlyError ? (
            <Card className="border-border/60 bg-card/70">
              <CardContent className="py-16 text-center text-sm text-muted-foreground">{monthlyError}</CardContent>
            </Card>
          ) : (
            <LeagueView leagueId={leagueId} setLeagueId={setLeagueId} periods={periods} periodKey={selectedPeriod ? `${selectedPeriod.year}-${selectedPeriod.month}` : periodKey} setPeriodKey={setPeriodKey} monthly={monthly} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
