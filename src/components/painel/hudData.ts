import { governmentSupport, groupCounts } from '@/components/congress/hemicycle';
import { monthLabel } from '@/components/campaign/labels';
import { mapFills, mapRows, type MapIndicator } from './regionalMetrics';
import {
  deltaSentiment,
  formatMoneyMillions,
  formatNumber,
  formatPercent,
  formatPointsDelta,
  type Sentiment,
} from '@/components/ui/format';
import { campaignMonths } from '@/content';
import {
  blocRelation,
  currentNominalGdpMillions,
  indicatorsFromScenario,
  ministryOccupant,
  regionsOf,
  regionsView,
  REGION_NAMES,
  TECHNICAL_OCCUPANT,
  type GameContent,
  type GameState,
  type Indicators,
  type SocietySectorId,
  type SocietyState,
} from '@/engine';
import type { IndicatorPoint } from '@/database/campaignRepository';
import { draftPoints } from '@/store/agendaDraft';
import type { AgendaDraft } from '@/store/agendaDraft';
import type { ActiveCampaign } from '@/store/gameStore';

/**
 * Dados do Painel (HUD estilo mesa de jogo): funções puras que transformam a partida em tudo o que a tela
 * mostra — barras do topo, ministérios, alertas, Congresso, indicadores setoriais, regiões, meta e a série do
 * PIB. Sem partida em andamento, `hudFromScenario` monta a mesma tela com os dados do cenário e a marca
 * `demo: true` (a tela exibe o selo de demonstração; nada aqui inventa números que pareçam da partida).
 */

export type HudTone = 'positive' | 'neutral' | 'warning' | 'negative';

export type HudStatId = 'mes' | 'capital' | 'aprovacao' | 'pib' | 'populacao' | 'inflacao' | 'desemprego';

export interface HudStat {
  id: HudStatId;
  label: string;
  value: string;
  /** Variação em relação ao mês anterior, já formatada (ex.: "+4,0 p.p."). */
  delta?: string;
  sentiment: Sentiment;
  /** Preenchimento da barrinha (0–1), quando o número tem leitura de nível. */
  progress?: number;
  /** Tom da barrinha (o delta tem cor própria). */
  tone: HudTone;
  /** Texto de contexto (ex.: "meta 3,0%"). */
  context?: string;
}

export interface HudMinistry {
  id: string;
  name: string;
  areas: readonly string[];
  /** Nome do ocupante para exibição (`Quadro técnico` ou o nome do bloco). */
  occupant: string;
  status: string;
  tone: HudTone;
  /** Relação com o bloco que ocupa a pasta (−100…100); `null` para quadro técnico. */
  relation: number | null;
}

export interface HudAlert {
  id: string;
  title: string;
  body: string;
  tag: string | null;
  tone: HudTone;
}

export interface HudSector {
  id: SocietySectorId;
  label: string;
  /** Crescimento do mês (fração). */
  growth: number;
  /** Participação no produto nacional (0–1). */
  share: number;
}

export interface HudRegion {
  id: string;
  name: string;
  /** Participação no PIB, já formatada. */
  value: string;
  /** Fração da maior região, para a barra (0–1). */
  level: number;
  color: string;
}

export interface HudCongress {
  left: number;
  center: number;
  right: number;
  total: number;
  /** Índice de apoio ao governo (0–1); `null` sem partida. */
  support: number | null;
}

export interface HudGoalCheck {
  label: string;
  value: string;
  met: boolean;
}

export interface HudGoal {
  summary: string;
  checks: HudGoalCheck[];
}

export interface HudSeriesPoint {
  monthIndex: number;
  /** PIB em 12 meses (fração). */
  value: number;
}

export interface HudData {
  /** `true` sem partida em andamento: a tela mostra o selo de demonstração. */
  demo: boolean;
  monthLabel: string;
  turn: number;
  turnTotal: number;
  /** Pontos de agenda ainda livres neste mês. */
  pointsLeft: number;
  /** Eventos aguardando resposta (selo do sino). */
  pendingCount: number;
  stats: readonly HudStat[];
  ministries: readonly HudMinistry[];
  alerts: readonly HudAlert[];
  congress: HudCongress;
  sectors: readonly HudSector[];
  regions: readonly HudRegion[];
  goal: HudGoal;
  series: readonly HudSeriesPoint[];
  /** Cores por UF do mapa de calor do globo (a camada escolhida no Painel); `null` sem partida ou sem camada. */
  fills: Readonly<Record<string, string>> | null;
}

