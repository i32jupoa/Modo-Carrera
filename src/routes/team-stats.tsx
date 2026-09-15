import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, type ReactNode } from "react";
import { Star, ShieldCheck, Activity, Goal, Sparkles, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { loadSave } from "@/lib/store";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import { TeamLogo } from "@/components/TeamLogo";
import { PlayerFace, ROLE_TEXT, roleFromPosition } from "@/components/PlayerFace";
import { usePlayersStore, mapEaPosition, POS_LABEL_ES, type FcPlayer, type PlayerStats } from "@/store/playersStore";
import type { Position } from "@/data/players";
import { PlayersLoading, usePlayersReady } from "@/components/PlayersLoading";
import { getPlayerForm } from "@/lib/playerForm";

export const Route = createFileRoute("/team-stats")({ component: TeamStatsPage });

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

function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

function fallbackStats(): PlayerStats {
  return {
    goals: 0,
    assists: 0,
    appearances: 0,
    cupGoals: 0,
    cupAssists: 0,
    cupAppearances: 0,
    uclGoals: 0,
    uclAssists: 0,
    uclAppearances: 0,
    cleanSheets: 0,
    cupCleanSheets: 0,
    uclCleanSheets: 0,
    motm: 0,
    cupMotm: 0,
    uclMotm: 0,
    injuredUntil: 0,
    morale: 70,
    formHistory: [],
    yellowCards: 0,
    redCards: 0,
    accumulatedYellowCards: 0,
  };
}

function averageRating(stats: PlayerStats | undefined): number | null {
  if (!stats) return null;
  const dynamic = stats.dynamicStats;
  if (dynamic && dynamic.seasonAppearances > 0) return dynamic.seasonAverageRating;
  if (stats.formHistory?.length) {
    return stats.formHistory.reduce((sum, value) => sum + value, 0) / stats.formHistory.length;
  }
  return null;
}

function teamSeasonRecord(save: ReturnType<typeof loadSave>, teamId: string) {
  if (!save) return { played: 0, won: 0, drawn: 0, lost: 0 };

  const fixtures = [
    ...(save.fixtures?.[save.myLeague] ?? []),
    ...Object.values(save.cupFixtures ?? {}).flat(),
    ...(save.uclFixtures ?? []),
  ];
  const seen = new Set<string>();
  const record = { played: 0, won: 0, drawn: 0, lost: 0 };

  for (const f of fixtures) {
    if (seen.has(f.id) || !f.result) continue;
    if (f.homeId !== teamId && f.awayId !== teamId) continue;
    seen.add(f.id);
    record.played += 1;

    let homeGoals = f.result.homeGoals ?? 0;
    let awayGoals = f.result.awayGoals ?? 0;
    if (f.result.extraTime) {
      homeGoals += f.result.extraTime.homeGoals ?? 0;
      awayGoals += f.result.extraTime.awayGoals ?? 0;
    }

    if (f.result.penalties) {
      const homePens = f.result.penalties.homeGoals ?? 0;
      const awayPens = f.result.penalties.awayGoals ?? 0;
      if (homePens > awayPens) homeGoals += 0.1;
      else if (awayPens > homePens) awayGoals += 0.1;
    }

    const won = f.homeId === teamId ? homeGoals > awayGoals : awayGoals > homeGoals;
    const drawn = homeGoals === awayGoals;
    if (drawn) record.drawn += 1;
    else if (won) record.won += 1;
    else record.lost += 1;
  }

  return record;
}

function StatPill({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[0.55rem] font-bold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 scoreline text-base font-black">{value}</div>
    </div>
  );
}

function TeamStatsPage() {
  const navigate = useNavigate();
  const { loading } = usePlayersReady();
  const myTeamId = usePlayersStore((s) => s.myTeamId);
  const squad = usePlayersStore((s) => s.squad);
  const setMyTeam = usePlayersStore((s) => s.setMyTeam);
  const hydrate = usePlayersStore((s) => s.hydrateMyTeam);
  const stats = usePlayersStore((s) => s.stats);

  useEffect(() => {
    const save = loadSave();
    if (!save) {
      navigate({ to: "/" });
      return;
    }
    if (!myTeamId) setMyTeam(save.myTeamId);
    else if (squad.length === 0) hydrate();
  }, [myTeamId, squad.length, navigate, setMyTeam, hydrate]);

  const grouped = useMemo(() => {
    const buckets: Record<Position, FcPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    for (const p of squad) buckets[mapEaPosition(p.Position)].push(p);
    for (const pos of POSITION_ORDER) {
      buckets[pos].sort((a, b) => b.OVR - a.OVR || a.Name.localeCompare(b.Name));
    }
    return buckets;
  }, [squad]);

  const save = loadSave();
  const teamRecord = useMemo(() => teamSeasonRecord(save, myTeamId ?? ""), [save, myTeamId]);

  const totals = useMemo(() => {
    return squad.reduce(
      (acc, player) => {
        const st = stats[String(player.ID)] ?? fallbackStats();
        acc.appearances += st.appearances ?? 0;
        acc.goals += st.goals ?? 0;
        acc.assists += st.assists ?? 0;
        acc.yellow += st.yellowCards ?? 0;
        acc.red += st.redCards ?? 0;
        acc.mvp += st.dynamicStats?.seasonMVPs ?? st.motm ?? 0;
        if (st.dynamicStats?.seasonCleanSheets != null) acc.clean += st.dynamicStats.seasonCleanSheets;
        else acc.clean += st.cleanSheets ?? 0;
        const rating = averageRating(st);
        if (rating != null && st.appearances > 0) {
          acc.ratingWeighted += rating * st.appearances;
          acc.ratingAppearances += st.appearances;
        }
        return acc;
      },
      { appearances: 0, goals: 0, assists: 0, yellow: 0, red: 0, mvp: 0, clean: 0, ratingWeighted: 0, ratingAppearances: 0 },
    );
  }, [squad, stats]);

  if (loading || !myTeamId || !save) {
    return (
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <PlayersLoading message="Cargando estadísticas de equipo…" />
      </div>
    );
  }

  const team = teamById(myTeamId);
  const teamAverage = squad.length ? squad.reduce((sum, p) => sum + p.OVR, 0) / squad.length : 0;
  const averageMatchRating = totals.ratingAppearances > 0 ? totals.ratingWeighted / totals.ratingAppearances : null;

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      <div className="panel-glow mb-6 overflow-hidden">
        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex items-center gap-4">
            <TeamLogo teamName={team.name} leagueName={getLeagueName(team.league)} size={58} />
            <div>
              <h1 className="text-xl font-black sm:text-2xl">Estadísticas de equipo</h1>
              <p className="text-xs text-muted-foreground">{team.name} · {getLeagueName(team.league)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <StatPill label="Jugadores" value={String(squad.length)} />
            <StatPill label="Media" value={teamAverage.toFixed(1)} />
            <StatPill label="PJ" value={String(teamRecord.played)} />
            <StatPill label="V / E / D" value={`${teamRecord.won} / ${teamRecord.drawn} / ${teamRecord.lost}`} />
            <StatPill label="Goles" value={String(totals.goals)} icon={<Goal className="h-3 w-3" />} />
            <StatPill label="Asis" value={String(totals.assists)} icon={<Sparkles className="h-3 w-3" />} />
            <StatPill label="MVP" value={String(totals.mvp)} icon={<Star className="h-3 w-3" />} />
            <StatPill label="P0" value={String(totals.clean)} icon={<ShieldCheck className="h-3 w-3" />} />
          </div>
        </div>
      </div>

      <div className="mb-5 rounded-xl border border-border/60 bg-card/50 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <StatPill label="G+A" value={String(totals.goals + totals.assists)} />
          <StatPill label="TA" value={String(totals.yellow)} />
          <StatPill label="TR" value={String(totals.red)} />
          <StatPill label="Nota media" value={averageMatchRating == null ? "—" : averageMatchRating.toFixed(2)} />
          <StatPill label="PJ valorados" value={String(totals.ratingAppearances)} icon={<Activity className="h-3 w-3" />} />
          <StatPill label="P0" value={String(totals.clean)} icon={<ShieldCheck className="h-3 w-3" />} />
        </div>
      </div>

      <div className="space-y-6">
        {POSITION_ORDER.map((pos) => {
          const players = grouped[pos];
          if (!players.length) return null;
          return (
            <section key={pos}>
              <div className={`mb-3 flex items-center gap-3 rounded-xl border bg-gradient-to-r p-3 ${POSITION_ACCENT[pos]}`}>
                <span className="scoreline text-2xl font-black">{POS_LABEL_ES[pos]}</span>
                <div className="flex-1">
                  <p className="text-sm font-bold uppercase tracking-wider">{POSITION_FULL[pos]}</p>
                  <p className="text-[0.65rem] uppercase tracking-wider opacity-70">{players.length} jugadores · Media {(players.reduce((sum, p) => sum + p.OVR, 0) / players.length).toFixed(1)}</p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border/60 bg-card/40">
                <table className="w-full min-w-[1080px] text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-[0.62rem] uppercase tracking-wider text-muted-foreground">
                      <th className="px-2 py-2 text-left">Jugador</th>
                      <th className="px-2 py-2 text-center">Med</th>
                      <th className="px-2 py-2 text-center">Edad</th>
                      <th className="px-2 py-2 text-center">PJ</th>
                      <th className="px-2 py-2 text-center">Goles</th>
                      <th className="px-2 py-2 text-center">Asis</th>
                      <th className="px-2 py-2 text-center">Contrib.</th>
                      <th className="px-2 py-2 text-center">TA</th>
                      <th className="px-2 py-2 text-center">TR</th>
                      <th className="px-2 py-2 text-center">Nota media</th>
                      <th className="px-2 py-2 text-center">MVP</th>
                      <th className="px-2 py-2 text-center">P0</th>
                      <th className="px-2 py-2 text-center">Forma</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((p) => {
                      const st = stats[String(p.ID)] ?? fallbackStats();
                      const avg = averageRating(st);
                      const mvp = st.dynamicStats?.seasonMVPs ?? st.motm ?? 0;
                      const clean = st.dynamicStats?.seasonCleanSheets ?? st.cleanSheets ?? 0;
                      const form = getPlayerForm(st);
                      const contrib = (st.goals ?? 0) + (st.assists ?? 0);
                      return (
                        <tr key={p.ID} className="border-b border-border/30 hover:bg-secondary/20">
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-2.5">
                              <PlayerFace name={p.Name} image={p.card} role={roleFromPosition(p.Position)} size={34} />
                              <span className={`w-9 shrink-0 text-[0.65rem] font-black uppercase ${ROLE_TEXT[roleFromPosition(p.Position)]}`}>{p.Position}</span>
                              <span className="truncate font-medium">{p.Name}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-center"><span className="scoreline font-black">{p.OVR}</span></td>
                          <td className="px-2 py-2 text-center text-muted-foreground">{p.Age}</td>
                          <td className="px-2 py-2 text-center scoreline">{st.appearances}</td>
                          <td className="px-2 py-2 text-center font-semibold text-primary">{st.goals}</td>
                          <td className="px-2 py-2 text-center font-semibold text-accent">{st.assists}</td>
                          <td className="px-2 py-2 text-center font-bold">{contrib}</td>
                          <td className="px-2 py-2 text-center text-yellow-500">{st.yellowCards}</td>
                          <td className="px-2 py-2 text-center text-red-500">{st.redCards}</td>
                          <td className="px-2 py-2 text-center scoreline font-semibold">{avg == null ? "—" : avg.toFixed(2)}</td>
                          <td className="px-2 py-2 text-center scoreline font-semibold text-yellow-500">{mvp}</td>
                          <td className="px-2 py-2 text-center scoreline font-semibold text-sky-400">{clean}</td>
                          <td className="px-2 py-2 text-center">
                            <span
                              title={form === "up" ? "Buena forma" : form === "down" ? "Mala forma" : "Forma estable"}
                              className={`inline-flex items-center justify-center ${form === "up" ? "text-emerald-400" : form === "down" ? "text-destructive" : "text-muted-foreground"}`}
                            >
                              {form === "up" ? <ArrowUp className="h-4 w-4" /> : form === "down" ? <ArrowDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-4 text-[0.65rem] text-muted-foreground">
        Ordenado por posición · la <strong>Nota media</strong> solo contabiliza partidos que el jugador ha disputado y tienen valoración registrada. P0 = porterías a cero; MVP = mejor jugador del partido; Forma: últimos 5 partidos; ↑ ≥ 7, → 6–6,99, ↓ &lt; 6.
      </p>
    </div>
  );
}
