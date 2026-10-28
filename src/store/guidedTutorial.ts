import { createStore } from 'zustand/vanilla';

import { formatMoneyMillions, formatMoneyThousands, formatPercent } from '@/components/ui/format';
import {
  advanceMonth,
  APPOINT_ACTION_ID,
  CAREER_ACTIONS,
  createInitialState,
  DEBATE_ACTION_ID,
  DIRECTIVE_ACTION_ID,
  NEGOTIATE_ACTION_ID,
  type GameContent,
  type GameState,
  type MonthInput,
  type MonthResult,
  type MonthReport,
} from '@/engine';
import { managementProfile } from '@/engine/congress/management';

/**
 * Tutorial jogável (PLANO_CAMPANHA.md Fase C8.2): oito decisões reais, em dois exercícios descartáveis.
 *
 * - Campanha (passos 1–3): dois turnos de ação e a apuração, no calendário da carreira.
 * - Governo (passos 4–8): diretriz, proposta, negociação, CPI e indicação, no calendário do mandato.
 *
 * O estado vive só em memória e nunca é gravado. Nada aqui presume resultado eleitoral: a vitória da campanha é
 * descartada ao começar o exercício de governo, e a tela diz isso em vez de fingir continuidade.
 *
 * A passagem do tempo depois da negociação é **explícita** (`pendingAdvance`): o jogador vê quantos meses serão
 * simulados e decide avançar. Antes, a simulação acontecia escondida dentro da escolha de bloco.
 */

const TUTORIAL_SEED = 42;
export const TUTORIAL_STEPS = 8;
const CPI_EVENT_ID = 'fase07_inst_cpi_instalada';
const MAX_FOLLOWUP_MONTHS = 36;
const APPOINTMENT_MINISTRY = 'transportes';

export interface TutorialOption {
  id: string;
  label: string;
  detail: string;
  /** Números da opção (custo, dotação, gestão), derivados do catálogo em vez de escritos à mão. */
  stats?: string;
  input: MonthInput;
}

export interface TutorialLesson {
  title: string;
  description: string;
  /** Onde a mesma decisão fica no jogo real. */
  where: string;
  options: TutorialOption[];
}

/** Meses que faltam até a votação e o estado já simulado; aplicar é só `advance()`. */
export interface PendingAdvance {
  months: number;
  state: GameState;
  reports: MonthReport[];
}

interface Checkpoint {
  step: number;
  state: GameState;
  lastResult: MonthResult | null;
  lastChoice: string | null;
  followupReports: MonthReport[];
  proposalId: string | null;
  pendingAdvance: PendingAdvance | null;
}

export interface GuidedTutorialState {
  step: number;
  state: GameState;
  lastResult: MonthResult | null;
  /** Rótulo da opção escolhida; a tela mostra o que foi escolhido, não só o que aconteceu. */
  lastChoice: string | null;
  followupReports: MonthReport[];
  pendingAdvance: PendingAdvance | null;
  /** Proposta enviada no passo 5, usada pela negociação e pelo acompanhamento. */
  proposalId: string | null;
  history: Checkpoint[];
  lesson(): TutorialLesson | null;
  choose(id: string): MonthResult;
  /** Aplica a passagem do tempo preparada pela negociação. Sem `pendingAdvance`, não faz nada. */
  advance(): void;
  /** Volta uma escolha (ou a passagem do tempo). Devolve `false` no começo. */
  back(): boolean;
  reset(): void;
}

function initial(content: GameContent, campaign: boolean): GameState {
  return createInitialState({
    content,
    difficulty: 'casual',
    seed: TUTORIAL_SEED,
    startPoint: campaign ? 'corrida' : 'posse',
  });
}

function decision(id: string, params: Record<string, string | number> = {}): MonthInput {
  return { decisions: [{ policyId: id, agendaCost: 1, params }] };
}

function campaignCost(content: GameContent, id: string): number | undefined {
  return content.scenario.career?.finance?.costs?.find((item) => item.id === id)?.cost;
}

function campaignStats(content: GameContent, id: string): string | undefined {
  const cost = campaignCost(content, id);
  if (cost === undefined) return undefined;
  return `Custo: ${formatMoneyThousands(cost)} do caixa do partido · 1 ação`;
}

