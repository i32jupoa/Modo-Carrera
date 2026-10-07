import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  Flag,
  Goal,
  LayoutList,
  Newspaper,
  Pause,
  Play,
  Sparkles,
  Trophy,
  Users,
  X,
} from "lucide-react";

import type { SaveGame } from "@/lib/store";
import { saveSaveWithRetry } from "@/lib/store";
import { LEAGUES, teamById } from "@/data/teams";
import { PlayerFace, roleFromPosition } from "@/components/PlayerFace";
import { TeamBadge } from "@/components/TeamBadge";
import { LeagueLogo } from "@/components/LeagueLogo";
import { faceUrl } from "@/lib/playerFaces";
import { usePlayersStore } from "@/store/playersStore";
import { renderNewsEvent, type NewsRenderedItem } from "@/lib/news/NewsText";
import { markNewsStoryRead, normalizeNewsState, type NewsCategory } from "@/lib/news/NewsEvents";
import type { CentralTheme } from "@/lib/seasonExtras";

const ROTATION_MS = 7000;

type Filter = "all" | "club" | NewsCategory;

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "club", label: "Mi club" },
  { id: "liga", label: "Liga" },
  { id: "europa", label: "Europa" },
  { id: "mercado", label: "Mercado" },
  { id: "jugadores", label: "Jugadores" },
];

