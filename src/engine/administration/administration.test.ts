import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { advanceMonth, DEFAULT_STEPS } from '../advanceMonth';
import { monthOfTerm } from '../calendar';
import { electionsStep } from '../elections/elections';
import type { BudgetLaw, PublicProject } from '../publicPolicies/types';
import { createRng } from '../rng';
import { createInitialState } from '../state';
import type { GameContent, GameState, MonthStep, ReportDraft, StepContext } from '../types';

import {
  canRunForReelection,
  checkAdministrations,
  consecutiveTermsOf,
  currentAdministration,
  presidentName,
} from './identity';
import { presidentialTransitionStep } from './transition';

// PLANO_EXPANSAO R4 (EX-15 a EX-18): identidades, transição sem reset, nova Presidência jogável e prestação de contas.

const content: GameContent = loadContent(DEFAULT_SCENARIO_ID);
const base = () => createInitialState({ content, difficulty: 'estrategica', seed: 42 });

function stepContext(state: GameState): StepContext {
  const draft: ReportDraft = {
    proposalChanges: [],
    eventsResolved: [],
    eventsFired: [],
    notes: [],
    copom: null,
    regional: null,
  };
  return { rng: createRng(state.rng), content, decisions: [], eventChoices: [], draft };
}

/** Eleição geral forçada para a situação vencer: é o único jeito de exercitar a transição em série. */
function winningElection(state: GameState, ctx: StepContext) {
  const elections = ctx.content.scenario.elections;
  if (!elections || monthOfTerm(state.monthIndex) !== elections.mesEleicaoGeral) return electionsStep(state, ctx);
  const boosted: GameState = {
    ...state,
    indicators: { ...state.indicators, approval: Math.max(state.indicators.approval, 75) },
    politics: {
      ...(state.politics ?? { votingIntention: 0.9, memoria: [], declaracao: null, apoio: null }),
      votingIntention: 0.95,
      memoria: [],
    },
  };
  return electionsStep(boosted, ctx);
}

const WINNING_STEPS: readonly MonthStep[] = DEFAULT_STEPS.map((step) =>
  step === electionsStep ? winningElection : step,
);

function play(state: GameState, months: number, steps: readonly MonthStep[] = DEFAULT_STEPS): GameState {
  let current = state;
  for (let i = 0; i < months; i++) current = advanceMonth(current, { decisions: [] }, content, steps).state;
  return current;
}

function electionState(opts: {
  monthIndex: number;
  candidatura: boolean;
  venceu: boolean;
  winnerId?: string;
  winnerBlocId?: string;
  electionMonth?: number;
}): GameState {
  const state = base();
  return {
    ...state,
    monthIndex: opts.monthIndex,
    politics: {
      ...state.politics!,
      eleicao_geral: {
        monthIndex: opts.electionMonth ?? opts.monthIndex - 3,
        candidatura: opts.candidatura,
        venceu: opts.venceu,
        turno2: false,
        ...(opts.winnerId ? { winnerId: opts.winnerId, winnerBlocId: opts.winnerBlocId } : {}),
      },
    },
  };
}

const PROJECT: PublicProject = {
  proposalId: 'obra_ferrovia',
  policyId: 'infraestrutura_ferrovias',
  phase: 'obra',
  phaseMonth: 18,
  progress: 0.45,
  budgetMillions: 900,
  spentMillions: 380,
  assetMillions: 0,
  maintenanceMillions: 12,
  delayMonths: 2,
  startMonth: 30,
};

const PPA: BudgetLaw = { kind: 'ppa', year: 2028, priority: 'infraestrutura', proposalId: 'ppa_2028', enactedAt: 10 };

describe('identidade da administração (EX-15)', () => {
  it('nasce no mandato 0, com o jogador no controle', () => {
    const state = base();
    expect(state.administrations).toHaveLength(1);
    expect(state.administrations![0]).toMatchObject({
      id: 'mandato#0',
      presidentId: 'jogador',
      termIndex: 0,
      consecutiveTerm: 1,
      origin: 'eleicao',
    });
    expect(state.control).toEqual({ controlledCharacterId: 'jogador', careerMode: 'presidencial' });
    expect(currentAdministration(state, content)).toBe(state.administrations![0]);
    expect(presidentName(state.administrations![0], content)).toBe('Você');
  });

  it('cenário sem eleições não ganha identidade nem controle', () => {
    const withoutElections: GameContent = { ...content, scenario: { ...content.scenario, elections: undefined } };
    const state = createInitialState({ content: withoutElections, difficulty: 'estrategica', seed: 3 });
    expect(state.administrations).toBeUndefined();
    expect(state.control).toBeUndefined();
    expect(canRunForReelection({ ...state, monthIndex: 0 })).toBe(true);
    expect(canRunForReelection({ ...state, monthIndex: 48 })).toBe(false);
  });
});