function routineOption(
  content: GameContent,
  ministryId: string,
  policyId: string,
  id: string,
  label: string,
  fallbackDetail: string,
): TutorialOption {
  const policy = content.policies[policyId];
  const annual = policy?.cost.annualMillions ?? 0;
  return {
    id,
    label,
    detail: `${fallbackDetail} Dotação: ${formatMoneyMillions(annual)}/ano.`,
    stats: '1 ação de agenda · a execução depende do espaço fiscal do mês',
    input: decision(DIRECTIVE_ACTION_ID, { ministryId, policyId, annualMillions: annual }),
  };
}

function proposalOption(
  content: GameContent,
  policyId: string,
  id: string,
  label: string,
  fallback: string,
): TutorialOption {
  const policy = content.policies[policyId];
  const annual = policy?.cost.annualMillions;
  return {
    id,
    label,
    detail: policy?.summary ?? fallback,
    stats:
      annual && annual > 0
        ? `${formatMoneyMillions(annual)}/ano · tramita no Congresso antes da execução`
        : 'Tramita no Congresso antes da execução',
    input: decision(policyId),
  };
}

function eventOption(
  content: GameContent,
  eventId: string,
  choiceId: string,
  fallbackLabel: string,
  fallbackDetail: string,
  id: string,
): TutorialOption {
  const choice = content.events.find((event) => event.id === eventId)?.choices.find((item) => item.id === choiceId);
  return {
    id,
    label: choice?.label ?? fallbackLabel,
    detail: choice?.description ?? fallbackDetail,
    stats: choice && choice.agendaCost > 0 ? `Custa ${choice.agendaCost} ação de agenda` : undefined,
    input: { decisions: [], eventChoices: [{ eventId, choiceId }] },
  };
}

