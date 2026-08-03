import { useMemo } from "react";
import { usePlayersStore } from "@/store/playersStore";
import {
  activeTransferWindowLabel,
  formatGameDate,
  isMarketOpenForIso,
  parseDateOnly,
} from "@/lib/transferWindows";

export function useTransferMarket() {
  const currentDate = usePlayersStore((s) => s.currentDate);

  return useMemo(() => {
    const date = parseDateOnly(currentDate);
    const isMarketOpen = isMarketOpenForIso(currentDate);
    return {
      currentDate,
      date,
      isMarketOpen,
      windowLabel: activeTransferWindowLabel(date),
      formattedDate: formatGameDate(currentDate),
    };
  }, [currentDate]);
}
