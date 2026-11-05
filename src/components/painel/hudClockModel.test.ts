import { describe, expect, it } from 'vitest';

import {
  BATTERY_STATE,
  batteryView,
  clockAccessibilityLabel,
  formatClock,
  keepAwakeActive,
  keepAwakeNote,
  msUntilNextMinute,
  showHudClock,
} from './hudClockModel';

// PLANO_SAVES_HISTORICO.md §5, H1 (D33 relógio e bateria, B11 tela acesa).

describe('formatClock', () => {
  it('24 horas com dois dígitos', () => {
    expect(formatClock(0, 0)).toBe('00:00');
    expect(formatClock(9, 5)).toBe('09:05');
    expect(formatClock(14, 30)).toBe('14:30');
    expect(formatClock(23, 59)).toBe('23:59');
  });
});

describe('msUntilNextMinute', () => {
  it('conta até a virada do minuto', () => {
    expect(msUntilNextMinute(0, 0)).toBe(60_000);
    expect(msUntilNextMinute(30, 0)).toBe(30_000);
    expect(msUntilNextMinute(59, 999)).toBe(1);
  });

  it('nunca devolve zero nem negativo', () => {
    expect(msUntilNextMinute(60, 0)).toBe(1);
  });
});

describe('batteryView', () => {
  it('mostra a porcentagem arredondada', () => {
    expect(batteryView({ level: 0.874, state: BATTERY_STATE.unplugged, web: false })).toEqual({
      text: '87%',
      percent: 87,
      charging: false,
      low: false,
    });
  });

  it('sem leitura do aparelho, só a hora', () => {
    expect(batteryView({ level: -1, state: BATTERY_STATE.unplugged, web: false })).toBeNull();
    expect(batteryView({ level: Number.NaN, state: BATTERY_STATE.unplugged, web: false })).toBeNull();
    expect(batteryView({ level: 0.5, state: BATTERY_STATE.unknown, web: false })).toBeNull();
    expect(batteryView({ level: 1.5, state: BATTERY_STATE.unplugged, web: false })).toBeNull();
  });

  it('no navegador, "100% carregando" é computador sem bateria: só a hora', () => {
    expect(batteryView({ level: 1, state: BATTERY_STATE.full, web: true })).toBeNull();
    expect(batteryView({ level: 1, state: BATTERY_STATE.charging, web: true })).toBeNull();
    // No celular, carga completa aparece.
    expect(batteryView({ level: 1, state: BATTERY_STATE.full, web: false })?.text).toBe('100%');
    // Notebook na tomada ainda carregando aparece.
    expect(batteryView({ level: 0.6, state: BATTERY_STATE.charging, web: true })?.charging).toBe(true);
  });

  it('bateria fraca só fora da tomada', () => {
    expect(batteryView({ level: 0.15, state: BATTERY_STATE.unplugged, web: false })?.low).toBe(true);
    expect(batteryView({ level: 0.15, state: BATTERY_STATE.charging, web: false })?.low).toBe(false);
    expect(batteryView({ level: 0.2, state: BATTERY_STATE.unplugged, web: false })?.low).toBe(false);
  });
});

describe('clockAccessibilityLabel', () => {
  it('só a hora quando não há bateria', () => {
    expect(clockAccessibilityLabel('14:05', null)).toBe('Hora do aparelho: 14:05');
  });

  it('hora, bateria e estado da carga', () => {
    const at = (level: number, state: number) => batteryView({ level, state, web: false });
    expect(clockAccessibilityLabel('14:05', at(0.87, BATTERY_STATE.unplugged))).toBe(
      'Hora do aparelho: 14:05. Bateria: 87%',
    );
    expect(clockAccessibilityLabel('14:05', at(0.5, BATTERY_STATE.charging))).toBe(
      'Hora do aparelho: 14:05. Bateria: 50%, carregando',
    );
    expect(clockAccessibilityLabel('14:05', at(0.1, BATTERY_STATE.unplugged))).toBe(
      'Hora do aparelho: 14:05. Bateria: 10%, fraca',
    );
  });
});

describe('decisões de mostrar e de manter acesa', () => {
  it('relógio só com a preferência e a mesa medida', () => {
    expect(showHudClock(true, 360, 740)).toBe(true);
    expect(showHudClock(false, 360, 740)).toBe(false);
    expect(showHudClock(true, 0, 0)).toBe(false);
  });

  it('tela acesa só com a preferência e o Painel em foco', () => {
    expect(keepAwakeActive(true, true)).toBe(true);
    expect(keepAwakeActive(true, false)).toBe(false);
    expect(keepAwakeActive(false, true)).toBe(false);
  });

  it('legenda explica quando o navegador não suporta', () => {
    expect(keepAwakeNote(false)).toMatch(/navegador não permite/);
    expect(keepAwakeNote(true)).toMatch(/Painel aberto/);
    expect(keepAwakeNote(null)).toBe(keepAwakeNote(true));
  });
});
