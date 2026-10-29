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

const ACTIVE_MATCH_AMBIENT_STORAGE_KEY = "fcsim:active-match-ambient:v1";

function isAmbientKey(value: unknown): value is AmbientKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(COMPETITION_AMBIENT, value);
}

function readActiveMatchAmbient(): AmbientKey | null {
  try {
    const value = window.sessionStorage.getItem(ACTIVE_MATCH_AMBIENT_STORAGE_KEY);
    return isAmbientKey(value) ? value : null;
  } catch {
    return null;
  }
}

function writeActiveMatchAmbient(value: AmbientKey | null) {
  try {
    if (value) window.sessionStorage.setItem(ACTIVE_MATCH_AMBIENT_STORAGE_KEY, value);
    else window.sessionStorage.removeItem(ACTIVE_MATCH_AMBIENT_STORAGE_KEY);
  } catch {
    // The match remains playable when storage is disabled; this only affects
    // whether its visual theme can be remembered across the lineup editor.
  }
}

function findFixtureById(save: any, fixtureId: string | undefined): any | null {
  if (!save || !fixtureId) return null;
  const fixtureLists = [
    ...Object.values(save.fixtures ?? {}),
    ...Object.values(save.cupFixtures ?? {}),
    save.uclFixtures,
    save.uelFixtures,
    save.ueclFixtures,
  ];
  for (const list of fixtureLists) {
    if (!Array.isArray(list)) continue;
    const fixture = list.find((item: any) => item?.id === fixtureId);
    if (fixture) return fixture;
  }
  return null;
}

function ambientForMatchState(save: any, state: any, leagueKey: AmbientKey): AmbientKey | null {
  const fixture = findFixtureById(save, typeof state?.fixtureId === "string" ? state.fixtureId : undefined);
  if (fixture) {
    const key = resolveCompetitionKey(fixture);
    // The route state distinguishes tournament matches whose fixture records
    // are missing the older `competition` field.
    if (key === "league" && state?.matchType === "UCL") {
      if (fixture.europeanCompetition === "uel") return "uel";
      if (fixture.europeanCompetition === "uecl") return "uecl";
      return state?.europeanCompetition === "uel" ? "uel" : state?.europeanCompetition === "uecl" ? "uecl" : "ucl";
    }
    if (key === "league" && state?.matchType === "CUP") return "cup";
    return key === "league" ? leagueKey : key;
  }

  if (state?.europeanCompetition === "uel") return "uel";
  if (state?.europeanCompetition === "uecl") return "uecl";
  if (state?.matchType === "UCL") return "ucl";
  if (state?.matchType === "CUP") return "cup";
  if (state?.matchType === "LEAGUE") return leagueKey;
  return null;
}

/**
 * Fondo ambiental de toda la interfaz interna: imagen de la competición
 * (según la sección o el próximo partido) + brillo sutil con los colores
 * del club del usuario. También publica variables CSS (--club, --comp-accent).
 *
 * Durante un partido, el ambiente se bloquea a la competición de ese encuentro.
 * Así, abrir Dirección de equipo para hacer cambios no cambia una noche de
 * Champions al fondo de liga. El bloqueo solo se libera al volver a Temporada
 * (o al menú principal), donde se vuelve a calcular el ambiente de la central.
 */
export function GameAmbient() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const locationState = useRouterState({ select: (r) => r.location.state as any });
  const [key, setKey] = useState<AmbientKey>("league");

  useEffect(() => {
    const root = document.documentElement;
    const save = loadSave();
    const isGameRoute = pathname !== "/";
    root.dataset.gameActive = String(isGameRoute);
    root.dataset.gameRoute = pathname.split("/").filter(Boolean)[0] || "home";

    let leagueKey: AmbientKey = "league";
    if (save) {
      const team = teamById(save.myTeamId);
      if (team?.color) root.style.setProperty("--club", team.color);
      root.style.setProperty("--club-2", team?.secondaryColor || team?.color || "");
      const leagueCountry = LEAGUES[save.myLeague as LeagueId]?.country ?? "";
      leagueKey = themeForLeagueCountry(leagueCountry);
    }

    // Returning to the season hub ends the visual lock. The central screen can
    // then adopt the theme of the next scheduled fixture as usual.
    const isCentralExit = pathname === "/season" || pathname === "/";
    if (isCentralExit) writeActiveMatchAmbient(null);

    let activeMatchAmbient = readActiveMatchAmbient();
    if (pathname === "/match") {
      const fromMatch = ambientForMatchState(save, locationState, leagueKey);
      if (fromMatch) {
        activeMatchAmbient = fromMatch;
        writeActiveMatchAmbient(fromMatch);
      }
    }

    let next: AmbientKey = "league";
    if (!isCentralExit && activeMatchAmbient) {
      // Keep the competition look stable through in-match destinations such as
      // /lineup. It will not follow the next fixture until /season is revisited.
      next = activeMatchAmbient;
    } else if (save) {
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
  }, [pathname, locationState]);

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
