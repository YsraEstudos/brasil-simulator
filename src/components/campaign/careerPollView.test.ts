import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { advanceMonth, createInitialState } from '@/engine';

import { careerPollViewModel } from './careerPollView';

// PLANO_CAMPANHA.md Fase C2 ("Pesquisas e visibilidade"): o que o jogador vê da pesquisa.

const content = loadContent(DEFAULT_SCENARIO_ID);
const start = () => createInitialState({ content, difficulty: 'estrategica', seed: 4, startPoint: 'corrida' });

describe('leitura da pesquisa na tela (PLANO_CAMPANHA.md Fase C2)', () => {
  it('sem pesquisa antes do primeiro turno; depois, data, margem, faixas e explicação em texto', () => {
    expect(careerPollViewModel(start(), content)).toBeNull();
    const r = advanceMonth(start(), { decisions: [] }, content);
    const view = careerPollViewModel(r.state, content, r.report)!;
    expect(view.subtitle).toMatch(/^Agosto de 2026/);
    expect(view.subtitle).toContain('instituto fictício');
    expect(view.subtitle).toContain('estimativa simulada');
    expect(view.rows.find((row) => row.player)).toMatchObject({ id: 'jogador', label: 'Você' });
    const candidates = r.state.career!.poll!.intentions.map((i) => i.share).sort((a, b) => b - a);
    expect(view.rows.slice(0, -2).map((row) => row.share)).toEqual(candidates.map((x) => `${Math.round(x * 100)}%`));
    expect(view.rows.map((row) => row.id).slice(-2)).toEqual(['indecisos', 'brancos_nulos']);
    expect(view.margin).toBe('Margem de erro: 2 pontos para mais ou para menos.');
    expect(view.bands.flatMap((b) => b.ufs).sort()).toEqual(content.scenario.regions!.ufs.map((u) => u.id).sort());
    // Na campanha o reconhecimento sobe: só a causa que puxou para cima aparece.
    expect(view.why).toEqual(['A exposição da campanha contribuiu para aumentar seu reconhecimento.']);
    // Nada de coeficientes do motor na tela: só percentuais inteiros e texto.
    expect(view.rows.every((row) => /^\d+%$/.test(row.share))).toBe(true);
  });
});
