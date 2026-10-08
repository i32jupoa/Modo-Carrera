import { Handshake } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getPlayer } from "@/lib/transfers";
import type { FcPlayer } from "@/store/playersStore";

export function LoanSearchModal({
  p,
  listed,
  onToggle,
  onClose,
}: {
  p: FcPlayer;
  listed: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const marketPlayer = getPlayer(String(p.ID));
  const loaned = !!marketPlayer?.loanClubId;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md overflow-hidden p-0">
        <div className="bg-gradient-to-br from-primary/20 via-card to-transparent p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-black">
              <Handshake className="h-5 w-5 text-primary" />
              Buscar cesión
            </DialogTitle>
            <DialogDescription>
              {p.Name} · {Math.round(p.OVR)} OVR · {p.Age} años
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-border/60 bg-card/60 p-4 text-sm">
            <p className="font-bold">Buscar destino temporal</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Lista al jugador como disponible para una cesión. Los clubes interesados enviarán ofertas
              y la negociación continuará desde Mercado → Ofertas recibidas. La prima suele ser gratis o
              baja, y se negocia qué porcentaje del salario paga cada club. También pueden llegar ofertas
              sin haberlo listado.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-border/50 bg-secondary/40 p-3">
              <p className="text-muted-foreground">Estado</p>
              <p className="mt-1 font-black">{loaned ? "Ya está cedido" : listed ? "Buscando destino" : "Sin búsqueda"}</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-secondary/40 p-3">
              <p className="text-muted-foreground">Prima habitual</p>
              <p className="mt-1 font-black">Gratis / baja</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={loaned}
              onClick={onToggle}
              className={`flex-1 rounded-xl px-4 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${
                listed ? "border border-amber-500/40 bg-amber-500/15 text-amber-300" : "bg-primary text-primary-foreground"
              }`}
            >
              {listed ? "Cancelar búsqueda" : "Buscar destino"}
            </button>
            <button type="button" onClick={onClose} className="rounded-xl bg-secondary px-4 py-3 text-sm font-bold">
              Cerrar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
