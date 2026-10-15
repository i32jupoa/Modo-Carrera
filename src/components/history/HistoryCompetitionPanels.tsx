import { useMemo, useState } from "react";
import { Award, Crown, ShieldCheck, Trophy } from "lucide-react";
import { LEAGUES, type LeagueId } from "@/data/teams";
import type { ArchivedMatch, SeasonArchive, SeasonHistoryLeague } from "@/lib/season/seasonHistory";
import { ClubLabel, HistoryEmpty, HistoryPanel } from "./HistoryPrimitives";

function matchRound(match: ArchivedMatch) {
  return match.round || `Jornada ${match.matchday}`;
}

function ArchivedScore({ match }: { match: ArchivedMatch }) {
  const homeWon = match.homeGoals > match.awayGoals;
  const awayWon = match.awayGoals > match.homeGoals;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-xl border border-border/40 bg-background/40 p-2.5">
      <div className="flex min-w-0 items-center gap-2">{homeWon && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}<div className="min-w-0"><ClubLabel teamId={match.homeId} size={22} /></div></div>
      <div className="text-center"><div className="rounded-lg border border-border/60 bg-secondary/40 px-3 py-1.5 text-sm font-black tabular-nums">{match.homeGoals} – {match.awayGoals}</div>{match.homePenalties !== undefined && match.awayPenalties !== undefined && <div className="mt-1 text-[0.6rem] font-bold text-muted-foreground">Pen. {match.homePenalties} – {match.awayPenalties}</div>}{(match.extraTimeHomeGoals !== undefined || match.extraTimeAwayGoals !== undefined) && <div className="text-[0.6rem] text-muted-foreground">Prórroga {match.extraTimeHomeGoals ?? 0}–{match.extraTimeAwayGoals ?? 0}</div>}</div>
      <div className="flex min-w-0 items-center justify-end gap-2 text-right"><div className="min-w-0"><ClubLabel teamId={match.awayId} size={22} /></div>{awayWon && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}</div>
      {match.date && <div className="col-span-3 text-right text-[0.65rem] text-muted-foreground">{match.date}</div>}
    </div>
  );
}

function groupRounds(matches: ArchivedMatch[]) {
  const map = new Map<string, ArchivedMatch[]>();
  for (const match of matches) {
    const label = matchRound(match);
    const group = map.get(label) ?? [];
    group.push(match);
    map.set(label, group);
  }
  return [...map.entries()];
}

function LeagueSelect({ leagues, value, onChange }: { leagues: SeasonHistoryLeague[]; value: string; onChange: (next: string) => void }) {
  return <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">Liga <select value={value} onChange={(event) => onChange(event.target.value)} className="min-w-48 rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold text-foreground">{leagues.map((league) => <option key={league.leagueId} value={league.leagueId}>{LEAGUES[league.leagueId as LeagueId]?.name ?? league.leagueId}</option>)}</select></label>;
}

