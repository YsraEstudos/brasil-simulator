/**
 * Tempo máximo contado entre duas atividades, em ms. Um intervalo maior é tratado como pausa (jogador parado com o app
 * aberto): só conta até aqui, para o contador não inflar com o app esquecido em primeiro plano.
 */
export const PLAY_IDLE_LIMIT_MS = 5 * 60 * 1000;

/**
 * Contador de tempo de jogo (PLANO_MENU_SAVES_CONFIG.md, Fase M2). Função pura: quem chama passa o `now` em ms (a
 * camada de interface usa `Date.now()`), então o contador não depende de relógio nem de React.
 */
export interface PlayTimeTracker {
  /** Marca o início de um período de jogo sem somar nada (app voltou ao primeiro plano). */
  resume(now: number): void;
  /**
   * Registra atividade: soma o tempo desde a última marca (no máximo `PLAY_IDLE_LIMIT_MS`) e atualiza a marca. Se o
   * contador estava parado, só começa a contar a partir de `now`.
   */
  activity(now: number): void;
  /** Soma como `activity` e para (app foi para segundo plano). Sem `resume` antes, não soma nada. */
  pause(now: number): void;
  /** Devolve o acumulado em ms inteiros e zera o contador. */
  take(): number;
}

export function createPlayTimeTracker(): PlayTimeTracker {
  let accumulated = 0;
  /** Última marca do período em curso; `null` = parado. */
  let last: number | null = null;

  /** Soma o trecho desde a última marca e move a marca para `now`. Relógio que voltou não soma nada. */
  const advance = (now: number) => {
    if (last === null || !Number.isFinite(now)) return;
    const elapsed = now - last;
    if (elapsed > 0) accumulated += Math.min(elapsed, PLAY_IDLE_LIMIT_MS);
    last = now;
  };

  return {
    resume(now) {
      advance(now);
      if (Number.isFinite(now)) last = now;
    },
    activity(now) {
      if (last === null) {
        if (Number.isFinite(now)) last = now;
        return;
      }
      advance(now);
    },
    pause(now) {
      advance(now);
      last = null;
    },
    take() {
      const total = Math.round(accumulated);
      accumulated = 0;
      return total;
    },
  };
}
