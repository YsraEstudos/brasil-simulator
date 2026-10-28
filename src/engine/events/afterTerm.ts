import { START_YEAR, termOf } from '../calendar';
import type { ParamSpec } from '../economy/calibration';
import type { GameContent, GameState, IndicatorKey } from '../types';

import { IMPEACHMENT_PARAMS } from './calibration';
import { hasFlag } from './events';
import { campaignOutcome, type CampaignOutcome } from './outcome';
import { meanCongressRelation } from './pressure';

/**
 * Situação e possibilidades depois do mandato (PLANO_CAMPANHA.md Fase C7, Camada 5). É uma seção do Legado, sem meses
 * jogáveis (D-C7): uma **leitura** do estado final, sem estado próprio e sem sorteio, com três aspectos independentes
 * (influência política, situação jurídica e legado de governo) e as possibilidades que decorrem deles. São projeções,
 * não destinos: o texto fala no que tende a acontecer, e as restrições jurídicas citam a regra que as sustenta
 * (DATA_SOURCES.md §6, 27/10/2026).
 */

const JOGO = 'critério de jogo: legibilidade do relatório final; a calibrar';

/** Pesos da influência política (pontos somados a 50, numa escala de 0 a 100). Valores de jogo. */
export const AFTER_TERM_PARAMS = {
  pos_influencia_aprovacao: {
    value: 100,
    min: 50,
    max: 150,
    note: 'pontos por unidade (100 p.p.) de aprovação final acima da referência neutra',
    basis: JOGO,
  },
  pos_influencia_relacao: {
    value: 0.2,
    min: 0.1,
    max: 0.4,
    note: 'pontos por ponto de relação média com os blocos no fim do mandato (−100 a 100)',
    basis: JOGO,
  },
  pos_influencia_sucessor: {
    value: 10,
    min: 0,
    max: 20,
    note: 'pontos quando a candidatura ou o sucessor apoiado vence a eleição geral',
    basis: JOGO,
  },
  pos_influencia_derrota: {
    value: 10,
    min: 0,
    max: 20,
    note: 'pontos perdidos quando a situação perde a eleição geral',
    basis: JOGO,
  },
  pos_influencia_impeachment: {
    value: 30,
    min: 15,
    max: 50,
    note: 'pontos perdidos com a condenação no Senado',
    basis: JOGO,
  },
} as const satisfies Record<string, ParamSpec>;

type AfterTermParam = keyof typeof AFTER_TERM_PARAMS;
const param = (name: AfterTermParam) => AFTER_TERM_PARAMS[name].value;

/** Anos de inabilitação para função pública depois da condenação no impeachment (CF art. 52, parágrafo único). */
export const IMPEACHMENT_DISQUALIFICATION_YEARS = 8;

/**
 * Desfecho final, na precedência da Fase C7: `cassacao` (1) e `nao_homologado` (3) ainda não existem (Fase C5, Exp);
 * depois vêm `impeachment` (2), a derrota antes da posse (4), `derrota_eleitoral` (5), `fim_de_mandato` (6) e o fim
 * pelo limite de meses do cenário (7), que não é desfecho do motor, e por isso chega como `monthLimit`.
 */
export type FinalOutcome = CampaignOutcome | 'limite_de_meses';

export function finalOutcome(state: Readonly<GameState>, monthLimit: number): FinalOutcome | null {
  return campaignOutcome(state) ?? (state.monthIndex >= monthLimit ? 'limite_de_meses' : null);
}

// --- legado de governo (GAME_DESIGN.md §7.2)

/** Direção boa de cada indicador do legado. */
const GOOD_WHEN: Record<IndicatorKey, 'up' | 'down'> = {
  approval: 'up',
  inflation12m: 'down',
  unemployment: 'down',
  gdpGrowth12m: 'up',
  primaryBalance12m: 'up',
};
export const LEGACY_INDICATORS = Object.keys(GOOD_WHEN) as IndicatorKey[];

/**
 * Pontuação simples do protótipo (GDD §7.2): para cada um dos 5 indicadores, +1 se o valor final melhorou em relação
 * ao inicial, −1 se piorou e 0 se ficou igual. A pontuação é a média desses sinais, entre −1 e +1.
 */
