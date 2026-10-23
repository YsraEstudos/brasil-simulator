import { describe, expect, it } from 'vitest';

import { DAY_MODES, DEFAULT_DAY_TIME, FIXED_HOURS } from '@/globe/visualClock';

import { DAY_MODE_OPTIONS, FIXED_HOUR_LABELS, resolveDayTime } from './mapDayTime';

describe('hora do dia do mapa: escolha guardada', () => {
  it('sem nada guardado (ou valor estranho) vale a hora fixa da tarde', () => {
    for (const bad of [null, undefined, 3, 'fixa', [], true]) expect(resolveDayTime(bad)).toEqual(DEFAULT_DAY_TIME);
  });

  it('aceita cada modo e cada hora válidos', () => {
    for (const mode of DAY_MODES) {
      for (const hour of FIXED_HOURS) expect(resolveDayTime({ mode, hour })).toEqual({ mode, hour });
    }
  });

  it('corrige só o campo inválido', () => {
    expect(resolveDayTime({ mode: 'real', hour: 'meia-noite' })).toEqual({ mode: 'real', hour: 'tarde' });
    expect(resolveDayTime({ mode: 'eclipse', hour: 'noite' })).toEqual({ mode: 'fixa', hour: 'noite' });
  });

  it('as opções de Configurações cobrem todos os modos e horas', () => {
    expect(DAY_MODE_OPTIONS.map((o) => o.id)).toEqual(DAY_MODES);
    expect(Object.keys(FIXED_HOUR_LABELS)).toEqual([...FIXED_HOURS]);
  });
});
