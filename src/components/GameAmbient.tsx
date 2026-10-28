import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { loadSave, getMyNextFixtureAny } from "@/lib/store";
import { teamById, LEAGUES, type LeagueId } from "@/data/teams";
import {
  resolveCompetitionKey,
  routeCompetition,
  themeForLeagueCountry,
  COMPETITION_AMBIENT,
  type AmbientKey,
} from "@/lib/competitionAmbient";

/**
 * Fondo ambiental de toda la interfaz interna: imagen de la competición
 * (según la sección o el próximo partido) + brillo sutil con los colores
 * del club del usuario. También publica variables CSS (--club, --comp-accent).
 */
export function GameAmbient() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [key, setKey] = useState<AmbientKey>("league");

  useEffect(() => {
    const root = document.documentElement;
    const save = loadSave();
    const isGameRoute = pathname !== "/";
    root.dataset.gameActive = String(isGameRoute);
    root.dataset.gameRoute = pathname.split("/").filter(Boolean)[0] || "home";
    let next: AmbientKey = "league";
    if (save) {
      const team = teamById(save.myTeamId);
      if (team?.color) root.style.setProperty("--club", team.color);
      root.style.setProperty("--club-2", team?.secondaryColor || team?.color || "");
      const leagueCountry = LEAGUES[save.myLeague as LeagueId]?.country ?? "";
      const leagueKey = themeForLeagueCountry(leagueCountry);
      const byRoute = routeCompetition(pathname);
      if (byRoute === "next") {
        const fx = getMyNextFixtureAny(save);
        const comp = resolveCompetitionKey(fx);
        next = comp === "league" ? leagueKey : comp;
      } else if (byRoute === "league") {
        next = leagueKey;
      } else {
        next = byRoute;
      }
    }
    root.dataset.comp = COMPETITION_AMBIENT[next].family;
    setKey(next);
  }, [pathname]);

  if (pathname === "/") return null;
  const ambient = COMPETITION_AMBIENT[key];

  return (
    <div aria-hidden className="game-ambient" data-ambient={key}>
      <img src={ambient.image} alt="" className="game-ambient-img" />
      <div className="game-ambient-shade" />
      <div className="game-ambient-club" />
    </div>
  );
}