export function LeagueArchivePanel({ archive }: { archive: SeasonArchive }) {
  const leagues = archive.leagues ?? [];
  const [selected, setSelected] = useState("");
  const selectedId = leagues.some((league) => league.leagueId === selected) ? selected : (leagues[0]?.leagueId ?? "");
  const league = leagues.find((item) => item.leagueId === selectedId);
  const table = league?.table ?? [];
  const sortedByAttack = [...table].sort((a, b) => b.gf - a.gf);
  const sortedByDefence = [...table].sort((a, b) => a.ga - b.ga);
  const ucl = new Set(archive.nextSeasonEuropeanQualification?.ucl ?? []);
  const uel = new Set(archive.nextSeasonEuropeanQualification?.uel ?? []);
  const uecl = new Set(archive.nextSeasonEuropeanQualification?.uecl ?? []);
  const relegated = new Set((archive.relegations ?? []).filter((move) => move.fromLeague === selectedId).map((move) => move.teamId));
  const promoted = new Set((archive.promotions ?? []).filter((move) => move.fromLeague === selectedId).map((move) => move.teamId));
  const zoneLabel = (teamId: string) => ucl.has(teamId) ? "Champions" : uel.has(teamId) ? "Europa" : uecl.has(teamId) ? "Conference" : relegated.has(teamId) ? "Descenso" : promoted.has(teamId) ? "Ascenso" : "";
  if (!leagues.length) return <HistoryEmpty>Este archivo no contiene clasificaciones de liga.</HistoryEmpty>;
  return (
    <div className="space-y-4">
      <HistoryPanel className="p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-black">Clasificación final</h2><p className="mt-1 text-xs text-muted-foreground">Posiciones y estadísticas guardadas al cierre de {archive.season}.</p></div><LeagueSelect leagues={leagues} value={selectedId} onChange={setSelected} /></div>
        {league && <div className="mt-4 grid gap-2 sm:grid-cols-3"><div className="rounded-xl bg-primary/5 p-3"><div className="text-[0.65rem] font-black uppercase text-muted-foreground">Campeón</div><div className="mt-2"><ClubLabel teamId={league.championId} leagueId={league.leagueId} size={30} /></div></div><div className="rounded-xl bg-background/50 p-3"><div className="text-[0.65rem] font-black uppercase text-muted-foreground">Mejor ataque</div><div className="mt-2"><ClubLabel teamId={sortedByAttack[0]?.teamId} leagueId={league.leagueId} size={26} /></div><div className="mt-1 text-xs text-muted-foreground">{sortedByAttack[0]?.gf ?? 0} goles</div></div><div className="rounded-xl bg-background/50 p-3"><div className="text-[0.65rem] font-black uppercase text-muted-foreground">Mejor defensa</div><div className="mt-2"><ClubLabel teamId={sortedByDefence[0]?.teamId} leagueId={league.leagueId} size={26} /></div><div className="mt-1 text-xs text-muted-foreground">{sortedByDefence[0]?.ga ?? 0} goles encajados</div></div></div>}
      </HistoryPanel>
      {league && <HistoryPanel className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[840px] text-sm"><thead className="bg-secondary/30 text-[0.62rem] uppercase tracking-wider text-muted-foreground"><tr><th className="px-3 py-3 text-right">#</th><th className="px-3 py-3 text-left">Club</th><th className="px-2 py-3 text-center">PJ</th><th className="px-2 py-3 text-center">G</th><th className="px-2 py-3 text-center">E</th><th className="px-2 py-3 text-center">P</th><th className="px-2 py-3 text-center">GF</th><th className="px-2 py-3 text-center">GC</th><th className="px-2 py-3 text-center">DG</th><th className="px-3 py-3 text-center">PTS</th><th className="px-3 py-3 text-left">Objetivo</th></tr></thead><tbody>{[...table].sort((a, b) => a.position - b.position).map((row) => {
        const zone = zoneLabel(row.teamId);
        const zoneClass = zone === "Champions" ? "bg-blue-500/5" : zone === "Europa" ? "bg-orange-500/5" : zone === "Conference" ? "bg-emerald-500/5" : zone === "Descenso" ? "bg-destructive/5" : "";
        return <tr key={row.teamId} className={`border-t border-border/30 ${zoneClass}`}><td className="px-3 py-3 text-right font-black tabular-nums">{row.position}</td><td className="px-3 py-3"><ClubLabel teamId={row.teamId} leagueId={league.leagueId} size={24} /></td><td className="px-2 py-3 text-center tabular-nums">{row.played}</td><td className="px-2 py-3 text-center tabular-nums">{row.won}</td><td className="px-2 py-3 text-center tabular-nums">{row.drawn}</td><td className="px-2 py-3 text-center tabular-nums">{row.lost}</td><td className="px-2 py-3 text-center tabular-nums">{row.gf}</td><td className="px-2 py-3 text-center tabular-nums">{row.ga}</td><td className="px-2 py-3 text-center tabular-nums">{row.gd > 0 ? `+${row.gd}` : row.gd}</td><td className="px-3 py-3 text-center font-black tabular-nums">{row.points}</td><td className="px-3 py-3"><div className="flex items-center justify-center gap-1">{row.form?.length ? row.form.map((result, formIndex) => <span key={`${row.teamId}-form-${formIndex}`} title={result === "W" ? "Victoria" : result === "D" ? "Empate" : "Derrota"} className={`grid h-5 w-5 place-items-center rounded text-[0.58rem] font-black text-white ${result === "W" ? "bg-emerald-600" : result === "D" ? "bg-slate-500" : "bg-rose-600"}`}>{result === "W" ? "V" : result === "D" ? "E" : "D"}</span>) : <span className="text-xs text-muted-foreground">—</span>}</div></td><td className="px-3 py-3 text-xs text-muted-foreground">{zone || "—"}</td></tr>;
      })}</tbody></table></div><div className="flex flex-wrap gap-3 border-t border-border/40 p-3 text-[0.65rem] text-muted-foreground"><span className="text-blue-500">● Champions</span><span className="text-orange-500">● Europa</span><span className="text-emerald-500">● Conference</span><span className="text-destructive">● Descenso</span><span>Forma: V victoria · E empate · D derrota (últimos cinco resultados guardados).</span><span>Las plazas europeas usan la clasificación archivada para la siguiente temporada.</span></div></HistoryPanel>}
    </div>
  );
}

