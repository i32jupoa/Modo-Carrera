import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { loadSave, SaveGame } from "@/lib/store";
import { LEAGUES, LeagueId, teamById, LEAGUES_BY_COUNTRY } from "@/data/teams";
import { TeamBadge } from "@/components/TeamBadge";
import { TeamLogo } from "@/components/TeamLogo";
import { CountryFlag } from "@/components/CountryFlag";
import { LeagueLogo } from "@/components/LeagueLogo";
import { getCupStructureForCountry } from "@/lib/cups";

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
    return `${totalHome} (${penalties.homeGoals}) - (${penalties.awayGoals}) ${totalAway}`;
  } else if (extraTime) {
    // Only show (prórroga) if there's a winner after extra time (not tied)
    const totalHome = homeGoals + extraTime.homeGoals;
    const totalAway = awayGoals + extraTime.awayGoals;
    if (totalHome !== totalAway) {
      // Format: España 1 - 0 Países Bajos (prórroga)
      return `${totalHome} - ${totalAway} (prórroga)`;
    }
    // If still tied after extra time, don't show (prórroga) since it went to penalties
    return `${totalHome} - ${totalAway}`;
  }
  
  return `${homeGoals} - ${awayGoals}`;
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

import { Fixture } from "@/lib/season";

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

function CountryDropdown({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
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

  const selectedOption = options.find(o => o === value);

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
          {options.map((c) => (
            <button
              key={c}
              onClick={() => { onChange(c); setIsOpen(false); }}
              className="w-full px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-secondary/40 transition text-left"
            >
              <CountryFlag country={c} />
              <span>{c}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CupPage() {
  const navigate = useNavigate();
  const [save, setSave] = useState<SaveGame | null>(null);
  const [country, setCountry] = useState<string>("");

  useEffect(() => {
    const s = loadSave();
    if (!s) { navigate({ to: "/" }); return; }
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
    ...priorityCountries.filter(c => allCountries.includes(c)),
    ...allCountries.filter(c => !priorityCountries.includes(c)).sort()
  ];
  
  // Get the primary league for the selected country
  const countryLeagues = LEAGUES_BY_COUNTRY[country] || [];
  const primaryLeague = countryLeagues[0]?.id as LeagueId;
  
  // Get the dynamic cup structure for the selected country (use saved structure if available)
  const cupStructure = (save.cupFixtures as any)[`${primaryLeague}_structure`] || getCupStructureForCountry(country);
  const cupSchedule = cupStructure.schedule;
  
  // Get fixtures for the selected country's cup
  const fixtures = primaryLeague ? save.cupFixtures[primaryLeague] : [];
  const champion = primaryLeague ? save.cupChampion[primaryLeague] : null;
  const myId = save.myTeamId;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black">🛡 Copa nacional</h1>
          <p className="text-xs text-muted-foreground">Eliminatoria a partido único · Todos los equipos del país</p>
        </div>
        <CountryDropdown value={country} onChange={setCountry} options={uniqueCountries} />
      </div>

      {primaryLeague && (
        <div className="flex items-center gap-2 mb-4">
          <LeagueLogo league={primaryLeague} size="md" />
          <span className="text-sm font-semibold text-muted-foreground">Copa Nacional · {country}</span>
        </div>
      )}

      {champion && (
        <div className="panel-glow p-6 mb-6 text-center">
          <div className="text-4xl mb-2">🏆</div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Campeón</div>
          <div className="text-2xl font-black text-primary">{teamById(champion).name}</div>
        </div>
      )}

      <div className="space-y-6">
        {cupSchedule.map((step) => {
          const rf = fixtures.filter((f) => f.round === step.round);
          if (rf.length === 0) return (
            <RoundBlock key={step.round} label={ROUND_LABEL[step.round] || step.round} matchday={step.matchday}>
              <p className="text-xs text-muted-foreground px-4 py-3">Pendiente de sortear</p>
            </RoundBlock>
          );
          return (
            <RoundBlock key={step.round} label={ROUND_LABEL[step.round] || step.round} matchday={step.matchday}>
              <div className="divide-y divide-border/40">
                {rf.map((f) => <KOFixtureRow key={f.id} f={f} myId={myId} />)}
              </div>
            </RoundBlock>
          );
        })}
      </div>
    </div>
  );
}

function RoundBlock({ label, matchday, children }: { label: string; matchday: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold uppercase tracking-wider">{label}</h2>
        <span className="text-xs text-muted-foreground">Jornada {matchday}</span>
      </div>
      <div className="panel">{children}</div>
    </div>
  );
}

export function KOFixtureRow({ f, myId }: { f: Fixture; myId: string }) {
  const home = teamById(f.homeId);
  const away = teamById(f.awayId);
  const isMine = f.homeId === myId || f.awayId === myId;
  const winner = getCupMatchWinner(f.result);
  return (
    <div className={`grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-3 ${isMine ? "bg-primary/5" : ""}`}>
      <div className="flex items-center gap-2 justify-end min-w-0">
        <span className={`truncate text-sm ${winner === "home" ? "font-bold text-primary" : winner === "away" ? "text-muted-foreground line-through" : "font-semibold"}`}>
          {home.name}
        </span>
        <TeamLogo teamName={home.name} leagueName={getLeagueName(home.league)} size={26} />
      </div>
      <div className="scoreline font-bold text-base text-center min-w-[70px]">
        {formatCupResult(f.result)}
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <TeamLogo teamName={away.name} leagueName={getLeagueName(away.league)} size={26} />
        <span className={`truncate text-sm ${winner === "away" ? "font-bold text-primary" : winner === "home" ? "text-muted-foreground line-through" : "font-semibold"}`}>
          {away.name}
        </span>
      </div>
    </div>
  );
}
