import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadSave, SaveGame } from "@/lib/store";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import { TeamBadge } from "@/components/TeamBadge";
import { TeamLogo } from "@/components/TeamLogo";
import { sortUCLTable, UCLTableEntry, UCLBracketSlot, UCL_START } from "@/data/ucl";
import type { Fixture } from "@/lib/season";

export const Route = createFileRoute("/ucl")({ component: UCLPage });

// ── helpers ──────────────────────────────────────────────────────────────────

function teamName(id: string) {
  try { return teamById(id).name; } catch { return id; }
}

function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}

function uclFixtureDate(matchday: number): string {
  const start = new Date(UCL_START + "T00:00:00Z");
  const d = new Date(start.getTime() + matchday * 86400000);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
}

function Result({ f }: { f: Fixture }) {
  if (!f.result) return <span className="text-muted-foreground text-xs">vs</span>;
  const { homeGoals, awayGoals } = f.result;
  return <span className="font-mono font-semibold">{homeGoals} – {awayGoals}</span>;
}

// ── Table view (league phase) ─────────────────────────────────────────────────

function CUT({ label, color }: { label: string; color: string }) {
  return (
    <tr>
      <td colSpan={9} className={`px-3 py-0.5 text-xs font-semibold text-center ${color}`}>
        {label}
      </td>
    </tr>
  );
}

