import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BackHandler, Image, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SymbolViewProps } from 'expo-symbols';

import { indicatorSpec, MAP_INDICATORS, type MapIndicator } from '@/components/brasil/regionalMetrics';
import { shortMonthLabel } from '@/components/campaign/labels';
import { Text } from '@/components/ui';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import type { IndicatorPoint } from '@/database/campaignRepository';
import { GlobeView } from '@/globe/GlobeView';
import { gameStore, useGame } from '@/store';

import { GdpChart } from './GdpChart';
import {
  AlertCard,
  BellButton,
  DemoBadge,
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

const logo = require('../../../assets/images/logo-brasil.png');

/** Números da faixa de baixo (retrato); no topo ficam os quatro principais. */
const BOTTOM_STATS: readonly HudStatId[] = ['capital', 'inflacao', 'desemprego'];

type SheetId = 'alertas' | 'congresso' | 'meta' | 'ministerios' | 'indicadores' | 'pib' | 'regioes' | 'camadas';

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
  camadas: 'Camadas do Mapa',
};

const BACK_ICON: SymbolViewProps['name'] = { ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' };

/**
 * Painel (GAME_DESIGN.md §4.2): a mesa do jogo em tela cheia — o globo ocupa a tela toda e a interface vem por
 * cima, como HUD: números translúcidos no topo, botões redondos nas laterais e os complementos embaixo. Cada
 * botão abre o detalhe numa folha animada; nada rola e nada rouba espaço do globo. A barra de abas some nesta
 * aba (js-tabs) e o botão de voltar retorna para a Presidência, onde ela reaparece.
 */
export function PainelScreen() {
  const active = useGame((s) => s.active);
  const draft = useGame((s) => s.draft);
  const insets = useSafeAreaInsets();
  const [series, setSeries] = useState<{ id: string; points: readonly IndicatorPoint[] } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const [mapLayer, setMapLayer] = useState<MapIndicator | null>(null);

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

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
  };
  const compact = size.width > size.height;
  const buttonSize = compact ? 40 : 48;

  /** Sai da mesa para outra aba: o detalhe fecha antes de navegar (ao voltar, a mesa está limpa). */
  const go = (route: '/presidencia' | '/congresso') => {
    setSheet(null);
    router.navigate(route);
  };

  // Android: com um painel aberto, o "voltar" do sistema fecha só o painel em vez de trocar de aba.
  useEffect(() => {
    if (sheet === null) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setSheet(null);
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
        line: `${hud.turn}/${hud.turnTotal} · ${hud.pointsLeft} pts`,
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
              hud.alerts.map((alert) => <AlertCard key={alert.id} alert={alert} onPress={() => go('/presidencia')} />)
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
              label={hud.demo ? 'Ir para a Presidência' : 'Ver todos os eventos'}
              onPress={() => go('/presidencia')}
            />
          </>
        );
      case 'congresso':
        return (
          <>
            <MiniHemicycle blocs={content.scenario.blocs} congress={hud.congress} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ color: Hud.textMuted, fontSize: 10.5 }}>{`Pontos de agenda: ${hud.pointsLeft}`}</Text>
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
          {/* O mapa é a tela: tudo o mais são camadas por cima. */}
          <GlobeView chrome={false} fills={hud.fills} />

          <View
            pointerEvents="box-none"
            style={[
              styles.top,
              { paddingTop: insets.top + 6, paddingLeft: 8 + insets.left, paddingRight: 8 + insets.right },
            ]}>
            <View pointerEvents="box-none" style={styles.topRow}>
              <RoundButton
                icon={BACK_ICON}
                label="Voltar para a Presidência"
                size={compact ? 36 : 40}
                onPress={() => go('/presidencia')}
              />
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
              <BellButton count={hud.pendingCount} onPress={() => setSheet('alertas')} />
            </View>
            {!compact && (
              <View pointerEvents="none" style={styles.topCellsRow}>
                {topCells}
              </View>
            )}
          </View>

          <View
            pointerEvents="box-none"
            style={[
              StyleSheet.absoluteFill,
              styles.rails,
              {
                paddingTop: (compact ? 56 : 118) + insets.top,
                paddingBottom: (compact ? 10 : 60) + insets.bottom,
                paddingLeft: 8 + insets.left,
                paddingRight: 8 + insets.right,
              },
            ]}>
            {rail(leftButtons)}
            {rail(rightButtons)}
          </View>

          {!compact && (
            <View
              pointerEvents="none"
              style={[
                styles.bottom,
                { paddingBottom: 8 + insets.bottom, paddingLeft: 8 + insets.left, paddingRight: 8 + insets.right },
              ]}>
              {hud.demo && <DemoBadge />}
              <View style={styles.bottomCells}>{BOTTOM_STATS.map((id) => statCell(id))}</View>
            </View>
          )}
          {compact && hud.demo && (
            <View
              pointerEvents="none"
              style={{ position: 'absolute', left: 10 + insets.left, bottom: 10 + insets.bottom }}>
              <DemoBadge />
            </View>
          )}

          {sheet && (
            <InfoSheet title={SHEET_TITLES[sheet]} onClose={() => setSheet(null)}>
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
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  bottomCells: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 4 },
});
