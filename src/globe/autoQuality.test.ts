import { describe, expect, it } from 'vitest';

import {
  AutoQualityMachine,
  classifyMovingWindow,
  classifyRestWindow,
  MAX_BURST_GAP_MS,
  MOVING_WINDOW_SAMPLES,
  percentile,
  REST_SLOW_P95_MS,
  REST_WINDOW_SAMPLES,
  SETTLE_FRAMES,
  STEP_DOWN_REST_WINDOWS,
  STEP_DOWN_WINDOWS,
  STEP_UP_WINDOWS,
  WARMUP_QUIET_FRAMES,
  windowStats,
  type ProfileChange,
} from './autoQuality';
import type { Profile3d } from './qualityProfiles';

/** Relógio simulado: alimenta quadros com intervalo fixo e junta as trocas de perfil. */
function sim(initial: Profile3d) {
  const machine = new AutoQualityMachine(initial);
  const state = { t: 10_000, changes: [] as ProfileChange[] };
  const frames = (n: number, dt: number, opts: { moving?: boolean; tilesBusy?: boolean } = {}) => {
    for (let i = 0; i < n; i++) {
      state.t += dt;
      const change = machine.feed({ atMs: state.t, moving: opts.moving ?? true, tilesBusy: opts.tilesBusy ?? false });
      if (change) state.changes.push(change);
    }
  };
  /** Quadros de gesto até a máquina sair do aquecimento. */
  const warmUp = () => frames(WARMUP_QUIET_FRAMES, 16);
  /** `windows` janelas de movimento completas, cada uma de `MOVING_WINDOW_SAMPLES` amostras. */
  const movingWindows = (windows: number, dt: number) => frames(windows * MOVING_WINDOW_SAMPLES, dt);
  /** Quadros descartados depois de uma troca de perfil. */
  const settle = () => frames(SETTLE_FRAMES, 16);
  return { machine, state, frames, warmUp, movingWindows, settle };
}

const FAST_DT = 16;
const NEUTRAL_DT = 25; // 40 qps: nem lenta nem rápida
const BAD_DT = 40; // 25 qps: lenta; 50 amostras fecham uma janela de 2 s

describe('estatística da janela', () => {
  it('percentil por posto mais próximo', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 95)).toBe(95);
    expect(percentile([7], 95)).toBe(7);
    expect(windowStats([5, 1, 3, 2, 4])).toEqual({ median: 3, p95: 5 });
  });

  it('classifica movimento: lento, neutro, rápido', () => {
    expect(classifyMovingWindow(Array(60).fill(16))).toBe('fast');
    expect(classifyMovingWindow(Array(60).fill(25))).toBe('neutral');
    expect(classifyMovingWindow(Array(60).fill(40))).toBe('slow');
    // mediana boa mas p95 acima da meta de 50 ms: lenta
    expect(classifyMovingWindow([...Array(50).fill(16), ...Array(10).fill(80)])).toBe('slow');
    // algumas quedas isoladas (3 em 60, abaixo de 5%) não tiram a janela de "rápida"
    expect(classifyMovingWindow([...Array(57).fill(16), 70, 70, 70])).toBe('fast');
  });

  it('repouso só pode ser lento ou neutro', () => {
    expect(classifyRestWindow(Array(20).fill(16))).toBe('neutral');
    expect(classifyRestWindow(Array(20).fill(REST_SLOW_P95_MS + 1))).toBe('slow');
  });
});

describe('aquecimento', () => {
  it('não amostra nada antes de os tiles assentarem: quadros lentos com tile carregando nunca trocam o perfil', () => {
    const s = sim('equilibrado');
    s.frames(2000, 80, { tilesBusy: true });
    expect(s.machine.phase).toBe('warming');
    expect(s.state.changes).toEqual([]);
    expect(s.machine.profile).toBe('equilibrado');
  });

  it('sai do aquecimento após quadros seguidos sem tile carregando; uma carga zera a contagem', () => {
    const s = sim('equilibrado');
    s.frames(WARMUP_QUIET_FRAMES - 1, 16);
    expect(s.machine.phase).toBe('warming');
    s.frames(1, 16, { tilesBusy: true });
    s.frames(WARMUP_QUIET_FRAMES - 1, 16);
    expect(s.machine.phase).toBe('warming');
    s.frames(1, 16);
    expect(s.machine.phase).toBe('sampling');
  });

  it('os quadros lentos do aquecimento não entram nas janelas', () => {
    const s = sim('equilibrado');
    s.frames(WARMUP_QUIET_FRAMES, BAD_DT);
    s.movingWindows(STEP_DOWN_WINDOWS - 1, FAST_DT);
    expect(s.state.changes).toEqual([]);
    expect(s.machine.profile).toBe('equilibrado');
  });
});

