import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent, TECHNOLOGY } from '@/content';
import { CERTIFY_EXPORT_ACTION_ID, FUND_TECHNOLOGY_ACTION_ID, SUSPEND_TECHNOLOGY_ACTION_ID } from '@/engine/actions';
import { advanceMonth, DEFAULT_STEPS } from '@/engine/advanceMonth';
import { energyStep } from '@/engine/energy/energy';
import { checkInvariants } from '@/engine/invariants';
import { createInitialState } from '@/engine/state';
import { skillParam } from '@/engine/skills/calibration';
import type { Decision, GameContent, GameState, MonthStep } from '@/engine/types';
import type { TechnologyCatalog } from '@/types/technology';

import { researchParam } from './calibration';
import {
  canCertify,
  checkResearch,
  programOf,
  researchEnergyEffects,
  researchStep,
  stageFailureChance,
  technologyExportMillions,
} from './research';

// PLANO_EXPANSAO F07, EX-24 e EX-32: rotas com custos e prazos distintos, quatro estágios, falha parcial, financiamento
// plurianual pelo mesmo espaço discricionário da carteira, efeitos por um canal só, exportação só com domínio local.

const content: GameContent = loadContent(DEFAULT_SCENARIO_ID);
const fresh = (seed = 7): GameState => createInitialState({ content, difficulty: 'estrategica', seed });

const fund = (nodeId: string, route: string, partnerId?: string): Decision => ({
  policyId: FUND_TECHNOLOGY_ACTION_ID,
  agendaCost: 1,
  params: { nodeId, route, ...(partnerId ? { partnerId } : {}) },
});

/** Espaço discricionário fixo (taxa anual, R$ mi) no lugar da carteira: isola a pesquisa do resto do orçamento. */
const room =
  (roomMillions: number): MonthStep =>
  (state, ctx) => {
    ctx.draft.publicRoom = { roomMillions, gdpMillions: 13_600_000 };
    return { state, contributions: [] };
  };

function run(state: GameState, months: number, steps: readonly MonthStep[], first: Decision[] = [], c = content) {
  let s = state;
  for (let m = 0; m < months; m++) s = advanceMonth(s, { decisions: m === 0 ? first : [] }, c, steps).state;
  return s;
}

/** Programa já adotado, para testar efeitos sem esperar os estágios. */
function adopted(state: GameState, nodeId: string, route: 'importar' | 'transferir' | 'desenvolver'): GameState {
  const node = TECHNOLOGY.nodes.find((n) => n.id === nodeId)!;
  const spec = node.routes[route]!;
  return {
    ...state,
    research: {
      programs: [
        ...state.research.programs,
        {
          nodeId,
          route,
          status: 'adotada',
          stage: 'adocao',
          stageProgress: 0,
          completedStages: (['pesquisa_basica', 'prototipagem', 'escala_industrial', 'adocao'] as const).filter(
            (s) => spec.stages[s],
          ),
          startedMonth: 0,
          setbacks: 0,
          spentMillions: 1000,
          monthSpentMillions: 0,
          monthImportedMillions: 0,
          bottleneck: null,
          adoptedMonth: state.monthIndex,
          maintained: 1,
          effectLevel: 1,
          capability: spec.capability,
        },
      ],
    },
  };
}

