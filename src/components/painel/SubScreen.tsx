import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { shortMonthLabel } from '@/components/campaign/labels';
import { NoCampaign } from '@/components/tabs/NoCampaign';
import { Alert, formatNumber, Text } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { loadContent } from '@/content';
import { useTheme } from '@/hooks/use-theme';
import { ForceHudTheme } from '@/theme/ThemeProvider';
import { draftCost, useGame, type ActiveCampaign } from '@/store';

import { RoundButton } from './HudBits';
import { Hud } from './hudTheme';

/** Tamanho do botão redondo de voltar (alvo de toque folgado; o `RoundButton` ainda soma `hitSlop`). */
const BACK_SIZE = 40;

/**
 * Volta ao Painel, não à tela anterior: fecha todas as subtelas empilhadas por cima dele (ex.: Gabinete → Legado).
 * Aberta direto por link, sem o Painel na pilha, a subtela é trocada por ele.
 */
export function goBackToPainel(): void {
  router.dismissTo('/painel');
}

/** Botão redondo "Voltar ao Painel" no visual do HUD (usado na barra das subtelas e flutuante nas de tela cheia). */
export function BackToPainelButton({ size = BACK_SIZE }: { size?: number }) {
  return (
    <RoundButton
      icon={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
      label="Voltar ao Painel"
      size={size}
      onPress={goBackToPainel}
    />
  );
}

/**
 * Moldura das subtelas do Painel (Gabinete, Congresso, Economia): barra escura do HUD com o botão de voltar, o
 * título e, com partida aberta, a faixa de mês, ações de agenda e capital político. O corpo mantém o esqueleto das
 * antigas abas: carregamento, aviso de erro, mensagem sem partida e rolagem que volta ao topo ao trocar de partida.
 * Sempre escura como o Painel: o corpo roda sob `ForceHudTheme` e a barra de status é clara.
 */
export function SubScreen({ title, render }: { title: string; render: (campaign: ActiveCampaign) => ReactNode }) {
  return (
    <ForceHudTheme>
      <StatusBar style="light" />
      <SubScreenBody title={title} render={render} />
    </ForceHudTheme>
  );
}

function SubScreenBody({ title, render }: { title: string; render: (campaign: ActiveCampaign) => ReactNode }) {
  const { colors } = useTheme();
  const status = useGame((s) => s.status);
  const error = useGame((s) => s.error);
  const active = useGame((s) => s.active);
  const insets = useSafeAreaInsets();
  // Em paisagem o entalhe/gaveta fica nas laterais: o conteúdo rola dentro da área segura.
  const sideInsets = { paddingLeft: Spacing.three + insets.left, paddingRight: Spacing.three + insets.right };

  const bar = <TopBar title={title} campaign={status === 'iniciando' ? undefined : active} />;

  if (status === 'iniciando') {
    return (
      <View style={[styles.root, { backgroundColor: Hud.board }]}>
        {bar}
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </View>
    );
  }

  const alert = error ? <Alert tone="negative" title="Algo deu errado ao salvar ou carregar" message={error} /> : null;

  return (
    <View style={[styles.root, { backgroundColor: Hud.board }]}>
      {bar}
      {active ? (
        // key: trocar de partida recria a rolagem, voltando ao topo
        <ScrollView
          key={active.id}
          style={styles.root}
          contentContainerStyle={[styles.content, sideInsets, { paddingBottom: Spacing.six + insets.bottom }]}>
          {alert}
          {render(active)}
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.root}
          contentContainerStyle={[
            styles.content,
            styles.fill,
            sideInsets,
            { paddingBottom: Spacing.six + insets.bottom },
          ]}>
          {alert}
          <NoCampaign />
        </ScrollView>
      )}
    </View>
  );
}

/** Barra superior no visual do HUD, abaixo da área segura do topo: voltar, título e a faixa de situação. */
function TopBar({ title, campaign }: { title: string; campaign?: ActiveCampaign | null }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: insets.top + Spacing.two,
          paddingLeft: Spacing.three + insets.left,
          paddingRight: Spacing.three + insets.right,
        },
      ]}>
      <View style={styles.barRow}>
        <BackToPainelButton />
        <Text style={styles.barTitle} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {campaign ? <StatusStrip campaign={campaign} /> : null}
    </View>
  );
}

/** Faixa compacta: mês, ações de agenda que ainda cabem no mês (descontado o rascunho) e capital político. */
function StatusStrip({ campaign }: { campaign: ActiveCampaign }) {
  const { state, finished } = campaign;
  const draft = useGame((s) => s.draft);
  const content = useMemo(() => loadContent(state.scenarioId), [state.scenarioId]);
  const actionsLeft = state.resources.agendaActionsPerMonth - draftCost(draft, content);
  return (
    <View style={styles.strip}>
      <Text tabular style={styles.stripText}>
        {/* Encerrada, `monthIndex` já é o mês seguinte ao último jogado. */}
        {shortMonthLabel(finished ? Math.max(0, state.monthIndex - 1) : state.monthIndex)}
      </Text>
      <Text style={styles.stripDot}>·</Text>
      <Text tabular style={[styles.stripText, actionsLeft <= 0 && styles.stripWarn]}>
        {`${actionsLeft} ${actionsLeft === 1 ? 'ação restante' : 'ações restantes'}`}
      </Text>
      <Text style={styles.stripDot}>·</Text>
      <Text tabular style={styles.stripText}>
        {`Capital político ${formatNumber(state.resources.politicalCapital)}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bar: {
    backgroundColor: Hud.board,
    borderBottomWidth: 1,
    borderBottomColor: Hud.border,
    paddingBottom: Spacing.two,
    gap: Spacing.two,
  },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  barTitle: { flex: 1, color: Hud.title, fontSize: 20, lineHeight: 26, fontWeight: '700' },
  strip: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: Spacing.two },
  stripText: { color: Hud.textDim, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  stripWarn: { color: Hud.warning },
  stripDot: { color: Hud.textMuted, fontSize: 12, lineHeight: 16 },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  fill: { flexGrow: 1, justifyContent: 'center' },
});
