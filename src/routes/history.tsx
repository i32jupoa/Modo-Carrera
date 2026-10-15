import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ArrowLeftCircle, ArrowRightCircle, Award, BarChart3, CalendarDays,
  Crown, History as HistoryIcon, Medal, ShieldCheck, Star, Trophy, Users,
} from "lucide-react";
import { getCurrentSaveId } from "@/lib/savedGames";
import { loadSave } from "@/lib/store";
import { listSeasonArchives, type SeasonArchive } from "@/lib/season/seasonHistory";
import { HistoryEmpty, HistoryPanel } from "@/components/history/HistoryPrimitives";

const SeasonOverviewPanel = lazy(() => import("@/components/history/HistoryPanels").then((module) => ({ default: module.SeasonOverviewPanel })));
const AwardsAndScorersPanel = lazy(() => import("@/components/history/HistoryPanels").then((module) => ({ default: module.AwardsAndScorersPanel })));
const TransferArchivePanel = lazy(() => import("@/components/history/HistoryPanels").then((module) => ({ default: module.TransferArchivePanel })));
const RetirementsArchivePanel = lazy(() => import("@/components/history/HistoryPanels").then((module) => ({ default: module.RetirementsArchivePanel })));
const MyClubHistoryPanel = lazy(() => import("@/components/history/HistoryPanels").then((module) => ({ default: module.MyClubHistoryPanel })));
const HistoricalRecordsTab = lazy(() => import("@/components/history/HistoryPanels").then((module) => ({ default: module.HistoricalRecordsTab })));
const TeamOfSeasonPanel = lazy(() => import("@/components/history/HistoryPanels").then((module) => ({ default: module.TeamOfSeasonPanel })));
const ClubsPalmaresTab = lazy(() => import("@/components/history/HistoryPanels").then((module) => ({ default: module.ClubsPalmaresTab })));
const PlayersPalmaresTab = lazy(() => import("@/components/history/HistoryPanels").then((module) => ({ default: module.PlayersPalmaresTab })));
const LeagueArchivePanel = lazy(() => import("@/components/history/HistoryCompetitionPanels").then((module) => ({ default: module.LeagueArchivePanel })));
const DomesticCupArchivePanel = lazy(() => import("@/components/history/HistoryCompetitionPanels").then((module) => ({ default: module.DomesticCupArchivePanel })));
const EuropeanArchivePanel = lazy(() => import("@/components/history/HistoryCompetitionPanels").then((module) => ({ default: module.EuropeanArchivePanel })));

export const Route = createFileRoute("/history")({ component: HistoryPage });

type HistoryTab = "overview" | "leagues" | "cups" | "europe" | "stats" | "eleven" | "transfers" | "retirements" | "myclub" | "records" | "clubs" | "players";
const HISTORY_TABS: Array<{ id: HistoryTab; label: string; Icon: typeof Trophy }> = [
  { id: "overview", label: "Resumen", Icon: CalendarDays },
  { id: "leagues", label: "Ligas", Icon: BarChart3 },
  { id: "cups", label: "Copas nacionales", Icon: ShieldCheck },
  { id: "europe", label: "Europa", Icon: Crown },
  { id: "stats", label: "Premios y estadísticas", Icon: Award },
  { id: "eleven", label: "Once de la temporada", Icon: Users },
  { id: "transfers", label: "Mercado", Icon: Users },
  { id: "retirements", label: "Retirados", Icon: HistoryIcon },
  { id: "myclub", label: "Mi club", Icon: Star },
  { id: "records", label: "Récords", Icon: Medal },
  { id: "clubs", label: "Palmarés de clubes", Icon: Trophy },
  { id: "players", label: "Palmarés individual", Icon: Star },
];

