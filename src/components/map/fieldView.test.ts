import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent, POLICIES } from '@/content';
import { createInitialState, VISIT_ACTION_ID, type GameState, type ProjectPhase, type PublicProject } from '@/engine';

import { buildUfFieldView, preventionText } from './fieldView';

// PLANO_GLOBO.md §7, PR 13: o cartão da UF mostra obras (só com UF no conteúdo), a visita ainda valendo e a prevenção.

const content = loadContent(DEFAULT_SCENARIO_ID);
const base = createInitialState({ content, difficulty: 'estrategica', seed: 1 });

const hidric = POLICIES.projeto_seguranca_hidrica;
const nominalAsset = hidric.cost.annualMillions * (hidric.timeline.executionMonths / 12) * hidric.project!.efficiency;

const project = (policyId: string, phase: ProjectPhase, extra: Partial<PublicProject> = {}): PublicProject => ({
  proposalId: `${policyId}_0`,
  policyId,
  phase,
  phaseMonth: 0,
  progress: 0,
  budgetMillions: 1,
  spentMillions: 0,
  assetMillions: 0,
  maintenanceMillions: 0,
  delayMonths: 0,
  startMonth: 0,
  ...extra,
});

const stateWith = (over: Partial<GameState>): GameState => ({ ...base, monthIndex: 30, ...over });

describe('cartão da UF: obras, visita e prevenção', () => {
  it('sem nada a dizer devolve null', () => {
    expect(buildUfFieldView('CE', stateWith({}), content)).toBeNull();
    expect(buildUfFieldView('XX', stateWith({}), content)).toBeNull();
  });

  it('lista as obras da UF citada no conteúdo (em obra e em operação) e nada nas UFs fora do escopo', () => {
    const state = stateWith({
      publicPolicies: {
        ...base.publicPolicies,
        projects: [project('projeto_seguranca_hidrica', 'obra', { progress: 0.45 })],
      },
    });
    expect(buildUfFieldView('CE', state, content)?.works).toEqual([
      {
        id: 'obra:projeto_seguranca_hidrica_0:CE',
        name: 'Segurança hídrica do semiárido',
        status: 'em obra, 45%',
        operating: false,
      },
    ]);
    expect(buildUfFieldView('RS', state, content)).toBeNull();
    const done = stateWith({
      publicPolicies: {
        ...base.publicPolicies,
        projects: [project('projeto_seguranca_hidrica', 'operacao', { progress: 1, assetMillions: nominalAsset })],
      },
    });
    expect(buildUfFieldView('BA', done, content)?.works[0]).toMatchObject({ status: 'em operação', operating: true });
  });

  it('obra nacional (sem UF no conteúdo) e obra cancelada não aparecem no cartão de nenhuma UF', () => {
    const state = stateWith({
      publicPolicies: {
        ...base.publicPolicies,
        projects: [project('projeto_hospitais_regionais', 'obra'), project('projeto_seguranca_hidrica', 'cancelado')],
      },
    });
    expect(buildUfFieldView('CE', state, content)).toBeNull();
  });

  it('a visita aparece com há quanto tempo e quanto falta do efeito local, e some no fim da janela', () => {
    const log = [{ monthIndex: 29, decision: { policyId: VISIT_ACTION_ID, agendaCost: 1, params: { uf: 'CE' } } }];
    const view = buildUfFieldView('CE', stateWith({ decisionLog: log }), content);
    const left = content.calibration.meses_visita - 1;
    expect(view?.visit).toBe(`no mês passado, com efeito local por mais ${left} meses`);
    expect(buildUfFieldView('SP', stateWith({ decisionLog: log }), content)).toBeNull();
    expect(
      buildUfFieldView(
        'CE',
        stateWith({ decisionLog: log, monthIndex: 29 + content.calibration.meses_visita }),
        content,
      ),
    ).toBeNull();
  });

  it('a prevenção mostra a fração do dano evitada na UF, só onde há programa, com o texto em português', () => {
    const state = stateWith({
      publicPolicies: {
        ...base.publicPolicies,
        projects: [project('projeto_seguranca_hidrica', 'operacao', { progress: 1, assetMillions: nominalAsset })],
      },
    });
    const ce = buildUfFieldView('CE', state, content)?.prevention;
    expect(ce?.drought).toBeGreaterThan(0);
    expect(ce?.flood).toBe(0);
    expect(preventionText(ce!)).toMatch(/^seca −\d+% do dano$/);
    expect(preventionText({ drought: 0.15, flood: 0.18 })).toBe('seca −15% do dano · cheias −18% do dano');
    expect(buildUfFieldView('RS', state, content)).toBeNull();
  });
});
