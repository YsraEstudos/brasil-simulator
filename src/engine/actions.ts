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
/** Auditoria da CGU num caso de escândalo em andamento (§9.1.1, PLANO_EXPANSAO EX-13). Params: `caseId`. */
export const FISCALIZE_CASE_ACTION_ID = 'fiscalizar_caso';
/** Negociação com a presidência da Câmara para arquivar o pedido mais antigo da gaveta (§10.1, Fase C6e). Sem params. */
export const DRAWER_ACTION_ID = 'negociar_gaveta';
/** Pronunciamento à nação em rede nacional (PLANO_CAMPANHA.md Fase C6g). Sem params. */
export const PRONOUNCEMENT_ACTION_ID = 'pronunciamento_nacional';
/** Indicação ao STF numa vaga aberta (§8.1, Fase C6d). Params: `vacancyId`, `profile` (`jurista` ou `aliado`). */
export const NOMINATE_JUSTICE_ACTION_ID = 'indicar_ministro_stf';
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
/**
 * Negociação com o governador que recusou um convênio de obra federativa (PLANO_EXPANSAO EX-20): a União assume parte
 * da contrapartida e o governador decide de novo. Uma vez por UF e obra. Params: `proposalId`, `uf`.
 */
export const NEGOTIATE_ADHESION_ACTION_ID = 'negociar_adesao';
/** Treino de uma habilidade do personagem controlado (PLANO_EXPANSAO EX-21), um por mês. Params: `branch`. */
export const TRAIN_SKILL_ACTION_ID = 'treinar_habilidade';
/**
 * Financia uma tecnologia da árvore (PLANO_EXPANSAO EX-24/EX-32) por uma rota. Params: `nodeId`, `route` (`importar`,
 * `transferir`, `desenvolver`) e `partnerId` na transferência.
 */
export const FUND_TECHNOLOGY_ACTION_ID = 'financiar_tecnologia';
/** Suspende um programa de tecnologia em andamento; os estágios concluídos ficam guardados. Params: `nodeId`. */
export const SUSPEND_TECHNOLOGY_ACTION_ID = 'suspender_tecnologia';
/** Pede certificação para exportar uma tecnologia dominada no país. Params: `nodeId`. */
export const CERTIFY_EXPORT_ACTION_ID = 'certificar_exportacao';
/** Altera a tarifa média de importação por decreto, dentro da faixa (EX-25). Params: `direction` (`elevar`, `reduzir`). */
export const ADJUST_TARIFF_ACTION_ID = 'ajustar_tarifa';
/** Missão comercial a um parceiro (EX-25). Params: `partnerId`. */
export const TRADE_MISSION_ACTION_ID = 'missao_comercial';
/** Rodada de negociação de acordo comercial com um parceiro (EX-25). Params: `partnerId`. */
export const NEGOTIATE_AGREEMENT_ACTION_ID = 'negociar_acordo';
/** Investigação de campo de um alerta sanitário (EX-27): identifica o agente no mês seguinte. Params: `outbreakId`. */
export const INVESTIGATE_ALERT_ACTION_ID = 'investigar_alerta';
/**
 * Adota uma medida de resposta a uma crise sanitária (EX-27). Params: `outbreakId`, `measureId` e, nos leitos de
 * emergência, `criterion` (`ocupacao`, `populacao`, `pedidos`, `aliados`).
 */
export const ADOPT_MEASURE_ACTION_ID = 'adotar_medida';
/** Encerra uma medida em vigor (EX-27). Params: `outbreakId`, `measureId`. */
export const END_MEASURE_ACTION_ID = 'encerrar_medida';
/** Muda o tom da comunicação do governo sobre crises (EX-28). Params: `tone`. */
export const COMMUNICATE_ACTION_ID = 'comunicar_crise';
/** Responde a um rumor em circulação (EX-28). Params: `itemId`, `response` (`desmentir`, `esclarecer`). */
export const PRESS_RESPONSE_ACTION_ID = 'responder_imprensa';
/** Pagamento de obrigação privada de campanha, sem ação de agenda. */
export const PAY_CAMPAIGN_DEBT = 'pagar_divida_campanha';

export const SANCTION_CHOICES = ['sancionar', 'vetar_acrescimos', 'vetar_total'] as const;
export type SanctionChoice = (typeof SANCTION_CHOICES)[number];

