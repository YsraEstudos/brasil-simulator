import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { SANCTION_ACTION_ID } from '@/engine/actions';
import { advanceMonth } from '@/engine/advanceMonth';
import { DEFAULT_CALIBRATION, type Calibration } from '@/engine/economy/calibration';
import { proposalsStep } from '@/engine/proposals/proposals';
import { createInitialState, currentNominalGdpMillions } from '@/engine/state';
import type { Decision, GameContent, GameState } from '@/engine/types';

import { vetoOverrideSupport } from './congress';
import {
  drawFiscalBomb,
  fiscalBombChance,
  fiscalBombCostText,
  fiscalBombPolicies,
  fiscalBombProposer,
  nextFiscalBomb,
} from './fiscalBombs';

// PLANO_CAMPANHA.md Fase C6c: pauta-bomba (quem propõe, quando chega, sanção/veto e impacto fiscal).

const base = loadContent(DEFAULT_SCENARIO_ID);
const BOMBS = base.scenario.institutions!.fiscalBombs!;
const withCalibration = (calibration: Partial<Calibration>): GameContent => ({
  ...base,
  calibration: { ...base.calibration, ...calibration },
});
const off: GameContent = {
  ...base,
  scenario: { ...base.scenario, institutions: { ...base.scenario.institutions!, fiscalBombs: undefined } },
};
// Chance 1 assim que a relação fica abaixo do limite.
const certain = withCalibration({ bomba_chance_por_ponto: 1, bomba_chance_max: 1 });

function hostile(content: GameContent = base, monthIndex = 2, relation = -40): GameState {
  const s = createInitialState({ content, difficulty: 'estrategica', seed: 5 });
  return {
    ...s,
    monthIndex,
    congress: {
      ...s.congress,
      blocs: content.scenario.blocs.map((b) => ({ id: b.id, governmentRelation: relation })),
    },
  };
}
const month = (s: GameState, decisions: Decision[], content: GameContent) =>
  advanceMonth(s, { decisions }, content, [proposalsStep]);
const bombsIn = (s: GameState) => s.proposals.filter((p) => BOMBS.includes(p.policyId));

describe('quando chega a pauta-bomba (PLANO_CAMPANHA.md Fase C6c)', () => {
  it('o cenário padrão tem os textos fora do catálogo do jogador', () => {
    expect(fiscalBombPolicies(base).map((p) => p.id)).toEqual(BOMBS);
    for (const id of BOMBS) expect(base.scenario.policies).not.toContain(id);
  });

  it('sem relação ruim com o Congresso a chance é 0; abaixo do limite, cresce com a distância, com teto', () => {
    const c = base.calibration;
    expect(fiscalBombChance(hostile(base, 2, c.bomba_relacao_limite + 5), base)).toBe(0);
    expect(fiscalBombChance(hostile(base, 2, c.bomba_relacao_limite - 10), base)).toBeCloseTo(
      Math.min(c.bomba_chance_max, 10 * c.bomba_chance_por_ponto),
      12,
    );
    expect(fiscalBombChance(hostile(base, 2, -100), base)).toBe(c.bomba_chance_max);
  });

  it('não chega em janeiro (recesso) nem com o sistema desligado', () => {
    expect(fiscalBombChance(hostile(base, 12), base)).toBe(0);
    expect(fiscalBombChance(hostile(off), off)).toBe(0);
  });

  it('chega para sanção no mês seguinte, com o bloco que propôs e o custo no histórico', () => {
    const s0 = hostile(certain);
    const out = month(s0, [], certain);
    const [bomb] = bombsIn(out.state);
    expect(bomb.policyId).toBe(BOMBS[0]);
    expect(bomb.status).toBe('aguardando_sancao');
    expect(bomb.voteMonth).toBe(s0.monthIndex + 1);
    const proposer = fiscalBombProposer(s0, certain.policies[BOMBS[0]], certain)!;
    expect(bomb.history[0].cause).toBe('pauta_bomba');
    expect(bomb.history[0].detail).toContain(`bloco ${proposer.name}`);
    expect(bomb.history[0].detail).toContain(fiscalBombCostText(certain.policies[BOMBS[0]]));
    expect(out.report.proposalChanges.map((c) => c.transition.cause)).toContain('pauta_bomba');
  });

  it('quem propõe é o bloco com maior apoio à derrubada de um veto ao texto', () => {
    const s = hostile();
    const policy = base.policies[BOMBS[1]];
    const proposer = fiscalBombProposer(s, policy, base)!;
    for (const bloc of base.scenario.blocs) {
      expect(vetoOverrideSupport(s, policy, proposer, 'total', base)).toBeGreaterThanOrEqual(
        vetoOverrideSupport(s, policy, bloc, 'total', base),
      );
    }
  });

  it('cada texto chega uma vez, na ordem do cenário, com intervalo mínimo entre eles', () => {
    let s = month(hostile(certain), [], certain).state;
    expect(nextFiscalBomb(s, certain)?.id).toBe(BOMBS[1]);
    const gap = certain.calibration.bomba_intervalo_meses;
    expect(fiscalBombChance({ ...s, monthIndex: s.monthIndex + gap - 2 }, certain)).toBe(0);
    s = month({ ...s, monthIndex: s.monthIndex + gap - 1 }, [], certain).state;
    expect(bombsIn(s).map((p) => p.policyId)).toEqual(BOMBS);
    expect(nextFiscalBomb(s, certain)).toBeNull();
    expect(fiscalBombChance({ ...s, monthIndex: s.monthIndex + 2 * gap }, certain)).toBe(0);
  });

  it('o sorteio é por chave: não consome o PRNG principal e repete com a mesma semente', () => {
    const s = hostile(base);
    expect(drawFiscalBomb(s, base)).toEqual(drawFiscalBomb(s, base));
    const noBomb = withCalibration({ bomba_chance_por_ponto: 0 });
    expect(month(s, [], base).state.rng).toEqual(month(s, [], noBomb).state.rng);
  });
});