function categoryMeta(category: NewsCategory) {
  switch (category) {
    case "club":
      return { label: "Mi club", icon: Building2, accent: "text-violet-300", bg: "bg-violet-500/10 border-violet-500/20" };
    case "mercado":
      return { label: "Mercado", icon: BriefcaseBusiness, accent: "text-amber-300", bg: "bg-amber-500/10 border-amber-500/20" };
    case "europa":
      return { label: "Europa", icon: Trophy, accent: "text-blue-300", bg: "bg-blue-500/10 border-blue-500/20" };
    case "jugadores":
      return { label: "Jugadores", icon: Users, accent: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/20" };
    case "liga":
    default:
      return { label: "Liga", icon: Newspaper, accent: "text-sky-300", bg: "bg-sky-500/10 border-sky-500/20" };
  }
}

function eventHasMyClub(item: NewsRenderedItem, myTeamId: string): boolean {
  return item.event.entities.teamIds?.includes(myTeamId) ?? false;
}

function eventPlayerId(item: NewsRenderedItem): string | undefined {
  return item.event.entities.playerIds?.[0];
}

function teamForEvent(item: NewsRenderedItem, index = 0) {
  const id = item.event.entities.teamIds?.[index];
  return id ? teamById(id) : undefined;
}

function formatEuro(value: number | undefined): string | null {
  if (!value || !Number.isFinite(value)) return null;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 100_000_000 ? 0 : 1).replace(/\.0$/, "")} M€`;
  return `${Math.round(value / 1000)} K€`;
}

export function NewsPanel({ save, theme }: { save: SaveGame; theme: CentralTheme }) {
  const navigate = useNavigate();
  const playerState = usePlayersStore((state) => state.stats);
  const myTeamId = save.myTeamId;
  const newsState = normalizeNewsState(save.news);
  const [filter, setFilter] = useState<Filter>("all");
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [readOverrides, setReadOverrides] = useState<Set<string>>(() => new Set());
  const touchStart = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  const items = useMemo(() => {
    const rendered = newsState.stories.map((story) => ({
      ...renderNewsEvent(story.event),
      read: story.read || readOverrides.has(story.event.id),
    }));
    const filtered = filter === "all"
      ? rendered
      : filter === "club"
        ? rendered.filter((item) => eventHasMyClub(item, myTeamId))
        : rendered.filter((item) => item.category === filter);
    return filtered;
  }, [newsState.stories, filter, myTeamId, readOverrides]);

  useEffect(() => {
    setIndex((current) => Math.max(0, Math.min(current, Math.max(0, items.length - 1))));
  }, [items.length]);

  useEffect(() => {
    if (reducedMotion || paused || detailOpen || !autoAdvance || items.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % items.length);
    }, ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [items.length, reducedMotion, paused, detailOpen, autoAdvance]);

  const current = items[index];
  const meta = current ? categoryMeta(current.category) : null;
  const MetaIcon = meta?.icon;
  const playerId = current ? eventPlayerId(current) : undefined;
  const simPlayer = playerId ? usePlayersStore.getState().getSimPlayer(playerId) : undefined;
  const playerTeam = simPlayer?.teamId ? teamById(simPlayer.teamId) : undefined;
  const leagueId = current?.event.entities.leagueId;
  const league = leagueId ? LEAGUES[leagueId as keyof typeof LEAGUES] : undefined;
  const homeTeam = current ? teamForEvent(current, 0) : undefined;
  const awayTeam = current ? teamForEvent(current, 1) : undefined;

  const updateStory = (storyId: string, read: boolean) => {
    if (!save.news) return;
    const nextNews = normalizeNewsState(save.news);
    const updated = read ? markNewsStoryRead(nextNews, storyId) : nextNews;
    const nextSave: SaveGame = { ...save, news: updated };
    setReadOverrides((current) => { const next = new Set(current); if (read) next.add(storyId); else next.delete(storyId); return next; });
    saveSaveWithRetry(nextSave);
  };

  const openCurrent = () => {
    if (!current) return;
    setDetailOpen(true);
    setAutoAdvance(false);
    if (!current.read) updateStory(current.id, true);
  };

  const next = () => {
    if (items.length < 2) return;
    setAutoAdvance(false);
    setIndex((value) => (value + 1) % items.length);
  };

  const previous = () => {
    if (items.length < 2) return;
    setAutoAdvance(false);
    setIndex((value) => (value - 1 + items.length) % items.length);
  };

  const goToRelated = () => {
    if (!current || !playerId) return;
    navigate({ to: "/transfers", search: { q: simPlayer?.name ?? "", player: playerId } });
  };

  if (!current) {
    return (
      <section className={`panel border ${theme.cardBorder} overflow-hidden`} aria-label="Noticias">
        <div className={`p-6 ${theme.bgOverlay}`}>
          <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-muted-foreground">
            <Newspaper className="h-4 w-4" /> Noticias
          </div>
          <div className="mt-5 rounded-2xl border border-dashed border-border/60 bg-secondary/10 px-6 py-10 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-primary/60" />
            <h3 className="mt-3 font-black">Todavía no hay noticias reales</h3>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
              Aquí aparecerán hechos comprobados de tu carrera: resultados relevantes, cambios en la tabla, actuaciones individuales, lesiones y movimientos de mercado.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`panel border ${theme.cardBorder} overflow-hidden`} aria-label="Noticias de la carrera">
      <div className={`${theme.bgOverlay} p-4 md:p-5`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Newspaper className={`h-4 w-4 ${theme.accent}`} />
            <div>
              <h3 className="font-black">Noticias</h3>
              <p className="text-[0.58rem] uppercase tracking-[0.18em] text-muted-foreground">Hechos reales de tu universo</p>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-background/50 p-1" role="tablist" aria-label="Filtrar noticias">
            {FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={filter === option.id}
                onClick={() => { setFilter(option.id); setIndex(0); }}
                className={`rounded-lg px-2 py-1 text-[0.58rem] font-bold transition ${filter === option.id ? `${theme.badge} border` : "text-muted-foreground hover:text-foreground"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div
          tabIndex={0}
          className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/70 outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") { event.preventDefault(); next(); }
            if (event.key === "ArrowLeft") { event.preventDefault(); previous(); }
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openCurrent(); }
          }}
          onPointerDown={(event) => { touchStart.current = event.clientX; }}
          onPointerUp={(event) => {
            if (touchStart.current == null) return;
            const delta = event.clientX - touchStart.current;
            touchStart.current = null;
            if (Math.abs(delta) > 48) delta < 0 ? next() : previous();
          }}
          aria-live="polite"
        >
          <button type="button" onClick={openCurrent} className="block w-full p-4 text-left md:p-6">
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <div className="mb-3 flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[0.55rem] font-black uppercase tracking-wider ${meta.bg} ${meta.accent}`}>
                    <MetaIcon className="h-3 w-3" /> {meta.label}
                  </span>
                  {!current.read && <span className="rounded-full bg-yellow-300 px-2 py-1 text-[0.52rem] font-black uppercase tracking-wider text-black">Nueva</span>}
                  {league && <span className="ml-auto hidden items-center gap-1.5 text-[0.58rem] text-muted-foreground sm:flex"><LeagueLogo league={league.name} size="sm" fallback={<Flag className="h-4 w-4" />} />{league.name}</span>}
                </div>
                <h4 className="max-w-3xl text-lg font-black leading-tight md:text-2xl">{current.title}</h4>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{current.intro}</p>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {homeTeam && <TeamBadge team={homeTeam} size={34} />}
                  {homeTeam && awayTeam && <span className="px-1 text-xs font-black text-muted-foreground">{current.event.data.homeGoals ?? "-"} : {current.event.data.awayGoals ?? "-"}</span>}
                  {awayTeam && <TeamBadge team={awayTeam} size={34} />}
                  {playerId && simPlayer && <PlayerFace name={simPlayer.name} image={faceUrl(simPlayer.id, simPlayer.cardImage)} role={roleFromPosition(simPlayer.positions?.[0] ?? "MID")} size={34} />}
                  {playerTeam && <span className="text-xs font-bold text-muted-foreground">{playerTeam.name}</span>}
                  
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 md:flex-col md:items-end md:justify-between">
                <div className="flex items-center gap-1 rounded-full border border-border/60 bg-background/50 px-2 py-1 text-[0.58rem] text-muted-foreground">
                  <LayoutList className="h-3 w-3" /> {index + 1}/{items.length}
                </div>
                <div className="flex items-center gap-2">
                  <span className="hidden text-[0.58rem] uppercase tracking-wider text-muted-foreground md:inline">Abrir noticia</span>
                  <span className="grid h-9 w-9 place-items-center rounded-full border border-border/60 bg-background/60 transition group-hover:border-primary/50 group-hover:text-primary"><ChevronRight className="h-4 w-4" /></span>
                </div>
              </div>
            </div>
          </button>

          <div className="flex items-center justify-between border-t border-border/50 bg-background/30 px-3 py-2">
            <button type="button" onClick={previous} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground" aria-label="Noticia anterior"><ChevronLeft className="h-4 w-4" /> Anterior</button>
            <div className="flex items-center gap-1.5" aria-label={`Noticia ${index + 1} de ${items.length}`}>
              {items.slice(0, 12).map((item, itemIndex) => (
                <button key={item.id} type="button" onClick={() => { setAutoAdvance(false); setIndex(itemIndex); }} className={`h-1.5 rounded-full transition-all ${itemIndex === index ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"}`} aria-label={`Ir a ${itemIndex + 1}`} />
              ))}
            </div>
            <button type="button" onClick={next} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground" aria-label="Noticia siguiente">Siguiente <ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted/40"><div className={`h-full ${theme.primaryBtn} transition-all`} style={{ width: `${((index + 1) / Math.max(items.length, 1)) * 100}%` }} /></div>
          <button type="button" onClick={() => setAutoAdvance((value) => !value)} className="grid h-7 w-7 place-items-center rounded-full border border-border/60 bg-background/50 text-muted-foreground hover:text-foreground" title={autoAdvance ? "Pausar rotación automática" : "Reanudar rotación automática"}>{autoAdvance ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
        </div>

        {detailOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Noticia completa">
            <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-label="Cerrar noticia" onClick={() => { setDetailOpen(false); setAutoAdvance(true); }} />
            <article className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-border/60 bg-card p-5 shadow-2xl md:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[0.55rem] font-black uppercase tracking-wider ${meta.bg} ${meta.accent}`}><MetaIcon className="h-3 w-3" />{meta.label}</span>
                    <span className="text-[0.58rem] text-muted-foreground">Relevancia {current.event.relevance}/100</span>
                  </div>
                  <h2 className="mt-3 text-2xl font-black leading-tight md:text-3xl">{current.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{current.intro}</p>
                </div>
                <button type="button" onClick={() => { setDetailOpen(false); setAutoAdvance(true); }} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border/60 hover:bg-muted/50" aria-label="Cerrar"><X className="h-4 w-4" /></button>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-[1.25fr_0.75fr]">
                <div className="rounded-2xl border border-border/60 bg-secondary/10 p-4">
                  {current.event.type === "match" && homeTeam && awayTeam && (
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <div className="flex flex-col items-center gap-2 text-center"><TeamBadge team={homeTeam} size={54} /><span className="text-sm font-black">{homeTeam.name}</span></div>
                      <div className="text-center"><div className="text-3xl font-black">{current.event.data.homeGoals} - {current.event.data.awayGoals}</div><div className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">Marcador final</div></div>
                      <div className="flex flex-col items-center gap-2 text-center"><TeamBadge team={awayTeam} size={54} /><span className="text-sm font-black">{awayTeam.name}</span></div>
                    </div>
                  )}
                  {current.event.type === "transfer" && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3"><PlayerFace name={current.event.data.scorerNames?.[0] ?? "Jugador"} image={playerId ? faceUrl(playerId, simPlayer?.cardImage) : undefined} size={52} showRing={false} /><div><div className="font-black">{current.event.data.scorerNames?.[0]}</div><div className="text-xs text-muted-foreground">{current.event.data.transferType}</div></div></div>
                      <div className="flex items-center justify-center gap-3"><TeamBadge teamId={current.event.data.fromClubId ?? undefined} size={42} /><ArrowRight className="h-4 w-4 text-muted-foreground" /><TeamBadge teamId={current.event.data.toClubId} size={42} /></div>
                      {formatEuro(current.event.data.transferFee) && <div className="text-center text-lg font-black">{formatEuro(current.event.data.transferFee)}</div>}
                    </div>
                  )}
                  {current.event.type !== "match" && current.event.type !== "transfer" && playerId && simPlayer && (
                    <div className="flex items-center gap-4"><PlayerFace name={simPlayer.name} image={faceUrl(simPlayer.id, simPlayer.cardImage)} role={roleFromPosition(simPlayer.positions?.[0] ?? "MID")} size={68} /><div><div className="text-lg font-black">{simPlayer.name}</div><div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"> {playerTeam?.name}</div></div></div>
                  )}
                </div>

                <div className="space-y-2">
                  {league && <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 p-3"><LeagueLogo league={league.name} size="md" fallback={<Goal className="h-5 w-5 text-muted-foreground" />} /><div><div className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">Competición</div><div className="text-sm font-black">{league.name}</div></div></div>}
                  {current.event.data.previousPosition != null && current.event.data.newPosition != null && <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 p-3"><Flag className="h-5 w-5 text-primary" /><div><div className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">Clasificación</div><div className="text-sm font-black">{current.event.data.previousPosition}º → {current.event.data.newPosition}º</div></div></div>}
                  {current.event.data.transferFee != null && <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 p-3"><BriefcaseBusiness className="h-5 w-5 text-amber-300" /><div><div className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">Importe</div><div className="text-sm font-black">{formatEuro(current.event.data.transferFee) ?? "Agente libre"}</div></div></div>}
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-border/60 bg-secondary/10 p-4 text-sm leading-7 text-foreground/90">
                {current.body}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[0.58rem] text-muted-foreground">
                  <CircleAlert className="h-3.5 w-3.5" /> Sólo se publica cuando el hecho está presente en el estado de la partida.
                </div>
                {playerId && <button type="button" onClick={goToRelated} className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-xs font-bold hover:border-primary/50 hover:text-primary"><ExternalLink className="h-3.5 w-3.5" /> Abrir jugador en Mercado</button>}
              </div>
            </article>
          </div>
        )}
      </div>
    </section>
  );
}
