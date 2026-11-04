import { getMatchMinuteElapsedValue, getMatchMinuteSortValue } from "@/lib/matchTime";

export type MatchChronicleKind = "moment" | "card" | "goal" | "highlight" | "sub";

export type MatchChronicleItem = {
  kind: MatchChronicleKind;
  minute: number;
  data: any;
};

const CHRONICLE_MOMENT_TYPES = new Set([
  "save",
  "woodwork",
  "big_chance",
  "penalty_missed",
  "penalty_save",
  "penalty_goal",
  "injury",
  "injury_substitution",
  "forced_sub",
  "var",
  "var_disallowed",
  "red_card",
]);

const CHRONICLE_HIGHLIGHT_TYPES = new Set([
  "woodwork",
  "big_chance",
  "penalty_missed",
  "var_disallowed",
  "injury",
  "save",
]);

const MOMENT_HIGHLIGHT_TYPES = new Set([
  "save",
  "injury",
  "injury_substitution",
  "var",
  "var_disallowed",
  "penalty_missed",
  "penalty_save",
  "penalty_goal",
]);

/**
 * Build the exact event sequence used by the live match chronicle.
 * The same function is used for saved fixtures so played and simulated matches
 * share the same filtering, duplicate handling and chronological ordering.
 */
export function buildMatchChronicleItems(input: {
  events?: any[];
  cards?: any[];
  highlights?: any[];
  substitutions?: any[];
  moments?: any[];
}): MatchChronicleItem[] {
  const events = Array.isArray(input.events) ? input.events : [];
  const cards = Array.isArray(input.cards) ? input.cards : [];
  const highlights = Array.isArray(input.highlights) ? input.highlights : [];
  const substitutions = Array.isArray(input.substitutions) ? input.substitutions : [];
  const moments = (Array.isArray(input.moments) ? input.moments : []).filter((moment) =>
    CHRONICLE_MOMENT_TYPES.has(String(moment?.type ?? "")),
  );

  const liveMomentAlreadyShows = (highlight: any) =>
    moments.some(
      (moment: any) =>
        getMatchMinuteElapsedValue(moment.minute, moment) === getMatchMinuteElapsedValue(highlight.minute, highlight) &&
        (moment.playerId ? String(moment.playerId) === String(highlight.playerId ?? "") : true) &&
        (moment.teamSide ? moment.teamSide === highlight.team : true) &&
        MOMENT_HIGHLIGHT_TYPES.has(String(moment.type ?? "")),
    );

  const items: MatchChronicleItem[] = [
    ...moments.map((moment) => ({
      kind: "moment" as const,
      minute: getMatchMinuteElapsedValue(moment.minute, moment) ?? 0,
      data: moment,
    })),
    ...cards.map((card) => ({
      kind: "card" as const,
      minute: getMatchMinuteElapsedValue(card.minute, card) ?? 0,
      data: card,
    })),
    ...events.map((event) => ({
      kind: "goal" as const,
      minute: getMatchMinuteElapsedValue(event.minute, event) ?? 0,
      data: event,
    })),
    ...highlights
      .filter((highlight) => CHRONICLE_HIGHLIGHT_TYPES.has(String(highlight?.type ?? "")))
      .filter((highlight) => !liveMomentAlreadyShows(highlight))
      .map((highlight) => ({
        kind: "highlight" as const,
        minute: getMatchMinuteElapsedValue(highlight.minute, highlight) ?? 0,
        data: highlight,
      })),
    ...substitutions.map((substitution) => ({
      kind: "sub" as const,
      minute: getMatchMinuteElapsedValue(substitution.minute, substitution) ?? 0,
      data: substitution,
    })),
  ];

  const rank: Record<MatchChronicleKind, number> = {
    moment: 10,
    card: 20,
    goal: 30,
    highlight: 40,
    sub: 90,
  };

  return items.sort((a, b) => {
    const minuteDiff = getMatchMinuteSortValue(b.minute, b.data) - getMatchMinuteSortValue(a.minute, a.data);
    return minuteDiff !== 0 ? minuteDiff : rank[a.kind] - rank[b.kind];
  });
}
