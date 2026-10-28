import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import {
  advanceMonth,
  careerSchedule,
  createInitialState,
  type Contribution,
  type GameState,
  type MonthReport,
} from '@/engine';
import type { PublicProject } from '@/engine/publicPolicies/types';

import {
  effectLine,
  splitEffects,
  tutorialElection,
  tutorialProject,
  tutorialStatus,
  type TutorialEffect,
} from './tutorialView';

// PLANO_CAMPANHA.md Fase C8.2: a tela do tutorial mostra o que o jogador causou, separado do resto do mês.

const content = loadContent(DEFAULT_SCENARIO_ID);
const contribution = (cause: string, indicator: string, delta: number, label?: string): Contribution => ({
  cause,
  indicator: indicator as Contribution['indicator'],
  delta,
  label,
});

function report(contributions: Contribution[], eventsResolved: MonthReport['eventsResolved'] = []): MonthReport {
  return { contributions, eventsResolved } as MonthReport;
}

describe('leitura do tutorial (PLANO_CAMPANHA.md Fase C8.2)', () => {
  it('separa as causas do jogador do ruído do mês e agrega repetições da mesma causa', () => {
    const effects = splitEffects(
      report(
        [
          contribution('acao:caravana_regional', 'approval', 0.001),
          contribution('acao:caravana_regional', 'approval', 0.002, 'Caravana regional'),
          contribution('acao:caravana_regional', 'careerRecognition', 0.05, 'Caravana regional'),
          contribution('debate:propositiva', 'careerValence', 0.01, 'Debate'),
          contribution('evento:cpi', 'approval', -0.003, 'CPI'),
          contribution('evento:clima', 'approval', -0.001, 'Clima'),
          contribution('choque:petroleo', 'inflation12m', 0.004, 'Petróleo'),
        ],
        [
          { eventId: 'cpi', choiceId: 'colaborar_com_a_cpi', automatic: false },
          { eventId: 'clima', choiceId: 'padrao', automatic: true },
        ],
      ),
    );

    expect(effects.own.map((effect) => effect.cause)).toEqual([
      'acao:caravana_regional',
      'debate:propositiva',
      'acao:caravana_regional',
      'evento:cpi',
    ]);
    const approval = effects.own.find((effect) => effect.indicator === 'approval')!;
    expect(approval.delta).toBeCloseTo(0.003, 12);
    expect(effects.own.map((effect) => effect.label)).toEqual([
      'Caravana regional',
      'Debate',
      'Caravana regional',
      'CPI',
    ]);
    // O evento automático não entra como escolha do jogador; o choque e o clima ficam no resto do mês.
    expect(effects.others.map((effect) => effect.cause).sort()).toEqual(['choque:petroleo', 'evento:clima']);
  });

  it('descreve o efeito com o nome público do indicador e o sinal', () => {
    const effect = (label: string, indicator: string, delta: number): TutorialEffect => ({
      cause: label,
      indicator,
      label,
      delta,
    });
    expect(effectLine(effect('Caravana regional', 'approval', 0.0012))).toBe('Caravana regional · Aprovação +0,1 p.p.');
    expect(effectLine(effect('Debate', 'careerRecognition', -0.02))).toBe('Debate · Reconhecimento −2,0 p.p.');
  });

  it('na campanha, a situação mostra caixa, agenda e pesquisa', () => {
    const start = createInitialState({ content, difficulty: 'casual', seed: 42, startPoint: 'corrida' });
    const before = tutorialStatus(start, content);
    expect(before.when).toMatch(/^Corrida eleitoral · ago\/2026$/);
    expect(before.items.some((item) => item.startsWith('Caixa do partido: R$'))).toBe(true);
    expect(before.items.some((item) => item.includes('ações por turno'))).toBe(true);
    expect(before.items).toContain('Pesquisa: ainda não publicada');

    const after = advanceMonth(start, { decisions: [] }, content);
    const status = tutorialStatus(after.state, content, after.report);
    expect(status.items.some((item) => item.startsWith('Pesquisa: você'))).toBe(true);
    expect(status.items.some((item) => /^Reconhecimento: \d+ de 27 estados ao menos conhecido$/.test(item))).toBe(true);
  });

  it('no governo, a situação mostra aprovação, espaço fiscal e carteira', () => {
    const state = createInitialState({ content, difficulty: 'casual', seed: 42, startPoint: 'posse' });
    const status = tutorialStatus(state, content);
    expect(status.when).toMatch(/^\w+ de \d{4}$/);
    expect(status.items).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Aprovação: \d/),
        expect.stringMatching(/^Espaço fiscal: R\$/),
        expect.stringMatching(/ações por mês$/),
      ]),
    );
  });

  it('a eleição usa os dois turnos e compara a última pesquisa com o resultado', () => {
    const electionTurn = careerSchedule(content, 'corrida').findIndex((turn) => turn.stage === 'eleicao');
    let state: GameState = createInitialState({ content, difficulty: 'casual', seed: 42, startPoint: 'corrida' });
    for (let month = 0; month < electionTurn; month++) state = advanceMonth(state, { decisions: [] }, content).state;
    const elected = advanceMonth(state, { decisions: [] }, content).state;

    const view = tutorialElection(elected, content)!;
    expect(view.rounds.length).toBeGreaterThanOrEqual(1);
    for (const round of view.rounds) {
      expect(round.lines.length).toBeGreaterThan(1);
      for (const line of round.lines) expect(line).toMatch(/: \d+,\d%|: \d+%/);
    }
    expect(view.pollVsResult).toMatch(/última pesquisa/);
    expect(typeof view.won).toBe('boolean');
  });

  it('a carteira explica fase, gargalo, manutenção e saldo plurianual', () => {
    const base = createInitialState({ content, difficulty: 'casual', seed: 7, startPoint: 'posse' });
    const project: PublicProject = {
      proposalId: 'projeto-teste',
      policyId: 'projeto_corredores_logisticos',
      phase: 'obra',
      phaseMonth: 2,
      bottleneck: 'orcamento',
      progress: 0.42,
      budgetMillions: 900,
      spentMillions: 300,
      assetMillions: 0,
      maintenanceMillions: 12,
      delayMonths: 0,
      startMonth: base.monthIndex,
    };
    const state: GameState = {
      ...base,
      publicPolicies: { ...base.publicPolicies, projects: [project] },
    };
    const view = tutorialProject(state, content, project);
    expect(view.phase).toBe('Obra');
    expect(view.progress).toBe('42%');
    expect(view.budget).toBe('R$ 300 mi de R$ 900 mi');
    expect(view.bottleneck).toBe('orçamento disponível');
    expect(view.maintenance).toBe('R$ 12 mi');
    expect(view.commitments).toMatch(/de saldo previsto em \d+ ano/);
  });
});
