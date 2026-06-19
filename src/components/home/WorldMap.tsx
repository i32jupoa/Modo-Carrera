import React from "react";
import { motion } from "framer-motion";
import { LEAGUES_BY_COUNTRY } from "@/data/teams";
import { CountryFlag } from "@/components/CountryFlag";

// Coordenadas aproximadas (x%, y%) sobre un mapa estilizado (no real)
const COUNTRY_COORDS: Record<string, { x: number; y: number }> = {
  "España": { x: 44, y: 55 },
  "Inglaterra": { x: 46, y: 38 },
  "Francia": { x: 48, y: 48 },
  "Italia": { x: 52, y: 55 },
  "Alemania": { x: 52, y: 42 },
  "Portugal": { x: 41, y: 56 },
  "Países Bajos": { x: 50, y: 41 },
  "Bélgica": { x: 49, y: 43 },
  "Turquía": { x: 60, y: 56 },
  "EE.UU.": { x: 20, y: 50 },
  "Argentina": { x: 30, y: 82 },
  "Rumanía": { x: 57, y: 50 },
  "Escocia": { x: 45, y: 32 },
  "Polonia": { x: 56, y: 42 },
  "Suiza": { x: 51, y: 47 },
  "Dinamarca": { x: 52, y: 36 },
  "Suecia": { x: 54, y: 32 },
  "Noruega": { x: 51, y: 30 },
  "Arabia Saudí": { x: 63, y: 62 },
  "Austria": { x: 53, y: 47 },
  "México": { x: 18, y: 60 },
  "Brasil": { x: 32, y: 73 },
  "Japón": { x: 85, y: 52 },
  "Corea del Sur": { x: 83, y: 50 },
  "Australia": { x: 87, y: 80 },
};

export default function WorldMap({
  onPickCountry,
  selectedCountry,
}: {
  onPickCountry: (c: string) => void;
  selectedCountry: string | null;
}) {
  const countries = Object.keys(LEAGUES_BY_COUNTRY);

  return (
    <div className="world-map-wrapper relative w-full rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-br from-slate-900/80 via-slate-950/80 to-black/80">
      {/* Fondo estilizado */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full opacity-30"
        aria-hidden
      >
        <defs>
          <radialGradient id="oceanGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(var(--primary) / 0.4)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <pattern id="dots" width="3" height="3" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="0.3" fill="currentColor" className="text-white/20" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#dots)" />
        <circle cx="50" cy="50" r="40" fill="url(#oceanGlow)" />
      </svg>

      {/* "Continentes" estilizados */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full opacity-20" aria-hidden>
        <path d="M15,40 Q25,30 35,40 L40,55 Q35,65 25,65 L18,55 Z" fill="currentColor" className="text-emerald-500/40" />
        <path d="M42,30 Q55,28 62,35 L65,55 Q55,62 45,60 L42,45 Z" fill="currentColor" className="text-blue-500/40" />
        <path d="M70,40 Q85,38 92,50 L90,70 Q80,75 72,65 Z" fill="currentColor" className="text-purple-500/40" />
        <path d="M25,70 Q35,68 40,78 L35,90 Q28,90 25,82 Z" fill="currentColor" className="text-orange-500/40" />
      </svg>

      <div className="relative w-full" style={{ aspectRatio: "16 / 8" }}>
        {countries.map((country) => {
          const c = COUNTRY_COORDS[country];
          if (!c) return null;
          const isSelected = selectedCountry === country;
          const leagueCount = LEAGUES_BY_COUNTRY[country]?.length ?? 0;
          return (
            <motion.button
              key={country}
              onClick={() => onPickCountry(country)}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              whileHover={{ scale: 1.15, zIndex: 30 }}
              transition={{ type: "spring", stiffness: 280, damping: 18 }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 group flex flex-col items-center gap-1 ${
                isSelected ? "z-20" : "z-10"
              }`}
              style={{ left: `${c.x}%`, top: `${c.y}%` }}
              title={`${country} · ${leagueCount} ligas`}
            >
              <span
                className={`relative flex items-center justify-center w-7 h-7 rounded-full text-base ring-2 transition-all ${
                  isSelected
                    ? "ring-primary bg-primary/30 shadow-[0_0_24px_rgba(99,102,241,0.8)]"
                    : "ring-white/30 bg-white/10 hover:ring-white/60"
                }`}
              >
                <CountryFlag country={country} />
                {isSelected && (
                  <span className="absolute inset-0 rounded-full animate-ping bg-primary/40" />
                )}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-opacity ${
                  isSelected ? "bg-primary text-white opacity-100" : "bg-black/60 text-white/70 opacity-0 group-hover:opacity-100"
                }`}
              >
                {country}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