export function legacyScore(
  initial: Readonly<Record<IndicatorKey, number>>,
  final: Readonly<Record<IndicatorKey, number>>,
): { signs: Record<IndicatorKey, -1 | 0 | 1>; score: number } {
  const signs = {} as Record<IndicatorKey, -1 | 0 | 1>;
  let total = 0;
  for (const key of LEGACY_INDICATORS) {
    const delta = final[key] - initial[key];
    const better = GOOD_WHEN[key] === 'up' ? delta : -delta;
    const sign: -1 | 0 | 1 = better > 0 ? 1 : better < 0 ? -1 : 0;
    signs[key] = sign;
    total += sign;
  }
  return { signs, score: total / LEGACY_INDICATORS.length };
}

/** Indicadores na posse, pelo cenário. */
export function initialIndicators(content: Pick<GameContent, 'scenario'>): Record<IndicatorKey, number> {
  const i = content.scenario.indicators;
  return {
    approval: i.approval.value,
    inflation12m: i.inflation12m.value,
    unemployment: i.unemployment.value,
    gdpGrowth12m: i.gdpGrowth12m.value,
    primaryBalance12m: i.primaryBalance12m.value,
  };
}

// --- tipos da leitura

export type InfluenceBand = 'baixa' | 'media' | 'alta';
export type LegalLevel = 'nenhuma' | 'investigacao' | 'acusacao' | 'condenacao' | 'restricao';
export type LegacyBand = 'negativo' | 'misto' | 'positivo';

export interface InfluenceFactor {
  label: string;
  points: number;
}
export interface LegalItem {
  level: Exclude<LegalLevel, 'nenhuma'>;
  label: string;
}
export interface AfterTerm {
  outcome: FinalOutcome;
  /** Mandatos exercidos até o fim (1 ou 2). */
  terms: number;
  influence: { value: number; band: InfluenceBand; factors: InfluenceFactor[] };
  /** O nível é o mais grave dos itens; sem itens, `nenhuma`. Marca de CPI ou de escândalo nunca é condenação. */
  legal: { level: LegalLevel; items: LegalItem[] };
  legacy: { score: number; band: LegacyBand; improved: number; approvedProposals: number };
  /** Projeções, cada uma com a regra que a sustenta quando é jurídica. */
  possibilities: string[];
}

const LEGAL_ORDER: readonly LegalLevel[] = ['nenhuma', 'investigacao', 'acusacao', 'condenacao', 'restricao'];

export function influenceBand(value: number): InfluenceBand {
  return value < 40 ? 'baixa' : value < 60 ? 'media' : 'alta';
}
export function legacyBand(score: number): LegacyBand {
  return score <= -0.2 ? 'negativo' : score >= 0.2 ? 'positivo' : 'misto';
}

// --- aspectos

function influence(state: Readonly<GameState>, content: GameContent, outcome: FinalOutcome): AfterTerm['influence'] {
  const factors: InfluenceFactor[] = [
    {
      label: 'Aprovação no fim do mandato',
      points:
        param('pos_influencia_aprovacao') * (state.indicators.approval - IMPEACHMENT_PARAMS.aprovacao_neutra.value),
    },
    {
      label: 'Relação com os blocos do Congresso',
      points: param('pos_influencia_relacao') * meanCongressRelation(state, content),
    },
  ];
  const general = state.politics?.eleicao_geral;
  if (outcome === 'impeachment') {
    factors.push({ label: 'Condenação no impeachment', points: -param('pos_influencia_impeachment') });
  } else if (general?.venceu) {
    const label = general.candidatura ? 'Reeleição' : 'Sucessor apoiado eleito';
    factors.push({ label, points: param('pos_influencia_sucessor') });
  } else if (general) {
    factors.push({ label: 'Eleição geral perdida', points: -param('pos_influencia_derrota') });
  }
  const raw = 50 + factors.reduce((sum, f) => sum + f.points, 0);
  const value = Math.min(100, Math.max(0, raw));
  return { value, band: influenceBand(value), factors };
}

