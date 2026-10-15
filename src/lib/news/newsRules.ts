/** Reglas puras para vigencia y enfriamiento de noticias. */

export interface DatedEntityStory {
  id: string;
  date: string;
  type: string;
  entityId?: string | null;
  clubId?: string | null;
}

function utcDay(value: string | undefined): number {
  if (!value || typeof value !== "string") return Number.NaN;
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Number.NaN;
  const time = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(time) ? Math.floor(time / 86_400_000) : Number.NaN;
}

/** Acepta sólo hechos dentro de la ventana y nunca historias fechadas en el futuro. */
export function isWithinNewsWindow(
  eventDate: string | undefined,
  referenceDate: string | undefined,
  maxAgeDays = 30,
): boolean {
  const eventDay = utcDay(eventDate);
  const referenceDay = utcDay(referenceDate);
  if (!Number.isFinite(eventDay) || !Number.isFinite(referenceDay)) return false;
  const age = referenceDay - eventDay;
  return age >= 0 && age <= Math.max(0, Math.floor(maxAgeDays));
}

/**
 * Recorta rumores repetidos por tipo y entidad. Los elementos más recientes
 * prevalecen; distintas entidades siguen teniendo su propia oportunidad.
 */
export function filterStoriesByEntityCooldown<T extends DatedEntityStory>(
  stories: readonly T[],
  referenceDate: string,
  options: { windowDays?: number; cooldownDays?: number } = {},
): T[] {
  const windowDays = options.windowDays ?? 30;
  const cooldownDays = options.cooldownDays ?? 5;
  const recent = stories
    .filter((story) => isWithinNewsWindow(story.date, referenceDate, windowDays))
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
  const latestByKey = new Map<string, number>();
  const output: T[] = [];

  for (const story of recent) {
    const entity = story.entityId || story.clubId || "global";
    const key = `${story.type}:${entity}`;
    const day = utcDay(story.date);
    const lastDay = latestByKey.get(key);
    if (lastDay !== undefined && lastDay - day <= Math.max(0, Math.floor(cooldownDays))) continue;
    latestByKey.set(key, day);
    output.push(story);
  }

  return output;
}
