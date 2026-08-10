/**
 * Formation Coordinate System
 * 
 * Each formation maps 11 positions to CSS top/left percentages on a portrait-oriented pitch.
 * Coordinates are percentages from top-left (0,0) to bottom-right (100,100).
 * 
 * Pitch orientation: Portrait (vertical), goal at top and bottom
 */

import type { PosCode } from "./positions";

export type FormationName =
  | "Táctica 3-1-4-2"
  | "Táctica 3-4-1-2"
  | "Táctica 3-4-2-1"
  | "Táctica 3-4-3"
  | "Táctica 3-5-2"
  | "Táctica 4-1-2-1-2"
  | "Táctica 4-1-3-2"
  | "Táctica 4-1-4-1"
  | "Táctica 4-2-2-2"
  | "Táctica 4-2-3-1 (2)"
  | "Táctica 4-2-3-1 con 3 MCO"
  | "Táctica 4-2-4"
  | "Táctica 4-3-1-2"
  | "Táctica 4-3-2-1"
  | "Táctica 4-3-3"
  | "Táctica 4-3-3 con mediocentro defensivo"
  | "Táctica 4-3-3 con mediocentro ofensivo"
  | "Táctica 4-3-3 con falso 9"
  | "Táctica 4-4-1-1"
  | "Táctica 4-4-2"
  | "Táctica 4-5-1"
  | "Táctica 5-2-1-2"
  | "Táctica 5-2-2-1"
  | "Táctica 5-3-2";

export type PositionRole = "GK" | "DEF" | "MID" | "ATT";

export interface PositionCoordinate {
  top: number;
  left: number;
  role: PositionRole;
}

export interface FormationCoordinates {
  [key: string]: PositionCoordinate;
}

