import { formatNumber, formatPercent, formatPointsDelta } from '@/components/ui/format';
import {
  alignmentView,
  CLIMATE_CAUSES,
  hasLean,
  populationShares,
  regionsOf,
  regionsView,
  type GameContent,
  type GameState,
  type RegionalPiece,
  type UfClimate,
  type UfExplanation,
  type UfState,
} from '@/engine';

/**
 * Indicadores do mapa de calor da mesa do Painel (GAME_DESIGN.md §4.5; ECONOMIC_MODEL.md §5.15). Funções puras:
 * valor por UF, faixa de cor, texto e a explicação "Por que esta UF está diferente da média?".
 */

export type MapIndicator =
  'crescimento' | 'desemprego' | 'aprovacao' | 'renda' | 'governador' | 'alinhamento' | 'chuva' | 'seca';

export interface MapIndicatorSpec {
  id: MapIndicator;
  label: string;
  /** `diverging`: comparação com a média nacional (cinza = na média). `sequential`: magnitude. */
  scale: 'diverging' | 'sequential';
  /** Subir é bom para o governo (azul) ou ruim (vermelho), nas escalas divergentes. */
  goodWhen: 'up' | 'down';
  /** Meia-largura da faixa central (cinza) e passo das faixas, na unidade do valor. */
  step: number;
  legend: string;
  /** Cores próprias da camada (as 5 faixas); sem elas valem `DIVERGING` ou `SEQUENTIAL`, conforme a escala. */
  palette?: readonly string[];
  /** Limites das 4 divisas das faixas de uma escala sequencial; sem eles valem os da renda relativa. */
  edges?: readonly number[];
}

/**
 * Cores da chuva: divergente marrom (mais seco que a normal) ↔ azul (mais chuvoso), cinza no meio. O marrom não se
 * confunde com o vermelho de "pior" das outras camadas, porque aqui nenhum lado é bom ou ruim em si (seca e cheia
 * pesam nos dois sentidos).
 */
export const RAIN_PALETTE = ['#a9632c', '#d9a26a', '#9a9893', '#86b6ef', '#3987e5'] as const;
/** Cores da seca: sequencial do cinza-escuro (sem seca) à palha clara (seca severa), a família do tom da seca no globo. */
export const DRYNESS_PALETTE = ['#3b3a34', '#6f5f33', '#a47f35', '#d3a63e', '#f2d27a'] as const;
/** Faixas da seca: sem (< 10%), leve, moderada, forte e severa (≥ 75%). */
export const DRYNESS_EDGES = [0.1, 0.25, 0.5, 0.75] as const;

export const MAP_INDICATORS: readonly MapIndicatorSpec[] = [
  {
    id: 'crescimento',
    label: 'Crescimento',
    scale: 'diverging',
    goodWhen: 'up',
    step: 0.002,
    legend: 'Crescimento em 12 meses comparado ao do Brasil',
  },
  {
    id: 'desemprego',
    label: 'Desemprego',
    scale: 'diverging',
    goodWhen: 'down',
    step: 0.01,
    legend: 'Desemprego comparado à taxa nacional',
  },
  {
    id: 'aprovacao',
    label: 'Aprovação',
    scale: 'diverging',
    goodWhen: 'up',
    step: 0.01,
    legend: 'Aprovação do governo comparada à nacional',
  },
  {
    id: 'renda',
    label: 'Renda',
    scale: 'sequential',
    goodWhen: 'up',
    step: 0.25,
    legend: 'PIB per capita (Brasil = 1)',
  },
  {
    id: 'governador',
    label: 'Governadores',
    scale: 'diverging',
    goodWhen: 'up',
    step: 10,
    legend: 'Relação do governador com o governo (−100 a 100)',
  },
  {
    id: 'alinhamento',
    label: 'Alinhamento',
    scale: 'diverging',
    goodWhen: 'up',
    step: 0.005,
    legend: 'Alinhamento do estado com o perfil do governo, em aprovação a mais ou a menos que a média (estimativa)',
  },
  {
    id: 'chuva',
    label: 'Chuva',
    scale: 'diverging',
    goodWhen: 'up',
    // Menos de 5% da normal é "normal"; a faixa forte começa em ±15%, onde o globo já desenha chuva forte (HEAVY_RAIN_FROM).
    step: 0.05,
    legend: 'Chuva do mês comparada à normal do estado (marrom = mais seco, azul = mais chuvoso)',
    palette: RAIN_PALETTE,
  },
  {
    id: 'seca',
    label: 'Seca',
    scale: 'sequential',
    goodWhen: 'down',
    step: 0.25,
    legend: 'Índice de seca: falta de água acumulada no solo e nos reservatórios (0 a 100%)',
    palette: DRYNESS_PALETTE,
    edges: DRYNESS_EDGES,
  },
];

