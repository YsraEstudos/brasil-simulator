import { createStore } from 'zustand/vanilla';

import {
  advanceMonth,
  APPOINT_ACTION_ID,
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

export interface TutorialOption {
  id: string;
  label: string;
  detail: string;
  input: MonthInput;
}
export interface TutorialLesson {
  title: string;
  description: string;
  options: TutorialOption[];
}

const TUTORIAL_SEED = 42;

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

function lessonAt(step: number, state: GameState): TutorialLesson | null {
  const options: TutorialOption[][] = [
    [
      {
        id: 'caravana',
        label: 'Fazer caravana em São Paulo',
        detail: 'Concentra reconhecimento em um estado e usa recursos do partido.',
        input: decision('caravana_regional', { uf: 'SP', bolso: 'party' }),
      },
      {
        id: 'militancia',
        label: 'Mobilizar a militância',
        detail: 'Espalha a mensagem pela rede partidária.',
        input: decision('mobilizar_militancia', { bolso: 'party' }),
      },
    ],
    [
      {
        id: 'propositiva',
        label: 'Apresentar propostas',
        detail: 'Escolhe uma postura propositiva no debate.',
        input: decision(DEBATE_ACTION_ID, { postura: 'propositiva' }),
      },
      {
        id: 'tecnica',
        label: 'Apresentar argumentos técnicos',
        detail: 'Escolhe uma postura técnica no debate.',
        input: decision(DEBATE_ACTION_ID, { postura: 'tecnica' }),
      },
    ],
    [
      {
        id: 'comicio',
        label: 'Fazer comício nacional',
        detail: 'Alcança o país e consome mais recursos antes da eleição.',
        input: decision('comicio_nacional', { bolso: 'party' }),
      },
      {
        id: 'militancia',
        label: 'Mobilizar a militância',
        detail: 'Usa uma ação de campanha mais barata antes da eleição.',
        input: decision('mobilizar_militancia', { bolso: 'party' }),
      },
    ],
    [
      {
        id: 'saude',
        label: 'Priorizar atenção básica',
        detail: 'Solicita R$ 3.200 milhões por ano para a rotina de saúde.',
        input: decision(DIRECTIVE_ACTION_ID, {
          ministryId: 'saude',
          policyId: 'rotina_atencao_basica',
          annualMillions: 3200,
        }),
      },
      {
        id: 'defesa',
        label: 'Priorizar defesa civil',
        detail: 'Solicita R$ 2.000 milhões por ano para resposta a emergências.',
        input: decision(DIRECTIVE_ACTION_ID, {
          ministryId: 'cidades',
          policyId: 'rotina_defesa_civil',
          annualMillions: 2000,
        }),
      },
    ],
    [
      {
        id: 'infra',
        label: 'Propor crédito para infraestrutura',
        detail: 'Envia um projeto de crédito ao Congresso.',
        input: decision('infraestrutura_credito_adicional'),
      },
      {
        id: 'transferencia',
        label: 'Propor ampliação de transferência',
        detail: 'Envia uma política social ao Congresso.',
        input: decision('transferencia_renda_ampliacao'),
      },
    ],
    [],
    [
      {
        id: 'cooperar',
        label: 'Colaborar com a CPI',
        detail: 'Entrega documentos para a investigação fictícia.',
        input: {
          decisions: [],
          eventChoices: [{ eventId: 'fase07_inst_cpi_instalada', choiceId: 'colaborar_com_a_cpi' }],
        },
      },
      {
        id: 'deixar',
        label: 'Deixar a CPI correr',
        detail: 'Não interfere nos trabalhos, com seus custos políticos.',
        input: {
          decisions: [],
          eventChoices: [{ eventId: 'fase07_inst_cpi_instalada', choiceId: 'deixar_a_cpi_correr' }],
        },
      },
    ],
    [
      {
        id: 'centro',
        label: 'Indicar o bloco de centro',
        detail: 'Pode fortalecer o apoio desse bloco; a gestão depende do indicado.',
        input: decision(APPOINT_ACTION_ID, { ministryId: 'transportes', occupant: 'centro' }),
      },
      {
        id: 'esquerda',
        label: 'Indicar o bloco de esquerda',
        detail: 'Pode fortalecer o apoio desse bloco; a gestão depende do indicado.',
        input: decision(APPOINT_ACTION_ID, { ministryId: 'transportes', occupant: 'esquerda' }),
      },
    ],
  ];
  const titles = [
    ['Campanha: escolher alcance', 'Compare uma ação concentrada e uma mobilização partidária.'],
    ['Debate: escolher postura', 'A postura altera a imagem do candidato; não garante votos.'],
    ['Eleição: última escolha', 'Faça uma escolha antes da apuração e observe o resultado.'],
    [
      'Orçamento: escolher uma dotação',
      'Exercício de governo independente da eleição anterior: nenhum resultado eleitoral é transformado automaticamente em posse.',
    ],
    ['Lei: enviar uma proposta', 'Uma proposta passa pelo Congresso antes da execução.'],
    ['Congresso: negociar apoio', 'Escolha com qual bloco negociar a proposta enviada.'],
    ['Crise: responder à CPI', 'Uma situação fictícia foi preparada para comparar respostas institucionais.'],
    ['Gabinete: escolher indicação', 'Compare apoio político e capacidade de gestão do indicado.'],
  ];
  if (step < 0 || step >= titles.length) return null;
  if (step === 5) {
    const proposal = state.proposals.find((item) => item.status === 'em_tramitacao' || item.status === 'parada');
    if (!proposal) throw new Error('A proposta do exercício não está disponível para negociação.');
    options[5] = ['centro', 'esquerda'].map((blocId) => ({
      id: blocId,
      label: `Negociar com ${blocId.replace('_', ' ')}`,
      detail: 'A negociação consome agenda e capital político.',
      input: decision(NEGOTIATE_ACTION_ID, { proposalId: proposal.id, blocId }),
    }));
  }
  return { title: titles[step][0], description: titles[step][1], options: options[step] };
}

export interface GuidedTutorialState {
  step: number;
  state: GameState;
  lastResult: MonthResult | null;
  followupReports: MonthReport[];
  lesson(): TutorialLesson | null;
  choose(id: string): MonthResult;
  reset(): void;
}

/** Sequência independente, em memória, sem escrever na campanha nem no banco. */
export function createGuidedTutorial(content: GameContent) {
  return createStore<GuidedTutorialState>((set, get) => ({
    step: 0,
    state: initial(content, true),
    lastResult: null,
    followupReports: [],
    lesson: () => lessonAt(get().step, get().state),
    choose(id) {
      const option = get()
        .lesson()
        ?.options.find((item) => item.id === id);
      if (!option) throw new RangeError('Escolha de tutorial inválida.');
      const result = advanceMonth(get().state, option.input, content);
      if (result.report.rejected.length > 0) {
        set({ lastResult: result, followupReports: [] });
        return result;
      }
      const nextStep = get().step + 1;
      let state = nextStep === 3 ? initial(content, false) : result.state;
      const followupReports: MonthReport[] = [];
      if (nextStep === 6) {
        const proposalId = option.input.decisions[0]?.params?.proposalId;
        for (let month = 0; month < 36; month++) {
          const proposal = state.proposals.find((item) => item.id === proposalId);
          if (!proposal || ['rejeitada', 'vetada', 'abandonada', 'bloqueada', 'concluida'].includes(proposal.status))
            break;
          const policy = content.policies[proposal.policyId];
          const lag = Math.min(...(policy?.impacts.map((impact) => impact.lagMonths) ?? [0]));
          if (
            proposal.status === 'em_execucao' &&
            proposal.executionStart !== null &&
            state.monthIndex > proposal.executionStart + lag
          )
            break;
          const next = advanceMonth(state, { decisions: [] }, content);
          state = next.state;
          followupReports.push(next.report);
        }
      }
      if (nextStep === 6) {
        const id = 'fase07_inst_cpi_instalada';
        state = {
          ...state,
          events: {
            ...state.events,
            pending: [
              ...state.events.pending,
              { eventId: id, monthIndex: state.monthIndex, instanceId: `${id}#${state.monthIndex}` },
            ],
          },
        };
      }
      set({ step: nextStep, state, lastResult: result, followupReports });
      return result;
    },
    reset() {
      set({ step: 0, state: initial(content, true), lastResult: null, followupReports: [] });
    },
  }));
}
