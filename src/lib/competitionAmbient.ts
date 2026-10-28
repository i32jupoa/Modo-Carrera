import ucl from "@/assets/bg-ucl.png";
import uel from "@/assets/bg-uel.jpg";
import uecl from "@/assets/bg-uecl.jpg";
import cup from "@/assets/bg-cup.jpg";
import laliga from "@/assets/bg-laliga.jpg";
import premier from "@/assets/bg-premier.jpg";
import seriea from "@/assets/bg-seriea.jpg";
import bundesliga from "@/assets/bg-bundesliga.jpg";
import ligue1 from "@/assets/bg-ligue1.jpg";
import nordic from "@/assets/bg-nordic.jpg";
import league from "@/assets/bg-league.jpg";

export type AmbientKey =
  | "ucl"
  | "uel"
  | "uecl"
  | "cup"
  | "laliga"
  | "premier"
  | "seriea"
  | "bundesliga"
  | "ligue1"
  | "nordic"
  | "league";

/** family = valor de data-comp en <html>, que fija --comp-accent en styles.css */
export const COMPETITION_AMBIENT: Record<AmbientKey, { image: string; family: string }> = {
  ucl: { image: ucl, family: "ucl" },
  uel: { image: uel, family: "uel" },
  uecl: { image: uecl, family: "uecl" },
  cup: { image: cup, family: "cup" },
  laliga: { image: laliga, family: "laliga" },
  premier: { image: premier, family: "premier" },
  seriea: { image: seriea, family: "seriea" },
  bundesliga: { image: bundesliga, family: "bundesliga" },
  ligue1: { image: ligue1, family: "ligue1" },
  nordic: { image: nordic, family: "nordic" },
  league: { image: league, family: "league" },
};

export function themeForLeagueCountry(country: string): AmbientKey {
  switch (country) {
    case "España":
      return "laliga";
    case "Inglaterra":
    case "Escocia":
      return "premier";
    case "Italia":
      return "seriea";
    case "Alemania":
    case "Austria":
    case "Suiza":
      return "bundesliga";
    case "Francia":
    case "Bélgica":
      return "ligue1";
    case "Noruega":
    case "Suecia":
    case "Dinamarca":
    case "Polonia":
      return "nordic";
    default:
      return "league";
  }
}

type FixtureLike = { competition?: string; europeanCompetition?: string } | null | undefined;

export function resolveCompetitionKey(f: FixtureLike): "ucl" | "uel" | "uecl" | "cup" | "league" {
  if (!f) return "league";
  if (f.europeanCompetition === "uel") return "uel";
  if (f.europeanCompetition === "uecl") return "uecl";
  if (f.europeanCompetition === "ucl" || f.competition === "ucl") return "ucl";
  if (f.competition === "cup") return "cup";
  return "league";
}

/** Qué ambiente corresponde a cada sección. "next" = el del próximo partido. */
export function routeCompetition(pathname: string): AmbientKey | "next" {
  if (pathname.startsWith("/ucl")) return "ucl";
  if (pathname.startsWith("/europa-league")) return "uel";
  if (pathname.startsWith("/conference-league")) return "uecl";
  if (pathname.startsWith("/cup")) return "cup";
  if (pathname.startsWith("/season") || pathname.startsWith("/match") || pathname.startsWith("/calendar"))
    return "next";
  return "league";
}
