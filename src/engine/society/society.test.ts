import { describe, expect, it } from 'vitest';

import { EVENTS } from '@/content/events';
import { POLICIES } from '@/content/policies';
import { SCENARIOS } from '@/content/scenarios';
import { calibrationFromScenario } from '@/engine/economy/calibration';
import { createInitialState } from '@/engine/state';
import { createRng, seedRng } from '@/engine/rng';
import { upgradeGameState } from '@/engine/upgrade';
import type { GameContent, GameState, ReportDraft, ScheduledImpulse, StepContext } from '@/engine/types';

import v5Save from '@/tests/saves/state_v5_fase05.json';

import {
  initialSociety,
  initialSocietyForGame,
  SOCIETY_SECTOR_IDS,
  SOCIETY_QUINTILE_IDS,
  societyStep,
  checkSociety,
} from './society';
import type { SocietyState } from './types';

const content: GameContent = {
  scenario: SCENARIOS.brasil_2027_01,
  policies: POLICIES,
  events: EVENTS,
  calibration: calibrationFromScenario(SCENARIOS.brasil_2027_01.parameters),
};
type GameWithSociety = GameState & { society: SocietyState };

function context(): StepContext {
  const draft: ReportDraft = {
    proposalChanges: [],
    eventsResolved: [],
    eventsFired: [],
    notes: [],
    copom: null,
    regional: null,
  };
  return {
    rng: createRng(seedRng(42)),
    content,
    decisions: [],
    eventChoices: [],
    draft,
  };
}

function gameWithSociety(overrides: Partial<GameState> = {}): GameWithSociety {
  return {
    ...createInitialState({ content, difficulty: 'estrategica', seed: 4 }),
    ...overrides,
    society: initialSociety(),
  } as GameWithSociety;
}

function impulse(partial: Partial<ScheduledImpulse>): ScheduledImpulse {
  return {
    sourceId: 'proposta:teste_0',
    label: 'Causa de teste',
    target: 'gasto.custeio',
    delta: 0.01,
    startMonth: 0,
    endMonth: null,
    ...partial,
  };
}

function socialAfter(game: GameWithSociety): SocietyState {
  return societyStep(game, context()).state.society;
}