export function lessonAt(
  step: number,
  state: GameState,
  content: GameContent,
  proposalId: string | null,
): TutorialLesson | null {
  const titles: [string, string, string][] = [
    [
      'Campanha: escolher alcance',
      'Compare uma ação concentrada e uma mobilização partidária. As duas custam dinheiro do partido e uma ação do turno.',
      'No jogo: Eleições › Ações de campanha.',
    ],
    [
      'Debate: escolher postura',
      'A postura altera a imagem do candidato; não garante votos. A pesquisa aparece no topo depois do turno.',
      'No jogo: Eleições › Debate.',
    ],
    [
      'Eleição: encerrar a campanha',
      'Faça a última escolha antes da apuração. O resultado sai no relatório do turno, com os votos dos dois turnos.',
      'No jogo: Eleições › encerrar o turno no mês da eleição.',
    ],
    [
      'Orçamento: escolher uma dotação',
      'Agora você governa, em um exercício novo: a eleição anterior não vira posse automática. Escolha a rotina de uma pasta dentro do espaço fiscal.',
      'No jogo: Gabinete › Políticas públicas › Diretrizes ministeriais.',
    ],
    [
      'Lei: enviar uma proposta',
      'Uma proposta passa pelo Congresso antes da execução. O envio consome uma ação e não garante aprovação.',
      'No jogo: Gabinete › Políticas públicas › Propostas ao Congresso.',
    ],
    [
      'Congresso: negociar apoio',
      'Escolha com qual bloco negociar a proposta enviada. A negociação consome agenda e capital político.',
      'No jogo: Congresso › Propostas em tramitação › Negociar.',
    ],
    [
      'Crise: responder à CPI',
      'Uma CPI foi instalada. Compare respostas institucionais; a resposta automática do resto do mês é só do exercício.',
      'No jogo: Alertas e Eventos › CPI.',
    ],
    [
      'Gabinete: escolher indicação',
      'Compare o apoio político e a capacidade de gestão do indicado. A capacidade muda o ritmo da pasta, não o custo.',
      'No jogo: Congresso › Gabinete › Nomear ministro.',
    ],
  ];
  if (step < 0 || step >= titles.length) return null;
  const [title, description, where] = titles[step]!;

  if (step === 0) {
    return {
      title,
      description,
      where,
      options: [
        {
          id: 'caravana',
          label: 'Fazer caravana em São Paulo',
          detail: 'Concentra reconhecimento em um estado e usa recursos do partido.',
          stats: campaignStats(content, 'caravana_regional'),
          input: decision('caravana_regional', { uf: 'SP', bolso: 'party' }),
        },
        {
          id: 'militancia',
          label: 'Mobilizar a militância',
          detail: 'Espalha a mensagem pela rede partidária, com alcance menor e custo menor.',
          stats: campaignStats(content, 'mobilizar_militancia'),
          input: decision('mobilizar_militancia', { bolso: 'party' }),
        },
      ],
    };
  }

  if (step === 1) {
    return {
      title,
      description,
      where,
      options: [
        {
          id: 'propositiva',
          label: 'Apresentar propostas',
          detail: 'Escolhe uma postura propositiva no debate; melhora a imagem entre quem já conhece você.',
          input: decision(DEBATE_ACTION_ID, { postura: 'propositiva' }),
        },
        {
          id: 'tecnica',
          label: 'Apresentar argumentos técnicos',
          detail: 'Escolhe uma postura técnica no debate; o efeito depende do perfil do eleitor.',
          input: decision(DEBATE_ACTION_ID, { postura: 'tecnica' }),
        },
      ],
    };
  }

  if (step === 2) {
    return {
      title,
      description,
      where,
      options: [
        {
          id: 'comicio',
          label: 'Fazer comício nacional',
          detail: 'Alcança o país e consome mais recursos antes da eleição.',
          stats: campaignStats(content, 'comicio_nacional'),
          input: decision('comicio_nacional', { bolso: 'party' }),
        },
        {
          id: 'militancia',
          label: 'Mobilizar a militância',
          detail: 'Usa uma ação de campanha mais barata antes da eleição.',
          stats: campaignStats(content, 'mobilizar_militancia'),
          input: decision('mobilizar_militancia', { bolso: 'party' }),
        },
      ],
    };
  }

  if (step === 3) {
    return {
      title,
      description,
      where,
      options: [
        routineOption(
          content,
          'saude',
          'rotina_atencao_basica',
          'saude',
          'Priorizar atenção básica',
          'Solicita uma dotação anual para a rotina de saúde.',
        ),
        routineOption(
          content,
          'cidades',
          'rotina_defesa_civil',
          'defesa',
          'Priorizar defesa civil',
          'Solicita uma dotação anual para resposta a emergências.',
        ),
      ],
    };
  }

  if (step === 4) {
    return {
      title,
      description,
      where,
      options: [
        proposalOption(
          content,
          'infraestrutura_credito_adicional',
          'infra',
          'Propor crédito para infraestrutura',
          'Envia um projeto de crédito ao Congresso.',
        ),
        proposalOption(
          content,
          'transferencia_renda_ampliacao',
          'transferencia',
          'Propor ampliação de transferência',
          'Envia uma política social ao Congresso.',
        ),
      ],
    };
  }

  if (step === 5) {
    const proposal =
      (proposalId ? state.proposals.find((item) => item.id === proposalId) : undefined) ??
      state.proposals.find((item) => item.status === 'em_tramitacao' || item.status === 'parada');
    if (!proposal) {
      return {
        title,
        description:
          'A proposta do exercício não está disponível para negociação. Volte uma escolha ou recomece o tutorial.',
        where,
        options: [],
      };
    }
    const blocs = content.scenario.blocs.filter((bloc) => bloc.id === 'centro' || bloc.id === 'esquerda');
    return {
      title,
      description,
      where,
      options: blocs.map((bloc) => ({
        id: bloc.id,
        label: `Negociar com ${bloc.name}`,
        detail: 'A negociação consome uma ação e capital político; o apoio do bloco cresce.',
        stats: '1 ação de agenda · custa capital político',
        input: decision(NEGOTIATE_ACTION_ID, { proposalId: proposal.id, blocId: bloc.id }),
      })),
    };
  }

  if (step === 6) {
    return {
      title,
      description,
      where,
      options: [
        eventOption(
          content,
          CPI_EVENT_ID,
          'colaborar_com_a_cpi',
          'Colaborar com a CPI',
          'Entrega documentos para a investigação fictícia.',
          'cooperar',
        ),
        eventOption(
          content,
          CPI_EVENT_ID,
          'deixar_a_cpi_correr',
          'Deixar a CPI correr',
          'Não interfere nos trabalhos, com seus custos políticos.',
          'deixar',
        ),
      ],
    };
  }

  const cabinet = (occupant: string, label: string): TutorialOption => {
    const profile = managementProfile(state.seed, APPOINTMENT_MINISTRY, occupant);
    return {
      id: occupant,
      label,
      detail: 'Pode fortalecer o apoio desse bloco; a gestão depende do indicado.',
      stats: `Gestão estimada: ${formatPercent(profile.capacity, 0)} da referência · 1 ação de agenda`,
      input: decision(APPOINT_ACTION_ID, { ministryId: APPOINTMENT_MINISTRY, occupant }),
    };
  };
  return {
    title,
    description,
    where,
    options: [cabinet('centro', 'Indicar o bloco de centro'), cabinet('esquerda', 'Indicar o bloco de esquerda')],
  };
}

