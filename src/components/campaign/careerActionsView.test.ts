import { describe, expect, it } from 'vitest';

import { buildUfElectoralView } from '@/components/map/electoralView';
import { availableIndicators, legendLabels, mapRows, indicatorSpec } from '@/components/painel/regionalMetrics';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { advanceMonth, createInitialState, DEBATE_ACTION_ID, type Decision } from '@/engine';

import { careerActionsViewModel, imageLabel, riskLabel } from './careerActionsView';

// PLANO_CAMPANHA.md Fase C4 (tarefas C4.3 e C4.4): o que o jogador vê das ações, do debate e do mapa.

const content = loadContent(DEFAULT_SCENARIO_ID);
const start = () => createInitialState({ content, difficulty: 'estrategica', seed: 4, startPoint: 'corrida' });
const act = (policyId: string, params: Decision['params'] = {}): Decision => ({
  policyId,
  agendaCost: 0,
  params: { bolso: 'party', ...params },
});

describe('cartão das ações de campanha (PLANO_CAMPANHA.md Fase C4, C4.4)', () => {
  it('lista as ações com custo, conta as marcadas e trava quando o turno está cheio', () => {
    const s = start();
    const empty = careerActionsViewModel(s, content, [])!;
    expect(empty.slots).toBe('Ações do turno: 0 de 3');
    expect(empty.actions.map((a) => a.id)).toEqual([
      'comicio_nacional',
      'caravana_regional',
      'mobilizar_militancia',
      'ataque_adversario',
    ]);
    expect(empty.actions.every((a) => a.unavailable === undefined && a.cost.startsWith('R$'))).toBe(true);
    const marked = [act('mobilizar_militancia'), act('caravana_regional', { uf: 'MG' }), act('arrecadar_doacoes')];
    const full = careerActionsViewModel(s, content, marked)!;
    expect(full.slots).toBe('Ações do turno: 3 de 3');
    expect(full.actions.find((a) => a.id === 'caravana_regional')).toMatchObject({
      selected: true,
      selectedTarget: 'MG',
    });
    expect(full.actions.find((a) => a.id === 'comicio_nacional')!.unavailable).toMatch(/já estão marcadas/);
  });

  it('adversários em faixas de imagem e risco, sem números do motor', () => {
    const view = careerActionsViewModel(start(), content, [])!;
    for (const o of view.opponents) {
      expect(['imagem boa', 'imagem neutra', 'imagem desgastada']).toContain(o.image);
      expect(['risco baixo', 'risco médio', 'risco alto']).toContain(o.risk);
      expect(`${o.image} ${o.risk}`).not.toMatch(/\d/);
    }
    expect(imageLabel(0.5)).toBe('imagem boa');
    expect(riskLabel(0.8)).toBe('risco alto');
  });

  it('o debate aparece só no turno dele, com a postura padrão avisada; o resultado vira texto no turno seguinte', () => {
    const s0 = start();
    expect(careerActionsViewModel(s0, content, [])!.debate).toBeNull();
    const s1 = advanceMonth(s0, { decisions: [] }, content).state;
    const chosen = [{ policyId: DEBATE_ACTION_ID, agendaCost: 0, params: { postura: 'tecnica' } }];
    const view = careerActionsViewModel(s1, content, chosen)!;
    expect(view.debate!.defaultNote).toMatch(/propositiva/);
    expect(view.debate!.rows.find((r) => r.selected)).toMatchObject({ posture: 'tecnica' });
    expect(view.debate!.rows.filter((r) => r.posture === 'ataque')).toHaveLength(s1.career!.opponents.length);
    const r = advanceMonth(s1, { decisions: [...chosen, act('caravana_regional', { uf: 'BA' })] }, content);
    const after = careerActionsViewModel(r.state, content, [], r.report)!;
    expect(after.lastResults).toEqual([
      'Caravana em Bahia: você ficou mais conhecido no estado.',
      expect.stringMatching(/^Debate: a postura técnica/),
    ]);
  });
});

describe('mapa e lista do reconhecimento (PLANO_CAMPANHA.md Fase C4, C4.3)', () => {
  it('a camada só existe antes da posse e mostra a faixa da pesquisa, nunca o valor interno', () => {
    expect(availableIndicators(content).map((m) => m.id)).not.toContain('reconhecimento');
    expect(availableIndicators(content, true).map((m) => m.id)).toContain('reconhecimento');
    const s0 = start();
    // Sem pesquisa ainda: todas as UFs em "sem pesquisa".
    expect(new Set(mapRows('reconhecimento', s0, content).map((r) => r.value))).toEqual(new Set([0]));
    const s1 = advanceMonth(s0, { decisions: [] }, content).state;
    const rows = mapRows('reconhecimento', s1, content);
    const legend = legendLabels(indicatorSpec('reconhecimento'));
    for (const row of rows) {
      const band = s1.career!.poll!.recognitionBands[row.uf.id];
      expect(legend[row.value]).toBe(
        legend[{ desconhecido: 1, pouco_conhecido: 2, conhecido: 3, muito_conhecido: 4 }[band]],
      );
    }
    const card = buildUfElectoralView('reconhecimento', 'MG', s1, content, null)!;
    expect(card.badge).toBe('estimativa');
    expect(card.notes[0]).toContain('ago/2026');
    expect(card.rows[0].value).not.toMatch(/\d/);
  });
});