export function DomesticCupArchivePanel({ archive }: { archive: SeasonArchive }) {
  const cups = archive.domesticCupDetails ?? [];
  const [selected, setSelected] = useState("");
  const cupId = cups.some((cup) => cup.leagueId === selected) ? selected : (cups[0]?.leagueId ?? "");
  const cup = cups.find((item) => item.leagueId === cupId);
  const titleWinners = archive.domesticCupChampions ?? [];
  if (!cups.length && !titleWinners.length) return <HistoryEmpty>Este archivo no contiene datos de copas nacionales.</HistoryEmpty>;
  return <div className="space-y-4">
    <HistoryPanel className="p-4 md:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">Copas nacionales</h2><p className="mt-1 text-xs text-muted-foreground">Cuadros y resultados disponibles de la temporada archivada.</p></div><label className="flex items-center gap-2 text-xs text-muted-foreground">Copa <select value={cupId} onChange={(event) => setSelected(event.target.value)} className="min-w-40 rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold text-foreground">{cups.map((item) => <option key={item.leagueId} value={item.leagueId}>{LEAGUES[item.leagueId as LeagueId]?.name ?? item.leagueId}</option>)}{!cups.length && <option value="">Sin cuadro archivado</option>}</select></label></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{titleWinners.map((winner) => <div key={`${winner.leagueId}-${winner.teamId}`} className="rounded-xl border border-border/40 bg-background/40 p-3"><div className="text-[0.65rem] font-black uppercase tracking-wide text-muted-foreground">Copa · {LEAGUES[winner.leagueId as LeagueId]?.name ?? winner.leagueId}</div><div className="mt-2 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary"/><ClubLabel teamId={winner.teamId} leagueId={winner.leagueId} size={30}/></div></div>)}</div>
    </HistoryPanel>
    {cup && cup.fixtures.length > 0 ? <div className="grid gap-4 xl:grid-cols-2">{groupRounds(cup.fixtures).map(([round, matches]) => <HistoryPanel key={round} className="p-4"><h3 className="mb-3 flex items-center gap-2 font-black"><Trophy className="h-4 w-4 text-primary"/>{round}<span className="ml-auto text-xs font-normal text-muted-foreground">{matches.length} partido(s)</span></h3><div className="space-y-2">{matches.map((match) => <ArchivedScore key={match.id} match={match}/>)}</div></HistoryPanel>)}</div> : <HistoryEmpty>{cup ? "No hay resultados de copa guardados en este archivo." : "Los archivos de temporadas antiguas pueden guardar el campeón, pero no el cuadro completo."}</HistoryEmpty>}
  </div>;
}

const EUROPE_LABELS = { ucl: "Champions League", uel: "Europa League", uecl: "Conference League" } as const;
const EUROPE_ICONS = { ucl: Crown, uel: Trophy, uecl: Award } as const;

