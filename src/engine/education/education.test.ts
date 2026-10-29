import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { DIRECTIVE_ACTION_ID } from '../actions';
import { advanceMonth } from '../advanceMonth';
import { ministriesOf } from '../congress/cabinet';
import { publicPoliciesStep } from '../publicPolicies/publicPolicies';
import type { PublicProject } from '../publicPolicies/types';
import { createRng } from '../rng';
import { createInitialState } from '../state';
import type { Decision, GameContent, GameState, Proposal, ScheduledImpulse, StepContext } from '../types';

import {
  advanceEducation,
  checkEducation,
  educationLevers,
  educationPeople,
  educationStep,
  HUMAN_CAPITAL_CAUSE_PREFIX,
  initialEducation,
  steadyStateEducation,
} from './education';
import type { EducationLeverState, EducationState } from './types';

// PLANO_EXPANSAO EX-19 (F09; plano §6.1 "Sociedade e educação" e §6.2): coortes conservadas, efeito defasado, nenhum
// formando sem matriculado e um único canal produtivo, sem gasto novo.

const content: GameContent = loadContent(DEFAULT_SCENARIO_ID);
const base = () => createInitialState({ content, difficulty: 'estrategica', seed: 7 });

function lever(id: EducationLeverState['id'], strength: number): ScheduledImpulse {
  return {
    sourceId: `teste:${id}`,
    label: `Programa de teste (${id})`,
    target: `educacao.${id}`,
    delta: strength,
    startMonth: 0,
    endMonth: null,
  };
}

function ctx(state: GameState, decisions: Decision[] = []): StepContext {
  return {
    rng: createRng(state.rng),
    content,
    decisions,
    eventChoices: [],
    draft: { proposalChanges: [], eventsResolved: [], eventsFired: [], notes: [], copom: null, regional: null },
  };
}

function run(education: EducationState, impulses: ScheduledImpulse[], months: number): EducationState[] {
  const out: EducationState[] = [];
  let current = education;
  for (let t = 0; t < months; t++) {
    current = advanceEducation(current, educationLevers(impulses, t));
    out.push(current);
  }
  return out;
}

describe('educação por coorte: ponto de partida', () => {
  it('a campanha começa no estacionário: sem política, nada se move e o potencial não ganha bônus', () => {
    const start = initialEducation();
    const [after] = run(start, [], 1);
    for (const [i, stage] of after.stages.entries()) {
      expect(stage.enrolled).toBeCloseTo(start.stages[i].enrolled, 9);
      expect(stage.learning).toBeCloseTo(start.stages[i].learning, 12);
    }
    for (const [i, w] of after.workforce.entries()) expect(w.workers).toBeCloseTo(start.workforce[i].workers, 9);
    expect(after.humanCapital).toBeCloseTo(start.humanCapital, 12);

    const state = base();
    const out = educationStep(state, ctx(state));
    expect(out.state.impulses.some((i) => i.sourceId.startsWith(HUMAN_CAPITAL_CAUSE_PREFIX))).toBe(false);
  });

  it('o estado inicial do jogo é o estacionário e tem ordens de grandeza plausíveis', () => {
    const state = base();
    expect(state.education).toEqual(steadyStateEducation());
    const fundamental = state.education.stages.find((s) => s.id === 'fundamental')!;
    expect(fundamental.enrolled).toBeGreaterThan(15);
    expect(fundamental.enrolled).toBeLessThan(30);
    expect(state.education.humanCapital).toBeGreaterThan(8);
    expect(state.education.humanCapital).toBeLessThan(13);
  });
});