function TableView({ table, userTeamId }: { table: UCLTableEntry[]; userTeamId: string }) {
  const sorted = sortUCLTable(table);

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-muted-foreground uppercase text-xs">
          <tr>
            <th className="px-3 py-2 text-left w-8">#</th>
            <th className="px-3 py-2 text-left">Equipo</th>
            <th className="px-2 py-2 text-center">PJ</th>
            <th className="px-2 py-2 text-center">G</th>
            <th className="px-2 py-2 text-center">E</th>
            <th className="px-2 py-2 text-center">P</th>
            <th className="px-2 py-2 text-center">GD</th>
            <th className="px-2 py-2 text-center">GF</th>
            <th className="px-2 py-2 text-center font-bold text-foreground">Pts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((e, i) => {
            const pos = i + 1;
            const isUser = e.teamId === userTeamId;
            let rowBg = isUser ? "bg-primary/10 " : "hover:bg-muted/40 ";

            // Insert cut lines
            const cutAfter = pos === 8 || pos === 24;
            const rowClass = rowBg + "transition-colors";

            return (
              <>
                <tr key={e.teamId} className={rowClass}>
                  <td className="px-3 py-1.5 text-center">
                    <span className={
                      pos <= 8 ? "text-green-500 font-bold" :
                      pos <= 24 ? "text-yellow-500 font-semibold" :
                      "text-red-400"
                    }>{pos}</span>
                  </td>
                  <td className="px-3 py-1.5 flex items-center gap-2">
                    <TeamBadge teamId={e.teamId} size={20} />
                    <span className={isUser ? "font-bold" : ""}>{teamName(e.teamId)}</span>
                  </td>
                  <td className="px-2 py-1.5 text-center text-muted-foreground">{e.played}</td>
                  <td className="px-2 py-1.5 text-center">{e.won}</td>
                  <td className="px-2 py-1.5 text-center">{e.drawn}</td>
                  <td className="px-2 py-1.5 text-center">{e.lost}</td>
                  <td className="px-2 py-1.5 text-center">{e.gd > 0 ? `+${e.gd}` : e.gd}</td>
                  <td className="px-2 py-1.5 text-center">{e.gf}</td>
                  <td className="px-2 py-1.5 text-center font-bold">{e.points}</td>
                </tr>
                {pos === 8 && (
                  <tr key="cut8">
                    <td colSpan={9} className="px-3 py-0.5 text-xs text-center bg-green-950/30 text-green-400">
                      ▼ Octavos directos
                    </td>
                  </tr>
                )}
                {pos === 24 && (
                  <tr key="cut24">
                    <td colSpan={9} className="px-3 py-0.5 text-xs text-center bg-red-950/30 text-red-400">
                      ▼ Eliminados
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>

      {/* Legend */}
      <div className="flex gap-4 px-3 py-2 text-xs text-muted-foreground border-t border-border">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-600 inline-block" /> Pasan a Octavos</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-yellow-600 inline-block" /> Play-offs</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-700 inline-block" /> Eliminados</span>
      </div>
    </div>
  );
}

// ── Fixtures list ─────────────────────────────────────────────────────────────

function FixtureRow({ f, myTeamId }: { f: Fixture; myTeamId: string }) {
  const isUser = f.homeId === myTeamId || f.awayId === myTeamId;
  const played = !!f.result;
  let resultBg = "";
  if (played && isUser) {
    const myGoals = f.homeId === myTeamId ? f.result!.homeGoals : f.result!.awayGoals;
    const theirGoals = f.homeId === myTeamId ? f.result!.awayGoals : f.result!.homeGoals;
    resultBg = myGoals > theirGoals ? "bg-green-950/40 border-l-2 border-green-500" :
               myGoals < theirGoals ? "bg-red-950/40 border-l-2 border-red-500" :
               "bg-yellow-950/30 border-l-2 border-yellow-500";
  }

  function Logo({ id }: { id: string }) {
    try {
      const t = teamById(id);
      return <TeamLogo teamName={t.name} leagueName={getLeagueName(t.league)} size={20} />;
    } catch {
      return <TeamBadge teamId={id} size={20} />;
    }
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-2 hover:bg-muted/30 text-sm ${isUser ? resultBg || "bg-blue-950/20 border-l-2 border-blue-400" : ""}`}>
      <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
        <span className={`text-right truncate max-w-[130px] ${f.homeId === myTeamId ? "font-bold text-white" : ""}`}>{teamName(f.homeId)}</span>
        <Logo id={f.homeId} />
      </div>
      <div className="w-14 text-center shrink-0">
        {played
          ? <span className="font-mono font-bold text-sm">{f.result!.homeGoals} – {f.result!.awayGoals}</span>
          : <span className="text-muted-foreground text-xs font-medium">vs</span>
        }
      </div>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <Logo id={f.awayId} />
        <span className={`truncate max-w-[130px] ${f.awayId === myTeamId ? "font-bold text-white" : ""}`}>{teamName(f.awayId)}</span>
      </div>
    </div>
  );
}

// ── Bracket view ──────────────────────────────────────────────────────────────

function BracketTie({
  slot,
  fixtures,
}: {
  slot: UCLBracketSlot;
  fixtures: Fixture[];
}) {
  const leg1 = fixtures.find(f => f.id.includes(slot.id.toLowerCase()) && f.round?.includes("Leg1"));
  const leg2 = fixtures.find(f => f.id.includes(slot.id.toLowerCase()) && f.round?.includes("Leg2"));
  const final = fixtures.find(f => f.id.includes(slot.id.toLowerCase()) && f.round === "Final");

  const home = slot.homeId;
  const away = slot.awayId;

  return (
    <div className="border border-border rounded-lg p-2 min-w-[200px] bg-card text-sm">
      <div className="text-xs text-muted-foreground mb-1 font-semibold">{slot.id}</div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {home ? <><TeamBadge teamId={home} size={16} /><span className="truncate">{teamName(home)}</span></> : <span className="text-muted-foreground italic">TBD</span>}
        </div>
        <div className="flex items-center gap-2">
          {away ? <><TeamBadge teamId={away} size={16} /><span className="truncate">{teamName(away)}</span></> : <span className="text-muted-foreground italic">TBD</span>}
        </div>
      </div>
      {leg1 && (
        <div className="mt-1 text-xs text-muted-foreground">
          Ida: <Result f={leg1} /> · Vta: {leg2 ? <Result f={leg2} /> : "–"}
        </div>
      )}
      {final && (
        <div className="mt-1 text-xs text-muted-foreground">
          Final: <Result f={final} />
        </div>
      )}
    </div>
  );
}

function BracketView({ bracket, fixtures }: { bracket: UCLBracketSlot[]; fixtures: Fixture[] }) {
  const r16 = bracket.filter(s => s.round === "r16");
  const qf  = bracket.filter(s => s.round === "qf");
  const sf  = bracket.filter(s => s.round === "sf");
  const fin = bracket.filter(s => s.round === "final");

  if (bracket.length === 0) {
    return <p className="text-muted-foreground text-sm p-4">El cuadro se generará tras el sorteo de octavos.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-6 min-w-max p-4">
        {/* R16 */}
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Octavos</h3>
          {r16.map(s => <BracketTie key={s.id} slot={s} fixtures={fixtures} />)}
        </div>
        {/* QF */}
        <div className="flex flex-col gap-6 justify-around">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Cuartos</h3>
          {qf.map(s => <BracketTie key={s.id} slot={s} fixtures={fixtures} />)}
        </div>
        {/* SF */}
        <div className="flex flex-col gap-12 justify-around">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Semis</h3>
          {sf.map(s => <BracketTie key={s.id} slot={s} fixtures={fixtures} />)}
        </div>
        {/* Final */}
        <div className="flex flex-col justify-around">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Final</h3>
          {fin.map(s => <BracketTie key={s.id} slot={s} fixtures={fixtures} />)}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = "tabla" | "bracket" | "partidos";

function UCLPage() {
  const [save, setSave] = useState<SaveGame | null>(null);
  const [tab, setTab] = useState<Tab>("tabla");
  const [selectedRound, setSelectedRound] = useState<string | null>(null);

  useEffect(() => {
    setSave(loadSave());
  }, []);

  if (!save) {
    return <div className="p-6 text-muted-foreground">Cargando...</div>;
  }

  const ucl = save.ucl;
  const fixtures = save.uclFixtures ?? [];

  if (!ucl) {
    return (
      <div className="p-6 text-center space-y-2">
        <div className="text-4xl">🏆</div>
        <h2 className="text-xl font-bold">Champions League</h2>
        <p className="text-muted-foreground">La Champions League comenzará el 3 de julio con el sorteo de la fase de liga.</p>
      </div>
    );
  }

  const isKnockoutPhase = ["r16", "qf", "sf", "final", "done"].includes(ucl.phase);

  // Group fixtures by round, sorted by matchday offset
  const leagueFixtures = fixtures.filter(f => f.round?.startsWith("Jornada"));
  const otherFixtures = fixtures.filter(f => !f.round?.startsWith("Jornada"));

  // Sort jornadas by matchday offset
  const jornadas = [...new Map<string, { matchday: number; fixtures: Fixture[] }>(
    leagueFixtures.reduce((acc, f) => {
      const r = f.round ?? "Sin ronda";
      if (!acc.has(r)) acc.set(r, { matchday: f.matchday, fixtures: [] });
      acc.get(r)!.fixtures.push(f);
      return acc;
    }, new Map<string, { matchday: number; fixtures: Fixture[] }>())
  ).entries()].sort((a, b) => a[1].matchday - b[1].matchday);

  const roundNames = jornadas.map(([r]) => r);
  const activeRound = selectedRound ?? roundNames[0] ?? null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-950 to-indigo-950 border-b border-border px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="text-3xl">🏆</div>
          <div>
            <h1 className="text-xl font-bold text-white">UEFA Champions League</h1>
            <p className="text-blue-300 text-sm">
              {ucl.phase === "league" && "Fase de Liga — Sistema Suizo"}
              {ucl.phase === "playoff" && "Play-offs — Previa de Octavos"}
              {ucl.phase === "r16" && "Octavos de Final"}
              {ucl.phase === "qf" && "Cuartos de Final"}
              {ucl.phase === "sf" && "Semifinales"}
              {ucl.phase === "final" && "Gran Final"}
              {ucl.phase === "done" && "Temporada Finalizada"}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 py-2 border-b border-border bg-card">
        {(["tabla", "partidos", ...(isKnockoutPhase ? ["bracket"] : [])] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t === "tabla" ? "Tabla" : t === "partidos" ? "Partidos" : "Cuadro"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4">
        {tab === "tabla" && (
          <TableView table={ucl.table} userTeamId={save.myTeamId} />
        )}

        {tab === "partidos" && (
          <div className="space-y-3">
            {/* Round selector */}
            {roundNames.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {roundNames.map(r => {
                  const info = jornadas.find(([name]) => name === r);
                  const md = info ? info[1].matchday : 0;
                  const hasUser = info ? info[1].fixtures.some(f => f.homeId === save.myTeamId || f.awayId === save.myTeamId) : false;
                  return (
                    <button
                      key={r}
                      onClick={() => setSelectedRound(r)}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors relative ${
                        activeRound === r
                          ? "bg-blue-600 text-white"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {r}
                      <span className="ml-1 text-[0.6rem] opacity-70">{uclFixtureDate(md)}</span>
                      {hasUser && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-400" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Fixtures for selected round */}
            {activeRound && (() => {
              const info = jornadas.find(([r]) => r === activeRound);
              if (!info) return null;
              const [, { matchday, fixtures: fxs }] = info;
              const played = fxs.filter(f => f.result).length;
              return (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="bg-blue-950/60 px-4 py-2.5 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-bold text-blue-200">{activeRound}</span>
                      <span className="ml-2 text-xs text-blue-400">{uclFixtureDate(matchday)}</span>
                    </div>
                    <span className="text-xs text-blue-400">{played}/{fxs.length} jugados</span>
                  </div>
                  <div className="divide-y divide-border">
                    {fxs
                      .sort((a, b) => {
                        const aUser = a.homeId === save.myTeamId || a.awayId === save.myTeamId;
                        const bUser = b.homeId === save.myTeamId || b.awayId === save.myTeamId;
                        return aUser === bUser ? 0 : aUser ? -1 : 1;
                      })
                      .map(f => <FixtureRow key={f.id} f={f} myTeamId={save.myTeamId} />)
                    }
                  </div>
                </div>
              );
            })()}

            {/* Other rounds (playoffs, knockouts) if any */}
            {otherFixtures.length > 0 && tab === "partidos" && (
              <div className="mt-4 space-y-3">
                {[...new Set(otherFixtures.map(f => f.round ?? "Otro"))].map(r => (
                  <div key={r} className="rounded-lg border border-border overflow-hidden">
                    <div className="bg-muted/60 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">{r}</div>
                    <div className="divide-y divide-border">
                      {otherFixtures.filter(f => (f.round ?? "Otro") === r).map(f => (
                        <FixtureRow key={f.id} f={f} myTeamId={save.myTeamId} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {fixtures.length === 0 && (
              <p className="text-muted-foreground text-sm text-center py-8">
                Los partidos aparecerán aquí tras el sorteo de la fase de liga.
              </p>
            )}
          </div>
        )}

        {tab === "bracket" && (
          <BracketView bracket={ucl.bracket} fixtures={fixtures} />
        )}
      </div>
    </div>
  );
}
