import { describe, expect, it } from 'vitest';

import type { CampaignSummary } from '@/database/campaignRepository';

import { continueLabel, pickContinueTarget, type OpenCampaignRef } from './menuModel';

/** Resumo de partida salva, com os campos que a lista de saves lê; o que o teste não usa vem fixo. */
function save(overrides: Partial<CampaignSummary> & Pick<CampaignSummary, 'id' | 'updatedAt'>): CampaignSummary {
  return {
    name: `Campanha ${overrides.id}`,
    scenarioId: 'prototipo_ficticio',
    scenarioVersion: '1',
    difficulty: 'estrategica',
    seed: 1,
    status: 'ativa',
    currentMonth: 4,
    currentTurn: 4,
    stage: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Partida aberta em memória, na forma mínima que o CONTINUAR lê. */
function open(overrides: Partial<OpenCampaignRef> & Pick<OpenCampaignRef, 'id' | 'name'>): OpenCampaignRef {
  return { finished: false, state: { monthIndex: 6 }, ...overrides };
}

describe('pickContinueTarget (CONTINUAR, PLANO_MENU_SAVES_CONFIG.md M1.3)', () => {
  it('sem partida aberta, escolhe a salva mais recentemente atualizada', () => {
    const campaigns = [
      save({ id: 'antiga', updatedAt: '2026-10-01T10:00:00.000Z' }),
      save({ id: 'recente', updatedAt: '2026-11-02T09:00:00.000Z', currentMonth: 7 }),
      save({ id: 'meio', updatedAt: '2026-10-20T10:00:00.000Z' }),
    ];
    const target = pickContinueTarget(null, campaigns);
    expect(target?.id).toBe('recente');
    expect(target?.currentMonth).toBe(7);
    expect(target?.finished).toBe(false);
  });

  it('com partida aberta em memória, ela vence mesmo que outra salva seja mais nova', () => {
    const campaigns = [save({ id: 'salva', updatedAt: '2026-11-03T00:00:00.000Z' })];
    const active = open({ id: 'aberta', name: 'Aberta agora', state: { monthIndex: 2 } });
    const target = pickContinueTarget(active, campaigns);
    expect(target).toEqual({
      id: 'aberta',
      name: 'Aberta agora',
      currentMonth: 2,
      stage: null,
      finished: false,
    });
  });

  it('lista vazia e sem partida aberta não tem alvo', () => {
    expect(pickContinueTarget(null, [])).toBeNull();
  });

  it('partida aberta é alvo mesmo sem nenhuma salva no banco', () => {
    expect(pickContinueTarget(open({ id: 'a', name: 'Nova' }), [])?.id).toBe('a');
  });

  it('marca como encerrada a salva com status encerrada', () => {
    const target = pickContinueTarget(null, [
      save({ id: 'fim', updatedAt: '2026-11-01T00:00:00.000Z', status: 'encerrada' }),
    ]);
    expect(target?.finished).toBe(true);
  });

  it('antes da posse, o estágio vem da partida; governo vira null', () => {
    const preposse = pickContinueTarget(null, [
      save({ id: 'c', updatedAt: '2026-11-01T00:00:00.000Z', stage: 'corrida', currentMonth: 0 }),
    ]);
    expect(preposse?.stage).toBe('corrida');
    const governo = pickContinueTarget(null, [
      save({ id: 'g', updatedAt: '2026-11-01T00:00:00.000Z', stage: 'governo' }),
    ]);
    expect(governo?.stage).toBeNull();
  });
});

describe('continueLabel (CONTINUAR — nome • mês ou estágio)', () => {
  it('sem alvo, fica só CONTINUAR', () => {
    expect(continueLabel(null)).toBe('CONTINUAR');
  });

  it('partida de governo mostra o nome e o mês do mandato (mês = índice + 1, como em SavedCampaignsScreen)', () => {
    const target = pickContinueTarget(null, [
      save({ id: 'g', name: 'Sul', updatedAt: '2026-11-01T00:00:00.000Z', currentMonth: 4 }),
    ]);
    expect(continueLabel(target)).toBe('CONTINUAR — Sul • Mês 5');
  });

  it('antes da posse, mostra o rótulo do estágio no lugar do mês', () => {
    const target = pickContinueTarget(null, [
      save({ id: 'p', name: 'Norte', updatedAt: '2026-11-01T00:00:00.000Z', stage: 'convencao', currentMonth: 0 }),
    ]);
    expect(continueLabel(target)).toBe('CONTINUAR — Norte • Convenção');
  });

  it('partida encerrada mostra só o nome, sem o mês', () => {
    const target = pickContinueTarget(null, [
      save({ id: 'e', name: 'Fim', updatedAt: '2026-11-01T00:00:00.000Z', status: 'encerrada', currentMonth: 48 }),
    ]);
    expect(continueLabel(target)).toBe('CONTINUAR — Fim');
  });
});