export function EuropeanArchivePanel({ archive }: { archive: SeasonArchive }) {
  const competitions = archive.europeanCompetitionDetails ?? [];
  const [selected, setSelected] = useState<"ucl" | "uel" | "uecl">("ucl");
  const competition = competitions.find((item) => item.competition === selected) ?? competitions[0];
  const CompIcon = EUROPE_ICONS[competition?.competition ?? "ucl"];
  const leagueTable = useMemo(() => [...(competition?.leaguePhaseTable ?? [])].sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf), [competition]);
  if (!competitions.length && !archive.europeanChampions?.ucl && !archive.europeanChampions?.uel && !archive.europeanChampions?.uecl) return <HistoryEmpty>Este archivo no contiene resultados europeos.</HistoryEmpty>;
  return <div className="space-y-4">
    <HistoryPanel className="p-4 md:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">Competiciones europeas</h2><p className="mt-1 text-xs text-muted-foreground">Fase de liga y eliminatorias archivadas, cuando están disponibles.</p></div><div className="flex flex-wrap gap-2" role="tablist" aria-label="Competición europea">{(["ucl", "uel", "uecl"] as const).map((key) => <button key={key} type="button" role="tab" aria-selected={(competition?.competition ?? selected) === key} onClick={() => setSelected(key)} className={`rounded-lg border px-3 py-2 text-xs font-black ${(competition?.competition ?? selected) === key ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}>{EUROPE_LABELS[key]}</button>)}</div></div>
      {competition && <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-primary/5 p-3"><CompIcon className="h-5 w-5 text-primary"/><div><div className="text-[0.65rem] font-black uppercase tracking-wide text-muted-foreground">Campeón</div><div className="mt-1"><ClubLabel teamId={competition.championId ?? archive.europeanChampions?.[competition.competition]} size={30}/></div></div></div>}
    </HistoryPanel>
    {competition?.leaguePhaseTable?.length ? <HistoryPanel className="overflow-hidden"><div className="border-b border-border/40 p-4"><h3 className="font-black">Fase de liga</h3><p className="mt-1 text-xs text-muted-foreground">Clasificación archivada; se muestran los equipos guardados en el snapshot de la competición.</p></div><div className="max-h-[460px] overflow-auto"><table className="w-full min-w-[560px] text-sm"><thead className="sticky top-0 bg-secondary/80 text-[0.62rem] uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-right">#</th><th className="px-3 py-2 text-left">Club</th><th className="px-3 py-2 text-center">PJ</th><th className="px-2 py-2 text-center">DG</th><th className="px-3 py-2 text-center">PTS</th></tr></thead><tbody>{leagueTable.map((row, index) => <tr key={row.teamId} className="border-t border-border/30"><td className="px-3 py-2 text-right font-black">{index + 1}</td><td className="px-3 py-2"><ClubLabel teamId={row.teamId} size={22}/></td><td className="px-3 py-2 text-center tabular-nums">{row.played}</td><td className="px-2 py-2 text-center tabular-nums">{row.gd > 0 ? `+${row.gd}` : row.gd}</td><td className="px-3 py-2 text-center font-black tabular-nums">{row.points}</td></tr>)}</tbody></table></div></HistoryPanel> : null}
    {competition?.fixtures.length ? <div className="grid gap-4 xl:grid-cols-2">{groupRounds(competition.fixtures).map(([round, matches]) => <HistoryPanel key={round} className="p-4"><h3 className="mb-3 flex items-center gap-2 font-black"><Trophy className="h-4 w-4 text-primary"/>{round}<span className="ml-auto text-xs font-normal text-muted-foreground">{matches.length} partido(s)</span></h3><div className="space-y-2">{matches.map((match) => <ArchivedScore key={match.id} match={match}/>)}</div></HistoryPanel>)}</div> : <HistoryEmpty>{competition ? "Esta temporada no tiene partidos europeos completos en el archivo." : "El cuadro europeo de este archivo antiguo no está disponible."}</HistoryEmpty>}
  </div>;
}