describe('árvore de tecnologias: começar um programa', () => {
  it('o catálogo tem dois ramos ou mais, transporte, rota importada e rota de capacitação nacional', () => {
    const branches = new Set(TECHNOLOGY.nodes.map((n) => n.branch));
    expect(branches.size).toBeGreaterThanOrEqual(2);
    expect(branches.has('transporte')).toBe(true);
    expect(TECHNOLOGY.nodes.some((n) => n.routes.importar)).toBe(true);
    expect(TECHNOLOGY.nodes.some((n) => n.routes.desenvolver?.stages.pesquisa_basica)).toBe(true);
  });

  it('pré-requisito não adotado recusa o programa; com ele adotado, aceita', () => {
    const out = advanceMonth(fresh(), { decisions: [fund('material_rodante', 'importar')] }, content);
    expect(out.report.rejected.map((r) => r.reason)).toEqual(['alvo_invalido']);
    const ready = adopted(fresh(), 'sinalizacao_ferroviaria', 'importar');
    const ok = advanceMonth(ready, { decisions: [fund('material_rodante', 'importar')] }, content);
    expect(ok.report.accepted.map((d) => d.policyId)).toEqual([FUND_TECHNOLOGY_ACTION_ID]);
    expect(programOf(ok.state, 'material_rodante')?.status).toBe('em_andamento');
  });

  it('transferir exige parceiro que aceite e relação mínima', () => {
    const state = adopted(fresh(), 'redes_inteligentes', 'importar');
    const bad = advanceMonth(state, { decisions: [fund('armazenamento_baterias', 'transferir', 'india')] }, content);
    expect(bad.report.rejected.map((r) => r.reason)).toEqual(['alvo_invalido']);
    const cold: GameState = {
      ...state,
      trade: { ...state.trade, partners: state.trade.partners.map((p) => ({ ...p, relation: -80 })) },
    };
    const refused = advanceMonth(cold, { decisions: [fund('armazenamento_baterias', 'transferir', 'china')] }, content);
    expect(refused.report.rejected.map((r) => r.reason)).toEqual(['alvo_invalido']);
    const good = advanceMonth(state, { decisions: [fund('armazenamento_baterias', 'transferir', 'china')] }, content);
    expect(good.report.accepted).toHaveLength(1);
    expect(programOf(good.state, 'armazenamento_baterias')?.stage).toBe('prototipagem');
  });

  it('o mesmo nó não pode ter dois programas ao mesmo tempo', () => {
    const started = advanceMonth(fresh(), { decisions: [fund('bioinsumos', 'desenvolver')] }, content).state;
    const again = advanceMonth(started, { decisions: [fund('bioinsumos', 'importar')] }, content);
    expect(again.report.rejected.map((r) => r.reason)).toEqual(['ja_em_andamento']);
  });
});