export const AGENDA_ACTIONS: Readonly<Record<string, AgendaAction>> = {
  [PAY_CAMPAIGN_DEBT]: {
    id: PAY_CAMPAIGN_DEBT,
    name: 'Pagar dívida de campanha',
    summary: 'Paga compromisso eleitoral com recursos pessoais.',
    agendaCost: 0,
    targetParams: ['indice'],
    listed: false,
  },
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
      'Troca o ocupante da pasta. Indicação de bloco rende apoio no Congresso, a capacidade depende do indicado e o risco ' +
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
      'Mobiliza a defesa do governo num caso de escândalo em andamento: contesta neste mês a prova obtida, o que ' +
      'pesa se o caso for decidido agora, e custa capital político. Não muda os fatos nem arquiva o caso.',
    agendaCost: 1,
    targetParams: ['caseId'],
    listed: false,
  },
  [FISCALIZE_CASE_ACTION_ID]: {
    id: FISCALIZE_CASE_ACTION_ID,
    name: 'Pedir auditoria da CGU',
    summary:
      'Pede à Controladoria-Geral da União que audite o caso: a investigação anda mais rápido em direção à verdade, ' +
      'seja para afastar o indicado, seja para inocentá-lo. O bloco investigado não gosta.',
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
  [PRONOUNCEMENT_ACTION_ID]: {
    id: PRONOUNCEMENT_ACTION_ID,
    name: 'Pronunciamento à nação',
    summary:
      'Fala em rede nacional. Rende um pouco de aprovação no mês, menos a cada pronunciamento recente e menos ainda ' +
      'com o termômetro das ruas crítico. Não muda indicadores da economia.',
    agendaCost: 1,
    targetParams: [],
    listed: true,
  },
  [NOMINATE_JUSTICE_ACTION_ID]: {
    id: NOMINATE_JUSTICE_ACTION_ID,
    name: 'Indicar ministro do STF',
    summary:
      'Indica um nome para a vaga aberta no STF. O Senado sabatina e vota no mês seguinte e precisa de maioria ' +
      'absoluta (41 de 81). Jurista de carreira passa com mais facilidade; aliado do governo depende da afinidade ' +
      'dos blocos com o governo. Rejeição custa capital político e a vaga continua aberta.',
    agendaCost: 1,
    targetParams: ['vacancyId'],
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
  [NEGOTIATE_ADHESION_ACTION_ID]: {
    id: NEGOTIATE_ADHESION_ACTION_ID,
    name: 'Negociar adesão ao convênio',
    summary:
      'Reunião com o governador que recusou o convênio da obra: a União assume parte da contrapartida estadual e ele ' +
      'decide de novo. A obra fica mais cara para a União; o governador pode recusar outra vez. Só no planejamento.',
    agendaCost: 1,
    targetParams: ['proposalId', 'uf'],
    listed: false,
  },
  [TRAIN_SKILL_ACTION_ID]: {
    id: TRAIN_SKILL_ACTION_ID,
    name: 'Treinar habilidade',
    summary:
      'Dedica parte da agenda do mês a formar a equipe e estudar um tema. Custa uma ação e capital político; o nível ' +
      'sobe depois de alguns meses de treino e vale a partir do mês seguinte. Um treino por mês.',
    agendaCost: 1,
    targetParams: [],
    listed: false,
  },
  [FUND_TECHNOLOGY_ACTION_ID]: {
    id: FUND_TECHNOLOGY_ACTION_ID,
    name: 'Financiar tecnologia',
    summary:
      'Começa um programa plurianual para uma tecnologia da árvore: importar (rápido, caro em dólar e sem domínio local), ' +
      'transferir com um parceiro (absorção parcial) ou desenvolver no país (lento, pode falhar, permite exportar). O ' +
      'gasto sai do espaço discricionário que as obras deixarem.',
    agendaCost: 1,
    targetParams: ['nodeId'],
    listed: false,
  },
  [SUSPEND_TECHNOLOGY_ACTION_ID]: {
    id: SUSPEND_TECHNOLOGY_ACTION_ID,
    name: 'Suspender programa de tecnologia',
    summary: 'Para de financiar o programa. O que já foi gasto não volta; os estágios concluídos ficam guardados.',
    agendaCost: 1,
    targetParams: ['nodeId'],
    listed: false,
  },
  [CERTIFY_EXPORT_ACTION_ID]: {
    id: CERTIFY_EXPORT_ACTION_ID,
    name: 'Certificar para exportar',
    summary:
      'Pede certificação e abre mercados para uma tecnologia dominada no país, com escala industrial. As vendas ' +
      'começam meses depois e crescem aos poucos, conforme o acesso aos parceiros.',
    agendaCost: 1,
    targetParams: ['nodeId'],
    listed: false,
  },
  [ADJUST_TARIFF_ACTION_ID]: {
    id: ADJUST_TARIFF_ACTION_ID,
    name: 'Ajustar tarifa de importação',
    summary:
      'Altera a tarifa média de importação por decreto, dentro da faixa permitida. Elevar arrecada mais e reduz ' +
      'importações, mas encarece produtos por um ano, irrita os parceiros e aumenta o risco de retaliação.',
    agendaCost: 1,
    targetParams: [],
    listed: false,
  },
  [TRADE_MISSION_ACTION_ID]: {
    id: TRADE_MISSION_ACTION_ID,
    name: 'Missão comercial',
    summary:
      'Viagem e reuniões com governo e empresas do parceiro: a relação melhora e uma barreira às compras do Brasil ' +
      'pode ser encurtada.',
    agendaCost: 1,
    targetParams: ['partnerId'],
    listed: false,
  },
  [NEGOTIATE_AGREEMENT_ACTION_ID]: {
    id: NEGOTIATE_AGREEMENT_ACTION_ID,
    name: 'Negociar acordo comercial',
    summary:
      'Uma rodada de negociação com o parceiro. Depois de algumas rodadas o acordo é assinado e vai ao Congresso; se ' +
      'ratificado, vale por anos, também para os próximos governos.',
    agendaCost: 1,
    targetParams: ['partnerId'],
    listed: false,
  },
  [INVESTIGATE_ALERT_ACTION_ID]: {
    id: INVESTIGATE_ALERT_ACTION_ID,
    name: 'Investigar alerta sanitário',
    summary:
      'Envia equipe de campo e sequenciamento. O agente é identificado no mês seguinte (sem isso, leva meses) e as ' +
      'estimativas ficam mais estreitas. Custo pequeno de custeio.',
    agendaCost: 1,
    targetParams: ['outbreakId'],
    listed: false,
  },
  [ADOPT_MEASURE_ACTION_ID]: {
    id: ADOPT_MEASURE_ACTION_ID,
    name: 'Adotar medida sanitária',
    summary:
      'Põe em vigor uma medida de resposta à crise, com custo mensal por crédito extraordinário até ser encerrada. ' +
      'O efeito depende da execução e da adesão da população.',
    agendaCost: 1,
    targetParams: ['outbreakId', 'measureId'],
    listed: false,
  },
  [END_MEASURE_ACTION_ID]: {
    id: END_MEASURE_ACTION_ID,
    name: 'Encerrar medida sanitária',
    summary: 'Retira uma medida em vigor: o custo e o desgaste param, e o efeito também.',
    agendaCost: 1,
    targetParams: ['outbreakId', 'measureId'],
    listed: false,
  },
  [COMMUNICATE_ACTION_ID]: {
    id: COMMUNICATE_ACTION_ID,
    name: 'Definir comunicação de crise',
    summary:
      'Escolhe o tom do governo: transparência (boletins abertos, confiança cresce devagar), tranquilizar (menos ' +
      'alarme agora, boletins fechados e risco de ser desmentido pelos números) ou alerta (mais adesão, desgaste se ' +
      'a crise não vier). Não muda a aprovação diretamente.',
    agendaCost: 1,
    targetParams: [],
    listed: false,
  },
  [PRESS_RESPONSE_ACTION_ID]: {
    id: PRESS_RESPONSE_ACTION_ID,
    name: 'Responder à imprensa',
    summary:
      'Responde a um rumor: desmentir corta mais a circulação, mas custa caro se a checagem confirmar o rumor; ' +
      'esclarecer com dados corta menos e nunca contradiz os fatos.',
    agendaCost: 1,
    targetParams: ['itemId'],
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