describe('descer de perfil', () => {
  it('desce um nível após janelas lentas seguidas, e não antes', () => {
    const s = sim('equilibrado');
    s.warmUp();
    s.frames(50 * STEP_DOWN_WINDOWS - 1, BAD_DT);
    expect(s.state.changes).toEqual([]);
    s.frames(1, BAD_DT);
    expect(s.state.changes).toEqual([{ from: 'equilibrado', to: 'economico-3d', reason: 'movimento-lento' }]);
    expect(s.machine.profile).toBe('economico-3d');
  });

  it('janela neutra no meio zera a contagem: lenta, lenta, neutra, lenta, lenta não troca', () => {
    const s = sim('alto');
    s.warmUp();
    s.frames(100, BAD_DT); // duas janelas lentas
    s.frames(MOVING_WINDOW_SAMPLES, NEUTRAL_DT); // neutra
    s.frames(100, BAD_DT); // mais duas lentas
    expect(s.state.changes).toEqual([]);
    expect(s.machine.profile).toBe('alto');
  });

  it('um nível por vez, mesmo com desempenho péssimo', () => {
    const s = sim('alto');
    s.warmUp();
    s.frames(10_000, 200);
    expect(s.state.changes.map((c) => `${c.from}>${c.to}`)).toEqual(['alto>equilibrado', 'equilibrado>economico-3d']);
  });

  it('depois de trocar, os quadros seguintes são descartados e cada degrau pede de novo todas as janelas', () => {
    const s = sim('alto');
    s.warmUp();
    s.frames(10 * STEP_DOWN_WINDOWS, 200); // 10 amostras de 200 ms fecham uma janela por tempo (>= 2 s)
    expect(s.state.changes).toHaveLength(1);
    // logo após a troca, mais quadros lentos que cobririam todas as janelas ainda cabem no descarte + 1 janela
    s.frames(SETTLE_FRAMES + 10 * (STEP_DOWN_WINDOWS - 1), 200);
    expect(s.state.changes).toHaveLength(1);
    s.frames(10, 200);
    expect(s.state.changes).toHaveLength(2);
  });

  it('no Econômico não há para onde descer: segue medindo sem trocar e sem ir ao 2D', () => {
    const s = sim('economico-3d');
    s.warmUp();
    s.frames(5000, 200);
    expect(s.state.changes).toEqual([]);
    expect(s.machine.profile).toBe('economico-3d');
  });

  it('repouso com quedas longas seguidas também desce', () => {
    const s = sim('equilibrado');
    s.warmUp();
    s.frames(1, 16, { moving: false }); // marca o tempo
    s.frames(REST_WINDOW_SAMPLES * STEP_DOWN_REST_WINDOWS, REST_SLOW_P95_MS + 10, { moving: false });
    expect(s.state.changes).toEqual([{ from: 'equilibrado', to: 'economico-3d', reason: 'repouso-lento' }]);
  });

  it('intervalos longos entre quadros de repouso são ociosidade, não lentidão', () => {
    const s = sim('equilibrado');
    s.warmUp();
    s.frames(5000, MAX_BURST_GAP_MS + 1, { moving: false });
    s.frames(5000, 5000, { moving: false });
    expect(s.state.changes).toEqual([]);
  });

  it('pausas acima de 1 s no meio do movimento não contam como quadro lento', () => {
    const s = sim('equilibrado');
    s.warmUp();
    s.frames(5000, 5000, { moving: true });
    expect(s.state.changes).toEqual([]);
  });
});