/** Meta de inflação (GAME_DESIGN.md §8.1) e banda de tolerância de 1,5 p.p. */
const INFLATION_TARGET = 0.03;
const INFLATION_BAND = 0.015;
/** Cores das grandes regiões na Visão Regional (identidade fixa, legível no fundo escuro). */
const REGION_COLORS: Readonly<Record<string, string>> = {
  norte: '#5fd38d',
  nordeste: '#ffb547',
  centro_oeste: '#7cb7ff',
  sudeste: '#ffe27a',
  sul: '#6fd3c7',
};

/** Setores mostrados nos Indicadores Nacionais, na ordem da referência do painel. */
const SHOWN_SECTORS: readonly SocietySectorId[] = ['energia', 'agropecuaria', 'industria', 'servicos'];

const SECTOR_LABELS: Readonly<Record<SocietySectorId, string>> = {
  agropecuaria: 'Agropecuária',
  extrativa: 'Extrativa',
  industria: 'Indústria',
  construcao: 'Construção',
  energia: 'Energia',
  servicos: 'Serviços',
};

/** Crescimento/participação de demonstração, para a tela sem partida (a faixa de demo cobre o selo). */
const DEMO_SECTORS: Readonly<Record<SocietySectorId, { growth: number; share: number }>> = {
  energia: { growth: 0.0015, share: 0.04 },
  agropecuaria: { growth: 0.0038, share: 0.07 },
  industria: { growth: 0.0021, share: 0.13 },
  servicos: { growth: 0.0012, share: 0.58 },
  extrativa: { growth: 0.001, share: 0.03 },
  construcao: { growth: 0.001, share: 0.08 },
};

/** Série de demonstração do PIB 12 meses (primeiros meses fictícios; o selo de demo cobre). */
const DEMO_SERIES: readonly HudSeriesPoint[] = [
  { monthIndex: 0, value: 0.018 },
  { monthIndex: 1, value: 0.019 },
  { monthIndex: 2, value: 0.0195 },
  { monthIndex: 3, value: 0.021 },
  { monthIndex: 4, value: 0.0205 },
  { monthIndex: 5, value: 0.022 },
];

const GOOD_WHEN = { approval: 'up', inflation: 'down', unemployment: 'down', gdp: 'up' } as const;

/** Relação bloco–governo → rótulo (POLITICAL_RULES.md §6.1: −100…100), como no cartão do estado. */
const RELATION_LABELS: readonly [number, string][] = [
  [40, 'Aliado'],
  [10, 'Próximo'],
  [-10, 'Neutro'],
  [-40, 'Distante'],
];

function relationLabel(relation: number): string {
  return RELATION_LABELS.find(([min]) => relation >= min)?.[1] ?? 'Hostil';
}

