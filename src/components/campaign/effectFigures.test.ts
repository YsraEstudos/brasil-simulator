import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { adviseDecision, createInitialState, currentNominalGdpMillions, policyEffectForecast } from '@/engine';

import { eventChoiceFigures, figureRange, figuresA11y, policyFigures, type FigureContext } from './effectFigures';

// PLANO_SAVES_HISTORICO.md H9/D3 e D-H4: valor exato só no Casual; faixa nas outras dificuldades, como a mesa de
// despacho (GAME_DESIGN.md §6: previsões precisas no Casual, com margem na Estratégica, com margem e viés no Realismo).

const casual: FigureContext = { difficulty: 'casual', seed: 1, monthIndex: 3 };
const estrategica: FigureContext = { ...casual, difficulty: 'estrategica' };
const realismo: FigureContext = { ...casual, difficulty: 'realismo' };

const choice = {
  id: 'apoiar',
  effects: [
    { target: 'aprovacao' as const, delta: 0.012, lagMonths: 0, durationMonths: 1 },
    { target: 'relacao_congresso' as const, delta: -8, lagMonths: 0, durationMonths: 1 },
    { target: 'gasto.custeio' as const, delta: 0.002, lagMonths: 0, durationMonths: 6 },
    { target: 'choque.hiato' as const, delta: 0.002, lagMonths: 0, durationMonths: 3 },
  ],
};

describe('figureRange', () => {
  it('Casual: o valor arredondado, sem faixa', () => {
    expect(figureRange(12.4, 'up', casual, 'k')).toEqual({ low: 12, high: 12, exact: true });
  });

  it('Estratégica: faixa que contém o valor, sem cruzar o zero e estável para a mesma semente', () => {
    for (let seed = 0; seed < 200; seed++) {
      const ctx = { ...estrategica, seed };
      const r = figureRange(12, 'up', ctx, 'k');
      expect(r.exact).toBe(false);
      expect(r.low).toBeLessThanOrEqual(12);
      expect(r.high).toBeGreaterThanOrEqual(12);
      expect(r.low).toBeGreaterThanOrEqual(0);
      expect(r.high).toBeGreaterThan(r.low);
      expect(figureRange(12, 'up', ctx, 'k')).toEqual(r);
    }
  });

  it('o centro da faixa varia: o meio não entrega o valor exato', () => {
    const centers = new Set<number>();
    for (let seed = 0; seed < 50; seed++) {
      const r = figureRange(20, 'up', { ...estrategica, seed }, 'k');
      centers.add(r.low + r.high);
    }
    expect(centers.size).toBeGreaterThan(3);
  });

  it('Realismo: faixa mais larga e puxada para o lado bom', () => {
    let width = 0;
    let mid = 0;
    let widthE = 0;
    const n = 400;
    for (let seed = 0; seed < n; seed++) {
      const r = figureRange(-20, 'up', { ...realismo, seed }, 'k');
      const e = figureRange(-20, 'up', { ...estrategica, seed }, 'k');
      width += r.high - r.low;
      widthE += e.high - e.low;
      mid += (r.low + r.high) / 2;
      expect(r.high).toBeLessThanOrEqual(0);
    }
    expect(width / n).toBeGreaterThan(widthE / n);
    expect(mid / n).toBeGreaterThan(-20); // otimista: perda menor que a declarada
  });
});

describe('eventChoiceFigures', () => {
  it('Casual: números exatos dos efeitos declarados', () => {
    const figures = eventChoiceFigures('ev', choice, casual, 'pib', 1);
    expect(figures.map((f) => f.text)).toEqual([
      'Aprovação +1,2 p.p.',
      'Congresso −8 pontos',
      'Custo 0,20% do PIB/ano',
    ]);
    expect(figures.map((f) => f.tone)).toEqual(['positive', 'negative', 'negative']);
    expect(figuresA11y(figures)).toBe('Efeitos: Aprovação +1,2 p.p.; Congresso −8 pontos; Custo 0,20% do PIB/ano');
  });

  it('fora do Casual, nenhum número exato: só faixas "x a y"', () => {
    for (const ctx of [estrategica, realismo]) {
      const figures = eventChoiceFigures('ev', choice, ctx, 'pib', 1);
      expect(figures).toHaveLength(3);
      for (const f of figures) {
        expect(f.exact).toBe(false);
        expect(f.text).toMatch(/ a /);
      }
      expect(figuresA11y(figures)).toMatch(/^Estimativa: /);
    }
  });

  it('efeito permanente em alvo mensal ganha "/mês"; em R$, usa o PIB', () => {
    const perm = {
      id: 'x',
      effects: [{ target: 'aprovacao' as const, delta: 0.005, lagMonths: 0, durationMonths: null }],
    };
    expect(eventChoiceFigures('ev', perm, casual, 'pib', 1)[0].text).toBe('Aprovação +0,5 p.p./mês');
    const spend = {
      id: 'y',
      effects: [{ target: 'gasto.custeio' as const, delta: 0.002, lagMonths: 0, durationMonths: 6 }],
    };
    expect(eventChoiceFigures('ev', spend, casual, 'reais', 12_000_000)[0].text).toBe('Custo R$ 24,0 bi/ano');
  });

  it('todas as escolhas do conteúdo real: Casual exato, outras dificuldades em faixa', () => {
    const content = loadContent(DEFAULT_SCENARIO_ID);
    let shown = 0;
    for (const event of Object.values(content.events)) {
      for (const c of event.choices) {
        for (const f of eventChoiceFigures(event.id, c, casual, 'pib', 1)) {
          expect(f.exact).toBe(true);
          shown++;
        }
        for (const f of eventChoiceFigures(event.id, c, realismo, 'pib', 1)) expect(f.exact).toBe(false);
      }
    }
    expect(shown).toBeGreaterThan(50);
  });
});

describe('policyFigures', () => {
  const content = loadContent(DEFAULT_SCENARIO_ID);

  it('Casual: os mesmos números da mesa de despacho', () => {
    const state = createInitialState({ content, difficulty: 'casual', seed: 9 });
    const ctx: FigureContext = { difficulty: 'casual', seed: state.seed, monthIndex: state.monthIndex };
    for (const id of Object.keys(content.policies).slice(0, 40)) {
      const forecast = policyEffectForecast(state, id, content);
      const advice = adviseDecision(state, id, content);
      expect(forecast.annualFiscalImpact).toBe(advice.forecast.annualFiscalImpact);
      expect(forecast.approvalImpact).toBe(advice.forecast.approvalImpact);
      expect(forecast.gdpMillions).toBe(currentNominalGdpMillions(state, content));
      for (const f of policyFigures(id, forecast, ctx, 'pib')) expect(f.exact).toBe(true);
    }
  });

  it('Estratégica: nenhum cartão de política com número exato', () => {
    const state = createInitialState({ content, difficulty: 'estrategica', seed: 9 });
    const ctx: FigureContext = { difficulty: 'estrategica', seed: state.seed, monthIndex: state.monthIndex };
    let shown = 0;
    for (const id of Object.keys(content.policies)) {
      for (const f of policyFigures(id, policyEffectForecast(state, id, content), ctx, 'reais')) {
        expect(f.exact).toBe(false);
        shown++;
      }
    }
    expect(shown).toBeGreaterThan(10);
  });
});
