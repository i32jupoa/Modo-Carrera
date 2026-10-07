import { toast } from "sonner";
import type { MarketNotification } from "@/store/notificationsStore";
import { NotificationCard } from "./NotificationCard";

const MAX_TOASTS = 3;

/** Avisos emergentes con imágenes (máximo 3 a la vez para no saturar). */
export function showNotificationToasts(items: MarketNotification[]): void {
  const list = items.slice(0, MAX_TOASTS);
  for (const item of list) {
    toast.custom(() => <NotificationCard item={item} />, {
      id: item.id,
      duration: 6000,
    });
  }
  const rest = items.length - list.length;
  if (rest > 0) toast(`+${rest} novedades más en la campana de notificaciones`, { duration: 4000 });
}
