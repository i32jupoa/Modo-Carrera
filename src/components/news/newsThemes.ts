import type { NewsTheme } from "@/lib/news/newsEngine";

/** Estilos por temática (clases literales para que Tailwind las detecte). */
export interface NewsThemeStyle {
  label: string;
  emoji: string;
  /** Marco y fondo de la ventana. */
  window: string;
  /** Cabecera con degradado. */
  header: string;
  /** Etiqueta (chip) de la temática. */
  chip: string;
  /** Texto de acento. */
  accent: string;
  /** Borde de los bloques interiores. */
  block: string;
  /** Tarjeta compacta del carrusel. */
  card: string;
  /** Punto/barra de color. */
  bar: string;
}

export const NEWS_THEMES: Record<NewsTheme, NewsThemeStyle> = {
  liga: {
    label: "Liga",
    emoji: "⚽",
    window: "border-emerald-400/40 bg-gradient-to-br from-emerald-950 via-background to-background shadow-[0_0_60px_-15px_rgba(16,185,129,0.45)]",
    header: "bg-gradient-to-r from-emerald-500/30 via-emerald-500/10 to-transparent",
    chip: "bg-emerald-500/15 text-emerald-200 border-emerald-400/40",
    accent: "text-emerald-300",
    block: "border-emerald-400/20 bg-emerald-500/5",
    card: "border-emerald-400/30 hover:border-emerald-300/60 bg-gradient-to-r from-emerald-500/10 to-transparent",
    bar: "bg-emerald-400",
  },
  copa: {
    label: "Copa",
    emoji: "🏆",
    window: "border-amber-400/40 bg-gradient-to-br from-amber-950 via-background to-background shadow-[0_0_60px_-15px_rgba(245,158,11,0.5)]",
    header: "bg-gradient-to-r from-amber-500/35 via-yellow-500/10 to-transparent",
    chip: "bg-amber-500/15 text-amber-200 border-amber-400/40",
    accent: "text-amber-300",
    block: "border-amber-400/20 bg-amber-500/5",
    card: "border-amber-400/30 hover:border-amber-300/60 bg-gradient-to-r from-amber-500/10 to-transparent",
    bar: "bg-amber-400",
  },
  ucl: {
    label: "Champions League",
    emoji: "⭐",
    window: "border-blue-400/40 bg-gradient-to-br from-blue-950 via-background to-background shadow-[0_0_60px_-15px_rgba(37,99,235,0.6)]",
    header: "bg-gradient-to-r from-blue-600/40 via-indigo-500/15 to-transparent",
    chip: "bg-blue-500/15 text-blue-200 border-blue-400/40",
    accent: "text-blue-300",
    block: "border-blue-400/20 bg-blue-500/5",
    card: "border-blue-400/30 hover:border-blue-300/60 bg-gradient-to-r from-blue-500/10 to-transparent",
    bar: "bg-blue-400",
  },
  uel: {
    label: "Europa League",
    emoji: "🟠",
    window: "border-orange-400/40 bg-gradient-to-br from-orange-950 via-background to-background shadow-[0_0_60px_-15px_rgba(249,115,22,0.55)]",
    header: "bg-gradient-to-r from-orange-500/35 via-orange-500/10 to-transparent",
    chip: "bg-orange-500/15 text-orange-200 border-orange-400/40",
    accent: "text-orange-300",
    block: "border-orange-400/20 bg-orange-500/5",
    card: "border-orange-400/30 hover:border-orange-300/60 bg-gradient-to-r from-orange-500/10 to-transparent",
    bar: "bg-orange-400",
  },
  uecl: {
    label: "Conference League",
    emoji: "🟢",
    window: "border-lime-400/40 bg-gradient-to-br from-lime-950 via-background to-background shadow-[0_0_60px_-15px_rgba(132,204,22,0.5)]",
    header: "bg-gradient-to-r from-lime-500/30 via-green-500/10 to-transparent",
    chip: "bg-lime-500/15 text-lime-200 border-lime-400/40",
    accent: "text-lime-300",
    block: "border-lime-400/20 bg-lime-500/5",
    card: "border-lime-400/30 hover:border-lime-300/60 bg-gradient-to-r from-lime-500/10 to-transparent",
    bar: "bg-lime-400",
  },
  fichaje: {
    label: "Fichaje",
    emoji: "💼",
    window: "border-fuchsia-400/40 bg-gradient-to-br from-fuchsia-950 via-background to-background shadow-[0_0_60px_-15px_rgba(217,70,239,0.5)]",
    header: "bg-gradient-to-r from-fuchsia-500/30 via-purple-500/10 to-transparent",
    chip: "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/40",
    accent: "text-fuchsia-300",
    block: "border-fuchsia-400/20 bg-fuchsia-500/5",
    card: "border-fuchsia-400/30 hover:border-fuchsia-300/60 bg-gradient-to-r from-fuchsia-500/10 to-transparent",
    bar: "bg-fuchsia-400",
  },
  cesion: {
    label: "Cesión",
    emoji: "🔄",
    window: "border-cyan-400/40 bg-gradient-to-br from-cyan-950 via-background to-background shadow-[0_0_60px_-15px_rgba(6,182,212,0.5)]",
    header: "bg-gradient-to-r from-cyan-500/30 via-sky-500/10 to-transparent",
    chip: "bg-cyan-500/15 text-cyan-200 border-cyan-400/40",
    accent: "text-cyan-300",
    block: "border-cyan-400/20 bg-cyan-500/5",
    card: "border-cyan-400/30 hover:border-cyan-300/60 bg-gradient-to-r from-cyan-500/10 to-transparent",
    bar: "bg-cyan-400",
  },
  renovacion: {
    label: "Renovación",
    emoji: "🖊️",
    window: "border-teal-400/40 bg-gradient-to-br from-teal-950 via-background to-background shadow-[0_0_60px_-15px_rgba(20,184,166,0.5)]",
    header: "bg-gradient-to-r from-teal-500/30 via-teal-500/10 to-transparent",
    chip: "bg-teal-500/15 text-teal-200 border-teal-400/40",
    accent: "text-teal-300",
    block: "border-teal-400/20 bg-teal-500/5",
    card: "border-teal-400/30 hover:border-teal-300/60 bg-gradient-to-r from-teal-500/10 to-transparent",
    bar: "bg-teal-400",
  },
  lesion: {
    label: "Lesión",
    emoji: "🩹",
    window: "border-red-400/40 bg-gradient-to-br from-red-950 via-background to-background shadow-[0_0_60px_-15px_rgba(239,68,68,0.55)]",
    header: "bg-gradient-to-r from-red-600/35 via-rose-500/10 to-transparent",
    chip: "bg-red-500/15 text-red-200 border-red-400/40",
    accent: "text-red-300",
    block: "border-red-400/20 bg-red-500/5",
    card: "border-red-400/30 hover:border-red-300/60 bg-gradient-to-r from-red-500/10 to-transparent",
    bar: "bg-red-400",
  },
  jugador: {
    label: "Jugadores",
    emoji: "🌟",
    window: "border-pink-400/40 bg-gradient-to-br from-pink-950 via-background to-background shadow-[0_0_60px_-15px_rgba(236,72,153,0.5)]",
    header: "bg-gradient-to-r from-pink-500/30 via-rose-500/10 to-transparent",
    chip: "bg-pink-500/15 text-pink-200 border-pink-400/40",
    accent: "text-pink-300",
    block: "border-pink-400/20 bg-pink-500/5",
    card: "border-pink-400/30 hover:border-pink-300/60 bg-gradient-to-r from-pink-500/10 to-transparent",
    bar: "bg-pink-400",
  },
};
