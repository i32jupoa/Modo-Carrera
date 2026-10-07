/**
 * Utilidades de redacción para las noticias: artículos, apodos de clubes,
 * formato de importes y un RNG sembrado para que cada noticia suene distinta
 * pero siga siendo idéntica al recargar.
 */

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type Rng = () => number;

export function rngFor(seed: string): Rng {
  let a = hashStr(seed);
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: Rng, options: readonly T[]): T {
  return options[Math.floor(rng() * options.length)];
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

// ---------------------------------------------------------------- artículos
const FEMININE = new Set([
  "juventus",
  "roma",
  "lazio",
  "fiorentina",
  "atalanta",
  "sampdoria",
  "real sociedad",
  "cremonese",
  "salernitana",
  "spezia",
  "la real",
  "unión deportiva las palmas",
]);

function isFem(name: string): boolean {
  return FEMININE.has(name.trim().toLowerCase());
}

/** "el Real Madrid" / "la Juventus". */
export function the(name: string): string {
  return `${isFem(name) ? "la" : "el"} ${name}`;
}
export function The(name: string): string {
  return `${isFem(name) ? "La" : "El"} ${name}`;
}
/** "del Real Madrid" / "de la Juventus". */
export function deThe(name: string): string {
  return isFem(name) ? `de la ${name}` : `del ${name}`;
}
/** "al Real Madrid" / "a la Juventus". */
export function aThe(name: string): string {
  return isFem(name) ? `a la ${name}` : `al ${name}`;
}

// ---------------------------------------------------------------- apodos
const NICKNAMES: Array<[RegExp, string[]]> = [
  [/^real madrid/i, ["el conjunto blanco", "los blancos", "el cuadro merengue"]],
  [/^(fc )?barcelona/i, ["el conjunto azulgrana", "el equipo culé", "los azulgranas"]],
  [/atl[eé]tico de madrid|^atl[eé]tico/i, ["los colchoneros", "el conjunto rojiblanco"]],
  [/manchester city/i, ["los citizens", "el conjunto celeste"]],
  [/manchester united/i, ["los diablos rojos", "el conjunto de Old Trafford"]],
  [/^liverpool/i, ["los reds", "el conjunto de Anfield"]],
  [/^arsenal/i, ["los gunners", "el conjunto londinense"]],
  [/^chelsea/i, ["los blues", "el conjunto de Stamford Bridge"]],
  [/tottenham/i, ["los spurs"]],
  [/bayern/i, ["el conjunto bávaro", "el gigante bávaro"]],
  [/dortmund/i, ["el conjunto aurinegro"]],
  [/^juventus/i, ["la Vecchia Signora", "el conjunto bianconero"]],
  [/^(ac )?milan/i, ["el conjunto rossonero"]],
  [/^inter/i, ["el conjunto nerazzurro"]],
  [/napoli|nápoles/i, ["el conjunto partenopeo"]],
  [/paris|psg/i, ["el conjunto parisino"]],
  [/sevilla/i, ["el conjunto hispalense"]],
  [/valencia/i, ["el conjunto ché"]],
  [/athletic/i, ["los leones"]],
  [/villarreal/i, ["el submarino amarillo"]],
  [/betis/i, ["el conjunto verdiblanco"]],
];

/** Nombre del club con artículo, o un apodo si existe (sin artículo extra). */
export function clubRef(name: string, rng: Rng, nicknameChance = 0.35): string {
  if (chance(rng, nicknameChance)) {
    for (const [re, nicks] of NICKNAMES) {
      if (re.test(name)) return pick(rng, nicks);
    }
  }
  return the(name);
}

export function ClubRef(name: string, rng: Rng, nicknameChance = 0.35): string {
  const s = clubRef(name, rng, nicknameChance);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------- formatos
export function formatM(euros: number): string {
  if (euros >= 1_000_000) {
    const m = euros / 1_000_000;
    const txt = m >= 100 ? Math.round(m).toString() : (Math.round(m * 10) / 10).toString().replace(".", ",");
    return `${txt} M€`;
  }
  if (euros >= 1000) return `${Math.round(euros / 1000)} K€`;
  return `${Math.round(euros)} €`;
}

export function ordinalPos(n: number): string {
  return `${n}º`;
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? `${n} ${one}` : `${n} ${many}`;
}

export function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
