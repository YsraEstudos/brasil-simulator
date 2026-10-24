import { describe, expect, it } from 'vitest';

import {
  availableIndicators,
  bin,
  binColor,
  formatValue,
  indicatorSpec,
  layerBadge,
  legendLabels,
  mapFills,
  mapRows,
  paletteOf,
  VOTE_PALETTE,
} from '@/components/painel/regionalMetrics';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { advanceMonth, createInitialState, regionalVoteIntention, type ElectionResult, type GameState } from '@/engine';

import {
  badgeText,
  buildUfElectoralView,
  decidingRound,
  electionDate,
  electoralValues,
  leanPosition,
  nextGeneralElectionMonth,
  resultLayerHint,
} from './electoralView';
import { buildRegionalMapViewModel } from './regionalMapViewModel';

// PLANO_GLOBO.md §5.3: quatro camadas rotuladas; a intenção é sempre "estimativa" e o "resultado" só existe depois da
// eleição (§8, testes 3 e 8).

const content = loadContent(DEFAULT_SCENARIO_ID);
const electionMonth = content.scenario.elections!.mesEleicaoGeral;
const start = createInitialState({ content, difficulty: 'estrategica', seed: 5 });

function playTo(monthIndex: number): { state: GameState; election: ElectionResult | null } {
  let state = start;
  let election: ElectionResult | null = null;
  while (state.monthIndex < monthIndex) {
    const r = advanceMonth(state, { decisions: [] }, content);
    election = r.report.electionResult ?? election;
    state = r.state;
  }
  return { state, election };
}

const afterElection = playTo(electionMonth + 1);
if (!afterElection.election) throw new Error('a eleição deveria ter gerado resultado');
const election: ElectionResult = afterElection.election;

describe('camadas do mapa eleitoral no seletor', () => {
  it('as quatro estão no seletor, com a relação com o governador sob o mesmo título', () => {
    const layers = availableIndicators(content).filter((m) => m.group === 'eleitoral');
    expect(layers.map((m) => m.id)).toEqual(['governador', 'inclinacao', 'intencao', 'resultado']);
    expect(layers.map((m) => m.label)).toEqual([
      'Relação com o governador',
      'Inclinação política',
      'Intenção de voto',
      'Resultado da eleição',
    ]);
  });

  it('cenário sem eleições não oferece Intenção nem Resultado; sem inclinação, não oferece Inclinação', () => {
    const semEleicao = { ...content, scenario: { ...content.scenario, elections: undefined } };
    const ids = availableIndicators(semEleicao).map((m) => m.id);
    expect(ids).not.toContain('intencao');
    expect(ids).not.toContain('resultado');
    expect(ids).toContain('inclinacao');
    expect(availableIndicators(loadContent('brasil_2027_01_v070')).map((m) => m.id)).not.toContain('inclinacao');
  });

  it('cada camada tem cinco cores e cinco rótulos', () => {
    for (const id of ['inclinacao', 'intencao', 'resultado'] as const) {
      const spec = indicatorSpec(id);
      expect(paletteOf(spec)).toHaveLength(5);
      expect(legendLabels(spec)).toHaveLength(5);
    }
  });

  it('voto no governo: faixas de 10 p.p.; 50% é onde começa a quarta faixa', () => {
    const spec = indicatorSpec('intencao');
    expect([0.1, 0.29, 0.3, 0.39, 0.4, 0.49, 0.5, 0.59, 0.6, 0.9].map((v) => bin(spec, v))).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3, 4, 4,
    ]);
    expect(binColor(spec, 3)).toBe(VOTE_PALETTE[3]);
    expect(formatValue('intencao', 0.4123)).toBe('41,2%');
  });

  it('inclinação: o centro é cinza e os extremos têm cores opostas, sem vermelho nem azul de partido', () => {
    const spec = indicatorSpec('inclinacao');
    expect(bin(spec, 0)).toBe(2);
    expect(bin(spec, -0.45)).toBe(0);
    expect(bin(spec, 0.45)).toBe(4);
    expect(paletteOf(spec)).not.toContain('#e34948');
    expect(paletteOf(spec)).not.toContain('#3987e5');
    expect(formatValue('inclinacao', 0.45)).toBe('+0,45');
    expect(formatValue('inclinacao', -0.3)).toBe('−0,30');
  });
});

describe('selos "estimativa" × "resultado"', () => {
  it('a intenção é sempre "estimativa", nunca "resultado"', () => {
    expect(badgeText('intencao', null)).toBe('estimativa');
    expect(badgeText('intencao', election)).toBe('estimativa');
    expect(layerBadge('intencao', election)).toEqual({ text: 'estimativa', kind: 'estimate' });
    const model = buildRegionalMapViewModel({ indicator: 'intencao', fills: {}, election });
    expect(model.legend?.badge).toBe('estimativa');
  });

  it('o resultado leva a data da eleição', () => {
    expect(electionDate(45)).toBe('out/2030');
    expect(badgeText('resultado', election)).toBe('resultado · out/2030');
    expect(layerBadge('resultado', election)).toEqual({ text: 'resultado · out/2030', kind: 'result' });
  });

  it('a inclinação é dado do cenário, provisório; as demais camadas não têm selo', () => {
    expect(layerBadge('inclinacao')?.kind).toBe('data');
    for (const id of ['aprovacao', 'governador', 'alinhamento', 'chuva', 'seca'] as const) {
      expect(layerBadge(id, election)).toBeNull();
    }
  });
});

