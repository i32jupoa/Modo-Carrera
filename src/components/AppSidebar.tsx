import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Trophy,
  Users,
  ClipboardList,
  Activity,
  Repeat,
  Calendar,
  CalendarDays,
  Globe,
  Shield,
  ChevronRight,
  Award,
  Swords,
  CheckCircle2,
  Info,
  XCircle,
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
import { useNotificationsStore, type NotificationKind } from "@/store/notificationsStore";
import { useEffect, useState } from "react";

type Item = { title: string; url: string; icon: React.ComponentType<{ className?: string }> };

const PRINCIPAL: Item[] = [
  { title: "Calendario", url: "/calendar", icon: CalendarDays },
  { title: "Central", url: "/season", icon: Calendar },
];

const MI_EQUIPO: Item[] = [
  { title: "Plantilla", url: "/squad", icon: Users },
  { title: "Estadísticas de equipo", url: "/team-stats", icon: Activity },
  { title: "Dirección de equipo", url: "/lineup", icon: ClipboardList },
  { title: "Lesiones", url: "/injuries", icon: Activity },
];

const COMPETICIONES: Item[] = [
  { title: "Jornadas", url: "/fixtures", icon: Swords },
  { title: "Liga", url: "/standings", icon: Trophy },
  { title: "Copa", url: "/cup", icon: Shield },
  { title: "Champions League", url: "/ucl", icon: Award },
];

const ESTADISTICAS: Item[] = [{ title: "Rankings", url: "/scorers", icon: Award }];

const MUNDO: Item[] = [
  { title: "Equipos", url: "/teams", icon: Globe },
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

  const counts = useNotificationsStore((s) => s.counts);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);

  // Entrar en el mercado da por vistas todas las novedades.
  useEffect(() => {
    if (pathname === "/transfers") markAllRead();
  }, [pathname, markAllRead]);

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
            />
            <NavGroup
              label="Competiciones"
              items={COMPETICIONES}
              collapsed={collapsed}
              isActive={isActive}
            />
            <NavGroup
              label="Estadísticas"
              items={ESTADISTICAS}
              collapsed={collapsed}
              isActive={isActive}
            />
            <NavGroup
              label="Mundo"
              items={MUNDO}
              collapsed={collapsed}
              isActive={isActive}
              badges={{ "/transfers": counts }}
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

/** Estilo semántico de las novedades del mercado.
 *  No usamos círculos sólidos: cada estado tiene un icono claro y un fondo
 *  suave para que el indicador se integre con el resto del menú. */
const NOTIFICATION_META: Record<NotificationKind, {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  className: string;
}> = {
  good: {
    icon: CheckCircle2,
    label: "Éxito",
    className: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25",
  },
  info: {
    icon: Info,
    label: "Oferta o contraoferta",
    className: "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/25",
  },
  bad: {
    icon: XCircle,
    label: "Rechazo",
    className: "bg-red-500/15 text-red-300 ring-1 ring-red-500/25",
  },
};

const BADGE_ORDER: NotificationKind[] = ["good", "info", "bad"];

/** Indicadores de novedades sin leer del mercado. */
function NotificationDots({
  counts,
  compact = false,
}: {
  counts: Record<NotificationKind, number>;
  compact?: boolean;
}) {
  const visible = BADGE_ORDER.filter((kind) => counts[kind] > 0);
  if (visible.length === 0) return null;
  return (
    <span className={compact ? "flex items-center gap-0.5" : "flex items-center gap-1.5"}>
      {visible.map((kind) => {
        const meta = NOTIFICATION_META[kind];
        const Icon = meta.icon;
        const count = counts[kind] > 99 ? "99+" : counts[kind];
        return (
          <span
            key={kind}
            title={`${meta.label}: ${count}`}
            aria-label={`${meta.label}: ${count}`}
            className={`inline-flex items-center justify-center gap-1 font-black tabular-nums rounded-md ${meta.className} ${
              compact
                ? "h-4 min-w-4 px-0.5 text-[0.45rem]"
                : "h-5 min-w-6 px-1.5 text-[0.62rem]"
            }`}
          >
            <Icon className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
            <span>{count}</span>
          </span>
        );
      })}
    </span>
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
  badges?: Record<string, Record<NotificationKind, number>>;
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
                        <NotificationDots counts={badges[item.url]} compact />
                      </span>
                    )
                  ) : (
                    <>
                      <span className="flex-1">{item.title}</span>
                      {badges?.[item.url] && <NotificationDots counts={badges[item.url]} />}
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
