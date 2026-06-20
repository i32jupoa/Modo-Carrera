import React, { useEffect, useMemo, useState } from "react";
import { LEAGUES_BY_COUNTRY, LEAGUES, getAllTeams, teamsByLeague, overall, LeagueId } from "@/data/teams";
import { LeagueLogo } from "@/components/LeagueLogo";
import { CountryFlag } from "@/components/CountryFlag";
import WorldMap from "./WorldMap";
import ClubCardPremium from "./ClubCardPremium";
import RandomPickModal from "./RandomPickModal";
import { ArrowLeft, ArrowRight, Dice5, Globe2, Trophy, Sparkles } from "lucide-react";

type Step = "intro" | "country" | "league" | "team";

export default function MainMenuWizard({
  onPickTeam,
  onQuickStart,
  loading,
}: {
  onPickTeam: (id: string) => void;
  /** @deprecated kept for backwards compat — no longer used directly */
  onQuickStart?: () => void;
  loading: boolean;
}) {
  const [step, setStep] = useState<Step>("intro");
  const [country, setCountry] = useState<string | null>(null);
  const [league, setLeague] = useState<LeagueId | null>(null);
  const [randomOpen, setRandomOpen] = useState(false);

  // Persistencia de progreso
  useEffect(() => {
    try {
      const raw = localStorage.getItem("dynasty:wizard");
      if (raw) {
        const v = JSON.parse(raw);
        if (v.country) setCountry(v.country);
        if (v.league) setLeague(v.league);
        if (v.step) setStep(v.step);
      }
    } catch {}
  }, []);
  useEffect(() => {
    localStorage.setItem("dynasty:wizard", JSON.stringify({ step, country, league }));
  }, [step, country, league]);

  const leagues = country ? LEAGUES_BY_COUNTRY[country] || [] : [];
  const teams = useMemo(() => league ? teamsByLeague(league).slice().sort((a, b) => overall(b) - overall(a)) : [], [league]);

  const stepIndex = { intro: 0, country: 1, league: 2, team: 3 }[step];
  const steps = ["Inicio", "País", "Liga", "Equipo"];

  function goNext() {
    if (step === "intro") setStep("country");
    else if (step === "country" && country) setStep("league");
    else if (step === "league" && league) setStep("team");
  }
  function goBack() {
    if (step === "country") setStep("intro");
    else if (step === "league") setStep("country");
    else if (step === "team") setStep("league");
  }

  return (
    <div className="relative">
      {/* Stepper */}
      <div className="sticky top-0 z-30 backdrop-blur-xl bg-black/40 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3">
          <button
            onClick={goBack}
            disabled={step === "intro"}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white/80 border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Atrás
          </button>
          <div className="flex-1 flex items-center justify-center gap-2">
            {steps.map((label, i) => (
              <React.Fragment key={label}>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition ${
                  i === stepIndex ? "bg-primary/20 text-primary border border-primary/40"
                  : i < stepIndex ? "bg-white/10 text-white/80" : "bg-white/[0.03] text-white/40"
                }`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${i === stepIndex ? "bg-primary text-white" : i < stepIndex ? "bg-white/20 text-white" : "bg-white/10 text-white/50"}`}>
                    {i < stepIndex ? "✓" : i + 1}
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                </div>
                {i < steps.length - 1 && <div className={`h-px w-4 sm:w-8 ${i < stepIndex ? "bg-primary/60" : "bg-white/10"}`} />}
              </React.Fragment>
            ))}
          </div>
          <button
            onClick={() => setRandomOpen(true)}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:brightness-110 transition shadow-lg shadow-orange-500/30"
            title="Escoge una dificultad y deja que el destino elija tu club"
          >
            <Dice5 className="h-3.5 w-3.5" /> Elección aleatoria
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 min-h-[60vh]">
          {step === "intro" && (
            <div key="intro" className="animate-fade-in">
              <IntroStep onStart={() => setStep("country")} onRandom={() => setRandomOpen(true)} loading={loading} />
            </div>
          )}

          {step === "country" && (
            <div key="country" className="animate-slide-in">
              <SectionHeader icon={<Globe2 className="h-5 w-5" />} title="Elige un país" subtitle="Selecciona la nación donde quieres iniciar tu carrera" />
              <WorldMap selectedCountry={country} onPickCountry={(c) => { setCountry(c); setLeague(null); }} />
              {country && (
                <div className="mt-8 flex justify-end">
                  <button onClick={goNext} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-black hover:brightness-125 transition shadow-lg shadow-primary/40">
                    Continuar a ligas <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {step === "league" && country && (
            <div key="league" className="animate-slide-in">
              <SectionHeader icon={<Trophy className="h-5 w-5" />} title={`Ligas de ${country}`} subtitle="Elige la competición donde competirás" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {leagues.map((lg) => {
                  const lgTeams = teamsByLeague(lg.id as LeagueId);
                  const isSel = league === lg.id;
                  return (
                    <button
                      key={lg.id}
                      onClick={() => setLeague(lg.id as LeagueId)}
                      className={`flex items-center gap-3 p-4 rounded-xl border text-left transition ${
                        isSel ? "border-primary bg-primary/15 shadow-lg shadow-primary/30" : "border-white/10 bg-white/[0.04] hover:border-white/30"
                      }`}
                    >
                      <LeagueLogo league={lg.name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-white truncate">{lg.name}</div>
                        <div className="text-xs text-white/50">{lgTeams.length} equipos</div>
                      </div>
                      {isSel && <span className="text-primary text-xs font-bold">SELECCIONADA</span>}
                    </button>
                  );
                })}
              </div>
              {league && (
                <div className="mt-8 flex justify-end">
                  <button onClick={goNext} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-black hover:brightness-125 transition shadow-lg shadow-primary/40">
                    Ver equipos <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {step === "team" && league && (
            <div key="team" className="animate-slide-in">
              <SectionHeader
                icon={<Sparkles className="h-5 w-5" />}
                title={LEAGUES[league]?.name ?? "Equipos"}
                subtitle={`${teams.length} clubes · haz clic en uno para ver su proyecto`}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {teams.map((t) => {
                  const topPlayer = t.stars && t.stars.length > 0 ? t.stars[0] : undefined;
                  const topRating = Math.max(t.att || 0, t.mid || 0, t.def || 0);
                  return (
                    <ClubCardPremium
                      key={t.id}
                      team={{ ...t, topPlayer, topRating }}
                      onPreview={(id: string) => onPickTeam(id)}
                      disabled={loading}
                    />
                  );
                })}
              </div>
            </div>
          )}
      </div>

      <RandomPickModal
        open={randomOpen}
        onOpenChange={setRandomOpen}
        onPickTeam={onPickTeam}
      />
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 text-primary text-xs uppercase tracking-[0.25em] font-bold mb-2">
        {icon}<span>Paso</span>
      </div>
      <h2 className="text-3xl md:text-4xl font-black text-white">{title}</h2>
      <p className="text-sm text-white/60 mt-1">{subtitle}</p>
    </div>
  );
}

function IntroStep({ onStart, onRandom, loading }: { onStart: () => void; onRandom: () => void; loading: boolean }) {
  return (
    <div className="text-center py-12">
      <div
        className="inline-block mb-6 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs uppercase tracking-[0.3em] text-white/70 font-bold animate-fade-in"
      >
        Nueva carrera
      </div>
      <h2 className="text-4xl md:text-6xl font-black text-white mb-4 leading-tight">
        ¿Por dónde<br/>quieres empezar?
      </h2>
      <p className="text-white/60 max-w-xl mx-auto mb-10">
        Construye tu dinastía desde cero. Elige cuidadosamente tu club o deja que el destino lo decida con Elección aleatoria.
      </p>
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <button
          onClick={onStart}
          className="flex items-center gap-2 px-7 py-3.5 rounded-xl bg-primary text-white font-black hover:brightness-125 transition shadow-lg shadow-primary/40"
        >
          <Globe2 className="h-5 w-5" /> Empezar guiado
        </button>
        <button
          onClick={onRandom}
          disabled={loading}
          className="flex items-center gap-2 px-7 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black hover:brightness-110 transition shadow-lg shadow-orange-500/40 disabled:opacity-60"
        >
          <Dice5 className="h-5 w-5" /> Elección aleatoria
        </button>
      </div>
    </div>
  );
}
