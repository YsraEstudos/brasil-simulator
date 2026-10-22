import { formatNumber, formatPercent } from '@/components/ui/format';
import {
  medianVoterOf,
  populationShares,
  regionalVoteIntention,
  regionsOf,
  regionsView,
  termOf,
  TERM_MONTHS,
  toCalendar,
  type ElectionResult,
  type ElectionRoundResult,
  type GameContent,
  type GameState,
  type IdeologyPoint,
} from '@/engine';

/**
 * Mapa eleitoral (PLANO_GLOBO.md §5.3): o que as camadas "Inclinação política", "Intenção estimada" e "Resultado
 * simulado" mostram por UF e no cartão. Funções puras sobre o estado e a fotografia da eleição (lida do banco);
 * nada aqui sorteia ou altera estado. As cores e as faixas moram em `regionalMetrics`; os dois renderizadores (globo
 * 3D e mapa 2D) recebem os mesmos valores pelo `RegionalMapViewModel`.
 */

/** As camadas eleitorais novas (a "Relação com o governador" já existia e é uma camada de indicador comum). */
export type ElectoralLayerId = 'inclinacao' | 'intencao' | 'resultado';

export const ELECTORAL_LAYER_IDS: readonly ElectoralLayerId[] = ['inclinacao', 'intencao', 'resultado'];

export function isElectoralLayer(id: string): id is ElectoralLayerId {
  return (ELECTORAL_LAYER_IDS as readonly string[]).includes(id);
}

/** Selos das camadas: a intenção é sempre "estimativa"; o resultado só existe depois da eleição e leva a data. */
export const BADGE_ESTIMATE = 'estimativa';
export const BADGE_RESULT = 'resultado';
export const BADGE_PROVISIONAL = 'dado provisório';

const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** 45 → "out/2030" (o mês do jogo em que a eleição geral acontece). */
export function electionDate(monthIndex: number): string {
  const { year, month } = toCalendar(monthIndex);
  return `${MONTH_ABBR[month - 1]}/${year}`;
}

/** Posição da UF num número só: a média dos dois eixos (−1 estado/progressista … 1 mercado/conservador). */
export function leanPosition(lean: IdeologyPoint): number {
  return (lean.economic + lean.social) / 2;
}

/** O turno que decidiu a eleição: o último (o 2º, se houve). */
export function decidingRound(election: ElectionResult): ElectionRoundResult {
  return election.rounds[election.rounds.length - 1];
}

/**
 * Valor de cada UF (por sigla) na camada eleitoral: a posição da inclinação, a intenção estimada ou o voto simulado
 * no governo. Vazio quando a camada não tem dados (cenário sem inclinação, sem eleições ou sem resultado ainda).
 */
export function electoralValues(
  layer: ElectoralLayerId,
  state: Readonly<GameState>,
  content: GameContent,
  election: ElectionResult | null,
): Readonly<Record<string, number>> {
  switch (layer) {
    case 'inclinacao':
      return Object.fromEntries(
        regionsOf(content).flatMap((u) => (u.lean ? [[u.id, leanPosition(u.lean)] as const] : [])),
      );
    case 'intencao':
      return regionalVoteIntention(state, content)?.ufs ?? {};
    case 'resultado':
      return election ? decidingRound(election).ufs : {};
  }
}

/**
 * Mês do jogo da próxima eleição geral a partir de `monthIndex` (a do mandato corrente, ou a do seguinte se ela já
 * passou); `null` sem eleições no cenário.
 */
export function nextGeneralElectionMonth(content: GameContent, monthIndex: number): number | null {
  const elections = content.scenario.elections;
  if (!elections) return null;
  const month = termOf(monthIndex) * TERM_MONTHS + elections.mesEleicaoGeral;
  return month >= monthIndex ? month : month + TERM_MONTHS;
}

/** Texto da camada "Resultado" no seletor: o que ela mostra, ou por que ainda não pode ser aberta. */
export function resultLayerHint(content: GameContent, monthIndex: number, election: ElectionResult | null): string {
  if (election) {
    return `Voto simulado no governo por estado na eleição geral de ${electionDate(election.monthIndex)}; fecha com o resultado nacional.`;
  }
  const next = nextGeneralElectionMonth(content, monthIndex);
  return next === null
    ? 'Este cenário não tem eleições.'
    : `Ainda não há resultado: aparece no mês da eleição geral (${electionDate(next)}).`;
}

