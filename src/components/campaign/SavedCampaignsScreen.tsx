import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOutLeft, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Alert, Text } from '@/components/ui';
import { MaxContentWidth, MIN_TOUCH, Radius, Spacing } from '@/constants/theme';
import type { CampaignSummary } from '@/database/campaignRepository';
import { useTheme } from '@/hooks/use-theme';
import { gameStore, hasPendingChoices, isKnownScenario, useGame } from '@/store';
import { campaignMonths, SCENARIOS } from '@/store/scenarios';

import { durationLabel, scenarioTitle } from './campaignSetupView';
import { CAREER_STAGE_LABEL, DIFFICULTY, shortMonthLabel } from './labels';
import { Badge, ConfirmSheet, enterAt, goBack, LAYOUT, PressScale, PrimaryAction, SetupHeader } from './SetupBits';

type Pending = { kind: 'carregar'; campaign: CampaignSummary } | { kind: 'apagar'; campaign: CampaignSummary };

/**
 * CARREGAR JOGO (rota `/carregar-jogo`): só as partidas salvas, sem formulário de criação. Abrir esta tela não
 * fecha a campanha em andamento; trocar de partida com decisões pendentes pede confirmação.
 */
export function SavedCampaignsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const status = useGame((s) => s.status);
  const busy = useGame((s) => s.busy);
  const error = useGame((s) => s.error);
  const campaigns = useGame((s) => s.campaigns);
  const activeId = useGame((s) => s.active?.id ?? null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  // Só erros das ações desta tela: o `error` global pode ser antigo (ex.: um mês que falhou ao encerrar).
  const [opError, setOpError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    // Reativa ao remontar (StrictMode e fast refresh desmontam e remontam os efeitos).
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = async (c: CampaignSummary) => {
    setPending(null);
    if (c.id === activeId) {
      // A mesma partida já está aberta: volta a ela sem recarregar (o rascunho do mês continua).
      router.replace('/painel');
      return;
    }
    setLoadingId(c.id);
    setOpError(null);
    const ok = await gameStore.getState().continueCampaign(c.id);
    if (!mounted.current) return;
    setLoadingId(null);
    if (ok) router.replace('/painel');
    else setOpError(gameStore.getState().error ?? 'Tente de novo em instantes.');
  };

  const requestLoad = (c: CampaignSummary) => {
    if (busy || loadingId) return;
    const { active, draft } = gameStore.getState();
    if (active && active.id !== c.id && !active.finished && hasPendingChoices(draft)) {
      setPending({ kind: 'carregar', campaign: c });
      return;
    }
    void load(c);
  };

  const remove = async (c: CampaignSummary) => {
    setPending(null);
    setOpError(null);
    const ok = await gameStore.getState().deleteCampaign(c.id);
    if (!ok && mounted.current) setOpError(gameStore.getState().error ?? 'Tente de novo em instantes.');
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Spacing.three + insets.top,
            paddingBottom: Spacing.six + insets.bottom,
            paddingLeft: Spacing.three + insets.left,
            paddingRight: Spacing.three + insets.right,
          },
        ]}>
        <SetupHeader title="CARREGAR JOGO" subtitle="Retome uma das suas campanhas" onBack={goBack} />

        {opError && status === 'pronto' && (
          <Animated.View entering={FadeInDown.springify().damping(16)} layout={LAYOUT}>
            <Alert tone="negative" title="Algo deu errado ao carregar ou apagar" message={opError} />
          </Animated.View>
        )}

        {status !== 'pronto' ? (
          <View style={styles.center}>
            {status === 'erro' ? (
              <Alert tone="negative" title="Não foi possível abrir o banco de partidas" message={error} />
            ) : (
              <ActivityIndicator color={colors.accent} size="large" accessibilityLabel="Carregando partidas" />
            )}
          </View>
        ) : campaigns.length === 0 ? (
          <Animated.View
            entering={ZoomIn.springify().damping(16)}
            layout={LAYOUT}
            style={[styles.empty, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text variant="heading" align="center" accessibilityRole="header">
              Nenhuma partida salva
            </Text>
            <Text variant="body" color="textSecondary" align="center">
              Você ainda não começou uma campanha.
            </Text>
            <PrimaryAction label="CRIAR NOVO JOGO" onPress={() => router.replace('/novo-jogo')} />
          </Animated.View>
        ) : (
          <View style={styles.list}>
            <Animated.View entering={FadeIn.duration(300)}>
              <Text variant="caption" color="textSecondary">
                {campaigns.length === 1 ? '1 campanha salva' : `${campaigns.length} campanhas salvas`}
              </Text>
            </Animated.View>
            {campaigns.map((c, i) => (
              <Animated.View key={c.id} entering={enterAt(i + 1)} exiting={FadeOutLeft.duration(220)} layout={LAYOUT}>
                <SavedItem
                  campaign={c}
                  isOpen={c.id === activeId}
                  loading={loadingId === c.id}
                  disabled={busy || loadingId !== null}
                  onLoad={() => requestLoad(c)}
                  onDelete={() => setPending({ kind: 'apagar', campaign: c })}
                />
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>

      {pending?.kind === 'carregar' && (
        <ConfirmSheet
          title="Trocar de campanha?"
          message={`A campanha aberta continuará salva, mas as decisões ainda não confirmadas deste mês serão descartadas ao carregar “${pending.campaign.name}”.`}
          confirmLabel="CARREGAR MESMO ASSIM"
          onConfirm={() => void load(pending.campaign)}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === 'apagar' && (
        <ConfirmSheet
          danger
          title="Apagar campanha?"
          message={`“${pending.campaign.name}” e todo o seu histórico serão apagados deste aparelho. Isso não pode ser desfeito.`}
          confirmLabel="APAGAR"
          onConfirm={() => void remove(pending.campaign)}
          onCancel={() => setPending(null)}
        />
      )}
    </View>
  );
}

function SavedItem({
  campaign: c,
  isOpen,
  loading,
  disabled,
  onLoad,
  onDelete,
}: {
  campaign: CampaignSummary;
  isOpen: boolean;
  loading: boolean;
  disabled: boolean;
  onLoad: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const done = c.status === 'encerrada';
  const scenario = isKnownScenario(c.scenarioId) ? SCENARIOS[c.scenarioId] : null;
  const months = campaignMonths(c.scenarioId);
  const scenarioText = scenario
    ? `${scenarioTitle(scenario)} · v${c.scenarioVersion}`
    : `${c.scenarioId} · v${c.scenarioVersion}`;
  // Antes da posse (PLANO_CAMPANHA.md Fase C1) o mês do mandato ainda não anda: mostra o estágio e o turno.
  const where = done
    ? `Encerrada · ${c.currentMonth} ${c.currentMonth === 1 ? 'mês jogado' : 'meses jogados'}`
    : c.stage
      ? `${CAREER_STAGE_LABEL[c.stage]} · turno ${c.currentTurn + 1} · antes da posse`
      : `${shortMonthLabel(c.currentMonth)} · mês ${c.currentMonth + 1} de até ${months}`;
  const difficulty = DIFFICULTY[c.difficulty]?.name ?? c.difficulty;

  return (
    <View
      style={[styles.item, { backgroundColor: colors.surface, borderColor: isOpen ? colors.accent : colors.border }]}>
      <View style={styles.itemHead}>
        <Text variant="heading" style={styles.flex} numberOfLines={2}>
          {c.name}
        </Text>
        <View style={styles.badges}>
          {isOpen && <Badge label="Aberta agora" />}
          <Badge label={done ? 'Encerrada' : 'Ativa'} tone={done ? 'textSecondary' : 'positive'} />
        </View>
      </View>
      <Text variant="caption" color="textSecondary">
        {scenarioText}
      </Text>
      <Text variant="caption" color="textSecondary">
        {`${difficulty} · ${where} · duração máxima de ${durationLabel(months)}`}
      </Text>
      <Text variant="caption" color="textMuted" selectable accessibilityHint="Toque e segure para copiar">
        {`Semente: ${c.seed}`}
      </Text>
      <View style={styles.itemActions}>
        <PressScale
          onPress={onLoad}
          disabled={disabled}
          accessibilityLabel={`${done ? 'Ver resultado de' : 'Continuar'} ${c.name}`}
          style={[styles.itemButton, { backgroundColor: colors.accent, borderColor: colors.accent }]}>
          {loading ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text variant="label" color="onAccent">
              {done ? 'Ver resultado' : 'Continuar'}
            </Text>
          )}
        </PressScale>
        <PressScale
          onPress={onDelete}
          disabled={disabled}
          accessibilityLabel={`Apagar ${c.name}`}
          style={[styles.itemButton, { borderColor: colors.border }]}>
          <Text variant="label" color="negative">
            Apagar
          </Text>
        </PressScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  center: { paddingVertical: Spacing.six, alignItems: 'center' },
  empty: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.three,
    alignItems: 'stretch',
    marginTop: Spacing.four,
  },
  list: { gap: Spacing.three },
  flex: { flex: 1, flexShrink: 1 },
  item: { borderWidth: 1.5, borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.one },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: Spacing.two },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  itemActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  itemButton: {
    minHeight: MIN_TOUCH,
    minWidth: 120,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
