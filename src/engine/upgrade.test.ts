import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { advanceMonth } from '@/engine/advanceMonth';
import { checkInvariants } from '@/engine/invariants';
import { STRATEGIES } from '@/engine/sim/strategies';
import { regionsView } from '@/engine/regions/regions';
import { SaveTooNewError, upgradeGameState } from '@/engine/upgrade';
import { STATE_SCHEMA_VERSION, type GameState } from '@/engine/types';

import v2Save from '@/tests/saves/state_v2_fase02.json';
import v3Save from '@/tests/saves/state_v3_fase03.json';
import v4Save from '@/tests/saves/state_v4_fase04.json';

// AI_INSTRUCTIONS.md §3 e §5: saves antigos são atualizados, não recusados; teste com save real da versão
// anterior. O fixture foi gravado pelo motor 0.2.0 (Fase 02, commit 30b0749): campanha populista fiscal,
// semente 4, cinco meses jogados no cenário brasil_2027_01.

const content = loadContent(DEFAULT_SCENARIO_ID);

describe('atualização de saves (AI_INSTRUCTIONS.md §3)', () => {
  it('save v2 da Fase 02 vira estado atual com contas por grupo e setor externo', () => {
    const raw = structuredClone(v2Save) as unknown;
    const state = upgradeGameState(2, raw);
    expect(state.schemaVersion).toBe(STATE_SCHEMA_VERSION);
    expect(state.monthIndex).toBe(5);
    expect(state.proposals.length).toBeGreaterThan(0);
    const e = state.economy;
    expect(e.exchangeRate).toBeGreaterThan(0);
    expect(e.priceLevel).toBe(1);
    // A estrutura fiscal reparte a receita e a despesa do próprio save.
    const revenue = Object.values(e.fiscal.revenueByGroup).reduce((s, v) => s + v, 0);
    expect(revenue).toBeCloseTo(e.revenue, 12);
    expect(e.fiscal.spendingLimit + e.fiscal.exceptions).toBeCloseTo(e.primarySpending, 12);
  });

  it('save v2 atualizado continua jogável por 24 meses sem violar invariantes', () => {
    let state: GameState = upgradeGameState(2, structuredClone(v2Save) as unknown);
    const strategy = STRATEGIES.find((s) => s.id === 'populista_fiscal');
    if (!strategy) throw new Error('estratégia ausente');
    const errors: string[] = [];
    for (let m = 0; m < 24; m++) {
      const result = advanceMonth(state, strategy.decide(state, content), content);
      errors.push(...checkInvariants(state, result.state, result.report, content));
      state = result.state;
    }
    expect(errors).toEqual([]);
  });

  // Fixture v3 gravado pelo motor 0.3.0 (Fase 03, commit 5ce520a): estratégia reformista, semente 4, cinco
  // meses no cenário brasil_2027_01, com a PEC da reforma administrativa em tramitação.
  it('save v3 da Fase 03 ganha gabinete e campos de tramitação; a PEC recomeça pela Câmara', () => {
    const state = upgradeGameState(3, structuredClone(v3Save) as unknown);
    expect(state.schemaVersion).toBe(STATE_SCHEMA_VERSION);
    expect(state.congress.cabinet).toEqual([]);
    const pec = state.proposals.find((p) => p.policyId === 'reforma_administrativa');
    expect(pec?.status).toBe('em_tramitacao');
    expect(pec?.stage).toBe(0);
    expect(pec?.voteMonth).toBe(8);
    expect(pec?.negotiation).toEqual({ blocs: {}, amendments: false, textConceded: false, urgency: false });
    const executada = state.proposals.find((p) => p.status === 'em_execucao');
    expect(executada?.veto).toBeNull();
    expect(executada?.judicial).toBeNull();
    expect(executada?.stage).toBeGreaterThanOrEqual(4);
  });

  it('save v3 atualizado continua jogável por 24 meses sem violar invariantes', () => {
    let state: GameState = upgradeGameState(3, structuredClone(v3Save) as unknown);
    const strategy = STRATEGIES.find((s) => s.id === 'reformista');
    if (!strategy) throw new Error('estratégia ausente');
    const errors: string[] = [];
    for (let m = 0; m < 24; m++) {
      const result = advanceMonth(state, strategy.decide(state, content), content);
      errors.push(...checkInvariants(state, result.state, result.report, content));
      expect(result.report.rejected).toEqual([]);
      state = result.state;
    }
    expect(errors).toEqual([]);
    const pec = state.proposals.find((p) => p.policyId === 'reforma_administrativa');
    expect(pec?.status).not.toBe('em_tramitacao');
  });

  // Fixture v4 gravado pelo motor 0.4.0 (Fase 04, commit ffd00cd): estratégia fisiológica, semente 4, sete meses
  // no cenário brasil_2027_01, com as duas PECs em tramitação, cinco pastas de bloco e infraestrutura em execução.
  it('save v4 da Fase 04 ganha as UFs (a partir do cenário) e a adesão nas propostas', () => {
    const state = upgradeGameState(4, structuredClone(v4Save) as unknown);
    expect(state.schemaVersion).toBe(STATE_SCHEMA_VERSION);
    expect(state.regions.ufs).toEqual([]);
    expect(state.proposals.every((p) => p.adherents === null)).toBe(true);
    expect(state.congress.cabinet).toHaveLength(5);
    // A interface já mostra as UFs antes do primeiro mês jogado depois da atualização.
    expect(regionsView(state, content)).toHaveLength(27);
  });

  it('save v4 atualizado continua jogável por 24 meses sem violar invariantes (incluindo §7.9)', () => {
    let state: GameState = upgradeGameState(4, structuredClone(v4Save) as unknown);
    const strategy = STRATEGIES.find((s) => s.id === 'fisiologica');
    if (!strategy) throw new Error('estratégia ausente');
    const errors: string[] = [];
    for (let m = 0; m < 24; m++) {
      const result = advanceMonth(state, strategy.decide(state, content), content);
      errors.push(...checkInvariants(state, result.state, result.report, content));
      expect(result.report.rejected).toEqual([]);
      state = result.state;
    }
    expect(errors).toEqual([]);
    expect(state.regions.ufs).toHaveLength(27);
  });

  it('save de versão mais nova que o app é recusado', () => {
    expect(() => upgradeGameState(STATE_SCHEMA_VERSION + 1, {})).toThrow(SaveTooNewError);
  });
});
