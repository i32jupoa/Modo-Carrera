import React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2, Play, Calendar, Trophy, AlertTriangle } from "lucide-react";
import {
  loadAllSaves,
  deleteSave,
  loadSaveById,
  updateSaveLastPlayed,
  type SavedGameMeta,
} from "@/lib/savedGames";
import { LEAGUES } from "@/data/teams";
import { usePlayersStore } from "@/store/playersStore";

export default function SavedGamesModal({
  open,
  onOpenChange,
  onLoadGame,
  onDeleteGame,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onLoadGame: (save: any, id?: string) => void;
  onDeleteGame?: () => void;
}) {
  const [saves, setSaves] = React.useState<SavedGameMeta[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deleteTargetId, setDeleteTargetId] = React.useState<string | null>(null);
  const setMyTeam = usePlayersStore((s) => s.setMyTeam);
  const initPlayers = usePlayersStore((s) => s.init);

  React.useEffect(() => {
    if (open) {
      setSaves(loadAllSaves());
    }
  }, [open]);

  function handleLoadGame(id: string) {
    console.log("handleLoadGame llamado con id:", id);
    const save = loadSaveById(id);
    if (save) {
      console.log("Save cargado:", save);
      updateSaveLastPlayed(id);
      onLoadGame(save, id);
      onOpenChange(false);
    } else {
      console.error("No se pudo cargar el save con id:", id);
    }
  }

  function handleDeleteGame(id: string) {
    setDeleteTargetId(id);
    setDeleteConfirmOpen(true);
  }

  function confirmDeleteGame() {
    if (deleteTargetId) {
      deleteSave(deleteTargetId);
      setSaves(loadAllSaves());
      onDeleteGame?.();
    }
    setDeleteTargetId(null);
    setDeleteConfirmOpen(false);
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full p-0 overflow-hidden border-white/10 bg-gradient-to-br from-slate-950 via-black to-slate-950">
        <div className="p-6 md:p-8">
          <div className="flex items-center gap-3 mb-1">
            <Trophy className="h-6 w-6 text-amber-400" />
            <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber-300">
              Partidas guardadas
            </div>
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-white mb-2">Tus carreras</h2>
          <p className="text-sm text-white/55 mb-6">
            Selecciona una partida para continuar o elimina las que ya no necesites.
          </p>

          {saves.length === 0 ? (
            <div className="rounded-xl p-8 border border-white/10 bg-white/[0.03] text-center">
              <Trophy className="h-12 w-12 text-white/20 mx-auto mb-4" />
              <div className="text-white/70 mb-2">No tienes partidas guardadas</div>
              <div className="text-sm text-white/50">Inicia una nueva carrera para comenzar</div>
            </div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {saves.map((save) => (
                <div
                  key={save.id}
                  className="p-4 rounded-xl border border-white/10 bg-white/[0.04] hover:border-primary/50 transition group"
                  style={{
                    background: `linear-gradient(135deg, ${save.teamColor}15, transparent 60%)`,
                    borderColor: `${save.teamColor}30`,
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ background: save.teamColor }}
                        />
                        <div className="text-lg font-black text-white truncate">
                          {save.teamName}
                        </div>
                      </div>
                      <div className="text-xs text-white/60 mb-2">
                        {LEAGUES[save.league]?.name ?? save.league} · {save.season}
                      </div>
                      <div className="flex items-center gap-4 text-[11px] text-white/50">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Creado: {formatDate(save.createdAt)}
                        </div>
                        <div className="flex items-center gap-1">
                          <Play className="h-3 w-3" />
                          Jugado: {formatDate(save.lastPlayed)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleLoadGame(save.id)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-primary to-primary/80 hover:brightness-125 transition"
                        style={{
                          background: `linear-gradient(90deg, ${save.teamColor}, ${save.teamColor}cc)`,
                        }}
                      >
                        <Play className="h-4 w-4 fill-white" />
                        Cargar
                      </button>
                      <button
                        onClick={() => handleDeleteGame(save.id)}
                        className="p-2 rounded-lg text-white/50 hover:text-red-400 hover:bg-red-500/10 transition"
                        title="Eliminar partida"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="glass-dark border-red-500/20">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-red-400" />
              </div>
              <AlertDialogTitle className="text-2xl font-black text-white">
                Eliminar partida
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-white/70 text-base">
              ¿Estás seguro de que quieres eliminar esta partida guardada? Esta acción no se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3">
            <AlertDialogCancel className="glass border-white/10 text-white hover:bg-white/5">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteGame}
              className="bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-bold border border-red-400/30"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
