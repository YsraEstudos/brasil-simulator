import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackHandler, Image, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SymbolViewProps } from 'expo-symbols';

import { shortMonthLabel } from '@/components/campaign/labels';
import { Text } from '@/components/ui';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import type { IndicatorPoint } from '@/database/campaignRepository';
import { initialRegions } from '@/engine';
import { GlobeView, type GlobeApi } from '@/globe/GlobeView';
import { gameStore, useGame } from '@/store';

import { GdpChart } from './GdpChart';
import {
  AlertCard,
  BellButton,
  DemoBadge,
  DockButton,
  EmptyNote,
  GoalCheckRow,
  LinkRow,
  MapLayerLegend,
  MapLayerRow,
  MinistryRow,
  RegionRow,
  RoundButton,
  SectorTile,
  StatCell,
} from './HudBits';
import { hudFromCampaign, hudFromScenario, type HudStatId } from './hudData';
import { Hud } from './hudTheme';
import { InfoSheet } from './InfoSheet';
import { MiniHemicycle } from './MiniHemicycle';
import { indicatorSpec, MAP_INDICATORS, mapRows, type MapIndicator } from './regionalMetrics';
import { UfDetail, UfList } from './StateDetail';

const logo = require('../../../assets/images/logo-brasil.png');

/** Segunda linha do topo (retrato), abaixo dos quatro principais; a base do Painel fica para a doca. */
const SECOND_ROW_STATS: readonly HudStatId[] = ['capital', 'inflacao', 'desemprego'];

/** Subtelas que a doca abre (rotas do grupo `(jogo)`). */
type DockRoute = '/gabinete' | '/congresso' | '/economia' | '/noticias';

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

/** Medidas fixas da mesa (px, sem as safe areas), para os trilhos laterais não passarem por baixo do topo/doca. */
const TOP_INSET = { portrait: 118 + 56, compact: 56 } as const;
const DOCK_HEIGHT_PORTRAIT = 54;
/** Faixa do `DemoBadge` acima da doca em retrato (selo + espaçamento). */
const DEMO_BADGE_BAND = 28;

type SheetId =
  'alertas' | 'congresso' | 'meta' | 'ministerios' | 'indicadores' | 'pib' | 'regioes' | 'estado' | 'camadas';

interface MesaButton {
  id: SheetId;
  icon: SymbolViewProps['name'];
  label: string;
  badge?: number;
  /** Botão ligado (ex.: camada do mapa ativa). */
  active?: boolean;
}

const SHEET_TITLES: Record<SheetId, string> = {
  alertas: 'Alertas e Eventos',
  congresso: 'Congresso Nacional',
  meta: 'Meta Atual',
  ministerios: 'Ministérios',
  indicadores: 'Indicadores Nacionais',
  pib: 'Evolução do PIB',
  regioes: 'Visão Regional',
  estado: 'Estado',
  camadas: 'Camadas do Mapa',
};

