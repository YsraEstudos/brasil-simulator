import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackHandler, Image, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SymbolViewProps } from 'expo-symbols';

import { DIFFICULTY, INDICATOR_META, INDICATOR_ORDER } from '@/components/campaign/labels';
import { CareerPollCard } from '@/components/campaign/CareerPollCard';
import { CareerDebtCard, CareerFinanceCard } from '@/components/campaign/CareerFinanceCard';
import { careerPollViewModel } from '@/components/campaign/careerPollView';
import { ElectionsCard } from '@/components/campaign/ElectionsCard';
import { EventInbox } from '@/components/campaign/EventInbox';
import {
  canChooseEvent,
  canToggleDecision,
  characterBriefs,
  inboxCount,
  pendingItems,
  sanctionChoices,
  sanctionItems,
} from '@/components/campaign/inboxModel';
import { MonthSummary } from '@/components/campaign/MonthSummary';
import { WhyChanged } from '@/components/campaign/WhyChanged';
import { Alert, Indicator, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import type { IndicatorPoint } from '@/database/campaignRepository';
import {
  indicatorsFromScenario,
  initialRegions,
  isPreInauguration,
  SANCTION_ACTION_ID,
  toCalendar,
  turnIndexOf,
  type Decision,
  type ElectionResult,
  type IndicatorKey,
} from '@/engine';
import { resultLayerHint } from '@/components/map/electoralView';
import { buildClimateMapData, buildClimateOverlay } from '@/components/map/climateView';
import { endMarkerPulse } from '@/components/map/markerSession';
import { nextMarkerItem, opensStateCard, type MapMarker } from '@/components/map/markersView';
import { buildRegionalMapViewModel } from '@/components/map/regionalMapViewModel';
import { useMapMarkers } from '@/components/map/useMapMarkers';
import { MapSurface } from '@/components/map/MapSurface';
import type { GlobeApi } from '@/globe/GlobeView';
import type { Profile3d } from '@/globe/qualityProfiles';
import { draftCost, gameStore, planMapQuality, useGame, type RegionalPoint } from '@/store';
import { ForceHudTheme } from '@/theme/ThemeProvider';

import { GdpChart } from './GdpChart';
import {
  BellButton,
  DemoBadge,
  DockButton,
  EmptyNote,
  EndMonthButton,
  GoalCheckRow,
  MapLayerLegend,
  MapLayerRow,
  MenuRow,
  MinistryRow,
  RegionRow,
  RoundButton,
  SectorTile,
  SheetHeading,
  StatCell,
} from './HudBits';
import { hudFromCampaign, hudFromScenario, type HudStatId } from './hudData';
import {
  DEMO_BADGE_BAND,
  DOCK_HEIGHT_COMPACT,
  DOCK_HEIGHT_PORTRAIT,
  painelLabelReserve,
  TOP_INSET,
} from './hudReserved';
import { Hud } from './hudTheme';
import { InfoSheet } from './InfoSheet';
import {
  congressBadge,
  electionsRelevant,
  endMonthControl,
  endMonthOutcome,
  leftRail,
  newsBadge,
  RIGHT_RAIL,
  type RailSheetId,
} from './mesaNav';
import { ProfileSheet } from './ProfileSheet';
import { availableIndicators, indicatorSpec, layerBadge, mapRows, type MapIndicator } from './regionalMetrics';
import { UfDetail } from './StateDetail';
import { ReadingList } from './MapReadingPanel';
import { DIMMED_UF, rankUfs, ufDescription } from './mapReading';

const logo = require('../../../assets/images/logo-brasil.png');

/** Referência estável para "sem série regional ainda" (evita refazer o cartão a cada render). */
const EMPTY_REGIONAL: readonly RegionalPoint[] = [];

/** Título do grupo de camadas do mapa eleitoral na folha Camadas (PLANO_GLOBO.md §5.3). */
const ELECTORAL_GROUP_TITLE = 'Mapa eleitoral';

/** Segunda linha do topo (retrato), abaixo dos quatro principais; a base do Painel fica para a doca. */
const SECOND_ROW_STATS: readonly HudStatId[] = ['capital', 'inflacao', 'desemprego'];

/** Subtelas que a doca abre (rotas do grupo `(jogo)`). */
type DockRoute = '/gabinete' | '/congresso' | '/economia' | '/noticias';
/** Rotas que a mesa abre com `router.push`: as da doca e o legado, que o botão dourado abre com a campanha encerrada. */
type GameRoute = DockRoute | '/legado';

const DOCK: readonly { route: DockRoute; icon: SymbolViewProps['name']; label: string }[] = [
  { route: '/gabinete', icon: { ios: 'building.2.fill', android: 'domain', web: 'domain' }, label: 'Gabinete' },
  { route: '/congresso', icon: { ios: 'person.3.fill', android: 'groups', web: 'groups' }, label: 'Congresso' },
  {
    route: '/economia',
    icon: { ios: 'dollarsign.circle.fill', android: 'attach_money', web: 'attach_money' },
    label: 'Economia',
  },
  { route: '/noticias', icon: { ios: 'newspaper.fill', android: 'newspaper', web: 'newspaper' }, label: 'Notícias' },
];

/** Ícones dos botões de trilho (os ids e rótulos vêm de `mesaNav`). */
const RAIL_ICONS: Readonly<Record<RailSheetId, SymbolViewProps['name']>> = {
  alertas: { ios: 'bell.fill', android: 'notifications', web: 'notifications' },
  meta: { ios: 'flag.fill', android: 'flag', web: 'flag' },
  relatorio: { ios: 'doc.text.fill', android: 'description', web: 'description' },
  eleicoes: { ios: 'checkmark.rectangle.portrait.fill', android: 'how_to_vote', web: 'how_to_vote' },
  camadas: { ios: 'square.3.layers.3d', android: 'layers', web: 'layers' },
  regioes: { ios: 'map.fill', android: 'map', web: 'map' },
  indicadores: { ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' },
  ministerios: { ios: 'building.columns.fill', android: 'account_balance', web: 'account_balance' },
  perfil: { ios: 'slider.horizontal.3', android: 'tune', web: 'tune' },
};

const END_MONTH_ICON: SymbolViewProps['name'] = {
  ios: 'calendar.badge.checkmark',
  android: 'event_available',
  web: 'event_available',
};
const LEGACY_ICON: SymbolViewProps['name'] = { ios: 'trophy.fill', android: 'emoji_events', web: 'emoji_events' };
const MENU_ICON: SymbolViewProps['name'] = { ios: 'line.3.horizontal', android: 'menu', web: 'menu' };
const HOME_ICON: SymbolViewProps['name'] = { ios: 'house.fill', android: 'home', web: 'home' };
const SETTINGS_ICON: SymbolViewProps['name'] = { ios: 'gearshape.fill', android: 'settings', web: 'settings' };

/**
 * Paisagem: largura mínima para a doca (4 × 48 + 3 × 6) ficar centrada sem encostar no Encerrar o mês compacto do
 * canto direito; abaixo disso ela vai para a esquerda.
 */
const COMPACT_DOCK_CENTER_MIN_WIDTH = 600;

/** Folhas da mesa: as dos trilhos, mais o cartão do estado (toque no globo) e o menu (botão ☰ do topo). */
type SheetId = RailSheetId | 'estado' | 'menu';

const SHEET_TITLES: Record<SheetId, string> = {
  alertas: 'Alertas e Eventos',
  meta: 'Meta Atual',
  relatorio: 'Relatório do Mês',
  eleicoes: 'Eleições',
  camadas: 'Camadas do Mapa',
  regioes: 'Visão Regional',
  indicadores: 'Indicadores',
  ministerios: 'Ministérios',
  perfil: 'Perfil do Governo',
  estado: 'Estado',
  menu: 'Menu',
};

const CENTER_ICON: SymbolViewProps['name'] = { ios: 'globe.americas', android: 'public', web: 'public' };

/**
 * Painel (GAME_DESIGN.md §4.2; PLANO_PAINEL_UNICO.md): a mesa do jogo em tela cheia — o globo ocupa a tela toda e
 * a interface vem por cima, como HUD: números translúcidos no topo, botões redondos nas laterais e a doca embaixo.
 * Cada botão redondo abre o detalhe numa folha animada; nada rola e nada rouba espaço do globo. O toque num estado
 * do globo abre o cartão da UF (§4.5: números, porquê da diferença e visita presidencial). O mês inteiro se joga
 * daqui: o trilho esquerdo traz o mês (alertas e eventos, onde se responde e se sanciona; meta; relatório; e, na
 * janela eleitoral, as Eleições), o direito o país (camadas, regiões, indicadores com o "Por que mudou?",
 * ministérios) e a doca da base abre as subtelas (Gabinete, Congresso, Economia, Notícias) por `router.push`, com
 * selos do que espera lá, e traz o botão dourado "Encerrar o mês" — depois dele o relatório do mês abre sozinho, ou
 * o legado, se a campanha terminou. Não há barra de abas: o ☰ do topo abre a folha Menu (voltar ao menu principal,
 * que mantém a partida em memória, e configurações). Com uma subtela por cima o globo pausa o desenho.
 */
export function PainelScreen() {
  const active = useGame((s) => s.active);
  const draft = useGame((s) => s.draft);
  const busy = useGame((s) => s.busy);
  const error = useGame((s) => s.error);
  const insets = useSafeAreaInsets();
  const [series, setSeries] = useState<{ id: string; points: readonly IndicatorPoint[] } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Série por UF do cartão do estado: mesma regra da série do PIB (par id + pontos, relida a cada mês gravado).
  const [regional, setRegional] = useState<{ id: string; points: readonly RegionalPoint[] } | null>(null);
  // Fotografias das eleições gerais por UF (banco): a camada Resultado mostra a mais recente. Mesma regra do par id + dados.
  const [elections, setElections] = useState<{ id: string; results: readonly ElectionResult[] } | null>(null);
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const [mapLayer, setMapLayer] = useState<MapIndicator | null>(null);
  const [selectedUf, setSelectedUf] = useState<string | null>(null);
  const [mapRegion, setMapRegion] = useState<string | null>(null);
  const [openIndicator, setOpenIndicator] = useState<IndicatorKey | null>(null);
  // Evento aberto por um marcador do mapa: a folha Alertas o põe no topo e o destaca. Limpo ao fechar a folha.
  const [focusInstance, setFocusInstance] = useState<string | null>(null);
  // Último item que o toque num marcador abriu, por UF: tocar de novo percorre o grupo (`nextMarkerItem`).
  const lastMarkerItem = useRef<Record<string, string>>({});
  // Último mês de notícias que o jogador abriu (por partida): o selo das Notícias some até sair um relatório novo.
  const [seenNews, setSeenNews] = useState<{ id: string; month: number } | null>(null);
  // O erro da store veio do Encerrar o mês? Só então o aviso fala do mês (a store guarda erros de outras operações).
  const [endMonthFailed, setEndMonthFailed] = useState(false);
  // Há subtela por cima do Painel? Então o globo não desenha (a pilha mantém o Painel montado por baixo).
  const focused = useIsFocused();
  const globe = useRef<GlobeApi | null>(null);
  // Qualidade do mapa (Configurações: Automático ou um perfil). Se o globo falhar a superfície cai sozinha para o 2D só
  // nesta sessão: nada é gravado, e o aviso aparece uma vez.
  const mapQuality = useGame((s) => s.mapQuality);
  const autoProfile = useGame((s) => s.autoProfile);
  const mapPlan = planMapQuality(mapQuality, autoProfile);
  const mapRenderer = mapPlan.renderer;
  const globeQuality = useMemo(
    () => ({
      profile: mapPlan.profile3d,
      auto: mapPlan.auto,
      onAutoProfile: (profile: Profile3d) => void gameStore.getState().setAutoProfile(profile),
    }),
    [mapPlan.profile3d, mapPlan.auto],
  );
  // Dia e noite (só visual): a hora escolhida em Configurações e o mês do calendário da campanha (estação do ano).
  const dayTime = useGame((s) => s.dayTime);
  const skyMonth = toCalendar(active?.state.monthIndex ?? 0).month;
  const sky = useMemo(() => ({ setting: dayTime, month: skyMonth }), [dayTime, skyMonth]);
  const [globeFailed, setGlobeFailed] = useState(false);
  const [globeNoticeClosed, setGlobeNoticeClosed] = useState(false);

  const scenarioId = active?.state.scenarioId ?? DEFAULT_SCENARIO_ID;
  const content = useMemo(() => loadContent(scenarioId), [scenarioId]);
  const activeId = active?.id;
  const monthIndex = active?.state.monthIndex;
  // As leituras do banco seguem o turno, não o mês do mandato: da transição para a posse o mês fica em 0 e só o
  // turno anda, e é justamente aí que a série grava o primeiro ponto (PLANO_CAMPANHA.md Fase C1).
  const turnIndex = active ? turnIndexOf(active.state) : undefined;

  // Série do PIB: relida do banco quando a partida ou o turno mudam; a tela não guarda histórico próprio.
  // O par (id, pontos) evita mostrar a série de uma partida anterior enquanto a nova ainda não chegou.
  useEffect(() => {
    if (activeId === undefined) return;
    let live = true;
    void gameStore
      .getState()
      .history()
      .then((points) => {
        if (live) setSeries({ id: activeId, points });
      });
    return () => {
      live = false;
    };
  }, [activeId, turnIndex]);
  const history = activeId !== undefined && series?.id === activeId ? series.points : null;

  useEffect(() => {
    if (activeId === undefined) return;
    let live = true;
    void gameStore
      .getState()
      .regionalHistory()
      .then((points) => {
        if (live) setRegional({ id: activeId, points });
      });
    return () => {
      live = false;
    };
  }, [activeId, turnIndex]);
  const regionalHistory = activeId !== undefined && regional?.id === activeId ? regional.points : EMPTY_REGIONAL;

  // Relida a cada turno gravado, como a série regional: a fotografia nasce na mesma transação do mês da eleição.
  useEffect(() => {
    if (activeId === undefined) return;
    let live = true;
    void gameStore
      .getState()
      .electionResults()
      .then((results) => {
        if (live) setElections({ id: activeId, results });
      });
    return () => {
      live = false;
    };
  }, [activeId, turnIndex]);
  const electionResults = activeId !== undefined && elections?.id === activeId ? elections.results : null;
  const election = electionResults && electionResults.length > 0 ? electionResults[electionResults.length - 1] : null;

  // Camadas que o cenário permite (o Alinhamento precisa da inclinação das UFs).
  const layers = useMemo(() => availableIndicators(content), [content]);
  // Sem partida não há dado por UF: a camada escolhida só vale com campanha em andamento e se o cenário a oferece.
  // O Resultado só abre depois de existir uma fotografia da eleição (nunca "resultado" antes disso).
  const layer =
    active && mapLayer && layers.some((l) => l.id === mapLayer) && (mapLayer !== 'resultado' || election)
      ? mapLayer
      : null;
  // Sem o rascunho: marcar uma decisão não recalcula o HUD nem recolore o mapa. O que depende do rascunho (ações
  // livres, selo dos alertas) é contado à parte, logo abaixo.
  const hud = useMemo(
    () => (active ? hudFromCampaign(active, content, history, layer, election) : hudFromScenario(content)),
    [active, content, history, layer, election],
  );
  // Clima do mês: a textura do globo é refeita só quando o clima ou o mês mudam; o 2D lê as marcas (hachura, nuvem).
  const mapClouds = useGame((s) => s.mapClouds);
  const climate = active?.state.climate;
  const climateMonthIndex = active?.state.monthIndex;
  const climateData = useMemo(
    () =>
      climate && climateMonthIndex !== undefined
        ? buildClimateMapData({ climate, monthIndex: climateMonthIndex }, content)
        : null,
    [climate, climateMonthIndex, content],
  );
  const climateOverlay = useMemo(
    () => (climate ? buildClimateOverlay(climate, layer, mapClouds) : undefined),
    [climate, layer, mapClouds],
  );
  // Marcadores de eventos e notícias com local (um por UF); o pulso dos críticos novos vem marcado em cada um.
  const markers = useMapMarkers(active, content);
  const baseMapModel = useMemo(
    () =>
      buildRegionalMapViewModel({
        indicator: layer,
        fills: hud.fills,
        selectedId: selectedUf,
        climate: climateOverlay,
        markers,
        election,
      }),
    [layer, hud.fills, selectedUf, climateOverlay, markers, election],
  );
  const actionsLeft = hud.actionsMax - (active ? draftCost(draft, content) : 0);

  // Cartão e lista do estado: o indicador é o da camada ativa (ou a aprovação, como na antiga aba Brasil).
  const listIndicator: MapIndicator = layer ?? 'aprovacao';
  const ufRows = useMemo(
    () => (active ? mapRows(listIndicator, active.state, content, election) : []),
    [active, content, listIndicator, election],
  );
  const selectedRow = selectedUf ? (ufRows.find((r) => r.uf.id === selectedUf) ?? null) : null;
  const mapModel = useMemo(
    () => ({
      ...baseMapModel,
      fills: mapRegion
        ? Object.fromEntries(
            ufRows.map((r) => [
              r.uf.id,
              r.region === mapRegion ? (baseMapModel.fills[r.uf.id] ?? '#1f2a40') : DIMMED_UF,
            ]),
          )
        : baseMapModel.fills,
      descriptions: active
        ? Object.fromEntries(
            rankUfs(listIndicator, ufRows).map((r) => [
              r.uf.id,
              ufDescription(
                listIndicator,
                r,
                r.rank,
                ufRows.length,
                active.state,
                layerBadge(listIndicator, election)?.text,
              ),
            ]),
          )
        : {},
    }),
    [baseMapModel, mapRegion, ufRows, active, listIndicator, election],
  );
  // No mês da posse ainda não há relatório: a explicação inicial vem da própria distribuição.
  const explanations = useMemo(
    () =>
      active
        ? (active.lastReport?.regional ??
          (active.state.monthIndex === 0 ? initialRegions(active.state, content).explanations : null))
        : null,
    [active, content],
  );

  // Caixa de entrada (folha Alertas): a mesma montagem que o Gabinete tinha, agora feita aqui. Sem partida ou com a
  // campanha encerrada não há o que responder.
  const playing = active !== null && !active.finished;
  const actionsMax = active?.state.resources.agendaActionsPerMonth ?? 0;
  const inbox = useMemo(
    () => (active && !active.finished ? pendingItems(active.state, content) : []),
    [active, content],
  );
  const sanctions = useMemo(
    () => (active && !active.finished ? sanctionItems(active.state, content) : []),
    [active, content],
  );
  const sanctionChosen = useMemo(() => sanctionChoices(draft), [draft]);
  const characters = useMemo(() => (active ? characterBriefs(active.state, content) : []), [active, content]);
  // Selo do sino e do botão de alertas: o que ainda não tem resposta marcada no rascunho.
  const pendingCount = playing ? inboxCount(active.state, content, draft) : 0;

  // Eleições só entram no trilho na janela eleitoral; os selos da doca vêm do estado (funções puras em `mesaNav`).
  // Antes da posse (PLANO_CAMPANHA.md Fase C2) o trilho eleitoral mostra a pesquisa da campanha.
  const preInauguration = playing && isPreInauguration(active.state);
  const showElections =
    playing && (preInauguration || electionsRelevant(content.scenario.elections, active.state.monthIndex));
  const seenNewsMonth = seenNews && seenNews.id === activeId ? seenNews.month : null;
  const dockBadges: Readonly<Partial<Record<DockRoute, number>>> = playing
    ? { '/congresso': congressBadge(active.state), '/noticias': newsBadge(active.state, seenNewsMonth) }
    : {};

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
  };
  const compact = size.width > size.height;
  const buttonSize = compact ? 40 : 48;
  // Fim da barra do topo medido no layout: os cartões de números variam com a largura e a escala do texto, e as
  // constantes de `hudReserved` não acompanham isso.
  const [topBarBottom, setTopBarBottom] = useState(0);
  // Áreas do HUD onde o mapa não pode pôr siglas e capitais (trilhos, barra do topo, doca): ver `hudReserved`.
  const labelReserve = useMemo(() => {
    const reserve = painelLabelReserve({
      width: size.width,
      height: size.height,
      insets,
      compact,
      demo: hud.demo,
      leftRailCount: leftRail(showElections).length,
      rightRailCount: RIGHT_RAIL.length,
    });
    return { ...reserve, insets: { ...reserve.insets, top: Math.max(reserve.insets.top, topBarBottom) } };
  }, [size.width, size.height, insets, compact, hud.demo, showElections, topBarBottom]);

  /** Fecha o detalhe e limpa a seleção do mapa (o ✕, o toque fora e o voltar do Android passam por aqui). */
  const closeSheet = () => {
    setSheet(null);
    setSelectedUf(null);
    setOpenIndicator(null);
    setFocusInstance(null);
  };

  /** Abre uma subtela: o detalhe fecha antes de navegar (ao voltar, a mesa está limpa). */
  const go = (route: GameRoute, params?: { noticia: string }) => {
    closeSheet();
    // Abrir as Notícias dá o relatório por visto: o selo some até o próximo mês.
    if (route === '/noticias' && active && active.state.monthIndex > 0) {
      setSeenNews({ id: active.id, month: turnIndexOf(active.state) - 1 });
    }
    router.push(params ? { pathname: route, params } : route);
  };

  /** O anel de um pulso do mapa (globo ou 2D) terminou: essas instâncias não pulsam mais nesta partida. */
  const onPulseDone = (instanceIds: readonly string[]) => {
    if (active) endMarkerPulse(active.id, instanceIds);
  };

  /**
   * Toque num marcador do mapa: evento pendente abre a folha Alertas com aquela instância no topo; notícia abre o jornal
   * na edição e na manchete dela; visita presidencial e obra abrem o cartão da UF. Num grupo, o primeiro toque abre o item mais importante (crítico primeiro) e os
   * seguintes percorrem os demais. Sem partida em andamento não há marcador.
   */
  const openMarker = (marker: MapMarker) => {
    if (!playing) return;
    const item = nextMarkerItem(marker, lastMarkerItem.current[marker.sigla]);
    lastMarkerItem.current[marker.sigla] = item.id;
    if (opensStateCard(item)) {
      // Visita presidencial e obra: o cartão da UF (que lista as obras e o estado da visita).
      selectState(item.sigla);
    } else if (item.kind === 'event' && item.instanceId !== undefined) {
      setFocusInstance(item.instanceId);
      setSheet('alertas');
    } else if (item.newsId !== undefined) {
      go('/noticias', { noticia: item.newsId });
    }
  };

  /**
   * Volta à tela de abertura. A partida em andamento continua aberta em memória, com o rascunho do mês: CONTINUAR
   * retoma daqui. Uma partida encerrada (só aberta para ver o legado) é fechada, para CONTINUAR buscar a última
   * partida salva em vez de reabrir o resultado.
   */
  const leaveToMenu = async () => {
    closeSheet();
    if (active?.finished) await gameStore.getState().leaveCampaign();
    router.navigate('/');
  };

  /**
   * Encerra o mês e, se ele avançou, abre o relatório (GAME_DESIGN.md §4.2, passo 5) — ou, se a campanha terminou
   * neste mês, vai direto ao legado. A store limpa o rascunho sozinha quando o mês avança; uma recusa (erro ou outra
   * operação em curso) deixa tudo como está.
   */
  const endMonth = async () => {
    // Compara o turno, não o mês do mandato: antes da posse o mês fica parado (PLANO_CAMPANHA.md §2.3).
    const beforeState = gameStore.getState().active?.state;
    const before = beforeState ? turnIndexOf(beforeState) : undefined;
    // O resultado vem do estado, não do `ok`: se o mês foi gravado e só a releitura da lista falhou, ele avançou.
    // Falha antes de gravar: o mês fica, o rascunho também, e o aviso da mesa pede para tentar de novo.
    await gameStore.getState().endMonth();
    const after = gameStore.getState().active;
    const outcome = endMonthOutcome(before, after ? turnIndexOf(after.state) : undefined, after?.finished ?? false);
    setEndMonthFailed(outcome === 'nada' && gameStore.getState().error !== undefined);
    if (outcome === 'relatorio') setSheet('relatorio');
    else if (outcome === 'legado') go('/legado');
  };

  /** Marca/desmarca uma decisão da folha Eleições (declarar candidatura, apoiar bloco) se couber nas ações do mês. */
  const toggleElectionsDecision = (decision: Decision) => {
    if (canToggleDecision(draft, decision, content, actionsMax)) gameStore.getState().toggleDecision(decision);
  };

  /** Toque no globo: abre o cartão do estado; sem partida em andamento o mapa é só imagem. */
  const selectState = (sigla: string | null) => {
    if (!active || sigla === null) {
      setSelectedUf(null);
      return;
    }
    setSelectedUf(sigla);
    setSheet('estado');
  };

  /** Escolha na lista: leva a câmera até a UF e abre o cartão dela. */
  const chooseState = (sigla: string) => {
    globe.current?.flyToUf(sigla);
    setSelectedUf(sigla);
    setSheet('estado');
  };

  // Android: com um painel aberto, o "voltar" do sistema fecha só o painel em vez de sair da mesa.
  useEffect(() => {
    if (sheet === null) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeSheet();
      return true;
    });
    return () => sub.remove();
  }, [sheet]);

  const statCell = (id: HudStatId, props?: { value?: string; line?: string }) => {
    const stat = hud.stats.find((s) => s.id === id);
    return stat ? <StatCell key={id} stat={stat} compact={compact} {...props} /> : null;
  };

  const topCells = (
    <>
      {statCell('mes', {
        value: hud.shortLabel,
        line: `${hud.turn}/${hud.turnTotal} · ${actionsLeft === 1 ? '1 ação' : `${actionsLeft} ações`}`,
      })}
      {statCell('aprovacao')}
      {statCell('pib')}
      {statCell('populacao')}
    </>
  );

  // Trilhos (ids e rótulos em `mesaNav`): selo de pendências no sino e camada do mapa ativa acesa.
  const rail = (entries: ReturnType<typeof leftRail>) => (
    <View pointerEvents="box-none" style={{ gap: compact ? 6 : 10 }}>
      {entries.map((entry) => (
        <RoundButton
          key={entry.id}
          icon={RAIL_ICONS[entry.id]}
          label={entry.label}
          size={buttonSize}
          badge={entry.id === 'alertas' ? pendingCount : undefined}
          active={entry.id === 'camadas' && layer !== null}
          onPress={() => setSheet(entry.id)}
        />
      ))}
    </View>
  );

  // Botão dourado da doca: encerra o mês, ou (campanha encerrada) leva à subtela do legado.
  const endControl = endMonthControl({
    hasCampaign: active !== null,
    finished: active?.finished ?? false,
    busy,
    actionsUsed: active ? draftCost(draft, content) : 0,
    actionsMax: active?.state.resources.agendaActionsPerMonth ?? 0,
  });
  const endButton = (
    <EndMonthButton
      icon={endControl.mode === 'legado' ? LEGACY_ICON : END_MONTH_ICON}
      label={endControl.label}
      caption={endControl.caption}
      busy={busy && endControl.mode === 'encerrar'}
      disabled={endControl.disabled}
      compact={compact}
      onPress={endControl.mode === 'legado' ? () => go('/legado') : () => void endMonth()}
    />
  );

  const sheetBody = (): ReactNode => {
    switch (sheet) {
      case 'alertas':
        // Responder aqui: escolha das respostas, pareceres da mesa de despacho e sanção/veto (o Gabinete só decide).
        return active && (inbox.length > 0 || sanctions.length > 0) ? (
          <EventInbox
            items={inbox}
            chosen={draft.eventChoices}
            canChoose={(eventId, choiceId) => canChooseEvent(draft, content, actionsMax, eventId, choiceId)}
            onChoose={gameStore.getState().toggleEventChoice}
            characters={characters}
            focusInstanceId={focusInstance}
            sanctions={sanctions}
            sanctionChosen={sanctionChosen}
            onSanction={(proposalId, choice) =>
              gameStore
                .getState()
                .toggleDecision({ policyId: SANCTION_ACTION_ID, agendaCost: 0, params: { proposalId, choice } })
            }
          />
        ) : (
          <EmptyNote
            text={
              hud.demo ? 'Inicie uma campanha para receber eventos do gabinete.' : 'Nenhum evento aguardando resposta.'
            }
          />
        );
      case 'eleicoes':
        if (active && isPreInauguration(active.state)) {
          return (
            <>
              <CareerFinanceCard
                state={active.state}
                content={content}
                report={active.lastReport}
                draft={draft}
                onToggle={(decision) => gameStore.getState().toggleDecision(decision)}
              />
              <CareerPollCard view={careerPollViewModel(active.state, content, active.lastReport)} />
            </>
          );
        }
        return active && content.scenario.elections ? (
          <ElectionsCard
            state={active.state}
            content={content}
            report={active.lastReport}
            draft={draft}
            onToggle={toggleElectionsDecision}
            fitsDecision={(decision) => canToggleDecision(draft, decision, content, actionsMax)}
          />
        ) : (
          <EmptyNote text="Este cenário não tem eleições." />
        );
      case 'relatorio':
        return (
          <>
            {active && (
              <CareerDebtCard
                state={active.state}
                draft={draft}
                onToggle={(decision) => gameStore.getState().toggleDecision(decision)}
              />
            )}
            {active?.lastReport ? (
              <MonthSummary report={active.lastReport} content={content} />
            ) : (
              <EmptyNote text="O primeiro relatório chega quando você encerrar o mês." />
            )}
          </>
        );
      case 'meta':
        return (
          <>
            <Text style={{ color: Hud.textDim, fontSize: 11.5 }}>{hud.goal.summary}</Text>
            {hud.goal.checks.map((check) => (
              <GoalCheckRow key={check.label} check={check} />
            ))}
          </>
        );
      case 'ministerios':
        return hud.ministries.map((ministry) => <MinistryRow key={ministry.id} ministry={ministry} />);
      case 'indicadores': {
        // Sem partida mostra os valores do cenário, sem variação nem "Por que mudou?" (ainda não há mês encerrado).
        const indicators = active?.state.indicators ?? indicatorsFromScenario(content.scenario);
        return (
          <>
            <View style={styles.indicatorGrid}>
              {INDICATOR_ORDER.map((key) => {
                const meta = INDICATOR_META[key];
                return (
                  <Indicator
                    key={key}
                    label={meta.label}
                    value={indicators[key]}
                    previous={active?.previous?.[key]}
                    goodWhen={meta.goodWhen}
                    decimals={meta.decimals}
                    context={meta.context}
                    onPress={() => setOpenIndicator((cur) => (cur === key ? null : key))}
                  />
                );
              })}
            </View>
            {openIndicator && <WhyChanged indicator={openIndicator} report={active?.lastReport} />}
            <SheetHeading text="Setores da economia" />
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {hud.sectors.map((sector) => (
                <SectorTile key={sector.id} sector={sector} />
              ))}
            </View>
            <SheetHeading text="PIB em 12 meses" />
            <GdpChart series={hud.series} height={150} />
          </>
        );
      }
      case 'regioes':
        return (
          <>
            {hud.regions.map((region) => (
              <RegionRow key={region.id} region={region} />
            ))}
            <Text style={{ color: Hud.textMuted, fontSize: 10, fontStyle: 'italic' }}>
              Participação de cada região no produto nacional.
            </Text>
            {active ? (
              <ReadingList
                rows={ufRows}
                state={active.state}
                region={mapRegion}
                onRegion={setMapRegion}
                indicator={listIndicator}
                badge={layerBadge(listIndicator, election)}
                onChoose={chooseState}
              />
            ) : (
              <EmptyNote text="Inicie uma campanha para ver os estados no mapa de calor." />
            )}
          </>
        );
      case 'estado':
        return active && selectedRow ? (
          <UfDetail
            row={selectedRow}
            indicator={listIndicator}
            state={active.state}
            content={content}
            explanation={explanations?.find((x) => x.id === selectedRow.uf.id)}
            regionalHistory={regionalHistory}
            election={election}
            onFly={() => {
              globe.current?.flyToUf(selectedRow.uf.id);
              setSheet(null);
            }}
          />
        ) : (
          <EmptyNote text="Toque num estado do mapa para ver os números e o porquê da diferença." />
        );
      case 'perfil':
        return active ? (
          <ProfileSheet
            state={active.state}
            content={content}
            onShowLayer={() => {
              setMapLayer('alinhamento');
              closeSheet();
            }}
          />
        ) : (
          <EmptyNote text="Inicie uma campanha para ver o perfil do governo." />
        );
      case 'menu':
        return (
          <>
            <MenuRow
              icon={HOME_ICON}
              label="Voltar ao menu principal"
              disabled={busy}
              onPress={() => void leaveToMenu()}
            />
            <MenuRow
              icon={SETTINGS_ICON}
              label="Configurações"
              onPress={() => {
                closeSheet();
                router.push('/configuracoes');
              }}
            />
            {active && (
              <Text style={{ color: Hud.textMuted, fontSize: 10.5, paddingTop: 2 }}>
                {`${active.name} · ${DIFFICULTY[active.state.difficulty].name}`}
              </Text>
            )}
          </>
        );
      case 'camadas':
        return (
          <>
            <MapLayerRow
              label="Satélite"
              hint="Sem mapa de calor"
              active={layer === null}
              onPress={() => setMapLayer(null)}
            />
            {layers.map((spec, i) => {
              // O Resultado fica desabilitado, com o porquê, até a eleição geral existir.
              const waiting = spec.id === 'resultado' && !election;
              return (
                <Fragment key={spec.id}>
                  {spec.group === 'eleitoral' && layers[i - 1]?.group !== 'eleitoral' && (
                    <SheetHeading text={ELECTORAL_GROUP_TITLE} />
                  )}
                  <MapLayerRow
                    label={spec.label}
                    hint={spec.id === 'resultado' ? resultLayerHint(content, monthIndex ?? 0, election) : spec.legend}
                    spec={spec}
                    badge={layerBadge(spec.id, election)}
                    active={layer === spec.id}
                    disabled={hud.demo || waiting}
                    onPress={() => setMapLayer(spec.id)}
                  />
                </Fragment>
              );
            })}
            {layer !== null && !hud.demo && (
              <MapLayerLegend spec={indicatorSpec(layer)} badge={layerBadge(layer, election)} />
            )}
            {hud.demo && <EmptyNote text="Inicie uma campanha para ativar os mapas por estado." />}
          </>
        );
      default:
        return null;
    }
  };

  return (
    <View onLayout={onLayout} style={styles.root}>
      <StatusBar style="light" />
      {size.width > 0 && (
        <>
          {/* O mapa é a tela: tudo o mais são camadas por cima. O toque num estado abre o cartão dele. */}
          <MapSurface
            renderer={mapRenderer}
            quality={globeQuality}
            sky={sky}
            climate={climateData}
            clouds={mapClouds}
            viewModel={mapModel}
            paused={!focused}
            reservedRects={labelReserve.rects}
            labelInsets={labelReserve.insets}
            onSelect={selectState}
            onMarkerPress={openMarker}
            onPulseDone={onPulseDone}
            onGlobeFailure={() => setGlobeFailed(true)}
            onReady={(api) => {
              globe.current = api;
            }}
          />

          <View
            pointerEvents="box-none"
            onLayout={(e) => {
              const { y, height } = e.nativeEvent.layout;
              setTopBarBottom((b) => (b === y + height ? b : y + height));
            }}
            style={[
              styles.top,
              { paddingTop: insets.top + 6, paddingLeft: 8 + insets.left, paddingRight: 8 + insets.right },
            ]}>
            <View pointerEvents="box-none" style={styles.topRow}>
              <RoundButton icon={MENU_ICON} label="Menu" size={compact ? 36 : 40} onPress={() => setSheet('menu')} />
              <Image
                source={logo}
                style={{ height: compact ? 26 : 30, width: (compact ? 26 : 30) * 2 }}
                resizeMode="contain"
              />
              {compact && (
                <View pointerEvents="none" style={styles.topCellsInline}>
                  {topCells}
                </View>
              )}
              <View style={{ flex: compact ? 0 : 1 }} />
              <RoundButton
                icon={CENTER_ICON}
                label="Centralizar no Brasil"
                size={compact ? 36 : 40}
                onPress={() => globe.current?.reset()}
              />
              <BellButton count={pendingCount} onPress={() => setSheet('alertas')} />
            </View>
            {!compact && (
              <>
                <View pointerEvents="none" style={styles.topCellsRow}>
                  {topCells}
                </View>
                <View pointerEvents="none" style={styles.topCellsRow}>
                  {SECOND_ROW_STATS.map((id) => statCell(id))}
                </View>
              </>
            )}
          </View>

          <View
            pointerEvents="box-none"
            style={[
              StyleSheet.absoluteFill,
              styles.rails,
              {
                paddingTop: (compact ? TOP_INSET.compact : TOP_INSET.portrait) + insets.top,
                // Os trilhos param acima da doca (+ selo de demonstração acima dela). Em paisagem a doca é baixa, mas
                // estreita ela vai para a esquerda e o Encerrar fica no canto direito: sem a reserva, um trilho de
                // quatro botões encostaria neles em telas baixas.
                paddingBottom:
                  (compact ? DOCK_HEIGHT_COMPACT : 8 + DOCK_HEIGHT_PORTRAIT + 10) +
                  (hud.demo ? DEMO_BADGE_BAND : 0) +
                  insets.bottom,
                paddingLeft: 8 + insets.left,
                paddingRight: 8 + insets.right,
              },
            ]}>
            {rail(leftRail(showElections))}
            {rail(RIGHT_RAIL)}
          </View>

          {/* Doca: as subtelas do jogo e o Encerrar o mês. Retrato: o Encerrar numa linha própria, à direita, acima dos
              quatro botões (ícone + rótulo na largura toda — com cinco na mesma linha, 360 px não dá); paisagem: só
              ícones, baixa e central, e o Encerrar compacto no canto inferior direito. */}
          <View
            pointerEvents="box-none"
            style={[
              styles.bottom,
              compact ? styles.bottomCompact : styles.bottomPortrait,
              // Paisagem estreita: centrada, a doca encostaria no Encerrar o mês do canto direito.
              compact && size.width < COMPACT_DOCK_CENTER_MIN_WIDTH && styles.bottomCompactStart,
              {
                paddingBottom: (compact ? 6 : 8) + insets.bottom,
                paddingLeft: 8 + insets.left,
                paddingRight: 8 + insets.right,
              },
            ]}>
            {!compact && hud.demo && (
              <View pointerEvents="none">
                <DemoBadge />
              </View>
            )}
            {!compact && (
              <View pointerEvents="box-none" style={styles.endRow}>
                {endButton}
              </View>
            )}
            <View pointerEvents="box-none" style={compact ? styles.dockCompact : styles.dock}>
              {DOCK.map((item) => (
                <DockButton
                  key={item.route}
                  icon={item.icon}
                  label={item.label}
                  compact={compact}
                  badge={dockBadges[item.route]}
                  onPress={() => go(item.route)}
                />
              ))}
            </View>
          </View>
          {compact && (
            <View
              pointerEvents="box-none"
              style={{ position: 'absolute', right: 8 + insets.right, bottom: 6 + insets.bottom }}>
              {endButton}
            </View>
          )}
          {compact && hud.demo && (
            <View
              pointerEvents="none"
              style={{ position: 'absolute', left: 10 + insets.left, bottom: DOCK_HEIGHT_COMPACT + insets.bottom }}>
              <DemoBadge />
            </View>
          )}

          {error && !sheet && (
            <View
              style={[
                styles.error,
                {
                  top: (compact ? TOP_INSET.compact : TOP_INSET.portrait) + insets.top,
                  left: 64 + insets.left,
                  right: 64 + insets.right,
                },
              ]}>
              <ForceHudTheme>
                <Alert
                  tone="negative"
                  title="Algo deu errado ao salvar"
                  message={
                    endMonthFailed
                      ? `${error} O mês não avançou e a agenda marcada continua: tente encerrar de novo.`
                      : error
                  }
                  action={{
                    label: 'Fechar o aviso',
                    onPress: () => {
                      setEndMonthFailed(false);
                      gameStore.getState().clearError();
                    },
                  }}
                />
              </ForceHudTheme>
            </View>
          )}

          {globeFailed && mapRenderer === 'globe' && !globeNoticeClosed && !error && !sheet && (
            <View
              style={[
                styles.error,
                {
                  top: (compact ? TOP_INSET.compact : TOP_INSET.portrait) + insets.top,
                  left: 64 + insets.left,
                  right: 64 + insets.right,
                },
              ]}>
              <ForceHudTheme>
                <Alert
                  tone="warning"
                  title="O globo 3D não iniciou"
                  message="Mostramos o mapa 2D nesta sessão. Para escolher o tipo de mapa, use Menu › Configurações."
                  action={{ label: 'Entendi', onPress: () => setGlobeNoticeClosed(true) }}
                />
              </ForceHudTheme>
            </View>
          )}

          {sheet && (
            <InfoSheet
              title={
                sheet === 'estado' && selectedRow ? `${selectedRow.name} · ${selectedRow.uf.id}` : SHEET_TITLES[sheet]
              }
              onClose={closeSheet}>
              {sheetBody()}
            </InfoSheet>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Hud.board },
  top: { position: 'absolute', top: 0, left: 0, right: 0, gap: 6 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topCellsInline: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 4, marginHorizontal: 8 },
  topCellsRow: { flexDirection: 'row', gap: 4 },
  rails: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bottomPortrait: { alignItems: 'flex-start', gap: 6 },
  bottomCompact: { alignItems: 'center' },
  bottomCompactStart: { alignItems: 'flex-start' },
  endRow: { alignSelf: 'stretch', alignItems: 'flex-end' },
  dock: { alignSelf: 'stretch', flexDirection: 'row', gap: 6 },
  dockCompact: { flexDirection: 'row', gap: 6 },
  error: { position: 'absolute' },
  indicatorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
