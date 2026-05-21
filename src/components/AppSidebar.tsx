import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home, Trophy, Users, ClipboardList, Activity, Target,
  Repeat, Calendar, CalendarDays, Globe, Shield, ChevronRight, Award, Swords,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { loadSave } from "@/lib/store";
import { teamById } from "@/data/teams";
import { useEffect, useState } from "react";

type Item = { title: string; url: string; icon: React.ComponentType<{ className?: string }> };

const PRINCIPAL: Item[] = [
  { title: "Calendario", url: "/calendar", icon: CalendarDays },
  { title: "Temporada", url: "/season", icon: Calendar },
];

const MI_EQUIPO: Item[] = [
  { title: "Plantilla", url: "/squad", icon: Users },
  { title: "Alineación", url: "/lineup", icon: ClipboardList },
  { title: "Lesiones", url: "/injuries", icon: Activity },
];

const COMPETICIONES: Item[] = [
  { title: "Partidos", url: "/fixtures", icon: Swords },
  { title: "Clasificación", url: "/standings", icon: Trophy },
  { title: "Copa nacional", url: "/cup", icon: Shield },
  { title: "Champions League", url: "/champions", icon: Award },
];

const ESTADISTICAS: Item[] = [
  { title: "Goleadores", url: "/scorers", icon: Target },
  { title: "Asistentes", url: "/assists", icon: Target },
];

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

  useEffect(() => {
    const s = loadSave();
    if (s) {
      setTeamName(teamById(s.myTeamId).name);
      setSeason(s.season);
    }
  }, [pathname]);

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
              {teamName && (
                <div className="text-[0.65rem] text-muted-foreground truncate mt-0.5">
                  {teamName}
                </div>
              )}
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <NavGroup label="Principal" items={PRINCIPAL} collapsed={collapsed} isActive={isActive} />
        <NavGroup label="Mi equipo" items={MI_EQUIPO} collapsed={collapsed} isActive={isActive} />
        <NavGroup label="Competiciones" items={COMPETICIONES} collapsed={collapsed} isActive={isActive} />
        <NavGroup label="Estadísticas" items={ESTADISTICAS} collapsed={collapsed} isActive={isActive} />
        <NavGroup label="Mundo" items={MUNDO} collapsed={collapsed} isActive={isActive} />
      </SidebarContent>

      {!collapsed && season && (
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

function NavGroup({
  label, items, collapsed, isActive,
}: {
  label: string;
  items: Item[];
  collapsed: boolean;
  isActive: (url: string) => boolean;
}) {
  return (
    <SidebarGroup>
      {!collapsed && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild isActive={isActive(item.url)}>
                <Link to={item.url} className="flex items-center gap-2 group">
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1">{item.title}</span>
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
