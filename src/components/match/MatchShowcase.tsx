import { motion } from "framer-motion";
import { useState } from "react";
import type { CSSProperties } from "react";
import { Activity, CalendarDays, ChevronDown, CircleDot, Crown, Flag, Shield, Sparkles, Target, Trophy, TrendingUp } from "lucide-react";
import type { MatchPreviewAnalysis } from "@/lib/matchPreviewAnalysis";
import { TeamLogo } from "@/components/TeamLogo";
import { getLeagueLogoUrl } from "@/components/LeagueLogo";
import { PlayerFace } from "@/components/PlayerFace";
import { faceUrl } from "@/lib/playerFaces";

type ShowcaseTeam = {
  id?: string;
  name: string;
  short: string;
  leagueName: string;
  formation?: string;
};

type ShowcaseCompetitionTheme = {
  accent: string;
  secondary: string;
  logoUrl: string | null;
  label: string;
};

function normalizeShowcaseLabel(value: string): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Brand the showcase with the actual competition. European cups take priority;
 * domestic league matches use the league of the participating clubs, because
 * the route label itself can be the generic "Liga · Jornada N" string.
 */
function getShowcaseCompetitionTheme(competition: string, domesticLeague = ""): ShowcaseCompetitionTheme {
  const name = normalizeShowcaseLabel(competition);
  const league = normalizeShowcaseLabel(domesticLeague);
  if (name.includes("champions") || name.includes("ucl") || name.includes("liga de campeones")) {
    return { accent: "#4268F5", secondary: "#BFD0FF", logoUrl: "/logos/competitions/champions-league.svg", label: "Champions League" };
  }
  if (name.includes("conference league") || name.includes("conference") || name.includes("uecl")) {
    return { accent: "#35A879", secondary: "#B8F2D5", logoUrl: "/logos/competitions/conference-league.svg", label: "Conference League" };
  }
  if (name.includes("europa league") || name.includes("europa") || name.includes("uel")) {
    return { accent: "#F49A28", secondary: "#FFDBA5", logoUrl: "/logos/competitions/europa-league.svg", label: "Europa League" };
  }
  if (name.includes("copa") || name.includes("cup") || name.includes("supercopa") || name.includes("playoff")) {
    return { accent: "#D9B65E", secondary: "#F7E6B3", logoUrl: "/logos/competitions/national-cup.svg", label: "Copa" };
  }

  const leagueKey = league || name;
  if (leagueKey.includes("hypermotion")) {
    return { accent: "#EF4C61", secondary: "#FFD1D8", logoUrl: "/logos/LALIGA%20HYPERMOTION/laliga-hypermotion.svg", label: "LALIGA HYPERMOTION" };
  }
  if (leagueKey.includes("laliga") || leagueKey.includes("la liga") || leagueKey.includes("liga espanola")) {
    return { accent: "#EA334F", secondary: "#FFC3CC", logoUrl: "/logos/LALIGA%20EA%20SPORTS/laliga-ea-sports.svg", label: "LALIGA EA SPORTS" };
  }
  if (leagueKey.includes("serie a") || leagueKey.includes("seriea")) {
    return { accent: "#1677E8", secondary: "#E7F2FF", logoUrl: "/logos/Serie%20A%20Enilive/serie-a-enilive.svg", label: "Serie A" };
  }
  if (leagueKey.includes("serie b")) {
    return { accent: "#1976D2", secondary: "#ECF5FF", logoUrl: "/logos/Serie%20BKT/serie-bkt.svg", label: "Serie B" };
  }
  if (leagueKey.includes("premier league") || leagueKey.includes("premier")) {
    return { accent: "#8653D7", secondary: "#E7D9FF", logoUrl: "/logos/Premier%20League/premier-league.svg", label: "Premier League" };
  }
  if (leagueKey.includes("bundesliga")) {
    return { accent: "#E73542", secondary: "#FFD6D9", logoUrl: getLeagueLogoUrl(domesticLeague || "Bundesliga"), label: domesticLeague || "Bundesliga" };
  }
  if (leagueKey.includes("ligue 2") || leagueKey.includes("ligue2")) {
    return { accent: "#3AAACD", secondary: "#DBF7FF", logoUrl: getLeagueLogoUrl(domesticLeague), label: domesticLeague };
  }
  if (leagueKey.includes("ligue 1") || leagueKey.includes("ligue1")) {
    return { accent: "#44B9D5", secondary: "#D8F8FF", logoUrl: "/logos/Ligue%201%20McDonald%27s/ligue-1-mcdonalds.svg", label: "Ligue 1" };
  }
  if (leagueKey.includes("eredivisie")) {
    return { accent: "#F47721", secondary: "#FFE0C6", logoUrl: "/logos/Eredivisie/eredivisie.svg", label: "Eredivisie" };
  }
  if (leagueKey.includes("efl championship")) {
    return { accent: "#2454A6", secondary: "#D8E6FF", logoUrl: getLeagueLogoUrl(domesticLeague), label: domesticLeague };
  }
  if (leagueKey.includes("efl league one") || leagueKey.includes("efl league two") || leagueKey.includes("3. liga")) {
    return { accent: "#D94A50", secondary: "#FFE0E2", logoUrl: getLeagueLogoUrl(domesticLeague), label: domesticLeague };
  }
  if (leagueKey.includes("allsvenskan") || leagueKey.includes("eliteserien") || leagueKey.includes("scottish prem")) {
    return { accent: "#278767", secondary: "#D5F4E9", logoUrl: getLeagueLogoUrl(domesticLeague), label: domesticLeague };
  }
  if (leagueKey.includes("liga portugal") || leagueKey.includes("primeira liga")) {
    return { accent: "#259B65", secondary: "#F1D0D5", logoUrl: getLeagueLogoUrl(domesticLeague), label: domesticLeague || "Liga Portugal" };
  }
  if (leagueKey.includes("lpf") || leagueKey.includes("superliga")) {
    return { accent: "#315788", secondary: "#E4EDF8", logoUrl: getLeagueLogoUrl(domesticLeague), label: domesticLeague };
  }
  return {
    accent: "#8CB8FF",
    secondary: "#DCE9FF",
    logoUrl: domesticLeague ? getLeagueLogoUrl(domesticLeague) : null,
    label: domesticLeague || competition || "Competición",
  };
}

