import { describe, expect, it } from 'vitest';

import { APPOINT_ACTION_ID } from '@/engine/actions';
import { advanceMonth } from '@/engine/advanceMonth';
import { DEFAULT_CALIBRATION } from '@/engine/economy/calibration';
import { proposalsStep } from '@/engine/proposals/proposals';
import type { Decision, GameContent, GameState } from '@/engine/types';
import { TEST_BILL, TEST_DECREE, TEST_SCENARIO, testContent, testState } from '@/tests/fixtures';
import type { Policy } from '@/types/policy';

import {
  cabinetScandalRisk,
  cabinetStep,
  cabinetSupport,
  longestServingPartisan,
  ministryOccupant,
  ministryScandalChance,
  partisanMinistries,
} from './cabinet';
import { blocSupport } from './congress';

const c = DEFAULT_CALIBRATION;
const content = testContent();
const ministry = (id: string) => {
  const m = TEST_SCENARIO.institutions?.ministries.find((x) => x.id === id);
  if (!m) throw new Error(id);
  return m;
};
const nomear = (ministryId: string, occupant: string): Decision => ({
  policyId: APPOINT_ACTION_ID,
  agendaCost: 1,
  params: { ministryId, occupant },
});
const relation = (s: GameState, id: string) => s.congress.blocs.find((b) => b.id === id)?.governmentRelation ?? 0;

function mes(state: GameState, decisions: Decision[], ctn: GameContent = content) {
  return advanceMonth(state, { decisions }, ctn, [cabinetStep, proposalsStep]);
}

describe('ministérios técnicos ou partidários (POLITICAL_RULES.md §6.3.1)', () => {
  it('no início todas as pastas seguem o cenário (técnicas): sem apoio nem risco de escândalo', () => {
    const s = testState();
    expect(partisanMinistries(s, content)).toEqual([]);
    expect(cabinetSupport(s, 'centro', content)).toBe(0);
    expect(cabinetScandalRisk(s, content)).toBe(0);
  });

  it('nomear indicação de bloco: relação do bloco sobe × peso e o bloco passa a apoiar mais', () => {
    const s0 = testState();
    const out = mes(s0, [nomear('social', 'centro')]);
    expect(out.report.rejected).toEqual([]);
    const s1 = out.state;
    expect(ministryOccupant(s1, ministry('social'))).toBe('centro');
    expect(relation(s1, 'centro')).toBeCloseTo(relation(s0, 'centro') + c.relacao_nomeacao * 0.7, 10);
    expect(cabinetSupport(s1, 'centro', content)).toBeCloseTo(c.apoio_ministerio * 0.7, 12);
    const centro = TEST_SCENARIO.blocs[1];
    expect(blocSupport(s1, TEST_BILL, centro, content)).toBeGreaterThan(blocSupport(s0, TEST_BILL, centro, content));
  });

  it('apoio por ministérios satura em `apoio_ministerio_max`', () => {
    let s = testState();
    for (const id of ['fazenda', 'social', 'gestao']) s = mes(s, [nomear(id, 'centro')]).state;
    expect(cabinetSupport(s, 'centro', content)).toBe(c.apoio_ministerio_max);
  });

  it('demitir ministro de bloco custa capital e piora a relação com o bloco', () => {
    const s1 = mes(testState(), [nomear('social', 'direita')]).state;
    const s2 = mes(s1, [nomear('social', 'tecnico')]).state;
    expect(ministryOccupant(s2, ministry('social'))).toBe('tecnico');
    expect(s2.resources.politicalCapital).toBe(s1.resources.politicalCapital + c.capital_demissao);
    expect(relation(s2, 'direita')).toBeCloseTo(relation(s1, 'direita') + c.relacao_demissao * 0.7, 10);
  });

  it('nomear o mesmo ocupante, pasta ou bloco inexistente é recusado', () => {
    const out = mes(testState(), [nomear('social', 'tecnico'), nomear('nao_existe', 'centro'), nomear('social', 'x')]);
    expect(out.report.rejected.map((r) => r.reason)).toEqual(['alvo_invalido', 'alvo_invalido', 'alvo_invalido']);
  });

  it('risco de escândalo cresce com o tempo no cargo, saturado', () => {
    const s1 = mes(testState(), [nomear('fazenda', 'centro')]).state;
    const chance = (t: number) => ministryScandalChance({ ...s1, monthIndex: t }, ministry('fazenda'), c);
    expect(chance(0)).toBeCloseTo(c.escandalo_base_mes, 12);
    expect(chance(25)).toBeGreaterThan(chance(13));
    expect(chance(600)).toBe(c.escandalo_max_mes);
    expect(cabinetScandalRisk({ ...s1, monthIndex: 25 }, content)).toBeCloseTo(chance(25), 12);
  });

  it('pasta de bloco executa pior: o ganho de aprovação da política rende menos', () => {
    const politica: Policy = {
      ...TEST_DECREE,
      id: 'teste_social_decreto',
      area: 'social',
      position: { economic: 0, social: 0 },
      impacts: [{ channel: 'aprovacao', magnitude: 0.02, lagMonths: 3 }],
    };
    const ctn = testContent({
      policies: { ...content.policies, [politica.id]: politica },
      scenario: { ...TEST_SCENARIO, policies: [...TEST_SCENARIO.policies, politica.id] },
    });
    const enviar: Decision = { policyId: politica.id, agendaCost: 1 };
    const tecnica = mes(testState(), [enviar], ctn).state;
    const partidaria = mes(mes(testState(), [nomear('social', 'centro')], ctn).state, [enviar], ctn).state;
    const ganho = (s: GameState) => s.impulses.find((i) => i.target === 'aprovacao')?.delta ?? 0;
    expect(ganho(tecnica)).toBeCloseTo(0.02, 12);
    expect(ganho(partidaria)).toBeCloseTo(0.02 * (1 - c.perda_execucao_partidaria), 12);
  });

  it('pasta de bloco contrário à política atrasa a execução', () => {
    // Política da área "social" com posição de mercado/conservadora: a esquerda é contrária.
    const politica: Policy = {
      ...TEST_DECREE,
      id: 'teste_social_contrario',
      area: 'social',
      position: { economic: 0.9, social: 0.9 },
    };
    const ctn = testContent({
      policies: { ...content.policies, [politica.id]: politica },
      scenario: { ...TEST_SCENARIO, policies: [...TEST_SCENARIO.policies, politica.id] },
    });
    const s1 = mes(testState(), [nomear('social', 'esquerda')], ctn).state;
    const s2 = mes(s1, [{ policyId: politica.id, agendaCost: 1 }], ctn).state;
    const p = s2.proposals.find((x) => x.policyId === politica.id);
    expect(p?.history.map((h) => h.cause)).toContain('ministerio_contrario');
    expect(p?.executionStart).toBe(1 + c.atraso_ministerio_contrario);
  });

  it('pasta de bloco há mais tempo no cargo é a primeira a cair', () => {
    let s = mes(testState(), [nomear('gestao', 'direita')]).state;
    s = mes(s, [nomear('fazenda', 'centro')]).state;
    expect(longestServingPartisan(s, content)?.id).toBe('gestao');
  });
});