describe('árvore de tecnologias: execução, orçamento e prazos', () => {
  it('importar: só a adoção, sem domínio local; o gasto entra uma vez como investimento e a maior parte é importada', () => {
    const steps = [room(1_000_000), researchStep];
    const s = run(fresh(), 13, steps, [fund('redes_inteligentes', 'importar')]);
    const program = programOf(s, 'redes_inteligentes')!;
    expect(program.status).toBe('adotada');
    expect(program.completedStages).toEqual(['adocao']);
    expect(program.capability).toBe(0);
    expect(
      canCertify(
        program,
        TECHNOLOGY.nodes.find((n) => n.id === 'redes_inteligentes'),
      ),
    ).toBe(false);
    const spec = TECHNOLOGY.nodes.find((n) => n.id === 'redes_inteligentes')!.routes.importar!;
    // Um ano de adoção pago (preços e câmbio mudam o valor corrente, por isso a faixa).
    expect(program.spentMillions).toBeGreaterThan(spec.stages.adocao!.annualMillions * 0.8);
    expect(program.spentMillions).toBeLessThan(spec.stages.adocao!.annualMillions * 1.5);
  });

  it('progresso não é instantâneo: desenvolver leva a soma dos estágios, no mínimo', () => {
    const node = TECHNOLOGY.nodes.find((n) => n.id === 'bioinsumos')!;
    const months = Object.values(node.routes.desenvolver!.stages).reduce((sum, st) => sum + (st?.months ?? 0), 0);
    const s = run(
      fresh(),
      Math.floor(months / researchParam('ritmo_max')) - 1,
      [room(1_000_000), researchStep],
      [fund('bioinsumos', 'desenvolver')],
    );
    expect(programOf(s, 'bioinsumos')!.status).toBe('em_andamento');
  });

  it('sem espaço discricionário o programa não anda nem gasta: gargalo de orçamento', () => {
    const s = run(fresh(), 6, [room(0), researchStep], [fund('bioinsumos', 'desenvolver')]);
    const program = programOf(s, 'bioinsumos')!;
    expect(program.stageProgress).toBe(0);
    expect(program.spentMillions).toBe(0);
    expect(program.bottleneck).toBe('orcamento');
    expect(s.impulses.some((i) => i.sourceId.startsWith('pesquisa:'))).toBe(false);
  });

  it('a pesquisa usa o que a carteira deixou e devolve o restante ao rascunho do mês', () => {
    let seen = -1;
    const probe: MonthStep = (state, ctx) => {
      seen = ctx.draft.publicRoom?.roomMillions ?? -1;
      return { state, contributions: [] };
    };
    run(fresh(), 1, [room(120_000), researchStep, probe], [fund('bioinsumos', 'desenvolver')]);
    const annual = TECHNOLOGY.nodes.find((n) => n.id === 'bioinsumos')!.routes.desenvolver!.stages.pesquisa_basica!
      .annualMillions;
    expect(seen).toBeLessThan(120_000);
    expect(seen).toBeGreaterThan(120_000 - annual * 2);
  });

  it('adoção depende da infraestrutura: sem ferrovia em operação, a adoção do material rodante para', () => {
    const ready = adopted(fresh(), 'sinalizacao_ferroviaria', 'importar');
    const s = run(ready, 3, [room(1_000_000), researchStep], [fund('material_rodante', 'importar')]);
    const program = programOf(s, 'material_rodante')!;
    expect(program.stage).toBe('adocao');
    expect(program.bottleneck).toBe('infraestrutura');
    expect(program.stageProgress).toBe(0);
  });

  it('falha parcial devolve parte do estágio; falhas repetidas encerram o programa e guardam o resultado intermediário', () => {
    const risky: TechnologyCatalog = {
      ...TECHNOLOGY,
      nodes: TECHNOLOGY.nodes.map((n) =>
        n.id === 'bioinsumos'
          ? { ...n, routes: { ...n.routes, desenvolver: { ...n.routes.desenvolver!, stageFailure: 0.9 } } }
          : n,
      ),
    };
    const c: GameContent = { ...content, technology: risky };
    let s = advanceMonth(fresh(), { decisions: [fund('bioinsumos', 'desenvolver')] }, c, [
      room(1_000_000),
      researchStep,
    ]).state;
    const seen = new Set<string>();
    for (let m = 0; m < 200 && programOf(s, 'bioinsumos')!.status === 'em_andamento'; m++) {
      s = advanceMonth(s, { decisions: [] }, c, [room(1_000_000), researchStep]).state;
      seen.add(`${programOf(s, 'bioinsumos')!.setbacks}`);
    }
    const program = programOf(s, 'bioinsumos')!;
    expect(program.status).toBe('falhou');
    expect(program.setbacks).toBe(researchParam('falhas_maximas'));
    expect(program.capability).toBe(0);
    // Recomeçar pela importação aproveita o que já foi concluído e vai direto à adoção.
    const restart = advanceMonth(s, { decisions: [fund('bioinsumos', 'importar')] }, c, [
      room(1_000_000),
      researchStep,
    ]);
    const again = programOf(restart.state, 'bioinsumos')!;
    expect(again.status).toBe('em_andamento');
    expect(again.stage).toBe('adocao');
    expect(again.completedStages).toEqual(program.completedStages);
  });

  it('suspender guarda os estágios concluídos e para o gasto', () => {
    let s = run(fresh(), 20, [room(1_000_000), researchStep], [fund('bioinsumos', 'desenvolver')]);
    const before = programOf(s, 'bioinsumos')!;
    s = advanceMonth(
      s,
      { decisions: [{ policyId: SUSPEND_TECHNOLOGY_ACTION_ID, agendaCost: 1, params: { nodeId: 'bioinsumos' } }] },
      content,
      [room(1_000_000), researchStep],
    ).state;
    const after = programOf(s, 'bioinsumos')!;
    expect(after.status).toBe('suspensa');
    expect(after.completedStages).toEqual(before.completedStages);
    expect(after.spentMillions).toBe(before.spentMillions);
  });

  it('o sorteio da falha é por chave: mesma semente e decisões, mesmo resultado', () => {
    const a = run(fresh(3), 40, [room(1_000_000), researchStep], [fund('bioinsumos', 'desenvolver')]);
    const b = run(fresh(3), 40, [room(1_000_000), researchStep], [fund('bioinsumos', 'desenvolver')]);
    expect(a.research).toEqual(b.research);
  });

  it('ciência e tecnologia reduz a chance de falha, sem zerá-la', () => {
    const spec = TECHNOLOGY.nodes.find((n) => n.id === 'trem_alta_velocidade')!.routes.desenvolver!;
    const plain = stageFailureChance(fresh(), spec);
    const skilled = stageFailureChance(
      {
        control: undefined,
        skills: {
          characters: { presidente: { negociacao: 0, federalismo: 0, ciencia_tecnologia: 99, diplomacia: 0 } },
        },
      },
      spec,
    );
    expect(plain).toBe(spec.stageFailure);
    expect(skilled).toBeCloseTo(spec.stageFailure * (1 - 3 * skillParam('ciencia_falha')), 12);
    expect(skilled).toBeGreaterThan(0);
  });
});

