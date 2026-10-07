import type { SaveGame } from "@/lib/store";
import { listRenewals } from "@/lib/transfers/RenewalLog";
import { listTransfers } from "@/lib/transfers/TransferHistory";
import { buildGameNews, type NewsItem } from "./newsEngine";

let cache: { key: string; items: NewsItem[] } | null = null;

function countPlayed(list: Array<{ result?: unknown }> | undefined): number {
  if (!list) return 0;
  let n = 0;
  for (const f of list) if (f.result) n++;
  return n;
}

/** Clave barata que cambia cuando ocurre algo nuevo en la partida. */
function stateKey(save: SaveGame): string {
  const md = Object.values(save.currentMatchday ?? {}).reduce((a, b) => a + (b || 0), 0);
  const lastTransfer = listTransfers(1)[0]?.id ?? "";
  const lastRenewal = listRenewals(1)[0]?.id ?? "";
  return [
    save.myTeamId,
    save.season,
    md,
    countPlayed(save.uclFixtures),
    countPlayed(save.uelFixtures),
    countPlayed(save.ueclFixtures),
    countPlayed(save.cupFixtures?.[save.myLeague]),
    lastTransfer,
    lastRenewal,
  ].join("|");
}

/** Noticias reales de la partida, con caché para no recalcular en cada render. */
export function getCachedGameNews(save: SaveGame): NewsItem[] {
  const key = stateKey(save);
  if (cache && cache.key === key) return cache.items;
  const items = buildGameNews(save);
  cache = { key, items };
  return items;
}
