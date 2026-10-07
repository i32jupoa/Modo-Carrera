import { ChevronLeft, ChevronRight, Newspaper } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NEWS_CAT_LABEL, type NewsCat, type NewsItem } from "@/lib/news/newsEngine";
import type { CentralTheme } from "@/lib/seasonExtras";
import type { Fixture } from "@/lib/season";
import { MatchStatsModal } from "@/components/MatchStatsModal";
import { VisualStrip } from "./NewsVisuals";
import { NewsMatchRow } from "./NewsMatch";
import { NewsWindow } from "./NewsWindow";
import { NEWS_THEMES } from "./newsThemes";

const AUTO_MS = 7000;

// Noticias ya vistas en esta sesión (para marcar las nuevas).
const seenIds = new Set<string>();

type Filter = "all" | NewsCat;

export function NewsCarousel({
  news,
  theme,
  myId,
}: {
  news: NewsItem[];
  theme: CentralTheme;
  myId?: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [index, setIndex] = useState(0);
  const [opened, setOpened] = useState<NewsItem | null>(null);
  const [statsFixture, setStatsFixture] = useState<Fixture | null>(null);
  const [hover, setHover] = useState(false);
  const [tick, setTick] = useState(0); // fuerza reinicio de la barra de progreso
  const touchX = useRef<number | null>(null);

  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const list = useMemo(() => (filter === "all" ? news : news.filter((n) => n.cat === filter)), [news, filter]);
  const availableCats = useMemo(() => Array.from(new Set(news.map((n) => n.cat))), [news]);

  // Si cambia la lista (filtro/nuevas noticias) mantenemos el índice válido.
  useEffect(() => {
    if (index >= list.length) setIndex(0);
  }, [list.length, index]);

  const current = list[Math.min(index, Math.max(0, list.length - 1))];

  useEffect(() => {
    if (current) seenIds.add(current.id);
  }, [current]);

  const go = useCallback(
    (delta: number) => {
      if (list.length === 0) return;
      setIndex((i) => (i + delta + list.length) % list.length);
      setTick((t) => t + 1);
    },
    [list.length],
  );

  // La rotación se detiene mientras hay una ventana abierta o el ratón está encima.
  const autoplay = !opened && !statsFixture && !hover && !reducedMotion && list.length > 1;
  useEffect(() => {
    if (!autoplay) return;
    const id = window.setTimeout(() => go(1), AUTO_MS);
    return () => window.clearTimeout(id);
  }, [autoplay, index, tick, go]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchX.current;
    touchX.current = null;
    if (start == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? start) - start;
    if (Math.abs(dx) > 45) go(dx < 0 ? 1 : -1);
  };

  if (news.length === 0) {
    return (
      <div className={`panel p-5 border ${theme.cardBorder}`}>
        <div className="flex items-center gap-2 mb-2">
          <Newspaper className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-bold">Noticias</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Todavía no hay noticias. En cuanto se jueguen partidos y se muevan el mercado y las
          competiciones, aquí aparecerá lo más importante que ocurra en tu partida.
        </p>
      </div>
    );
  }

  const cur = current ? NEWS_THEMES[current.theme ?? "liga"] : null;

  return (
    <div
      className={`panel p-5 border ${theme.cardBorder} outline-none focus-visible:ring-2 focus-visible:ring-primary/40`}
      tabIndex={0}
      onKeyDown={onKey}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-roledescription="carrusel de noticias"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-primary" />
          <h3 className="font-bold">Noticias</h3>
          <span className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">
            {list.length > 0 ? `${Math.min(index, list.length - 1) + 1}/${list.length}` : "0"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(["all", ...availableCats] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setFilter(f);
                setIndex(0);
                setTick((t) => t + 1);
              }}
              className={`px-2 py-0.5 rounded-full border text-[0.6rem] font-bold uppercase tracking-wider transition ${
                filter === f
                  ? "bg-primary/20 border-primary/50 text-primary"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "Todas" : NEWS_CAT_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      {current && cur && (
        <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} aria-live={autoplay ? "off" : "polite"}>
          {/* ---------- Tarjeta compacta (rota sola). Al pulsarla se abre la ventana ---------- */}
          <div key={current.id} className="animate-in fade-in slide-in-from-right-3 duration-500">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setOpened(current)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpened(current);
                }
              }}
              className={`w-full text-left rounded-xl border transition p-4 flex flex-col gap-3 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${cur.card}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`px-1.5 py-0.5 rounded border text-[0.55rem] font-bold uppercase tracking-wider ${cur.chip}`}
                >
                  {current.icon} {cur.label}
                </span>
                <span className="text-[0.6rem] text-muted-foreground truncate">{current.when}</span>
                {current.mine && (
                  <span className="text-[0.55rem] font-bold uppercase tracking-wider text-primary">Tu club</span>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <VisualStrip
                  visual={current.visual}
                  transfer={current.transfer}
                  hideTeams={!!current.fixture}
                  size={26}
                  className="shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-base sm:text-lg font-black leading-tight">{current.title}</div>
                  <p className="text-xs text-muted-foreground leading-snug mt-1 line-clamp-2">{current.lead}</p>
                </div>
              </div>

              {/* Partido tal y como se ve en Jornadas: se puede pulsar para ver sus estadísticas */}
              {current.fixture && (
                <NewsMatchRow fixture={current.fixture} myId={myId} onOpen={setStatsFixture} />
              )}

              <div className={`text-[0.65rem] font-bold ${cur.accent}`}>Leer noticia completa</div>
            </div>
          </div>

          {/* ---------- Controles ---------- */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => go(-1)}
              className="p-1.5 rounded-lg border border-border/60 hover:border-primary/50"
              aria-label="Noticia anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-center gap-1 flex-wrap">
                {list.map((n, i) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      setIndex(i);
                      setTick((t) => t + 1);
                    }}
                    aria-label={`Ir a la noticia ${i + 1}: ${n.title}`}
                    className={`h-1.5 rounded-full transition-all ${
                      i === index ? "w-6 bg-primary" : seenIds.has(n.id) ? "w-1.5 bg-muted-foreground/40" : "w-1.5 bg-primary/60"
                    }`}
                  />
                ))}
              </div>
              {autoplay && (
                <div className="mt-2 h-0.5 rounded bg-border/40 overflow-hidden">
                  <div
                    key={`${current.id}-${tick}`}
                    className="h-full bg-primary/70"
                    style={{ animation: `newsProgress ${AUTO_MS}ms linear forwards` }}
                  />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => go(1)}
              className="p-1.5 rounded-lg border border-border/60 hover:border-primary/50"
              aria-label="Noticia siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <NewsWindow item={opened} myId={myId} onClose={() => setOpened(null)} onOpenMatch={setStatsFixture} />
      <MatchStatsModal fixture={statsFixture} onClose={() => setStatsFixture(null)} />
      <style>{`@keyframes newsProgress{from{width:0}to{width:100%}}`}</style>
    </div>
  );
}
