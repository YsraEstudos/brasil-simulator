import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Alert, Card, Text } from '@/components/ui';
import { MaxContentWidth, MIN_TOUCH, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  CAMPAIGN_NAME_MAX,
  checkSetupForm,
  DIFFICULTIES,
  gameStore,
  hasPendingChoices,
  scenarioOptions,
  useGame,
  type CampaignSetupForm,
  type SetupPrefs,
} from '@/store';

import {
  difficultyView,
  durationLabel,
  SCENARIO_KIND_LABEL,
  scenarioDataNote,
  scenarioFeatures,
  scenarioTitle,
  setupSummary,
  startLabel,
} from './campaignSetupView';
import {
  Badge,
  Collapsible,
  ConfirmSheet,
  enterAt,
  goBack,
  LAYOUT,
  OptionCard,
  PrimaryAction,
  SetupHeader,
  SummaryRow,
} from './SetupBits';

const SCENARIOS = scenarioOptions();

/**
 * NOVO JOGO (rota `/novo-jogo`): nome, dificuldade, cenário, semente opcional e resumo, numa única rolagem. O
 * formulário é local à tela; a campanha aberta (e o rascunho do mês) só muda depois que a nova é gravada.
 */
export function NewCampaignScreen() {
  const { colors } = useTheme();
  const status = useGame((s) => s.status);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {status === 'pronto' ? (
        <NewCampaignForm
          insetTop={insets.top}
          insetBottom={insets.bottom}
          insetLeft={insets.left}
          insetRight={insets.right}
        />
      ) : (
        <View style={styles.center}>
          {status === 'erro' ? (
            <View style={styles.centerBox}>
              <Alert
                tone="negative"
                title="Não foi possível abrir o banco de partidas"
                message={gameStore.getState().error ?? 'Feche e abra o aplicativo de novo.'}
              />
              <PrimaryAction label="VOLTAR AO MENU" onPress={goBack} />
            </View>
          ) : (
            <ActivityIndicator color={colors.accent} size="large" accessibilityLabel="Carregando" />
          )}
        </View>
      )}
    </View>
  );
}

function initialForm(prefs: SetupPrefs): CampaignSetupForm {
  return { name: '', difficulty: prefs.difficulty, scenarioId: prefs.scenarioId, seedText: '' };
}

