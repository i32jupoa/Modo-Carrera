import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { useEffect, useState, useRef } from "react";
import { Trophy } from "lucide-react";

import { loadSave, SaveGame } from "@/lib/store";

import {
  LEAGUES,
  LeagueId,
  teamById,
  LEAGUES_BY_COUNTRY,
  getPrimaryLeagueForCountry,
} from "@/data/teams";

import { TeamBadge } from "@/components/TeamBadge";

import { TeamLogo } from "@/components/TeamLogo";

import { CountryFlag } from "@/components/CountryFlag";

import { LeagueLogo } from "@/components/LeagueLogo";

import { MatchStatsModal } from "@/components/MatchStatsModal";

import { getCupStructureForCountry } from "@/lib/cups";
import { NATIONAL_CUP_START } from "@/lib/calendarRules";
import type { Fixture } from "@/lib/season";

// Helper to get league name from league ID

function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

// Helper to format cup result with extra time or penalties

function formatCupResult(result: any): string {
  if (!result) return "vs";

  const { homeGoals, awayGoals, extraTime, penalties } = result;

  if (penalties) {
    // Format: Argentina 3 (4) - (2) 3 Francia

    // The score shown is the result after 120 minutes (regular + extra time)

    const totalHome = homeGoals + (extraTime?.homeGoals || 0);

    const totalAway = awayGoals + (extraTime?.awayGoals || 0);

    const formatted = `${totalHome} (${penalties.homeGoals}) - (${penalties.awayGoals}) ${totalAway}`;


    return formatted;
  } else if (extraTime) {
    // Only show (prórroga) if there's a winner after extra time (not tied)

    const totalHome = homeGoals + extraTime.homeGoals;

    const totalAway = awayGoals + extraTime.awayGoals;

    if (totalHome !== totalAway) {
      // Format: España 1 - 0 Países Bajos (prórroga)

      const formatted = `${totalHome} - ${totalAway} (prórroga)`;


      return formatted;
    }

    // If still tied after extra time, don't show (prórroga) since it went to penalties

    const formatted = `${totalHome} - ${totalAway}`;


    return formatted;
  }

  const formatted = `${homeGoals} - ${awayGoals}`;


  return formatted;
}

// Helper to determine winner of a cup match (considering extra time and penalties)

function getCupMatchWinner(result: any): "home" | "away" | null {
  if (!result) return null;

  // If penalties exist, they determine the winner

  if (result.penalties) {
    return result.penalties.homeGoals >= result.penalties.awayGoals ? "home" : "away";
  }

  // If extra time exists, use total score (regular + extra time)

  if (result.extraTime) {
    const totalHome = result.homeGoals + result.extraTime.homeGoals;

    const totalAway = result.awayGoals + result.extraTime.awayGoals;

    return totalHome >= totalAway ? "home" : "away";
  }

  // Regular time only

  return result.homeGoals >= result.awayGoals ? "home" : "away";
}

export const Route = createFileRoute("/cup")({ component: CupPage });

const ROUND_LABEL: Record<string, string> = {
  Preliminar: "Fase Preliminar",

  R32: "Treintaidosavos",

  R16: "Dieciseisavos",

  Octavos: "Octavos de Final",

  QF: "Cuartos",

  SF: "Semifinales",

  Final: "Final",
};

