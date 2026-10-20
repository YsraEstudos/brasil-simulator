import { describe, expect, it } from 'vitest';

import type { RegionalPoint } from '@/database/campaignRepository';
import type { UfState } from '@/engine';

import {
  buildUfSeriesView,
  NO_PREVIOUS_DATA,
  rankOf,
  REGIONAL_SERIES_WINDOW_MONTHS,
  seriesMetricFor,
  SERIES_METRICS,
  seriesWindow,
  sparklinePoints,
} from './regionalSeriesView';

// Série regional do cartão do estado (PLANO_GLOBO.md, PR 3): variação, 12 meses e ranking, com lacunas honestas.

const uf = (id: string, approval: number, extra: Partial<UfState> = {}): UfState => ({
  id,
  share: 0.1,
  structuralShare: 0.1,
  growthGap12m: 0,
  unemployment: 0.08,
  approval,
  governorRelation: 0,
  ...extra,
});

/** Ponto da série com a UF `SP` na aprovação dada (e os outros campos neutros). */
const point = (monthIndex: number, approval: number, id = 'SP'): RegionalPoint => ({
  monthIndex,
  ufs: { [id]: { approval, unemployment: 0.08, growthGap12m: 0, share: 0.1, governorRelation: 0 } },
});

const approval = SERIES_METRICS.aprovacao;

describe('ranking entre as UFs', () => {
  const ufs = [uf('AC', 0.3), uf('SP', 0.5), uf('BA', 0.4), uf('RS', 0.2)];

  it('aprovação: a mais alta é a 1ª', () => {
    expect(rankOf(approval, ufs, 'SP')).toBe(1);
    expect(rankOf(approval, ufs, 'BA')).toBe(2);
    expect(rankOf(approval, ufs, 'RS')).toBe(4);
  });

  it('desemprego: o mais baixo é o 1º', () => {
    const list = [uf('A', 0.5, { unemployment: 0.1 }), uf('B', 0.5, { unemployment: 0.05 })];
    expect(rankOf(SERIES_METRICS.desemprego, list, 'B')).toBe(1);
    expect(rankOf(SERIES_METRICS.desemprego, list, 'A')).toBe(2);
  });

  it('empate divide a posição e UF inexistente não tem posição', () => {
    const tied = [uf('A', 0.5), uf('B', 0.5), uf('C', 0.4)];
    expect(rankOf(approval, tied, 'A')).toBe(1);
    expect(rankOf(approval, tied, 'B')).toBe(1);
    expect(rankOf(approval, tied, 'C')).toBe(3);
    expect(rankOf(approval, tied, 'XX')).toBeNull();
  });

  it('o texto do cartão diz a posição e o total', () => {
    const view = buildUfSeriesView({ metric: approval, ufId: 'BA', monthIndex: 0, currentUfs: ufs, history: [] });
    expect(view?.rankText).toBe('2º de 4 em aprovação');
  });
});

describe('variação desde o mês passado e desde a posse', () => {
  const history = [point(0, 0.5), point(1, 0.52), point(2, 0.55)];
  const build = (monthIndex: number, current: number, h: readonly RegionalPoint[]) =>
    buildUfSeriesView({
      metric: approval,
      ufId: 'SP',
      monthIndex,
      currentUfs: [uf('SP', current), uf('BA', 0.3)],
      history: h,
    })!;

  it('calcula as duas variações em pontos percentuais, com o tom pelo sentido do indicador', () => {
    const v = build(3, 0.54, [...history, point(3, 0.54)]);
    expect(v.sinceLastMonth).toEqual({ label: 'Desde o mês passado', text: '−1,0 p.p.', tone: 'negative' });
    expect(v.sinceStart).toEqual({ label: 'Desde a posse', text: '+4,0 p.p.', tone: 'positive' });
    expect(v.valueText).toBe('54,0%');
  });

  it('desemprego: subir é ruim', () => {
    const ufs = [uf('SP', 0.5, { unemployment: 0.09 })];
    const h: RegionalPoint[] = [
      { monthIndex: 0, ufs: { SP: { ...point(0, 0.5).ufs.SP, unemployment: 0.07 } } },
      { monthIndex: 1, ufs: { SP: { ...point(1, 0.5).ufs.SP, unemployment: 0.08 } } },
    ];
    const v = buildUfSeriesView({
      metric: SERIES_METRICS.desemprego,
      ufId: 'SP',
      monthIndex: 2,
      currentUfs: ufs,
      history: h,
    })!;
    expect(v.sinceStart).toMatchObject({ text: '+2,0 p.p.', tone: 'negative' });
    expect(v.sinceLastMonth).toMatchObject({ text: '+1,0 p.p.', tone: 'negative' });
  });

  it('relação com o governador usa pontos, não p.p.', () => {
    const h: RegionalPoint[] = [{ monthIndex: 0, ufs: { SP: { ...point(0, 0.5).ufs.SP, governorRelation: 10 } } }];
    const v = buildUfSeriesView({
      metric: SERIES_METRICS.governador,
      ufId: 'SP',
      monthIndex: 1,
      currentUfs: [uf('SP', 0.5, { governorRelation: 16 })],
      history: h,
    })!;
    expect(v.sinceStart.text).toBe('+6 pts');
    expect(v.valueText).toBe('16');
  });

  it('variação pequena demais para aparecer no arredondamento é neutra', () => {
    const v = build(1, 0.5, [point(0, 0.5)]);
    expect(v.sinceStart).toMatchObject({ text: '±0,0 p.p.', tone: 'neutral' });
  });

  it('no mês da posse não há com o que comparar, e isso não é lacuna', () => {
    const v = build(0, 0.5, [point(0, 0.5)]);
    expect(v.sinceLastMonth.text).toBe('Primeiro mês');
    expect(v.sinceStart.text).toBe('Mês da posse');
    expect(v.hasSeries).toBe(false);
    expect(v.seriesCaption).toMatch(/depois do primeiro mês/);
  });
});

