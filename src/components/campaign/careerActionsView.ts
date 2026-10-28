import {
  attackRisk,
  CAREER_ACTIONS,
  careerActionsPerTurn,
  candidateIdentities,
  currentCareerTurn,
  DEBATE_ACTION_ID,
  debateOfTurn,
  debateOptions,
  isCareerAction,
  type CareerActionOutcome,
  type CareerActionSpec,
  type CareerDebateOutcome,
  type DebatePosture,
  type Decision,
  type GameContent,
  type GameState,
  type MonthReport,
} from '@/engine';

/**
 * Leitura das ações de campanha e do debate para a tela (PLANO_CAMPANHA.md Fase C4, tarefa C4.4): o que cada ação
 * faz, quanto custa, se cabe no turno, os alvos possíveis e o que aconteceu no turno anterior. Só faixas e texto:
 * os valores internos do motor (reconhecimento, valência, coeficientes) nunca aparecem. Função pura.
 */

const money = (amount: number) => `R$ ${amount.toLocaleString('pt-BR')} mil`;

/** Imagem de um adversário como a imprensa a descreve (faixa da valência, sem número). */
export function imageLabel(valence: number): string {
  if (valence > 0.2) return 'imagem boa';
  if (valence < -0.2) return 'imagem desgastada';
  return 'imagem neutra';
}

/** Faixa do risco de bumerangue. */
export function riskLabel(risk: number): string {
  if (risk < 0.3) return 'risco baixo';
  if (risk < 0.5) return 'risco médio';
  return 'risco alto';
}

/** Tamanho de um efeito esperado (sem número). */
function sizeLabel(x: number, small: number, large: number): string {
  if (x <= 0) return 'nenhum';
  if (x < small) return 'pequeno';
  if (x < large) return 'médio';
  return 'grande';
}

export interface ActionRow {
  id: string;
  name: string;
  summary: string;
  cost: string;
  target?: CareerActionSpec['target'];
  /** Marcada no rascunho (com o alvo, quando há). */
  selected: boolean;
  selectedTarget?: string;
  /** Por que não dá para marcar agora; ausente = disponível. */
  unavailable?: string;
}

export interface OpponentOption {
  blocId: string;
  name: string;
  image: string;
  risk: string;
}

export interface DebatePostureRow {
  posture: DebatePosture;
  target?: string;
  label: string;
  effect: string;
  selected: boolean;
}

export interface CareerActionsViewModel {
  /** Ex.: "Ações do turno: 1 de 3". */
  slots: string;
  full: boolean;
  actions: ActionRow[];
  opponents: OpponentOption[];
  debate: { title: string; rows: DebatePostureRow[]; defaultNote: string } | null;
  /** O que as ações e o debate do último turno fizeram, em texto. */
  lastResults: string[];
}

const POSTURE_NAME: Record<DebatePosture, string> = {
  propositiva: 'propositiva',
  tecnica: 'técnica',
  ataque: 'de ataque',
};

const POSTURE_LABEL: Record<DebatePosture, string> = {
  propositiva: 'Propositiva: apresentar propostas',
  tecnica: 'Técnica: números e experiência de gestão',
  ataque: 'Atacar',
};

function resultText(o: CareerActionOutcome, names: Record<string, string>, content: Pick<GameContent, 'scenario'>) {
  const spec = isCareerAction(o.actionId) ? CAREER_ACTIONS[o.actionId] : undefined;
  const ufName = (id?: string) => content.scenario.regions?.ufs.find((u) => u.id === id)?.name ?? id;
  switch (o.actionId) {
    case 'caravana_regional':
      return `Caravana em ${ufName(o.target)}: você ficou mais conhecido no estado.`;
    case 'comicio_nacional':
      return 'Comício nacional: você ficou um pouco mais conhecido em todo o país.';
    case 'mobilizar_militancia':
      return o.recognitionDelta > 0
        ? 'Militância nas ruas: você ficou mais conhecido onde o partido é forte.'
        : 'Militância nas ruas: nenhum estado tem eleitorado parecido com o do seu bloco.';
    case 'ataque_adversario':
      return o.result === 'bumerangue'
        ? `A campanha contra ${names[o.target ?? ''] ?? o.target} virou bumerangue e desgastou a sua imagem.`
        : `A campanha contra ${names[o.target ?? ''] ?? o.target} deu certo: a imagem dessa candidatura piorou.`;
    case 'arrecadar_doacoes':
      return 'Arrecadação feita: o dinheiro entra no próximo turno.';
    default:
      return spec?.name ?? o.actionId;
  }
}

