import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { createInitialState, type FederativeAgreement, type GameState, type PublicProject } from '@/engine';

import { agreementView } from './federativeView';

// PLANO_EXPANSAO EX-20: a carteira mostra quem aderiu, quem recusou, inadimplência, vigência e com quem negociar.

const content = loadContent(DEFAULT_SCENARIO_ID);
const state: GameState = createInitialState({ content, difficulty: 'estrategica', seed: 2 });

function project(phase: PublicProject['phase'], agreement?: FederativeAgreement): PublicProject {
  return {
    proposalId: 'projeto_hospitais_regionais_0',
    policyId: 'projeto_hospitais_regionais',
    phase,
    phaseMonth: 0,
    progress: 0,
    budgetMillions: 1000,
    spentMillions: 0,
    assetMillions: 0,
    maintenanceMillions: 0,
    delayMonths: 0,
    startMonth: 0,
    ...(agreement ? { federative: agreement } : {}),
  };
}

const member = (uf: string, status: FederativeAgreement['members'][number]['status'], negotiated = false) => ({
  uf,
  status,
  counterpartShare: 0.3,
  negotiated,
});

describe('convênio na carteira', () => {
  it('obra sem convênio não tem linhas federativas', () => {
    expect(agreementView(project('obra'), state, content)).toBeNull();
  });

  it('no planejamento lista quem recusou e oferece negociar só com quem ainda não foi negociado', () => {
    const agreement: FederativeAgreement = {
      members: [member('BA', 'aderiu'), member('SP', 'recusou'), member('RJ', 'recusou', true)],
      signedMonth: null,
      expiresMonth: null,
      federalShare: 0.7,
    };
    const view = agreementView(project('planejamento', agreement), state, content)!;
    expect(view.summary).toBe('Convênio: 1 de 3 estados aderiram');
    expect(view.outside).toBe('Recusaram: SP, RJ');
    expect(view.negotiable.map((m) => m.uf)).toEqual(['SP']);
    expect(view.negotiable[0].text).toMatch(/^SP · chance de aderir após a negociação: \d+%$/);
    expect(view.detail).toContain('A União não decide pelo estado');
  });

  it('assinado: vigência, parcela federal, contrapartida paga e inadimplentes; sem negociação', () => {
    const agreement: FederativeAgreement = {
      members: [member('BA', 'aderiu'), member('PE', 'inadimplente'), member('SP', 'recusou')],
      signedMonth: 4,
      expiresMonth: 51,
      federalShare: 0.7,
    };
    const view = agreementView(project('obra', agreement), state, content)!;
    expect(view.summary).toBe('Convênio: 2 de 3 estados aderiram · 1 inadimplente');
    expect(view.detail).toContain('parcela federal 70%');
    expect(view.detail).toMatch(/contrapartida paga \d+%/);
    expect(view.outside).toBe('Recusaram: SP · Sem pagar a contrapartida: PE');
    expect(view.negotiable).toEqual([]);
  });
});