function CountryDropdown({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((o) => o === value);

  const countryLeagues = LEAGUES_BY_COUNTRY[value] || [];

  const primaryLeague = countryLeagues[0]?.name || "";

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-secondary border border-border rounded px-3 py-1.5 text-sm flex items-center gap-2 min-w-[150px] justify-between"
      >
        <div className="flex items-center gap-2">
          <CountryFlag country={value} />

          <span>{value}</span>
        </div>

        <span className="text-muted-foreground">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 bg-card border border-border rounded shadow-lg max-h-60 overflow-y-auto z-50">
          {options.map((c) => {
            return (
              <button
                key={c}
                onClick={() => {
                  onChange(c);
                  setIsOpen(false);
                }}
                className="w-full px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-secondary/40 transition text-left"
              >
                <CountryFlag country={c} />

                <span>{c}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CupPage() {
  const navigate = useNavigate();

  const [save, setSave] = useState<SaveGame | null>(null);

  const [country, setCountry] = useState<string>("");

  const [selectedFixture, setSelectedFixture] = useState<Fixture | null>(null);
  const [selectedRound, setSelectedRound] = useState<string | null>(null);

  useEffect(() => {
    setSelectedRound(null);
  }, [country]);

  useEffect(() => {
    const s = loadSave();

    if (!s) {
      navigate({ to: "/" });
      return;
    }

    setSave(s);

    // Set initial country based on user's league

    const userCountry = LEAGUES[s.myLeague]?.country;

    if (userCountry) {
      setCountry(userCountry);
    }
  }, [navigate]);

  if (!save) return null;

  // Get unique countries from all leagues

  const allCountries = Object.keys(LEAGUES_BY_COUNTRY);

  // Define priority countries (Big 5 leagues)

  const priorityCountries = ["Alemania", "España", "Inglaterra", "Italia", "Francia"];

  // Sort countries: priority first, then alphabetical

  const uniqueCountries = [
    ...priorityCountries.filter((c) => allCountries.includes(c)),

    ...allCountries.filter((c) => !priorityCountries.includes(c)).sort(),
  ];

  // Get the primary league for the selected country

  const countryLeagues = LEAGUES_BY_COUNTRY[country] || [];

  const primaryLeague = (getPrimaryLeagueForCountry(country) ?? countryLeagues[0]?.id) as LeagueId;

  // Get the dynamic cup structure for the selected country (use saved structure if available)

  const cupStructure =
    (save.cupFixtures as any)[`${primaryLeague}_structure`] || getCupStructureForCountry(country);

  const cupSchedule = cupStructure.schedule;

  // Get fixtures for the selected country's cup

  const fixtures = primaryLeague ? (save.cupFixtures[primaryLeague] ?? []) : [];

  const champion = primaryLeague ? save.cupChampion[primaryLeague] : null;

  const myId = save.myTeamId;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black">Copa nacional</h1>

          <p className="text-xs text-muted-foreground">
            Eliminatoria a partido único · Todos los equipos del país
          </p>
        </div>

        <CountryDropdown value={country} onChange={setCountry} options={uniqueCountries} />
      </div>

      {primaryLeague && (
        <div className="flex items-center gap-2 mb-4">
          <LeagueLogo league={primaryLeague} size="md" />

          <span className="text-sm font-semibold text-muted-foreground">
            Copa Nacional · {country}
          </span>
        </div>
      )}

      {champion && (
        <div className="panel-glow p-6 mb-6 text-center">
          <Trophy className="h-10 w-10 mx-auto mb-2 text-primary/90" />

          <div className="text-xs uppercase tracking-wider text-muted-foreground">Campeón</div>

          <div className="text-2xl font-black text-primary">{teamById(champion).name}</div>
        </div>
      )}

      {(() => {
        const steps = Array.isArray(cupSchedule) ? cupSchedule : [];
        const firstUnfinished = steps.find((step: any) =>
          fixtures.some((fixture) => fixture.round === step.round && !fixture.result),
        );
        const firstNotDrawn = steps.find((step: any) =>
          !fixtures.some((fixture) => fixture.round === step.round),
        );
        const defaultRound = firstUnfinished?.round ?? firstNotDrawn?.round ?? steps[steps.length - 1]?.round;
        const activeRound = selectedRound && steps.some((step: any) => step.round === selectedRound)
          ? selectedRound
          : defaultRound;
        const activeIndex = Math.max(0, steps.findIndex((step: any) => step.round === activeRound));
        const step = steps[activeIndex];
        if (!step) return <p className="text-sm text-muted-foreground">No hay rondas configuradas para esta copa.</p>;
        const rf = fixtures
          .filter((fixture) => fixture.round === step.round)
          .sort((a, b) => {
            const aMine = a.homeId === myId || a.awayId === myId;
            const bMine = b.homeId === myId || b.awayId === myId;
            return aMine === bMine ? 0 : aMine ? -1 : 1;
          });
        const dateLabel = rf.find((fixture) => !!fixture.date)?.date ||
          save.pendingBackgroundSims?.find(
            (pending) => pending.isCup && pending.league === primaryLeague && pending.matchday === step.matchday,
          )?.date;
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-card/70 p-2">
              <button type="button" onClick={() => setSelectedRound(steps[activeIndex - 1]?.round ?? null)} disabled={activeIndex <= 0} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-bold transition hover:border-primary/50 disabled:opacity-30" aria-label="Ronda anterior">‹ <span className="hidden sm:inline">Anterior</span></button>
              <div className="min-w-0 text-center">
                <div className="text-[0.62rem] uppercase tracking-wider text-muted-foreground">Ronda activa · {activeIndex + 1}/{steps.length}</div>
                <div className="truncate text-base font-black">{ROUND_LABEL[step.round] || step.round}</div>
              </div>
              <button type="button" onClick={() => setSelectedRound(steps[activeIndex + 1]?.round ?? null)} disabled={activeIndex >= steps.length - 1} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-bold transition hover:border-primary/50 disabled:opacity-30" aria-label="Ronda siguiente"><span className="hidden sm:inline">Siguiente</span> ›</button>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {steps.map((round: any, index: number) => {
                const roundFixtures = fixtures.filter((fixture) => fixture.round === round.round);
                const isActive = round.round === step.round;
                const isDone = roundFixtures.length > 0 && roundFixtures.every((fixture) => !!fixture.result);
                return <button key={round.round} type="button" onClick={() => setSelectedRound(round.round)} aria-current={isActive ? "step" : undefined} className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition ${isActive ? "border-primary bg-primary/15 text-primary" : "border-border/60 bg-card text-muted-foreground hover:border-primary/40"}`}>
                  {ROUND_LABEL[round.round] || round.round}{isDone ? " ✓" : ""}
                </button>;
              })}
            </div>
            <RoundBlock
              label={ROUND_LABEL[step.round] || step.round}
              matchday={step.matchday}
              dateLabel={dateLabel}
            >
              {rf.length === 0 ? (
                <p className="px-4 py-4 text-xs text-muted-foreground">Pendiente de sortear.</p>
              ) : (
                <div className="divide-y divide-border/40">
                  {rf.map((fixture) => <KOFixtureRow key={fixture.id} f={fixture} myId={myId} onClick={setSelectedFixture} />)}
                </div>
              )}
            </RoundBlock>
          </div>
        );
      })()}


      <MatchStatsModal fixture={selectedFixture} onClose={() => setSelectedFixture(null)} />
    </div>
  );
}

function formatCupMatchDate(matchday: number): string {
  const start = new Date(`${NATIONAL_CUP_START}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + matchday);

  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(start);
}

function formatCupDateLabel(dateIso: string | undefined, fallbackMatchday: number): string {
  if (!dateIso) return formatCupMatchDate(fallbackMatchday);
  const date = new Date(`${String(dateIso).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return formatCupMatchDate(fallbackMatchday);
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function RoundBlock({
  label,
  matchday,
  dateLabel,
  children,
}: {
  label: string;
  matchday: number;
  dateLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold uppercase tracking-wider">{label}</h2>

        <span className="text-xs text-muted-foreground">{formatCupDateLabel(dateLabel, matchday)}</span>
      </div>

      <div className="panel">{children}</div>
    </div>
  );
}

export function KOFixtureRow({
  f,
  myId,
  onClick,
}: {
  f: Fixture;
  myId: string;
  onClick?: (fixture: Fixture) => void;
}) {
  const home = teamById(f.homeId);

  const away = teamById(f.awayId);

  const isMine = f.homeId === myId || f.awayId === myId;

  const winner = getCupMatchWinner(f.result);

  return (
    <div
      className={`grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-3 ${isMine ? "bg-primary/10 border-l-4 border-primary ring-1 ring-inset ring-primary/20" : ""} ${f.result ? "cursor-pointer hover:bg-accent/20 transition" : ""}`}
      onClick={() => f.result && onClick?.(f)}
    >
      <div className="flex items-center gap-2 justify-end min-w-0">
        <span
          className={`truncate text-sm ${winner === "home" ? "font-bold text-primary" : winner === "away" ? "text-muted-foreground line-through" : "font-semibold"}`}
        >
          {home.name}
        </span>

        <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={26} />
      </div>

      <div className="flex min-w-[70px] flex-col items-center text-center">
        {isMine && <span className="mb-1 rounded-full border border-primary/40 bg-primary/15 px-2 py-0.5 text-[0.55rem] font-black uppercase tracking-wider text-primary">Tu partido</span>}
        <span className="scoreline text-base font-bold">{formatCupResult(f.result)}</span>
      </div>

      <div className="flex items-center gap-2 min-w-0">
        <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={26} />

        <span
          className={`truncate text-sm ${winner === "away" ? "font-bold text-primary" : winner === "home" ? "text-muted-foreground line-through" : "font-semibold"}`}
        >
          {away.name}
        </span>
      </div>
    </div>
  );
}
