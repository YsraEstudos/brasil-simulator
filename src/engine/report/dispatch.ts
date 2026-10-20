import type { GameEvent } from '../../types/event';
import type { Policy } from '../../types/policy';
import { TERM_MONTHS } from '../calendar';
import { isPartisan, ministryOccupant, policyMinistry } from '../congress/cabinet';
import {
  housePresident,
  legislativeInstrument,
  predictVotes,
  sessionAt,
  type VotePrediction,
} from '../congress/congress';
import { blocRelation } from '../congress/relations';
import { pautaOccupancy, pautaSlots } from '../proposals/proposals';
import { expectedAdhesion, REGION_NAMES, regionalIncidence } from '../regions/regions';
import { createRng, seedRng } from '../rng';
import { fiscalRoom } from '../economy/fiscal';
import { currentNominalGdpMillions } from '../state';
import type { GameContent, GameState, ImpulseTarget, Proposal } from '../types';

import { pct, pp } from './format';

/**
 * Limiares e margens dos pareceres da mesa de despacho (GAME_DESIGN.md §4.4, §6). Ficam aqui, e não na
 * calibração, porque descrevem a qualidade da previsão ministerial e o texto do parecer, não a economia.
 * - hotGap: hiato do produto acima do qual uma expansão fiscal recebe aviso de pressão inflacionária.
 * As margens são frações das cadeiras da Casa (a mesma folga vale 15 votos na Câmara e 2 no Senado).
 * - marginEstrategica / marginRealismo: meia-largura da faixa mostrada na Estratégica e no Realismo.
 * - biasRealismo: viés otimista da pasta de articulação no Realismo, somado à previsão.
 * - folgaVotos: folga acima do exigido a partir da qual o parecer diz que a aprovação é provável.
 * - regionHigh / ufHigh: incidência per capita (1 = média nacional) a partir da qual a Comunicação cita a região
 *   ou a UF onde a política pesa mais (ECONOMIC_MODEL.md §5.15).
 */
