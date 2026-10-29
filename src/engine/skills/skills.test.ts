import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { AGENDA_ACTIONS, NEGOTIATE_ACTION_ID, TRAIN_SKILL_ACTION_ID } from '@/engine/actions';
import { validateActionTarget } from '@/engine/agenda';
import { advanceMonth, DEFAULT_STEPS } from '@/engine/advanceMonth';
import { DEFAULT_CALIBRATION } from '@/engine/economy/calibration';
import { proposalsStep } from '@/engine/proposals/proposals';
import { adhesionProbabilities } from '@/engine/regions/regions';
import { createInitialState } from '@/engine/state';
import type { Decision, GameContent, GameState } from '@/engine/types';
import { TEST_PEC, testContent, testState } from '@/tests/fixtures';

import { skillParam } from './calibration';
import {
  characterSkills,
  controlledCharacterId,
  federalismAdhesionBonus,
  levelFromTraining,
  monthsToNextLevel,
  negotiationDiscount,
  SKILL_MAX_LEVEL,
  skillLevel,
} from './skills';
import type { SkillBranchId } from './types';

// PLANO_EXPANSAO EX-21 (F06): dois ramos com 3 níveis, efeitos por canais identificáveis (nunca PIB ou aprovação
// direta), treino com custo e sem evolução instantânea.

const train = (branch: SkillBranchId): Decision => ({
  policyId: TRAIN_SKILL_ACTION_ID,
  agendaCost: 1,
  params: { branch },
});
const action = AGENDA_ACTIONS[TRAIN_SKILL_ACTION_ID]!;

function trained(state: GameState, branch: SkillBranchId, months: number): GameState {
  const id = controlledCharacterId(state);
  return { ...state, skills: { characters: { [id]: { ...characterSkills(state), [branch]: months } } } };
}

describe('habilidades: níveis e treino', () => {
  it('o nível é derivado dos meses de treino acumulados (limiares da calibração)', () => {
    expect(levelFromTraining(0)).toBe(0);
    expect(levelFromTraining(skillParam('treino_nivel_1') - 1)).toBe(0);
    expect(levelFromTraining(skillParam('treino_nivel_1'))).toBe(1);
    expect(levelFromTraining(skillParam('treino_nivel_2'))).toBe(2);
    expect(levelFromTraining(skillParam('treino_nivel_3'))).toBe(SKILL_MAX_LEVEL);
    expect(monthsToNextLevel(0)).toBe(skillParam('treino_nivel_1'));
    expect(monthsToNextLevel(skillParam('treino_nivel_3'))).toBeNull();
  });

  it('treinar custa a ação de agenda e capital político, e soma um mês ao ramo', () => {
    const content: GameContent = loadContent(DEFAULT_SCENARIO_ID);
    const state = createInitialState({ content, difficulty: 'estrategica', seed: 3 });
    const withTraining = advanceMonth(state, { decisions: [train('negociacao')] }, content);
    const control = advanceMonth(state, { decisions: [] }, content);
    expect(withTraining.report.accepted.map((d) => d.policyId)).toEqual([TRAIN_SKILL_ACTION_ID]);
    expect(characterSkills(withTraining.state).negociacao).toBe(1);
    expect(withTraining.state.resources.politicalCapital).toBeCloseTo(
      control.state.resources.politicalCapital - skillParam('treino_capital'),
      9,
    );
  });

  it('sem farm: um treino por mês, mesmo em ramos diferentes', () => {
    const content: GameContent = loadContent(DEFAULT_SCENARIO_ID);
    const state = createInitialState({ content, difficulty: 'realismo', seed: 3 });
    const out = advanceMonth(state, { decisions: [train('negociacao'), train('federalismo')] }, content);
    expect(out.report.rejected.map((r) => r.reason)).toEqual(['acao_repetida']);
    const skills = characterSkills(out.state);
    expect(skills.negociacao + skills.federalismo).toBe(1);
  });

  it('nível máximo não treina mais; ramo desconhecido é recusado', () => {
    const content = testContent();
    const max = trained(testState(), 'federalismo', skillParam('treino_nivel_3'));
    expect(validateActionTarget(action, train('federalismo'), max, content)).toBe('alvo_invalido');
    expect(validateActionTarget(action, train('negociacao'), max, content)).toBeNull();
    const unknown: Decision = { policyId: TRAIN_SKILL_ACTION_ID, agendaCost: 1, params: { branch: 'carisma' } };
    expect(validateActionTarget(action, unknown, max, content)).toBe('alvo_invalido');
  });

  it('o nível novo só vale no mês seguinte ao treino que cruzou o limiar', () => {
    const content: GameContent = loadContent(DEFAULT_SCENARIO_ID);
    const almost = trained(
      createInitialState({ content, difficulty: 'estrategica', seed: 5 }),
      'negociacao',
      skillParam('treino_nivel_1') - 1,
    );
    expect(skillLevel(almost, 'negociacao')).toBe(0);
    const after = advanceMonth(almost, { decisions: [train('negociacao')] }, content);
    expect(after.report.notes.some((n) => n.includes('nível 1'))).toBe(true);
    expect(skillLevel(after.state, 'negociacao')).toBe(1);
  });

  it('a habilidade é da pessoa: outro personagem controlado começa do zero', () => {
    const state = trained(testState(), 'negociacao', 20);
    expect(skillLevel(state, 'negociacao')).toBe(SKILL_MAX_LEVEL);
    const successor: GameState = {
      ...state,
      control: { controlledCharacterId: 'sucessor', careerMode: 'presidencial' },
    };
    expect(skillLevel(successor, 'negociacao')).toBe(0);
  });
});