describe('Resultado: nunca antes de existir', () => {
  it('sem fotografia, o texto da camada diz quando ela aparece e as UFs não ganham valor', () => {
    expect(electoralValues('resultado', start, content, null)).toEqual({});
    expect(resultLayerHint(content, 0, null)).toContain('out/2030');
    expect(resultLayerHint(content, 0, null)).toContain('Ainda não há resultado');
    // Depois do pleito sem fotografia (save anterior à camada), aponta a próxima eleição.
    expect(nextGeneralElectionMonth(content, electionMonth + 1)).toBe(electionMonth + 48);
    expect(nextGeneralElectionMonth(content, electionMonth)).toBe(electionMonth);
  });

  it('com a fotografia, o mapa colore pelo voto simulado do último turno', () => {
    const rows = mapRows('resultado', afterElection.state, content, election);
    const last = decidingRound(election);
    expect(rows).toHaveLength(27);
    for (const r of rows) {
      expect(r.value).toBe(last.ufs[r.uf.id]);
      expect(paletteOf(indicatorSpec('resultado'))).toContain(r.color);
    }
    expect(Object.keys(mapFills(rows))).toHaveLength(27);
    expect(resultLayerHint(content, afterElection.state.monthIndex, election)).toContain('out/2030');
  });

  it('a soma ponderada do que o mapa mostra fecha com o resultado nacional', () => {
    const rows = mapRows('resultado', afterElection.state, content, election);
    const last = decidingRound(election);
    const sum = rows.reduce((s, r) => s + election.weights[r.uf.id] * r.value, 0);
    expect(Math.abs(sum - last.national)).toBeLessThan(1e-9);
  });
});

describe('Intenção estimada por UF', () => {
  it('as UFs do mapa são as da estimativa do motor, e a ponderada fecha com a intenção nacional', () => {
    const { state } = playTo(10);
    const estimate = regionalVoteIntention(state, content)!;
    const rows = mapRows('intencao', state, content);
    for (const r of rows) expect(r.value).toBe(estimate.ufs[r.uf.id]);
    const pop = rows.reduce((s, r) => s + r.populationShare, 0);
    const sum = rows.reduce((s, r) => s + (r.populationShare / pop) * r.value, 0);
    expect(Math.abs(sum - estimate.national)).toBeLessThan(1e-9);
  });

  it('já existe no primeiro mês e é uma leitura pura do estado', () => {
    const copy = structuredClone(start);
    expect(mapRows('intencao', start, content)).toHaveLength(27);
    expect(start).toEqual(copy);
  });
});

describe('Inclinação política', () => {
  it('é a média dos dois eixos do cenário, igual em qualquer mês', () => {
    const values = electoralValues('inclinacao', start, content, null);
    const sc = content.scenario.regions!.ufs.find((u) => u.id === 'SC')!;
    const ma = content.scenario.regions!.ufs.find((u) => u.id === 'MA')!;
    expect(values.SC).toBe(leanPosition(sc.lean!));
    expect(values.MA).toBeLessThan(0);
    expect(values.SC).toBeGreaterThan(0);
    expect(electoralValues('inclinacao', afterElection.state, content, election)).toEqual(values);
    expect(leanPosition(ma.lean!)).toBe(values.MA);
  });
});

describe('cartão da UF no mapa eleitoral', () => {
  it('intenção: selo "estimativa", número da UF e aviso de que não é resultado', () => {
    const view = buildUfElectoralView('intencao', 'BA', start, content, null)!;
    expect(view.badge).toBe('estimativa');
    expect(view.rows[0].label).toBe('Intenção de voto no governo');
    expect(view.rows[0].reference).toMatch(/^Brasil /);
    expect(view.notes.join(' ')).toContain('Estimativa, não resultado');
  });

  it('resultado: um turno por linha, a oposição no 2º turno e a troca de governo à parte', () => {
    const view = buildUfElectoralView('resultado', 'BA', afterElection.state, content, election)!;
    expect(view.badge).toBe('resultado · out/2030');
    const rounds = election.rounds.length;
    expect(view.rows.filter((r) => r.label.startsWith('Governo, ')).length).toBe(rounds === 2 ? 2 : 0);
    expect(view.rows.some((r) => r.label.startsWith('Oposição'))).toBe(rounds === 2);
    expect(view.rows[view.rows.length - 1].label).toBe('Governo do estado (eleição estadual)');
    expect(view.rows[view.rows.length - 1].value).toBe(
      election.governorChanges.includes('BA') ? 'trocou de dono' : 'manteve o campo',
    );
  });

  it('resultado sem fotografia não tem cartão', () => {
    expect(buildUfElectoralView('resultado', 'BA', start, content, null)).toBeNull();
  });

  it('inclinação: os dois eixos, a média e o aviso de dado provisório', () => {
    const view = buildUfElectoralView('inclinacao', 'SC', start, content, null)!;
    expect(view.badge).toBe('dado provisório');
    expect(view.rows).toHaveLength(3);
    expect(view.notes[0]).toContain('provisório');
  });
});