function debateText(d: CareerDebateOutcome, names: Record<string, string>): string {
  const how = d.automatic ? ' (sem postura marcada, valeu a padrão)' : '';
  if (d.posture === 'ataque') {
    const who = names[d.target ?? ''] ?? d.target;
    return d.result === 'bumerangue'
      ? `Debate${how}: o ataque a ${who} pegou mal e desgastou a sua imagem.`
      : `Debate${how}: o ataque a ${who} deu certo, e a imagem dessa candidatura piorou.`;
  }
  return d.valenceDelta > 0
    ? `Debate${how}: a postura ${POSTURE_NAME[d.posture]} melhorou a sua imagem.`
    : `Debate${how}: a postura ${POSTURE_NAME[d.posture]} não mudou a sua imagem.`;
}

/** Monta a leitura; `null` sem carreira antes da posse. */
export function careerActionsViewModel(
  state: Pick<GameState, 'career' | 'resources'>,
  content: GameContent,
  decisions: readonly Decision[],
  report?: MonthReport,
): CareerActionsViewModel | null {
  const career = state.career;
  const turn = currentCareerTurn(state, content);
  if (!career || !turn) return null;
  const names = Object.fromEntries(candidateIdentities(career, content).map((c) => [c.id, c.name]));
  const costs = content.scenario.career?.finance?.costs ?? [];
  const limit = careerActionsPerTurn(state);
  const marked = decisions.filter((d) => isCareerAction(d.policyId));
  const full = marked.length >= limit;

  const actions: ActionRow[] = Object.values(CAREER_ACTIONS)
    // A arrecadação é marcada no cartão das finanças (escolha do bolso); aqui só as ações com efeito eleitoral.
    .filter((spec) => spec.id !== 'arrecadar_doacoes')
    .map((spec) => {
      const chosen = marked.find((d) => d.policyId === spec.id);
      const cost = costs.find((c) => c.id === spec.id)?.cost;
      const unavailable =
        turn.stage === 'transicao'
          ? 'A eleição já passou: não há mais ações de campanha.'
          : !spec.stages.includes(turn.stage)
            ? 'Só existe na campanha oficial, a partir de 16 de agosto.'
            : cost === undefined
              ? 'Sem custo definido no cenário.'
              : !chosen && full
                ? `As ${limit} ações do turno já estão marcadas.`
                : undefined;
      const target = chosen?.params?.uf ?? chosen?.params?.alvo;
      return {
        id: spec.id,
        name: spec.name,
        summary: spec.summary,
        cost: cost === undefined ? '—' : money(cost),
        ...(spec.target ? { target: spec.target } : {}),
        selected: chosen !== undefined,
        ...(typeof target === 'string' ? { selectedTarget: target } : {}),
        ...(unavailable ? { unavailable } : {}),
      };
    });

  const opponents = career.opponents.map((o) => ({
    blocId: o.blocId,
    name: names[o.blocId] ?? o.blocId,
    image: imageLabel(o.valence),
    risk: riskLabel(attackRisk(o.valence)),
  }));

  const debateSpec = debateOfTurn(content, turn);
  const chosenDebate = decisions.find((d) => d.policyId === DEBATE_ACTION_ID);
  const debate = debateSpec
    ? {
        title: debateSpec.name,
        defaultNote: 'Se você não marcar uma postura, vai com a propositiva. O debate não gasta ação nem dinheiro.',
        rows: debateOptions(career, content).map((o) => {
          const who = o.target ? (names[o.target] ?? o.target) : undefined;
          const effect =
            o.posture === 'ataque'
              ? `Desgaste esperado de ${who}: ${sizeLabel(-o.expectedTargetValence, 0.04, 0.07)}; ${riskLabel(o.risk)} de bumerangue (${imageLabel(career.opponents.find((x) => x.blocId === o.target)!.valence)} hoje).`
              : `Ganho de imagem esperado: ${sizeLabel(o.expectedValence, 0.03, 0.06)}; sem risco.`;
          return {
            posture: o.posture,
            ...(o.target ? { target: o.target } : {}),
            label: o.posture === 'ataque' ? `${POSTURE_LABEL.ataque} ${who}` : POSTURE_LABEL[o.posture],
            effect,
            selected:
              chosenDebate?.params?.postura === o.posture &&
              (o.posture !== 'ataque' || chosenDebate.params?.alvo === o.target),
          };
        }),
      }
    : null;

  const lastResults = [
    ...(report?.career?.actions ?? []).map((o) => resultText(o, names, content)),
    ...(report?.career?.debate ? [debateText(report.career.debate, names)] : []),
  ];

  return { slots: `Ações do turno: ${marked.length} de ${limit}`, full, actions, opponents, debate, lastResults };
}
