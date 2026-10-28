import React from "react";
import { Globe, Users, TrendingUp, Wallet, Cpu } from "lucide-react";
import MainActionCards from "./MainActionCards";
import heroStadium from "@/assets/hero-stadium.jpg";

export default function HeroAAA({
  savedGamesCount,
  loading,
  onLoadGame,
  onNewGame,
}: {
  savedGamesCount: number;
  loading: boolean;
  onLoadGame: () => void;
  onNewGame: () => void;
}) {
  return (
    <section className="hero-aaa relative flex items-center justify-center overflow-hidden">
      <img src={heroStadium} alt="" aria-hidden width={1920} height={1088} className="absolute inset-0 h-full w-full object-cover opacity-60" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/55 to-background" />
      <div className="hero-ambient-light bg-primary" style={{ top: "10%", left: "10%" }} />
      <div className="hero-ambient-light bg-accent" style={{ bottom: "20%", right: "15%" }} />

      <div className="relative z-10 text-center px-6 max-w-7xl mx-auto">
        <div className="animate-fade-in">
          <div className="relative mb-10">
            <div className="absolute inset-0 blur-3xl opacity-30 bg-primary/20 rounded-full scale-150" />

            <div className="relative">
              <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full border border-border bg-card/50 backdrop-blur-xl mb-8">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />

                <span className="text-xs uppercase tracking-[0.25em] text-foreground/80 font-semibold">
                  Football Universe Simulation
                </span>
              </div>

              <h1 className="hero-title-aaa mb-6">
                DYNASTY
                <br />
                MANAGER
              </h1>

              <div className="flex flex-wrap justify-center gap-2 mb-6">
                {[["Liga","--comp-league"],["Copa","--comp-cup"],["Champions","--comp-ucl"],["Europa League","--comp-uel"],["Conference","--comp-uecl"]].map(([n,c]) => (
                  <span key={n} className="nav-tile !w-auto !h-auto px-3 py-1 text-xs font-bold rounded-full" style={{ ["--tile" as string]: `var(${c})` } as React.CSSProperties}>{n}</span>
                ))}
              </div>
              <p className="hero-subtitle-aaa max-w-3xl mx-auto">
                Construye una dinastía. Toma cada decisión. Domina el fútbol mundial.
              </p>

              <p className="mt-4 text-sm text-muted-foreground max-w-2xl mx-auto">
                Modo Carrera: Gestiona tácticas, fichajes, desarrollo juvenil y finanzas para
                convertirte en la referencia global del fútbol. Cada temporada, cada decisión, cada
                fichaje cuenta.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-6 mb-12">
            <div className="h-px w-32 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

            <div className="w-14 h-14 rounded-full bg-gradient-trophy grid place-items-center text-2xl shadow-lg animate-float" aria-hidden>🏆</div>

            <div className="h-px w-32 bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto mt-14">
            {[
              { title: "Mercado dinámico", desc: "Negociaciones vivas", Icon: Wallet },
              { title: "IA avanzada", desc: "Clubes con identidad", Icon: Cpu },
              { title: "Historias emergentes", desc: "Historias únicas", Icon: Globe },
              { title: "Simulación profunda", desc: "Cada decisión importa", Icon: TrendingUp },
            ].map((item, idx) => (
              <div
                key={item.title}
                className="feature-card-aaa animate-slide-in"
                style={{ animationDelay: `${idx * 0.08}s` }}
              >
                <div className="text-3xl mb-4">
                  <item.Icon className="h-7 w-7" />
                </div>
                <div className="text-lg font-black mb-1">{item.title}</div>
                <div className="text-sm text-muted-foreground">{item.desc}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-4 flex-wrap mt-12 mb-12">
            <div className="hero-stat-badge">
              <div className="flex items-center gap-2 mb-1">
                <Globe className="h-4 w-4 text-primary" />
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  Ligas
                </span>
              </div>
              <div className="text-2xl font-black text-primary">72</div>
            </div>

            <div className="hero-stat-badge">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-accent" />
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  Jugadores
                </span>
              </div>
              <div className="text-2xl font-black text-accent">1500+</div>
            </div>

            <div className="hero-stat-badge">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  Simulación
                </span>
              </div>
              <div className="text-2xl font-black text-primary">Profunda</div>
            </div>

            <div className="hero-stat-badge">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="h-4 w-4 text-accent" />
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  Mercado
                </span>
              </div>
              <div className="text-2xl font-black text-accent">Dinámico</div>
            </div>
          </div>

          <MainActionCards
            savedGamesCount={savedGamesCount}
            loading={loading}
            onLoadGame={onLoadGame}
            onNewGame={onNewGame}
          />
        </div>
      </div>
    </section>
  );
}
