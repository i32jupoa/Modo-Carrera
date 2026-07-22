import React, { useState, useMemo } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import { LEAGUES_BY_COUNTRY } from "@/data/teams";
import { CountryFlag, getFlagUrl } from "@/components/CountryFlag";

// Public CDN topojson (world atlas, 110m). Bundled by react-simple-maps via fetch.
const GEO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Geographical centroids [lon, lat] for the countries we support.
const COUNTRY_COORDS: Record<string, [number, number]> = {
  "España":         [-3.7, 40.4],
  "Inglaterra":     [-1.5, 52.5],
  "Escocia":        [-4.2, 56.5],
  "Francia":        [2.2, 46.6],
  "Italia":         [12.5, 41.9],
  "Alemania":       [10.5, 51.2],
  "Portugal":       [-8.2, 39.4],
  "Países Bajos":   [5.3, 52.1],
  "Bélgica":        [4.7, 50.5],
  "Turquía":        [35.2, 39.0],
  "EE.UU.":         [-98.6, 39.8],
  "Argentina":      [-63.6, -38.4],
  "Rumanía":        [25.0, 45.9],
  "Polonia":        [19.1, 51.9],
  "Suiza":          [8.2, 46.8],
  "Dinamarca":      [9.5, 56.0],
  "Suecia":         [15.0, 62.0],
  "Noruega":        [8.5, 60.5],
  "Arabia Saudí":   [45.0, 23.9],
  "Austria":        [14.6, 47.5],
  "México":         [-102.5, 23.6],
  "Brasil":         [-51.9, -14.2],
  "Japón":          [138.3, 36.2],
  "Corea del Sur":  [127.8, 35.9],
  "Australia":      [134.5, -25.3],
};

type Region = "all" | "europe" | "northam" | "southam" | "asia" | "oceania";

const REGIONS: { id: Region; label: string; center: [number, number]; zoom: number }[] = [
  { id: "all",     label: "Todo el mundo",  center: [10, 25],   zoom: 1.05 },
  { id: "europe",  label: "Europa",         center: [15, 50],   zoom: 4.0  },
  { id: "northam", label: "Norteamérica",   center: [-95, 38],  zoom: 2.4  },
  { id: "southam", label: "Sudamérica",     center: [-58, -20], zoom: 2.2  },
  { id: "asia",    label: "Asia",           center: [100, 35],  zoom: 2.0  },
  { id: "oceania", label: "Oceanía",        center: [140, -25], zoom: 2.6  },
];

function inRegion(country: string, region: Region): boolean {
  if (region === "all") return true;
  const c = COUNTRY_COORDS[country];
  if (!c) return false;
  const [lon, lat] = c;
  switch (region) {
    case "europe":  return lon >= -12 && lon <= 45  && lat >= 35  && lat <= 72;
    case "northam": return lon >= -170 && lon <= -50 && lat >= 12 && lat <= 75;
    case "southam": return lon >= -90 && lon <= -30 && lat >= -56 && lat <= 12;
    case "asia":    return (lon >= 45 && lon <= 150) && (lat >= -10 && lat <= 60);
    case "oceania": return lon >= 110 && lon <= 180 && lat >= -50 && lat <= 0;
  }
}

