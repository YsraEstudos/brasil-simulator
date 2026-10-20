import { describe, expect, it } from 'vitest';

import { formatNumber } from '@/components/ui/format';
import { campaignMonths, DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import type { IndicatorPoint } from '@/database/campaignRepository';
import { createInitialState, regionsOf } from '@/engine';
import type { ActiveCampaign } from '@/store/gameStore';

import { hudFromCampaign, hudFromScenario } from './hudData';

const content = loadContent(DEFAULT_SCENARIO_ID);
const months = campaignMonths(DEFAULT_SCENARIO_ID);

function campaign(): ActiveCampaign {
  return {
    id: 'c1',
    name: 'Teste',
    state: createInitialState({ content, difficulty: 'estrategica', seed: 7 }),
    finished: false,
  };
}

function stat(data: ReturnType<typeof hudFromCampaign>, id: string) {
  const found = data.stats.find((s) => s.id === id);
  if (!found) throw new Error(`sem indicador ${id}`);
  return found;
}

describe('Painel sem partida (demonstração)', () => {
  const data = hudFromScenario(content);

  it('marca o modo demo e traz os sete números do topo', () => {
    expect(data.demo).toBe(true);
    expect(data.stats.map((s) => s.id)).toEqual([
      'mes',
      'capital',
      'aprovacao',
      'pib',
      'populacao',
      'inflacao',
      'desemprego',
    ]);
    expect(stat(data, 'mes').value).toBe('Janeiro de 2027');
    expect(stat(data, 'mes').context).toBe(`Turno 1 de ${months}`);
  });

  it('usa a população real do cenário (soma das UFs)', () => {
    const thousands = regionsOf(content).reduce((n, uf) => n + uf.population, 0);
    expect(stat(data, 'populacao').value).toBe(`${formatNumber(thousands / 1000, 1)} milhões`);
  });

  it('monta o Congresso com as cadeiras do cenário (513) e sem apoio calculado', () => {
    expect(data.congress.total).toBe(513);
    expect(data.congress.left + data.congress.center + data.congress.right).toBe(513);
    expect(data.congress.support).toBeNull();
  });

  it('monta as cinco regiões com a participação no PIB do cenário', () => {
    expect(data.regions.map((r) => r.id)).toEqual(['norte', 'nordeste', 'centro_oeste', 'sudeste', 'sul']);
    expect(data.regions.every((r) => r.level > 0 && r.level <= 1)).toBe(true);
    expect(data.regions.some((r) => r.level === 1)).toBe(true);
  });

  it('lista os ministérios do cenário sem ocupante partidário', () => {
    const ministries = content.scenario.institutions?.ministries ?? [];
    expect(data.ministries).toHaveLength(ministries.length);
    expect(data.ministries.every((m) => m.occupant === 'Quadro técnico' && m.tone === 'neutral')).toBe(true);
  });
});

describe('Painel com a partida', () => {
  it('deriva mês, turno e ações de agenda do estado', () => {
    const active = campaign();
    const data = hudFromCampaign(active, content, null);
    expect(data.demo).toBe(false);
    expect(data.monthLabel).toBe('Janeiro de 2027');
    expect(data.turn).toBe(1);
    expect(data.turnTotal).toBe(months);
    expect(data.actionsMax).toBe(active.state.resources.agendaActionsPerMonth);
  });

  it('campanha encerrada mostra o último mês jogado, não o seguinte', () => {
    const active = campaign();
    const state = { ...active.state, monthIndex: months };
    const data = hudFromCampaign({ ...active, state, finished: true }, content, null);
    expect(data.turn).toBe(months);
    expect(stat(data, 'mes').context).toBe(`Turno ${months} de ${months}`);
  });

  it('mostra a variação em relação ao mês anterior quando existe', () => {
    const active = campaign();
    const previous = { ...active.state.indicators, approval: active.state.indicators.approval - 0.04 };
    const data = hudFromCampaign({ ...active, previous }, content, null);
    expect(stat(data, 'aprovacao').delta).toBe('+4 p.p.');
    expect(stat(data, 'aprovacao').sentiment).toBe('positive');
    expect(stat(data, 'inflacao').context).toBe('meta 3,0%');
  });

  it('sem mês anterior não inventa variação', () => {
    const data = hudFromCampaign(campaign(), content, null);
    expect(stat(data, 'aprovacao').delta).toBeUndefined();
    expect(stat(data, 'pib').sentiment).toBe('neutral');
  });

  it('sem camada escolhida o globo fica só com o satélite', () => {
    expect(hudFromCampaign(campaign(), content, null).fills).toBeNull();
  });

  it('pinta o globo com as 27 UFs na camada escolhida', () => {
    const data = hudFromCampaign(campaign(), content, null, 'aprovacao');
    expect(Object.keys(data.fills ?? {})).toHaveLength(27);
  });

  it('transforma a série longa do banco na série do gráfico', () => {
    const active = campaign();
    const history: IndicatorPoint[] = [
      {
        monthIndex: 0,
        indicators: active.state.indicators,
        selic: null,
        grossDebt: null,
        credibility: null,
        exchangeRate: null,
        riskPremium: null,
      },
      {
        monthIndex: 1,
        indicators: { ...active.state.indicators, gdpGrowth12m: 0.024 },
        selic: 0.15,
        grossDebt: 0.8,
        credibility: 0.6,
        exchangeRate: 5.6,
        riskPremium: 0.02,
      },
    ];
    const data = hudFromCampaign(active, content, history);
    expect(data.series).toEqual([
      { monthIndex: 0, value: active.state.indicators.gdpGrowth12m },
      { monthIndex: 1, value: 0.024 },
    ]);
    expect(hudFromCampaign(active, content, null).series).toEqual([]);
  });

  it('avalia a meta pela inflação e pelo resultado primário', () => {
    const active = campaign();
    const inflation = { ...active.state, indicators: { ...active.state.indicators, inflation12m: 0.09 } };
    const data = hudFromCampaign({ ...active, state: inflation }, content, null);
    expect(data.goal.checks.find((c) => c.label === 'Inflação em 12 meses')?.met).toBe(false);
    expect(data.goal.checks.find((c) => c.label === 'Resultado primário')?.met).toBe(false);
  });
});