function ShowcaseCompetitionLogo({ theme }: { theme: ShowcaseCompetitionTheme }) {
  const [failed, setFailed] = useState(false);
  if (!theme.logoUrl || failed) return null;
  return (
    <div className="match-competition-logo-frame" title={theme.label} aria-label={`Logo de ${theme.label}`}>
      <img src={theme.logoUrl} alt={theme.label} className="match-competition-logo" onError={() => setFailed(true)} />
    </div>
  );
}

export function MatchIntroPanel({
  competition,
  home,
  away,
  homeColor,
  awayColor,
  analysis,
}: {
  competition: string;
  home: ShowcaseTeam;
  away: ShowcaseTeam;
  homeColor: string;
  awayColor: string;
  analysis: MatchPreviewAnalysis;
}) {
  const [showPreviewSummary, setShowPreviewSummary] = useState(false);
  const competitionTheme = getShowcaseCompetitionTheme(competition, home.leagueName);

  const renderFormPanel = (team: ShowcaseTeam, form: MatchPreviewAnalysis["homeForm"], accent: string) => (
    <section className="match-preview-team-form min-w-0 rounded-xl border border-white/[0.09] bg-slate-950/35 p-3 sm:p-4" style={{ ["--team-accent" as string]: accent } as CSSProperties}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="match-preview-mini-crest flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.045]">
            <TeamLogo teamName={team.name} leagueName={team.leagueName} size={22} />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-xs font-extrabold text-white sm:text-sm">{team.name}</h3>
            <p className="mt-0.5 text-[0.56rem] font-black uppercase tracking-[0.14em] text-white/40">Últimos partidos</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.045] px-2 py-1 text-[0.54rem] font-bold text-white/65">{form.trend}</span>
      </div>
      <div className="mt-3 flex items-center gap-1.5" aria-label={`Forma reciente de ${team.name}`}>
        {form.chips.length > 0 ? form.chips.map((item, index) => (
          <span
            key={`${item.opponent}-${item.score}-${index}`}
            title={item.title}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[0.62rem] font-black ${item.code === "W" ? "border-emerald-300/20 bg-emerald-400/15 text-emerald-200" : item.code === "D" ? "border-slate-300/20 bg-slate-400/15 text-slate-200" : "border-rose-300/20 bg-rose-400/15 text-rose-200"}`}
          >
            {item.code === "W" ? "V" : item.code === "D" ? "E" : "D"}
          </span>
        )) : <span className="text-[0.63rem] text-white/45">Sin resultados registrados</span>}
        <span className="ml-auto text-[0.56rem] font-bold uppercase tracking-wider text-white/35">{form.played ? `${form.played} ${form.played === 1 ? "partido" : "partidos"}` : "Sin historial"}</span>
      </div>
      <p className="mt-2.5 text-[0.68rem] leading-relaxed text-white/65 sm:text-[0.74rem]">{form.summary}</p>
    </section>
  );

  const renderTacticalPanel = (plan: MatchPreviewAnalysis["homePlan"], accent: string) => (
    <section className="match-preview-team-tactical match-preview-tactical min-w-0 rounded-xl border border-white/[0.09] bg-white/[0.025] p-3 sm:p-3.5" style={{ ["--team-accent" as string]: accent } as CSSProperties}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[0.55rem] font-black uppercase tracking-[0.15em] text-lime-200/65"><Target className="h-3 w-3" /> Plan de partido</div>
          <h3 className="mt-1 truncate text-sm font-extrabold text-white sm:text-base">{plan.heading}</h3>
          <p className="mt-1 text-[0.59rem] font-semibold text-white/60">Mentalidad {plan.mentality} · {plan.gameStyle}</p>
        </div>
        <span className="shrink-0 rounded-md border border-white/10 bg-white/[0.045] px-2 py-1 text-[0.62rem] font-bold text-white/65">{plan.formation}</span>
      </div>
      <p className="mt-1.5 text-[0.66rem] leading-snug text-white/65 sm:text-[0.7rem]">{plan.body}</p>
      <p className={`mt-2 rounded-md border px-2 py-1.5 text-[0.62rem] font-semibold ${plan.matchupStatus === "favorable" ? "border-emerald-300/15 bg-emerald-300/[0.05] text-emerald-100/75" : plan.matchupStatus === "complicado" ? "border-amber-300/15 bg-amber-300/[0.05] text-amber-100/75" : "border-white/[0.07] bg-black/15 text-white/55"}`}>
        {plan.matchupStatus === "favorable" ? "Buen cruce" : plan.matchupStatus === "complicado" ? "Ojo con" : "Duelo equilibrado"} · {plan.matchup}
      </p>
    </section>
  );

  return (
    <motion.section
      className="match-intro-hero mb-4 overflow-hidden rounded-[1.35rem] border"
      style={{ ["--showcase-accent" as string]: competitionTheme.accent, ["--comp-accent" as string]: competitionTheme.accent, ["--showcase-secondary" as string]: competitionTheme.secondary } as CSSProperties}
      aria-label={`Previa del partido ${home.name} contra ${away.name}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <div className="match-intro-lights" aria-hidden="true" />
      <div className="match-intro-topline relative flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 text-[0.62rem] font-black uppercase tracking-[0.18em]">
          <ShowcaseCompetitionLogo theme={competitionTheme} />
          <span className="truncate">{competition}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="match-intro-status"><span /> ANÁLISIS PREVIO</span>
        </div>
      </div>

      <div className="match-intro-teams relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-4 py-5 sm:gap-5 sm:px-8 sm:py-7">
        <div className="match-intro-team text-center" style={{ ["--team-accent" as string]: homeColor } as CSSProperties}>
          <div className="match-intro-crest mx-auto flex items-center justify-center"><TeamLogo teamName={home.name} leagueName={home.leagueName} size={64} /></div>
          <div className="mt-3 text-[0.58rem] font-black uppercase tracking-[0.2em] text-white/50">LOCAL</div>
          <h2 className="match-intro-team-name mt-1 text-base font-black leading-tight sm:text-2xl">{home.name}</h2>
          {home.formation && <span className="match-intro-formation mt-2 inline-flex">{home.formation.replace("Táctica ", "")}</span>}
        </div>
        <div className="match-intro-versus flex flex-col items-center gap-2" aria-hidden="true">
          <span>VS</span>
          <div className="hidden h-10 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent sm:block" />
        </div>
        <div className="match-intro-team text-center" style={{ ["--team-accent" as string]: awayColor } as CSSProperties}>
          <div className="match-intro-crest mx-auto flex items-center justify-center"><TeamLogo teamName={away.name} leagueName={away.leagueName} size={64} /></div>
          <div className="mt-3 text-[0.58rem] font-black uppercase tracking-[0.2em] text-white/50">VISITANTE</div>
          <h2 className="match-intro-team-name mt-1 text-base font-black leading-tight sm:text-2xl">{away.name}</h2>
          {away.formation && <span className="match-intro-formation mt-2 inline-flex">{away.formation.replace("Táctica ", "")}</span>}
        </div>
      </div>

      <div className="relative px-3 pb-4 sm:px-5 sm:pb-5">
        <div className="flex justify-center">
          <button
            type="button"
            aria-expanded={showPreviewSummary}
            onClick={() => setShowPreviewSummary((visible) => !visible)}
            className="match-intro-summary-button inline-flex min-h-10 items-center gap-2 rounded-xl border border-lime-200/25 bg-lime-200/[0.08] px-4 py-2 text-[0.68rem] font-black uppercase tracking-[0.12em] text-lime-100 transition hover:border-lime-200/45 hover:bg-lime-200/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-200/60"
          >
            {showPreviewSummary ? "Ocultar resumen" : "Ver resumen"}
            <ChevronDown className={`h-4 w-4 transition-transform ${showPreviewSummary ? "rotate-180" : ""}`} />
          </button>
        </div>
        {showPreviewSummary && (
          <div className="mt-3 space-y-3 sm:space-y-4">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <section className="min-w-0 rounded-xl border border-white/[0.09] bg-black/15 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-lime-200" /><h3 className="text-[0.62rem] font-black uppercase tracking-[0.15em] text-white/80">Cómo llegan</h3></div>
              <span className="text-[0.55rem] font-bold text-white/35">Resultados guardados en la carrera</span>
            </div>
            <div className="grid gap-2.5 md:grid-cols-2">
              {renderFormPanel(home, analysis.homeForm, homeColor)}
              {renderFormPanel(away, analysis.awayForm, awayColor)}
            </div>
          </section>

          <section className="match-preview-context min-w-0 rounded-xl border border-lime-200/15 bg-gradient-to-br from-lime-300/[0.08] via-white/[0.025] to-transparent p-3 sm:p-4">
            <div className="flex items-center gap-2 text-[0.56rem] font-black uppercase tracking-[0.17em] text-lime-200/80"><Trophy className="h-3.5 w-3.5" /> Qué hay en juego</div>
            <h3 className="mt-2 text-base font-black leading-snug text-white sm:text-lg">{analysis.contextTitle}</h3>
            <p className="mt-2 text-[0.7rem] leading-relaxed text-white/70 sm:text-[0.76rem]">{analysis.contextBody}</p>
            {analysis.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{analysis.tags.map((tag) => <span key={tag} className="rounded-full border border-white/10 bg-black/15 px-2 py-1 text-[0.55rem] font-bold text-white/65">{tag}</span>)}</div>}
          </section>
        </div>

        {analysis.individualRuns.length > 0 && (
          <section className="match-preview-individual-runs rounded-xl border p-3 sm:p-4" style={{ ["--showcase-accent" as string]: competitionTheme.accent, ["--comp-accent" as string]: competitionTheme.accent } as CSSProperties} aria-label="Rachas individuales recientes">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="match-preview-individual-icon flex h-7 w-7 items-center justify-center rounded-lg border"><Sparkles className="h-3.5 w-3.5" /></span>
                <div>
                  <h3 className="text-[0.62rem] font-black uppercase tracking-[0.16em] text-white/85">Nombres propios y rachas</h3>
                  <p className="mt-0.5 text-[0.58rem] text-white/40">Estadísticas individuales de los últimos partidos registrados</p>
                </div>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[0.52rem] font-bold uppercase tracking-wider text-white/45">Datos reales de la carrera</span>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {analysis.individualRuns.map((run) => {
                const sideTeam = run.side === "home" ? home : away;
                const teamAccent = run.side === "home" ? homeColor : awayColor;
                const statLabel = run.category === "goals" ? "GOLES RECIENTES"
                  : run.category === "assists" ? "ASISTENCIAS"
                    : run.category === "cleanSheets" ? "PORTERÍAS A CERO"
                      : run.category === "rating" ? "NOTA MEDIA"
                        : run.category === "form" ? "FORMA RECIENTE"
                          : run.category === "quality" ? "MEDIA ACTUAL"
                            : run.category === "impact" ? "APORTACIÓN"
                              : run.category === "profile" ? "JUGADOR DESTACADO"
                                : "DISTINCIONES MVP";
                return (
                  <article key={run.id} className="match-preview-player-run min-w-0 rounded-xl border border-white/[0.09] bg-slate-950/40 p-3" style={{ ["--team-accent" as string]: teamAccent } as CSSProperties}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <PlayerFace name={run.playerName} image={faceUrl(run.playerId)} size={44} showRing={false} className="shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-extrabold text-white" title={run.playerName}>{run.playerName}</div>
                        <div className="mt-1 flex min-w-0 items-center gap-1.5">
                          <TeamLogo teamName={sideTeam.name} leagueName={sideTeam.leagueName} size={17} />
                          <span className="truncate text-[0.58rem] font-semibold text-white/50">{sideTeam.name}</span>
                        </div>
                      </div>
                      <div className="match-preview-run-value shrink-0 rounded-lg border border-white/10 bg-white/[0.045] px-2.5 py-1.5 text-center">
                        <div className="match-preview-run-number text-base font-black leading-none tabular-nums text-white">{run.value}</div>
                        <div className="mt-1 text-[0.47rem] font-black uppercase tracking-wider text-white/40">{statLabel}</div>
                      </div>
                    </div>
                    <h4 className="mt-3 text-[0.7rem] font-extrabold leading-snug">{run.title}</h4>
                    <p className="mt-1 text-[0.65rem] leading-relaxed text-white/60">{run.body}</p>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {analysis.rivalry && (
          <section className="match-preview-rivalry flex items-start gap-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.045] p-3 sm:p-4">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-200/15 bg-amber-200/[0.08] text-amber-100"><Shield className="h-4 w-4" /></div>
            <div className="min-w-0"><div className="text-[0.56rem] font-black uppercase tracking-[0.16em] text-amber-100/70">Partido especial</div><h3 className="mt-1 text-sm font-extrabold text-white">{analysis.rivalry.title}</h3><p className="mt-1.5 text-[0.68rem] leading-relaxed text-white/65 sm:text-[0.74rem]">{analysis.rivalry.body}</p></div>
          </section>
        )}

        <div className="grid gap-3 lg:grid-cols-2">
          {renderTacticalPanel(analysis.homePlan, homeColor)}
          {renderTacticalPanel(analysis.awayPlan, awayColor)}
        </div>

        <section className="match-preview-key-battle rounded-xl border border-sky-200/10 bg-sky-300/[0.035] p-3 sm:p-4">
          <div className="flex items-center gap-2 text-[0.56rem] font-black uppercase tracking-[0.16em] text-sky-100/70"><Activity className="h-3.5 w-3.5" /> La clave del encuentro</div>
          <h3 className="mt-1.5 text-sm font-extrabold text-white sm:text-base">{analysis.keyBattle.title}</h3>
          <p className="mt-1.5 text-[0.68rem] leading-relaxed text-white/65 sm:text-[0.74rem]">{analysis.keyBattle.body}</p>
          <p className="mt-2 border-t border-white/[0.07] pt-2 text-[0.67rem] leading-relaxed text-white/50">{analysis.overallRead}</p>
          {analysis.previousMeeting && <p className="mt-2 flex items-start gap-2 text-[0.65rem] leading-relaxed text-white/45"><CircleDot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-200/60" />{analysis.previousMeeting}</p>}
        </section>
          </div>
        )}
      </div>

      <div className="match-intro-footer relative flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2 text-xs text-white/65"><CalendarDays className="h-4 w-4 text-lime-300" /><span>La previa está lista. El marcador y el reloj aparecerán al iniciar el partido.</span></div>
        <div className="flex items-center gap-1.5 text-[0.6rem] font-black uppercase tracking-[0.16em] text-lime-200"><Sparkles className="h-3.5 w-3.5" /> Análisis de partido</div>
      </div>
    </motion.section>
  );
}

type MatchTimelineEventInput = {
  kind?: string;
  type?: string;
  minute?: number;
  team?: "home" | "away" | string;
  teamSide?: "home" | "away" | string;
  playerId?: string;
  playerName?: string;
  scorerName?: string;
  assistName?: string;
  playerInName?: string;
  playerOutName?: string;
  inName?: string;
  outName?: string;
  inId?: string;
  outId?: string;
  cardType?: string;
  isSecondYellow?: boolean;
  detail?: string;
  title?: string;
  body?: string;
  reason?: string;
};

type MatchTimelineEvent = MatchTimelineEventInput & {
  key: string;
  kind: "goal" | "card" | "substitution" | "highlight" | "moment";
  minute: number;
  type: string;
  team?: "home" | "away";
  playerName?: string;
  description: string;
};

const GOAL_EVENT_TYPES = new Set(["goal", "penalty_goal", "free_kick_goal", "own_goal"]);
const HIGHLIGHT_EVENT_TYPES = new Set(["save", "woodwork", "big_chance", "penalty_missed", "penalty_save", "var", "var_disallowed", "injury", "injury_substitution", "forced_sub"]);

function normalizeFinalTimelineEvents(
  timeline: MatchTimelineEventInput[],
  goalEvents: any[],
  home: ShowcaseTeam,
  away: ShowcaseTeam,
): MatchTimelineEvent[] {
  const source = timeline.length ? timeline : goalEvents.map((event) => ({ ...event, kind: "goal", playerName: event.scorerName ?? event.playerName }));
  const unique = new Map<string, MatchTimelineEvent>();
  for (const item of source) {
    const type = String(item.type ?? item.kind ?? "moment").toLowerCase();
    const minute = Number(item.minute);
    if (!Number.isFinite(minute) || minute < 0) continue;
    const teamRaw = item.team ?? item.teamSide;
    const team = teamRaw === "home" || teamRaw === "away" ? teamRaw : undefined;
    const playerName = String(item.playerName ?? item.scorerName ?? "").trim();
    const playerId = String(item.playerId ?? "");
    let kind: MatchTimelineEvent["kind"];
    let normalizedType = type;
    if (GOAL_EVENT_TYPES.has(type)) kind = "goal";
    else if (item.cardType || ["yellow_card", "red_card", "yellow", "red"].includes(type)) {
      kind = "card";
      normalizedType = item.cardType === "red" || item.isSecondYellow || type === "red_card" || type === "red" ? "red_card" : "yellow_card";
    } else if (item.playerInName || item.playerOutName || item.inName || item.outName || type === "substitution" || type === "sub") {
      kind = "substitution";
      normalizedType = "substitution";
    } else if (HIGHLIGHT_EVENT_TYPES.has(type)) kind = "highlight";
    else {
      kind = item.kind === "moment" ? "moment" : item.kind === "highlight" ? "highlight" : "moment";
      if (type === "var_disallowed" || type === "var") kind = "highlight";
    }
    const playerInName = String(item.playerInName ?? item.inName ?? "");
    const playerOutName = String(item.playerOutName ?? item.outName ?? "");
    const normalizedPlayerId = playerId || String(item.inId ?? item.outId ?? "");
    // Canonical keys make the saved result, live feed and the match chronicle
    // cooperate without repeating the very same goal/card/highlight twice.
    const key = `${Math.floor(minute)}:${kind}:${normalizedType}:${team ?? "unknown"}:${normalizedPlayerId || playerName}:${playerInName}:${playerOutName}`;
    if (unique.has(key)) continue;
    const teamName = team === "home" ? home.name : team === "away" ? away.name : "";
    const eventText = (item.body || item.detail || item.reason || "").trim();
    let description = "Acontecimiento del encuentro registrado.";
    if (kind === "goal") {
      if (normalizedType === "own_goal") description = `${teamName} se benefició de un gol en propia puerta${playerName ? ` de ${playerName}` : ""}.`;
      else if (normalizedType === "penalty_goal") description = `${playerName || "El lanzador"} transformó un penalti para ${teamName}.`;
      else if (normalizedType === "free_kick_goal") description = `${playerName || "El lanzador"} marcó de falta directa para ${teamName}.`;
      else description = `${playerName || "Un jugador"} marcó para ${teamName}${item.assistName ? ` tras la asistencia de ${item.assistName}` : ""}.`;
    } else if (kind === "card") {
      const isRed = normalizedType === "red_card";
      description = isRed
        ? `${playerName || "Un jugador"} fue expulsado${teamName ? ` (${teamName})` : ""}; su equipo tuvo que jugar en inferioridad.`
        : `${playerName || "Un jugador"} vio tarjeta amarilla${teamName ? ` (${teamName})` : ""}.`;
    } else if (kind === "substitution") {
      description = `${teamName ? `${teamName}: ` : ""}${playerInName || "Un suplente"} entró${playerOutName ? ` por ${playerOutName}` : ""}.`;
    } else if (kind === "highlight") {
      switch (normalizedType) {
        case "save": description = `Parada de mérito de ${playerName || "el portero"}${teamName ? ` (${teamName})` : ""}${eventText ? `: ${eventText}` : "."}`; break;
        case "woodwork": description = `Una ocasión terminó estrellándose en el palo${playerName ? ` tras el disparo de ${playerName}` : ""}.`; break;
        case "big_chance": description = `Gran ocasión de gol para ${teamName || "uno de los equipos"}${playerName ? `, con ${playerName}` : ""}${eventText ? `: ${eventText}` : "."}`; break;
        case "penalty_missed": description = `${playerName || "El lanzador"} falló un penalti${teamName ? ` para ${teamName}` : ""}.`; break;
        case "penalty_save": description = `${playerName || "El portero"} detuvo un penalti${teamName ? ` (${teamName})` : ""}.`; break;
        case "var_disallowed": description = `El VAR anuló un gol${playerName ? ` de ${playerName}` : ""}${teamName ? ` (${teamName})` : ""}.`; break;
        case "var": description = `El VAR revisó una acción importante${eventText ? `: ${eventText}` : "."}`; break;
        case "injury": description = `${playerName || "Un futbolista"} tuvo que ser atendido${teamName ? ` (${teamName})` : ""}${eventText ? `: ${eventText}` : "."}`; break;
        case "injury_substitution":
        case "forced_sub": description = `Cambio obligado por una incidencia física${playerName ? ` de ${playerName}` : ""}${eventText ? `: ${eventText}` : "."}`; break;
        default: description = eventText || `${normalizedType.replaceAll("_", " ")} · ${teamName}`;
      }
    } else {
      const title = String(item.title ?? "").trim();
      description = [title, eventText].filter(Boolean).join(" · ") || `${normalizedType.replaceAll("_", " ")}${teamName ? ` (${teamName})` : ""}.`;
    }
    unique.set(key, {
      ...item,
      key,
      kind,
      type: normalizedType,
      minute: Math.floor(minute),
      team,
      playerName: playerName || undefined,
      description,
    });
  }
  return [...unique.values()].sort((a, b) => a.minute - b.minute || a.key.localeCompare(b.key));
}

function summarizeEventPhase(label: string, events: MatchTimelineEvent[]): string {
  if (!events.length) return `${label}: no se registraron acciones destacadas en la crónica durante este tramo.`;
  const phrases = events.slice(0, 4).map((event) => `${event.minute}′, ${event.description.replace(/\.$/, "")}`);
  const remaining = events.length - phrases.length;
  return `${label}: ${phrases.join(". ")}${remaining > 0 ? `. Además, se registraron ${remaining} ${remaining === 1 ? "acción destacada" : "acciones destacadas"} más` : ""}.`;
}

function buildMatchDevelopmentNarrative(
  home: ShowcaseTeam,
  away: ShowcaseTeam,
  homeScore: number,
  awayScore: number,
  events: MatchTimelineEvent[],
  stats: any,
  result: any,
  extraTime: boolean,
): { intro: string; phases: Array<{ title: string; body: string }>; turningPoint: string | null; stats: Array<{ label: string; value: string }> } {
  const difference = Math.abs(homeScore - awayScore);
  const totalGoals = homeScore + awayScore;
  const intro = result?.penalties
    ? `${home.name} y ${away.name} terminaron ${homeScore}-${awayScore} tras el tiempo de juego; la eliminatoria se resolvió en la tanda de penaltis (${result.penalties.homeGoals}-${result.penalties.awayGoals}).`
    : totalGoals >= 4
      ? homeScore === awayScore
        ? `Fue un encuentro abierto, con ${totalGoals} goles y alternativas en el marcador. Ninguno logró imponerse definitivamente y el empate ${homeScore}-${awayScore} refleja que ambos encontraron vías para hacer daño.`
        : `Fue un encuentro abierto, con ${totalGoals} goles y cambios en el marcador. ${homeScore > awayScore ? home.name : away.name} acabó imponiéndose, pero los acontecimientos registrados muestran que el partido ofreció varias fases de peligro.`
      : difference === 1
        ? `El encuentro se decidió por la mínima (${homeScore}-${awayScore}). En un margen tan corto, cada gol y cada acción defensiva tuvieron un peso directo en el desenlace.`
        : homeScore === awayScore
          ? totalGoals === 0
            ? `El partido terminó 0-0. Ningún equipo consiguió convertir sus ocasiones en gol, por lo que el resultado refleja un encuentro sin goles registrados; las paradas y ocasiones recogidas en la crónica permiten ver dónde estuvo el peligro.`
            : `El encuentro terminó en empate ${homeScore}-${awayScore}: ambos equipos encontraron el gol, pero ninguno logró conservar una ventaja definitiva.`
          : `${homeScore > awayScore ? home.name : away.name} se llevó el partido por ${homeScore}-${awayScore}. El resultado final premió al equipo que terminó por delante, con el desarrollo detallado en los acontecimientos siguientes.`;

  const firstHalf = events.filter((event) => event.minute <= 45);
  const secondHalf = events.filter((event) => event.minute > 45 && event.minute <= 90);
  const latePhase = events.filter((event) => event.minute > 90);
  const phases = [
    { title: "PRIMERA PARTE", body: summarizeEventPhase("Antes del descanso", firstHalf) },
    { title: "SEGUNDA PARTE", body: summarizeEventPhase("Tras el descanso", secondHalf) },
  ];
  if (latePhase.length) phases.push({ title: extraTime ? "PRÓRROGA" : "TIEMPO AÑADIDO", body: summarizeEventPhase(extraTime ? "En la prórroga" : "En el tramo final", latePhase) });

  let turningPoint: string | null = null;
  const redCard = events.find((event) => event.kind === "card" && event.type === "red_card");
  const missedPenalty = events.find((event) => event.type === "penalty_missed" || event.type === "penalty_save");
  const lastGoal = [...events].reverse().find((event) => event.kind === "goal");
  if (redCard && difference > 0) {
    turningPoint = `Uno de los momentos que pudo condicionar el desenlace fue la expulsión registrada en el minuto ${redCard.minute}′: a partir de ahí, ${redCard.team === "home" ? home.name : redCard.team === "away" ? away.name : "el equipo afectado"} tuvo que reorganizarse con un futbolista menos.`;
  } else if (lastGoal && difference > 0) {
    const scoringTeam = lastGoal.team === "home" ? home : away;
    turningPoint = `El último cambio en el marcador llegó en el minuto ${lastGoal.minute}′: ${lastGoal.description.replace(/\.$/, "")}. Ese fue el último gol registrado antes del resultado definitivo.`;
  } else if (missedPenalty) {
    turningPoint = `La acción desde el punto de penalti del minuto ${missedPenalty.minute}′ fue una oportunidad importante que no terminó en gol y forma parte de los momentos clave del encuentro.`;
  } else if (lastGoal) {
    turningPoint = `El último gol llegó en el minuto ${lastGoal.minute}′: ${lastGoal.description.replace(/\.$/, "")}. Sin más goles registrados después, el empate se mantuvo hasta el final.`;
  } else if (!events.length) {
    turningPoint = "No hay suficientes eventos individuales guardados para señalar una jugada decisiva concreta; por eso el resumen evita atribuir el resultado a una acción que no figure en la crónica.";
  }

  const summaryStats: Array<{ label: string; value: string }> = [];
  const h = stats?.home;
  const a = stats?.away;
  const value = (entry: any, key: string) => Number.isFinite(Number(entry?.[key])) ? Number(entry[key]) : null;
  const possessionHome = value(h, "possession");
  const possessionAway = value(a, "possession");
  if (possessionHome !== null && possessionAway !== null) summaryStats.push({ label: "POSESIÓN", value: `${Math.round(possessionHome)}% — ${Math.round(possessionAway)}%` });
  const shotsHome = value(h, "shots");
  const shotsAway = value(a, "shots");
  if (shotsHome !== null && shotsAway !== null) summaryStats.push({ label: "TIROS", value: `${shotsHome} — ${shotsAway}` });
  const targetHome = value(h, "shotsOnTarget");
  const targetAway = value(a, "shotsOnTarget");
  if (targetHome !== null && targetAway !== null) summaryStats.push({ label: "A PUERTA", value: `${targetHome} — ${targetAway}` });
  const xgHome = value(h, "xg");
  const xgAway = value(a, "xg");
  if (xgHome !== null && xgAway !== null && (xgHome > 0 || xgAway > 0)) summaryStats.push({ label: "GOLES ESPERADOS", value: `${xgHome.toFixed(2)} — ${xgAway.toFixed(2)}` });
  return { intro, phases, turningPoint, stats: summaryStats };
}

export function MatchFinalSummary({
  competition,
  home,
  away,
  homeScore,
  awayScore,
  homeColor,
  awayColor,
  result,
  goalEvents = [],
  timelineEvents = [],
}: {
  competition: string;
  home: ShowcaseTeam;
  away: ShowcaseTeam;
  homeScore: number;
  awayScore: number;
  homeColor: string;
  awayColor: string;
  result?: any;
  goalEvents?: any[];
  timelineEvents?: MatchTimelineEventInput[];
}) {
  const [showMatchSummary, setShowMatchSummary] = useState(false);
  const competitionTheme = getShowcaseCompetitionTheme(competition, home.leagueName);
  const penalties = result?.penalties;
  const extraTime = Boolean(result?.extraTime);
  const outcome = penalties
    ? Number(penalties.homeGoals) === Number(penalties.awayGoals)
      ? "Resolución en la tanda de penaltis"
      : Number(penalties.homeGoals) > Number(penalties.awayGoals)
        ? `${home.short} gana en los penaltis`
        : `${away.short} gana en los penaltis`
    : homeScore > awayScore
      ? `Victoria de ${home.name}`
      : awayScore > homeScore
        ? `Victoria de ${away.name}`
        : "Empate al final del encuentro";
  const mvp = result?.mvp;
  const uniqueGoalEvents = new Map<string, any>();
  goalEvents
    .filter((event) => ["goal", "penalty_goal", "free_kick_goal", "own_goal"].includes(event.type) && Number.isFinite(Number(event.minute)) && (event.scorerName || event.playerName))
    .forEach((event) => {
      const key = `${event.type}:${event.team}:${event.minute}:${event.scorerId ?? event.scorerName ?? event.playerName}`;
      if (!uniqueGoalEvents.has(key)) uniqueGoalEvents.set(key, event);
    });
  const validGoals = [...uniqueGoalEvents.values()].sort((a, b) => Number(a.minute) - Number(b.minute));
  const matchLengthLabel = extraTime ? "Tras prórroga" : "Tiempo reglamentario";
  const matchTimeline = normalizeFinalTimelineEvents(timelineEvents, goalEvents, home, away);
  const scoreAfterGoal = new Map<string, string>();
  let runningHome = 0;
  let runningAway = 0;
  for (const event of matchTimeline.filter((item) => item.kind === "goal")) {
    if (event.team === "home") runningHome += 1;
    else if (event.team === "away") runningAway += 1;
    scoreAfterGoal.set(event.key, `${runningHome}-${runningAway}`);
  }
  const annotatedTimeline = matchTimeline.map((event) => {
    const score = event.kind === "goal" ? scoreAfterGoal.get(event.key) : undefined;
    return score ? { ...event, description: `${event.description.replace(/\.$/, "")} (marcador ${score})` } : event;
  });
  const development = buildMatchDevelopmentNarrative(home, away, homeScore, awayScore, annotatedTimeline, result?.stats, result, extraTime);

  return (
    <motion.section
      className="match-final-hero mb-4 overflow-hidden rounded-[1.35rem] border"
      style={{ ["--showcase-accent" as string]: competitionTheme.accent, ["--comp-accent" as string]: competitionTheme.accent, ["--showcase-secondary" as string]: competitionTheme.secondary } as CSSProperties}
      aria-label={`Resultado final: ${home.name} ${homeScore}, ${away.name} ${awayScore}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: "easeOut" }}
    >
      <div className="match-final-topline flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="match-final-competition-lockup flex min-w-0 items-center gap-3">
          <ShowcaseCompetitionLogo theme={competitionTheme} />
          <div className="min-w-0">
            <div className="match-final-eyebrow">RESULTADO FINAL</div>
            <div className="match-final-competition truncate">{competition}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="match-final-status"><span /> PARTIDO FINALIZADO</span>
        </div>
      </div>

      <div className="match-final-scoreboard relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-5 sm:gap-6 sm:px-8 sm:py-7">
        <div className="match-final-team match-final-team-home min-w-0 text-center" style={{ ["--team-accent" as string]: homeColor } as CSSProperties}>
          <div className="match-final-crest mx-auto"><TeamLogo teamName={home.name} leagueName={home.leagueName} size={62} /></div>
          <div className="match-final-venue mt-3">LOCAL</div>
          <div className="match-final-team-name mt-1 truncate text-sm font-extrabold sm:text-lg" title={home.name}>{home.name}</div>
          {home.formation && <div className="match-final-formation mt-1">{home.formation.replace("Táctica ", "")}</div>}
        </div>

        <div className="match-final-center flex min-w-0 flex-col items-center px-1 sm:px-3">
          <div className="match-final-score-label">RESULTADO FINAL</div>
          <div className="match-final-scoreline mt-2 flex items-center justify-center gap-2 sm:gap-4" aria-label={`${homeScore} a ${awayScore}`}>
            <span className="match-final-score-number">{homeScore}</span>
            <span className="match-final-dash">:</span>
            <span className="match-final-score-number">{awayScore}</span>
          </div>
          <div className="match-final-outcome mt-3 text-center">{outcome}</div>
          <div className="match-final-match-meta mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
            <span>{penalties ? "TANDA DE PENALTIS" : matchLengthLabel.toUpperCase()}</span>
            {penalties && <strong>{penalties.homeGoals} — {penalties.awayGoals}</strong>}
          </div>
        </div>

        <div className="match-final-team match-final-team-away min-w-0 text-center" style={{ ["--team-accent" as string]: awayColor } as CSSProperties}>
          <div className="match-final-crest mx-auto"><TeamLogo teamName={away.name} leagueName={away.leagueName} size={62} /></div>
          <div className="match-final-venue mt-3">VISITANTE</div>
          <div className="match-final-team-name mt-1 truncate text-sm font-extrabold sm:text-lg" title={away.name}>{away.name}</div>
          {away.formation && <div className="match-final-formation mt-1">{away.formation.replace("Táctica ", "")}</div>}
        </div>
      </div>

      <div className="border-t border-white/[0.08] px-3 py-3 sm:px-5">
        <div className="flex justify-center">
          <button
            type="button"
            aria-expanded={showMatchSummary}
            onClick={() => setShowMatchSummary((visible) => !visible)}
            className="match-final-summary-button inline-flex min-h-10 items-center gap-2 rounded-xl border border-lime-200/25 bg-lime-200/[0.08] px-4 py-2 text-[0.68rem] font-black uppercase tracking-[0.12em] text-lime-100 transition hover:border-lime-200/45 hover:bg-lime-200/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-200/60"
          >
            {showMatchSummary ? "Ocultar resumen" : "Ver resumen"}
            <ChevronDown className={`h-4 w-4 transition-transform ${showMatchSummary ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {showMatchSummary && (
        <>
      <section className="match-final-development border-t px-3 py-4 sm:px-5 sm:py-5" aria-label="Desarrollo del encuentro">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="match-final-section-icon"><Activity className="h-3.5 w-3.5" /></span>
            <div>
              <h3 className="text-[0.65rem] font-black uppercase tracking-[0.15em] text-white/90">Cómo se desarrolló el partido</h3>
              <p className="mt-0.5 text-[0.6rem] text-white/45">Resumen generado a partir de los acontecimientos y estadísticas registrados</p>
            </div>
          </div>
          <span className="match-final-count">{matchTimeline.length} {matchTimeline.length === 1 ? "evento" : "eventos"}</span>
        </div>
        <p className="max-w-5xl text-sm leading-relaxed text-white/75">{development.intro}</p>
        {development.stats.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {development.stats.map((item) => (
              <div key={item.label} className="rounded-lg border border-white/[0.09] bg-white/[0.035] px-3 py-2">
                <div className="text-[0.5rem] font-black uppercase tracking-[0.14em] text-white/40">{item.label}</div>
                <div className="mt-1 text-xs font-extrabold tabular-nums text-white/85">{item.value}</div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {development.phases.map((phase) => (
            <div key={phase.title} className="rounded-xl border border-white/[0.08] bg-black/15 p-3">
              <h4 className="text-[0.54rem] font-black uppercase tracking-[0.15em] text-emerald-200/75">{phase.title}</h4>
              <p className="mt-1.5 text-[0.67rem] leading-relaxed text-white/65">{phase.body}</p>
            </div>
          ))}
        </div>
        {development.turningPoint && (
          <div className="mt-3 rounded-xl border border-lime-200/10 bg-lime-200/[0.035] p-3">
            <div className="text-[0.53rem] font-black uppercase tracking-[0.15em] text-lime-200/70">Momento clave</div>
            <p className="mt-1.5 text-[0.68rem] leading-relaxed text-white/70">{development.turningPoint}</p>
          </div>
        )}
        {matchTimeline.length > 0 && (
          <details className="mt-3 rounded-xl border border-white/[0.08] bg-black/10">
            <summary className="cursor-pointer list-none px-3 py-2.5 text-[0.62rem] font-extrabold text-white/70 marker:hidden">Ver crónica completa ({matchTimeline.length} acontecimientos)</summary>
            <div className="max-h-80 space-y-1.5 overflow-y-auto border-t border-white/[0.07] p-2.5">
              {matchTimeline.map((event) => {
                const team = event.team === "home" ? home : event.team === "away" ? away : null;
                const eventScore = event.kind === "goal" ? scoreAfterGoal.get(event.key) : undefined;
                const kindLabel = event.kind === "goal" ? "GOL" : event.kind === "card" ? (event.type === "red_card" ? "EXPULSIÓN" : "TARJETA") : event.kind === "substitution" ? "CAMBIO" : event.kind === "highlight" ? "OCASIÓN" : "EVENTO";
                return (
                  <div key={event.key} className="flex items-start gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-2">
                    <span className="w-9 shrink-0 pt-0.5 text-[0.62rem] font-black tabular-nums text-white/55">{event.minute}′</span>
                    <span className={`mt-0.5 shrink-0 rounded px-1.5 py-1 text-[0.46rem] font-black tracking-wider ${event.kind === "goal" ? "bg-emerald-300/10 text-emerald-200" : event.kind === "card" ? event.type === "red_card" ? "bg-rose-400/15 text-rose-200" : "bg-amber-300/10 text-amber-100" : "bg-white/[0.06] text-white/45"}`}>{kindLabel}</span>
                    <p className="min-w-0 flex-1 text-[0.65rem] leading-relaxed text-white/70">{event.description}{event.assistName && event.kind === "goal" ? ` Asistencia: ${event.assistName}.` : ""}</p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {team && <TeamLogo teamName={team.name} leagueName={team.leagueName} size={17} />}
                      {eventScore && <span className="text-[0.62rem] font-black tabular-nums text-white">{eventScore}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </section>

      <div className="match-final-lower-grid grid gap-3 border-t px-3 py-3 sm:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] sm:px-5 sm:py-4">
        <section className="match-final-goals-card min-w-0 rounded-xl p-3 sm:p-4" aria-label="Goleadores del encuentro">
          <div className="match-final-card-heading mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="match-final-section-icon"><Flag className="h-3.5 w-3.5" /></span>
              <div>
                <h3>GOLEADORES</h3>
                <p>Acciones que cambiaron el marcador</p>
              </div>
            </div>
            <span className="match-final-count">{validGoals.length}</span>
          </div>
          {validGoals.length ? (
            <div className="match-final-goal-list space-y-1.5">
              {validGoals.map((event, index) => {
                const isAway = event.team === "away";
                const side = isAway ? away : home;
                const name = event.scorerName || event.playerName;
                return (
                  <div key={`${event.minute}-${event.scorerId || name}-${index}`} className="match-final-goal flex min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2" style={{ ["--team-accent" as string]: isAway ? awayColor : homeColor } as CSSProperties}>
                    <span className="match-final-goal-minute">{event.minute}′</span>
                    <span className="match-final-ball"><CircleDot className="h-3.5 w-3.5" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold">{name}{event.type === "own_goal" ? " · Propia puerta" : ""}</div>
                      {event.assistName && <div className="mt-0.5 truncate text-[0.58rem] text-white/45">Asistencia: {event.assistName}</div>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <TeamLogo teamName={side.name} leagueName={side.leagueName} size={18} />
                      <span className="match-final-goal-team">{side.short}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="match-final-goals-empty flex items-center gap-3 rounded-xl p-3.5">
              <div className="match-final-empty-score">0:0</div>
              <div className="min-w-0">
                <div className="text-xs font-extrabold">Encuentro sin goles</div>
                <p className="mt-0.5 text-[0.62rem] text-white/50">No hubo goles durante el juego.</p>
              </div>
            </div>
          )}
        </section>

        <section className="match-final-mvp-card min-w-0 rounded-xl p-3 sm:p-4" aria-label="Jugador del partido">
          <div className="match-final-card-heading mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="match-final-mvp-icon"><Crown className="h-3.5 w-3.5" /></span>
              <div>
                <h3>JUGADOR DEL PARTIDO</h3>
                <p>La actuación más destacada</p>
              </div>
            </div>
            <span className="match-final-mvp-badge">MVP</span>
          </div>
          {mvp?.playerName ? (
            <div className="match-final-mvp-feature flex items-center gap-3 rounded-xl p-3" style={{ ["--team-accent" as string]: mvp.team === "away" ? awayColor : homeColor } as CSSProperties}>
              <div className="match-final-mvp-face"><PlayerFace name={mvp.playerName} image={faceUrl(mvp.playerId)} size={64} showRing={false} className="shrink-0" /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-extrabold text-white" title={mvp.playerName}>{mvp.playerName}</div>
                <div className="mt-1 truncate text-[0.62rem] text-white/50">{mvp.team === "away" ? away.name : home.name}</div>
                <div className="mt-2 text-[0.58rem] font-black uppercase tracking-[0.13em] text-emerald-200/80">{Number(mvp.rating) >= 8.5 ? "Actuación excepcional" : Number(mvp.rating) >= 7.5 ? "Partido sobresaliente" : "Mejor valoración"}</div>
              </div>
              <div className="match-final-rating-wrap">
                <span>NOTA</span>
                <strong>{Number.isFinite(Number(mvp.rating)) ? Number(mvp.rating).toFixed(1) : "—"}</strong>
              </div>
            </div>
          ) : (
            <div className="match-final-mvp-empty rounded-xl p-3.5 text-xs text-white/55">
              La valoración individual del encuentro no está disponible. Consulta las notas completas en el informe del partido.
            </div>
          )}
        </section>
      </div>
        </>
      )}
    </motion.section>
  );
}
