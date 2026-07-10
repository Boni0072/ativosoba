import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const playSuccessSound = () => {
  try {
    // Usa Web Audio API para não depender de arquivos externos
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    // Configura um som agradável (tipo "Ding")
    osc.type = "sine";
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // Nota Dó (C5)
    gain.gain.setValueAtTime(0.3, ctx.currentTime); // Volume moderado
    gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.5); // Fade out

    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    
    // Limpeza de recursos (Garbage Collection do AudioContext)
    setTimeout(() => {
      ctx.close();
    }, 600);
  } catch (error) {
    console.warn("Não foi possível tocar o som de notificação:", error);
  }
};

export const playErrorSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    // Configura um som de erro (Sawtooth, mais grave e descendente)
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(150, ctx.currentTime); 
    osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.3); // Pitch cai

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.3);

    osc.start();
    osc.stop(ctx.currentTime + 0.3);
    
    // Limpeza de recursos (Garbage Collection do AudioContext)
    setTimeout(() => {
      ctx.close();
    }, 400);
  } catch (error) {
    console.warn("Não foi possível tocar o som de erro:", error);
  }
};
