import React, { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

// Ambient generador procedural con WebAudio (no requiere assets externos)
function createAmbient(ctx: AudioContext) {
  const master = ctx.createGain();
  master.gain.value = 0.06;
  master.connect(ctx.destination);

  // Pad: dos osciladores
  const o1 = ctx.createOscillator();
  o1.type = "sine";
  o1.frequency.value = 110;
  const o2 = ctx.createOscillator();
  o2.type = "sine";
  o2.frequency.value = 164.81;
  const padGain = ctx.createGain();
  padGain.gain.value = 0.4;
  o1.connect(padGain);
  o2.connect(padGain);
  padGain.connect(master);

  // LFO de volumen para "respiración"
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.08;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.25;
  lfo.connect(lfoGain);
  lfoGain.connect(padGain.gain);

  // Ruido "estadio" filtrado
  const bufferSize = ctx.sampleRate * 2;
  const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 380;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.35;
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(master);

  o1.start();
  o2.start();
  lfo.start();
  noise.start();

  return {
    stop() {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      setTimeout(() => {
        try {
          o1.stop();
          o2.stop();
          lfo.stop();
          noise.stop();
        } catch {}
      }, 600);
    },
  };
}

export default function SoundAmbient() {
  const [on, setOn] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const ambientRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("dynasty:ambient") : null;
    if (saved === "on") setOn(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (on) {
      try {
        if (!ctxRef.current)
          ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (ctxRef.current.state === "suspended") ctxRef.current.resume();
        ambientRef.current = createAmbient(ctxRef.current);
        localStorage.setItem("dynasty:ambient", "on");
      } catch (e) {
        console.warn("AudioContext unavailable", e);
        setOn(false);
      }
    } else {
      ambientRef.current?.stop();
      ambientRef.current = null;
      localStorage.setItem("dynasty:ambient", "off");
    }
    return () => {
      ambientRef.current?.stop();
      ambientRef.current = null;
    };
  }, [on]);

  return (
    <button
      onClick={() => setOn((v) => !v)}
      className="fixed top-5 right-5 z-40 w-11 h-11 rounded-full border border-white/15 bg-black/60 backdrop-blur-xl flex items-center justify-center text-white/80 hover:text-white hover:border-white/40 transition"
      aria-label={on ? "Silenciar ambiente" : "Activar ambiente"}
      title={on ? "Silenciar ambiente sonoro" : "Activar ambiente sonoro"}
    >
      {on ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
    </button>
  );
}