describe('save sem histórico (lacuna honesta)', () => {
  const view = (h: readonly RegionalPoint[], monthIndex = 20) =>
    buildUfSeriesView({
      metric: approval,
      ufId: 'SP',
      monthIndex,
      currentUfs: [uf('SP', 0.5), uf('BA', 0.4)],
      history: h,
    })!;

  it('sem nenhuma linha: "Sem dados anteriores" nas duas comparações e na série, mas o valor e o ranking existem', () => {
    const v = view([]);
    expect(v.sinceLastMonth.text).toBe(NO_PREVIOUS_DATA);
    expect(v.sinceStart.text).toBe(NO_PREVIOUS_DATA);
    expect(v.hasSeries).toBe(false);
    expect(v.seriesCaption).toBe(NO_PREVIOUS_DATA);
    expect(v.valueText).toBe('50,0%');
    expect(v.rankText).toBe('1º de 2 em aprovação');
  });

  it('sem o mês 0 mas com o mês passado: só a posse fica sem dados', () => {
    const v = view([point(19, 0.48), point(18, 0.47)]);
    expect(v.sinceLastMonth.text).toBe('+2,0 p.p.');
    expect(v.sinceStart.text).toBe(NO_PREVIOUS_DATA);
    expect(v.hasSeries).toBe(true);
  });

  it('UF ausente do ponto antigo também é lacuna, não zero', () => {
    const v = view([point(0, 0.5, 'BA'), point(19, 0.5, 'BA')]);
    expect(v.sinceStart.text).toBe(NO_PREVIOUS_DATA);
    expect(v.sinceLastMonth.text).toBe(NO_PREVIOUS_DATA);
  });

  it('UF que não está no estado não gera cartão', () => {
    expect(
      buildUfSeriesView({ metric: approval, ufId: 'XX', monthIndex: 1, currentUfs: [uf('SP', 0.5)], history: [] }),
    ).toBeNull();
  });
});

describe('janela de 12 meses', () => {
  const longHistory = Array.from({ length: 31 }, (_, m) => point(m, 0.4 + m / 100));

  it('depois do mês 13 a mini-série mostra os últimos 12 meses e a posse continua disponível na comparação', () => {
    const v = buildUfSeriesView({
      metric: approval,
      ufId: 'SP',
      monthIndex: 30,
      currentUfs: [uf('SP', 0.7)],
      history: longHistory,
    })!;
    expect(v.series.map((p) => p.monthIndex)).toEqual(
      Array.from({ length: REGIONAL_SERIES_WINDOW_MONTHS + 1 }, (_, i) => 18 + i),
    );
    expect(v.seriesCaption).toBe('Últimos 12 meses');
    expect(v.sinceStart.text).toBe('+30,0 p.p.');
  });

  it('o mês atual vem do estado, mesmo que o banco ainda não tenha o ponto', () => {
    const series = seriesWindow(approval, [point(0, 0.5), point(1, 0.51)], 'SP', 2, 0.6);
    expect(series).toEqual([
      { monthIndex: 0, value: 0.5 },
      { monthIndex: 1, value: 0.51 },
      { monthIndex: 2, value: 0.6 },
    ]);
  });

  it('um ponto do banco para o mês atual não duplica o do estado', () => {
    const series = seriesWindow(approval, [point(1, 0.5), point(2, 0.1)], 'SP', 2, 0.6);
    expect(series.map((p) => p.monthIndex)).toEqual([1, 2]);
    expect(series[1].value).toBe(0.6);
  });

  it('legenda no singular com um mês só', () => {
    const v = buildUfSeriesView({
      metric: approval,
      ufId: 'SP',
      monthIndex: 1,
      currentUfs: [uf('SP', 0.55)],
      history: [point(0, 0.5)],
    })!;
    expect(v.seriesCaption).toBe('Último mês');
    expect(v.seriesStartText).toBe('50,0%');
    expect(v.seriesTone).toBe('positive');
  });
});

describe('mini-série desenhada', () => {
  it('o eixo x segue o mês (lacunas aparecem como vãos) e o y sobe com o valor', () => {
    const pts = sparklinePoints(
      [
        { monthIndex: 0, value: 0.4 },
        { monthIndex: 1, value: 0.5 },
        { monthIndex: 4, value: 0.6 },
      ],
      104,
      54,
      2,
    );
    expect(pts[0]).toEqual({ x: 2, y: 52 });
    expect(pts[1].x).toBeCloseTo(2 + 25, 5);
    expect(pts[2]).toEqual({ x: 102, y: 2 });
    expect(pts[1].y).toBeLessThan(pts[0].y);
  });

  it('série constante vira uma linha no meio, sem NaN', () => {
    const pts = sparklinePoints(
      [
        { monthIndex: 0, value: 0.5 },
        { monthIndex: 1, value: 0.5 },
      ],
      100,
      40,
      0,
    );
    expect(pts.map((p) => p.y)).toEqual([20, 20]);
    expect(sparklinePoints([], 100, 40, 0)).toEqual([]);
  });
});

describe('indicador do mapa → série', () => {
  it('cada camada usa o seu campo; renda cai na aprovação', () => {
    expect(seriesMetricFor('aprovacao').field).toBe('approval');
    expect(seriesMetricFor('desemprego').field).toBe('unemployment');
    expect(seriesMetricFor('crescimento').field).toBe('growthGap12m');
    expect(seriesMetricFor('governador').field).toBe('governorRelation');
    expect(seriesMetricFor('renda').field).toBe('approval');
  });
});
