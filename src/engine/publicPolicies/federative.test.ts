import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { AGENDA_ACTIONS, NEGOTIATE_ADHESION_ACTION_ID } from '../actions';
import { validateActionTarget } from '../agenda';
import { createRng } from '../rng';
import { createInitialState } from '../state';
import type { Decision, GameContent, GameState, Proposal, StepContext } from '../types';

import {
  agreementRegional,
  counterpartCoverage,
  createAgreement,
  eligibleUfs,
  memberAdhesionProbability,
  servedUfs,
} from './federative';
import { federativeParam } from './federativeCalibration';
import { publicPoliciesStep } from './publicPolicies';
import type { FederativeAgreement, PublicProject } from './types';

// PLANO_EXPANSAO EX-20 (F11; POLITICAL_RULES.md §2.1.1): convênio com adesão real dos governadores, dentro da carteira
// existente; o estado pode recusar, a adesão persiste pelo contrato e a inadimplência atrasa a obra.

const content: GameContent = loadContent(DEFAULT_SCENARIO_ID);
const POLICY_ID = 'projeto_hospitais_regionais';
const policy = content.policies[POLICY_ID]!;
const PROPOSAL_ID = `${POLICY_ID}_0`;

function withRelation(state: GameState, relation: number | ((uf: string) => number)): GameState {
  return {
    ...state,
    regions: {
      ...state.regions,
      ufs: state.regions.ufs.map((uf) => ({
        ...uf,
        governorRelation: typeof relation === 'number' ? relation : relation(uf.id),
      })),
    },
  };
}