describe('sanção, veto e custo fiscal (PLANO_CAMPANHA.md Fase C6c)', () => {
  const arrived = () => month(hostile(certain), [], certain).state;
  const sanction = (s: GameState, choice: string): Decision => ({
    policyId: SANCTION_ACTION_ID,
    agendaCost: 0,
    params: { proposalId: bombsIn(s)[0].id, choice },
  });

  it('sem resposta vale a sanção tácita, e a despesa obrigatória entra como fração do PIB por ano, permanente', () => {
    const s1 = arrived();
    const out = month(s1, [], certain);
    const bomb = bombsIn(out.state)[0];
    expect(bomb.status).toBe('em_execucao');
    expect(bomb.history.at(-1)?.cause).toBe('sancao_tacita');
    const policy = certain.policies[BOMBS[0]];
    const spending = out.state.impulses.find(
      (i) => i.sourceId === `proposta:${bomb.id}` && i.target === 'gasto.obrigatoria',
    );
    expect(spending?.delta).toBeCloseTo(policy.cost.annualMillions / currentNominalGdpMillions(s1, certain), 12);
    expect(spending?.endMonth).toBeNull();
  });

  it('o veto total vai à sessão do veto, como os projetos do governo', () => {
    const s1 = arrived();
    const out = month(s1, [sanction(s1, 'vetar_total')], certain);
    expect(out.report.rejected).toEqual([]);
    const bomb = bombsIn(out.state)[0];
    expect(bomb.status).toBe('apreciacao_veto');
    expect(bomb.veto).toEqual({ kind: 'total', overridden: null });
    expect(out.state.impulses.some((i) => i.sourceId === `proposta:${bomb.id}`)).toBe(false);
  });
});

describe('regressão com o sistema desligado (PLANO_CAMPANHA.md Fase C6)', () => {
  it('no cenário padrão, sem decisões, o jogo é idêntico ligado ou desligado até a primeira pauta-bomba', () => {
    let a = createInitialState({ content: base, difficulty: 'estrategica', seed: 7 });
    let b = createInitialState({ content: off, difficulty: 'estrategica', seed: 7 });
    expect(a).toEqual(b);
    let arrival: number | null = null;
    for (let i = 0; i < 36 && arrival === null; i++) {
      const ra = advanceMonth(a, { decisions: [] }, base);
      const rb = advanceMonth(b, { decisions: [] }, off);
      if (bombsIn(ra.state).length > 0) {
        arrival = a.monthIndex;
        // No mês da chegada só muda a lista de propostas: o resto do mês é o mesmo.
        expect({ ...ra.state, proposals: [] }).toEqual({ ...rb.state, proposals: [] });
        expect({ ...ra.report, proposalChanges: [] }).toEqual({ ...rb.report, proposalChanges: [] });
      } else {
        expect(ra.report).toEqual(rb.report);
        expect(ra.state).toEqual(rb.state);
      }
      a = ra.state;
      b = rb.state;
    }
    // Sem decisões, a relação média cai abaixo do limite e a pauta-bomba chega dentro de 3 anos (semente 7).
    expect(arrival).not.toBeNull();
  });

  it('os parâmetros novos existem no padrão', () => {
    expect(DEFAULT_CALIBRATION.bomba_intervalo_meses).toBeGreaterThan(0);
  });
});
