import { describe, expect, it } from 'vitest';

import { createPlayTimeTracker, PLAY_IDLE_LIMIT_MS } from './playTime';

describe('contador de tempo de jogo (PLANO_MENU_SAVES_CONFIG.md, Fase M2)', () => {
  it('soma os segmentos entre atividades enquanto está rodando', () => {
    const t = createPlayTimeTracker();
    t.resume(0);
    t.activity(1000);
    t.activity(3000);
    t.pause(4000);
    expect(t.take()).toBe(4000);
  });

  it('um intervalo longo sem atividade conta no máximo o limite', () => {
    const t = createPlayTimeTracker();
    expect(PLAY_IDLE_LIMIT_MS).toBe(5 * 60 * 1000);
    t.resume(0);
    t.activity(10_000_000);
    expect(t.take()).toBe(PLAY_IDLE_LIMIT_MS);
    t.activity(10_001_000);
    expect(t.take()).toBe(1000);
  });

  it('pausa: o tempo parado não conta, e a retomada não soma o intervalo', () => {
    const t = createPlayTimeTracker();
    t.resume(0);
    t.activity(1000);
    t.pause(2000);
    t.resume(60_000); // o intervalo parado (2 s a 60 s) não entra na soma
    t.activity(61_000);
    expect(t.take()).toBe(3000);
  });

  it('pause sem resume não soma nada; activity sem resume só começa a contar', () => {
    const t = createPlayTimeTracker();
    t.pause(1000);
    expect(t.take()).toBe(0);
    t.activity(2000);
    expect(t.take()).toBe(0);
    t.activity(3000);
    expect(t.take()).toBe(1000);
  });

  it('take devolve o acumulado e zera', () => {
    const t = createPlayTimeTracker();
    t.resume(0);
    t.activity(500);
    expect(t.take()).toBe(500);
    expect(t.take()).toBe(0);
    t.activity(1500);
    expect(t.take()).toBe(1000);
  });

  it('relógio que voltou (now menor que a última marca) não soma negativo e recomeça dali', () => {
    const t = createPlayTimeTracker();
    t.resume(5000);
    t.activity(1000);
    expect(t.take()).toBe(0);
    t.activity(2000);
    expect(t.take()).toBe(1000);
  });

  it('valores não finitos são ignorados sem estragar a contagem', () => {
    const t = createPlayTimeTracker();
    t.resume(0);
    t.activity(NaN);
    t.activity(500);
    expect(t.take()).toBe(500);
  });

  it('devolve inteiro em ms', () => {
    const t = createPlayTimeTracker();
    t.resume(0);
    t.activity(1000.4);
    expect(t.take()).toBe(1000);
  });
});