describe('habilidades: canais identificáveis, sem bônus macro', () => {
  it('negociação reduz só o capital gasto por negociação; o apoio ganho é o mesmo', () => {
    const content = testContent();
    const sent = advanceMonth(testState(), { decisions: [{ policyId: TEST_PEC.id, agendaCost: 0 }] }, content, [
      proposalsStep,
    ]).state;
    const proposalId = sent.proposals.find((p) => p.policyId === TEST_PEC.id)!.id;
    const negotiate: Decision = {
      policyId: NEGOTIATE_ACTION_ID,
      agendaCost: 1,
      params: { proposalId, blocId: 'direita' },
    };
    const plain = advanceMonth(sent, { decisions: [negotiate] }, content, [proposalsStep]).state;
    const skilledStart = trained(sent, 'negociacao', skillParam('treino_nivel_3'));
    const skilled = advanceMonth(skilledStart, { decisions: [negotiate] }, content, [proposalsStep]).state;
    const discount = negotiationDiscount(skilledStart);
    expect(discount).toBeCloseTo(SKILL_MAX_LEVEL * skillParam('negociacao_desconto'), 12);
    const spentPlain = sent.resources.politicalCapital - plain.resources.politicalCapital;
    const spentSkilled = sent.resources.politicalCapital - skilled.resources.politicalCapital;
    expect(spentPlain).toBeCloseTo(-DEFAULT_CALIBRATION.capital_negociacao, 9);
    expect(spentSkilled).toBeCloseTo(spentPlain * (1 - discount), 9);
    const support = (s: GameState) => s.proposals.find((p) => p.id === proposalId)!.negotiation.blocs.direita;
    expect(support(skilled)).toBe(support(plain));
    expect(discount).toBeLessThan(0.5);
  });

  it('federalismo soma probabilidade de adesão, limitada a 1 e menor que o peso da relação', () => {
    const content: GameContent = loadContent(DEFAULT_SCENARIO_ID);
    const state = createInitialState({ content, difficulty: 'estrategica', seed: 9 });
    const skilled = trained(state, 'federalismo', skillParam('treino_nivel_3'));
    const bonus = federalismAdhesionBonus(skilled);
    expect(bonus).toBeGreaterThan(0);
    expect(bonus).toBeLessThan(content.calibration.adesao_relacao);
    const plain = adhesionProbabilities(state, content);
    const better = adhesionProbabilities(skilled, content);
    better.forEach((p, i) => {
      expect(p).toBeGreaterThanOrEqual(plain[i]);
      expect(p).toBeLessThanOrEqual(1);
    });
  });

  it('nenhum ramo mexe em PIB, aprovação ou indicadores: o mês com habilidade máxima e sem ações é idêntico', () => {
    const content: GameContent = loadContent(DEFAULT_SCENARIO_ID);
    const state = createInitialState({ content, difficulty: 'estrategica', seed: 13 });
    const skilled = trained(trained(state, 'negociacao', 20), 'federalismo', 20);
    let a = state;
    let b = skilled;
    for (let i = 0; i < 6; i++) {
      a = advanceMonth(a, { decisions: [] }, content, DEFAULT_STEPS).state;
      b = advanceMonth(b, { decisions: [] }, content, DEFAULT_STEPS).state;
    }
    expect(b.indicators).toEqual(a.indicators);
    expect(b.economy).toEqual(a.economy);
  });
});