// Formation coordinate mappings
export const FORMATION_COORDINATES: Record<FormationName, FormationCoordinates> = {
  "Táctica 3-1-4-2": {
    gk: { top: 92, left: 50, role: "GK" },
    cb1: { top: 82, left: 30, role: "DEF" },
    cb2: { top: 82, left: 50, role: "DEF" },
    cb3: { top: 82, left: 70, role: "DEF" },
    cdm: { top: 65, left: 50, role: "MID" },
    lm: { top: 45, left: 15, role: "MID" },
    cm1: { top: 50, left: 35, role: "MID" },
    cm2: { top: 50, left: 65, role: "MID" },
    rm: { top: 45, left: 85, role: "MID" },
    st1: { top: 20, left: 40, role: "ATT" },
    st2: { top: 20, left: 60, role: "ATT" },
  },
  "Táctica 3-4-1-2": {
    gk: { top: 92, left: 50, role: "GK" },
    cb1: { top: 82, left: 30, role: "DEF" },
    cb2: { top: 82, left: 50, role: "DEF" },
    cb3: { top: 82, left: 70, role: "DEF" },
    lm: { top: 55, left: 15, role: "MID" },
    cm1: { top: 60, left: 35, role: "MID" },
    cm2: { top: 60, left: 65, role: "MID" },
    rm: { top: 55, left: 85, role: "MID" },
    cam: { top: 40, left: 50, role: "MID" },
    st1: { top: 20, left: 40, role: "ATT" },
    st2: { top: 20, left: 60, role: "ATT" },
  },
  "Táctica 3-4-2-1": {
    gk: { top: 92, left: 50, role: "GK" },
    cb1: { top: 82, left: 30, role: "DEF" },
    cb2: { top: 82, left: 50, role: "DEF" },
    cb3: { top: 82, left: 70, role: "DEF" },
    lm: { top: 55, left: 15, role: "MID" },
    cm1: { top: 60, left: 35, role: "MID" },
    cm2: { top: 60, left: 65, role: "MID" },
    rm: { top: 55, left: 85, role: "MID" },
    cam1: { top: 40, left: 40, role: "MID" },
    cam2: { top: 40, left: 60, role: "MID" },
    st: { top: 18, left: 50, role: "ATT" },
  },
  "Táctica 3-4-3": {
    gk: { top: 92, left: 50, role: "GK" },
    cb1: { top: 82, left: 30, role: "DEF" },
    cb2: { top: 82, left: 50, role: "DEF" },
    cb3: { top: 82, left: 70, role: "DEF" },
    lm: { top: 55, left: 15, role: "MID" },
    cm1: { top: 60, left: 35, role: "MID" },
    cm2: { top: 60, left: 65, role: "MID" },
    rm: { top: 55, left: 85, role: "MID" },
    lw: { top: 25, left: 20, role: "ATT" },
    st: { top: 18, left: 50, role: "ATT" },
    rw: { top: 25, left: 80, role: "ATT" },
  },
  "Táctica 3-5-2": {
    gk: { top: 92, left: 50, role: "GK" },
    cb1: { top: 82, left: 30, role: "DEF" },
    cb2: { top: 82, left: 50, role: "DEF" },
    cb3: { top: 82, left: 70, role: "DEF" },
    lwb: { top: 55, left: 10, role: "MID" },
    cm1: { top: 60, left: 30, role: "MID" },
    cdm: { top: 65, left: 50, role: "MID" },
    cm2: { top: 60, left: 70, role: "MID" },
    rwb: { top: 55, left: 90, role: "MID" },
    st1: { top: 20, left: 40, role: "ATT" },
    st2: { top: 20, left: 60, role: "ATT" },
  },
  "Táctica 4-1-2-1-2": {
    gk: { top: 92, left: 50, role: "GK" },
    lb: { top: 78, left: 15, role: "DEF" },
    cb1: { top: 82, left: 35, role: "DEF" },
    cb2: { top: 82, left: 65, role: "DEF" },
    rb: { top: 78, left: 85, role: "DEF" },
    cdm: { top: 65, left: 50, role: "MID" },
    cm1: { top: 50, left: 35, role: "MID" },
    cm2: { top: 50, left: 65, role: "MID" },
    cam: { top: 38, left: 50, role: "MID" },
    st1: { top: 18, left: 40, role: "ATT" },
    st2: { top: 18, left: 60, role: "ATT" },
  },
  "Táctica 4-1-3-2": {
    gk: { top: 92, left: 50, role: "GK" },
    lb: { top: 78, left: 15, role: "DEF" },
    cb1: { top: 82, left: 35, role: "DEF" },
    cb2: { top: 82, left: 65, role: "DEF" },
    rb: { top: 78, left: 85, role: "DEF" },
    cdm: { top: 65, left: 50, role: "MID" },
    lm: { top: 48, left: 15, role: "MID" },
    cam: { top: 42, left: 50, role: "MID" },
    rm: { top: 48, left: 85, role: "MID" },
    st1: { top: 18, left: 40, role: "ATT" },
    st2: { top: 18, left: 60, role: "ATT" },
  },
  "Táctica 4-1-4-1": {
    gk: { top: 92, left: 50, role: "GK" },
    lb: { top: 78, left: 15, role: "DEF" },
    cb1: { top: 82, left: 35, role: "DEF" },
    cb2: { top: 82, left: 65, role: "DEF" },
    rb: { top: 78, left: 85, role: "DEF" },
    cdm: { top: 65, left: 50, role: "MID" },
    lm: { top: 48, left: 15, role: "MID" },
    cm1: { top: 52, left: 35, role: "MID" },
    cm2: { top: 52, left: 65, role: "MID" },
    rm: { top: 48, left: 85, role: "MID" },
    st: { top: 18, left: 50, role: "ATT" },
  },
  "Táctica 4-2-2-2": {
    gk: { top: 92, left: 50, role: "GK" },
    lb: { top: 78, left: 15, role: "DEF" },
    cb1: { top: 82, left: 35, role: "DEF" },
    cb2: { top: 82, left: 65, role: "DEF" },
    rb: { top: 78, left: 85, role: "DEF" },
    cdm1: { top: 65, left: 35, role: "MID" },
    cdm2: { top: 65, left: 65, role: "MID" },
    lm: { top: 45, left: 15, role: "MID" },
    rm: { top: 45, left: 85, role: "MID" },
    st1: { top: 18, left: 40, role: "ATT" },
    st2: { top: 18, left: 60, role: "ATT" },
  },
  "Táctica 4-2-3-1 (2)": {
    gk: { top: 92, left: 50, role: "GK" },
    lb: { top: 78, left: 15, role: "DEF" },
    cb1: { top: 82, left: 35, role: "DEF" },
    cb2: { top: 82, left: 65, role: "DEF" },
    rb: { top: 78, left: 85, role: "DEF" },
    cdm1: { top: 65, left: 38, role: "MID" },
    cdm2: { top: 65, left: 62, role: "MID" },
    lw: { top: 40, left: 15, role: "ATT" },
    cam: { top: 42, left: 50, role: "MID" },
    rw: { top: 40, left: 85, role: "ATT" },
    st: { top: 18, left: 50, role: "ATT" },
  },
  "Táctica 4-2-3-1 con 3 MCO": {
    gk: { top: 92, left: 50, role: "GK" },
    lb: { top: 78, left: 15, role: "DEF" },
    cb1: { top: 82, left: 35, role: "DEF" },
    cb2: { top: 82, left: 65, role: "DEF" },
    rb: { top: 78, left: 85, role: "DEF" },
    cdm1: { top: 68, left: 35, role: "MID" },
    cdm2: { top: 68, left: 65, role: "MID" },
    cam1: { top: 48, left: 30, role: "MID" },
    cam2: { top: 48, left: 50, role: "MID" },
    cam3: { top: 48, left: 70, role: "MID" },
    st: { top: 18, left: 50, role: "ATT" },
  },
  "Táctica 4-2-4": {
    gk: { top: 92, left: 50, role: "GK" },
    lb: { top: 78, left: 15, role: "DEF" },
    cb1: { top: 82, left: 35, role: "DEF" },
    cb2: { top: 82, left: 65, role: "DEF" },
    rb: { top: 78, left: 85, role: "DEF" },
    cdm1: { top: 65, left: 38, role: "MID" },
    cdm2: { top: 65, left: 62, role: "MID" },
    lw: { top: 35, left: 15, role: "ATT" },
    cf1: { top: 25, left: 35, role: "ATT" },
    cf2: { top: 25, left: 65, role: "ATT" },
    rw: { top: 35, left: 85, role: "ATT" },
  },
  "Táctica 4-3-1-2": {
    gk: { top: 92, left: 50, role: "GK" },
    lb: { top: 78, left: 15, role: "DEF" },
    cb1: { top: 82, left: 35, role: "DEF" },
    cb2: { top: 82, left: 65, role: "DEF" },
    rb: { top: 78, left: 85, role: "DEF" },
    cm1: { top: 60, left: 30, role: "MID" },
    cm2: { top: 60, left: 50, role: "MID" },
    cm3: { top: 60, left: 70, role: "MID" },
    cam: { top: 42, left: 50, role: "MID" },
    st1: { top: 18, left: 40, role: "ATT" },
    st2: { top: 18, left: 60, role: "ATT" },
  },
  "Táctica 4-3-2-1": {
    gk: { top: 92, left: 50, role: "GK" },
    lb: { top: 78, left: 15, role: "DEF" },
    cb1: { top: 82, left: 35, role: "DEF" },
    cb2: { top: 82, left: 65, role: "DEF" },
    rb: { top: 78, left: 85, role: "DEF" },
    cm1: { top: 60, left: 30, role: "MID" },
    cm2: { top: 60, left: 50, role: "MID" },
    cm3: { top: 60, left: 70, role: "MID" },
    cam1: { top: 40, left: 38, role: "MID" },
    cam2: { top: 40, left: 62, role: "MID" },
    st: { top: 18, left: 50, role: "ATT" },
  },
  "Táctica 4-3-3": {
    gk: { top: 92, left: 50, role: "GK" },
    lb: { top: 78, left: 15, role: "DEF" },
    cb1: { top: 82, left: 35, role: "DEF" },
    cb2: { top: 82, left: 65, role: "DEF" },
    rb: { top: 78, left: 85, role: "DEF" },
    cm1: { top: 58, left: 30, role: "MID" },
    cm2: { top: 58, left: 50, role: "MID" },
    cm3: { top: 58, left: 70, role: "MID" },
    lw: { top: 28, left: 15, role: "ATT" },
    st: { top: 18, left: 50, role: "ATT" },
    rw: { top: 28, left: 85, role: "ATT" },
  },
  "Táctica 4-3-3 con mediocentro defensivo": {
    gk: { top: 92, left: 50, role: "GK" },
    lb: { top: 78, left: 15, role: "DEF" },
    cb1: { top: 82, left: 35, role: "DEF" },
    cb2: { top: 82, left: 65, role: "DEF" },
    rb: { top: 78, left: 85, role: "DEF" },
    cdm: { top: 62, left: 50, role: "MID" },
    cm1: { top: 52, left: 30, role: "MID" },
    cm2: { top: 52, left: 70, role: "MID" },
    lw: { top: 28, left: 15, role: "ATT" },
    st: { top: 18, left: 50, role: "ATT" },
    rw: { top: 28, left: 85, role: "ATT" },
  },
  "Táctica 4-3-3 con mediocentro ofensivo": {
    gk: { top: 92, left: 50, role: "GK" },
    lb: { top: 78, left: 15, role: "DEF" },
    cb1: { top: 82, left: 35, role: "DEF" },
    cb2: { top: 82, left: 65, role: "DEF" },
    rb: { top: 78, left: 85, role: "DEF" },
    cm1: { top: 60, left: 30, role: "MID" },
    cm2: { top: 60, left: 70, role: "MID" },
    cam: { top: 42, left: 50, role: "MID" },
    lw: { top: 28, left: 15, role: "ATT" },
    st: { top: 18, left: 50, role: "ATT" },
    rw: { top: 28, left: 85, role: "ATT" },
  },
  "Táctica 4-3-3 con falso 9": {
    gk: { top: 92, left: 50, role: "GK" },
    lb: { top: 78, left: 15, role: "DEF" },
    cb1: { top: 82, left: 35, role: "DEF" },
    cb2: { top: 82, left: 65, role: "DEF" },
    rb: { top: 78, left: 85, role: "DEF" },
    cm1: { top: 52, left: 30, role: "MID" },
    cm2: { top: 52, left: 50, role: "MID" },
    cm3: { top: 52, left: 70, role: "MID" },
    lw: { top: 28, left: 15, role: "ATT" },
    cf: { top: 35, left: 50, role: "ATT" },
    rw: { top: 28, left: 85, role: "ATT" },
  },
  "Táctica 4-4-1-1": {
    gk: { top: 92, left: 50, role: "GK" },
    lb: { top: 75, left: 15, role: "DEF" },
    cb1: { top: 80, left: 35, role: "DEF" },
    cb2: { top: 80, left: 65, role: "DEF" },
    rb: { top: 75, left: 85, role: "DEF" },
    lm: { top: 52, left: 15, role: "MID" },
    cm1: { top: 55, left: 35, role: "MID" },
    cm2: { top: 55, left: 65, role: "MID" },
    rm: { top: 52, left: 85, role: "MID" },
    cam: { top: 38, left: 50, role: "MID" },
    st: { top: 18, left: 50, role: "ATT" },
  },
  "Táctica 4-4-2": {
    gk: { top: 92, left: 50, role: "GK" },
    lb: { top: 75, left: 15, role: "DEF" },
    cb1: { top: 80, left: 35, role: "DEF" },
    cb2: { top: 80, left: 65, role: "DEF" },
    rb: { top: 75, left: 85, role: "DEF" },
    lm: { top: 52, left: 15, role: "MID" },
    cm1: { top: 55, left: 35, role: "MID" },
    cm2: { top: 55, left: 65, role: "MID" },
    rm: { top: 52, left: 85, role: "MID" },
    st1: { top: 18, left: 40, role: "ATT" },
    st2: { top: 18, left: 60, role: "ATT" },
  },
  "Táctica 4-5-1": {
    gk: { top: 92, left: 50, role: "GK" },
    lb: { top: 75, left: 15, role: "DEF" },
    cb1: { top: 80, left: 35, role: "DEF" },
    cb2: { top: 80, left: 65, role: "DEF" },
    rb: { top: 75, left: 85, role: "DEF" },
    lm: { top: 52, left: 10, role: "MID" },
    cm1: { top: 55, left: 30, role: "MID" },
    cdm: { top: 58, left: 50, role: "MID" },
    cm2: { top: 55, left: 70, role: "MID" },
    rm: { top: 52, left: 90, role: "MID" },
    st: { top: 18, left: 50, role: "ATT" },
  },
  "Táctica 5-2-1-2": {
    gk: { top: 92, left: 50, role: "GK" },
    lwb: { top: 78, left: 10, role: "DEF" },
    cb1: { top: 82, left: 30, role: "DEF" },
    cb2: { top: 82, left: 50, role: "DEF" },
    cb3: { top: 82, left: 70, role: "DEF" },
    rwb: { top: 78, left: 90, role: "DEF" },
    cdm1: { top: 65, left: 35, role: "MID" },
    cdm2: { top: 65, left: 65, role: "MID" },
    cam: { top: 45, left: 50, role: "MID" },
    st1: { top: 18, left: 40, role: "ATT" },
    st2: { top: 18, left: 60, role: "ATT" },
  },
  "Táctica 5-2-2-1": {
    gk: { top: 92, left: 50, role: "GK" },
    lwb: { top: 78, left: 10, role: "DEF" },
    cb1: { top: 82, left: 30, role: "DEF" },
    cb2: { top: 82, left: 50, role: "DEF" },
    cb3: { top: 82, left: 70, role: "DEF" },
    rwb: { top: 78, left: 90, role: "DEF" },
    cdm1: { top: 65, left: 35, role: "MID" },
    cdm2: { top: 65, left: 65, role: "MID" },
    cam1: { top: 42, left: 38, role: "MID" },
    cam2: { top: 42, left: 62, role: "MID" },
    st: { top: 18, left: 50, role: "ATT" },
  },
  "Táctica 5-3-2": {
    gk: { top: 92, left: 50, role: "GK" },
    lwb: { top: 78, left: 10, role: "DEF" },
    cb1: { top: 82, left: 30, role: "DEF" },
    cb2: { top: 82, left: 50, role: "DEF" },
    cb3: { top: 82, left: 70, role: "DEF" },
    rwb: { top: 78, left: 90, role: "DEF" },
    cm1: { top: 58, left: 30, role: "MID" },
    cm2: { top: 58, left: 50, role: "MID" },
    cm3: { top: 58, left: 70, role: "MID" },
    st1: { top: 18, left: 40, role: "ATT" },
    st2: { top: 18, left: 60, role: "ATT" },
  },
};