export default function WorldMap({
  onPickCountry,
  selectedCountry,
}: {
  onPickCountry: (c: string) => void;
  selectedCountry: string | null;
}) {
  const countries = Object.keys(LEAGUES_BY_COUNTRY);
  const [region, setRegion] = useState<Region>("all");
  const currentRegion = REGIONS.find((r) => r.id === region)!;

  return (
    <div className="world-map-wrapper relative w-full rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-950/90 to-black">
      {/* Region selector */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center justify-center gap-1.5 p-1 rounded-full bg-black/60 backdrop-blur-xl border border-white/10">
        {REGIONS.map((r) => (
          <button
            key={r.id}
            onClick={() => setRegion(r.id)}
            className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider transition ${
              region === r.id
                ? "bg-primary text-white shadow"
                : "text-white/65 hover:text-white hover:bg-white/10"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
        <ComposableMap
          projection="geoEqualEarth"
          projectionConfig={{ scale: 175 }}
          style={{ width: "100%", height: "100%" }}
        >
          <defs>
            <radialGradient id="seaGlow" cx="50%" cy="50%" r="65%">
              <stop offset="0%" stopColor="hsl(220 50% 25%)" stopOpacity={0.5} />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>
          <rect x={-1000} y={-1000} width={3000} height={3000} fill="url(#seaGlow)" />

          <ZoomableGroup
            center={currentRegion.center}
            zoom={currentRegion.zoom}
            minZoom={0.8}
            maxZoom={8}
          >
            <Geographies geography={GEO_URL}>
              {({ geographies }: { geographies: any[] }) =>
                geographies.map((geo: any) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    style={{
                      default: {
                        fill: "rgba(255,255,255,0.07)",
                        stroke: "rgba(255,255,255,0.18)",
                        strokeWidth: 0.4,
                        outline: "none",
                      },
                      hover: {
                        fill: "rgba(255,255,255,0.12)",
                        stroke: "rgba(255,255,255,0.3)",
                        outline: "none",
                      },
                      pressed: { outline: "none" },
                    }}
                  />
                ))
              }
            </Geographies>

            {countries.map((country) => {
              const c = COUNTRY_COORDS[country];
              if (!c) return null;
              const isSelected = selectedCountry === country;
              const isInRegion = inRegion(country, region);
              const leagueCount = LEAGUES_BY_COUNTRY[country]?.length ?? 0;
              const size = isSelected ? 8 : 6;
              return (
                <Marker key={country} coordinates={c}>
                  <g
                    style={{
                      cursor: "pointer",
                      opacity: isInRegion ? 1 : 0.25,
                      transition: "opacity 0.4s",
                    }}
                    onClick={() => onPickCountry(country)}
                  >
                    <defs>
                      <clipPath id={`flag-clip-${country}`}>
                        <circle r={size / 2} />
                      </clipPath>
                    </defs>
                    <circle
                      r={size / 2 + 1}
                      fill={isSelected ? "hsl(var(--primary))" : "rgba(0,0,0,0.5)"}
                      stroke={isSelected ? "#fff" : "rgba(255,255,255,0.7)"}
                      strokeWidth={isSelected ? 1.2 : 0.6}
                    />
                    <image
                      href={getFlagUrl(country)}
                      x={-size / 2}
                      y={-size / 2}
                      width={size}
                      height={size}
                      preserveAspectRatio="xMidYMid slice"
                      clipPath={`url(#flag-clip-${country})`}
                    />
                    {isSelected && (
                      <circle r={5} fill="hsl(var(--primary))" fillOpacity={0.25}>
                        <animate
                          attributeName="r"
                          values="6;14;6"
                          dur="1.8s"
                          repeatCount="indefinite"
                        />
                        <animate
                          attributeName="opacity"
                          values="0.6;0;0.6"
                          dur="1.8s"
                          repeatCount="indefinite"
                        />
                      </circle>
                    )}
                    <title>
                      {country} · {leagueCount} ligas
                    </title>
                  </g>
                </Marker>
              );
            })}
          </ZoomableGroup>
        </ComposableMap>
      </div>

      {/* Country chip grid below the map for quick access (only those in region) */}
      <div className="px-3 pb-3 pt-1">
        <div
          key={region}
          className="flex flex-wrap items-center justify-center gap-1.5 animate-fade-in"
        >
          {countries
            .filter((c) => inRegion(c, region))
            .sort()
            .map((country) => {
              const isSelected = selectedCountry === country;
              return (
                <button
                  key={country}
                  onClick={() => onPickCountry(country)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border transition ${
                    isSelected
                      ? "bg-primary/20 border-primary/60 text-white"
                      : "bg-white/[0.04] border-white/10 text-white/70 hover:border-white/30"
                  }`}
                >
                  <CountryFlag country={country} />
                  <span>{country}</span>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
