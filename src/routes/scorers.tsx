import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ALL_LEAGUES, loadSave, type SaveGame } from "@/lib/store";
import { LEAGUES, LEAGUES_BY_COUNTRY, LeagueId, teamById } from "@/data/teams";
import { TeamLogo } from "@/components/TeamLogo";
import { LeagueLogo } from "@/components/LeagueLogo";
import { CountryFlag } from "@/components/CountryFlag";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlayersLoading, usePlayersReady } from "@/components/PlayersLoading";
import {
  selectTopScorers,
  selectTopAssisters,
  selectTopYellowCards,
  selectTopRedCards,
} from "@/store/playersStore";

function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

const PRIORITY_COUNTRIES = ["España", "Inglaterra", "Italia", "Alemania", "Francia"];

type Tab = "scorers" | "assisters" | "yellows" | "reds";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "scorers",   label: "Goleadores",  icon: "⚽" },
  { id: "assisters", label: "Asistentes",  icon: "🎯" },
  { id: "yellows",   label: "Amarillas",   icon: "🟨" },
  { id: "reds",      label: "Rojas",       icon: "🟥" },
];

export const Route = createFileRoute("/scorers")({ component: ScorersPage });

function ScorersPage() {
  const navigate = useNavigate();
  const { loading, ready } = usePlayersReady();
  const [save, setSave] = useState<SaveGame | null>(null);
  const [tab, setTab] = useState<Tab>("scorers");
  const [competition, setCompetition] = useState<"all" | "league" | "cup">("all");
  const [league, setLeague] = useState<LeagueId | "all">("all");
  const [cupCountry, setCupCountry] = useState<string>("all");

  const isCardTab = tab === "yellows" || tab === "reds";

  useEffect(() => {
    const s = loadSave();
    if (!s) { navigate({ to: "/" }); return; }
    setSave(s);
  }, [navigate]);

  useEffect(() => {
    if (isCardTab) {
      setCompetition("all");
      setCupCountry("all");
    }
  }, [tab, isCardTab]);

  const allCountries = useMemo(() => {
    const all = Object.keys(LEAGUES_BY_COUNTRY);
    return [
      ...PRIORITY_COUNTRIES.filter(c => all.includes(c)),
      ...all.filter(c => !PRIORITY_COUNTRIES.includes(c)).sort(),
    ];
  }, []);

  const leagueArg = competition === "league" && league !== "all" ? (league as LeagueId) : undefined;
  const cupCountryArg = competition === "cup" && cupCountry !== "all" ? cupCountry : undefined;

  const scorers   = useMemo(() => save && ready ? selectTopScorers(leagueArg, 30, competition, cupCountryArg) : [], [save, ready, competition, league, cupCountry]);
  const assisters = useMemo(() => save && ready ? selectTopAssisters(leagueArg, 30, competition, cupCountryArg) : [], [save, ready, competition, league, cupCountry]);
  const yellows   = useMemo(() => save && ready ? selectTopYellowCards(league !== "all" ? (league as LeagueId) : undefined, 30) : [], [save, ready, league]);
  const reds      = useMemo(() => save && ready ? selectTopRedCards(league !== "all" ? (league as LeagueId) : undefined, 30) : [], [save, ready, league]);

  const currentTab = TABS.find(t => t.id === tab)!;

  if (!save) return null;
  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <PlayersLoading message="Cargando datos de jugadores…" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <h1 className="text-2xl font-black">
        {currentTab.icon} Rankings — {currentTab.label}
      </h1>

      {/* Tab bar */}
      <div className="flex rounded-lg overflow-hidden border border-border text-sm font-semibold w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 transition ${tab === t.id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
          >
            <span className="mr-1.5">{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-3">
        {/* Competition filter — only for scorers/assisters */}
        {!isCardTab && (
          <Select value={competition} onValueChange={(v) => { setCompetition(v as "all"|"league"|"cup"); setLeague("all"); setCupCountry("all"); }}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Competición" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">🌍 Todas las competiciones</SelectItem>
              <SelectItem value="league">🏆 Liga</SelectItem>
              <SelectItem value="cup">🥇 Copa nacional</SelectItem>
            </SelectContent>
          </Select>
        )}

        {/* League filter — for league competition or card tabs */}
        {(competition === "league" || isCardTab) && (
          <Select value={league} onValueChange={(v) => setLeague(v as LeagueId | "all")}>
            <SelectTrigger className="w-[210px]">
              <SelectValue placeholder="Todas las ligas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">🌍 Todas las ligas</SelectItem>
              {ALL_LEAGUES.map((lg) => (
                <SelectItem key={lg} value={lg}>
                  <div className="flex items-center gap-2">
                    <LeagueLogo league={LEAGUES[lg].name} size="sm" />
                    <span>{LEAGUES[lg].name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Country filter — only for cup competition */}
        {competition === "cup" && !isCardTab && (
          <Select value={cupCountry} onValueChange={setCupCountry}>
            <SelectTrigger className="w-[210px]">
              <SelectValue placeholder="Todos los países" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">🌍 Todos los países</SelectItem>
              {allCountries.map((country) => (
                <SelectItem key={country} value={country}>
                  <div className="flex items-center gap-2">
                    <CountryFlag country={country} size="sm" />
                    <span>{country}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Lists */}
      {tab === "scorers" && <ScorerList players={scorers} emptyMsg="Aún no hay goles registrados." />}
      {tab === "assisters" && <AssisterList players={assisters} emptyMsg="Aún no hay asistencias registradas." />}
      {tab === "yellows" && <CardList players={yellows} mainKey="yellowCards" secondaryKey="redCards" mainLabel="Amarillas" secondaryLabel="Rojas" color="text-yellow-400" emptyMsg="Aún no hay tarjetas amarillas registradas." />}
      {tab === "reds" && <CardList players={reds} mainKey="redCards" secondaryKey="yellowCards" mainLabel="Rojas" secondaryLabel="Amarillas" color="text-red-500" emptyMsg="Aún no hay tarjetas rojas registradas." />}
    </div>
  );
}

function ScorerList({ players, emptyMsg }: { players: any[]; emptyMsg: string }) {
  if (players.length === 0) return <p className="text-sm text-muted-foreground text-center py-12">{emptyMsg}</p>;
  return (
    <div className="panel divide-y divide-border/40">
      {players.map((p, i) => {
        const team = teamById(p.teamId);
        return (
          <div key={p.id} className="grid grid-cols-[28px_auto_1fr_auto_auto] items-center gap-3 px-4 py-3">
            <span className={`text-sm font-black ${i < 3 ? "text-primary" : "text-muted-foreground"}`}>{i + 1}</span>
            <TeamLogo teamName={team.name} leagueName={getLeagueName(team.league)} size={28} />
            <div className="min-w-0">
              <div className="font-bold truncate">{p.name}</div>
              <div className="text-xs text-muted-foreground">{team.name} · {p.assists} asist.</div>
            </div>
            <div className="text-xs text-muted-foreground">{p.appearances} PJ</div>
            <div className="text-2xl font-black scoreline text-primary w-10 text-right">{p.goals}</div>
          </div>
        );
      })}
    </div>
  );
}

function AssisterList({ players, emptyMsg }: { players: any[]; emptyMsg: string }) {
  if (players.length === 0) return <p className="text-sm text-muted-foreground text-center py-12">{emptyMsg}</p>;
  return (
    <div className="panel divide-y divide-border/40">
      {players.map((p, i) => {
        const team = teamById(p.teamId);
        return (
          <div key={p.id} className="grid grid-cols-[28px_auto_1fr_auto_auto] items-center gap-3 px-4 py-3">
            <span className={`text-sm font-black ${i < 3 ? "text-primary" : "text-muted-foreground"}`}>{i + 1}</span>
            <TeamLogo teamName={team.name} leagueName={getLeagueName(team.league)} size={28} />
            <div className="min-w-0">
              <div className="font-bold truncate">{p.name}</div>
              <div className="text-xs text-muted-foreground">{team.name} · {p.goals} goles</div>
            </div>
            <div className="text-xs text-muted-foreground">{p.appearances} PJ</div>
            <div className="text-2xl font-black scoreline text-primary w-10 text-right">{p.assists}</div>
          </div>
        );
      })}
    </div>
  );
}

function CardList({ players, mainKey, secondaryKey, mainLabel, secondaryLabel, color, emptyMsg }: {
  players: any[];
  mainKey: string;
  secondaryKey: string;
  mainLabel: string;
  secondaryLabel: string;
  color: string;
  emptyMsg: string;
}) {
  if (players.length === 0) return <p className="text-sm text-muted-foreground text-center py-12">{emptyMsg}</p>;
  return (
    <div className="panel divide-y divide-border/40">
      {players.map((p, i) => {
        const team = teamById(p.teamId);
        return (
          <div key={p.id} className="grid grid-cols-[28px_auto_1fr_auto_auto] items-center gap-3 px-4 py-3">
            <span className={`text-sm font-black ${i < 3 ? "text-primary" : "text-muted-foreground"}`}>{i + 1}</span>
            <TeamLogo teamName={team.name} leagueName={getLeagueName(team.league)} size={28} />
            <div className="min-w-0">
              <div className="font-bold truncate">{p.name}</div>
              <div className="text-xs text-muted-foreground">{team.name} · {p[secondaryKey]} {secondaryLabel}</div>
            </div>
            <div className="text-xs text-muted-foreground">{p.appearances} PJ</div>
            <div className={`text-2xl font-black scoreline ${color} w-10 text-right`}>{p[mainKey]}</div>
          </div>
        );
      })}
    </div>
  );
}
