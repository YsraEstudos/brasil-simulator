import { describe, expect, it } from 'vitest';

import { EVENTS } from '@/content/events';

import { eventSeverity, GRAVE_EVENTS, isGraveEvent, sanctionSeverity, severityCounts } from './eventGravity';

const at = (severity: number) => ({ affectedUfs: ['RS'], primaryUf: 'RS', severityByUf: { RS: severity } });

describe('eventos graves (Fase Q12)', () => {
  it('todos os ids da lista existem no conteúdo', () => {
    const ids = new Set(EVENTS.map((e) => e.id));
    expect(Object.keys(GRAVE_EVENTS).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('escândalo e crise valem sempre; desastre com local só a partir da severidade crítica do mapa', () => {
    expect(isGraveEvent('escandalo_ministerio')).toBe(true);
    expect(isGraveEvent('revisao_rating')).toBe(true);
    expect(isGraveEvent('enchentes_metropole_v2', at(0.3))).toBe(false);
    expect(isGraveEvent('enchentes_metropole_v2', at(0.8))).toBe(true);
    expect(isGraveEvent('seca_safra_energia')).toBe(true);
    expect(isGraveEvent('alta_petroleo')).toBe(false);
    expect(isGraveEvent(undefined)).toBe(false);
  });
});

describe('gravidade nos Alertas (B82)', () => {
  it('evento grave é crítico, os outros são avisos; sanção com acréscimos é aviso, sem eles é informativo', () => {
    expect(eventSeverity('escandalo_ministerio')).toBe('critico');
    expect(eventSeverity('alta_petroleo')).toBe('aviso');
    expect(sanctionSeverity(0.002)).toBe('aviso');
    expect(sanctionSeverity(0)).toBe('informativo');
    expect(severityCounts(['critico', 'aviso', 'aviso'])).toEqual({ critico: 1, aviso: 2, informativo: 0 });
  });
});
