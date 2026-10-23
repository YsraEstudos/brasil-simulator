import { describe, expect, it } from 'vitest';

import { SEQUENTIAL } from '@/components/painel/regionalMetrics';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import {
  buildRegionalDecisionPreview,
  createInitialState,
  regionsOf,
  type RegionalDecisionPreview,
  type RegionalPreviewUf,
} from '@/engine';

import {
  adhesionLine,
  barredNote,
  DISCLAIMER,
  lagLine,
  NO_DIFFERENTIAL_TEXT,
  previewFills,
  previewLegend,
  previewMapModel,
  previewModes,
  ratioText,
  selectedUfText,
  topHeading,
  topUfs,
  uncertaintyChips,
} from './regionalPreviewView';

// Prévia regional na tela (PLANO_GLOBO.md §5.2): cores, legenda, destaques e textos são estimativa e puros.

function uf(id: string, ratio: number, adhesion: number | null = null): RegionalPreviewUf {
  return { id, region: 'x', weight: ratio / 10, perCapitaRatio: ratio, adhesionProbability: adhesion };
}

function fake(overrides: Partial<RegionalDecisionPreview> = {}): RegionalDecisionPreview {
  return {
    policyId: 'p',
    differential: true,
    key: 'populacao',
    direction: 'benefit',
    ufs: [uf('AC', 0.4), uf('BA', 2.14), uf('SP', 0.95), uf('PI', 1.6), uf('RJ', 1.3)],
    adhesion: null,
    lagMonths: null,
    uncertain: [],
    barred: null,
    ...overrides,
  } as RegionalDecisionPreview;
}

describe('cores e legenda', () => {
  it('pinta cada UF pela faixa da razão por habitante, na escala sequencial', () => {
    const fills = previewFills(fake(), 'impact');
    expect(fills).toEqual({
      AC: SEQUENTIAL[0], // < 0,6
      BA: SEQUENTIAL[4], // ≥ 2
      SP: SEQUENTIAL[2], // 0,9–1,25
      PI: SEQUENTIAL[3], // 1,25–2
      RJ: SEQUENTIAL[3],
    });
  });

  it('sem efeito regional diferente não pinta nada no modo impacto e não oferece o modo', () => {
    const p = fake({ differential: false, key: null });
    expect(previewFills(p, 'impact')).toEqual({});
    expect(previewLegend(p, 'impact')).toBeNull();
    expect(previewModes(p)).toEqual([]);
    expect(topUfs(p)).toEqual([]);
  });

  it('legenda de impacto: título pedido e cinco faixas legíveis', () => {
    const legend = previewLegend(fake(), 'impact');
    expect(legend?.title).toBe('Onde pesa mais por habitante (estimativa)');
    expect(legend?.entries.map((e) => e.label)).toEqual(['< 0,6×', '0,6–0,9×', '0,9–1,25×', '1,25–2×', '> 2×']);
    expect(legend?.entries.map((e) => e.color)).toEqual([...SEQUENTIAL]);
  });

  it('modo adesão colore pela chance do governador e tem legenda própria', () => {
    const p = fake({ ufs: [uf('AC', 1, 0.1), uf('BA', 1, 0.5), uf('SP', 1, 0.95)] });
    expect(previewModes(p)).toEqual(['impact', 'adhesion']);
    expect(previewFills(p, 'adhesion')).toEqual({ AC: SEQUENTIAL[0], BA: SEQUENTIAL[2], SP: SEQUENTIAL[4] });
    expect(previewLegend(p, 'adhesion')?.entries.map((e) => e.label)).toEqual([
      '< 20%',
      '20–40%',
      '40–60%',
      '60–80%',
      '> 80%',
    ]);
  });

  it('adesão sem perfil regional: só o modo adesão existe', () => {
    const p = fake({ differential: false, key: null, ufs: [uf('AC', 1, 0.3), uf('BA', 1, 0.7)] });
    expect(previewModes(p)).toEqual(['adhesion']);
  });

  it('o modelo do mini-mapa é do tipo prévia, com a seleção e a legenda do modo', () => {
    const vm = previewMapModel(fake(), 'impact', 'BA');
    expect(vm.mode).toBe('preview');
    expect(vm.selectedId).toBe('BA');
    expect(vm.legend?.title).toContain('por habitante');
    expect(vm.fills.BA).toBe(SEQUENTIAL[4]);
  });
});

