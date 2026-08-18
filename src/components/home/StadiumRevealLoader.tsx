import React, { useEffect, useState } from "react";

const PHASES = [
  "Encendiendo las luces del estadio…",
  "Preparando el césped…",
  "Ultimando tácticas con el staff…",
  "Calentando a los jugadores…",
  "El árbitro consulta el cronómetro…",
  "¡Saltamos al campo!",
];

export default function StadiumRevealLoader({
  teamName,
  teamColor,
}: {
  teamName?: string;
  teamColor?: string;
}) {
  const [phase, setPhase] = useState(0);
  const [progress, setProgress] = useState(0);
  const [particles, setParticles] = useState<
    Array<{ id: number; x: number; y: number; size: number; delay: number }>
  >([]);
  const color = teamColor || "#6366f1";

  useEffect(() => {
    // Generar partículas
    const newParticles = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 4 + 2,
      delay: Math.random() * 2,
    }));
    setParticles(newParticles);

    const t1 = setInterval(() => setPhase((p) => Math.min(PHASES.length - 1, p + 1)), 700);
    const t2 = setInterval(() => setProgress((p) => Math.min(100, p + 2)), 90);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden animate-fade-in"
      style={{
        background: `radial-gradient(circle at 50% 60%, ${color}33 0%, #050505 60%)`,
      }}
    >
      {/* Partículas flotantes */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full animate-float"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              background: color,
              opacity: 0.3,
              animationDelay: `${p.delay}s`,
              animationDuration: `${3 + p.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Reflectores */}
      <div className="absolute inset-0 pointer-events-none">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="absolute w-[40vw] h-[80vh] origin-top animate-pulse"
            style={{
              left: `${15 + i * 22}%`,
              top: "-10%",
              background: `linear-gradient(180deg, ${color}66 0%, transparent 70%)`,
              filter: "blur(28px)",
              transform: `rotate(${(i - 1.5) * 8}deg)`,
              animationDelay: `${i * 0.2}s`,
              animationDuration: `${2 + i * 0.3}s`,
            }}
          />
        ))}
      </div>

      {/* Estadio SVG */}
      <svg
        viewBox="0 0 400 240"
        className="relative w-[min(90vw,700px)] h-auto drop-shadow-[0_30px_60px_rgba(0,0,0,0.8)] animate-slide-up"
      >
        {/* Césped */}
        <defs>
          <linearGradient id="grass" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#0d3b1f" />
            <stop offset="100%" stopColor="#1c6b35" />
          </linearGradient>
          <linearGradient id="stand" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#1a1a2e" />
            <stop offset="100%" stopColor="#0a0a14" />
          </linearGradient>
          <radialGradient id="spotlight" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* gradas */}
        <ellipse cx="200" cy="170" rx="190" ry="55" fill="url(#stand)" />
        <ellipse cx="200" cy="160" rx="170" ry="40" fill={color} opacity="0.15" />
        {/* asientos con franjas */}
        {Array.from({ length: 14 }).map((_, i) => (
          <rect
            key={i}
            x={20 + i * 26}
            y={130}
            width={16}
            height={40}
            fill={i % 2 ? color : "#222"}
            opacity={0.5}
          />
        ))}
        {/* césped */}
        <ellipse cx="200" cy="180" rx="140" ry="35" fill="url(#grass)" />
        <ellipse
          cx="200"
          cy="180"
          rx="140"
          ry="35"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.4"
          strokeWidth="1"
        />
        <line x1="200" y1="150" x2="200" y2="210" stroke="#ffffff" strokeOpacity="0.4" />
        <circle cx="200" cy="180" r="14" fill="none" stroke="#ffffff" strokeOpacity="0.4" />
        {/* focos con efecto de luz */}
        {[60, 200, 340].map((x, i) => (
          <g key={i}>
            <ellipse
              cx={x}
              cy="110"
              rx="30"
              ry="50"
              fill="url(#spotlight)"
              className="animate-pulse"
              style={{ animationDelay: `${i * 0.3}s` }}
            />
            <line x1={x} y1="40" x2={x} y2="110" stroke="#444" strokeWidth="3" />
            <circle
              cx={x}
              cy={40}
              r={8}
              fill="#fff7c4"
              className="animate-pulse"
              style={{
                animationDelay: `${i * 0.2}s`,
                animationDuration: "1.5s",
              }}
            />
          </g>
        ))}
        {/* Bandera del equipo */}
        <g transform="translate(320, 60)">
          <line x1="0" y1="0" x2="0" y2="50" stroke="#666" strokeWidth="2" />
          <rect
            x="0"
            y="0"
            width="30"
            height="20"
            fill={color}
            className="animate-pulse"
            style={{ animationDuration: "2s" }}
          />
        </g>
      </svg>

      <div className="relative z-10 mt-8 text-center px-6">
        {teamName && (
          <div
            className="text-2xl md:text-3xl font-black text-white mb-2 animate-fade-in"
            style={{ textShadow: `0 0 24px ${color}` }}
          >
            Bienvenido a {teamName}
          </div>
        )}
        <div className="text-sm uppercase tracking-[0.3em] text-white/60 mb-6">{PHASES[phase]}</div>

        <div className="w-[min(80vw,400px)] h-2 mx-auto rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full transition-all duration-300"
            style={{
              background: `linear-gradient(90deg, ${color}, #ffffff)`,
              width: `${progress}%`,
            }}
          />
        </div>
        <div className="text-xs text-white/40 mt-3">{progress}%</div>
      </div>
    </div>
  );
}
