import { binColor, indicatorSpec, numericLegendLabels, type MapIndicator } from '@/components/painel/regionalMetrics';
import type { ElectionResult } from '@/engine';

import { NO_CLIMATE_OVERLAY, type ClimateOverlay } from './climateView';
import { badgeText } from './electoralView';
import type { MapMarker } from './markersView';

/**
 * Modelo de dados do mapa regional, independente do renderizador (PLANO_GLOBO.md §3.4): o globo 3D (`GlobeView`) e o
 * mapa 2D (`FlatBrazilMap`) recebem o mesmo `RegionalMapViewModel`. Aqui só se compõe o que `regionalMetrics` já
 * produz (cores por UF, faixas e rótulos da legenda); nenhuma regra de cor mora neste módulo.
 */

/**
 * `indicator`: mapa de calor de um indicador do jogo. `preview`: prévia de uma decisão (ex.: o efeito de uma política
 * por UF, no Gabinete), com legenda própria.
 */
export type MapMode = 'indicator' | 'preview';

export interface MapLegendEntry {
  color: string;
  label: string;
}

export interface MapLegend {
  title: string;
  entries: readonly MapLegendEntry[];
  /** Selo da camada eleitoral ("estimativa", "resultado · out/2030"…); ausente nas demais. */
  badge?: string;
}

/** Texto fixo sobre uma UF (sigla, capital…). Reservado para os PRs de camadas; hoje sempre vazio. */
export interface MapLabel {
  sigla: string;
  text: string;
}

export interface RegionalMapViewModel {
  mode: MapMode;
  /** Cor de cada UF (sigla → hex). Vazio: o renderizador usa a cor neutra de terra. */
  fills: Readonly<Record<string, string>>;
  selectedId: string | null;
  descriptions?: Readonly<Record<string, string>>;
  legend: MapLegend | null;
  labels: readonly MapLabel[];
  /** Marcadores de eventos e notícias, um por UF (`markersView`); vazio sem partida ou sem evento com local. */
  markers: readonly MapMarker[];
  /**
   * Clima no mapa 2D completo: UFs hachuradas e ícones de nuvem (PLANO_GLOBO.md §3.4). O globo 3D não lê este campo
   * (ele recebe a textura de clima); o 2D leve o ignora.
   */
  climate: ClimateOverlay;
}

export interface RegionalMapViewModelInput {
  /** Indicador do mapa de calor; `null` = Satélite (sem mapa de calor). */
  indicator?: MapIndicator | null;
  /** Cores por sigla, como `mapFills` devolve; `null` quando não há mapa de calor. */
  fills?: Readonly<Record<string, string>> | null;
  selectedId?: string | null;
  mode?: MapMode;
  /** Legenda própria (prévia); no modo `indicator` a legenda sai do indicador. */
  legend?: MapLegend | null;
  labels?: readonly MapLabel[];
  markers?: readonly MapMarker[];
  climate?: ClimateOverlay;
  /** Última fotografia da eleição geral: dá a data ao selo da camada Resultado. */
  election?: ElectionResult | null;
}

const NO_FILLS: Readonly<Record<string, string>> = Object.freeze({});
const NONE: readonly never[] = Object.freeze([]);

/**
 * Legenda do indicador: título e as cinco faixas (cor + rótulo), as mesmas do cartão de camadas. As camadas do mapa
 * eleitoral levam o selo ("estimativa", "resultado · out/2030").
 */
export function indicatorLegend(id: MapIndicator, election: ElectionResult | null = null): MapLegend {
  const spec = indicatorSpec(id);
  const badge = badgeText(id, election);
  return {
    title: spec.legend,
    entries: numericLegendLabels(spec).map((label, i) => ({ color: binColor(spec, i), label })),
    ...(badge ? { badge } : {}),
  };
}

/** Monta o modelo do mapa. Sem indicador e sem cores (Satélite) a legenda é `null` e os preenchimentos, vazios. */
export function buildRegionalMapViewModel(input: RegionalMapViewModelInput = {}): RegionalMapViewModel {
  const {
    indicator = null,
    fills = null,
    selectedId = null,
    mode = 'indicator',
    legend,
    labels,
    markers,
    climate,
    election = null,
  } = input;
  const derived = mode === 'indicator' && indicator && fills ? indicatorLegend(indicator, election) : null;
  return {
    mode,
    fills: fills ?? NO_FILLS,
    selectedId,
    legend: legend === undefined ? derived : legend,
    labels: labels ?? NONE,
    markers: markers ?? NONE,
    climate: climate ?? NO_CLIMATE_OVERLAY,
  };
}
