import type { Fixture } from "@/lib/season";
import { LEAGUES, teamById, type LeagueId } from "@/data/teams";
import { TeamLogo } from "@/components/TeamLogo";
import { TeamBadge } from "@/components/TeamBadge";

export type EuropeanCompetitionKey = "ucl" | "uel" | "uecl";

/**
 * Fila unificada para mostrar partidos europeos. Se usa tanto en la fase de liga
 * como en las eliminatorias, para mantener exactamente el mismo formato de marcador.
 */
export function EuropeanFixtureRow({
  f,
  myTeamId,
  fixtures,
  competition = "ucl",
  onClick,
}: {
  f: Fixture;
  myTeamId: string;
  fixtures: Fixture[];
  competition?: EuropeanCompetitionKey;
  onClick?: (fixture: Fixture) => void;
}) {
  const isUser = f.homeId === myTeamId || f.awayId === myTeamId;
  const played = !!f.result;
  const roundPrefix = f.round?.replace(/-Leg[12]$/, "");
  const otherLeg = roundPrefix && f.round?.includes("-Leg")
    ? fixtures.find((candidate) => {
        if (candidate.id === f.id || !candidate.result || !candidate.round?.startsWith(`${roundPrefix}-Leg`)) return false;
        return [candidate.homeId, candidate.awayId].sort().join("|") === [f.homeId, f.awayId].sort().join("|");
      })
    : undefined;
  const goalsForTeam = (fixture: Fixture, teamId: string) => {
    const result = fixture.result;
    if (!result) return 0;
    const regular = fixture.homeId === teamId ? result.homeGoals : result.awayGoals;
    const extra = fixture.homeId === teamId ? result.extraTime?.homeGoals : result.extraTime?.awayGoals;
    return Number(regular ?? 0) + Number(extra ?? 0);
  };
  const aggregate = f.result && otherLeg?.result
    ? {
        home: goalsForTeam(f, f.homeId) + goalsForTeam(otherLeg, f.homeId),
        away: goalsForTeam(f, f.awayId) + goalsForTeam(otherLeg, f.awayId),
      }
    : null;
  const isSecondLeg = /-Leg2$/.test(f.round ?? "");
  const advancingTeamId = aggregate && isSecondLeg
    ? aggregate.home > aggregate.away
      ? f.homeId
      : aggregate.away > aggregate.home
        ? f.awayId
        : f.result?.penalties
          ? f.result.penalties.homeGoals > f.result.penalties.awayGoals
            ? f.homeId
            : f.awayId
          : undefined
    : undefined;
  const advancementDetail = f.result?.penalties
    ? "por penaltis"
    : f.result?.extraTime
      ? "tras prórroga"
      : "por el global";

  const accent = competition === "uel"
    ? { bg: "bg-orange-950/20", border: "border-orange-400" }
    : competition === "uecl"
      ? { bg: "bg-green-950/20", border: "border-green-400" }
      : { bg: "bg-blue-950/20", border: "border-blue-400" };

  let resultBg = "";
  if (played && isUser) {
    const myGoals = f.homeId === myTeamId
      ? Number(f.result!.homeGoals) + Number(f.result!.extraTime?.homeGoals ?? 0)
      : Number(f.result!.awayGoals) + Number(f.result!.extraTime?.awayGoals ?? 0);
    const theirGoals = f.homeId === myTeamId
      ? Number(f.result!.awayGoals) + Number(f.result!.extraTime?.awayGoals ?? 0)
      : Number(f.result!.homeGoals) + Number(f.result!.extraTime?.homeGoals ?? 0);
    resultBg = myGoals > theirGoals
      ? "bg-green-950/40 border-l-2 border-green-500"
      : myGoals < theirGoals
        ? "bg-red-950/40 border-l-2 border-red-500"
        : "bg-yellow-950/30 border-l-2 border-yellow-500";
  }

  function Logo({ id }: { id: string }) {
    try {
      const team = teamById(id);
      const leagueName = LEAGUES[team.league as LeagueId]?.name ?? team.league;
      return <TeamLogo teamName={team.name} leagueName={leagueName} size={20} />;
    } catch {
      return <TeamBadge teamId={id} size={20} />;
    }
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 hover:bg-muted/30 text-sm ${isUser ? resultBg || `${accent.bg} border-l-2 ${accent.border}` : ""} ${played ? "cursor-pointer" : ""}`}
      onClick={() => played && onClick?.(f)}
      role={played ? "button" : undefined}
      tabIndex={played ? 0 : undefined}
      onKeyDown={played ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.(f);
        }
      } : undefined}
    >
      <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
        <span className={`text-right truncate max-w-[130px] ${f.homeId === myTeamId ? "font-bold text-white" : ""}`}>
          {teamName(f.homeId)}
        </span>
        <Logo id={f.homeId} />
      </div>
      <div className="w-24 text-center shrink-0 py-1">
        {isUser && <div className="mb-1"><span className="rounded-full border border-primary/40 bg-primary/15 px-2 py-0.5 text-[0.55rem] font-black uppercase tracking-wider text-primary">Tu partido</span></div>}
        {played ? (
          (() => {
            const homeGoals = Number(f.result!.homeGoals ?? 0);
            const awayGoals = Number(f.result!.awayGoals ?? 0);
            const { extraTime, penalties } = f.result!;
            if (penalties) {
              const totalHome = homeGoals + Number(extraTime?.homeGoals ?? 0);
              const totalAway = awayGoals + Number(extraTime?.awayGoals ?? 0);
              return (
                <span className="font-mono font-bold text-xs whitespace-nowrap">
                  {totalHome} ({penalties.homeGoals}) - ({penalties.awayGoals}) {totalAway}
                </span>
              );
            } else if (extraTime) {
              const totalHome = homeGoals + Number(extraTime.homeGoals ?? 0);
              const totalAway = awayGoals + Number(extraTime.awayGoals ?? 0);
              if (totalHome !== totalAway) {
                return (
                  <div className="flex flex-col items-center">
                    <span className="font-mono font-bold text-xs whitespace-nowrap">{totalHome} - {totalAway}</span>
                    <span className="text-[9px] text-muted-foreground">(prórroga)</span>
                  </div>
                );
              }
              return <span className="font-mono font-bold text-xs whitespace-nowrap">{totalHome} - {totalAway}</span>;
            }
            return <span className="font-mono font-bold text-sm whitespace-nowrap">{homeGoals} – {awayGoals}</span>;
          })()
        ) : (
          <span className="text-muted-foreground text-xs font-medium">vs</span>
        )}
        {aggregate && (
          <div className="mt-1 text-[0.58rem] font-bold text-primary whitespace-nowrap" title="Marcador global de la eliminatoria">
            <div>Global {aggregate.home}–{aggregate.away}</div>
            {advancingTeamId && <div className="max-w-[150px] truncate text-[0.52rem]" title={`Clasifica ${teamName(advancingTeamId)} ${advancementDetail}`}>Clasifica: {teamName(advancingTeamId)} {advancementDetail}</div>}
          </div>
        )}
      </div>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <Logo id={f.awayId} />
        <span className={`truncate max-w-[130px] ${f.awayId === myTeamId ? "font-bold text-white" : ""}`}>
          {teamName(f.awayId)}
        </span>
      </div>
    </div>
  );
}

function teamName(id: string): string {
  try {
    return teamById(id)?.name ?? id;
  } catch {
    return id;
  }
}
