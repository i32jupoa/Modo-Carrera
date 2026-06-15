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
 * Clasifica un equipo como Gigante, Aspirante o Modesto basándose en Overall + Presupuesto.
 */
export function getTeamCategory(team: Team): 'Gigante' | 'Aspirante' | 'Modesto' {
  const overall = Math.round((team.att + team.mid + team.def) / 3);
  const budget = team.budget || calculateTeamBudget(overall);
  
  // Gigante: OVR >= 80 o Presupuesto >= 100M
  if (overall >= 80 || budget >= 100) {
    return 'Gigante';
  }
  
  // Aspirante: OVR 70-79 o Presupuesto 50-99M
  if (overall >= 70 || budget >= 50) {
    return 'Aspirante';
  }
  
  // Modesto: OVR < 70 o Presupuesto < 50M
  return 'Modesto';
}

/**
 * Determina la dificultad del reto basándose en el overall del equipo.
 */
export function getTeamDifficulty(overall: number): 'Fácil' | 'Medio' | 'Difícil' {
  if (overall >= 82) return 'Difícil';
  if (overall >= 72) return 'Medio';
  return 'Fácil';
}

/**
 * Genera objetivos realistas para un equipo según su categoría y overall.
 */
export function getTeamObjectives(overall: number, category: 'Gigante' | 'Aspirante' | 'Modesto'): string[] {
  if (category === 'Gigante') {
    if (overall >= 88) {
      return [
        'Ganar la liga nacional',
        'Llegar a semifinales de Champions',
        'Fichar una estrella mundial'
      ];
    }
    return [
      'Competir por el título',
      'Clasificarse para Champions',
      'Consolidar proyecto ganador'
    ];
  }
  
  if (category === 'Aspirante') {
    if (overall >= 75) {
      return [
        'Clasificarse para competiciones europeas',
        'Desarrollar jóvenes talentos',
        'Mantener beneficios económicos'
      ];
    }
    return [
      'Conseguir un top 6 en la liga',
      'Construir cantera de futuros cracks',
      'Equilibrio financiero'
    ];
  }
  
  // Modesto
  return [
    'Evitar el descenso',
    'Descubrir talentos desapercibidos',
    'Crecer económicamente'
  ];
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
