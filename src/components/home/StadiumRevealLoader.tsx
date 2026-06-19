import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";

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
  const color = teamColor || "#6366f1";

  useEffect(() => {
    const t1 = setInterval(() => setPhase((p) => Math.min(PHASES.length - 1, p + 1)), 700);
    const t2 = setInterval(() => setProgress((p) => Math.min(100, p + 2)), 90);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden"
      style={{
        background: `radial-gradient(circle at 50% 60%, ${color}33 0%, #050505 60%)`,
      }}
    >
      {/* Reflectores */}
      <div className="absolute inset-0 pointer-events-none">
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.1, 0.45, 0.1] }}
            transition={{ duration: 2 + i * 0.3, repeat: Infinity, delay: i * 0.2 }}
            className="absolute w-[40vw] h-[80vh] origin-top"
            style={{
              left: `${15 + i * 22}%`,
              top: "-10%",
              background: `linear-gradient(180deg, ${color}66 0%, transparent 70%)`,
              filter: "blur(28px)",
              transform: `rotate(${(i - 1.5) * 8}deg)`,
            }}
          />
        ))}
      </div>

      {/* Estadio SVG */}
      <motion.svg
        viewBox="0 0 400 240"
        className="relative w-[min(90vw,700px)] h-auto drop-shadow-[0_30px_60px_rgba(0,0,0,0.8)]"
        initial={{ y: 40, scale: 0.9, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        transition={{ duration: 0.9, ease: "circOut" }}
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
        <ellipse cx="200" cy="180" rx="140" ry="35" fill="none" stroke="#ffffff" strokeOpacity="0.4" strokeWidth="1" />
        <line x1="200" y1="150" x2="200" y2="210" stroke="#ffffff" strokeOpacity="0.4" />
        <circle cx="200" cy="180" r="14" fill="none" stroke="#ffffff" strokeOpacity="0.4" />
        {/* focos */}
        {[60, 200, 340].map((x, i) => (
          <g key={i}>
            <line x1={x} y1="40" x2={x} y2="110" stroke="#444" strokeWidth="3" />
            <motion.circle
              cx={x}
              cy={40}
              r={8}
              fill="#fff7c4"
              initial={{ opacity: 0.3 }}
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
            />
          </g>
        ))}
      </motion.svg>

      <div className="relative z-10 mt-8 text-center px-6">
        {teamName && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="text-2xl md:text-3xl font-black text-white mb-2"
            style={{ textShadow: `0 0 24px ${color}` }}
          >
            Bienvenido a {teamName}
          </motion.div>
        )}
        <div className="text-sm uppercase tracking-[0.3em] text-white/60 mb-6">
          {PHASES[phase]}
        </div>

        <div className="w-[min(80vw,400px)] h-2 mx-auto rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className="h-full"
            style={{ background: `linear-gradient(90deg, ${color}, #ffffff)` }}
            animate={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-xs text-white/40 mt-3">{progress}%</div>
      </div>
    </motion.div>
  );
}
