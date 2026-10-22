import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type { GlobeApi, GlobeQuality, GlobeViewProps } from '@/globe/GlobeView';
import { labelScale, type LabelViewport, type Rect } from '@/globe/labels';
import { deviceUtc } from '@/globe/deviceClock';
import type { ClimateMapData } from '@/globe/climateTexture';
import type { ProfileRenderer } from '@/globe/qualityProfiles';
import { computeSun, type SkyInput, type SunState } from '@/globe/visualClock';
import { useGame } from '@/store';

import { FlatBrazilMap } from './FlatBrazilMap';
import { markerPulseKey, type MapMarker } from './markersView';
import type { RegionalMapViewModel } from './regionalMapViewModel';

/**
 * Superfície do mapa regional (PLANO_GLOBO.md §3.4): escolhe entre o globo 3D e o mapa 2D com o mesmo modelo. Se o
 * globo falhar (WebGL que não inicia), cai para o mapa 2D e avisa por `onGlobeFailure`.
 */

/** `globe`: 3D. `flat`: mapa 2D completo (siglas). `flat-light`: 2D leve (só polígonos e seleção). */
export type MapRenderer = ProfileRenderer;

export interface MapSurfaceProps {
  renderer: MapRenderer;
  viewModel: RegionalMapViewModel;
  /** Toque numa UF (sigla) ou no fundo/oceano (`null`). */
  onSelect: (sigla: string | null) => void;
  /**
   * Toque num marcador de eventos e notícias (`viewModel.markers`): o globo e o mapa 2D chamam o mesmo tratador. O 2D
   * leve não desenha marcadores (eles seguem nos Alertas e nas Notícias).
   */
  onMarkerPress?: (marker: MapMarker) => void;
  /** Comandos de câmera; no 2D os comandos não fazem nada (o mapa já mostra o Brasil inteiro). */
  onReady?: (api: GlobeApi) => void;
  /** Pausa o desenho do globo (a tela perdeu o foco). No 2D não há laço de quadros, então não muda nada. */
  paused?: boolean;
  /** O globo lançou erro ao iniciar ou desenhar; a superfície já está mostrando o mapa 2D. */
  onGlobeFailure?: (error: Error) => void;
  /** Áreas do HUD (px da superfície) onde nenhuma sigla ou capital pode tocar: botões, doca, barra do topo. */
  reservedRects?: readonly Rect[];
  /** Faixas onde um rótulo não cabe por inteiro (área segura + barras do HUD). */
  labelInsets?: LabelViewport['insets'];
  /** Perfil de qualidade do globo (tetos e ajuste automático); sem efeito no mapa 2D. */
  quality?: GlobeQuality;
  /**
   * Dia e noite (hora escolhida + mês do calendário do jogo): o globo ilumina e acende as luzes; o mapa 2D completo
   * desenha a sombra do terminador e as luzes; o 2D leve não mostra nada. Padrão do globo: tarde, janeiro.
   */
  sky?: SkyInput;
  /** Clima do mês para o globo (seca nos tiles e nuvens). O mapa 2D usa `viewModel.climate`. */
  climate?: ClimateMapData | null;
  /** "Nuvens" de Configurações: no globo liga a malha das nuvens (o perfil ainda manda); o 2D esconde os ícones via `viewModel`. */
  clouds?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Parâmetros de rótulo comuns ao globo e ao mapa 2D. */
type LabelProps = { reservedRects?: readonly Rect[]; labelInsets?: LabelViewport['insets']; labelScale: number };

/** API de câmera do mapa 2D: não há câmera para mover. */
export const FLAT_MAP_API: GlobeApi = { flyToUf: () => undefined, reset: () => undefined };

/** Entrega a API vazia a quem usa a mesma `onReady` do globo. */
function FlatMap({
  viewModel,
  onSelect,
  onMarkerPress,
  onReady,
  light,
  sun,
  style,
  labels,
}: {
  viewModel: RegionalMapViewModel;
  onSelect: (sigla: string | null) => void;
  onMarkerPress?: (marker: MapMarker) => void;
  onReady?: (api: GlobeApi) => void;
  light: boolean;
  sun: SunState | null;
  style?: StyleProp<ViewStyle>;
  labels: LabelProps;
}) {
  useEffect(() => {
    onReady?.(FLAT_MAP_API);
    // só na montagem: a API não depende de nada
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <FlatBrazilMap
      viewModel={viewModel}
      onSelect={onSelect}
      onMarkerPress={onMarkerPress}
      variant={light ? 'light' : 'full'}
      reservedRects={labels.reservedRects}
      labelInsets={labels.labelInsets}
      labelScale={labels.labelScale}
      sun={sun}
      style={style}
    />
  );
}

interface BoundaryProps {
  onFailure?: (error: Error) => void;
  fallback: ReactNode;
  children: ReactNode;
}

/** Captura erros do globo (criação do contexto WebGL, shaders…) e mostra o mapa 2D no lugar. */
class GlobeBoundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onFailure?.(error);
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Carrega o globo só quando ele é desenhado: o `require` em linha adia a avaliação de three/R3F até o primeiro
 * render do globo, então quem usa o mapa 2D nunca paga por elas na abertura. Se o módulo não carregar, o erro sai
 * daqui no render e o `GlobeBoundary` troca pelo mapa 2D.
 */
function LazyGlobe(props: GlobeViewProps) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GlobeView } = require('@/globe/GlobeView') as typeof import('@/globe/GlobeView');
  return <GlobeView {...props} />;
}

