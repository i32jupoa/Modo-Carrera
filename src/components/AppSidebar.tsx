import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Trophy,
  Users,
  ClipboardList,
  Activity,
  BarChart3,
  Repeat,
  Radar,
  Calendar,
  CalendarDays,
  Globe,
  Shield,
  ChevronRight,
  Award,
  Swords,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { loadSave } from "@/lib/store";
import { loadAllSaves, loadSaveById } from "@/lib/savedGames";
import { teamById } from "@/data/teams";
import { useNotificationsStore } from "@/store/notificationsStore";
import { usePlayersStore } from "@/store/playersStore";
import { markScoutingNotificationsSeen, hasScoutingNotifications } from "@/lib/transfers/Scouting";
import { useEffect, useState } from "react";

type Item = { title: string; url: string; icon: React.ComponentType<{ className?: string }> };

const PRINCIPAL: Item[] = [
  { title: "Calendario", url: "/calendar", icon: CalendarDays },
  { title: "Central", url: "/season", icon: Calendar },
];

const MI_EQUIPO: Item[] = [
  { title: "Plantilla", url: "/squad", icon: Users },
  { title: "Ojeador", url: "/scouting", icon: Radar },
  { title: "Dirección de equipo", url: "/lineup", icon: ClipboardList },
  { title: "Lesiones", url: "/injuries", icon: Activity },
  { title: "Estadísticas de equipo", url: "/team-stats", icon: BarChart3 },
];

const COMPETICIONES: Item[] = [
  { title: "Jornadas", url: "/fixtures", icon: Swords },
  { title: "Liga", url: "/standings", icon: Trophy },
  { title: "Copa", url: "/cup", icon: Shield },
  { title: "Champions League", url: "/ucl", icon: Award },
];

const MUNDO: Item[] = [
  { title: "Equipos", url: "/teams", icon: Globe },
  { title: "Rankings", url: "/scorers", icon: Award },
  { title: "Premios", url: "/awards", icon: Trophy },
  { title: "Mercado", url: "/transfers", icon: Repeat },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [teamName, setTeamName] = useState<string | null>(null);
  const [season, setSeason] = useState<string>("");
  const [hasSave, setHasSave] = useState(false);

  useEffect(() => {
    console.log("AppSidebar useEffect ejecutado, pathname:", pathname);
    // Verificar si estamos en la página principal
    const isHomePage = pathname === "/";

    if (isHomePage) {
      // En la página principal, bloquear todo
      setTeamName(null);
      setSeason("");
      setHasSave(false);
      console.log("Página principal: bloqueando todo");
    } else {
      // En otras rutas, permitir navegación
      const s = loadSave();
      if (s) {
        setTeamName(teamById(s.myTeamId).name);
        setSeason(s.season);
        setHasSave(true);
        console.log("Otra ruta: permitiendo navegación, teamName:", teamById(s.myTeamId).name);
      } else {
        setTeamName(null);
        setSeason("");
        setHasSave(false);
        console.log("Otra ruta pero no hay save: bloqueando todo");
      }
    }
  }, [pathname]); // Ejecutar cuando cambia el pathname

  const marketNotificationTotal = useNotificationsStore((s) => s.counts.deals + s.counts.offers);
  const markAllMarketNotificationsRead = useNotificationsStore((s) => s.markAllRead);
  const currentDate = usePlayersStore((s) => s.currentDate);
  const scoutingHasNotifications = hasScoutingNotifications(currentDate);

  // Mientras estás dentro del mercado, cualquier novedad se considera vista.
  // Así no aparece ningún punto al pasar días dentro de la propia sección.
  useEffect(() => {
    if (pathname === "/transfers" && marketNotificationTotal > 0) {
      markAllMarketNotificationsRead();
    }
  }, [pathname, marketNotificationTotal, markAllMarketNotificationsRead]);

  // Entrar o permanecer en Ojeador consume las novedades visibles hasta ese
  // momento (cambio de catálogo o informes que ya estén listos).
  useEffect(() => {
    if (pathname === "/scouting") {
      markScoutingNotificationsSeen(currentDate);
    }
  }, [pathname, currentDate]);

  const isActive = (url: string) => pathname === url;

  return (
    <Sidebar collapsible="icon" className="border-r border-border/60">
      <SidebarHeader className="border-b border-border/60 px-4 py-4">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-md bg-primary grid place-items-center glow-neon shrink-0">
            <span className="text-primary-foreground font-black text-sm">FC</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-black tracking-tight leading-none">
                FC <span className="text-primary">SIM</span>
              </div>
              {hasSave && teamName && (
                <div className="text-[0.65rem] text-muted-foreground truncate mt-0.5">
                  {teamName}
                </div>
              )}
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {hasSave ? (
          <>
            <NavGroup
              label="Principal"
              items={PRINCIPAL}
              collapsed={collapsed}
              isActive={isActive}
            />
            <NavGroup
              label="Mi equipo"
              items={MI_EQUIPO}
              collapsed={collapsed}
              isActive={isActive}
              badges={{
                "/scouting": pathname !== "/scouting" && scoutingHasNotifications,
              }}
            />
            <NavGroup
              label="Competiciones"
              items={COMPETICIONES}
              collapsed={collapsed}
              isActive={isActive}
            />
            <NavGroup
              label="Mundo"
              items={MUNDO}
              collapsed={collapsed}
              isActive={isActive}
              badges={{
                "/transfers": pathname !== "/transfers" && marketNotificationTotal > 0,
              }}
            />
          </>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Carga o inicia una carrera para acceder a las opciones
          </div>
        )}
      </SidebarContent>

      {!collapsed && hasSave && season && (
        <SidebarFooter className="border-t border-border/60 px-4 py-3">
          <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            Temporada
          </div>
          <div className="text-sm font-bold scoreline">{season}</div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}

/** Punto amarillo de novedades. No muestra cantidades. */
function NotificationDots({
  hasNotification,
  compact = false,
  label = "Nueva notificación",
}: {
  hasNotification: boolean;
  compact?: boolean;
  label?: string;
}) {
  if (!hasNotification) return null;
  return (
    <span
      title={label}
      aria-label={label}
      className={
        compact
          ? "inline-block h-2 w-2 rounded-full bg-yellow-400 ring-2 ring-yellow-400/20"
          : "inline-block h-2.5 w-2.5 rounded-full bg-yellow-400 ring-2 ring-yellow-400/20"
      }
    />
  );
}

function NavGroup({
  label,
  items,
  collapsed,
  isActive,
  badges,
}: {
  label: string;
  items: Item[];
  collapsed: boolean;
  isActive: (url: string) => boolean;
  badges?: Record<string, boolean>;
}) {
  return (
    <SidebarGroup>
      {!collapsed && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild isActive={isActive(item.url)}>
                <Link to={item.url} className="flex items-center gap-2 group relative">
                  <item.icon className="h-4 w-4 shrink-0" />
                  {collapsed ? (
                    badges?.[item.url] && (
                      <span className="absolute -top-1 right-0">
                        <NotificationDots hasNotification compact label={`Novedades en ${item.title}`} />
                      </span>
                    )
                  ) : (
                    <>
                      <span className="flex-1">{item.title}</span>
                      {badges?.[item.url] && <NotificationDots hasNotification label={`Novedades en ${item.title}`} />}
                      <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-50 transition" />
                    </>
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