/**
 * Roda o período entre a negociação e a CPI **sem aplicar**: devolve o estado final e os relatórios para a tela
 * mostrar quantos meses serão simulados. O jogador decide quando avançar.
 */
function prepareAdvance(state: GameState, content: GameContent, proposalId: string | null): PendingAdvance {
  let current = state;
  const reports: MonthReport[] = [];
  if (proposalId) {
    for (let month = 0; month < MAX_FOLLOWUP_MONTHS; month++) {
      const proposal = current.proposals.find((item) => item.id === proposalId);
      if (!proposal || ['rejeitada', 'vetada', 'abandonada', 'bloqueada', 'concluida'].includes(proposal.status)) break;
      const policy = content.policies[proposal.policyId];
      const lag = Math.min(...(policy?.impacts.map((impact) => impact.lagMonths) ?? [0]));
      if (
        proposal.status === 'em_execucao' &&
        proposal.executionStart !== null &&
        current.monthIndex > proposal.executionStart + lag
      )
        break;
      const next = advanceMonth(current, { decisions: [] }, content);
      current = next.state;
      reports.push(next.report);
    }
  }
  const alreadyPending = current.events.pending.some((item) => item.eventId === CPI_EVENT_ID);
  if (!alreadyPending) {
    current = {
      ...current,
      events: {
        ...current.events,
        pending: [
          ...current.events.pending,
          {
            eventId: CPI_EVENT_ID,
            monthIndex: current.monthIndex,
            instanceId: `${CPI_EVENT_ID}#${current.monthIndex}`,
          },
        ],
      },
    };
  }
  return { months: reports.length, state: current, reports };
}

function checkpointOf(state: GuidedTutorialState): Checkpoint {
  return {
    step: state.step,
    state: state.state,
    lastResult: state.lastResult,
    lastChoice: state.lastChoice,
    followupReports: state.followupReports,
    proposalId: state.proposalId,
    pendingAdvance: state.pendingAdvance,
  };
}