function archiveDate(archive: SeasonArchive) {
  const date = new Date(archive.archivedAt);
  return Number.isNaN(date.getTime()) ? "Fecha no disponible" : date.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

function HistoryPage() {
  const navigate = useNavigate();
  const [archives, setArchives] = useState<SeasonArchive[]>([]);
  const [selectedSeason, setSelectedSeason] = useState("");
  const [tab, setTab] = useState<HistoryTab>("overview");
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

  const selectedIndex = archives.findIndex((archive) => archive.season === selectedSeason);
  const selectedArchive = useMemo(() => archives.find((archive) => archive.season === selectedSeason) ?? archives.at(-1) ?? null, [archives, selectedSeason]);
  const newestFirst = useMemo(() => [...archives].reverse(), [archives]);
  const moveSeason = (direction: -1 | 1) => {
    if (selectedIndex < 0) return;
    const nextIndex = Math.max(0, Math.min(archives.length - 1, selectedIndex + direction));
    const next = archives[nextIndex];
    if (next) setSelectedSeason(next.season);
  };

  if (loading) return <div className="mx-auto max-w-7xl p-6 text-sm text-muted-foreground">Cargando historia de la carrera…</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <header className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card to-primary/10 p-5 md:p-7">
        <div className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <Link to="/season" className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground transition hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Volver a la Central</Link>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-primary"><HistoryIcon className="h-4 w-4" /> Archivo de la carrera</div>
            <h1 className="text-3xl font-black tracking-tight md:text-4xl">Historia y palmarés</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Un archivo de temporada a temporada con resultados, campeones, mercado, récords y la evolución de tu club.</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-right"><div className="text-[0.65rem] font-black uppercase tracking-wider text-muted-foreground">Temporadas archivadas</div><div className="mt-1 text-3xl font-black tabular-nums">{archives.length}</div><div className="text-[0.65rem] text-muted-foreground">Esta carrera · guardado aislado</div></div>
        </div>
      </header>

      {archives.length === 0 ? <HistoryPanel className="p-8 text-center md:p-12"><HistoryIcon className="mx-auto h-10 w-10 text-muted-foreground/60"/><h2 className="mt-4 text-xl font-black">Todavía no hay temporadas archivadas</h2><p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">Cuando cierres la primera temporada, aquí aparecerán las clasificaciones finales, campeones, premios, goleadores y retiradas. Tu partida actual no se modifica desde esta pantalla.</p><Link to="/season" className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground">Ir a la Central</Link></HistoryPanel> : <>
        {/* El selector está fuera de las pestañas para que la temporada siga visible al navegar. */}
        <section className="sticky top-2 z-20 rounded-2xl border border-border/60 bg-card/95 p-3 shadow-md backdrop-blur md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><div className="text-[0.62rem] font-black uppercase tracking-wider text-muted-foreground">Temporada consultada</div><div className="mt-0.5 text-xl font-black">{selectedArchive?.season ?? "Sin temporada"}</div></div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" aria-label="Temporada anterior" title="Temporada anterior" disabled={selectedIndex <= 0} onClick={() => moveSeason(-1)} className="rounded-lg border border-border/60 p-2 disabled:cursor-not-allowed disabled:opacity-35"><ArrowLeftCircle className="h-5 w-5"/></button>
              <select aria-label="Seleccionar temporada" value={selectedArchive?.season ?? ""} onChange={(event) => setSelectedSeason(event.target.value)} className="min-w-36 rounded-lg border border-border bg-background px-3 py-2 text-sm font-black text-foreground outline-none focus:border-primary">{newestFirst.map((archive) => <option key={archive.season} value={archive.season}>{archive.season}</option>)}</select>
              <button type="button" aria-label="Temporada siguiente" title="Temporada siguiente" disabled={selectedIndex < 0 || selectedIndex >= archives.length - 1} onClick={() => moveSeason(1)} className="rounded-lg border border-border/60 p-2 disabled:cursor-not-allowed disabled:opacity-35"><ArrowRightCircle className="h-5 w-5"/></button>
            </div>
          </div>
          {selectedArchive && <div className="mt-2 text-[0.65rem] text-muted-foreground">Archivada el {archiveDate(selectedArchive)} · La selección se mantiene al cambiar de pestaña.</div>}
        </section>

        <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2" role="tablist" aria-label="Secciones del historial">{HISTORY_TABS.map(({ id, label, Icon }) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-black transition ${tab === id ? "border-primary/50 bg-primary/10 text-primary" : "border-border/60 bg-card/70 text-muted-foreground hover:text-foreground"}`}><Icon className="h-4 w-4"/>{label}</button>)}</nav>

        {selectedArchive && <Suspense fallback={<HistoryPanel className="p-8 text-center text-sm text-muted-foreground">Cargando sección del historial…</HistoryPanel>}>
          {tab === "overview" && <SeasonOverviewPanel archive={selectedArchive}/>}
          {tab === "leagues" && <LeagueArchivePanel archive={selectedArchive}/>}
          {tab === "cups" && <DomesticCupArchivePanel archive={selectedArchive}/>}
          {tab === "europe" && <EuropeanArchivePanel archive={selectedArchive}/>}
          {tab === "stats" && <AwardsAndScorersPanel archive={selectedArchive}/>}
          {tab === "eleven" && <TeamOfSeasonPanel archive={selectedArchive}/>}
          {tab === "transfers" && <TransferArchivePanel archive={selectedArchive}/>}
          {tab === "retirements" && <RetirementsArchivePanel archives={archives} selected={selectedArchive}/>}
          {tab === "myclub" && <MyClubHistoryPanel archives={archives} selected={selectedArchive}/>}
          {tab === "records" && <HistoricalRecordsTab archives={archives}/>}
          {tab === "clubs" && <ClubsPalmaresTab archives={archives}/>}
          {tab === "players" && <PlayersPalmaresTab archives={archives}/>}
        </Suspense>}
      </>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4 text-xs text-muted-foreground"><span>Historial separado y persistido por carrera.</span><Link to="/season" className="font-bold text-primary hover:underline">Volver a jugar</Link></footer>
    </div>
  );
}