export function MapSurface({
  renderer,
  viewModel,
  onSelect,
  onMarkerPress,
  onReady,
  paused,
  onGlobeFailure,
  reservedRects,
  labelInsets,
  quality,
  sky,
  climate,
  clouds,
  style,
}: MapSurfaceProps) {
  const [graphicsFailed, setGraphicsFailed] = useState(false);
  const reduceMotion = useGame((s) => s.reduceMotion);
  // O mesmo ajuste de texto do aplicativo vale para as siglas do globo e do mapa 2D.
  const scale = labelScale(useGame((s) => s.textScale));
  const labels: LabelProps = { reservedRects, labelInsets, labelScale: scale };
  // O mapa 2D não tem laço de quadros: o Sol é recalculado ao renderizar (na "Hora real", lê o relógio aqui; a sombra
  // fica em cache enquanto a hora não muda). O 2D leve nem recebe o Sol.
  const flatSun =
    sky && renderer !== 'flat-light'
      ? computeSun(sky.setting.mode === 'real' ? { ...sky, utc: deviceUtc() } : sky)
      : null;
  const flat = (light: boolean) => (
    <FlatMap
      viewModel={viewModel}
      onSelect={onSelect}
      onMarkerPress={onMarkerPress}
      onReady={onReady}
      light={light}
      sun={flatSun}
      style={style}
      labels={labels}
    />
  );
  if (renderer !== 'globe' || graphicsFailed) return flat(renderer === 'flat-light');
  // O globo devolve a sigla da UF do marcador tocado; o modelo tem um marcador por UF.
  const markerPressed = (sigla: string) => {
    const marker = viewModel.markers.find((m) => m.sigla === sigla);
    if (marker) onMarkerPress?.(marker);
  };
  return (
    <GlobeBoundary onFailure={onGlobeFailure} fallback={flat(false)}>
      <LazyGlobe
        fills={viewModel.fills}
        selectedId={viewModel.selectedId}
        onSelect={onSelect}
        onReady={onReady}
        paused={paused}
        reservedRects={reservedRects}
        labelInsets={labelInsets}
        labelScale={scale}
        quality={quality}
        sky={sky}
        climate={climate}
        clouds={clouds}
        markers={viewModel.markers}
        pulseKey={markerPulseKey(viewModel.markers)}
        reduceMotion={reduceMotion}
        onGlFailure={(reason, detail) => {
          setGraphicsFailed(true);
          onGlobeFailure?.(new Error(`Falha gráfica: ${reason}${detail ? ` (${detail})` : ''}`));
        }}
        onMarkerPress={markerPressed}
      />
    </GlobeBoundary>
  );
}