// Get position keys for a formation
export function getFormationPositions(formation: FormationName): string[] {
  return Object.keys(FORMATION_COORDINATES[formation]);
}

/**
 * Demarcación concreta que exige cada hueco del 11 titular
 * (gk, dfc, li, mc, md, ed...). Sustituye al viejo agrupamiento por bloques:
 * el rol ancho (`role`) sólo se usa para pintar/ordenar, nunca para validar.
 */
export function slotPosCode(posKey: string): PosCode {
  const base = posKey.toLowerCase().replace(/\d+$/, "");
  const MAP: Record<string, PosCode> = {
    gk: "GK",
    cb: "DFC",
    lb: "LI",
    rb: "LD",
    lwb: "CAI",
    rwb: "CAD",
    cdm: "MCD",
    cm: "MC",
    cam: "MCO",
    lm: "MI",
    rm: "MD",
    lw: "EI",
    rw: "ED",
    st: "DC",
    cf: "SD",
  };
  return MAP[base] ?? "MC";
}

// Get coordinates for a specific position in a formation
export function getPositionCoordinates(
  formation: FormationName,
  positionKey: string
): PositionCoordinate | undefined {
  return FORMATION_COORDINATES[formation][positionKey];
}

// Get all formations
export const ALL_FORMATIONS: FormationName[] = [
  "Táctica 3-1-4-2",
  "Táctica 3-4-1-2",
  "Táctica 3-4-2-1",
  "Táctica 3-4-3",
  "Táctica 3-5-2",
  "Táctica 4-1-2-1-2",
  "Táctica 4-1-3-2",
  "Táctica 4-1-4-1",
  "Táctica 4-2-2-2",
  "Táctica 4-2-3-1 (2)",
  "Táctica 4-2-3-1 con 3 MCO",
  "Táctica 4-2-4",
  "Táctica 4-3-1-2",
  "Táctica 4-3-2-1",
  "Táctica 4-3-3",
  "Táctica 4-3-3 con mediocentro defensivo",
  "Táctica 4-3-3 con mediocentro ofensivo",
  "Táctica 4-3-3 con falso 9",
  "Táctica 4-4-1-1",
  "Táctica 4-4-2",
  "Táctica 4-5-1",
  "Táctica 5-2-1-2",
  "Táctica 5-2-2-1",
  "Táctica 5-3-2",
];
