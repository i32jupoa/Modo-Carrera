// @ts-nocheck
import React from "react";
import { LEAGUES_BY_COUNTRY, League } from "@/data/teams";
import { CountryFlag } from "@/components/CountryFlag";
import { LeagueLogo } from "@/components/LeagueLogo";

export default function LeagueExplorerVisual({
  openCountry,
  setOpenCountry,
  setSelectedLeague,
}: {
  openCountry: string | null;
  setOpenCountry: (c: string | null) => void;
  setSelectedLeague: (l: string | null) => void;
}) {
  return (
    <div className="mb-8 space-y-3">
      {Object.entries(LEAGUES_BY_COUNTRY).map(([country, leagues]) => (
        <div key={country} className="country-module-aaa animate-slide-in">
          <button
            onClick={() => setOpenCountry(openCountry === country ? null : country)}
            className="w-full flex items-center justify-between country-header-aaa text-base font-semibold"
          >
            <div className="flex items-center gap-3">
              <CountryFlag country={country} />
              <span className="text-lg">{country}</span>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground">{leagues.length} ligas</span>
              <span className="text-muted-foreground text-lg">
                {openCountry === country ? "▲" : "▼"}
              </span>
            </div>
          </button>

          <AnimatePresence initial={false}>
            {openCountry === country && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="px-6 py-4 bg-secondary/10 border-t border-border/20"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {leagues.map((lg: League) => (
                    <button
                      key={lg.id}
                      onClick={() => setSelectedLeague(lg.id as any)}
                      className="league-button-aaa flex items-center gap-3 text-sm font-semibold hover-glow"
                    >
                      <LeagueLogo league={lg.name} size="sm" />
                      <div className="flex-1 text-left">
                        <div className="font-bold">{lg.name}</div>
                        <div className="text-xs text-white/50">
                          {country} • {lg.teams?.length ?? "—"} equipos
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground">Explorar</div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
