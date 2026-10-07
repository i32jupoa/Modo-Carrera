/**
 * Dominio de noticias de la carrera.
 *
 * Las noticias nunca almacenan texto periodístico: guardamos únicamente el
 * hecho estructurado y la UI recompone el titular/cuerpo de forma
 * determinista. Así se puede cambiar el estilo sin hacer crecer el guardado.
 */

export type NewsCategory = "club" | "liga" | "europa" | "mercado" | "jugadores";

export type NewsEventType =
  | "match"
  | "player_achievement"
  | "standings_change"
  | "transfer"
  | "injury"
  | "suspension"
  | "competition_result";

export interface NewsEventEntities {
  teamIds?: string[];
  playerIds?: string[];
  competitionId?: string;
  leagueId?: string;
}

export interface NewsEventData {
  homeId?: string;
  awayId?: string;
  homeName?: string;
  awayName?: string;
  homeGoals?: number;
  awayGoals?: number;
  result?: string;
  goalMinutes?: number[];
  scorerNames?: string[];
  decisiveMinute?: number;
  matchday?: number;
  round?: string;
  competition?: string;
  isComeback?: boolean;
  isBigWin?: boolean;
  totalGoals?: number;
  cleanSheet?: boolean;
  cleanSheetTeamId?: string;
  teamStrengthGap?: number;
  surprise?: boolean;
  teamId?: string;
  teamName?: string;
  previousPosition?: number;
  newPosition?: number;
  previousLeaderId?: string;
  previousLeaderName?: string;
  newLeaderId?: string;
  newLeaderName?: string;
  leaderGap?: number;
  runnerUpGap?: number;
  matchesRemaining?: number;
  directRivalId?: string;
  directRivalResult?: string;
  playerGoalCount?: number;
  hatTrick?: boolean;
  poker?: boolean;
  transferFee?: number;
  transferType?: string;
  fromClubId?: string | null;
  fromClubName?: string;
  toClubId?: string;
  toClubName?: string;
  wage?: number;
  isTransferRecord?: boolean;
  previousRecordFee?: number;
  durationDays?: number;
  injuryType?: string;
  bodyPart?: string;
  cardType?: "red" | "second-yellow";
  suspensionMatches?: number;
  positionZoneChange?: boolean;
  consequence?: string;
}

export interface NewsEvent {
  id: string;
  date: string;
  type: NewsEventType;
  category: NewsCategory;
  relevance: number;
  entities: NewsEventEntities;
  data: NewsEventData;
}

export interface PersistedNewsStory {
  event: NewsEvent;
  read: boolean;
}

/** Sólo hechos/eventos recientes; jamás texto ya redactado. */
export interface NewsState {
  version: 1;
  stories: PersistedNewsStory[];
  processedFactIds: string[];
  /** Última tabla de liga relevante para detectar cambios de posición/liderato. */
  scanSignature?: string;
  standingsSnapshot: Record<string, Array<{
    teamId: string;
    position: number;
    points: number;
    gd: number;
  }> >;
}

export const EMPTY_NEWS_STATE: NewsState = {
  version: 1,
  stories: [],
  processedFactIds: [],
  standingsSnapshot: {},
};

export const MAX_NEWS_STORIES = 40;
const MAX_PROCESSED_FACTS = 4000;

export function createEmptyNewsState(): NewsState {
  return {
    version: 1,
    stories: [],
    processedFactIds: [],
    standingsSnapshot: {},
  };
}

export function normalizeNewsState(raw: unknown): NewsState {
  if (!raw || typeof raw !== "object") return createEmptyNewsState();
  const input = raw as Partial<NewsState>;
  const stories = Array.isArray(input.stories)
    ? input.stories
        .filter((story): story is PersistedNewsStory => !!story?.event && typeof story.event.id === "string")
        .slice(0, MAX_NEWS_STORIES)
    : [];
  const processedFactIds = Array.isArray(input.processedFactIds)
    ? input.processedFactIds.filter((id): id is string => typeof id === "string").slice(-MAX_PROCESSED_FACTS)
    : [];
  const standingsSnapshot =
    input.standingsSnapshot && typeof input.standingsSnapshot === "object"
      ? input.standingsSnapshot
      : {};
  return {
    version: 1,
    stories,
    processedFactIds,
    scanSignature: typeof input.scanSignature === "string" ? input.scanSignature : undefined,
    standingsSnapshot: standingsSnapshot as NewsState["standingsSnapshot"],
  };
}

export function mergeNewsState(
  state: NewsState,
  incomingEvents: readonly NewsEvent[],
): NewsState {
  if (incomingEvents.length === 0) return state;
  const processed = new Set(state.processedFactIds);
  const existing = new Set(state.stories.map((story) => story.event.id));
  const stories = [...state.stories];

  for (const event of incomingEvents) {
    processed.add(event.id);
    if (existing.has(event.id)) continue;
    stories.unshift({ event, read: false });
    existing.add(event.id);
  }

  return {
    ...state,
    stories: stories.slice(0, MAX_NEWS_STORIES),
    processedFactIds: Array.from(processed).slice(-MAX_PROCESSED_FACTS),
  };
}

export function markNewsStoryRead(state: NewsState, id: string): NewsState {
  return {
    ...state,
    stories: state.stories.map((story) =>
      story.event.id === id ? { ...story, read: true } : story,
    ),
  };
}