export const ADVICE_PARAMS = {
  hotGap: 0.01,
  /** Incidência per capita (1 = média) a partir da qual o parecer cita a região ou a UF. */
  regionHigh: 1.2,
  ufHigh: 2,
  marginEstrategica: 0.03,
  marginRealismo: 0.06,
  biasRealismo: 0.02,
  folgaVotos: 0.04,
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
    /** Fração da população dos estados que devem aderir (programas por convênio); `null` sem adesão. */
    adhesion: number | null;
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
const REVENUE_CHANNELS: ReadonlySet<string> = new Set(['receita_tributaria', 'receita_renda', 'receita_consumo']);
const APPROVAL_CHANNEL = 'aprovacao';
const CREDIBILITY_CHANNEL = 'credibilidade_fiscal';
const MINIMUM_WAGE_CHANNEL = 'salario_minimo_real';

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

/** Primeiro mês de efeito (defasagem) entre os impactos dos canais indicados; `null` se nenhum. */
function firstLag(policy: Policy, channels: ReadonlySet<string>): number | null {
  const lags = policy.impacts.filter((i) => channels.has(i.channel) && i.magnitude !== 0).map((i) => i.lagMonths);
  return lags.length > 0 ? Math.min(...lags) : null;
}

/**
 * Como a execução vai escalar a política, igual ao motor de propostas: só a população dos estados que aderem
 * recebe o programa por convênio (`reach`) e a pasta com ministro de bloco perde parte do ganho (`resultFactor`).
 */
function executionFactors(state: Readonly<GameState>, policy: Policy, content: GameContent, reach: number) {
  const ministry = policyMinistry(policy, content);
  const occupant = ministry ? ministryOccupant(state, ministry) : null;
  const partisan = occupant !== null && isPartisan(occupant);
  return { reach, resultFactor: partisan ? 1 - content.calibration.perda_execucao_partidaria : 1, partisan };
}

function fiscalParts(policy: Policy, gdpMillions: number, reach = 1): FiscalParts {
  const spending = (sumMagnitude(policy, SPENDING_CHANNELS) / gdpMillions) * reach;
  const relief = (sumMagnitude(policy, RELIEF_CHANNELS) / gdpMillions) * reach;
  const revenue = (sumMagnitude(policy, REVENUE_CHANNELS) / gdpMillions) * reach;
  return { fiscal: spending + relief - revenue, spending, expansion: spending + relief };
}

/** Frases da Fazenda que não dependem do custo: defasagem, credibilidade fiscal e salário mínimo real. */
function fazendaExtras(policy: Policy): { sentences: string[]; worse: boolean; better: boolean } {
  const sentences: string[] = [];
  const lag = firstLag(policy, new Set([...SPENDING_CHANNELS, ...RELIEF_CHANNELS, ...REVENUE_CHANNELS]));
  if (lag !== null && lag > 0) sentences.push(`Efeito fiscal só daqui a ${lag} meses.`);
  const credibility = sumMagnitude(policy, new Set([CREDIBILITY_CHANNEL]));
  if (credibility < 0) sentences.push('Abala a credibilidade fiscal: juros e câmbio tendem a subir.');
  if (credibility > 0) sentences.push('Reforça a credibilidade fiscal.');
  const wage = sumMagnitude(policy, new Set([MINIMUM_WAGE_CHANNEL]));
  if (wage > 0) {
    sentences.push(
      `Ganho real de ${pct(wage, 1)} no salário mínimo no reajuste de janeiro: eleva previdência e benefícios.`,
    );
  } else if (wage < 0) {
    sentences.push(`Reajuste do salário mínimo ${pct(-wage, 1)} menor: alivia previdência e benefícios.`);
  }
  return { sentences, worse: credibility < 0 || wage > 0, better: credibility > 0 || wage < 0 };
}

function fazendaOpinion(
  state: Readonly<GameState>,
  content: GameContent,
  parts: FiscalParts,
  policy?: Policy,
): Opinion {
  const { fiscal, spending, expansion } = parts;
  const sentences: string[] = [];
  let tone: Opinion['tone'] = 'neutro';

  if (fiscal > 0) {
    sentences.push(`Custo de ${pct(fiscal, 2)} do PIB ao ano; piora o resultado primário.`);
    const { room, aboveFloor } = fiscalRoom(state.economy.fiscal, content.calibration);
    if (spending > room) {
      sentences.push('Estoura o limite de despesas: exige corte compensatório.');
      tone = 'desfavoravel';
    } else if (spending > aboveFloor) {
      sentences.push('Cabe no limite, mas comprime as discricionárias abaixo do piso: risco de paralisação.');
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

  if (policy) {
    const extras = fazendaExtras(policy);
    sentences.push(...extras.sentences);
    if (extras.worse && tone === 'favoravel') tone = 'neutro';
    if (extras.better && tone === 'neutro' && fiscal <= 0) tone = 'favoravel';
  }

  return { text: sentences.join(' '), tone };
}

/** Folga da etapa em fração das cadeiras da Casa (compara Câmara e Senado na mesma escala). */
function slack(v: VotePrediction): number {
  return (v.expectedYes - v.required) / v.total;
}

/** Parecer de articulação para a etapa mais apertada: faixa ou número exato, conforme a dificuldade. */
export function votesOpinion(state: Readonly<GameState>, policyId: string, prediction: VotePrediction): Opinion {
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
    const margin = Math.max(
      1,
      Math.round((realismo ? ADVICE_PARAMS.marginRealismo : ADVICE_PARAMS.marginEstrategica) * total),
    );
    const bias = realismo ? Math.round(ADVICE_PARAMS.biasRealismo * total) : 0;
    const rng = createRng(seedRng(adviceSeed(state, policyId)));
    const center = prediction.expectedYes + rng.int(-margin, margin) + bias;
    shown = Math.round(center);
    const low = Math.max(0, Math.round(center - margin));
    const high = Math.min(total, Math.round(center + margin));
    text = `${label}: entre ${low} e ${high} votos para ${required} necessários.`;
  }

  const slack = shown - required;
  if (slack >= ADVICE_PARAMS.folgaVotos * total) return { text: `${text} Aprovação provável.`, tone: 'favoravel' };
  if (slack < 0) return { text: `${text} Tende a faltar votos.`, tone: 'desfavoravel' };
  return { text: `${text} Aprovação incerta.`, tone: 'neutro' };
}

function comunicacaoOpinion(
  state: Readonly<GameState>,
  policy: Policy,
  content: GameContent,
  impact: number,
  partisan = false,
): Opinion {
  const parts: string[] = [];
  let tone: Opinion['tone'] = 'neutro';
  if (impact === 0) {
    parts.push('Sem efeito direto na aprovação.');
  } else {
    const lag = firstLag(policy, new Set([APPROVAL_CHANNEL]));
    parts.push(`Efeito de ${pp(impact)} na aprovação${lag !== null && lag > 0 ? ` daqui a ${lag} meses` : ''}.`);
    tone = impact > 0 ? 'favoravel' : 'desfavoravel';
    if (impact > 0 && partisan) parts.push('Pasta com ministro de bloco: o ganho rende menos.');
  }

  const groups = policy.affected.groups.slice(0, 2).map((g) => g.replace(/_/g, ' '));
  if (groups.length > 0) parts.push(`Grupos mais afetados: ${groups.join(', ')}.`);

  const honeymoon = state.monthIndex % TERM_MONTHS < content.calibration.meses_lua_de_mel;
  if (impact < 0 && honeymoon) parts.push('Na lua de mel o desgaste é menor.');

  const regional = regionalSentence(policy, content);
  if (regional) parts.push(regional);

  return { text: parts.join(' '), tone };
}

/**
 * Onde a política pesa mais (ECONOMIC_MODEL.md §5.15): regiões com incidência per capita bem acima da média e a
 * UF mais concentrada, se for o caso. Benefício ("favorece") quando o saldo é gasto ou desoneração; custo
 * ("pesa mais") quando é corte ou tributo.
 */
function regionalSentence(policy: Policy, content: GameContent): string | null {
  const profile = policy.regional;
  if (!profile) return null;
  const { regions, topUf } = regionalIncidence(content, profile);
  const high = regions.filter((r) => r.ratio >= ADVICE_PARAMS.regionHigh).sort((a, b) => b.ratio - a.ratio);
  const benefit =
    sumMagnitude(policy, SPENDING_CHANNELS) +
      sumMagnitude(policy, RELIEF_CHANNELS) -
      sumMagnitude(policy, REVENUE_CHANNELS) >=
    0;
  const verb = benefit ? 'Favorece mais' : 'Pesa mais sobre';
  const uf =
    topUf && topUf.ratio >= ADVICE_PARAMS.ufHigh ? content.scenario.regions?.ufs.find((u) => u.id === topUf.id) : null;
  const top = uf ? `maior peso por habitante: ${uf.name}` : '';
  if (high.length === 0) return uf ? `${top.charAt(0).toUpperCase()}${top.slice(1)}.` : null;
  const names = high.slice(0, 2).map((r) => REGION_NAMES[r.id]);
  return `${verb} o ${names.join(' e o ')}${uf ? ` (${top})` : ''}.`;
}

/** Adesão esperada dos governadores a programa por convênio (POLITICAL_RULES.md §2.1). */
function adhesionWarning(state: Readonly<GameState>, policy: Policy, content: GameContent) {
  if (!policy.conditions.includes('adesao_estadual') || state.difficulty === 'casual') return null;
  const expected = expectedAdhesion(state, content);
  if (!expected) return null;
  const total = content.scenario.regions?.ufs.length ?? 0;
  return {
    share: expected.populationShare,
    text: `Governadores: devem aderir cerca de ${Math.round(expected.states)} de ${total} estados (${pct(expected.populationShare, 0)} da população).`,
  };
}

/**
 * Avisos de pauta para uma proposta nova (POLITICAL_RULES.md §6.3): pauta da Câmara cheia, presidência da Casa
 * com relação ruim e pedágio de emendas em votação de quórum qualificado.
 */
function congressWarnings(state: Readonly<GameState>, policy: Policy, content: GameContent): string[] {
  const instrument = legislativeInstrument(policy);
  if (instrument === null) return [];
  const c = content.calibration;
  const warnings: string[] = [];
  const house = sessionAt(instrument, 0)?.house ?? null;
  if (house !== null) {
    const occupied = pautaOccupancy(state.proposals, house, content);
    if (occupied > 0 && occupied + pautaSlots(instrument, c) > c.capacidade_pauta) {
      warnings.push(`Pauta ${house === 'camara' ? 'da Câmara' : 'do Senado'} cheia: vai esperar vaga.`);
    }
  }
  const president = housePresident(content, house ?? 'senado');
  if (president && blocRelation(state, president) < c.limiar_presidente_casa) {
    warnings.push(`A presidência da Casa (bloco ${president.name}) está insatisfeita e pode não pautar.`);
  }
  if (instrument === 'pec' || instrument === 'projeto_lei_complementar') {
    warnings.push('Quórum qualificado: os líderes devem cobrar emendas para votar.');
  }
  return warnings;
}

/**
 * Previsão da próxima sessão de uma proposta já no Congresso (aba Congresso): parecer da etapa mais apertada
 * da Casa atual, com as contrapartidas já negociadas. `null` fora da tramitação.
 */
export function proposalForecast(state: GameState, proposal: Proposal, content: GameContent): Opinion | null {
  const policy = content.policies[proposal.policyId];
  const instrument = policy ? legislativeInstrument(policy) : null;
  if (!policy || instrument === null) return null;
  const session = sessionAt(instrument, proposal.stage);
  if (session === null) return null;
  const votes = predictVotes(state, policy, content, proposal).slice(0, session.stages.length);
  if (votes.length === 0) return null;
  const tightest = votes.reduce((a, b) => (slack(b) < slack(a) ? b : a), votes[0]);
  return votesOpinion(state, policy.id, tightest);
}

/**
 * Pareceres da mesa de despacho (GAME_DESIGN.md §4.4) antes de uma decisão. Função pura: não altera `state`
 * nem avança `state.rng`. Previsões vêm do próprio motor (`predictVotes`), com faixa e viés por dificuldade.
 */
export function adviseDecision(state: GameState, policyId: string, content: GameContent): DispatchAdvice {
  const policy = content.policies[policyId];
  if (!policy) throw new RangeError(`política desconhecida: ${policyId}`);

  let articulacao: Opinion = { text: 'Ato do Executivo: não depende do Congresso.', tone: 'neutro' };
  const adhesion = adhesionWarning(state, policy, content);
  // Mesmas escalas que a execução aplicará (proposals.ts): adesão dos estados e perda da pasta de bloco.
  const factors = executionFactors(state, policy, content, adhesion?.share ?? 1);
  const parts = fiscalParts(policy, currentNominalGdpMillions(state, content), factors.reach);
  const approvalImpact = policy.impacts
    .filter((i) => i.channel === APPROVAL_CHANNEL)
    .reduce((n, i) => n + i.magnitude * (i.magnitude > 0 ? factors.resultFactor : 1), 0);
  let votes: VotePrediction[] = [];
  if (legislativeInstrument(policy) !== null) {
    votes = predictVotes(state, policy, content);
    // Etapa mais apertada: menor folga entre votos esperados e exigidos, em fração das cadeiras da Casa.
    const tightest = votes.reduce((a, b) => (slack(b) < slack(a) ? b : a), votes[0]);
    articulacao = votesOpinion(state, policy.id, tightest);
    const warnings = congressWarnings(state, policy, content);
    if (warnings.length > 0) {
      articulacao = { text: `${articulacao.text} ${warnings.join(' ')}`, tone: articulacao.tone };
    }
  }
  if (adhesion) articulacao = { text: `${articulacao.text} ${adhesion.text}`, tone: articulacao.tone };

  return {
    fazenda: fazendaOpinion(state, content, parts, policy),
    articulacao,
    comunicacao: comunicacaoOpinion(state, policy, content, approvalImpact, factors.partisan),
    forecast: { annualFiscalImpact: parts.fiscal, votes, approvalImpact, adhesion: adhesion?.share ?? null },
  };
}

export interface EventAdvice {
  fazenda: Opinion;
  articulacao: Opinion;
  comunicacao: Opinion;
}

const EVENT_SPENDING: ReadonlySet<ImpulseTarget> = new Set<ImpulseTarget>([
  'gasto.investimento',
  'gasto.custeio',
  'gasto.transferencia_baixa_renda',
  'gasto.transferencia_alta_renda',
  'gasto.obrigatoria',
  'gasto.extraordinario',
  'receita.desoneracao_consumo',
  'receita.desoneracao_renda',
]);
const EVENT_REVENUE: ReadonlySet<ImpulseTarget> = new Set<ImpulseTarget>([
  'receita.tributaria',
  'receita.renda',
  'receita.consumo',
]);
const EVENT_PRESSURE: ReadonlySet<ImpulseTarget> = new Set<ImpulseTarget>([
  'choque.inflacao',
  'choque.risco',
  'choque.cambio',
]);

function toneOf(value: number): Opinion['tone'] {
  return value > 0 ? 'favoravel' : value < 0 ? 'desfavoravel' : 'neutro';
}

function durationText(months: number | null): string {
  return months === null ? 'de forma permanente' : months === 1 ? 'por 1 mês' : `por ${months} meses`;
}

/**
 * Pareceres da mesa de despacho para uma resposta a evento ("resposta a crise", GAME_DESIGN.md §4.4), lidos dos
 * efeitos da própria escolha. Função pura e determinística; `null` se a escolha não existir.
 */
export function adviseEventChoice(event: GameEvent, choiceId: string): EventAdvice | null {
  const choice = event.choices.find((c) => c.id === choiceId);
  if (!choice) return null;
  const effects = choice.effects;
  const sum = (targets: ReadonlySet<ImpulseTarget>) =>
    effects.filter((e) => targets.has(e.target)).reduce((n, e) => n + e.delta, 0);
  const longest = (targets: ReadonlySet<ImpulseTarget>): number | null => {
    const hits = effects.filter((e) => targets.has(e.target));
    if (hits.some((e) => e.durationMonths === null)) return null;
    return Math.max(0, ...hits.map((e) => e.durationMonths ?? 0));
  };
  const one = (target: ImpulseTarget) => sum(new Set<ImpulseTarget>([target]));

  const fazenda: string[] = [];
  const cost = sum(EVENT_SPENDING) - sum(EVENT_REVENUE);
  const fiscalWindow = durationText(longest(new Set([...EVENT_SPENDING, ...EVENT_REVENUE])));
  if (cost > 0) fazenda.push(`Custo de ${pct(cost, 2)} do PIB ao ano ${fiscalWindow}.`);
  else if (cost < 0) fazenda.push(`Economia de ${pct(-cost, 2)} do PIB ao ano ${fiscalWindow}.`);
  else fazenda.push('Sem efeito fiscal direto.');
  const credibility = one('credibilidade');
  if (credibility < 0) fazenda.push('Abala a credibilidade fiscal.');
  if (credibility > 0) fazenda.push('Reforça a credibilidade fiscal.');
  const pressure = sum(EVENT_PRESSURE);
  if (pressure > 0) fazenda.push('Pressiona inflação, juros ou câmbio.');
  if (pressure < 0) fazenda.push('Alivia inflação, juros ou câmbio.');

  const articulacao: string[] = [];
  const congress = one('relacao_congresso');
  const capital = one('capital_politico');
  const governors = one('governadores.relacao');
  if (congress !== 0) articulacao.push(`${congress > 0 ? 'Melhora' : 'Piora'} a relação com o Congresso.`);
  if (capital !== 0) articulacao.push(`${capital > 0 ? 'Rende' : 'Custa'} capital político.`);
  if (governors !== 0) articulacao.push(`${governors > 0 ? 'Agrada' : 'Desagrada'} os governadores.`);
  if (choice.agendaCost > 0) {
    articulacao.push(`Ocupa ${choice.agendaCost} ${choice.agendaCost > 1 ? 'ações' : 'ação'} da agenda do mês.`);
  }
  if (articulacao.length === 0) articulacao.push('Sem efeito direto no Congresso nem nos governadores.');

  const comunicacao: string[] = [];
  const approval = sum(new Set<ImpulseTarget>(['aprovacao', 'regiao.aprovacao']));
  if (approval === 0) {
    comunicacao.push('Sem efeito direto na aprovação.');
  } else {
    const window = durationText(longest(new Set<ImpulseTarget>(['aprovacao', 'regiao.aprovacao'])));
    comunicacao.push(`Efeito de ${pp(approval)} por mês na aprovação ${window}.`);
  }
  if (event.defaultChoice === choice.id) comunicacao.push('É o que acontece se o governo não responder.');

  return {
    fazenda: { text: fazenda.join(' '), tone: toneOf(-cost + credibility - pressure) },
    articulacao: { text: articulacao.join(' '), tone: toneOf(congress + capital + governors) },
    comunicacao: { text: comunicacao.join(' '), tone: toneOf(approval) },
  };
}
