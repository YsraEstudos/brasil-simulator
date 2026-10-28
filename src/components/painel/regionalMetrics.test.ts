import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { alignmentView, createInitialState, type UfExplanation } from '@/engine';

import {
  availableIndicators,
  bin,
  binColor,
  DIVERGING,
  explanationFor,
  formatValue,
  indicatorSpec,
  legendLabels,
  MAP_INDICATORS,
  mapFills,
  mapRows,
  MAX_PIECES,
  paletteOf,
  formatPiece,
  DRYNESS_PALETTE,
  RAIN_PALETTE,
  SEQUENTIAL,
} from './regionalMetrics';

// Mapa da federação do Painel (GAME_DESIGN.md §4.5): valores, faixas de cor e explicação por UF.

const content = loadContent(DEFAULT_SCENARIO_ID);
const state = createInitialState({ content, difficulty: 'estrategica', seed: 1 });

describe('mapa da federação', () => {
  it('cada indicador dá uma linha e uma cor por UF', () => {
    for (const m of MAP_INDICATORS) {
      const rows = mapRows(m.id, state, content);
      expect(rows).toHaveLength(27);
      const palette = paletteOf(m);
      for (const r of rows) expect(palette).toContain(r.color);
      expect(Object.keys(mapFills(rows))).toHaveLength(27);
    }
  });

  it('divergente: na média = cinza do meio; pior que a média = vermelho, nos dois sentidos', () => {
    const unemployment = indicatorSpec('desemprego');
    expect(bin(unemployment, 0)).toBe(2);
    expect(bin(unemployment, 0.05)).toBe(0);
    expect(bin(unemployment, -0.05)).toBe(4);
    const approval = indicatorSpec('aprovacao');
    expect(bin(approval, 0.05)).toBe(4);
    expect(legendLabels(unemployment)[0]).toBe('bem acima');
    expect(legendLabels(approval)[0]).toBe('bem abaixo');
  });

  it('renda per capita: o DF e SP na faixa mais alta, o MA na mais baixa', () => {
    const rows = mapRows('renda', state, content);
    const color = (id: string) => rows.find((r) => r.uf.id === id)?.color;
    expect(color('DF')).toBe(SEQUENTIAL[4]);
    expect(color('MA')).toBe(SEQUENTIAL[0]);
    // A renda relativa média, ponderada pela população, é 1.
    expect(rows.reduce((s, r) => s + r.populationShare * r.value, 0)).toBeCloseTo(1, 12);
  });

  it('explicação: no máximo 5 linhas, a soma mantida quando o resto é relevante', () => {
    const pieces = Array.from({ length: 8 }, (_, i) => ({ cause: `c${i}`, label: `C${i}`, delta: 0.01 / (i + 1) }));
    const x: UfExplanation = { id: 'BA', activity: pieces, unemployment: [], approval: [] };
    const shown = explanationFor('crescimento', x);
    expect(shown.length).toBeLessThanOrEqual(MAX_PIECES);
    expect(shown.reduce((s, p) => s + p.delta, 0)).toBeCloseTo(
      pieces.reduce((s, p) => s + p.delta, 0),
      12,
    );
    expect(shown.at(-1)?.label).toBe('Outras causas');
    expect(explanationFor('aprovacao', { ...x, approval: [{ cause: 'a', label: 'A', delta: 1e-6 }] })).toEqual([]);
  });
});