function legal(state: Readonly<GameState>): AfterTerm['legal'] {
  const items: LegalItem[] = [];
  const flag = (f: string) => hasFlag(state, f);
  if (flag('impeachment_condenado')) {
    items.push({ level: 'restricao', label: 'Condenação no impeachment, com inabilitação para função pública' });
  } else if (flag('impeachment_autorizado') && !flag('impeachment_arquivado')) {
    items.push({ level: 'acusacao', label: 'Processo de impeachment autorizado pela Câmara, sem julgamento' });
  } else if (flag('impeachment_denuncia_aceita') && !flag('impeachment_arquivado')) {
    items.push({ level: 'acusacao', label: 'Denúncia de impeachment aceita, sem votação na Câmara' });
  }
  if (flag('cpi_relatorio_pesado')) {
    items.push({ level: 'investigacao', label: 'Relatório da CPI enviado aos órgãos de controle' });
  } else if (flag('cpi_instalada') && !flag('cpi_encerrada')) {
    items.push({ level: 'investigacao', label: 'CPI ainda em funcionamento' });
  }
  if (Object.keys(state.events.flags).some((f) => f.startsWith('escandalo_'))) {
    items.push({ level: 'investigacao', label: 'Denúncias de irregularidade no governo' });
  }
  const investigations = state.career?.illicit?.investigations ?? 0;
  if (investigations > 0) {
    items.push({ level: 'investigacao', label: 'Caixa 2 da campanha descoberto pela fiscalização' });
  }
  const level = items.reduce<LegalLevel>(
    (worst, item) => (LEGAL_ORDER.indexOf(item.level) > LEGAL_ORDER.indexOf(worst) ? item.level : worst),
    'nenhuma',
  );
  return { level, items };
}

function legacy(state: Readonly<GameState>, content: GameContent): AfterTerm['legacy'] {
  const { signs, score } = legacyScore(initialIndicators(content), state.indicators);
  const approvedProposals = state.proposals.filter((p) =>
    ['aprovada', 'em_execucao', 'concluida'].includes(p.status),
  ).length;
  return {
    score,
    band: legacyBand(score),
    improved: LEGACY_INDICATORS.filter((k) => signs[k] === 1).length,
    approvedProposals,
  };
}

function possibilities(
  state: Readonly<GameState>,
  outcome: FinalOutcome,
  terms: number,
  influenceView: AfterTerm['influence'],
  legalView: AfterTerm['legal'],
): string[] {
  const out: string[] = [];
  if (legalView.level === 'restricao') {
    const convicted = START_YEAR + Math.floor((state.events.flags.impeachment_condenado ?? state.monthIndex) / 12);
    out.push(
      `Inabilitação para função pública até ${convicted + IMPEACHMENT_DISQUALIFICATION_YEARS}: nenhuma candidatura nem cargo público até lá (CF art. 52, parágrafo único).`,
    );
  } else if (terms >= 2) {
    out.push(
      'Depois de dois mandatos seguidos, a candidatura à Presidência na eleição seguinte não é permitida; numa eleição posterior, volta a ser (CF art. 14, §5º).',
    );
  } else {
    out.push('Pode disputar a Presidência de novo na próxima eleição (CF art. 14, §5º).');
  }
  if (outcome !== 'impeachment') {
    out.push(
      {
        alta: 'Tende a seguir como voz relevante do bloco e a pesar na escolha da próxima candidatura.',
        media: 'Tende a manter espaço no partido, sem comandar a próxima candidatura.',
        baixa: 'Tende a perder espaço no partido e na coalizão.',
      }[influenceView.band],
    );
  }
  if (legalView.level === 'investigacao' || legalView.level === 'acusacao') {
    out.push('As apurações em aberto podem seguir depois do mandato; nada aqui é condenação.');
  }
  return out;
}

/**
 * Leitura do fim do mandato. `null` enquanto a partida segue e na derrota antes da posse (`derrota_campanha`), que
 * usa o resumo da campanha da Fase C5: não há governo a avaliar. `monthLimit` é o limite de meses do cenário.
 */
export function afterTerm(state: Readonly<GameState>, content: GameContent, monthLimit: number): AfterTerm | null {
  const outcome = finalOutcome(state, monthLimit);
  if (outcome === null || outcome === 'derrota_campanha') return null;
  const lastMonth = Math.max(0, state.monthIndex - 1);
  const terms = termOf(lastMonth) + 1;
  const influenceView = influence(state, content, outcome);
  const legalView = legal(state);
  return {
    outcome,
    terms,
    influence: influenceView,
    legal: legalView,
    legacy: legacy(state, content),
    possibilities: possibilities(state, outcome, terms, influenceView, legalView),
  };
}