function NewCampaignForm({
  insetTop,
  insetBottom,
  insetLeft,
  insetRight,
}: {
  insetTop: number;
  insetBottom: number;
  insetLeft: number;
  insetRight: number;
}) {
  const { colors, textScale } = useTheme();
  const busy = useGame((s) => s.busy);
  // Preferências lidas uma única vez no início do app: o formulário nasce com elas e não é sobrescrito depois.
  const [form, setForm] = useState<CampaignSetupForm>(() => initialForm(gameStore.getState().setupPrefs));
  const [nameTouched, setNameTouched] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showOlder, setShowOlder] = useState(() => SCENARIOS.find((o) => o.id === form.scenarioId)?.kind !== 'atual');
  const [confirm, setConfirm] = useState<null | { pending: boolean }>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Trava síncrona: cobre a janela entre o fim da gravação e a troca de tela, quando `busy` já voltou a falso.
  const submitLock = useRef(false);
  const completed = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    // Reativa ao remontar (StrictMode e fast refresh desmontam e remontam os efeitos).
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Se esta tela voltar a ganhar foco depois de uma criação concluída, começa do zero (nome e semente vazios).
  useFocusEffect(
    useCallback(() => {
      if (!completed.current) return;
      completed.current = false;
      submitLock.current = false;
      setForm(initialForm(gameStore.getState().setupPrefs));
      setNameTouched(false);
      setAttempted(false);
      setSubmitError(null);
      setConfirm(null);
      setSubmitting(false);
    }, []),
  );

  // Android: o "voltar" do sistema não sai da tela no meio da gravação.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => submitLock.current);
    return () => sub.remove();
  }, []);

  const check = useMemo(() => checkSetupForm(form), [form]);
  const errors = check.ok ? {} : check.errors;
  const summary = useMemo(() => setupSummary(form), [form]);
  const difficulty = difficultyView(form.difficulty);
  const current = SCENARIOS.filter((o) => o.kind === 'atual');
  const older = SCENARIOS.filter((o) => o.kind !== 'atual');
  const nameError = (nameTouched || attempted) && errors.name ? errors.name : null;
  const seedError = errors.seed ?? null;
  const locked = submitting || busy;

  const update = (patch: Partial<CampaignSetupForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setSubmitError(null);
  };

  const create = async () => {
    if (submitLock.current) return;
    const final = checkSetupForm(form);
    if (!final.ok) {
      setAttempted(true);
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setConfirm(null);
    const { seed, ...rest } = final.input;
    const result = await gameStore.getState().newCampaign({ ...rest, seed: seed ?? undefined });
    if (!mounted.current) return;
    if (result.ok) {
      // A campanha está gravada: entra na Presidência sem deixar o formulário enviado na pilha.
      completed.current = true;
      router.replace('/presidencia');
      return;
    }
    submitLock.current = false;
    setSubmitting(false);
    setSubmitError(result.error);
  };

  const onSubmit = () => {
    if (submitLock.current) return;
    if (!check.ok) {
      setAttempted(true);
      return;
    }
    const { active, draft } = gameStore.getState();
    if (active) {
      setConfirm({ pending: !active.finished && hasPendingChoices(draft) });
      return;
    }
    void create();
  };

  const inputStyle = [
    styles.input,
    { color: colors.text, backgroundColor: colors.background, fontSize: 16 * textScale },
  ];

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: !locked }} />
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: Spacing.three + insetTop,
              paddingBottom: Spacing.six + insetBottom,
              // Em paisagem o recorte da câmera fica de um lado só: cada lado recebe o próprio inset.
              paddingLeft: Spacing.three + insetLeft,
              paddingRight: Spacing.three + insetRight,
            },
          ]}>
          <SetupHeader
            title="NOVO JOGO"
            subtitle="Prepare sua candidatura à Presidência"
            onBack={goBack}
            backDisabled={locked}
          />

          <Animated.View entering={enterAt(0)} layout={LAYOUT}>
            <Card title="Identidade da campanha" subtitle="Como esta partida aparecerá na lista de saves">
              <Text variant="label" color="textSecondary" nativeID="campaign-name-label">
                Nome da campanha
              </Text>
              <TextInput
                value={form.name}
                onChangeText={(name) => update({ name })}
                onBlur={() => setNameTouched(true)}
                placeholder="Ex.: Governo de união nacional"
                placeholderTextColor={colors.textMuted}
                // Limite nativo (RF04): o campo não passa de 60 unidades; a store ainda recusa nome longo vindo de
                // outro caminho e a normalização remove metade solta de emoji se o corte cair no meio de um.
                maxLength={CAMPAIGN_NAME_MAX}
                multiline={false}
                returnKeyType="done"
                autoCapitalize="sentences"
                editable={!locked}
                accessibilityLabel="Nome da campanha"
                accessibilityLabelledBy="campaign-name-label"
                accessibilityHint={`Obrigatório, até ${CAMPAIGN_NAME_MAX} caracteres`}
                style={[...inputStyle, { borderColor: nameError ? colors.negative : colors.border }]}
              />
              <View style={styles.fieldFoot}>
                {nameError ? (
                  <Animated.View
                    entering={FadeInDown.duration(200)}
                    exiting={FadeOut.duration(120)}
                    style={styles.flex}>
                    <Text variant="caption" color="negative" accessibilityLiveRegion="polite" accessibilityRole="alert">
                      {nameError}
                    </Text>
                  </Animated.View>
                ) : (
                  <View style={styles.flex} />
                )}
                <Text variant="caption" color="textMuted" tabular>
                  {`${form.name.length}/${CAMPAIGN_NAME_MAX}`}
                </Text>
              </View>
            </Card>
          </Animated.View>

          <Animated.View entering={enterAt(1)} layout={LAYOUT}>
            <Card title="Dificuldade" subtitle="Muda regras e incerteza; a contabilidade do motor é a mesma">
              <View style={styles.options} accessibilityRole="radiogroup">
                {DIFFICULTIES.map((id) => {
                  const d = difficultyView(id);
                  return (
                    <OptionCard
                      key={id}
                      selected={form.difficulty === id}
                      disabled={locked}
                      onPress={() => update({ difficulty: id })}
                      accessibilityLabel={`${d.name}, ${d.actionsPerMonth} ações de agenda por mês. ${d.tagline}`}>
                      <View style={styles.optionTitle}>
                        <Text variant="heading" style={styles.flex}>
                          {d.name}
                        </Text>
                        <Badge label={`${d.actionsPerMonth} ações/mês`} />
                      </View>
                      <Text variant="caption" color="textSecondary">
                        {d.tagline}
                      </Text>
                    </OptionCard>
                  );
                })}
              </View>
              <Animated.View
                key={form.difficulty}
                entering={FadeIn.duration(280)}
                layout={LAYOUT}
                style={[styles.effects, { borderColor: colors.border }]}>
                <Text variant="label" color="accent">
                  {`Na ${difficulty.name}`}
                </Text>
                {difficulty.effects.map((effect, i) => (
                  <Animated.View
                    key={effect}
                    entering={FadeInDown.duration(240).delay(i * 35)}
                    style={styles.effectRow}>
                    <Text variant="caption" color="accent">
                      ◆
                    </Text>
                    <Text variant="caption" style={styles.flex}>
                      {effect}
                    </Text>
                  </Animated.View>
                ))}
              </Animated.View>
            </Card>
          </Animated.View>

          <Animated.View entering={enterAt(2)} layout={LAYOUT}>
            <Card title="Cenário" subtitle="Ponto de partida e conteúdo disponível">
              <View style={styles.options} accessibilityRole="radiogroup">
                {current.map((o) => (
                  <ScenarioOptionCard
                    key={o.id}
                    option={o}
                    selected={form.scenarioId === o.id}
                    disabled={locked}
                    onSelect={() => update({ scenarioId: o.id })}
                  />
                ))}
              </View>
              {older.length > 0 && (
                <Collapsible
                  title="Cenários históricos e experimentais"
                  hint="Versões anteriores do cenário e o protótipo fictício"
                  open={showOlder}
                  onToggle={() => setShowOlder((v) => !v)}>
                  <Text variant="caption" color="textSecondary">
                    Versões anteriores continuam disponíveis para reproduzir partidas antigas; têm menos conteúdo e
                    duração menor.
                  </Text>
                  <View style={styles.options} accessibilityRole="radiogroup">
                    {older.map((o) => (
                      <ScenarioOptionCard
                        key={o.id}
                        option={o}
                        selected={form.scenarioId === o.id}
                        disabled={locked}
                        onSelect={() => update({ scenarioId: o.id })}
                      />
                    ))}
                  </View>
                </Collapsible>
              )}
            </Card>
          </Animated.View>

          <Animated.View entering={enterAt(3)} layout={LAYOUT}>
            <Card>
              <Collapsible
                title="OPÇÕES AVANÇADAS"
                hint="Semente da simulação"
                open={showAdvanced || seedError !== null}
                onToggle={() => setShowAdvanced((v) => !v)}>
                <Text variant="label" color="textSecondary" nativeID="campaign-seed-label">
                  Semente da simulação (opcional)
                </Text>
                <Text variant="caption" color="textSecondary">
                  Usar a mesma semente com o mesmo cenário, dificuldade e decisões permite reproduzir os resultados da
                  simulação na mesma versão do motor.
                </Text>
                <TextInput
                  value={form.seedText}
                  onChangeText={(seedText) => update({ seedText })}
                  placeholder="Vazio = aleatória"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={16}
                  multiline={false}
                  editable={!locked}
                  accessibilityLabel="Semente da simulação, opcional"
                  accessibilityLabelledBy="campaign-seed-label"
                  accessibilityHint="Número inteiro de 0 a 4.294.967.295. Deixe vazio para sortear"
                  style={[...inputStyle, { borderColor: seedError ? colors.negative : colors.border }]}
                />
                {seedError && (
                  <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(120)}>
                    <Text variant="caption" color="negative" accessibilityLiveRegion="polite" accessibilityRole="alert">
                      {seedError}
                    </Text>
                  </Animated.View>
                )}
              </Collapsible>
            </Card>
          </Animated.View>

          <Animated.View entering={enterAt(4)} layout={LAYOUT}>
            <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
              <Text variant="label" color="accent" style={styles.summaryTitle} accessibilityRole="header">
                RESUMO DA CAMPANHA
              </Text>
              <View style={[styles.rule, { backgroundColor: colors.border }]} />
              <SummaryRow label="Nome" value={summary.name ?? 'Sem nome'} muted={summary.name === null} />
              <SummaryRow label="Dificuldade" value={summary.difficulty} />
              <SummaryRow label="Ações de agenda" value={`${summary.actionsPerMonth} por mês`} />
              <SummaryRow label="Cenário" value={summary.scenario} />
              <SummaryRow label="Versão" value={summary.version} />
              <SummaryRow label="Duração máxima" value={summary.duration} />
              <SummaryRow label="Semente" value={summary.seed} muted={summary.seed === 'Aleatória'} />
            </View>
          </Animated.View>

          {submitError && (
            <Animated.View entering={FadeInDown.springify().damping(16)} exiting={FadeOut} layout={LAYOUT}>
              <Alert tone="negative" title="Não foi possível criar a campanha" message={submitError} />
            </Animated.View>
          )}

          <Animated.View entering={enterAt(5)} layout={LAYOUT} style={styles.actions}>
            <PrimaryAction
              label={submitting ? 'TOMANDO POSSE…' : 'TOMAR POSSE'}
              onPress={onSubmit}
              disabled={!check.ok || busy}
              loading={submitting}
              hint="Cria a campanha e abre a Presidência"
            />
            {!check.ok && (
              <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)}>
                <Text variant="caption" color={attempted ? 'negative' : 'textSecondary'} align="center">
                  {errors.name ? 'Dê um nome à campanha para tomar posse.' : 'Corrija a semente para tomar posse.'}
                </Text>
              </Animated.View>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {confirm && (
        <ConfirmSheet
          title="Iniciar outra campanha?"
          message={
            confirm.pending
              ? 'Você possui uma campanha em andamento. A partida continuará salva, mas as decisões ainda não confirmadas deste mês serão descartadas ao iniciar outra campanha.'
              : 'Você possui uma campanha em andamento. Ela continuará salva e poderá ser retomada em CARREGAR JOGO.'
          }
          confirmLabel="INICIAR NOVA CAMPANHA"
          onConfirm={() => void create()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

function ScenarioOptionCard({
  option,
  selected,
  disabled,
  onSelect,
}: {
  option: ReturnType<typeof scenarioOptions>[number];
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  const { scenario, kind, months } = option;
  const title = scenarioTitle(scenario);
  const note = scenarioDataNote(scenario);
  const features = scenarioFeatures(scenario);
  return (
    <OptionCard
      selected={selected}
      disabled={disabled}
      onPress={onSelect}
      accessibilityLabel={`${title}, versão ${scenario.version}, ${SCENARIO_KIND_LABEL[kind]}, duração máxima de ${durationLabel(months)}`}>
      <View style={styles.optionTitle}>
        <Text variant="heading" style={styles.flex}>
          {title}
        </Text>
        <Badge
          label={SCENARIO_KIND_LABEL[kind]}
          tone={kind === 'atual' ? 'positive' : kind === 'experimental' ? 'warning' : 'textSecondary'}
        />
      </View>
      <Text variant="caption" color="textSecondary">
        {`v${scenario.version} · início em ${startLabel(scenario.startPeriod)} · duração máxima de ${durationLabel(months)}`}
      </Text>
      {note && (
        <Text variant="caption" color="warning">
          {note.charAt(0).toUpperCase() + note.slice(1)}
        </Text>
      )}
      {selected && (
        <Animated.View entering={FadeInDown.duration(240)} style={styles.features}>
          {features.map((f) => (
            <View key={f} style={styles.chip}>
              <Text variant="caption" color="textSecondary">
                {f}
              </Text>
            </View>
          ))}
        </Animated.View>
      )}
    </OptionCard>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  centerBox: { width: '100%', maxWidth: 460, gap: Spacing.three },
  content: { gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  input: {
    minHeight: MIN_TOUCH,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
  },
  fieldFoot: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  flex: { flex: 1, flexShrink: 1 },
  options: { gap: Spacing.two },
  optionTitle: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.two },
  effects: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
    marginTop: Spacing.one,
    gap: Spacing.one,
  },
  effectRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  features: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: Spacing.one },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(127, 127, 127, 0.5)',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  summary: { borderWidth: 1.5, borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.two },
  summaryTitle: { letterSpacing: 2 },
  rule: { height: StyleSheet.hairlineWidth },
  actions: { gap: Spacing.two },
});