function relationTone(relation: number): HudTone {
  if (relation >= 10) return 'positive';
  if (relation >= -10) return 'neutral';
  if (relation >= -40) return 'warning';
  return 'negative';
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** 0.021, 1 → "+2,1%" */
function signedPercent(fraction: number, decimals = 1): string {
  if (!Number.isFinite(fraction)) return '—';
  const rounded = Number((fraction * 100).toFixed(decimals));
  const sign = rounded > 0 ? '+' : rounded < 0 ? '' : '±';
  return `${sign}${formatNumber(rounded, decimals)}%`;
}

interface StatInput {
  indicators: Indicators;
  previous?: Indicators;
  /** Capital político 0–100. */
  politicalCapital: number;
  /** PIB nominal anual em R$ milhões. */
  nominalGdp: number;
  /** População em milhares de pessoas. */
  populationThousands: number;
  /** UFs do cenário (contexto de população). */
  ufCount: number;
  monthIndex: number;
  turnTotal: number;
}

function buildStats(input: StatInput): HudStat[] {
  const { indicators: i, previous: p } = input;
  /** Delta em relação ao mês anterior, quando existe. */
  const delta = (key: keyof Indicators, goodWhen: 'up' | 'down', decimals: number) => {
    if (!p) return { delta: undefined, sentiment: 'neutral' as Sentiment };
    const d = i[key] - p[key];
    return { delta: formatPointsDelta(d, decimals), sentiment: deltaSentiment(d, goodWhen).sentiment };
  };

  const approval = delta('approval', GOOD_WHEN.approval, 0);
  const inflation = delta('inflation12m', GOOD_WHEN.inflation, 1);
  const unemployment = delta('unemployment', GOOD_WHEN.unemployment, 1);
  const gdp = delta('gdpGrowth12m', GOOD_WHEN.gdp, 1);

  return [
    {
      id: 'mes',
      label: 'Mês',
      value: monthLabel(input.monthIndex),
      context: `Turno ${input.monthIndex + 1} de ${input.turnTotal}`,
      sentiment: 'neutral',
      tone: 'neutral',
    },
    {
      id: 'capital',
      label: 'Capital político',
      value: formatNumber(input.politicalCapital, 0),
      context: 'de 100',
      sentiment: 'neutral',
      progress: clamp01(input.politicalCapital / 100),
      tone: input.politicalCapital >= 60 ? 'positive' : input.politicalCapital >= 35 ? 'warning' : 'negative',
    },
    {
      id: 'aprovacao',
      label: 'Aprovação popular',
      value: formatPercent(i.approval, 0),
      ...approval,
      progress: clamp01(i.approval),
      tone: i.approval >= 0.5 ? 'positive' : i.approval >= 0.35 ? 'warning' : 'negative',
    },
    {
      id: 'pib',
      label: 'PIB',
      value: formatMoneyMillions(input.nominalGdp),
      delta: signedPercent(i.gdpGrowth12m),
      sentiment: gdp.sentiment === 'neutral' ? 'neutral' : gdp.sentiment,
      progress: clamp01(i.gdpGrowth12m / 0.06),
      tone: i.gdpGrowth12m >= 0.015 ? 'positive' : i.gdpGrowth12m > 0 ? 'warning' : 'negative',
      context: 'em 12 meses',
    },
    {
      id: 'populacao',
      label: 'População',
      value: `${formatNumber(input.populationThousands / 1000, 1)} milhões`,
      context: `${input.ufCount} unidades da Federação`,
      sentiment: 'neutral',
      tone: 'neutral',
    },
    {
      id: 'inflacao',
      label: 'Inflação',
      value: formatPercent(i.inflation12m, 1),
      ...inflation,
      tone:
        i.inflation12m <= INFLATION_TARGET
          ? 'positive'
          : i.inflation12m <= INFLATION_TARGET + INFLATION_BAND
            ? 'warning'
            : 'negative',
      context: 'meta 3,0%',
    },
    {
      id: 'desemprego',
      label: 'Desemprego',
      value: formatPercent(i.unemployment, 1),
      ...unemployment,
      tone: i.unemployment <= 0.06 ? 'positive' : i.unemployment <= 0.09 ? 'warning' : 'negative',
    },
  ];
}

function buildMinistries(state: GameState | null, content: GameContent): HudMinistry[] {
  const ministries = content.scenario.institutions?.ministries ?? [];
  return ministries.map((m) => {
    const occupant = state ? ministryOccupant(state, m) : m.occupant;
    if (occupant === TECHNICAL_OCCUPANT) {
      return {
        id: m.id,
        name: m.name,
        areas: m.areas,
        occupant: 'Quadro técnico',
        status: 'Sem indicação partidária',
        tone: 'neutral' as HudTone,
        relation: null,
      };
    }
    const bloc = content.scenario.blocs.find((b) => b.id === occupant);
    const relation = state && bloc ? blocRelation(state, bloc) : 0;
    return {
      id: m.id,
      name: m.name,
      areas: m.areas,
      occupant: bloc?.name ?? occupant,
      status: relationLabel(relation),
      tone: relationTone(relation),
      relation,
    };
  });
}

function buildAlerts(state: GameState, content: GameContent): HudAlert[] {
  const eventsById = new Map(content.events.map((e) => [e.id, e]));
  return state.events.pending.flatMap((pending) => {
    const event = eventsById.get(pending.eventId);
    if (!event) return [];
    // Urgência pela resposta mais caras entre as escolhas (GAME_DESIGN.md §4.3: evento crítico custa até 2).
    const maxCost = Math.max(...event.choices.map((c) => c.agendaCost));
    return [
      {
        id: pending.eventId,
        title: event.title,
        body: event.description,
        tag: maxCost >= 2 ? 'URGENTE' : maxCost === 1 ? 'ATENÇÃO' : null,
        tone: (maxCost >= 2 ? 'negative' : maxCost === 1 ? 'warning' : 'neutral') as HudTone,
      },
    ];
  });
}

function buildCongress(content: GameContent, state: GameState | null): HudCongress {
  const blocs = content.scenario.blocs;
  const counts = groupCounts(blocs);
  const total = counts.esquerda + counts.centro + counts.direita;
  const support = state ? governmentSupport(blocs, (b) => blocRelation(state, b)) : null;
  return { left: counts.esquerda, center: counts.centro, right: counts.direita, total, support };
}

function buildSectors(society: SocietyState | null): HudSector[] {
  return SHOWN_SECTORS.map((id) => {
    const sector = society?.sectors.find((s) => s.id === id);
    return {
      id,
      label: SECTOR_LABELS[id],
      growth: sector?.growth ?? DEMO_SECTORS[id].growth,
      share: sector?.share ?? DEMO_SECTORS[id].share,
    };
  });
}

function buildRegions(content: GameContent, shares: readonly number[] | null): HudRegion[] {
  const ufs = regionsOf(content);
  const shareOf = (i: number) => shares?.[i] ?? ufs[i].gdpShare;
  const byRegion = Object.keys(REGION_NAMES).map((id) => ({
    id,
    name: REGION_NAMES[id],
    share: ufs.reduce((n, uf, i) => (uf.region === id ? n + shareOf(i) : n), 0),
  }));
  const max = Math.max(...byRegion.map((r) => r.share), Number.EPSILON);
  return byRegion.map((r) => ({
    id: r.id,
    name: r.name,
    value: formatPercent(r.share, 1),
    level: r.share / max,
    color: REGION_COLORS[r.id] ?? '#9aa894',
  }));
}

/** Primário cumprido no limite inferior da banda, como no motor (LC 200/2023; `fiscal.ts`). */
function buildGoal(indicators: Indicators, c: GameContent['calibration']): HudGoal {
  return {
    summary: 'Inflação na meta e contas públicas em ordem',
    checks: [
      {
        label: 'Inflação em 12 meses',
        value: formatPercent(indicators.inflation12m, 1),
        met: indicators.inflation12m <= INFLATION_TARGET + INFLATION_BAND,
      },
      {
        label: 'Resultado primário',
        value: formatPercent(indicators.primaryBalance12m, 2),
        met: indicators.primaryBalance12m >= c.meta_primario - c.banda_meta_primario,
      },
    ],
  };
}

function buildSeries(history: readonly IndicatorPoint[] | null): HudSeriesPoint[] {
  if (!history) return [];
  return history.map((point) => ({ monthIndex: point.monthIndex, value: point.indicators.gdpGrowth12m }));
}

/**
 * Tela do Painel com a partida em andamento (GAME_DESIGN.md §4.2–§4.5). `mapIndicator` escolhe a camada do
 * mapa de calor do globo; `null` (padrão) deixa só a imagem de satélite.
 */
export function hudFromCampaign(
  campaign: ActiveCampaign,
  content: GameContent,
  draft: AgendaDraft,
  history: readonly IndicatorPoint[] | null,
  mapIndicator: MapIndicator | null = null,
): HudData {
  const state = campaign.state;
  const ufs = regionsOf(content);
  const ufStates = regionsView(state, content);
  return {
    demo: false,
    monthLabel: monthLabel(state.monthIndex),
    turn: state.monthIndex + 1,
    turnTotal: campaignMonths(state.scenarioId),
    pointsLeft: state.resources.agendaPointsPerMonth - draftPoints(draft, content),
    pendingCount: state.events.pending.length,
    stats: buildStats({
      indicators: state.indicators,
      previous: campaign.previous,
      politicalCapital: state.resources.politicalCapital,
      nominalGdp: currentNominalGdpMillions(state, content),
      populationThousands: ufs.reduce((n, uf) => n + uf.population, 0),
      ufCount: ufs.length,
      monthIndex: state.monthIndex,
      turnTotal: campaignMonths(state.scenarioId),
    }),
    ministries: buildMinistries(state, content),
    alerts: buildAlerts(state, content),
    congress: buildCongress(content, state),
    sectors: buildSectors(state.society),
    regions: buildRegions(content, ufStates.length > 0 ? ufStates.map((uf) => uf.share) : null),
    goal: buildGoal(state.indicators, content.calibration),
    series: buildSeries(history),
    fills: mapIndicator && content.scenario.regions ? mapFills(mapRows(mapIndicator, state, content)) : null,
  };
}

/** Tela do Painel sem partida em andamento: dados do cenário + valores de demonstração com o selo visível. */
export function hudFromScenario(content: GameContent): HudData {
  const indicators = indicatorsFromScenario(content.scenario);
  const ufs = regionsOf(content);
  const turnTotal = campaignMonths(content.scenario.id);
  return {
    demo: true,
    monthLabel: monthLabel(0),
    turn: 1,
    turnTotal,
    pointsLeft: 3,
    pendingCount: 0,
    stats: buildStats({
      indicators,
      politicalCapital: 62,
      nominalGdp: content.scenario.economy?.nominalGdpMillions.value ?? 11_400_000,
      populationThousands: ufs.reduce((n, uf) => n + uf.population, 0),
      ufCount: ufs.length,
      monthIndex: 0,
      turnTotal,
    }),
    ministries: buildMinistries(null, content),
    alerts: [],
    congress: buildCongress(content, null),
    sectors: buildSectors(null),
    regions: buildRegions(content, null),
    goal: buildGoal(indicators, content.calibration),
    series: DEMO_SERIES,
    fills: null,
  };
}
