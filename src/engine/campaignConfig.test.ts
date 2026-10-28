import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent, SCENARIOS } from '@/content';
import { createInitialState } from './state';
import { advanceMonth } from './advanceMonth';
import { checkInvariants } from './invariants';
import { campaignConfigSchema, START_SITUATIONS } from './campaignConfig';
import { eventProbability } from './events/events';
import { vedacaoAtiva } from './elections/vedacao';

describe('situações iniciais', () => {
  it('valida e serializa o contrato de configuração; rejeita parâmetros fora da faixa', () => {
    const content = loadContent(DEFAULT_SCENARIO_ID);
    const state = createInitialState({ content, difficulty: 'estrategica', seed: 31 });
    const config = state.initialCampaignConfiguration;
    expect(config.schemaVersion).toBe(2);
    expect(campaignConfigSchema.parse(JSON.parse(JSON.stringify(config)))).toEqual(config);
    expect(
      campaignConfigSchema.safeParse({ ...config, challenge: { ...config.challenge, crisisFrequency: 2 } }).success,
    ).toBe(false);
  });
  it('ajustes de desafio mudam condições de risco e oposição sem mudar a semente', () => {
    const content = loadContent(DEFAULT_SCENARIO_ID);
    const make = (value: number) =>
      createInitialState({
        content,
        difficulty: 'estrategica',
        seed: 31,
        startPoint: 'corrida',
        challenge: {
          economicPressure: value,
          oppositionStrength: value,
          coalitionStability: 0.5,
          crisisFrequency: 0.5,
        },
      } as Parameters<typeof createInitialState>[0]);
    const easy = make(0);
    const hard = make(1);
    expect(hard.economy.riskPremium).toBeGreaterThan(easy.economy.riskPremium);
    expect(hard.career!.opponents[0].recognition.SP).toBeGreaterThan(easy.career!.opponents[0].recognition.SP);
    expect(hard.seed).toBe(easy.seed);
    expect(hard.initialCampaignConfiguration).toMatchObject({
      presetId: 'personalizada',
      challenge: { economicPressure: 1, oppositionStrength: 1 },
    });
  });

  it('estabilidade da coalizão e frequência de crises afetam apenas seus canais', () => {
    const content = loadContent(DEFAULT_SCENARIO_ID);
    const make = (coalitionStability: number, crisisFrequency: number) =>
      createInitialState({
        content,
        difficulty: 'estrategica',
        seed: 31,
        challenge: { economicPressure: 0.5, oppositionStrength: 0.5, coalitionStability, crisisFrequency },
      });
    const low = make(0, 0);
    const high = make(1, 1);
    const lowTurn = advanceMonth(low, { decisions: [] }, content);
    const highTurn = advanceMonth(high, { decisions: [] }, content);
    expect(highTurn.state.congress.blocs[0].governmentRelation).toBeGreaterThan(
      lowTurn.state.congress.blocs[0].governmentRelation,
    );
    const event = content.events.find((item) => item.trigger.climate)!;
    const location = { affectedUfs: ['SP'], primaryUf: 'SP', severityByUf: { SP: 0.8 } };
    expect(eventProbability(high, event, content, location)).toBeGreaterThan(
      eventProbability(low, event, content, location),
    );
    expect(high.rng).toEqual(low.rng);
  });

  it('as regras eleitorais são escolhidas separadamente da dificuldade', () => {
    const content = loadContent(DEFAULT_SCENARIO_ID);
    const make = (difficulty: 'casual' | 'realismo', institutionalRules: 'brasileiras' | 'simplificadas') => ({
      ...createInitialState({ content, difficulty, seed: 31, institutionalRules } as Parameters<
        typeof createInitialState
      >[0]),
      monthIndex: 18,
    });
    expect(vedacaoAtiva(make('casual', 'brasileiras'), content)).toBe(true);
    expect(vedacaoAtiva(make('realismo', 'brasileiras'), content)).toBe(true);
    expect(vedacaoAtiva(make('casual', 'simplificadas'), content)).toBe(false);
    expect(vedacaoAtiva(make('realismo', 'simplificadas'), content)).toBe(false);
  });

  it('clareza da pesquisa altera a publicação, não o estado real da campanha nem o sorteio principal', () => {
    const content = loadContent(DEFAULT_SCENARIO_ID);
    const make = (informationClarity: 'clara' | 'incerta') =>
      createInitialState({
        content,
        difficulty: 'estrategica',
        seed: 31,
        startPoint: 'corrida',
        assistance: { informationClarity, hints: true },
      } as Parameters<typeof createInitialState>[0]);
    const clear = advanceMonth(make('clara'), { decisions: [] }, content).state;
    const uncertain = advanceMonth(make('incerta'), { decisions: [] }, content).state;
    expect(clear.career!.poll!.margin).toBeLessThan(uncertain.career!.poll!.margin);
    expect(clear.career!.poll!.intentions).not.toEqual(uncertain.career!.poll!.intentions);
    expect(clear.career!.recognition).toEqual(uncertain.career!.recognition);
    expect(clear.rng).toEqual(uncertain.rng);
  });
  it('produzem condições econômicas distintas, determinísticas e persistidas', () => {
    const content = loadContent(DEFAULT_SCENARIO_ID);
    const make = (startSituationId: string) =>
      createInitialState({
        content,
        difficulty: 'estrategica',
        seed: 31,
        startSituationId,
      } as Parameters<typeof createInitialState>[0]);
    const base = make('normal');
    const external = make('pressao_externa');
    const slowdown = make('desaceleracao');
    expect(external.economy.riskPremium).toBeGreaterThan(base.economy.riskPremium);
    expect(slowdown.economy.outputGap).toBeLessThan(base.economy.outputGap);
    expect(external).toEqual(make('pressao_externa'));
    expect(external.initialCampaignConfiguration).toMatchObject({ startSituationId: 'pressao_externa' });
    const normalNext = advanceMonth(base, { decisions: [] }, content).state;
    expect(advanceMonth(external, { decisions: [] }, content).state.economy.riskPremium).toBeGreaterThan(
      normalNext.economy.riskPremium,
    );
    expect(advanceMonth(slowdown, { decisions: [] }, content).state.economy.outputGap).toBeLessThan(
      normalNext.economy.outputGap,
    );
  });

  it('mantém invariantes nos cenários e situações disponíveis durante o primeiro ano', () => {
    for (const id of Object.keys(SCENARIOS)) {
      const content = loadContent(id);
      for (const situation of START_SITUATIONS) {
        let state = createInitialState({
          content,
          difficulty: 'estrategica',
          seed: 31,
          startSituationId: situation.id,
        });
        for (let month = 0; month < 12; month++) {
          const result = advanceMonth(state, { decisions: [] }, content);
          expect(
            checkInvariants(state, result.state, result.report, content),
            `${id}/${situation.id}/${month}`,
          ).toEqual([]);
          state = result.state;
        }
      }
    }
  });
});
