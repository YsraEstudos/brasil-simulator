import { describe, expect, it } from 'vitest';

import {
  APPOINT_ACTION_ID,
  DIRECTIVE_ACTION_ID,
  NEGOTIATE_ACTION_ID,
  SANCTION_ACTION_ID,
  type Decision,
} from '@/engine';
import { EMPTY_DRAFT, toggleDecision, type AgendaDraft } from '@/store/agendaDraft';
import { TEST_BILL, TEST_DECREE, TEST_EVENT, TEST_MP, TEST_PEC, testContent } from '@/tests/fixtures';

import {
  agendaTotals,
  clearAgendaMessage,
  irreversibleWarning,
  lagNotice,
  readableAmount,
  restartMonthMessage,
} from './agendaModel';
import { formatFiscal } from '@/components/ui/format';

const content = testContent();
const policy = (id: string): Decision => ({ policyId: id, agendaCost: 0 });
const sanction = (choice: string): Decision => ({
  policyId: SANCTION_ACTION_ID,
  agendaCost: 0,
  params: { proposalId: 'p1', choice },
});
const appoint = (ministryId: string): Decision => ({
  policyId: APPOINT_ACTION_ID,
  agendaCost: 1,
  params: { ministryId, occupant: 'centro' },
});

describe('agendaTotals: o rodapé da agenda (B31)', () => {
  it('soma ações, decisões, respostas e custo fiscal anual (economia entra negativa)', () => {
    const draft: AgendaDraft = {
      decisions: [policy(TEST_BILL.id), policy(TEST_DECREE.id)],
      eventChoices: { [TEST_EVENT.id]: TEST_EVENT.choices[0]!.id },
    };
    const totals = agendaTotals(draft, content);
    expect(totals.decisions).toBe(2);
    expect(totals.eventAnswers).toBe(1);
    expect(totals.annualMillions).toBe(30000 - 20000);
    expect(totals.actions).toBeGreaterThanOrEqual(2);
  });

  it('diretriz conta o orçamento escolhido; ações sem custo fiscal contam zero', () => {
    const directive: Decision = {
      policyId: DIRECTIVE_ACTION_ID,
      agendaCost: 1,
      params: { ministryId: 'social', policyId: 'x', annualMillions: 1500 },
    };
    const negotiate: Decision = { policyId: NEGOTIATE_ACTION_ID, agendaCost: 1, params: { proposalId: 'p1' } };
    expect(agendaTotals({ ...EMPTY_DRAFT, decisions: [directive, negotiate] }, content).annualMillions).toBe(1500);
  });

  it('rascunho vazio: tudo zero', () => {
    expect(agendaTotals(EMPTY_DRAFT, content)).toEqual({
      actions: 0,
      decisions: 0,
      eventAnswers: 0,
      annualMillions: 0,
    });
  });
});

describe('lagNotice: aviso de defasagem (D37)', () => {
  it('sem defasagem não há aviso', () => {
    expect(lagNotice(TEST_MP)).toBeNull();
  });

  it('defasagem única, mista e em faixa', () => {
    expect(lagNotice(TEST_PEC)).toBe(
      'Os efeitos chegam 6 meses depois de a decisão começar a valer. Não espere mudança no mês seguinte.',
    );
    expect(lagNotice(TEST_DECREE)).toBe(
      'Parte do efeito vem logo; o resto chega até 1 mês depois de a decisão começar a valer.',
    );
    expect(
      lagNotice({
        impacts: [
          { channel: 'custeio', magnitude: 1, lagMonths: 2 },
          { channel: 'aprovacao', magnitude: 0.01, lagMonths: 12 },
        ],
      }),
    ).toBe('O primeiro efeito chega 2 meses depois de a decisão começar a valer; o último, 12 meses depois.');
  });
});

describe('irreversibleWarning: lista fechada D-Q2 (B96)', () => {
  it('veto total pede confirmação; sancionar e vetar acréscimos não', () => {
    expect(irreversibleWarning(sanction('vetar_total'), EMPTY_DRAFT, content)?.confirmLabel).toBe('VETAR TUDO');
    expect(irreversibleWarning(sanction('sancionar'), EMPTY_DRAFT, content)).toBeNull();
    expect(irreversibleWarning(sanction('vetar_acrescimos'), EMPTY_DRAFT, content)).toBeNull();
  });

  it('trocar ministro diz a pasta e que o atual é demitido', () => {
    const warning = irreversibleWarning(appoint('fazenda'), EMPTY_DRAFT, content);
    expect(warning?.title).toBe('Trocar o ministro de Fazenda?');
    expect(warning?.message).toMatch(/demitido/);
  });

  it('PEC pede confirmação; PL, MP e decreto não', () => {
    expect(irreversibleWarning(policy(TEST_PEC.id), EMPTY_DRAFT, content)?.title).toContain(TEST_PEC.name);
    expect(irreversibleWarning(policy(TEST_BILL.id), EMPTY_DRAFT, content)).toBeNull();
    expect(irreversibleWarning(policy(TEST_MP.id), EMPTY_DRAFT, content)).toBeNull();
    expect(irreversibleWarning(policy(TEST_DECREE.id), EMPTY_DRAFT, content)).toBeNull();
  });

  it('tirar da agenda nunca pergunta', () => {
    const draft = toggleDecision(EMPTY_DRAFT, policy(TEST_PEC.id));
    expect(irreversibleWarning(policy(TEST_PEC.id), draft, content)).toBeNull();
  });

  it('trocar de sanção para veto total pergunta (a escolha é nova)', () => {
    const draft = toggleDecision(EMPTY_DRAFT, sanction('sancionar'));
    expect(irreversibleWarning(sanction('vetar_total'), draft, content)).not.toBeNull();
  });
});

describe('textos de limpar e recomeçar', () => {
  const totals = (decisions: number, eventAnswers: number) => ({
    actions: 0,
    decisions,
    eventAnswers,
    annualMillions: 0,
  });

  it('limpar avisa que as respostas a eventos ficam', () => {
    expect(clearAgendaMessage(totals(1, 0))).toBe(
      'A decisão marcada sai da agenda. Dá para desfazer até encerrar o mês.',
    );
    expect(clearAgendaMessage(totals(3, 2))).toBe(
      'As 3 decisões marcadas saem da agenda. As 2 respostas a eventos continuam marcadas. Dá para desfazer até encerrar o mês.',
    );
  });

  it('recomeçar avisa que as respostas a eventos também saem', () => {
    expect(restartMonthMessage(totals(0, 1))).toBe(
      'Tudo o que foi marcado neste mês sai, inclusive a resposta ao evento. Dá para desfazer até encerrar o mês.',
    );
  });
});

describe('valor fiscal legível', () => {
  const gdp = 13_000_000; // R$ 13 tri em milhões
  const pib = (millions: number, opts?: { decimals?: number }) => formatFiscal(millions, gdp, 'pib', opts);

  it('um custo pequeno nunca aparece como zero', () => {
    expect(readableAmount(130_000, pib)).toBe('1,0% do PIB');
    expect(readableAmount(1_300, pib)).toBe('0,01% do PIB');
    expect(readableAmount(100, pib)).toBe('menos de 0,01% do PIB');
  });
});
