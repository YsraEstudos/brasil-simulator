import { describe, expect, it } from 'vitest';

import { REVENUE_GROUPS, type RevenueGroup } from '@/engine';
import type { TurnReading } from '@/store/recentTurns';

import { rigidityShare } from './economyInsights';
import { floorProjection, linearSlope, revenueYearOverYear, squeeze, taxFatigue } from './fiscalHistoryModel';

function reading(turnIndex: number, over: Partial<TurnReading> = {}): TurnReading {
  return {
    turnIndex,
    monthIndex: turnIndex,
    revenue: 0.18,
    realGdpIndex: 1,
    priceLevel: 1,
    discretionary: 0.012,
    sectors: {},
    quintiles: {},
    ...over,
  };
}

/** Série de 13 turnos com discricionárias `start + step × t`. */
const series = (start: number, step: number) =>
  Array.from({ length: 13 }, (_, t) => reading(t, { discretionary: start + step * t }));

describe('A67: arrecadação contra o mesmo mês do ano anterior', () => {
  it('no primeiro ano não há base de comparação', () => {
    const r = revenueYearOverYear([reading(0), reading(1)]);
    expect(r?.kind).toBe('sem_base');
    expect(r?.text).toBe('Arrecadação de fev/2027: sem o mesmo mês do ano anterior');
  });

  it('real desconta a inflação: receita × PIB real; nominal soma o nível de preços', () => {
    const trail = [
      reading(14, { revenue: 0.18, realGdpIndex: 1, priceLevel: 1 }),
      ...Array.from({ length: 11 }, (_, i) => reading(15 + i)),
      reading(26, { revenue: 0.18 * 1.02, realGdpIndex: 1.02, priceLevel: 1.05 }),
    ];
    const r = revenueYearOverYear(trail);
    expect(r?.kind).toBe('ok');
    if (r?.kind !== 'ok') return;
    expect(r.real).toBeCloseTo(1.02 * 1.02 - 1, 12);
    expect(r.nominal).toBeCloseTo(1.02 * 1.02 * 1.05 - 1, 12);
    expect(r.text).toBe('Arrecadação de mar/2029 contra mar/2028: +4,0% real');
  });

  it('sem leitura do turno de 12 meses atrás (buraco na trilha), não inventa', () => {
    expect(revenueYearOverYear([reading(13), reading(25)])?.kind).toBe('ok');
    expect(revenueYearOverYear([reading(12), reading(25)])?.kind).toBe('sem_base');
  });
});

describe('C3: raio-X do esmagamento', () => {
  const f = {
    mandatory: { previdencia: 0.08, beneficios: 0.02, pessoal: 0.03, outras: 0.01 },
    linked: 0.03,
    policyMandatory: 0.002,
    discretionary: 0.015,
  };

  it('as partes somam 1 e o engessamento é o mesmo do rigidityShare', () => {
    const s = squeeze(f, 0.01);
    expect(s.segments.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1, 12);
    expect(s.segments.find((x) => x.id === 'piso')?.value).toBeCloseTo(0.01, 12);
    expect(s.segments.find((x) => x.id === 'acima_piso')?.value).toBeCloseTo(0.005, 12);
    expect(s.rigidity).toBe(rigidityShare(f));
    expect(s.belowFloor).toBe(0);
  });

  it('abaixo do piso: a parte acima do piso é zero e mostra quanto falta', () => {
    const s = squeeze({ ...f, discretionary: 0.008 }, 0.01);
    expect(s.segments.find((x) => x.id === 'acima_piso')?.value).toBe(0);
    expect(s.belowFloor).toBeCloseTo(0.002, 12);
  });

  it('reta de mínimos quadrados', () => {
    expect(linearSlope([0, 1, 2, 3].map((x) => ({ x, y: 2 + 3 * x })))).toBeCloseTo(3, 12);
    expect(linearSlope([{ x: 1, y: 5 }])).toBe(0);
  });

  it('série decrescente: chega ao piso em N meses', () => {
    // 0,020 − 0,0005 × 12 = 0,014; até 0,010 faltam 0,004 a 0,0005 por mês = 8 meses.
    const p = floorProjection(series(0.02, -0.0005), 0.01);
    expect(p.kind).toBe('caindo');
    if (p.kind !== 'caindo') return;
    expect(p.months).toBe(8);
    expect(p.text).toBe('Estimativa: no ritmo dos últimos 12 meses, as discricionárias chegam ao piso em 8 meses.');
  });

  it('série estável e série crescente: não chegam ao piso', () => {
    expect(floorProjection(series(0.02, 0), 0.01).kind).toBe('estavel');
    expect(floorProjection(series(0.02, 0.0005), 0.01).kind).toBe('subindo');
  });

  it('queda muito lenta, poucos pontos e já abaixo do piso', () => {
    const slow = floorProjection(series(0.02, -0.00002), 0.01);
    expect(slow.text).toContain('em mais de 10 anos');
    expect(floorProjection([reading(0), reading(1)], 0.01).kind).toBe('sem_serie');
    expect(floorProjection(series(0.009, -0.0001), 0.01).kind).toBe('abaixo');
  });
});

describe('C7: fadiga tributária por base', () => {
  const zero = Object.fromEntries(REVENUE_GROUPS.map((g) => [g, 0])) as Record<RevenueGroup, number>;
  const revenueByGroup = { renda: 0.041, folha: 0.05, consumo: 0.05, outras: 0.02, royalties: 0.01 };

  it('taxa = perda ÷ (arrecadado + perda) e saturação = taxa ÷ perda_max', () => {
    const fat = taxFatigue({ revenueByGroup, revenueLossByGroup: { ...zero, renda: 0.009 } }, 0.3);
    expect(fat?.map((x) => x.group)).toEqual(['renda', 'folha', 'consumo', 'outras']);
    const renda = fat?.[0];
    expect(renda?.rate).toBeCloseTo(0.18, 12);
    expect(renda?.saturation).toBeCloseTo(0.6, 12);
    expect(renda?.text).toBe('De cada R$ 1 cobrado, R$ 0,18 se perde (60% do máximo)');
    expect(fat?.[1].text).toBe('Sem perda: a carga está dentro da margem que a base aguenta');
  });

  it('estado sem o campo novo: sem detalhe', () => {
    expect(taxFatigue({ revenueByGroup }, 0.3)).toBeNull();
  });
});