function proposal(status: Proposal['status'] = 'em_execucao'): Proposal {
  return {
    id: PROPOSAL_ID,
    policyId: POLICY_ID,
    createdMonth: 0,
    status,
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
}

function base(seed = 11): GameState {
  return { ...createInitialState({ content, difficulty: 'estrategica', seed }), proposals: [proposal()] };
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

function step(state: GameState, decisions: Decision[] = []): GameState {
  return publicPoliciesStep(state, ctx(state, decisions)).state;
}

function projectOf(state: GameState): PublicProject {
  return state.publicPolicies.projects.find((p) => p.proposalId === PROPOSAL_ID)!;
}

/** Avança a carteira mês a mês (só a etapa da carteira, como os demais testes da Fase 06). */
function months(state: GameState, n: number, decisions: (t: number) => Decision[] = () => []): GameState {
  let current = state;
  for (let i = 0; i < n; i++)
    current = { ...step(current, decisions(current.monthIndex)), monthIndex: current.monthIndex + 1 };
  return current;
}

/** Avança até a assinatura (o planejamento anda pela capacidade de gestão da pasta, não pelo calendário). */
function untilSigned(state: GameState): GameState {
  let current = state;
  for (let i = 0; i < 36 && projectOf(current)?.federative?.signedMonth == null; i++) current = months(current, 1);
  return current;
}

function agreementWith(
  statuses: Record<string, FederativeAgreement['members'][number]['status']>,
): FederativeAgreement {
  return {
    members: eligibleUfs(policy, content).map((uf) => ({
      uf,
      status: statuses[uf] ?? 'aderiu',
      counterpartShare: policy.federative!.counterpartShare,
      negotiated: false,
    })),
    signedMonth: 0,
    expiresMonth: 47,
    federalShare: 1 - policy.federative!.counterpartShare,
  };
}

describe('obras federativas: adesão real (EX-20)', () => {
  it('a obra entra na carteira com um convênio por governador elegível, ainda sem assinatura', () => {
    const state = step(base());
    const agreement = projectOf(state).federative!;
    expect(agreement.members.map((m) => m.uf)).toEqual(eligibleUfs(policy, content));
    expect(agreement.signedMonth).toBeNull();
    expect(projectOf(state).phase).toBe('planejamento');
  });

  it('governadores importam: aliados aderem todos, hostis recusam mais (mesma semente)', () => {
    const allied = projectOf(step(withRelation(base(), 100))).federative!;
    const hostile = projectOf(step(withRelation(base(), -100))).federative!;
    const joined = (a: FederativeAgreement) => a.members.filter((m) => m.status === 'aderiu').length;
    expect(joined(allied)).toBe(allied.members.length);
    expect(joined(hostile)).toBeLessThan(joined(allied));
  });

  it('o sorteio da adesão usa chave estável e não consome o PRNG compartilhado do mês', () => {
    const state = base();
    const context = ctx(state);
    const before = context.rng.state();
    publicPoliciesStep(state, context);
    expect(context.rng.state()).toEqual(before);
    const again = createAgreement(policy, PROPOSAL_ID, state, content);
    expect(again).toEqual(createAgreement(policy, PROPOSAL_ID, state, content));
  });

  it('a habilidade de federalismo soma probabilidade, sem obrigar o governador hostil', () => {
    const state = withRelation(base(), -100);
    const plain = memberAdhesionProbability(state, content, 'BA', false);
    const skilled = memberAdhesionProbability(
      {
        ...state,
        skills: {
          characters: {
            [state.control?.controlledCharacterId ?? 'presidente']: {
              negociacao: 0,
              federalismo: 99,
              ciencia_tecnologia: 0,
              diplomacia: 0,
            },
          },
        },
      },
      content,
      'BA',
      false,
    );
    expect(skilled).toBeGreaterThan(plain);
    expect(skilled).toBeLessThan(0.5);
  });
});

describe('obras federativas: compensação legítima', () => {
  const hostile = (uf: string) => (uf === 'SP' ? -100 : 100);

  it('negociar com quem recusou reduz a contrapartida do estado e vale uma vez', () => {
    // Semente com SP recusando na decisão inicial.
    let seed = 1;
    let state = step(withRelation(base(seed), hostile));
    while (projectOf(state).federative!.members.find((m) => m.uf === 'SP')!.status !== 'recusou') {
      seed += 1;
      state = step(withRelation(base(seed), hostile));
    }
    const decision: Decision = {
      policyId: NEGOTIATE_ADHESION_ACTION_ID,
      agendaCost: 1,
      params: { proposalId: PROPOSAL_ID, uf: 'SP' },
    };
    const action = AGENDA_ACTIONS[NEGOTIATE_ADHESION_ACTION_ID]!;
    expect(validateActionTarget(action, decision, state, content)).toBeNull();
    const after = step(state, [decision]);
    const sp = projectOf(after).federative!.members.find((m) => m.uf === 'SP')!;
    expect(sp.negotiated).toBe(true);
    expect(sp.counterpartShare).toBeCloseTo(
      policy.federative!.counterpartShare * federativeParam('convenio_contrapartida_negociada'),
      12,
    );
    expect(validateActionTarget(action, decision, after, content)).toBe('alvo_invalido');
  });

  it('não se negocia com quem aderiu nem depois da assinatura', () => {
    const state = step(withRelation(base(), 100));
    const decision: Decision = {
      policyId: NEGOTIATE_ADHESION_ACTION_ID,
      agendaCost: 1,
      params: { proposalId: PROPOSAL_ID, uf: 'SP' },
    };
    expect(validateActionTarget(AGENDA_ACTIONS[NEGOTIATE_ADHESION_ACTION_ID]!, decision, state, content)).toBe(
      'alvo_invalido',
    );
  });
});

describe('obras federativas: contrato', () => {
  it('a assinatura fixa escopo, orçamento federal e vigência; a obra só incide nos estados atendidos', () => {
    let state = withRelation(base(), (uf) => (['SP', 'RJ', 'MG'].includes(uf) ? -100 : 100));
    state = untilSigned(state);
    const project = projectOf(state);
    const agreement = project.federative!;
    expect(agreement.signedMonth).not.toBeNull();
    expect(agreement.expiresMonth).toBe(agreement.signedMonth! + policy.federative!.termMonths - 1);
    const nominal = policy.cost.annualMillions * (policy.timeline.executionMonths / 12);
    expect(project.budgetMillions).toBeLessThan(nominal * (1 - policy.federative!.counterpartShare) + 1e-6);
    expect(agreement.federalShare).toBeCloseTo(1 - policy.federative!.counterpartShare, 12);
    const regional = agreementRegional(agreement, undefined)!;
    expect(regional.scope).toEqual(servedUfs(agreement));
    for (const m of agreement.members) {
      expect(regional.scope.includes(m.uf)).toBe(m.status === 'aderiu' || m.status === 'inadimplente');
    }
  });

  it('sem nenhuma adesão a obra é cancelada na assinatura, com causa', () => {
    const state = step(base());
    const project = projectOf(state);
    const allRefused: PublicProject = {
      ...project,
      phase: 'licenciamento',
      federative: {
        ...agreementWith({}),
        signedMonth: null,
        members: agreementWith({}).members.map((m) => ({ ...m, status: 'recusou' as const })),
      },
    };
    const next = step({ ...state, publicPolicies: { ...state.publicPolicies, projects: [allRefused] } });
    expect(next.proposals[0].status).toBe('abandonada');
    expect(next.proposals[0].history.at(-1)?.cause).toBe('sem_adesao');
    expect(projectOf(next).phase).toBe('cancelado');
  });

  it('a adesão persiste conforme o contrato: governador hostil depois da assinatura não tira o estado da obra', () => {
    let state = untilSigned(withRelation(base(), 100));
    expect(projectOf(state).federative!.signedMonth).not.toBeNull();
    state = withRelation(state, -100);
    for (let i = 0; i < 24; i++) {
      state = months(state, 1);
      for (const m of projectOf(state).federative!.members) expect(['aderiu', 'inadimplente']).toContain(m.status);
    }
  });

  it('estado inadimplente reduz o repasse federal na proporção da contrapartida e vira gargalo da obra', () => {
    const state = step(base());
    const project = projectOf(state);
    const half = Object.fromEntries(
      eligibleUfs(policy, content).map((uf, i) => [uf, i % 2 === 0 ? 'inadimplente' : 'aderiu'] as const),
    );
    const agreement = agreementWith(half);
    const coverage = counterpartCoverage(agreement, content);
    expect(coverage).toBeGreaterThan(0);
    expect(coverage).toBeLessThan(1);
    expect(counterpartCoverage(agreementWith({}), content)).toBe(1);

    const inObra: PublicProject = { ...project, phase: 'obra', phaseMonth: 0, federative: agreement };
    const inObraFull: PublicProject = { ...inObra, federative: agreementWith({}) };
    const paid = (p: PublicProject) => {
      const s = { ...state, monthIndex: 1, publicPolicies: { ...state.publicPolicies, projects: [p] } };
      const out = step(s);
      return { project: projectOf(out), spent: projectOf(out).spentMillions };
    };
    const partial = paid(inObra);
    const full = paid(inObraFull);
    expect(partial.spent).toBeLessThan(full.spent);
    if (partial.project.federative!.members.some((m) => m.status === 'inadimplente')) {
      expect(partial.project.bottleneck).toBe('contrapartida');
    }
  });

  it('no fim da vigência o aditivo exclui inadimplentes e corta a parte federal ainda não paga deles', () => {
    const state = step(base());
    const project = projectOf(state);
    const statuses = { BA: 'inadimplente', PE: 'inadimplente' } as const;
    const expiring: PublicProject = {
      ...project,
      phase: 'licitacao',
      budgetMillions: 10_000,
      spentMillions: 0,
      federative: { ...agreementWith(statuses), expiresMonth: 0 },
    };
    const next = step({ ...state, monthIndex: 1, publicPolicies: { ...state.publicPolicies, projects: [expiring] } });
    const after = projectOf(next);
    const members = after.federative!.members;
    expect(members.find((m) => m.uf === 'BA')!.status).toBe('excluido');
    expect(members.find((m) => m.uf === 'PE')!.status).toBe('excluido');
    expect(after.budgetMillions).toBeLessThan(10_000);
    expect(after.federative!.expiresMonth).toBe(1 + policy.federative!.termMonths - 1);
  });

  it('o ativo da obra concluída inclui a contrapartida estadual sem contar o desembolso federal duas vezes', () => {
    const state = step(base());
    const project = projectOf(state);
    const agreement = agreementWith({});
    const done: PublicProject = {
      ...project,
      phase: 'obra',
      phaseMonth: 1000,
      progress: 1,
      budgetMillions: 7_000,
      spentMillions: 7_000,
      federative: agreement,
    };
    const next = step({ ...state, monthIndex: 1, publicPolicies: { ...state.publicPolicies, projects: [done] } });
    const after = projectOf(next);
    expect(after.phase).toBe('operacao');
    const efficiency = policy.project?.efficiency ?? 1;
    expect(after.assetMillions).toBeCloseTo(
      ((7_000 / state.economy.priceLevel) * efficiency) / agreement.federalShare,
      6,
    );
    // Nenhum impulso de obra no mês da conclusão: o pagamento federal já estava todo contado.
    expect(next.impulses.some((i) => i.sourceId.includes(`${PROPOSAL_ID}:obra:1`))).toBe(false);
  });
});
