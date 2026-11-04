import { MatchMomentumChart } from "@/components/match/MatchMomentumChart";
import type { MomentumHistorySample, MomentumMinuteStat } from "@/lib/matchMomentumTimeline";

/**
 * The live timeline is intentionally reduced to the momentum chart only.
 * Goals, cards, substitutions and incidents continue to appear in the
 * commentary/chronicle, not as a second horizontal event timeline here.
 */
export function MatchTimeline({
  minute,
  homeLabel,
  awayLabel,
  homeName,
  awayName,
  events,
  highlights,
  moments = [],
  matchPeriod,
  stoppagePeriod,
  stoppageElapsed,
  momentumHistory = [],
  userSide = "home",
  minuteStats = [],
  homeColor = "#2D8CFF",
  awayColor = "#F43F75",
}: {
  minute: number;
  homeLabel: string;
  awayLabel: string;
  homeName?: string;
  awayName?: string;
  events: any[];
  cards?: any[];
  highlights: any[];
  substitutions?: any[];
  moments?: any[];
  clockLabel?: string | null;
  matchPeriod?: string | null;
  stoppagePeriod?: string | null;
  stoppageElapsed?: number | string | null;
  momentumHistory?: MomentumHistorySample[];
  userSide?: "home" | "away";
  minuteStats?: MomentumMinuteStat[];
  homeColor?: string;
  awayColor?: string;
}) {
  return (
    <MatchMomentumChart
      minute={minute}
      homeLabel={homeLabel}
      awayLabel={awayLabel}
      homeName={homeName}
      awayName={awayName}
      events={events}
      highlights={highlights}
      moments={moments}
      matchPeriod={matchPeriod}
      stoppagePeriod={stoppagePeriod}
      stoppageElapsed={stoppageElapsed}
      momentumHistory={momentumHistory}
      userSide={userSide}
      minuteStats={minuteStats}
      homeColor={homeColor}
      awayColor={awayColor}
    />
  );
}