describe('transição presidencial sem reset (EX-16)', () => {
  it('fecha a administração anterior e abre a seguinte sem recriar o país', () => {
    const state: GameState = {
      ...electionState({
        monthIndex: 48,
        candidatura: false,
        venceu: true,
        winnerId: 'sucessor:centro',
        winnerBlocId: 'centro',
      }),
      publicPolicies: { ...base().publicPolicies, projects: [PROJECT], budgetLaws: [PPA], capitalStockMillions: 0 },
    };
    const out = presidentialTransitionStep(state, stepContext(state)).state;

    expect(out.administrations).toHaveLength(2);
    expect(out.administrations![0]).toMatchObject({ termIndex: 0, endedAtMonth: 48 });
    expect(out.administrations![1]).toMatchObject({
      id: 'mandato#1',
      presidentId: 'sucessor:centro',
      blocId: 'centro',
      startedAtMonth: 48,
      termIndex: 1,
      consecutiveTerm: 1,
      origin: 'sucessao',
    });
    // Só quem assumiu legalmente passa a ser controlado.
    expect(out.control).toEqual({ controlledCharacterId: 'sucessor:centro', careerMode: 'presidencial' });

    // O país é um só: os mesmos objetos, sem cópia nem reset.
    expect(out.economy).toBe(state.economy);
    expect(out.society).toBe(state.society);
    expect(out.congress).toBe(state.congress);
    expect(out.proposals).toBe(state.proposals);
    expect(out.regions).toBe(state.regions);
    expect(out.publicPolicies).toBe(state.publicPolicies);
    expect(out.publicPolicies.projects[0]).toBe(PROJECT);
    expect(out.publicPolicies.budgetLaws).toEqual([PPA]);
    expect(out.career).toBe(state.career);

    expect(out.events.news.at(-1)).toMatchObject({ sourceId: 'posse_presidencial', monthIndex: 48 });
  });

  it('reeleição mantém o presidente, sobe o mandato consecutivo e não troca o controle', () => {
    const state = electionState({
      monthIndex: 48,
      candidatura: true,
      venceu: true,
      winnerId: 'jogador',
      winnerBlocId: base().administrations![0].blocId,
    });
    const out = presidentialTransitionStep(state, stepContext(state)).state;
    expect(out.administrations![1]).toMatchObject({
      presidentId: 'jogador',
      consecutiveTerm: 2,
      origin: 'reeleicao',
    });
    expect(out.control?.controlledCharacterId).toBe('jogador');
  });

  it('só a vitória legítima abre administração: derrota e eleição de outro mandato não', () => {
    const defeated = electionState({ monthIndex: 48, candidatura: true, venceu: false });
    expect(presidentialTransitionStep(defeated, stepContext(defeated)).state).toBe(defeated);

    const stale = electionState({ monthIndex: 48, candidatura: false, venceu: true, electionMonth: 93 });
    expect(presidentialTransitionStep(stale, stepContext(stale)).state).toBe(stale);

    // Fora do primeiro mês do mandato também não há transição.
    const midTerm = electionState({ monthIndex: 50, candidatura: false, venceu: true });
    expect(presidentialTransitionStep(midTerm, stepContext(midTerm)).state).toBe(midTerm);

    // Mandato pulado: o governo anterior terminou sem sucessor legítimo e a eleição de dois mandatos depois não
    // ressuscita a partida nem deixa buraco no histórico.
    const skipped = electionState({
      monthIndex: 144,
      candidatura: false,
      venceu: true,
      electionMonth: 141,
      winnerId: 'sucessor:centro',
    });
    expect(presidentialTransitionStep(skipped, stepContext(skipped)).state).toBe(skipped);
  });

  it('é idempotente: rodar de novo no mesmo mês não duplica a administração', () => {
    const state = electionState({ monthIndex: 48, candidatura: false, venceu: true, winnerId: 'sucessor:centro' });
    const once = presidentialTransitionStep(state, stepContext(state)).state;
    const twice = presidentialTransitionStep(once, stepContext(once)).state;
    expect(twice).toBe(once);
  });
});