/** Sequência independente, em memória, sem escrever na campanha nem no banco. */
export function createGuidedTutorial(content: GameContent) {
  return createStore<GuidedTutorialState>((set, get) => ({
    step: 0,
    state: initial(content, true),
    lastResult: null,
    lastChoice: null,
    followupReports: [],
    pendingAdvance: null,
    proposalId: null,
    history: [],
    lesson: () => lessonAt(get().step, get().state, content, get().proposalId),
    choose(id) {
      if (get().pendingAdvance) throw new Error('Avance o período antes de escolher outra ação.');
      const option = get()
        .lesson()
        ?.options.find((item) => item.id === id);
      if (!option) throw new RangeError('Escolha de tutorial inválida.');
      const result = advanceMonth(get().state, option.input, content);
      if (result.report.rejected.length > 0) {
        set({ lastResult: result, lastChoice: option.label, followupReports: [] });
        return result;
      }
      const previous = checkpointOf(get());
      const nextStep = get().step + 1;
      const decision = option.input.decisions[0];
      const target = decision?.params?.proposalId;
      const created =
        nextStep === 5 && decision
          ? [...result.state.proposals].reverse().find((item) => item.policyId === decision.policyId)
          : undefined;
      const proposalId = typeof target === 'string' ? target : (created?.id ?? get().proposalId);
      const pendingAdvance = nextStep === 6 ? prepareAdvance(result.state, content, proposalId) : null;
      set({
        step: nextStep,
        state: nextStep === 3 ? initial(content, false) : result.state,
        lastResult: result,
        lastChoice: option.label,
        followupReports: [],
        proposalId,
        pendingAdvance,
        history: [...get().history, previous],
      });
      return result;
    },
    advance() {
      const pending = get().pendingAdvance;
      if (!pending) return;
      const previous = checkpointOf(get());
      set({
        state: pending.state,
        followupReports: pending.reports,
        pendingAdvance: null,
        history: [...get().history, previous],
      });
    },
    back() {
      const history = get().history;
      const previous = history[history.length - 1];
      if (!previous) return false;
      set({ ...previous, history: history.slice(0, -1) });
      return true;
    },
    reset() {
      set({
        step: 0,
        state: initial(content, true),
        lastResult: null,
        lastChoice: null,
        followupReports: [],
        pendingAdvance: null,
        proposalId: null,
        history: [],
      });
    },
  }));
}

/** Um tutorial por cenário, vivo entre montagens da tela: voltar ao Painel e reabrir não recomeça. */
let cached: { scenarioId: string; store: ReturnType<typeof createGuidedTutorial> } | null = null;

export function guidedTutorialFor(content: GameContent) {
  const scenarioId = content.scenario.id;
  if (!cached || cached.scenarioId !== scenarioId) cached = { scenarioId, store: createGuidedTutorial(content) };
  return cached.store;
}

/** Só para testes e para o "Recomeçar" da tela. */
export function clearGuidedTutorialCache(): void {
  cached = null;
}

/**
 * Ids do catálogo usados pelo tutorial. Um cenário sem eles não deve abrir o tutorial com lições vazias: a tela
 * mostra o problema em vez de fingir que ensinou.
 */
export function tutorialContentIssues(content: GameContent): string[] {
  const issues: string[] = [];
  const need = (ok: boolean, message: string) => {
    if (!ok) issues.push(message);
  };
  const costs = content.scenario.career?.finance?.costs ?? [];
  for (const id of ['caravana_regional', 'mobilizar_militancia', 'comicio_nacional']) {
    need(id in CAREER_ACTIONS, `ação de campanha sem catálogo: ${id}`);
    need(
      costs.some((item) => item.id === id),
      `ação de campanha sem custo no cenário: ${id}`,
    );
  }
  for (const id of ['rotina_atencao_basica', 'rotina_defesa_civil']) {
    const policy = content.policies[id];
    need(policy !== undefined && policy.delivery === 'rotina', `rotina ausente: ${id}`);
    need(content.scenario.policies.includes(id), `rotina fora do cenário: ${id}`);
  }
  for (const id of ['infraestrutura_credito_adicional', 'transferencia_renda_ampliacao']) {
    need(content.policies[id] !== undefined, `proposta ausente: ${id}`);
    need(content.scenario.policies.includes(id), `proposta fora do cenário: ${id}`);
  }
  need(
    (content.scenario.institutions?.ministries ?? []).some((ministry) => ministry.id === APPOINTMENT_MINISTRY),
    `ministério ausente: ${APPOINTMENT_MINISTRY}`,
  );
  for (const id of ['centro', 'esquerda']) {
    need(
      content.scenario.blocs.some((bloc) => bloc.id === id),
      `bloco ausente: ${id}`,
    );
  }
  const cpi = content.events.find((event) => event.id === CPI_EVENT_ID);
  need(cpi !== undefined, `evento ausente: ${CPI_EVENT_ID}`);
  for (const id of ['colaborar_com_a_cpi', 'deixar_a_cpi_correr']) {
    need(cpi?.choices.some((choice) => choice.id === id) ?? false, `escolha ausente: ${id}`);
  }
  return issues;
}