/** Texto do selo de uma camada eleitoral (`null` nas demais). O do resultado leva a data da eleição. */
export function badgeText(layer: string, election: ElectionResult | null): string | null {
  if (layer === 'intencao') return BADGE_ESTIMATE;
  if (layer === 'resultado') return election ? `${BADGE_RESULT} · ${electionDate(election.monthIndex)}` : BADGE_RESULT;
  if (layer === 'inclinacao') return BADGE_PROVISIONAL;
  return null;
}

export interface ElectoralRow {
  label: string;
  value: string;
  /** Referência à direita (o número nacional, o outro lado do turno). */
  reference?: string;
}

/** Bloco do cartão da UF numa camada eleitoral: selo, números e avisos honestos sobre o que o número é. */
export interface UfElectoralView {
  badge: string;
  rows: ElectoralRow[];
  notes: string[];
}

const signed = (value: number): string => `${value > 0 ? '+' : ''}${formatNumber(value, 2)}`;

/** Cartão eleitoral da UF; `null` se a camada não tem dado para ela. */
export function buildUfElectoralView(
  layer: ElectoralLayerId,
  ufId: string,
  state: Readonly<GameState>,
  content: GameContent,
  election: ElectionResult | null,
): UfElectoralView | null {
  const scenarioUfs = regionsOf(content);
  const scenarioUf = scenarioUfs.find((u) => u.id === ufId);
  if (!scenarioUf) return null;

  if (layer === 'inclinacao') {
    if (!scenarioUf.lean) return null;
    const median = medianVoterOf(scenarioUfs, populationShares(scenarioUfs));
    const rows: ElectoralRow[] = [
      { label: 'Eixo econômico (estado ↔ mercado)', value: signed(scenarioUf.lean.economic) },
      { label: 'Eixo social (progressista ↔ conservador)', value: signed(scenarioUf.lean.social) },
      {
        label: 'Média dos dois eixos (cor do mapa)',
        value: signed(leanPosition(scenarioUf.lean)),
        reference: median ? `Brasil ${signed(leanPosition(median))}` : undefined,
      },
    ];
    return {
      badge: BADGE_PROVISIONAL,
      rows,
      notes: [
        'Dado do cenário, provisório e sem partidos nem pessoas reais. Não muda durante a partida; é com ele que se mede o alinhamento com o perfil do governo.',
      ],
    };
  }

  if (layer === 'intencao') {
    const estimate = regionalVoteIntention(state, content);
    const share = estimate?.ufs[ufId];
    if (!estimate || share === undefined) return null;
    const approval = regionsView(state, content).find((u) => u.id === ufId)?.approval;
    return {
      badge: BADGE_ESTIMATE,
      rows: [
        {
          label: 'Intenção de voto no governo',
          value: formatPercent(share, 1),
          reference: `Brasil ${formatPercent(estimate.national, 1)}`,
        },
        ...(approval === undefined
          ? []
          : [
              {
                label: 'Aprovação do governo no estado',
                value: formatPercent(approval, 0),
                reference: `Brasil ${formatPercent(state.indicators.approval, 0)}`,
              },
            ]),
      ],
      notes: [
        'Estimativa, não resultado: sai da aprovação do estado (que já inclui o alinhamento) e fecha com a intenção nacional de voto. A votação de verdade ainda leva o clima do eleitor, o ruído da eleição e, no 2º turno, a oposição.',
      ],
    };
  }

  if (!election) return null;
  const rows: ElectoralRow[] = election.rounds.map((round) => ({
    label: election.rounds.length > 1 ? `Governo, ${round.round}º turno` : 'Governo',
    value: formatPercent(round.ufs[ufId], 1),
    reference: `Brasil ${formatPercent(round.national, 1)}`,
  }));
  const last = decidingRound(election);
  if (election.rounds.length > 1) {
    rows.push({
      label: 'Oposição, 2º turno',
      value: formatPercent(1 - last.ufs[ufId], 1),
      reference: `Brasil ${formatPercent(1 - last.national, 1)}`,
    });
  }
  const changed = election.governorChanges.includes(ufId);
  return {
    badge: `${BADGE_RESULT} · ${electionDate(election.monthIndex)}`,
    rows: [
      ...rows,
      {
        label: 'Governo do estado (eleição estadual)',
        value: changed ? 'trocou de dono' : 'manteve o campo',
      },
    ],
    notes: [
      `Resultado simulado da eleição geral de ${electionDate(election.monthIndex)}: a votação nacional sorteada foi distribuída pelas UFs a partir da aprovação de cada uma e fecha com o total. Os pesos são a população (provisório).`,
      'A troca do governo estadual é decidida à parte do voto presidencial.',
    ],
  };
}