describe('camada Alinhamento (PLANO_GLOBO.md §5.2)', () => {
  const liberal = createInitialState({ content, difficulty: 'estrategica', seed: 1, profile: 'liberal' });

  it('o valor da UF é o desvio de aprovação do alinhamento, com média ponderada zero', () => {
    const rows = mapRows('alinhamento', liberal, content);
    const view = alignmentView(liberal, content);
    expect(rows).toHaveLength(27);
    for (const r of rows) {
      expect(r.value).toBe(view?.ufs.find((u) => u.id === r.uf.id)?.approvalDeviation);
      expect(DIVERGING).toContain(r.color);
    }
    expect(rows.reduce((sum, r) => sum + r.populationShare * r.value, 0)).toBeCloseTo(0, 12);
  });

  it('azul = alinhado, vermelho = distante; a lista ordena do mais alinhado ao mais distante', () => {
    const spec = indicatorSpec('alinhamento');
    expect(binColor(spec, bin(spec, 0.03))).toBe(DIVERGING[4]);
    expect(binColor(spec, bin(spec, -0.03))).toBe(DIVERGING[0]);
    expect(binColor(spec, bin(spec, 0))).toBe(DIVERGING[2]);
    expect(legendLabels(spec)).toEqual(['bem distante', 'distante', 'na média', 'alinhado', 'bem alinhado']);
    expect(formatValue('alinhamento', 0.012)).toBe('+1,2 p.p.');
  });

  it('um perfil liberal alinha mais o Sul do que o Nordeste (e o contrário para o estatista)', () => {
    const sul = (st: typeof liberal) => mapRows('alinhamento', st, content).find((r) => r.uf.id === 'SC')?.value ?? 0;
    const nordeste = (st: typeof liberal) =>
      mapRows('alinhamento', st, content).find((r) => r.uf.id === 'MA')?.value ?? 0;
    expect(sul(liberal)).toBeGreaterThan(nordeste(liberal));
    const esquerda = { ...liberal, government: { profile: { economic: -0.6, social: -0.4 } } };
    expect(nordeste(esquerda)).toBeGreaterThan(sul(esquerda));
  });

  it('a explicação da UF na camada usa as causas da aprovação', () => {
    const x: UfExplanation = {
      id: 'BA',
      activity: [{ cause: 'a', label: 'Atividade', delta: 0.01 }],
      unemployment: [],
      approval: [{ cause: 'alinhamento_perfil', label: 'Alinhamento com o perfil do governo', delta: 0.01 }],
    };
    expect(explanationFor('alinhamento', x).map((p) => p.cause)).toEqual(['alinhamento_perfil']);
  });

  it('só é oferecida quando o cenário traz a inclinação das UFs', () => {
    expect(availableIndicators(content).map((m) => m.id)).toContain('alinhamento');
    const antigo = loadContent('brasil_2027_01_v070');
    expect(availableIndicators(antigo).map((m) => m.id)).not.toContain('alinhamento');
    // Sem inclinação somem o Alinhamento e a Inclinação política; Intenção e Resultado dependem só das eleições. O
    // Reconhecimento do candidato só existe antes da posse (Fase C4).
    expect(availableIndicators(antigo).map((m) => m.id)).not.toContain('inclinacao');
    expect(availableIndicators(antigo)).toHaveLength(MAP_INDICATORS.length - 3);
  });
});