describe('educação por coorte: invariantes (plano §6.1)', () => {
  it('coortes conservadas e fluxo dentro do estoque em 240 meses com as três alavancas', () => {
    const impulses = [lever('alfabetizacao', 1), lever('permanencia', 1), lever('docentes', 1)];
    let previous = initialEducation();
    for (const next of run(previous, impulses, 240)) {
      expect(checkEducation(previous, next)).toEqual([]);
      expect(educationPeople(next)).toBeCloseTo(educationPeople(previous) + next.flows.entrants - next.flows.exits, 9);
      previous = next;
    }
  });

  it('não há formando sem matriculado: etapa vazia não forma ninguém, mesmo com política', () => {
    const empty = initialEducation();
    const medio = empty.stages.find((s) => s.id === 'medio')!;
    medio.enrolled = 0;
    const [after] = run(empty, [lever('permanencia', 1)], 1);
    expect(after.flows.graduates.medio).toBe(0);
    expect(after.flows.dropouts.medio).toBe(0);
  });

  it('ampliar a permanência não cria concluintes no mesmo mês (§6.2): só muda quem continua estudando', () => {
    const [without] = run(initialEducation(), [], 1);
    const [withPolicy] = run(initialEducation(), [lever('permanencia', 1)], 1);
    expect(withPolicy.flows.graduates.medio).toBeCloseTo(without.flows.graduates.medio, 12);
    expect(withPolicy.flows.graduates.fundamental).toBeCloseTo(without.flows.graduates.fundamental, 12);
    expect(withPolicy.flows.dropouts.medio).toBeLessThan(without.flows.dropouts.medio);
  });
});

describe('educação por coorte: efeito defasado e saturado', () => {
  it('gasto não vira produtividade no mesmo mês: o capital humano anda pouco no 1º ano e muito em 20 anos', () => {
    const impulses = [lever('alfabetizacao', 1), lever('permanencia', 1), lever('docentes', 1)];
    const start = initialEducation();
    const path = run(start, impulses, 240);
    const firstMonth = path[0].humanCapital - start.humanCapital;
    const firstYear = path[11].humanCapital - start.humanCapital;
    const twentyYears = path[239].humanCapital - start.humanCapital;
    expect(twentyYears).toBeGreaterThan(0);
    expect(firstMonth).toBeLessThan(twentyYears / 100);
    expect(firstYear).toBeLessThan(twentyYears / 8);
  });

  it('a aprendizagem anda até o alvo aos poucos, sem salto', () => {
    const start = initialEducation();
    const [first] = run(start, [lever('docentes', 1)], 1);
    const target = start.stages[1].learning;
    const gain = first.stages[1].learning - target;
    expect(gain).toBeGreaterThan(0);
    expect(gain).toBeLessThan(0.01);
  });

  it('duas rotinas iguais não dobram o efeito (saturação)', () => {
    const one = educationLevers([lever('docentes', 1)], 0).find((l) => l.id === 'docentes')!;
    const two = educationLevers([lever('docentes', 1), { ...lever('docentes', 1), sourceId: 'outro' }], 0).find(
      (l) => l.id === 'docentes',
    )!;
    expect(two.effect).toBeGreaterThan(one.effect);
    expect(two.effect).toBeLessThan(2 * one.effect);
    expect(two.effect).toBeLessThanOrEqual(1);
  });

  it('o único canal produtivo é um impulso de potencial de um mês com causa rastreável', () => {
    let state: GameState = { ...base(), impulses: [lever('permanencia', 1), lever('docentes', 1)] };
    const potentials: ScheduledImpulse[] = [];
    for (let t = 0; t < 36; t++) {
      const out = educationStep({ ...state, monthIndex: t }, ctx(state));
      potentials.push(...out.state.impulses.filter((i) => i.target === 'oferta.potencial'));
      state = { ...out.state, impulses: state.impulses };
    }
    expect(potentials.length).toBeGreaterThan(0);
    for (const impulse of potentials) {
      expect(impulse.sourceId.startsWith(HUMAN_CAPITAL_CAUSE_PREFIX)).toBe(true);
      expect(impulse.endMonth).toBe(impulse.startMonth);
    }
  });
});

