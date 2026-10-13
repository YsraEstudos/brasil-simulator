import type { Policy } from '../../types/policy';
import { TERM_MONTHS } from '../calendar';
import { legislativeInstrument, predictVotes, type VotePrediction } from '../congress/congress';
import { createRng, seedRng } from '../rng';
import { nominalGdpMillions } from '../state';
import type { GameContent, GameState } from '../types';

import { pct, pp } from './format';

/**
 * Limiares e margens dos pareceres da mesa de despacho (GAME_DESIGN.md §4.4, §6). Ficam aqui, e não na
 * calibração, porque descrevem a qualidade da previsão ministerial e o texto do parecer, não a economia.
 * - hotGap: hiato do produto acima do qual uma expansão fiscal recebe aviso de pressão inflacionária.
 * - marginEstrategica / marginRealismo: meia-largura, em votos, da faixa mostrada na Estratégica e no Realismo.
 * - biasRealismo: viés otimista da pasta de articulação no Realismo, em votos somados à previsão.
 * - folgaVotos: votos acima do exigido a partir dos quais o parecer diz que a aprovação é provável.
 */
export const ADVICE_PARAMS = {
  hotGap: 0.01,
  marginEstrategica: 15,
  marginRealismo: 30,
  biasRealismo: 10,
  folgaVotos: 20,
} as const;

export interface Opinion {
  text: string;
  tone: 'favoravel' | 'neutro' | 'desfavoravel';
}

export interface DispatchAdvice {
  fazenda: Opinion;
  articulacao: Opinion;
  comunicacao: Opinion;
  forecast: {
    /** Fração do PIB por ano; positivo piora o resultado primário. */
    annualFiscalImpact: number;
    votes: VotePrediction[];
    approvalImpact: number;
  };
}

const SPENDING_CHANNELS: ReadonlySet<string> = new Set([
  'investimento_publico',
  'custeio',
  'transferencia_baixa_renda',
  'transferencia_alta_renda',
  'despesa_obrigatoria',
]);
const RELIEF_CHANNELS: ReadonlySet<string> = new Set(['desoneracao_consumo', 'desoneracao_renda']);
const REVENUE_CHANNEL = 'receita_tributaria';
const APPROVAL_CHANNEL = 'aprovacao';

/** Constantes do FNV-1a, usadas para misturar a semente do parecer. */
const HASH_OFFSET_BASIS = 2166136261;
const HASH_PRIME = 16777619;

const HOUSE_LABEL: Readonly<Record<string, string>> = { camara: 'Câmara', senado: 'Senado' };

interface FiscalParts {
  /** Impacto fiscal anual, fração do PIB (+ piora o primário). */
  fiscal: number;
  /** Parte de despesa, fração do PIB. */
  spending: number;
  /** Impulso expansionista (despesa + desoneração), fração do PIB. */
  expansion: number;
}

/** Semente local e determinística: não avança `state.rng`. Mistura semente, mês e id da política. */
function adviceSeed(state: Readonly<GameState>, policyId: string): number {
  let h = Math.imul((state.seed >>> 0) ^ HASH_OFFSET_BASIS, HASH_PRIME) >>> 0;
  h = Math.imul(h ^ state.monthIndex, HASH_PRIME) >>> 0;
  for (let i = 0; i < policyId.length; i++) h = Math.imul(h ^ policyId.charCodeAt(i), HASH_PRIME) >>> 0;
  return h;
}

function sumMagnitude(policy: Policy, channels: ReadonlySet<string>): number {
  return policy.impacts.reduce((n, i) => (channels.has(i.channel) ? n + i.magnitude : n), 0);
}

function fiscalParts(policy: Policy, gdpMillions: number): FiscalParts {
  const spending = sumMagnitude(policy, SPENDING_CHANNELS) / gdpMillions;
  const relief = sumMagnitude(policy, RELIEF_CHANNELS) / gdpMillions;
  const revenue = sumMagnitude(policy, new Set([REVENUE_CHANNEL])) / gdpMillions;
  return { fiscal: spending + relief - revenue, spending, expansion: spending + relief };
}