/**
 * Camadas que o cenário permite: o Alinhamento precisa da inclinação política das UFs (cenários até a v0.7.0 não a
 * têm) e some da lista nesse caso.
 */
export function availableIndicators(content: GameContent): readonly MapIndicatorSpec[] {
  return hasLean(regionsOf(content)) ? MAP_INDICATORS : MAP_INDICATORS.filter((m) => m.id !== 'alinhamento');
}

/**
 * Cores das faixas, validadas para o fundo escuro do globo (skill dataviz): divergente vermelho ↔ azul com cinza
 * neutro no meio; sequencial de um só azul, do escuro (pouco) ao claro (muito), porque no fundo escuro o claro
 * é o que se destaca. A identidade nunca fica só na cor: o cartão e a lista mostram os números.
 */
export const DIVERGING = ['#e34948', '#ec9a8f', '#9a9893', '#86b6ef', '#3987e5'] as const;
export const SEQUENTIAL = ['#184f95', '#2a78d6', '#5598e7', '#9ec5f4', '#cde2fb'] as const;

export function indicatorSpec(id: MapIndicator): MapIndicatorSpec {
  const spec = MAP_INDICATORS.find((m) => m.id === id);
  if (!spec) throw new RangeError(`indicador desconhecido: ${id}`);
  return spec;
}

/**
 * Valor da UF no indicador (a comparação com a média já descontada nas escalas divergentes). `alignmentDeviation` é
 * o desvio de aprovação esperado pelo alinhamento (`alignmentView`), só usado na camada Alinhamento.
 */
export function ufValue(
  id: MapIndicator,
  uf: UfState,
  state: GameState,
  populationShare: number,
  alignmentDeviation = 0,
  climate?: Pick<UfClimate, 'rain' | 'dryness'>,
): number {
  switch (id) {
    case 'crescimento':
      return uf.growthGap12m;
    case 'desemprego':
      return uf.unemployment - state.indicators.unemployment;
    case 'aprovacao':
      return uf.approval - state.indicators.approval;
    case 'renda':
      return uf.share / populationShare;
    case 'governador':
      return uf.governorRelation;
    case 'alinhamento':
      return alignmentDeviation;
    case 'chuva':
      return climate?.rain ?? 0;
    case 'seca':
      return climate?.dryness ?? 0;
  }
}

const RENT_EDGES = [0.5, 0.75, 1, 1.5] as const;

/** Paleta das 5 faixas da camada. */
export function paletteOf(spec: MapIndicatorSpec): readonly string[] {
  return spec.palette ?? (spec.scale === 'sequential' ? SEQUENTIAL : DIVERGING);
}

/** Índice da faixa de cor (0 … 4). Divergente: 2 = na média; 0 e 4 = longe dela (vermelho = pior). */
export function bin(spec: MapIndicatorSpec, value: number): number {
  if (spec.scale === 'sequential') {
    // Renda relativa: < 0,5 | 0,5–0,75 | 0,75–1 | 1–1,5 | > 1,5 da média nacional (a seca traz as suas faixas)
    const edges = spec.edges ?? RENT_EDGES;
    return edges.filter((e) => value >= e).length;
  }
  const signed = spec.goodWhen === 'up' ? value : -value;
  if (Math.abs(signed) < spec.step) return 2;
  if (signed > 0) return signed < 3 * spec.step ? 3 : 4;
  return -signed < 3 * spec.step ? 1 : 0;
}

export function binColor(spec: MapIndicatorSpec, index: number): string {
  return paletteOf(spec)[index];
}

/** Rótulos das faixas da legenda, da primeira à última cor. */
export function legendLabels(spec: MapIndicatorSpec): string[] {
  if (spec.id === 'seca') return ['sem seca', 'leve', 'moderada', 'forte', 'severa'];
  if (spec.scale === 'sequential') return ['< 0,5', '0,5–0,75', '0,75–1', '1–1,5', '> 1,5'];
  const worse = spec.goodWhen === 'up' ? 'abaixo' : 'acima';
  const better = spec.goodWhen === 'up' ? 'acima' : 'abaixo';
  if (spec.id === 'governador') return ['hostil', 'distante', 'neutro', 'próximo', 'aliado'];
  if (spec.id === 'chuva') return ['bem mais seco', 'mais seco', 'normal', 'mais chuvoso', 'bem mais chuvoso'];
  if (spec.id === 'alinhamento') return ['bem distante', 'distante', 'na média', 'alinhado', 'bem alinhado'];
  return [`bem ${worse}`, worse, 'na média', better, `bem ${better}`];
}

