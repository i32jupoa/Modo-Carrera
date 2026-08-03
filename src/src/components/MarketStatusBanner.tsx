import { useTransferMarket } from "@/hooks/useTransferMarket";
import { Lock, Unlock } from "lucide-react";

export function MarketStatusBanner({ className = "" }: { className?: string }) {
  const { isMarketOpen, windowLabel, formattedDate } = useTransferMarket();

  return (
    <div
      role="status"
      className={`rounded-lg border-2 px-4 py-3 flex items-center gap-3 ${
        isMarketOpen
          ? "border-green-500/60 bg-green-500/15 text-green-100"
          : "border-red-500/60 bg-red-500/15 text-red-100"
      } ${className}`}
    >
      {isMarketOpen ? (
        <Unlock className="h-5 w-5 shrink-0 text-green-400" />
      ) : (
        <Lock className="h-5 w-5 shrink-0 text-red-400" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-black text-sm tracking-wide uppercase">
          {isMarketOpen ? "Mercado abierto" : "Mercado cerrado"}
        </p>
        <p className="text-xs opacity-90 mt-0.5 capitalize">
          {formattedDate}
          {windowLabel ? ` · ${windowLabel}` : " · Fuera de ventana de fichajes"}
        </p>
      </div>
    </div>
  );
}
