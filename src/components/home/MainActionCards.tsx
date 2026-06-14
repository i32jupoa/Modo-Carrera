import React from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { motion } from "framer-motion";

export default function MainActionCards({
  hasSave,
  resetGame,
  loading,
}: {
  hasSave: boolean;
  resetGame: () => void;
  loading: boolean;
}) {
  return (
    <div className="mt-8">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center justify-center gap-6 flex-wrap"
      >
        {hasSave ? (
          <Link to="/season" className="continue-card-aaa group max-w-3xl w-full">
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-700 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10" />

            <div className="relative z-10 flex items-center justify-between gap-8">
              <div>
                <div className="text-xs uppercase tracking-[0.25em] text-white/50 mb-3">Continuar carrera</div>

                <div className="text-4xl font-black mb-2">Tu carrera guardada</div>

                <div className="flex items-center gap-3 text-white/60 text-sm">Última sesión guardada</div>

                <div className="flex gap-2 mt-5">
                  {['W','W','L','D','W'].map((r, i) => (
                    <div key={i} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${r==='W'?'bg-green-500/20 text-green-300': r==='L'? 'bg-red-500/20 text-red-300': 'bg-yellow-500/20 text-yellow-300'}`}>{r}</div>
                  ))}
                </div>
              </div>

              <div className="text-right">
                <div className="text-sm text-white/50 mb-2">Próximo partido</div>
                <div className="text-2xl font-black">Continuar →</div>
              </div>
            </div>
          </Link>
        ) : (
          <div className="continue-card-aaa max-w-3xl w-full p-8 text-center">
            <div className="text-lg font-bold mb-2">No hay ninguna carrera activa.</div>
            <div className="text-sm text-white/60 mb-4">Crea una carrera y empieza a construir tu dinastía.</div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="px-6 py-3 rounded-lg glass text-foreground font-semibold hover:bg-white/10 transition text-lg">Nueva partida</button>
              </AlertDialogTrigger>

              <AlertDialogContent className="glass-dark">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-2xl font-black gradient-text-premium">¿Crear nueva partida?</AlertDialogTitle>
                  <AlertDialogDescription className="text-muted-foreground">Se generará una nueva carrera desde cero.</AlertDialogDescription>
                </AlertDialogHeader>

                <AlertDialogFooter>
                  <AlertDialogCancel className="glass">Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={resetGame} className="button-premium">Crear y empezar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </motion.div>
    </div>
  );
}