describe('nova Presidência jogável (EX-17)', () => {
  it('um sucessor com um mandato pode concorrer; dois mandatos seguidos não', () => {
    const state = base();
    const withSuccessor: GameState = {
      ...state,
      monthIndex: 93,
      administrations: [
        state.administrations![0],
        {
          id: 'mandato#1',
          presidentId: 'sucessor:centro',
          blocId: 'centro',
          startedAtMonth: 48,
          termIndex: 1,
          consecutiveTerm: 1,
          origin: 'sucessao',
        },
      ],
    };
    expect(canRunForReelection(withSuccessor)).toBe(true);
    expect(consecutiveTermsOf(withSuccessor)).toBe(1);

    const reelected: GameState = {
      ...withSuccessor,
      administrations: [
        ...withSuccessor.administrations!.slice(0, -1),
        { ...withSuccessor.administrations![1], consecutiveTerm: 2, origin: 'reeleicao' },
      ],
    };
    expect(canRunForReelection(reelected)).toBe(false);
    expect(consecutiveTermsOf(reelected)).toBe(2);
  });

  it('96 meses reais atravessam a eleição e trocam o governo sem perder o país', () => {
    const start = base();
    const state = play(start, 96, WINNING_STEPS);
    expect(state.monthIndex).toBe(96);
    expect(state.administrations).toHaveLength(2);
    expect(state.administrations![1]).toMatchObject({ termIndex: 1, origin: 'sucessao' });
    expect(state.control?.controlledCharacterId).toBe(state.administrations![1].presidentId);
    // A economia continua a mesma série: nada foi recriado no mês da posse.
    expect(Number.isFinite(state.economy.priceLevel)).toBe(true);
    expect(state.economy.priceLevel).toBeGreaterThan(0);
    expect(state.indicators.approval).toBeGreaterThanOrEqual(0);
  });

  it('240 meses são determinísticos e acumulam administrações', () => {
    const start = base();
    const a = play(start, 240, WINNING_STEPS);
    const b = play(createInitialState({ content, difficulty: 'estrategica', seed: 42 }), 240, WINNING_STEPS);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.administrations!.length).toBeGreaterThanOrEqual(4);
    expect(a.administrations!.at(-1)!.termIndex).toBeGreaterThanOrEqual(3);
  });

  it('salvar e retomar no meio atravessa a transição com o mesmo resultado', () => {
    const start = base();
    const continuous = play(start, 96, WINNING_STEPS);
    const before = play(start, 47, WINNING_STEPS);
    const resumed = JSON.parse(JSON.stringify(before)) as GameState;
    const after = play(resumed, 49, WINNING_STEPS);
    expect(JSON.stringify(after)).toBe(JSON.stringify(continuous));
  });
});

describe('dados herdados intactos (EX-15/EX-16)', () => {
  it('a transição passa no invariante e o histórico não pode ser reescrito nem encurtado', () => {
    const state = electionState({
      monthIndex: 48,
      candidatura: false,
      venceu: true,
      winnerId: 'sucessor:centro',
      winnerBlocId: 'centro',
    });
    const out = presidentialTransitionStep(state, stepContext(state)).state;
    expect(checkAdministrations(state, out)).toEqual([]);

    const rewritten: GameState = {
      ...out,
      administrations: out.administrations!.map((admin) =>
        admin.termIndex === 0 ? { ...admin, presidentId: 'sucessor:outro' } : admin,
      ),
    };
    expect(checkAdministrations(state, rewritten)).toContain('administrações: mandato#0 reescreveu presidentId');

    const shrunk: GameState = { ...out, administrations: out.administrations!.slice(1) };
    expect(checkAdministrations(state, shrunk)).toContain('administrações: mandato#0 desapareceu do histórico');

    const wrongControl: GameState = {
      ...out,
      control: { controlledCharacterId: 'jogador', careerMode: 'presidencial' },
    };
    expect(checkAdministrations(state, wrongControl)).toContain('controle em jogador, mas governa sucessor:centro');
  });
});