describe('subir de perfil', () => {
  it('sobe um nível só depois de janelas rápidas seguidas, e não antes', () => {
    const s = sim('economico-3d');
    s.warmUp();
    s.movingWindows(STEP_UP_WINDOWS - 1, FAST_DT);
    expect(s.state.changes).toEqual([]);
    s.movingWindows(1, FAST_DT);
    expect(s.state.changes).toEqual([{ from: 'economico-3d', to: 'equilibrado', reason: 'folga' }]);
  });

  it('subir é mais exigente que descer', () => {
    expect(STEP_UP_WINDOWS).toBeGreaterThan(STEP_DOWN_WINDOWS);
  });

  it('uma janela neutra no meio zera a contagem de rápidas', () => {
    const s = sim('economico-3d');
    s.warmUp();
    s.movingWindows(STEP_UP_WINDOWS - 1, FAST_DT);
    s.movingWindows(1, NEUTRAL_DT);
    s.movingWindows(STEP_UP_WINDOWS - 1, FAST_DT);
    expect(s.state.changes).toEqual([]);
  });

  it('repouso lento adia a subida; repouso bom nunca a autoriza', () => {
    const s = sim('economico-3d');
    s.warmUp();
    s.movingWindows(STEP_UP_WINDOWS - 1, FAST_DT);
    s.frames(REST_WINDOW_SAMPLES + 1, REST_SLOW_P95_MS + 10, { moving: false }); // uma janela de repouso lenta
    s.movingWindows(1, FAST_DT);
    expect(s.state.changes).toEqual([]);

    const r = sim('economico-3d');
    r.warmUp();
    r.frames(1, 16, { moving: false });
    r.frames(5000, 16, { moving: false });
    expect(r.state.changes).toEqual([]);
  });

  it('no Alto não há para onde subir', () => {
    const s = sim('alto');
    s.warmUp();
    s.movingWindows(STEP_UP_WINDOWS * 3, FAST_DT);
    expect(s.state.changes).toEqual([]);
  });

  it('sem pular: do Econômico ao Alto são duas subidas, cada uma com todas as janelas', () => {
    const s = sim('economico-3d');
    s.warmUp();
    s.movingWindows(STEP_UP_WINDOWS, FAST_DT);
    expect(s.machine.profile).toBe('equilibrado');
    s.settle();
    s.movingWindows(STEP_UP_WINDOWS - 1, FAST_DT);
    expect(s.machine.profile).toBe('equilibrado');
    s.movingWindows(1, FAST_DT);
    expect(s.machine.profile).toBe('alto');
    expect(s.state.changes.map((c) => c.to)).toEqual(['equilibrado', 'alto']);
  });
});

describe('sem oscilação', () => {
  it('se a subida não se sustenta, o perfil de onde se desceu fica vetado até o app fechar', () => {
    const s = sim('equilibrado');
    s.warmUp();
    s.movingWindows(STEP_UP_WINDOWS, FAST_DT);
    expect(s.machine.profile).toBe('alto');
    s.settle();
    s.frames(50 * STEP_DOWN_WINDOWS, BAD_DT);
    expect(s.machine.profile).toBe('equilibrado');
    expect(s.machine.highestAllowed).toBe('equilibrado');
    s.settle();
    // desempenho excelente por muito tempo: não volta ao Alto
    s.movingWindows(STEP_UP_WINDOWS * 5, FAST_DT);
    expect(s.machine.profile).toBe('equilibrado');
    expect(s.state.changes.map((c) => c.to)).toEqual(['alto', 'equilibrado']);
  });

  it('o veto vale só para o perfil que falhou: o de baixo continua sendo o teto', () => {
    const s = sim('economico-3d');
    s.warmUp();
    s.movingWindows(STEP_UP_WINDOWS, FAST_DT); // economico -> equilibrado
    s.settle();
    s.frames(50 * STEP_DOWN_WINDOWS, BAD_DT); // desce de volta: veta o Equilibrado
    expect(s.machine.profile).toBe('economico-3d');
    expect(s.machine.highestAllowed).toBe('economico-3d');
    s.settle();
    s.movingWindows(STEP_UP_WINDOWS * 3, FAST_DT);
    expect(s.machine.profile).toBe('economico-3d');
  });

  it('descidas seguidas (sem subida no meio) não criam veto', () => {
    const s = sim('alto');
    s.warmUp();
    s.frames(10_000, 200);
    expect(s.machine.profile).toBe('economico-3d');
    expect(s.machine.highestAllowed).toBe('alto');
  });
});

describe('interrupção do laço de quadros', () => {
  it('o primeiro quadro depois de interrupt() nunca vira amostra', () => {
    const s = sim('equilibrado');
    s.warmUp();
    // ciclos de "pausa + retomada": sem o descarte, metade das amostras seria de 900 ms e as janelas virariam lentas
    for (let cycle = 0; cycle < MOVING_WINDOW_SAMPLES * (STEP_UP_WINDOWS + 2); cycle++) {
      s.machine.interrupt();
      s.frames(1, 900);
      s.frames(1, FAST_DT);
    }
    // só amostras de 16 ms entraram: janelas rápidas fazem subir, nunca descer
    expect(s.state.changes.length).toBeGreaterThan(0);
    expect(s.state.changes.every((c) => c.reason === 'folga')).toBe(true);
  });
});

describe('determinismo', () => {
  it('mesma sequência de quadros, mesmas trocas', () => {
    const play = () => {
      const s = sim('equilibrado');
      s.warmUp();
      s.frames(300, 45);
      s.frames(600, 16);
      s.frames(200, 120, { moving: false });
      return s.state.changes;
    };
    expect(play()).toEqual(play());
  });
});