describe('árvore de tecnologias: efeitos por um canal só', () => {
  it('efeito no potencial chega aos poucos; a soma dos impulsos é exatamente nível × efeito', () => {
    const node = TECHNOLOGY.nodes.find((n) => n.id === 'bioinsumos')!;
    const start = adopted(fresh(), 'bioinsumos', 'desenvolver');
    const ramp: GameState = {
      ...start,
      research: { programs: start.research.programs.map((p) => ({ ...p, effectLevel: 0 })) },
    };
    let total = 0;
    const collect: MonthStep = (state) => {
      total += state.impulses
        .filter((i) => i.sourceId === `pesquisa:bioinsumos:efeito:${state.monthIndex}`)
        .reduce((sum, i) => sum + i.delta / 12, 0);
      return { state, contributions: [] };
    };
    const s = run(ramp, 12, [room(1_000_000), researchStep, collect]);
    const program = programOf(s, 'bioinsumos')!;
    expect(program.effectLevel).toBeGreaterThan(0.5);
    expect(program.effectLevel).toBeLessThan(1);
    expect(total).toBeCloseTo(program.effectLevel * node.effect.value, 12);
    expect(s.impulses.some((i) => i.target === 'oferta.potencial' && i.endMonth === null)).toBe(false);
  });

  it('manutenção sem orçamento desgasta o efeito', () => {
    const start = adopted(fresh(), 'bioinsumos', 'desenvolver');
    const s = run(start, 6, [room(0), researchStep]);
    const program = programOf(s, 'bioinsumos')!;
    expect(program.maintained).toBe(0);
    expect(program.effectLevel).toBeLessThan(0.5);
    expect(program.bottleneck).toBe('orcamento');
  });

  it('energia: redes inteligentes somam transmissão e trem rápido soma demanda no balanço, não no PIB', () => {
    const s = adopted(adopted(fresh(), 'redes_inteligentes', 'importar'), 'trem_alta_velocidade', 'importar');
    const effects = researchEnergyEffects(s, content);
    expect(effects.transmission).toBe(1);
    expect(effects.demand).toBeCloseTo(0.4, 12);
    const base = advanceMonth(fresh(), { decisions: [] }, content, [energyStep]).state.energy;
    const out = advanceMonth(s, { decisions: [] }, content, [energyStep]).state.energy;
    expect(out.transmissionCapacity - base.transmissionCapacity).toBeCloseTo(1, 9);
    expect(out.demand).toBeGreaterThan(base.demand);
  });

  it('exportar só depois de certificar uma tecnologia dominada no país, e cresce aos poucos', () => {
    const imported = adopted(fresh(), 'bioinsumos', 'importar');
    const refused = advanceMonth(
      imported,
      {
        decisions: [{ policyId: CERTIFY_EXPORT_ACTION_ID, agendaCost: 1, params: { nodeId: 'bioinsumos' } }],
      },
      content,
    );
    expect(refused.report.rejected.map((r) => r.reason)).toEqual(['alvo_invalido']);
    const own = adopted(fresh(), 'bioinsumos', 'desenvolver');
    const certified = advanceMonth(
      own,
      {
        decisions: [{ policyId: CERTIFY_EXPORT_ACTION_ID, agendaCost: 1, params: { nodeId: 'bioinsumos' } }],
      },
      content,
      [room(1_000_000), researchStep],
    ).state;
    expect(technologyExportMillions(certified, content)).toBe(0);
    const later = run(certified, researchParam('meses_certificacao') + 3, [room(1_000_000), researchStep]);
    const exports = technologyExportMillions(later, content);
    expect(exports).toBeGreaterThan(0);
    expect(exports).toBeLessThan(TECHNOLOGY.nodes.find((n) => n.id === 'bioinsumos')!.exportMillions);
  });

  it('sem programa, a etapa é inerte: estado e impulsos idênticos', () => {
    const state = fresh();
    const out = advanceMonth(state, { decisions: [] }, content, [room(1_000_000), researchStep]).state;
    expect(out.research).toEqual(state.research);
    expect(out.impulses).toEqual(state.impulses.filter((i) => i.endMonth === null || i.endMonth >= 1));
  });
});

describe('árvore de tecnologias: campanha completa', () => {
  it('48 meses com programas e o pipeline inteiro: invariantes e determinismo', () => {
    const plan: Record<number, Decision[]> = {
      0: [fund('redes_inteligentes', 'importar'), fund('bioinsumos', 'desenvolver')],
      1: [fund('sinalizacao_ferroviaria', 'desenvolver')],
    };
    const play = (seed: number) => {
      let s = fresh(seed);
      const errors: string[] = [];
      for (let m = 0; m < 48; m++) {
        const out = advanceMonth(s, { decisions: plan[m] ?? [] }, content, DEFAULT_STEPS);
        errors.push(...checkInvariants(s, out.state, out.report, content).map((e) => `mês ${m}: ${e}`));
        errors.push(...checkResearch(s.research, out.state.research, content));
        s = out.state;
      }
      return { s, errors };
    };
    const a = play(11);
    expect(a.errors).toEqual([]);
    expect(programOf(a.s, 'redes_inteligentes')?.status).toBe('adotada');
    expect(play(11).s).toEqual(a.s);
  });
});
