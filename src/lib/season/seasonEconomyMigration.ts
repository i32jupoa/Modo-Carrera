/** Small, versioned, pure migration for finance fields introduced in phase 6. */
export type SeasonEconomySaveFields = {
  seasonEconomyVersion?: number;
  seasonEconomyLedger?: string[];
};

export function migrateSeasonEconomyFields<T extends Record<string, any>>(
  input: T,
): { save: T & SeasonEconomySaveFields; changed: boolean } {
  let changed = false;
  const save: Record<string, any> = { ...input };
  if (!Array.isArray(save.seasonEconomyLedger)) {
    save.seasonEconomyLedger = [];
    changed = true;
  } else {
    const ledger = [...new Set(save.seasonEconomyLedger.filter((entry: unknown): entry is string => typeof entry === "string" && /^\d{4}\/\d{2}$/.test(entry)))];
    if (JSON.stringify(ledger) !== JSON.stringify(save.seasonEconomyLedger)) {
      save.seasonEconomyLedger = ledger.slice(-80);
      changed = true;
    }
  }
  if (save.seasonEconomyVersion !== 1) {
    save.seasonEconomyVersion = 1;
    changed = true;
  }
  return { save: save as T & SeasonEconomySaveFields, changed };
}
