import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Team } from "@/data/teams";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Calcula el presupuesto inicial basado en el overall del equipo.
 * Usa interpolación exponencial: Gigantes ~250M, medianos ~80M, modestos ~15M
 */
export function calculateTeamBudget(overall: number): number {
  // Fórmula: (OVR/60)^3.5 * 15 millones
  return Math.round(Math.pow(Math.max(60, overall) / 60, 3.5) * 15);
}

/**
 * Clasificación granular de un equipo.
 * Elite Mundial · Gigante · Aspirante · Media tabla · Modesto · Humilde
 */
export type TeamCategory =
  | "Elite Mundial"
  | "Gigante"
  | "Aspirante"
  | "Media tabla"
  | "Modesto"
  | "Humilde";

export function getTeamCategory(team: Team): TeamCategory {
  const overall = Math.round((team.att + team.mid + team.def) / 3);
  if (overall >= 86) return "Elite Mundial";
  if (overall >= 80) return "Gigante";
  if (overall >= 75) return "Aspirante";
  if (overall >= 70) return "Media tabla";
  if (overall >= 65) return "Modesto";
  return "Humilde";
}

/**
 * Dificultad del modo carrera (cuanto mayor overall, menor dificultad).
 * 5 niveles: Muy Fácil · Fácil · Media · Difícil · Muy Difícil · Extrema
 */
export type TeamDifficulty =
  | "Muy Fácil"
  | "Fácil"
  | "Media"
  | "Difícil"
  | "Muy Difícil"
  | "Extrema";

export function getTeamDifficulty(overall: number): TeamDifficulty {
  if (overall >= 86) return "Muy Fácil";
  if (overall >= 80) return "Fácil";
  if (overall >= 74) return "Media";
  if (overall >= 68) return "Difícil";
  if (overall >= 62) return "Muy Difícil";
  return "Extrema";
}

export const DIFFICULTY_COLORS: Record<
  TeamDifficulty,
  { bg: string; text: string; border: string }
> = {
  "Muy Fácil": {
    bg: "bg-emerald-500/20",
    text: "text-emerald-300",
    border: "border-emerald-500/40",
  },
  Fácil: { bg: "bg-green-500/20", text: "text-green-300", border: "border-green-500/40" },
  Media: { bg: "bg-yellow-500/20", text: "text-yellow-300", border: "border-yellow-500/40" },
  Difícil: { bg: "bg-orange-500/20", text: "text-orange-300", border: "border-orange-500/40" },
  "Muy Difícil": { bg: "bg-red-500/20", text: "text-red-300", border: "border-red-500/40" },
  Extrema: { bg: "bg-fuchsia-600/20", text: "text-fuchsia-300", border: "border-fuchsia-600/40" },
};

export const CATEGORY_COLORS: Record<TeamCategory, { bg: string; text: string; border: string }> = {
  "Elite Mundial": { bg: "bg-amber-500/20", text: "text-amber-300", border: "border-amber-500/40" },
  Gigante: { bg: "bg-yellow-500/20", text: "text-yellow-300", border: "border-yellow-500/40" },
  Aspirante: { bg: "bg-blue-500/20", text: "text-blue-300", border: "border-blue-500/40" },
  "Media tabla": { bg: "bg-cyan-500/20", text: "text-cyan-300", border: "border-cyan-500/40" },
  Modesto: { bg: "bg-gray-500/20", text: "text-gray-300", border: "border-gray-500/40" },
  Humilde: { bg: "bg-zinc-600/30", text: "text-zinc-300", border: "border-zinc-500/40" },
};

/**
 * Genera objetivos realistas para un equipo según su categoría y overall.
 */
export function getTeamObjectives(overall: number, category: TeamCategory): string[] {
  if (category === "Elite Mundial" || category === "Gigante") {
    if (overall >= 88) {
      return [
        "Ganar la liga nacional",
        "Llegar a semifinales de Champions",
        "Fichar una estrella mundial",
      ];
    }
    return ["Competir por el título", "Clasificarse para Champions", "Consolidar proyecto ganador"];
  }

  if (category === "Aspirante" || category === "Media tabla") {
    if (overall >= 75) {
      return [
        "Clasificarse para competiciones europeas",
        "Desarrollar jóvenes talentos",
        "Mantener beneficios económicos",
      ];
    }
    return [
      "Conseguir un top 6 en la liga",
      "Construir cantera de futuros cracks",
      "Equilibrio financiero",
    ];
  }

  // Modesto / Humilde
  return ["Evitar el descenso", "Descubrir talentos desapercibidos", "Crecer económicamente"];
}

/**
 * Estima los datos financieros de un equipo.
 * Retorna: presupuesto inicial, valor estimado de plantilla, ingresos anuales.
 */
export function estimateTeamFinancials(team: Team): {
  budget: number; // en millones €
  value: number; // valor plantilla en millones €
  income: number; // ingresos estimados en millones €
} {
  const overall = Math.round((team.att + team.mid + team.def) / 3);
  const budget = team.budget || calculateTeamBudget(overall);

  // Valor de plantilla: aproximadamente 1.5-2x el presupuesto, depende del overall
  const valueMultiplier = 1.5 + (overall - 60) / 100; // Escala 1.5x a 2.5x
  const value = Math.round(budget * valueMultiplier);

  // Ingresos: basados en la liga y overall
  const incomeMultiplier = 0.15 + (overall - 60) / 200; // 15% a 35% del presupuesto
  const income = Math.round(budget * incomeMultiplier);

  return { budget, value, income };
}
