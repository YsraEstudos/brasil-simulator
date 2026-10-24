import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PULSE_TOTAL_MS } from '@/globe/markerPulse';

import { claimNewCritical, pulsingInstances, resetMarkerSession, subscribeMarkerSession } from './markerSession';
import type { MarkerItem } from './markersView';

// PR 11: cada evento crítico pulsa uma vez por sessão e por partida; o pulso dura o anel e o que sai do mapa deixa de pulsar.

const crit = (instanceId: string): MarkerItem => ({
  id: `evento:${instanceId}`,
  kind: 'event',
  sigla: 'CE',
  critical: true,
  severity: 0.9,
  title: 'T',
  instanceId,
});
const calm: MarkerItem = { ...crit('calmo#1'), critical: false, severity: 0.2 };

beforeEach(() => resetMarkerSession());

describe('memória do pulso na sessão', () => {
  it('o crítico novo pulsa; o calmo não', () => {
    claimNewCritical('p1', [crit('a#1'), calm]);
    expect(pulsingInstances('p1')).toEqual(['a#1']);
    expect(pulsingInstances('outra')).toEqual([]);
  });

  it('chamar de novo com os mesmos itens não muda nada nem avisa ninguém (efeito duplicado)', () => {
    claimNewCritical('p1', [crit('a#1')]);
    const before = pulsingInstances('p1');
    const listener = vi.fn();
    subscribeMarkerSession(listener);
    claimNewCritical('p1', [crit('a#1')]);
    expect(pulsingInstances('p1')).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('o pulso segue enquanto o anel corre; sair do mapa tira o pulso; não volta a pulsar depois de visto', () => {
    claimNewCritical('p1', [crit('a#1')]);
    claimNewCritical('p1', [crit('a#1'), crit('b#2')]);
    expect(pulsingInstances('p1')).toEqual(['a#1', 'b#2']);
    // mês seguinte: a#1 foi respondido e saiu
    claimNewCritical('p1', [crit('b#2')]);
    expect(pulsingInstances('p1')).toEqual(['b#2']);
    // todos fora do mapa
    claimNewCritical('p1', []);
    expect(pulsingInstances('p1')).toEqual([]);
    // a#1 já pulsou nesta sessão: voltar à tela com ele não repete
    claimNewCritical('p1', [crit('a#1')]);
    expect(pulsingInstances('p1')).toEqual([]);
  });

  it('o pulso para ao fim do anel mesmo com o evento ainda no mapa; voltar à tela não o repete', () => {
    vi.useFakeTimers();
    try {
      claimNewCritical('p1', [crit('a#1')]);
      vi.advanceTimersByTime(PULSE_TOTAL_MS - 1);
      expect(pulsingInstances('p1')).toEqual(['a#1']);
      vi.advanceTimersByTime(1);
      expect(pulsingInstances('p1')).toEqual([]);
      // voltou do subpainel com o evento ainda no mapa: já foi visto, não pulsa de novo
      claimNewCritical('p1', [crit('a#1')]);
      expect(pulsingInstances('p1')).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cada partida tem a sua memória', () => {
    claimNewCritical('p1', [crit('a#1')]);
    claimNewCritical('p2', [crit('a#1')]);
    expect(pulsingInstances('p1')).toEqual(['a#1']);
    expect(pulsingInstances('p2')).toEqual(['a#1']);
  });

  it('avisa os ouvintes só quando o conjunto muda, e o cancelamento da inscrição vale', () => {
    const listener = vi.fn();
    const off = subscribeMarkerSession(listener);
    claimNewCritical('p1', [crit('a#1')]);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    claimNewCritical('p1', []);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