describe('sociedade — Fase 06 tarefa 2', () => {
  // ECONOMIC_MODEL.md §3 e FASE_06.md: seis setores e cinco quintis fazem parte do estado social persistido.
  it('inicializa seis setores e cinco quintis com participações reconciliadas', () => {
    const state = initialSociety();

    expect(state.sectors.map((sector) => sector.id)).toEqual([...SOCIETY_SECTOR_IDS]);
    expect(state.quintiles.map((quintile) => quintile.id)).toEqual([...SOCIETY_QUINTILE_IDS]);
    expect(state.sectors.reduce((sum, sector) => sum + sector.share, 0)).toBeCloseTo(1, 12);
    expect(state.quintiles.reduce((sum, quintile) => sum + quintile.incomeShare, 0)).toBeCloseTo(1, 12);
    expect(state.nationalOutput).toBeGreaterThan(0);
  });

  // FASE_06.md e ECONOMIC_MODEL.md §7: o bloco social distribui o agregado sem criar PIB adicional.
  it('reparte exatamente o produto nacional e passa seus próprios invariantes', () => {
    const game = gameWithSociety();
    const next = socialAfter(game);

    expect(next.nationalOutput).toBeCloseTo(game.economy.potentialIndex * Math.exp(game.economy.outputGap), 12);
    expect(next.sectors.reduce((sum, sector) => sum + sector.output, 0)).toBeCloseTo(next.nationalOutput, 12);
    expect(next.sectors.reduce((sum, sector) => sum + sector.share, 0)).toBeCloseTo(1, 12);
    expect(next.quintiles.reduce((sum, quintile) => sum + quintile.incomeShare, 0)).toBeCloseTo(1, 12);
    expect(checkSociety(next, game)).toEqual([]);
  });

  // FASE_06.md: transferências de baixa renda melhoram q1/pobreza; tributos regressivos fazem o movimento contrário.
  it('responde a transferência para baixa renda e a tributo regressivo com sinais opostos', () => {
    const baseline = socialAfter(gameWithSociety());
    const transfer = socialAfter(
      gameWithSociety({
        impulses: [
          impulse({
            sourceId: 'proposta:transferencia_renda_ampliacao_0',
            label: 'Ampliação do programa de transferência de renda',
            target: 'gasto.transferencia_baixa_renda',
          }),
        ],
      }),
    );
    const tax = socialAfter(
      gameWithSociety({
        impulses: [
          impulse({
            sourceId: 'proposta:tributo_regressivo_0',
            label: 'Tributo regressivo',
            target: 'receita.consumo',
          }),
        ],
      }),
    );

    expect(transfer.quintiles[0].realIncome).toBeGreaterThan(baseline.quintiles[0].realIncome);
    expect(transfer.povertyRate).toBeLessThan(baseline.povertyRate);
    expect(tax.quintiles[0].realIncome).toBeLessThan(baseline.quintiles[0].realIncome);
    expect(tax.povertyRate).toBeGreaterThan(baseline.povertyRate);
    expect(transfer.explanations.some((item) => item.cause === 'proposta:transferencia_renda_ampliacao_0')).toBe(true);
    expect(tax.explanations.some((item) => item.cause === 'proposta:tributo_regressivo_0')).toBe(true);
  });

  // ECONOMIC_MODEL.md §5.11 e FASE_06.md: impulsos ativos preservam sourceId e incidência setorial.
  it('aplica efeito setorial rastreável aos setores afetados sem criar produto agregado', () => {
    const baseline = socialAfter(gameWithSociety());
    const affected = impulse({
      sourceId: 'proposta:infraestrutura_credito_adicional_0',
      label: 'Crédito adicional para infraestrutura',
      target: 'gasto.investimento',
    }) as ScheduledImpulse & { affected: { sectors: string[] } };
    affected.affected = { sectors: ['construcao'] };
    const next = socialAfter(gameWithSociety({ impulses: [affected] }));
    const construction = next.sectors.find((sector) => sector.id === 'construcao');
    const baselineConstruction = baseline.sectors.find((sector) => sector.id === 'construcao');
    if (!construction || !baselineConstruction) throw new Error('setor de construção ausente');

    expect(construction.growth).toBeGreaterThan(baselineConstruction.growth);
    expect(next.nationalOutput).toBeCloseTo(baseline.nationalOutput, 12);
    expect(next.explanations.some((item) => item.cause === affected.sourceId && item.metric === 'sector_output')).toBe(
      true,
    );
    const explainedSectorDelta = next.explanations
      .filter((item) => item.metric === 'sector_output')
      .reduce((sum, item) => sum + item.delta, 0);
    expect(explainedSectorDelta).toBeCloseTo(next.nationalOutput - gameWithSociety().society.nationalOutput, 12);
  });

  it('resolve a incidência da rotina real pelo sourceId delimitado da diretriz', () => {
    const routine = Object.values(POLICIES).find(
      (policy) => policy.delivery === 'rotina' && policy.affected.sectors.includes('energia'),
    );
    if (!routine) throw new Error('catálogo sem rotina de energia');

    const baseline = socialAfter(gameWithSociety());
    const sourceId = `diretriz:minas_energia:${routine.id}:2027:0`;
    const next = socialAfter(
      gameWithSociety({
        impulses: [
          impulse({
            sourceId,
            label: `Diretriz: ${routine.name}`,
            target: 'gasto.custeio',
          }),
        ],
      }),
    );
    const energy = next.sectors.find((sector) => sector.id === 'energia');
    const baselineEnergy = baseline.sectors.find((sector) => sector.id === 'energia');
    if (!energy || !baselineEnergy) throw new Error('setor de energia ausente');

    expect(energy.growth).toBeGreaterThan(baselineEnergy.growth);
    expect(next.explanations.some((item) => item.cause === sourceId && item.metric === 'sector_output')).toBe(true);
  });

  // AI_INSTRUCTIONS.md §5 e ECONOMIC_MODEL.md §1.2: determinismo e carregamento de save legado.
  it('é determinístico e reconstitui o bloco ao carregar save v5 sem sociedade', () => {
    const game = gameWithSociety();
    const first = socialAfter(game);
    const second = socialAfter(game);
    expect(second).toEqual(first);

    const legacy = upgradeGameState(5, structuredClone(v5Save) as unknown) as GameState;
    expect(legacy.society.nationalOutput).toBeCloseTo(
      legacy.economy.potentialIndex * Math.exp(legacy.economy.outputGap),
      12,
    );
    expect(legacy.society.unemployment).toBeCloseTo(legacy.indicators.unemployment, 12);
    expect(legacy.society.minimumWage).toBeCloseTo(legacy.economy.fiscal.minimumWageIndex, 12);
    expect(legacy.society.sectors).toHaveLength(6);
    expect(legacy.society.quintiles).toHaveLength(5);
    expect(checkSociety(legacy.society, legacy)).toEqual([]);
  });

  // FASE_06.md: uma política em nível converge e, após terminar, o componente transitório reverte.
  it('trata transferências e tributos como nível defasado, sem crescimento exponencial permanente', () => {
    let game = gameWithSociety({
      impulses: [
        impulse({
          sourceId: 'proposta:transferencia_renda_ampliacao_0',
          target: 'gasto.transferencia_baixa_renda',
          endMonth: null,
        }),
      ],
    });
    let atMonth48: SocietyState | undefined;
    let atMonth240: SocietyState | undefined;
    for (let month = 0; month < 240; month += 1) {
      const next = societyStep(game, context()).state;
      game = { ...next, monthIndex: game.monthIndex + 1 };
      if (month === 47) atMonth48 = game.society;
      if (month === 239) atMonth240 = game.society;
    }
    if (!atMonth48 || !atMonth240) throw new Error('marcos da campanha ausentes');
    expect(atMonth240.quintiles[0].policyAdjustment).toBeCloseTo(atMonth48.quintiles[0].policyAdjustment, 5);

    const incomeAtEnd = atMonth240.quintiles[0].realIncome;
    game = { ...game, impulses: [] };
    for (let month = 0; month < 48; month += 1) {
      const next = societyStep(game, context()).state;
      game = { ...next, monthIndex: game.monthIndex + 1 };
    }
    expect(game.society.quintiles[0].policyAdjustment).toBeCloseTo(0, 5);
    expect(game.society.quintiles[0].realIncome).toBeLessThan(incomeAtEnd);
  });

  // ECONOMIC_MODEL.md §1.8: saturação impede cruzamento de quintis em campanhas longas.
  it('preserva a ordem dos quintis em campanha longa e alinha o estado inicial ao cenário', () => {
    const initial = initialSocietyForGame(createInitialState({ content, difficulty: 'estrategica', seed: 4 }));
    const initialGame = createInitialState({ content, difficulty: 'estrategica', seed: 4 });
    expect(initial.nationalOutput).toBeCloseTo(
      initialGame.economy.potentialIndex * Math.exp(initialGame.economy.outputGap),
      12,
    );
    expect(initial.unemployment).toBeCloseTo(content.scenario.indicators.unemployment.value, 12);

    let game = gameWithSociety({
      impulses: [impulse({ target: 'receita.consumo', delta: 0.01, endMonth: null })],
    });
    for (let month = 0; month < 240; month += 1) {
      const next = societyStep(game, context()).state;
      game = { ...next, monthIndex: game.monthIndex + 1 };
    }
    for (let index = 1; index < game.society.quintiles.length; index += 1) {
      expect(game.society.quintiles[index].realIncome).toBeGreaterThanOrEqual(
        game.society.quintiles[index - 1].realIncome,
      );
    }
  });
});
