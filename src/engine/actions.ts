/**
 * Ações de agenda: decisões que não viram proposta (não têm tramitação nem execução), mas custam ações de
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
/** Nomeia o ocupante de uma diretoria de estatal (§6.3.2, Fase C6a). Params: `directorateId`, `occupant`. */
export const DIRECTORATE_ACTION_ID = 'nomear_diretoria';
/** Defesa do governo num caso de escândalo em andamento (§9.1, Fase C6b). Params: `caseId`. */
export const DEFEND_CASE_ACTION_ID = 'defender_caso';
/** Negociação com a presidência da Câmara para arquivar o pedido mais antigo da gaveta (§10.1, Fase C6e). Sem params. */
export const DRAWER_ACTION_ID = 'negociar_gaveta';
/** Sanção ou veto de projeto aprovado (§7). Params: `proposalId`, `choice` (`SanctionChoice`). */
export const SANCTION_ACTION_ID = 'sancao';
/** Visita presidencial a uma UF (POLITICAL_RULES.md §2.1). Params: `uf` (sigla). */
export const VISIT_ACTION_ID = 'visitar_estado';
/** Declaração de candidatura à reeleição (Fase 08), na janela do calendário eleitoral. Sem params. */
export const DECLARE_CANDIDACY_ACTION_ID = 'declarar_reeleicao';
/** Apoio do governo a um bloco na sucessão (Fase 08). Params: `blocId`. */
export const SUPPORT_CANDIDATE_ACTION_ID = 'apoiar_candidato';
/** Diretriz e dotação anual de rotina: ministryId, policyId, annualMillions. */
export const DIRECTIVE_ACTION_ID = 'definir_diretriz';
/** Marca de governo por proposta: proposalId, name. */
export const BRAND_ACTION_ID = 'marcar_governo';

export const SANCTION_CHOICES = ['sancionar', 'vetar_acrescimos', 'vetar_total'] as const;
export type SanctionChoice = (typeof SANCTION_CHOICES)[number];

export const AGENDA_ACTIONS: Readonly<Record<string, AgendaAction>> = {
  [DIRECTIVE_ACTION_ID]: {
    id: DIRECTIVE_ACTION_ID,
    name: 'Definir diretriz do ministério',
    summary: 'Escolhe a rotina da pasta e sua dotação anual dentro das discricionárias disponíveis.',
    agendaCost: 1,
    targetParams: ['ministryId'],
    listed: false,
  },
  [BRAND_ACTION_ID]: {
    id: BRAND_ACTION_ID,
    name: 'Escolher marca de governo',
    summary: 'Nomeia um projeto como uma das três marcas do mandato e acompanha seus resultados.',
    agendaCost: 1,
    targetParams: ['proposalId'],
    listed: false,
  },
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
  [DIRECTORATE_ACTION_ID]: {
    id: DIRECTORATE_ACTION_ID,
    name: 'Nomear diretoria de estatal',
    summary:
      'Troca o ocupante da diretoria. Indicação de bloco rende um pouco de apoio no Congresso, mas o risco de ' +
      'escândalo cresce com o tempo, e mais quando o mesmo bloco tem o ministério; tirar o cargo de um bloco custa ' +
      'capital e a relação com ele.',
    agendaCost: 1,
    targetParams: ['directorateId'],
    listed: false,
  },
  [DEFEND_CASE_ACTION_ID]: {
    id: DEFEND_CASE_ACTION_ID,
    name: 'Defender o caso',
    summary:
      'Mobiliza a defesa do governo num caso de escândalo em andamento: reduz neste mês a chance de o caso avançar ' +
      'de etapa e custa capital político. Não arquiva o caso: só a exposição baixa arquiva.',
    agendaCost: 1,
    targetParams: ['caseId'],
    listed: false,
  },
  [DRAWER_ACTION_ID]: {
    id: DRAWER_ACTION_ID,
    name: 'Negociar com a presidência da Câmara',
    summary:
      'Pede à presidência da Câmara que arquive o pedido de impeachment mais antigo da gaveta. Custa capital ' +
      'político e melhora a relação com o bloco que preside a Casa. Só com pedido na gaveta.',
    agendaCost: 1,
    targetParams: [],
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
  [VISIT_ACTION_ID]: {
    id: VISIT_ACTION_ID,
    name: 'Visitar o estado',
    summary:
      'Agenda presidencial na UF: inaugurações e encontro com o governador. A aprovação local sobe por alguns ' +
      'meses e a relação com o governador melhora; não muda a aprovação nacional.',
    agendaCost: 1,
    targetParams: ['uf'],
    listed: false,
  },
  [DECLARE_CANDIDACY_ACTION_ID]: {
    id: DECLARE_CANDIDACY_ACTION_ID,
    name: 'Declarar candidatura à reeleição',
    summary:
      'Assume a candidatura à reeleição dentro da janela do calendário eleitoral (uma reeleição, no 1º ' +
      'mandato): a intenção de voto sobe no mês da declaração.',
    agendaCost: 0,
    targetParams: [],
    listed: false,
  },
  [SUPPORT_CANDIDATE_ACTION_ID]: {
    id: SUPPORT_CANDIDATE_ACTION_ID,
    name: 'Apoiar candidato à sucessão',
    summary:
      'Declara apoio a um bloco na sucessão, dentro da janela eleitoral e uma vez por campanha: a relação com o ' +
      'bloco sobe e o candidato herdeiro disputa com a intenção de voto do governo.',
    agendaCost: 1,
    targetParams: [],
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