function fazendaOpinion(state: Readonly<GameState>, content: GameContent, parts: FiscalParts): Opinion {
  const { fiscal, spending, expansion } = parts;
  const sentences: string[] = [];
  let tone: Opinion['tone'] = 'neutro';

  if (fiscal > 0) {
    sentences.push(`Custo de ${pct(fiscal, 2)} do PIB ao ano; piora o resultado primário.`);
    const limit = content.calibration.limite_despesa;
    if (spending > 0 && state.economy.primarySpending + spending > limit) {
      sentences.push('Estoura o limite de despesas: exige corte compensatório.');
      tone = 'desfavoravel';
    }
  } else if (fiscal < 0) {
    sentences.push(`Economia de ${pct(-fiscal, 2)} do PIB ao ano; ajuda a meta fiscal.`);
    tone = 'favoravel';
  } else {
    sentences.push('Sem efeito fiscal relevante.');
  }

  if (expansion > 0 && state.economy.outputGap > ADVICE_PARAMS.hotGap) {
    sentences.push('Demanda aquecida: pressiona a inflação.');
    if (tone === 'favoravel') tone = 'neutro';
  }

  return { text: sentences.join(' '), tone };
}

/** Parecer de articulação para a etapa mais apertada: faixa ou número exato, conforme a dificuldade. */
function votesOpinion(state: Readonly<GameState>, policyId: string, prediction: VotePrediction): Opinion {
  const { required, total } = prediction;
  const house = HOUSE_LABEL[prediction.house] ?? prediction.house;
  const round = prediction.round > 1 ? ` (${prediction.round}º turno)` : '';
  const label = `${house}${round}`;

  let shown: number;
  let text: string;
  if (state.difficulty === 'casual') {
    shown = Math.round(prediction.expectedYes);
    text = `${label}: cerca de ${shown} votos para ${required} necessários.`;
  } else {
    const realismo = state.difficulty === 'realismo';
    const margin = realismo ? ADVICE_PARAMS.marginRealismo : ADVICE_PARAMS.marginEstrategica;
    const bias = realismo ? ADVICE_PARAMS.biasRealismo : 0;
    const rng = createRng(seedRng(adviceSeed(state, policyId)));
    const center = prediction.expectedYes + rng.int(-margin, margin) + bias;
    shown = Math.round(center);
    const low = Math.max(0, Math.round(center - margin));
    const high = Math.min(total, Math.round(center + margin));
    text = `${label}: entre ${low} e ${high} votos para ${required} necessários.`;
  }

  const slack = shown - required;
  if (slack >= ADVICE_PARAMS.folgaVotos) return { text: `${text} Aprovação provável.`, tone: 'favoravel' };
  if (slack < 0) return { text: `${text} Tende a faltar votos.`, tone: 'desfavoravel' };
  return { text: `${text} Aprovação incerta.`, tone: 'neutro' };
}

function comunicacaoOpinion(state: Readonly<GameState>, policy: Policy, content: GameContent, impact: number): Opinion {
  const parts: string[] = [];
  let tone: Opinion['tone'] = 'neutro';
  if (impact === 0) {
    parts.push('Sem efeito direto na aprovação.');
  } else {
    parts.push(`Efeito de ${pp(impact)} na aprovação.`);
    tone = impact > 0 ? 'favoravel' : 'desfavoravel';
  }

  const groups = policy.affected.groups.slice(0, 2).map((g) => g.replace(/_/g, ' '));
  if (groups.length > 0) parts.push(`Grupos mais afetados: ${groups.join(', ')}.`);

  const honeymoon = state.monthIndex % TERM_MONTHS < content.calibration.meses_lua_de_mel;
  if (impact < 0 && honeymoon) parts.push('Na lua de mel o desgaste é menor.');

  return { text: parts.join(' '), tone };
}

/**
 * Pareceres da mesa de despacho (GAME_DESIGN.md §4.4) antes de uma decisão. Função pura: não altera `state`
 * nem avança `state.rng`. Previsões vêm do próprio motor (`predictVotes`), com faixa e viés por dificuldade.
 */
export function adviseDecision(state: GameState, policyId: string, content: GameContent): DispatchAdvice {
  const policy = content.policies[policyId];
  if (!policy) throw new RangeError(`política desconhecida: ${policyId}`);

  const parts = fiscalParts(policy, nominalGdpMillions(content));
  const approvalImpact = sumMagnitude(policy, new Set([APPROVAL_CHANNEL]));

  let articulacao: Opinion = { text: 'Ato do Executivo: não depende do Congresso.', tone: 'neutro' };
  let votes: VotePrediction[] = [];
  if (legislativeInstrument(policy) !== null) {
    votes = predictVotes(state, policy, content);
    // Etapa mais apertada: menor folga entre votos esperados e exigidos.
    const tightest = votes.reduce((a, b) => (b.expectedYes - b.required < a.expectedYes - a.required ? b : a));
    articulacao = votesOpinion(state, policy.id, tightest);
  }

  return {
    fazenda: fazendaOpinion(state, content, parts),
    articulacao,
    comunicacao: comunicacaoOpinion(state, policy, content, approvalImpact),
    forecast: { annualFiscalImpact: parts.fiscal, votes, approvalImpact },
  };
}
