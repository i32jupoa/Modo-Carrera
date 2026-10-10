import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { NEWS_CAT_LABEL, type NewsItem, type NewsTheme } from "@/lib/news/newsEngine";
import type { Fixture } from "@/lib/season";
import { NEWS_THEMES } from "./newsThemes";
import { NewsMatchRow } from "./NewsMatch";
import { LeagueCrest, NewsPlayerFace, TeamCrest, TransferArrow, leaguesOfVisual } from "./NewsVisuals";
import { CountryFlag } from "@/components/CountryFlag";
import { teamById } from "@/data/teams";
import { TypicalElevenPitch } from "@/components/TypicalElevenPitch";

function clubName(id?: string): string {
  if (!id) return "";
  try {
    return teamById(id)?.name ?? id;
  } catch {
    return id;
  }
}

function money(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(".", ",")} M€`;
  return `${Math.round(n / 1000)} K€`;
}

/** Ventana con temática propia (liga, copa, Champions, fichaje, lesión...) para leer la noticia. */
export function NewsWindow({
  item,
  myId,
  onClose,
  onOpenMatch,
}: {
  item: NewsItem | null;
  myId?: string;
  onClose: () => void;
  onOpenMatch: (f: Fixture) => void;
}) {
  const theme: NewsTheme = item?.theme ?? "liga";
  const st = NEWS_THEMES[theme];
  const leagues = item ? leaguesOfVisual(item.visual, 3) : [];

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={`${item?.teamOfRound ? "max-w-4xl" : "max-w-2xl"} max-h-[92vh] overflow-y-auto p-0 gap-0 border-2 sm:rounded-2xl ${st.window}`}
      >
        {item && (
          <>
            {/* ---------- Cabecera ---------- */}
            <div className={`px-6 pt-6 pb-5 pr-12 ${st.header}`}>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[0.65rem] font-black uppercase tracking-wider ${st.chip}`}
                >
                  <span>{st.emoji}</span>
                  {st.label}
                </span>
                <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                  {NEWS_CAT_LABEL[item.cat]}
                </span>
                {item.mine && (
                  <span className={`text-[0.65rem] font-black uppercase tracking-wider ${st.accent}`}>Tu club</span>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                  {leagues.map((lg) => (
                    <LeagueCrest key={lg} leagueId={lg} size={22} />
                  ))}
                </div>
              </div>
              <DialogTitle className="text-xl sm:text-2xl font-black leading-tight tracking-tight">
                {item.title}
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm text-foreground/80">{item.when}</DialogDescription>
            </div>

            <div className="px-6 pb-6 pt-4 space-y-4">
              {item.teamOfRound && (
                <section className={`rounded-2xl border p-3 sm:p-5 ${st.block}`}>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className={`text-[0.65rem] font-black uppercase tracking-[0.16em] ${st.accent}`}>{item.teamOfRound.competitionLabel}</p>
                      <h3 className="mt-1 text-base font-black">{item.teamOfRound.roundLabel} · {item.teamOfRound.dateLabel}</h3>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-[0.62rem] font-black uppercase tracking-wider ${st.chip}`}>XI ideal</span>
                  </div>
                  <div className="mx-auto w-full max-w-lg">
                    <TypicalElevenPitch eleven={item.teamOfRound.eleven} formation={item.teamOfRound.formation} />
                  </div>
                </section>
              )}
              {/* ---------- Partido (igual que en Jornadas) ---------- */}
              {item.fixture && (
                <div className="space-y-1.5">
                  <NewsMatchRow fixture={item.fixture} myId={myId} onOpen={onOpenMatch} />
                  <p className={`text-[0.65rem] text-center font-semibold ${st.accent}`}>
                    Pulsa el partido para ver las estadísticas
                  </p>
                </div>
              )}

              {/* ---------- Fichaje / cesión ---------- */}
              {item.transfer && (
                <div className={`rounded-xl border p-4 flex flex-wrap items-center gap-4 ${st.block}`}>
                  {item.visual.players.map((p) => (
                    <NewsPlayerFace key={p.id} playerId={p.id} name={p.name} size={52} />
                  ))}
                  <div className="min-w-0 flex-1">
                    <div className="font-black leading-tight">{item.visual.players[0]?.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {item.transfer.fromId ? `${clubName(item.transfer.fromId)} → ` : "Agente libre → "}
                      {clubName(item.transfer.toId)}
                    </div>
                  </div>
                  <TransferArrow fromId={item.transfer.fromId} toId={item.transfer.toId} size={40} />
                  {item.transfer.fee > 0 && (
                    <div className={`text-lg font-black ${st.accent}`}>{money(item.transfer.fee)}</div>
                  )}
                </div>
              )}

              {/* ---------- Lesión ---------- */}
              {item.injury && (
                <div className={`rounded-xl border p-4 flex flex-wrap items-center gap-4 ${st.block}`}>
                  <NewsPlayerFace playerId={item.injury.playerId} name={item.injury.playerName} size={56} />
                  <div className="min-w-0 flex-1">
                    <div className="font-black leading-tight">{item.injury.playerName}</div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <TeamCrest teamId={item.injury.clubId} size={18} />
                      {clubName(item.injury.clubId)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-black leading-none ${st.accent}`}>{item.injury.days}</div>
                    <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">días de baja</div>
                  </div>
                </div>
              )}

              {/* ---------- Visual genérico (sin partido, traspaso ni lesión) ---------- */}
              {!item.fixture && !item.transfer && !item.injury && !item.teamOfRound && (
                <div className={`rounded-xl border p-4 flex flex-wrap items-center gap-3 ${st.block}`}>
                  {item.visual.players.map((p) => (
                    <NewsPlayerFace key={p.id} playerId={p.id} name={p.name} size={48} />
                  ))}
                  {item.visual.teamIds.map((id) => (
                    <TeamCrest key={id} teamId={id} size={36} />
                  ))}
                  {item.visual.countries.slice(0, 2).map((c) => (
                    <CountryFlag key={c} country={c} />
                  ))}
                </div>
              )}

              {/* ---------- Texto ---------- */}
              <p className="text-sm font-semibold text-foreground/90">{item.lead}</p>
              <div className="space-y-2.5">
                {item.body.map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                    {p}
                  </p>
                ))}
              </div>

              {item.facts.length > 0 && (
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {item.facts.map((f) => (
                    <div key={f.label} className={`rounded-lg border px-3 py-2 ${st.block}`}>
                      <dt className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">{f.label}</dt>
                      <dd className="text-xs font-bold leading-snug break-words">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
