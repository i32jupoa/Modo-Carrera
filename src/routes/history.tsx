import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Award,
  CalendarDays,
  BarChart3,
  Crown,
  History as HistoryIcon,
  Medal,
  ShieldCheck,
  Star,
  Trophy,
  Users,
} from "lucide-react";
import { LEAGUES, teamById, type LeagueId } from "@/data/teams";
import { TeamLogo } from "@/components/TeamLogo";
import { faceUrl } from "@/lib/playerFaces";
import { getCurrentSaveId } from "@/lib/savedGames";
import { loadSave } from "@/lib/store";
import {
  buildClubPalmares,
  buildPlayerPalmares,
  getSeasonArchiveAwards,
  listSeasonArchives,
  type SeasonArchive,
} from "@/lib/season/seasonHistory";

export const Route = createFileRoute("/history")({ component: HistoryPage });

type HistoryTab = "season" | "clubs" | "players";

function teamDisplay(teamId: string | null | undefined) {
  if (!teamId) return null;
  const team = teamById(teamId);
  // teamById has a deliberate safe fallback for unknown IDs; don't display that
  // unrelated fallback as the historical winner if an old save references an ID
  // that has since disappeared from the static catalogue.
  if (team.id !== teamId) return { id: teamId, name: teamId, leagueName: "", known: false };
  return {
    id: team.id,
    name: team.name,
    leagueName: LEAGUES[team.league as LeagueId]?.name ?? team.league,
    known: true,
  };
}

function seasonLabelFromStartYear(year: number) {
  return `${year}/${String((year + 1) % 100).padStart(2, "0")}`;
}

function formatTransferFee(fee: number, type: string) {
  if (type === "free" || fee <= 0) return "Libre";
  if (fee >= 1_000_000) return `${(fee / 1_000_000).toFixed(1).replace(/\.0$/, "")} M€`;
  if (fee >= 1_000) return `${Math.round(fee / 1_000)} mil €`;
  return `${Math.round(fee)} €`;
}

function transferTypeLabel(type: string) {
  switch (type) {
    case "loan": return "Cesión";
    case "loan-option": return "Cesión con opción";
    case "loan-obligation": return "Cesión con obligación";
    case "free": return "Agente libre";
    default: return "Traspaso";
  }
}

