import React from "react";
import { motion } from "framer-motion";
import { Globe, Users, TrendingUp, Wallet, Cpu } from "lucide-react";
import MainActionCards from "./MainActionCards";

export default function HeroAAA({ hasSave, resetGame, loading }: { hasSave: boolean; resetGame: () => void; loading: boolean; }) {
  return (
    <section className="hero-aaa relative flex items-center justify-center">
      <div className="hero-ambient-light bg-primary" style={{ top: "10%", left: "10%" }} />
      <div className="hero-ambient-light bg-accent" style={{ bottom: "20%", right: "15%" }} />

      <div className="relative z-10 text-center px-6 max-w-7xl mx-auto">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
          <div className="relative mb-10">
            <div className="absolute inset-0 blur-3xl opacity-30 bg-primary/20 rounded-full scale-150" />

            <div className="relative">
              <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-xl mb-8">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />

                <span className="text-xs uppercase tracking-[0.25em] text-white/70 font-semibold">Football Universe Simulation</span>
              </div>

              <h1 className="hero-title-aaa mb-6">DYNASTY<br/>MANAGER</h1>

              <p className="hero-subtitle-aaa max-w-3xl mx-auto">Construye una dinastía. Toma cada decisión. Domina el fútbol mundial.</p>

              <p className="mt-4 text-sm text-white/60 max-w-2xl mx-auto">Modo Carrera: Gestiona tácticas, fichajes, desarrollo juvenil y finanzas para convertirte en la referencia global del fútbol. Cada temporada, cada decisión, cada fichaje cuenta.</p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-6 mb-12">
            <div className="h-px w-32 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

            <motion.div className="w-12 h-12 rounded-full bg-white/5 border border-white/8 animate-float" animate={{ y: [-6, 6, -6] }} transition={{ duration: 4, repeat: Infinity }} />

            <div className="h-px w-32 bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto mt-14">
            {[{ title: "Mercado dinámico", desc: "Negociaciones vivas", Icon: Wallet }, { title: "IA avanzada", desc: "Clubes con identidad", Icon: Cpu }, { title: "Historias emergentes", desc: "Historias únicas", Icon: Globe }, { title: "Simulación profunda", desc: "Cada decisión importa", Icon: TrendingUp }].map((item, idx) => (
              <motion.div key={item.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.08, duration: 0.35 }} className="feature-card-aaa">
                <div className="text-3xl mb-4"><item.Icon className="h-7 w-7" /></div>
                <div className="text-lg font-black mb-1">{item.title}</div>
                <div className="text-sm text-white/60">{item.desc}</div>
              </motion.div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-4 flex-wrap mt-12 mb-12">
            <div className="hero-stat-badge">
              <div className="flex items-center gap-2 mb-1"><Globe className="h-4 w-4 text-primary" /><span className="text-xs uppercase tracking-wider text-muted-foreground">Ligas</span></div>
              <div className="text-2xl font-black text-primary">72</div>
            </div>

            <div className="hero-stat-badge">
              <div className="flex items-center gap-2 mb-1"><Users className="h-4 w-4 text-accent" /><span className="text-xs uppercase tracking-wider text-muted-foreground">Jugadores</span></div>
              <div className="text-2xl font-black text-accent">1500+</div>
            </div>

            <div className="hero-stat-badge">
              <div className="flex items-center gap-2 mb-1"><TrendingUp className="h-4 w-4 text-primary" /><span className="text-xs uppercase tracking-wider text-muted-foreground">Simulación</span></div>
              <div className="text-2xl font-black text-primary">Profunda</div>
            </div>

            <div className="hero-stat-badge">
              <div className="flex items-center gap-2 mb-1"><Wallet className="h-4 w-4 text-accent" /><span className="text-xs uppercase tracking-wider text-muted-foreground">Mercado</span></div>
              <div className="text-2xl font-black text-accent">Dinámico</div>
            </div>
          </div>

          <MainActionCards hasSave={hasSave} resetGame={resetGame} loading={loading} />
        </motion.div>
      </div>
    </section>
  );
}