const BACK_ICON: SymbolViewProps['name'] = { ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' };
const CENTER_ICON: SymbolViewProps['name'] = { ios: 'globe.americas', android: 'public', web: 'public' };

/**
 * Painel (GAME_DESIGN.md §4.2): a mesa do jogo em tela cheia — o globo ocupa a tela toda e a interface vem por
 * cima, como HUD: números translúcidos no topo, botões redondos nas laterais e a doca embaixo. Cada botão
 * redondo abre o detalhe numa folha animada; nada rola e nada rouba espaço do globo. O toque num estado do globo
 * abre o cartão da UF (§4.5: números, porquê da diferença e visita presidencial). Não há barra de abas: a doca
 * da base abre as subtelas (Gabinete, Congresso, Economia, Notícias) por `router.push` e o botão de voltar leva
 * ao menu principal (a partida continua em memória).
 */
export function PainelScreen() {
  const active = useGame((s) => s.active);
  const draft = useGame((s) => s.draft);
  const insets = useSafeAreaInsets();
  const [series, setSeries] = useState<{ id: string; points: readonly IndicatorPoint[] } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const [mapLayer, setMapLayer] = useState<MapIndicator | null>(null);
  const [selectedUf, setSelectedUf] = useState<string | null>(null);
  const globe = useRef<GlobeApi | null>(null);

  const scenarioId = active?.state.scenarioId ?? DEFAULT_SCENARIO_ID;
  const content = useMemo(() => loadContent(scenarioId), [scenarioId]);
  const activeId = active?.id;
  const monthIndex = active?.state.monthIndex;

  // Série do PIB: relida do banco quando a partida ou o mês mudam; a tela não guarda histórico próprio.
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
  }, [activeId, monthIndex]);
  const history = activeId !== undefined && series?.id === activeId ? series.points : null;

  // Sem partida não há dado por UF: a camada escolhida só vale com campanha em andamento.
  const layer = active ? mapLayer : null;
  const hud = useMemo(
    () => (active ? hudFromCampaign(active, content, draft, history, layer) : hudFromScenario(content)),
    [active, content, draft, history, layer],
  );

  // Cartão e lista do estado: o indicador é o da camada ativa (ou a aprovação, como na antiga aba Brasil).
  const listIndicator: MapIndicator = layer ?? 'aprovacao';
  const ufRows = useMemo(
    () => (active ? mapRows(listIndicator, active.state, content) : []),
    [active, content, listIndicator],
  );
  const selectedRow = selectedUf ? (ufRows.find((r) => r.uf.id === selectedUf) ?? null) : null;
  // No mês da posse ainda não há relatório: a explicação inicial vem da própria distribuição.
  const explanations = useMemo(
    () =>
      active
        ? (active.lastReport?.regional ??
          (active.state.monthIndex === 0 ? initialRegions(active.state, content).explanations : null))
        : null,
    [active, content],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
  };
  const compact = size.width > size.height;
  const buttonSize = compact ? 40 : 48;

  /** Fecha o detalhe e limpa a seleção do mapa (o ✕, o toque fora e o voltar do Android passam por aqui). */
  const closeSheet = () => {
    setSheet(null);
    setSelectedUf(null);
  };

  /** Abre uma subtela: o detalhe fecha antes de navegar (ao voltar, a mesa está limpa). */
  const go = (route: DockRoute) => {
    closeSheet();
    router.push(route);
  };

  /**
   * Volta ao menu principal; a partida em andamento continua em memória, com o rascunho (o CONTINUAR a retoma). Uma
   * partida encerrada (só aberta para ver o resultado) é fechada, para o CONTINUAR buscar a última partida salva.
   */
  const leaveToMenu = async () => {
    closeSheet();
    if (active?.finished) await gameStore.getState().leaveCampaign();
    router.navigate('/');
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
      setSheet(null);
      setSelectedUf(null);
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
        value: shortMonthLabel(hud.turn - 1),
        line: `${hud.turn}/${hud.turnTotal} · ${hud.actionsLeft === 1 ? '1 ação' : `${hud.actionsLeft} ações`}`,
      })}
      {statCell('aprovacao')}
      {statCell('pib')}
      {statCell('populacao')}
    </>
  );

  const leftButtons: MesaButton[] = [
    {
      id: 'alertas',
      icon: { ios: 'bell.fill', android: 'notifications', web: 'notifications' },
      label: 'Alertas e eventos',
      badge: hud.pendingCount,
    },
    { id: 'congresso', icon: { ios: 'person.3.fill', android: 'groups', web: 'groups' }, label: 'Congresso Nacional' },
    { id: 'meta', icon: { ios: 'flag.fill', android: 'flag', web: 'flag' }, label: 'Meta Atual' },
    {
      id: 'camadas',
      icon: { ios: 'square.3.layers.3d', android: 'layers', web: 'layers' },
      label: 'Camadas do mapa',
      active: layer !== null,
    },
  ];
  const rightButtons: MesaButton[] = [
    {
      id: 'ministerios',
      icon: { ios: 'building.columns.fill', android: 'account_balance', web: 'account_balance' },
      label: 'Ministérios',
    },
    {
      id: 'indicadores',
      icon: { ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' },
      label: 'Indicadores Nacionais',
    },
    {
      id: 'pib',
      icon: { ios: 'chart.line.uptrend.xyaxis', android: 'trending_up', web: 'trending_up' },
      label: 'Evolução do PIB',
    },
    { id: 'regioes', icon: { ios: 'map.fill', android: 'map', web: 'map' }, label: 'Visão Regional' },
  ];
  const rail = (buttons: MesaButton[]) => (
    <View pointerEvents="box-none" style={{ gap: compact ? 6 : 10 }}>
      {buttons.map((button) => (
        <RoundButton
          key={button.id}
          icon={button.icon}
          label={button.label}
          size={buttonSize}
          badge={button.badge}
          active={button.active}
          onPress={() => setSheet(button.id)}
        />
      ))}
    </View>
  );

  const sheetBody = (): ReactNode => {
    switch (sheet) {
      case 'alertas':
        return (
          <>
            {hud.alerts.length > 0 ? (
              hud.alerts.map((alert) => <AlertCard key={alert.id} alert={alert} onPress={() => go('/gabinete')} />)
            ) : (
              <EmptyNote
                text={
                  hud.demo
                    ? 'Inicie uma campanha para receber eventos do gabinete.'
                    : 'Nenhum evento aguardando resposta.'
                }
              />
            )}
            <LinkRow
              label={
                hud.demo
                  ? 'Ir para o Gabinete'
                  : hud.alerts.length > 0
                    ? 'Responder no Gabinete'
                    : 'Ver todos os eventos'
              }
              onPress={() => go('/gabinete')}
            />
          </>
        );
      case 'congresso':
        return (
          <>
            <MiniHemicycle blocs={content.scenario.blocs} congress={hud.congress} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ color: Hud.textMuted, fontSize: 10.5 }}>{`Ações de agenda: ${hud.actionsLeft}`}</Text>
              <LinkRow label="Negociar apoios" onPress={() => go('/congresso')} />
            </View>
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
      case 'indicadores':
        return (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {hud.sectors.map((sector) => (
              <SectorTile key={sector.id} sector={sector} />
            ))}
          </View>
        );
      case 'pib':
        return <GdpChart series={hud.series} height={150} />;
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
              <UfList rows={ufRows} indicator={listIndicator} onChoose={chooseState} />
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
            onFly={() => {
              globe.current?.flyToUf(selectedRow.uf.id);
              setSheet(null);
            }}
          />
        ) : (
          <EmptyNote text="Toque num estado do mapa para ver os números e o porquê da diferença." />
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
            {MAP_INDICATORS.map((spec) => (
              <MapLayerRow
                key={spec.id}
                label={spec.label}
                hint={spec.legend}
                spec={spec}
                active={layer === spec.id}
                disabled={hud.demo}
                onPress={() => setMapLayer(spec.id)}
              />
            ))}
            {layer !== null && !hud.demo && <MapLayerLegend spec={indicatorSpec(layer)} />}
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
          <GlobeView
            fills={hud.fills}
            selectedId={selectedUf}
            onSelect={selectState}
            onReady={(api) => {
              globe.current = api;
            }}
          />

          <View
            pointerEvents="box-none"
            style={[
              styles.top,
              { paddingTop: insets.top + 6, paddingLeft: 8 + insets.left, paddingRight: 8 + insets.right },
            ]}>
            <View pointerEvents="box-none" style={styles.topRow}>
              <RoundButton icon={BACK_ICON} label="Voltar ao menu" size={compact ? 36 : 40} onPress={() => void leaveToMenu()} />
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
              <BellButton count={hud.pendingCount} onPress={() => setSheet('alertas')} />
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
                // Retrato: doca + folga (+ selo de demonstração acima dela). Paisagem: a doca é central e estreita,
                // os trilhos ficam nas laterais e só precisam da folga.
                paddingBottom: compact
                  ? 10 + insets.bottom
                  : 8 + DOCK_HEIGHT_PORTRAIT + 10 + (hud.demo ? DEMO_BADGE_BAND : 0) + insets.bottom,
                paddingLeft: 8 + insets.left,
                paddingRight: 8 + insets.right,
              },
            ]}>
            {rail(leftButtons)}
            {rail(rightButtons)}
          </View>

          {/* Doca: as subtelas do jogo. Retrato: ícone + rótulo na largura toda; paisagem: só ícones, baixa e central. */}
          <View
            pointerEvents="box-none"
            style={[
              styles.bottom,
              compact ? styles.bottomCompact : styles.bottomPortrait,
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
            <View pointerEvents="box-none" style={compact ? styles.dockCompact : styles.dock}>
              {DOCK.map((item) => (
                <DockButton
                  key={item.route}
                  icon={item.icon}
                  label={item.label}
                  compact={compact}
                  onPress={() => go(item.route)}
                />
              ))}
            </View>
          </View>
          {compact && hud.demo && (
            <View
              pointerEvents="none"
              style={{ position: 'absolute', left: 10 + insets.left, bottom: 10 + insets.bottom }}>
              <DemoBadge />
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
  dock: { alignSelf: 'stretch', flexDirection: 'row', gap: 6 },
  dockCompact: { flexDirection: 'row', gap: 6 },
});
