import type { UtcClock } from './visualClock';

/**
 * Relógio do aparelho em UTC, para a "Hora real" do Sol. É a única leitura de `Date` do relógio visual: o módulo puro
 * (`visualClock.ts`) só recebe números. Chamada só quando um quadro já está sendo desenhado (ou a tela renderiza):
 * nenhum temporizador a usa.
 */
export function deviceUtc(now: Date = new Date()): UtcClock {
  return { hour: now.getUTCHours(), minute: now.getUTCMinutes() + now.getUTCSeconds() / 60 };
}