describe('educação por coorte: políticas pela carteira', () => {
  const ministry = ministriesOf(content).find((m) => m.areas.includes('educacao'));

  it('a rotina de alfabetização alimenta a alavanca depois da maturação, sem gasto além do da própria rotina', () => {
    expect(ministry).toBeDefined();
    const policy = content.policies.rotina_alfabetizacao!;
    const directive: Decision = {
      policyId: DIRECTIVE_ACTION_ID,
      agendaCost: 1,
      params: { ministryId: ministry!.id, policyId: policy.id, annualMillions: policy.cost.annualMillions },
    };
    let state = base();
    for (let t = 0; t <= policy.timeline.maturationMonths + 1; t++) {
      const result = advanceMonth(state, { decisions: t === 0 ? [directive] : [] }, content);
      state = result.state;
    }
    const alfabetizacao = state.education.levers.find((l) => l.id === 'alfabetizacao')!;
    expect(alfabetizacao.strength).toBeGreaterThan(0);
    expect(alfabetizacao.sources.map((s) => s.label)).toEqual([policy.name]);

    // O mesmo mês sem o campo `education` na política: o gasto agendado é idêntico (o módulo não cria despesa).
    const stripped: GameContent = {
      ...content,
      policies: { ...content.policies, [policy.id]: { ...policy, education: undefined } },
    };
    let control = base();
    for (let t = 0; t <= policy.timeline.maturationMonths + 1; t++) {
      control = advanceMonth(control, { decisions: t === 0 ? [directive] : [] }, stripped).state;
    }
    // Mesmas fontes de gasto; a fração do PIB difere só no 5º dígito porque o potencial já subiu um pouco.
    const spending = (s: GameState) => s.impulses.filter((i) => i.target.startsWith('gasto.'));
    const withEducation = spending(state);
    const without = spending(control);
    expect(withEducation.map((i) => i.sourceId)).toEqual(without.map((i) => i.sourceId));
    withEducation.forEach((impulse, i) => {
      expect(Math.abs(impulse.delta / without[i].delta - 1)).toBeLessThan(1e-3);
    });
    expect(withEducation.length).toBeGreaterThan(0);
  });

  it('a escola de tempo integral só ensina em operação, na proporção do ativo conservado', () => {
    const policy = content.policies.projeto_escolas_tempo_integral!;
    const nominal = policy.cost.annualMillions * (policy.timeline.executionMonths / 12);
    const proposal: Proposal = {
      id: `${policy.id}_0`,
      policyId: policy.id,
      createdMonth: 0,
      status: 'concluida',
      scale: 1,
      voteMonth: null,
      stage: 0,
      rapporteur: null,
      textAltered: false,
      postponements: 0,
      negotiation: { blocs: {}, amendments: false, textConceded: false, urgency: false },
      rider: 0,
      veto: null,
      judicial: null,
      executionStart: 0,
      executionEnd: null,
      adherents: null,
      votes: [],
      history: [],
    };
    const project = (phase: PublicProject['phase'], assetShare: number): PublicProject => ({
      proposalId: proposal.id,
      policyId: policy.id,
      phase,
      phaseMonth: 0,
      progress: phase === 'operacao' ? 1 : 0.5,
      budgetMillions: nominal,
      spentMillions: nominal,
      assetMillions: nominal * (policy.project?.efficiency ?? 1) * assetShare,
      maintenanceMillions: 0,
      delayMonths: 0,
      startMonth: 0,
    });
    const strengthAt = (phase: PublicProject['phase'], assetShare: number) => {
      const s = base();
      const state: GameState = {
        ...s,
        proposals: [{ ...proposal, status: phase === 'operacao' ? 'concluida' : 'em_execucao' }],
        publicPolicies: { ...s.publicPolicies, projects: [project(phase, assetShare)] },
      };
      const out = publicPoliciesStep(state, ctx(state));
      return out.state.impulses.filter((i) => i.target === 'educacao.permanencia').reduce((sum, i) => sum + i.delta, 0);
    };
    expect(strengthAt('obra', 1)).toBe(0);
    const full = strengthAt('operacao', 1);
    const half = strengthAt('operacao', 0.5);
    expect(full).toBeGreaterThan(0.9);
    expect(half).toBeLessThan(full);
    expect(half).toBeGreaterThan(0);
  });
});