/** Texto do valor na lista e no cartão. */
export function formatValue(id: MapIndicator, value: number): string {
  switch (id) {
    case 'crescimento':
    case 'desemprego':
    case 'aprovacao':
    case 'alinhamento':
      return formatPointsDelta(value);
    case 'renda':
      return formatNumber(value, 2);
    case 'governador':
      return `${value > 0 ? '+' : ''}${formatNumber(value, 0)}`;
    case 'chuva':
      // Percentual da normal do mês, com sinal: +25% = chove um quarto a mais que o normal.
      return `${value > 0 ? '+' : ''}${formatPercent(value, 0)}`;
    case 'seca':
      return formatPercent(value, 0);
  }
}

export interface UfRow {
  uf: UfState;
  name: string;
  region: string;
  populationShare: number;
  value: number;
  color: string;
}

/** Linhas do mapa e da lista (ordem do cenário), com o valor e a cor do indicador. */
export function mapRows(id: MapIndicator, state: GameState, content: GameContent): UfRow[] {
  const spec = indicatorSpec(id);
  const scenarioUfs = regionsOf(content);
  const pop = populationShares(scenarioUfs);
  // Só a camada Alinhamento precisa do perfil; sem inclinação no cenário o desvio é 0 (a camada nem é oferecida).
  const deviations = new Map<string, number>(
    id === 'alinhamento' ? (alignmentView(state, content)?.ufs ?? []).map((a) => [a.id, a.approvalDeviation]) : [],
  );
  const climate = new Map(state.climate.ufs.map((c) => [c.id, c]));
  return regionsView(state, content).map((uf, i) => {
    const value = ufValue(id, uf, state, pop[i], deviations.get(uf.id) ?? 0, climate.get(uf.id));
    return {
      uf,
      name: scenarioUfs[i].name,
      region: scenarioUfs[i].region,
      populationShare: pop[i],
      value,
      color: binColor(spec, bin(spec, value)),
    };
  });
}

/** Cor por sigla, para o globo. */
export function mapFills(rows: readonly UfRow[]): Record<string, string> {
  return Object.fromEntries(rows.map((r) => [r.uf.id, r.color]));
}

/** Quantas parcelas mostrar no cartão; o resto vira "Outras causas". */
export const MAX_PIECES = 5;
/** Parcelas menores que isto (0,05 p.p. ou 0,05%) não aparecem sozinhas: somem no arredondamento. */
export const MIN_SHOWN = 0.0005;

/**
 * Explicação da UF para o indicador escolhido, ordenada pelo tamanho, com as menores agrupadas em "Outras
 * causas" (a soma continua igual à diferença). Crescimento usa a atividade em relação à tendência; renda e
 * governador usam a explicação da atividade e da aprovação, respectivamente.
 */
export function explanationFor(id: MapIndicator, explanation: UfExplanation | undefined): RegionalPiece[] {
  if (!explanation) return [];
  const pieces =
    id === 'desemprego'
      ? explanation.unemployment
      : id === 'aprovacao' || id === 'governador' || id === 'alinhamento'
        ? explanation.approval
        : id === 'chuva'
          ? explanation.approval.filter((p) => p.cause === CLIMATE_CAUSES.rainMood)
          : id === 'seca'
            ? explanation.activity.filter((p) => p.cause === CLIMATE_CAUSES.drought)
            : explanation.activity;
  const sorted = [...pieces].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = sorted.slice(0, MAX_PIECES - 1).filter((p) => Math.abs(p.delta) >= MIN_SHOWN);
  const rest = sorted.slice(top.length).reduce((s, p) => s + p.delta, 0);
  // O resto vira uma linha só, e só aparece quando chega a 0,05 (p.p. ou %) depois de arredondado.
  return Math.abs(rest) >= MIN_SHOWN ? [...top, { cause: 'outras', label: 'Outras causas', delta: rest }] : top;
}

/** Texto de uma parcela: p.p. para desemprego e aprovação, % para a atividade. */
export function formatPiece(id: MapIndicator, delta: number): string {
  if (id === 'desemprego' || id === 'aprovacao' || id === 'governador' || id === 'alinhamento' || id === 'chuva') {
    return formatPointsDelta(delta);
  }
  return `${delta > 0 ? '+' : ''}${formatPercent(delta)}`;
}
