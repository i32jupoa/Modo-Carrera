import { BriefcaseBusiness, ChartNoAxesCombined, Trophy } from "lucide-react";
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
    <section className="hero-aaa hero-editorial relative flex min-h-[100svh] items-stretch overflow-hidden">
      {/* Se conserva la imagen original de la portada. */}
      <img
        src={heroStadium}
        alt=""
        aria-hidden
        width={1920}
        height={1088}
        className="absolute inset-0 h-full w-full object-cover opacity-60"
      />
      <div aria-hidden className="hero-image-shade absolute inset-0" />

      <div className="hero-editorial-shell relative z-10 mx-auto flex min-h-[100svh] w-full max-w-[1440px] flex-col px-5 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-8 lg:px-12 lg:pb-8 lg:pt-9">
        <header className="hero-masthead flex items-center justify-between gap-5">
          <div className="hero-brand-lockup flex items-center gap-3">
            <span className="hero-brand-mark grid shrink-0 place-items-center" aria-hidden>
              <Trophy className="h-5 w-5" strokeWidth={1.7} />
            </span>
            <span className="flex flex-col">
              <span className="hero-brand-name">DYNASTY MANAGER</span>
              <span className="hero-brand-caption">FOOTBALL MANAGEMENT</span>
            </span>
          </div>
          <div className="hero-masthead-note hidden items-center gap-3 sm:flex">
            <span className="hero-masthead-rule" />
            <span>EL JUEGO SE DECIDE FUERA DEL CAMPO</span>
          </div>
        </header>

        <main className="hero-main flex flex-1 items-center py-12 sm:py-14 lg:py-16">
          <div className="hero-copy w-full max-w-4xl">
            <div className="hero-kicker flex items-center gap-3">
              <span className="hero-kicker-mark" />
              <span>ELIGE UN CLUB. CONSTRUYE ALGO GRANDE.</span>
            </div>

            <h1 className="hero-editorial-title mt-5" aria-label="Dynasty Manager">
              <span>DYNASTY</span>
              <span className="hero-title-second-line">MANAGER</span>
            </h1>

            <p className="hero-lede mt-6 max-w-2xl">
              No se trata solo de ganar el domingo. Se trata de construir un equipo que deje huella.
            </p>
            <p className="hero-description mt-3 max-w-xl">
              Negocia fichajes, descubre talento y toma las decisiones que marcarán el futuro de tu club.
              Cada temporada empieza una nueva historia.
            </p>

            <MainActionCards
              savedGamesCount={savedGamesCount}
              loading={loading}
              onLoadGame={onLoadGame}
              onNewGame={onNewGame}
            />

            <div className="hero-capabilities mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 sm:gap-x-8">
              <span className="hero-capability"><BriefcaseBusiness aria-hidden className="h-4 w-4" /> Gestión del club</span>
              <span className="hero-capability"><ChartNoAxesCombined aria-hidden className="h-4 w-4" /> Mercado y cantera</span>
              <span className="hero-capability"><Trophy aria-hidden className="h-4 w-4" /> Lucha por los títulos</span>
            </div>
          </div>
        </main>

        <footer className="hero-footer flex flex-wrap items-center justify-between gap-3 pt-4">
          <span>72 LIGAS <i /> MÁS DE 1.500 JUGADORES</span>
          <span className="hero-footer-signoff">TU CLUB. TUS DECISIONES. TU LEGADO.</span>
        </footer>
      </div>
    </section>
  );
}
