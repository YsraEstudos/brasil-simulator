import { expect, it } from 'vitest';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { createInitialState } from '@/engine/state';
import { careerFinanceView } from './careerFinanceView';

const content = loadContent(DEFAULT_SCENARIO_ID);
// PLANO_CAMPANHA.md Fase C3: a tela expõe bolsos, teto e ordem das escolhas.
it('descreve a contabilidade de campanha sem modificar o estado', () => {
  const state = createInitialState({ content, difficulty: 'estrategica', seed: 1, startPoint: 'corrida' });
  const before = JSON.stringify(state);
  const view = careerFinanceView(state, content);
  expect(view).toMatchObject({
    party: 10000,
    personal: 0,
    donations: 0,
    spent: 0,
    limit: 88944,
    personalAvailable: 750,
  });
  expect(JSON.stringify(state)).toBe(before);
});
it('não apresenta caixa quando a carreira não está ativa', () => {
  const state = createInitialState({ content, difficulty: 'estrategica', seed: 1 });
  expect(careerFinanceView(state, content)).toBeNull();
});

// PLANO_CAMPANHA.md Fase C3: faixa de risco atual reflete a exposição que permanece após descoberta.
it('mostra risco baixo quando uma investigação zerou a exposição, sem reaproveitar risco anterior', () => {
  const state = createInitialState({ content, difficulty: 'estrategica', seed: 1, startPoint: 'corrida' });
  expect(careerFinanceView(state, content)?.risk).toBe('baixo');
});

// PLANO_CAMPANHA.md Fase C3.1: a interface também apresenta o caixa mínimo.
it('expõe o caixa simples quando a expansão está desligada', async () => {
  const configured = {
    ...content,
    scenario: {
      ...content.scenario,
      career: {
        ...content.scenario.career!,
        finance: {
          initialBalance: 100,
          spendingLimit: 300,
          dataStatus: 'FICTICIO' as const,
          costs: [{ id: 'arrecadar_doacoes', cost: 20 }],
        },
      },
    },
  };
  const state = createInitialState({ content: configured, difficulty: 'estrategica', seed: 1, startPoint: 'corrida' });
  const { simpleFinanceView } = await import('./careerFinanceView');
  expect(simpleFinanceView(state)).toMatchObject({ balance: 100, spent: 0, spendingLimit: 300 });
});