describe('textos', () => {
  it('três UFs de destaque, da maior razão para a menor, com "× a média"', () => {
    const top = topUfs(fake(), { BA: 'Bahia', PI: 'Piauí' });
    expect(top.map((t) => t.id)).toEqual(['BA', 'PI', 'RJ']);
    expect(top[0]).toMatchObject({ name: 'Bahia', text: '2,1× a média' });
    expect(top[2].name).toBe('RJ');
    expect(ratioText(1)).toBe('1,0× a média');
  });

  it('título da lista muda entre benefício e custo', () => {
    expect(topHeading(fake())).toBe('Chega mais, por habitante, a');
    expect(topHeading(fake({ direction: 'cost' }))).toBe('Pesa mais, por habitante, em');
  });

  it('linha de adesão arredonda os estados e cita a população', () => {
    const p = fake({ adhesion: { expectedStates: 11.6, expectedPopulationShare: 0.481 } });
    expect(adhesionLine(p)).toBe('Adesão esperada: ~12 de 5 estados (cerca de 48% da população)');
    expect(adhesionLine(fake())).toBeNull();
  });

  it('linha de atraso: nada se for imediato; singular, plural e intervalo', () => {
    expect(lagLine(fake())).toBeNull();
    expect(lagLine(fake({ lagMonths: { earliest: 0, longest: 0 } }))).toBeNull();
    expect(lagLine(fake({ lagMonths: { earliest: 1, longest: 1 } }))).toBe(
      'Efeito começa 1 mês depois do início da execução',
    );
    expect(lagLine(fake({ lagMonths: { earliest: 3, longest: 3 } }))).toBe(
      'Efeito começa 3 meses depois do início da execução',
    );
    expect(lagLine(fake({ lagMonths: { earliest: 2, longest: 6 } }))).toBe(
      'Efeito começa 2 meses depois do início da execução e chega por inteiro em até 6 meses',
    );
    expect(lagLine(fake({ lagMonths: { earliest: 0, longest: 3 } }))).toMatch(
      /começa junto com a execução.*3 meses depois/,
    );
  });

  it('fichas de incerteza e aviso de impedimento em português', () => {
    const p = fake({
      uncertain: ['votacao_congresso', 'adesao_sorteada', 'efeito_defasado'],
      barred: 'vedacao_eleitoral',
    });
    expect(uncertaintyChips(p)).toEqual([
      'Depende de votação no Congresso',
      'Adesão dos governadores é sorteada',
      'Efeito com atraso',
    ]);
    expect(barredNote(p)).toMatch(/Vedação eleitoral/);
    expect(barredNote(fake({ barred: 'reedicao_vedada' }))).toMatch(/reeditada/);
    expect(barredNote(fake())).toBeNull();
  });

  it('texto da UF tocada segue o modo e cai para "sem efeito" quando não há dado', () => {
    const p = fake({ ufs: [uf('BA', 2.14, 0.55)] });
    expect(selectedUfText(p, 'BA', 'impact', { BA: 'Bahia' })).toBe('Bahia (BA): 2,1× a média · chance de aderir 55%');
    expect(selectedUfText(p, 'BA', 'adhesion', { BA: 'Bahia' })).toBe(
      'Bahia (BA): chance de aderir 55% · 2,1× a média',
    );
    expect(selectedUfText(p, 'ZZ', 'impact')).toBeNull();
    const flat = fake({ differential: false, key: null, ufs: [uf('BA', 1.2)] });
    expect(selectedUfText(flat, 'BA', 'impact')).toBe('BA (BA): sem efeito regional diferente');
  });

  it('textos fixos', () => {
    expect(DISCLAIMER).toBe('Estimativa — não é garantia');
    expect(NO_DIFFERENTIAL_TEXT).toBe('Sem efeito regional diferente (segue o PIB de cada estado)');
  });
});

describe('com o cenário real', () => {
  const content = loadContent(DEFAULT_SCENARIO_ID);
  const state = createInitialState({ content, difficulty: 'estrategica', seed: 3 });
  const names = Object.fromEntries(regionsOf(content).map((u) => [u.id, u.name]));

  it('toda política vira uma prévia legível: uma cor por UF quando há perfil, nada quando não há', () => {
    let differential = 0;
    let plain = 0;
    for (const id of content.scenario.policies) {
      const preview = buildRegionalDecisionPreview(state, content, id);
      if (!preview) continue;
      const fills = previewFills(preview, 'impact');
      if (preview.differential) {
        differential++;
        expect(Object.keys(fills)).toHaveLength(preview.ufs.length);
        expect(topUfs(preview, names)).toHaveLength(3);
      } else {
        plain++;
        expect(fills).toEqual({});
      }
      for (const c of uncertaintyChips(preview)) expect(c.length).toBeGreaterThan(5);
    }
    expect(differential).toBeGreaterThan(0);
    expect(plain).toBeGreaterThan(0);
  });
});
