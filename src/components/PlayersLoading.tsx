import { useEffect } from "react";
import { PLAYERS_DB_SIZE, usePlayersStore } from "@/store/playersStore";

export function usePlayersReady() {
  const loaded = usePlayersStore((s) => s.loaded);
  const init = usePlayersStore((s) => s.init);

  useEffect(() => {
    if (!loaded) init();
  }, [loaded, init]);

  return {
    ready: loaded && PLAYERS_DB_SIZE > 0,
    loading: !loaded || PLAYERS_DB_SIZE === 0,
  };
}

export function PlayersLoading({ message = "Cargando datos…" }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      <p className="text-sm text-muted-foreground animate-pulse">{message}</p>
    </div>
  );
}