function ClubLabel({ teamId, size = 28 }: { teamId: string | null | undefined; size?: number }) {
  const club = teamDisplay(teamId);
  if (!club) return <span className="text-sm text-muted-foreground">Sin determinar</span>;
  return (
    <div className="flex min-w-0 items-center gap-2">
      {club.known ? (
        <TeamLogo teamName={club.name} leagueName={club.leagueName} size={size} />
      ) : (
        <span className="grid shrink-0 place-items-center rounded-md border border-border/60 bg-secondary/40 text-[0.55rem] font-black" style={{ width: size, height: size }}>{club.name.slice(0, 3).toUpperCase()}</span>
      )}
      <span className="truncate text-sm font-bold">{club.name}</span>
    </div>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-border/60 bg-card/70 shadow-sm ${className}`}>{children}</section>;
}

function StatTile({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Trophy }) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/50 p-3">
      <div className="flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-wider text-muted-foreground"><Icon className="h-3.5 w-3.5 text-primary" />{label}</div>
      <div className="mt-1 text-2xl font-black tabular-nums">{value}</div>
    </div>
  );
}

function HistoryPage() {
  const navigate = useNavigate();
  const [archives, setArchives] = useState<SeasonArchive[]>([]);
  const [selectedSeason, setSelectedSeason] = useState("");
  const [tab, setTab] = useState<HistoryTab>("season");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    const save = loadSave();
    const saveId = getCurrentSaveId();
    if (!save || !saveId) {
      setArchives([]);
      setLoading(false);
      return false;
    }
    const found = listSeasonArchives(saveId);
    setArchives(found);
    setSelectedSeason((current) => found.some((archive) => archive.season === current) ? current : (found.at(-1)?.season ?? ""));
    setLoading(false);
    return true;
  }, []);

  useEffect(() => {
    if (!refresh()) navigate({ to: "/" });
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [navigate, refresh]);

  const selectedArchive = useMemo(() => archives.find((archive) => archive.season === selectedSeason) ?? archives.at(-1) ?? null, [archives, selectedSeason]);
  const clubPalmares = useMemo(() => buildClubPalmares(archives), [archives]);
  const playerPalmares = useMemo(() => buildPlayerPalmares(archives), [archives]);
  const trophiesForSelected = selectedArchive
    ? [
        ...selectedArchive.leagues.filter((league) => league.championId).map((league) => ({ key: `league-${league.leagueId}`, label: `Liga · ${LEAGUES[league.leagueId as LeagueId]?.name ?? league.leagueId}`, teamId: league.championId!, icon: Trophy })),
        ...selectedArchive.domesticCupChampions.map((cup) => ({ key: `cup-${cup.leagueId}`, label: `Copa · ${LEAGUES[cup.leagueId as LeagueId]?.name ?? cup.leagueId}`, teamId: cup.teamId, icon: ShieldCheck })),
        ...(selectedArchive.europeanChampions.ucl ? [{ key: "ucl", label: "Champions League", teamId: selectedArchive.europeanChampions.ucl, icon: Crown }] : []),
        ...(selectedArchive.europeanChampions.uel ? [{ key: "uel", label: "Europa League", teamId: selectedArchive.europeanChampions.uel, icon: Medal }] : []),
        ...(selectedArchive.europeanChampions.uecl ? [{ key: "uecl", label: "Conference League", teamId: selectedArchive.europeanChampions.uecl, icon: Award }] : []),
      ]
    : [];

  if (loading) return <div className="mx-auto max-w-7xl p-6 text-sm text-muted-foreground">Cargando historia de la carrera…</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <header className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card to-primary/10 p-5 md:p-7">
        <div className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <Link to="/season" className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground transition hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Volver a la Central</Link>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-primary"><HistoryIcon className="h-4 w-4" /> Archivo de la carrera</div>
            <h1 className="text-3xl font-black tracking-tight md:text-4xl">Historia y palmarés</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Revive cada temporada, consulta los campeones y sigue los títulos y premios acumulados por clubes y jugadores de esta partida.</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-right">
            <div className="text-[0.65rem] font-black uppercase tracking-wider text-muted-foreground">Temporadas archivadas</div>
            <div className="mt-1 text-3xl font-black tabular-nums">{archives.length}</div>
            <div className="text-[0.65rem] text-muted-foreground">Esta carrera · guardado aislado</div>
          </div>
        </div>
      </header>

      {archives.length === 0 ? (
        <Panel className="p-8 text-center md:p-12">
          <HistoryIcon className="mx-auto h-10 w-10 text-muted-foreground/60" />
          <h2 className="mt-4 text-xl font-black">Todavía no hay temporadas archivadas</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">Cuando cierres la primera temporada, aquí aparecerán las clasificaciones finales, campeones, premios, goleadores y retiradas. Tu partida actual no se modifica desde esta pantalla.</p>
          <Link to="/season" className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground">Ir a la Central</Link>
        </Panel>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Vistas del palmarés">
              {([
                ["season", "Temporada", CalendarDays],
                ["clubs", "Palmarés por club", Trophy],
                ["players", "Palmarés individual", Star],
              ] as const).map(([value, label, Icon]) => (
                <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black transition ${tab === value ? "border-primary/50 bg-primary/10 text-primary" : "border-border/60 bg-card/60 text-muted-foreground hover:text-foreground"}`}><Icon className="h-4 w-4" />{label}</button>
              ))}
            </div>
            {tab === "season" && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Temporada
                <select value={selectedArchive?.season ?? ""} onChange={(event) => setSelectedSeason(event.target.value)} className="min-w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm font-black text-foreground outline-none focus:border-primary">
                  {[...archives].reverse().map((archive) => <option key={archive.season} value={archive.season}>{archive.season}</option>)}
                </select>
              </label>
            )}
          </div>

          {tab === "season" && selectedArchive && (
            <div className="space-y-6">
              <Panel className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 bg-secondary/20 p-4 md:p-5">
                  <div>
                    <p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-primary">Resumen de temporada</p>
                    <h2 className="mt-1 text-2xl font-black">{selectedArchive.season}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Archivada el {new Date(selectedArchive.archivedAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}</p>
                  </div>
                  {selectedArchive.myTeamId && (
                    <div className="min-w-[220px] rounded-xl border border-primary/20 bg-primary/5 p-3">
                      <div className="text-[0.6rem] font-black uppercase tracking-wider text-primary">Tu club</div>
                      <div className="mt-2"><ClubLabel teamId={selectedArchive.myTeamId} size={34} /></div>
                      <p className="mt-2 text-xs text-muted-foreground">{selectedArchive.myLeague ? (LEAGUES[selectedArchive.myLeague as LeagueId]?.name ?? selectedArchive.myLeague) : "Liga"}{selectedArchive.myFinalPosition ? ` · ${selectedArchive.myFinalPosition}.º puesto` : ""}</p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 md:gap-3 md:p-4">
                  <StatTile label="Ligas registradas" value={selectedArchive.leagues.length} icon={Trophy} />
                  <StatTile label="Títulos de copa" value={selectedArchive.domesticCupChampions.length} icon={ShieldCheck} />
                  <StatTile label="Goleadores guardados" value={selectedArchive.topScorers.length} icon={BarChart3} />
                  <StatTile label="Retiradas" value={selectedArchive.retirements.length} icon={Users} />
                </div>
                {selectedArchive.financeSummary && (
                  <div className="mx-3 mb-3 rounded-xl border border-border/50 bg-background/50 p-3 md:mx-4 md:mb-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-[0.65rem] font-black uppercase tracking-wider text-muted-foreground">Economía · siguiente temporada</div>
                        <div className="mt-1 text-sm font-bold">Ingresos y premios liquidados al cierre</div>
                        <div className="mt-1 text-xs text-muted-foreground">{LEAGUES[selectedArchive.financeSummary.toLeague as LeagueId]?.name ?? selectedArchive.financeSummary.toLeague}{selectedArchive.financeSummary.promoted ? " · Ascenso" : selectedArchive.financeSummary.relegated ? " · Descenso" : ""}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[0.65rem] font-black uppercase tracking-wider text-muted-foreground">Presupuesto actualizado</div>
                        <div className="mt-1 text-xl font-black tabular-nums">{(selectedArchive.financeSummary.nextBudget / 1_000_000).toLocaleString("es-ES", { maximumFractionDigits: 1 })} M€</div>
                        <div className="text-xs font-bold text-emerald-600">+{(selectedArchive.financeSummary.annualRevenue / 1_000_000).toLocaleString("es-ES", { maximumFractionDigits: 1 })} M€ de ingresos</div>
                      </div>
                    </div>
                  </div>
                )}
              </Panel>

              <section className="space-y-3">
                <div className="flex items-end justify-between gap-3"><div><h3 className="text-xl font-black">Campeones de la temporada</h3><p className="text-xs text-muted-foreground">Ligas, copas nacionales y competiciones europeas.</p></div><span className="text-xs font-bold text-muted-foreground">{trophiesForSelected.length} títulos registrados</span></div>
                {trophiesForSelected.length ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {trophiesForSelected.map(({ key, label, teamId, icon: Icon }) => (
                      <div key={key} className="flex min-w-0 items-center gap-3 rounded-2xl border border-border/60 bg-card/70 p-3.5">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
                        <div className="min-w-0 flex-1"><div className="mb-1 text-[0.6rem] font-black uppercase tracking-wider text-muted-foreground">{label}</div><ClubLabel teamId={teamId} size={26} /></div>
                      </div>
                    ))}
                  </div>
                ) : <Panel className="p-5 text-sm text-muted-foreground">No hay campeones registrados en este archivo.</Panel>}
              </section>

              <Panel className="p-4 md:p-5">
                <div className="mb-4"><h3 className="text-xl font-black">Clasificaciones finales</h3><p className="mt-1 text-xs text-muted-foreground">Abre cada liga para consultar la tabla completa, incluido el balance de goles y puntos.</p></div>
                <div className="space-y-2">
                  {selectedArchive.leagues.map((league) => {
                    const leagueName = LEAGUES[league.leagueId as LeagueId]?.name ?? league.leagueId;
                    const open = league.leagueId === selectedArchive.myLeague;
                    return (
                      <details key={league.leagueId} open={open} className="group rounded-xl border border-border/50 bg-background/40">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 [&::-webkit-details-marker]:hidden">
                          <span className="flex min-w-0 items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary/70"><Trophy className="h-4 w-4 text-primary" /></span><span className="min-w-0"><span className="block truncate text-sm font-black">{leagueName}</span><span className="block text-[0.65rem] text-muted-foreground">{league.table.length} equipos</span></span></span>
                          <span className="text-xs text-muted-foreground">{league.championId ? `Campeón: ${teamDisplay(league.championId)?.name ?? league.championId}` : "Sin campeón"}</span>
                        </summary>
                        <div className="overflow-x-auto border-t border-border/40">
                          <table className="w-full min-w-[660px] text-left text-xs">
                            <thead className="bg-secondary/20 text-[0.6rem] uppercase tracking-wider text-muted-foreground"><tr><th className="px-3 py-2">Pos.</th><th className="px-3 py-2">Club</th><th className="px-3 py-2 text-center">PJ</th><th className="px-3 py-2 text-center">V</th><th className="px-3 py-2 text-center">E</th><th className="px-3 py-2 text-center">D</th><th className="px-3 py-2 text-center">GF</th><th className="px-3 py-2 text-center">GC</th><th className="px-3 py-2 text-center">DG</th><th className="px-3 py-2 text-center">Pts</th></tr></thead>
                            <tbody>{league.table.map((row) => (
                              <tr key={row.teamId} className={`border-t border-border/30 ${row.teamId === selectedArchive.myTeamId ? "bg-primary/10" : "hover:bg-secondary/20"}`}>
                                <td className="px-3 py-2 font-black tabular-nums">{row.position}</td><td className="px-3 py-2"><ClubLabel teamId={row.teamId} size={22} /></td><td className="px-3 py-2 text-center tabular-nums">{row.played}</td><td className="px-3 py-2 text-center tabular-nums">{row.won}</td><td className="px-3 py-2 text-center tabular-nums">{row.drawn}</td><td className="px-3 py-2 text-center tabular-nums">{row.lost}</td><td className="px-3 py-2 text-center tabular-nums">{row.gf}</td><td className="px-3 py-2 text-center tabular-nums">{row.ga}</td><td className="px-3 py-2 text-center tabular-nums">{row.gd > 0 ? `+${row.gd}` : row.gd}</td><td className="px-3 py-2 text-center font-black tabular-nums">{row.points}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                      </details>
                    );
                  })}
                </div>
              </Panel>

              <div className="grid gap-6 xl:grid-cols-2">
                <Panel className="p-4 md:p-5">
                  <h3 className="text-lg font-black">Premios individuales</h3>
                  <p className="mb-4 mt-1 text-xs text-muted-foreground">Galardones archivados al cierre de la campaña.</p>
                  {getSeasonArchiveAwards(selectedArchive).length ? <div className="space-y-2">{getSeasonArchiveAwards(selectedArchive).map((winner) => <div key={`${winner.category}-${winner.playerId ?? winner.playerName}`} className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/40 p-2.5">
                    {winner.playerId && faceUrl(winner.playerId) ? <img src={faceUrl(winner.playerId)} alt={winner.playerName} loading="lazy" className="h-10 w-10 rounded-full border border-border/50 object-cover object-top" /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Award className="h-4 w-4" /></span>}
                    <div className="min-w-0"><div className="truncate text-sm font-black">{winner.playerName}</div><div className="text-xs text-muted-foreground">{winner.category}</div></div>
                  </div>)}</div> : <p className="rounded-xl bg-secondary/20 p-4 text-sm text-muted-foreground">No hay premios individuales archivados en esta temporada.</p>}
                </Panel>
                <Panel className="p-4 md:p-5">
                  <h3 className="text-lg font-black">Máximos goleadores</h3>
                  <p className="mb-4 mt-1 text-xs text-muted-foreground">Hasta 100 jugadores con goles registrados al cierre.</p>
                  {selectedArchive.topScorers.length ? <div className="space-y-2">{selectedArchive.topScorers.slice(0, 15).map((player, index) => <div key={player.playerId} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border/40 bg-background/40 px-3 py-2">
                    <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-black ${index === 0 ? "bg-amber-400/15 text-amber-300" : "bg-secondary/70 text-muted-foreground"}`}>{index + 1}</span>
                    <div className="min-w-0"><div className="truncate text-sm font-bold">{player.playerName}</div>{player.clubId && <div className="mt-1"><ClubLabel teamId={player.clubId} size={18} /></div>}</div>
                    <div className="text-right"><div className="text-lg font-black tabular-nums">{player.goals}</div><div className="text-[0.6rem] text-muted-foreground">goles</div></div>
                  </div>)}</div> : <p className="rounded-xl bg-secondary/20 p-4 text-sm text-muted-foreground">No hay estadísticas de goleadores en este archivo.</p>}
                </Panel>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <Panel className="p-4 md:p-5">
                  <h3 className="flex items-center gap-2 text-lg font-black"><ArrowUpRight className="h-4 w-4 text-primary" />Fichajes destacados</h3>
                  <p className="mb-4 mt-1 text-xs text-muted-foreground">Operaciones cerradas en esta temporada, ordenadas por importe.</p>
                  {(selectedArchive.featuredTransfers ?? []).length ? <div className="space-y-2">{(selectedArchive.featuredTransfers ?? []).map((transfer) => <div key={transfer.id} className="rounded-xl border border-border/40 bg-background/40 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-black">{transfer.playerName}</div><div className="mt-1 text-[0.65rem] text-muted-foreground">{transfer.date} · {transferTypeLabel(transfer.type)}</div></div><span className="shrink-0 rounded-lg bg-primary/10 px-2 py-1 text-xs font-black text-primary">{formatTransferFee(transfer.fee, transfer.type)}</span></div><div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2"><ClubLabel teamId={transfer.fromClubId} size={20} /><ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" /><ClubLabel teamId={transfer.toClubId} size={20} /></div></div>)}</div> : <p className="rounded-xl bg-secondary/20 p-4 text-sm text-muted-foreground">No hay operaciones de mercado registradas en el historial de esta temporada.</p>}
                </Panel>
                <Panel className="p-4 md:p-5">
                  <h3 className="flex items-center gap-2 text-lg font-black"><Trophy className="h-4 w-4 text-primary" />Clasificación europea siguiente</h3>
                  <p className="mb-4 mt-1 text-xs text-muted-foreground">Plazas preparadas para {selectedArchive.nextSeasonEuropeanQualification ? seasonLabelFromStartYear(selectedArchive.nextSeasonEuropeanQualification.seasonStartYear) : "la temporada siguiente"}.</p>
                  {selectedArchive.nextSeasonEuropeanQualification ? <div className="space-y-2">{([ ["ucl", "Champions League"], ["uel", "Europa League"], ["uecl", "Conference League"] ] as const).map(([key, label]) => {
                    const participants = selectedArchive.nextSeasonEuropeanQualification?.[key] ?? [];
                    return <details key={key} className="rounded-xl border border-border/40 bg-background/40 p-3"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-black"><span>{label}</span><span className="rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">{participants.length} clubes</span></summary><div className="mt-3 grid gap-1 sm:grid-cols-2">{participants.map((teamId, index) => <div key={`${key}-${teamId}`} className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-xs"><span className="w-5 shrink-0 text-right text-muted-foreground">{index + 1}.</span><ClubLabel teamId={teamId} size={19} /></div>)}</div></details>;
                  })}</div> : <p className="rounded-xl bg-secondary/20 p-4 text-sm text-muted-foreground">Este archivo antiguo no contiene la clasificación europea de la temporada siguiente.</p>}
                </Panel>
              </div>

              <div className="grid gap-6 xl:grid-cols-3">
                <Panel className="p-4"><h3 className="flex items-center gap-2 font-black"><ArrowUpRight className="h-4 w-4 text-emerald-400" />Ascensos</h3><div className="mt-3 space-y-2">{selectedArchive.promotions.length ? selectedArchive.promotions.map((move) => <div key={`${move.teamId}-${move.fromLeague}-${move.toLeague}`} className="rounded-lg bg-emerald-500/5 p-2"><ClubLabel teamId={move.teamId} size={22} /><p className="mt-1 text-[0.65rem] text-muted-foreground">{move.fromLeague} → {move.toLeague}</p></div>) : <p className="text-xs text-muted-foreground">No se registran ascensos.</p>}</div></Panel>
                <Panel className="p-4"><h3 className="flex items-center gap-2 font-black"><ArrowDownRight className="h-4 w-4 text-destructive" />Descensos</h3><div className="mt-3 space-y-2">{selectedArchive.relegations.length ? selectedArchive.relegations.map((move) => <div key={`${move.teamId}-${move.fromLeague}-${move.toLeague}`} className="rounded-lg bg-destructive/5 p-2"><ClubLabel teamId={move.teamId} size={22} /><p className="mt-1 text-[0.65rem] text-muted-foreground">{move.fromLeague} → {move.toLeague}</p></div>) : <p className="text-xs text-muted-foreground">No se registran descensos.</p>}</div></Panel>
                <Panel className="p-4"><h3 className="flex items-center gap-2 font-black"><HistoryIcon className="h-4 w-4 text-muted-foreground" />Retiradas</h3><div className="mt-3 space-y-2">{selectedArchive.retirements.length ? selectedArchive.retirements.map((player) => <div key={player.playerId} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/30 p-2"><div className="min-w-0"><div className="truncate text-sm font-bold">{player.playerName}</div><div className="text-[0.65rem] text-muted-foreground">{player.age} años{player.lastClubId ? ` · ${teamDisplay(player.lastClubId)?.name ?? player.lastClubId}` : " · Sin club"}</div></div><span className="shrink-0 rounded-md border border-border/50 px-2 py-1 text-[0.6rem] font-black">OVR {player.ovr}</span></div>) : <p className="text-xs text-muted-foreground">No se registran retiradas en esta temporada.</p>}</div></Panel>
              </div>
            </div>
          )}

          {tab === "clubs" && (
            <Panel className="overflow-hidden">
              <div className="border-b border-border/50 p-4 md:p-5"><h2 className="text-xl font-black">Palmarés por club</h2><p className="mt-1 text-xs text-muted-foreground">Todos los títulos registrados en las temporadas archivadas de esta carrera.</p></div>
              {clubPalmares.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-secondary/20 text-[0.62rem] uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3 text-left">Club</th><th className="px-3 py-3 text-center">Total</th><th className="px-3 py-3 text-center">Liga</th><th className="px-3 py-3 text-center">Copa</th><th className="px-3 py-3 text-center">UCL</th><th className="px-3 py-3 text-center">UEL</th><th className="px-3 py-3 text-center">UECL</th><th className="px-4 py-3 text-right">Temporadas</th></tr></thead><tbody>{clubPalmares.map((entry, index) => <tr key={entry.teamId} className="border-t border-border/30 hover:bg-secondary/15"><td className="px-4 py-3"><div className="flex items-center gap-2"><span className="w-5 text-xs font-black text-muted-foreground">{index + 1}</span><ClubLabel teamId={entry.teamId} /></div></td><td className="px-3 py-3 text-center font-black tabular-nums">{entry.totalTitles}</td><td className="px-3 py-3 text-center tabular-nums">{entry.leagueTitles}</td><td className="px-3 py-3 text-center tabular-nums">{entry.domesticCupTitles}</td><td className="px-3 py-3 text-center tabular-nums">{entry.uclTitles}</td><td className="px-3 py-3 text-center tabular-nums">{entry.uelTitles}</td><td className="px-3 py-3 text-center tabular-nums">{entry.ueclTitles}</td><td className="px-4 py-3 text-right text-xs text-muted-foreground">{entry.seasons.join(", ")}</td></tr>)}</tbody></table></div> : <div className="p-10 text-center text-sm text-muted-foreground">Todavía no hay títulos archivados.</div>}
            </Panel>
          )}

          {tab === "players" && (
            <div className="space-y-6">
              <Panel className="overflow-hidden">
                <div className="border-b border-border/50 p-4 md:p-5"><h2 className="text-xl font-black">Palmarés individual</h2><p className="mt-1 text-xs text-muted-foreground">Goles, asistencias, temporadas con participación, títulos ganados con sus clubes y premios individuales. Los datos se conservan aunque cambie de equipo o se retire.</p></div>
                {playerPalmares.length ? <div className="grid gap-3 p-3 md:grid-cols-2 md:p-4">{playerPalmares.map((player, index) => <article key={`${player.playerId ?? player.playerName}-${index}`} className="rounded-xl border border-border/50 bg-background/40 p-3">
                  <div className="flex items-center gap-3">{player.playerId && faceUrl(player.playerId) ? <img src={faceUrl(player.playerId)} alt={player.playerName} loading="lazy" className="h-12 w-12 rounded-full border border-border/50 object-cover object-top" /> : <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary"><Star className="h-5 w-5" /></div>}<div className="min-w-0"><div className="truncate font-black">{player.playerName}</div><div className="text-xs text-muted-foreground">{player.careerGoals} goles · {player.careerAssists} asistencias · {player.seasonsPlayed} temporada(s) · {player.titles.length} título(s) · {player.awards.length} premio(s)</div></div></div>
                  <div className="mt-3 flex flex-wrap gap-1.5">{player.titles.slice(0, 4).map((title, titleIndex) => <span key={`${title.season}-${title.title}-${titleIndex}`} className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-[0.62rem] font-bold">{title.title} · {title.season}</span>)}{player.awards.slice(0, 4).map((award, awardIndex) => <span key={`${award.season}-${award.category}-${awardIndex}`} className="rounded-md border border-amber-400/20 bg-amber-400/5 px-2 py-1 text-[0.62rem] font-bold">{award.category} · {award.season}</span>)}{player.topScorerSeasons.map((season) => <span key={`top-${season.season}`} className="rounded-md border border-amber-400/20 bg-amber-400/5 px-2 py-1 text-[0.62rem] font-bold">Máximo goleador · {season.season} ({season.goals})</span>)}</div>
                </article>)}</div> : <div className="p-10 text-center text-sm text-muted-foreground">Los premios y goleadores aparecerán aquí al archivar las primeras temporadas.</div>}
              </Panel>
              <Panel className="p-4 md:p-5"><h3 className="text-lg font-black">Leyendas retiradas</h3><p className="mt-1 text-xs text-muted-foreground">Historial de retiradas por temporada, incluido el último club, edad y valoración.</p><div className="mt-4 space-y-2">{archives.flatMap((archive) => archive.retirements.map((player) => ({ ...player, archivedSeason: archive.season }))).sort((a, b) => b.archivedSeason.localeCompare(a.archivedSeason) || a.playerName.localeCompare(b.playerName)).map((player) => <div key={`${player.playerId}-${player.archivedSeason}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border/40 bg-background/30 p-2.5"><div className="min-w-0"><div className="truncate text-sm font-bold">{player.playerName}</div><div className="text-[0.65rem] text-muted-foreground">{player.archivedSeason} · {player.age} años · {player.lastClubId ? (teamDisplay(player.lastClubId)?.name ?? player.lastClubId) : "Agente libre"}</div></div><span className="rounded-md bg-secondary/60 px-2 py-1 text-xs font-black">OVR {player.ovr}</span></div>)}{archives.every((archive) => !archive.retirements.length) && <p className="text-sm text-muted-foreground">Todavía no se han archivado retiradas.</p>}</div></Panel>
            </div>
          )}
        </>
      )}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4 text-xs text-muted-foreground"><span>Historial separado y persistido por carrera.</span><Link to="/season" className="font-bold text-primary hover:underline">Volver a jugar</Link></footer>
    </div>
  );
}