describe('camadas Chuva e Seca (PLANO_GLOBO.md §4.2)', () => {
  /** Estado com o clima dado por UF (`rain`, `dryness`); as demais ficam neutras. */
  function withClimate(over: Record<string, { rain?: number; dryness?: number }>) {
    return {
      ...state,
      climate: {
        ...state.climate,
        ufs: state.climate.ufs.map((u) => ({ ...u, ...over[u.id] })),
      },
    };
  }
  const wet = withClimate({
    BA: { rain: -0.4, dryness: 0.9 },
    PI: { rain: -0.08, dryness: 0.6 },
    CE: { rain: 0.02, dryness: 0.3 },
    SP: { rain: 0.1, dryness: 0.12 },
    RS: { rain: 0.5, dryness: 0 },
  });
  const rain = (id: string) => mapRows('chuva', wet, content).find((r) => r.uf.id === id)!;
  const dry = (id: string) => mapRows('seca', wet, content).find((r) => r.uf.id === id)!;

  it('estão no seletor com escala, paleta e legenda de cinco faixas', () => {
    expect(availableIndicators(content).map((m) => m.id)).toEqual(expect.arrayContaining(['chuva', 'seca']));
    expect(indicatorSpec('chuva').scale).toBe('diverging');
    expect(indicatorSpec('seca').scale).toBe('sequential');
    for (const id of ['chuva', 'seca'] as const) {
      const spec = indicatorSpec(id);
      expect(paletteOf(spec)).toHaveLength(5);
      expect(legendLabels(spec)).toHaveLength(5);
    }
    expect(paletteOf(indicatorSpec('chuva'))).toEqual([...RAIN_PALETTE]);
    expect(paletteOf(indicatorSpec('seca'))).toEqual([...DRYNESS_PALETTE]);
  });

  it('o valor da UF é a anomalia de chuva e o índice de seca do estado do jogo', () => {
    expect(rain('BA').value).toBe(-0.4);
    expect(rain('RS').value).toBe(0.5);
    expect(dry('BA').value).toBe(0.9);
    expect(dry('RS').value).toBe(0);
    // clima neutro: chuva 0 (na normal) e seca 0 (sem seca) em todas as UFs
    for (const r of mapRows('chuva', state, content)) expect(r.value).toBe(0);
    for (const r of mapRows('seca', state, content)) expect(r.value).toBe(0);
  });

  it('chuva: marrom = mais seco que a normal, azul = mais chuvoso, cinza = na normal', () => {
    const spec = indicatorSpec('chuva');
    expect(rain('BA').color).toBe(RAIN_PALETTE[0]); // −40%: bem mais seco
    expect(rain('PI').color).toBe(RAIN_PALETTE[1]); // −8%: mais seco
    expect(rain('CE').color).toBe(RAIN_PALETTE[2]); // +2%: normal
    expect(rain('SP').color).toBe(RAIN_PALETTE[3]); // +10%: mais chuvoso
    expect(rain('RS').color).toBe(RAIN_PALETTE[4]); // +50%: bem mais chuvoso
    expect(legendLabels(spec)).toEqual(['bem mais seco', 'mais seco', 'normal', 'mais chuvoso', 'bem mais chuvoso']);
    expect(formatValue('chuva', 0.25)).toBe('+25%');
    expect(formatValue('chuva', -0.4)).toBe('−40%');
    expect(formatValue('chuva', 0)).toBe('0%');
  });

  it('seca: faixas sem / leve / moderada / forte / severa nos limites 10, 25, 50 e 75%', () => {
    const spec = indicatorSpec('seca');
    expect([0, 0.09, 0.1, 0.24, 0.25, 0.49, 0.5, 0.74, 0.75, 1].map((v) => bin(spec, v))).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3, 4, 4,
    ]);
    expect(dry('BA').color).toBe(DRYNESS_PALETTE[4]);
    expect(dry('PI').color).toBe(DRYNESS_PALETTE[3]);
    expect(dry('CE').color).toBe(DRYNESS_PALETTE[2]);
    expect(dry('SP').color).toBe(DRYNESS_PALETTE[1]);
    expect(dry('RS').color).toBe(DRYNESS_PALETTE[0]);
    expect(legendLabels(spec)).toEqual(['sem seca', 'leve', 'moderada', 'forte', 'severa']);
    expect(formatValue('seca', 0.9)).toBe('90%');
  });

  it('a lista ordena a chuva do mais chuvoso ao mais seco e a seca da menos à mais seca', () => {
    const order = (id: 'chuva' | 'seca') => {
      const spec = indicatorSpec(id);
      return [...mapRows(id, wet, content)]
        .sort((a, b) => (spec.goodWhen === 'up' ? b.value - a.value : a.value - b.value))
        .map((r) => r.uf.id);
    };
    expect(order('chuva')[0]).toBe('RS');
    expect(order('chuva').at(-1)).toBe('BA');
    expect(order('seca').at(-1)).toBe('BA');
    expect(indicatorSpec('seca').goodWhen).toBe('down');
  });

  it('cada UF tem uma linha e uma cor da paleta própria; os mapas de calor dão 27 cores', () => {
    for (const id of ['chuva', 'seca'] as const) {
      const rows = mapRows(id, wet, content);
      expect(rows).toHaveLength(27);
      for (const r of rows) expect(paletteOf(indicatorSpec(id))).toContain(r.color);
      expect(Object.keys(mapFills(rows))).toHaveLength(27);
    }
  });

  it('a explicação usa só as causas do clima: chuva no humor (p.p.), seca na atividade (%)', () => {
    const x: UfExplanation = {
      id: 'BA',
      activity: [
        { cause: 'clima_seca', label: 'Seca', delta: -0.004 },
        { cause: 'outra', label: 'Outra', delta: 0.01 },
      ],
      unemployment: [],
      approval: [
        { cause: 'clima_chuvas_humor', label: 'Chuvas acima do normal', delta: -0.003 },
        { cause: 'outra', label: 'Outra', delta: 0.01 },
      ],
    };
    expect(explanationFor('chuva', x).map((p) => p.cause)).toEqual(['clima_chuvas_humor']);
    expect(explanationFor('seca', x).map((p) => p.cause)).toEqual(['clima_seca']);
    // A prevenção (PR 13) é parte da explicação da seca: o dano evitado aparece ao lado do dano.
    const protectedUf: UfExplanation = {
      ...x,
      activity: [
        ...x.activity,
        { cause: 'clima_seca_prevencao', label: 'Prevenção reduziu o dano da seca', delta: 0.002 },
      ],
    };
    expect(explanationFor('seca', protectedUf).map((p) => p.cause)).toEqual(['clima_seca', 'clima_seca_prevencao']);
    expect(formatPiece('chuva', -0.003)).toBe('−0,3 p.p.');
    expect(formatPiece('seca', -0.004)).toBe('−0,4%');
  });
});
