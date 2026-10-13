/**
 * Ações de agenda: decisões que não viram proposta (não têm tramitação nem execução), mas custam pontos de
 * agenda e produzem efeito no mesmo mês (GAME_DESIGN.md §4.3). O id é usado em `Decision.policyId`; o alvo
 * (proposta, bloco, ministério) vai em `Decision.params`.
 */
export interface AgendaAction {
  id: string;
  name: string;
  summary: string;
  agendaCost: number;
  /**
   * Parâmetros que identificam o alvo. A mesma ação pode ser feita uma vez por mês **para cada alvo**
   * (ex.: negociar com dois blocos diferentes a mesma proposta).
   */
  targetParams: readonly string[];
  /** Aparece na lista "Ações de governo" da Presidência; as demais aparecem junto da proposta ou do ministério. */
  listed: boolean;
}

export const PRESSURE_ACTION_ID = 'pressionar_banco_central';
/** Negociação intensiva com um bloco por uma proposta (POLITICAL_RULES.md §6.3). Params: `proposalId`, `blocId`. */
export const NEGOTIATE_ACTION_ID = 'negociar_bloco';
/** Libera emendas para uma votação: o pedágio (§6.3). Params: `proposalId`. */
export const AMENDMENTS_ACTION_ID = 'liberar_emendas';
/** Cede no texto: menos efeito, mais apoio (§6.3). Params: `proposalId`. */
export const CONCEDE_ACTION_ID = 'ceder_texto';
/** Urgência constitucional (CF art. 64 §§1º–2º), só PL e PLP. Params: `proposalId`. */
export const URGENCY_ACTION_ID = 'pedir_urgencia';
/** Nomeia o ocupante de um ministério (§6.3.1). Params: `ministryId`, `occupant` (`tecnico` ou id do bloco). */
export const APPOINT_ACTION_ID = 'nomear_ministro';
/** Sanção ou veto de projeto aprovado (§7). Params: `proposalId`, `choice` (`SanctionChoice`). */
export const SANCTION_ACTION_ID = 'sancao';

export const SANCTION_CHOICES = ['sancionar', 'vetar_acrescimos', 'vetar_total'] as const;
export type SanctionChoice = (typeof SANCTION_CHOICES)[number];

export const AGENDA_ACTIONS: Readonly<Record<string, AgendaAction>> = {
  [PRESSURE_ACTION_ID]: {
    id: PRESSURE_ACTION_ID,
    name: 'Pressionar o Banco Central',
    summary:
      'Cobra publicamente juros menores. O efeito na próxima reunião do Copom depende de quantos diretores este ' +
      'governo já indicou; a credibilidade cai e o mercado cobra prêmio maior, mais ainda se a pressão se repetir.',
    agendaCost: 1,
    targetParams: [],
    listed: true,
  },
  [NEGOTIATE_ACTION_ID]: {
    id: NEGOTIATE_ACTION_ID,
    name: 'Negociar com o bloco',
    summary:
      'Reuniões com os líderes do bloco por esta proposta: o bloco apoia mais e a relação melhora, ao custo de ' +
      'capital político.',
    agendaCost: 1,
    targetParams: ['proposalId', 'blocId'],
    listed: false,
  },
  [AMENDMENTS_ACTION_ID]: {
    id: AMENDMENTS_ACTION_ID,
    name: 'Liberar emendas',
    summary:
      'Antecipa o pagamento de emendas parlamentares para esta votação. Todos os blocos apoiam mais e a votação ' +
      'não é adiada por falta de pedágio; o dinheiro sai das despesas discricionárias.',
    agendaCost: 1,
    targetParams: ['proposalId'],
    listed: false,
  },
  [CONCEDE_ACTION_ID]: {
    id: CONCEDE_ACTION_ID,
    name: 'Ceder no texto',
    summary: 'Aceita retirar pontos polêmicos: o texto fica menor (menos efeito), mas todos os blocos apoiam mais.',
    agendaCost: 1,
    targetParams: ['proposalId'],
    listed: false,
  },
  [URGENCY_ACTION_ID]: {
    id: URGENCY_ACTION_ID,
    name: 'Pedir urgência',
    summary:
      'Urgência constitucional: cada Casa tem até 45 dias para votar, depois a pauta tranca. Acelera a votação, ' +
      'mas desagrada o bloco que preside a Câmara. Só para projetos de lei.',
    agendaCost: 1,
    targetParams: ['proposalId'],
    listed: false,
  },
  [APPOINT_ACTION_ID]: {
    id: APPOINT_ACTION_ID,
    name: 'Nomear ministro',
    summary:
      'Troca o ocupante da pasta. Indicação de bloco rende apoio no Congresso, mas a pasta executa pior e o risco ' +
      'de escândalo cresce com o tempo; demitir ministro de bloco custa capital e a relação com o bloco.',
    agendaCost: 1,
    targetParams: ['ministryId'],
    listed: false,
  },
  [SANCTION_ACTION_ID]: {
    id: SANCTION_ACTION_ID,
    name: 'Sancionar ou vetar',
    summary:
      'Decide sobre o projeto aprovado. Sem resposta no mês, vale a sanção tácita. O Congresso pode derrubar o ' +
      'veto por maioria absoluta de cada Casa.',
    agendaCost: 0,
    targetParams: ['proposalId'],
    listed: false,
  },
};

export function isAgendaAction(id: string): boolean {
  return Object.hasOwn(AGENDA_ACTIONS, id);
}

/** Chave de repetição no mês: a ação mais os valores dos parâmetros de alvo. */
export function actionKey(action: AgendaAction, params: Readonly<Record<string, unknown>> | undefined): string {
  return [action.id, ...action.targetParams.map((k) => String(params?.[k] ?? ''))].join(':');
}
