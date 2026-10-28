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

import { Alert, Button, Card, Text } from '@/components/ui';
import { MaxContentWidth, MIN_TOUCH, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CHALLENGE_PRESETS, START_SITUATIONS, type ChallengeConfig } from '@/engine';
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
  createActionLabel,
  careerProfileViews,
  difficultyView,
  durationLabel,
  SCENARIO_KIND_LABEL,
  profilePresetViews,
  scenarioDataNote,
  scenarioFeatures,
  scenarioHasLean,
  scenarioTitle,
  setupSummary,
  startLabel,
  startPointViews,
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
const PROFILES = profilePresetViews();
const CHALLENGE_CONTROLS: readonly { key: keyof ChallengeConfig; label: string; detail: string }[] = [
  {
    key: 'economicPressure',
    label: 'Pressão econômica',
    detail: 'Altera o prêmio de risco inicial, em até 0,2 ponto percentual para cada lado do valor neutro.',
  },
  {
    key: 'oppositionStrength',
    label: 'Força da oposição',
    detail: 'Altera relações iniciais com blocos e reconhecimento dos adversários na campanha.',
  },
  {
    key: 'coalitionStability',
    label: 'Estabilidade da coalizão',
    detail: 'Altera lentamente as relações com os blocos a cada mês.',
  },
  {
    key: 'crisisFrequency',
    label: 'Frequência de crises climáticas',
    detail:
      'Altera a chance de eventos climáticos elegíveis; não modifica o clima. Só age em cenários com esses eventos.',
  },
];

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
  return {
    name: '',
    difficulty: prefs.difficulty,
    scenarioId: prefs.scenarioId,
    profileId: 'centro',
    startPoint: 'posse',
    startSituationId: 'normal',
    challenge: { ...CHALLENGE_PRESETS[prefs.difficulty] },
    institutionalRules: 'brasileiras',
    assistance: { informationClarity: 'padrao', hints: true },
    seedText: '',
  };
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
  const selectedScenario = SCENARIOS.find((o) => o.id === form.scenarioId)?.scenario;
  const current = SCENARIOS.filter((o) => o.kind === 'atual');
  const older = SCENARIOS.filter((o) => o.kind !== 'atual');
  const nameError = (nameTouched || attempted) && errors.name ? errors.name : null;
  const seedError = errors.seed ?? null;
  const locked = submitting || busy;

  const startPoints = startPointViews(form.scenarioId);
  const careerProfiles = careerProfileViews(form.scenarioId);

  const update = (patch: Partial<CampaignSetupForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setSubmitError(null);
  };
  // Trocar de cenário mantém o ponto de partida só se o novo cenário o oferece.
  const selectScenario = (scenarioId: string) =>
    update({
      scenarioId,
      careerProfileId: undefined,
      startPoint: startPointViews(scenarioId).some((p) => p.id === form.startPoint) ? form.startPoint : 'posse',
    });

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
      // A campanha está gravada: entra no Painel sem deixar o formulário enviado na pilha.
      completed.current = true;
      router.replace('/painel');
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

          <Button
            label="Experimentar tutorial jogável"
            variant="secondary"
            disabled={locked}
            onPress={() => router.push('/tutorial')}
            block
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
            <Card
              title="Dificuldade"
              subtitle="Muda desafio e previsões; as regras institucionais são escolhidas separadamente">
              <View style={styles.options} accessibilityRole="radiogroup">
                {DIFFICULTIES.map((id) => {
                  const d = difficultyView(id);
                  return (
                    <OptionCard
                      key={id}
                      selected={form.difficulty === id}
                      disabled={locked}
                      onPress={() => update({ difficulty: id, challenge: { ...CHALLENGE_PRESETS[id] } })}
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
            <Card title="Assistência" subtitle="A clareza altera pesquisas e pareceres, sem mudar a realidade simulada">
              <View style={styles.options} accessibilityRole="radiogroup">
                {(
                  [
                    {
                      id: 'clara',
                      title: 'Mais clara',
                      detail: 'Pesquisa com menor ruído e parecer de votação aproximado.',
                    },
                    { id: 'padrao', title: 'Padrão', detail: 'Pesquisa e pareceres com incerteza intermediária.' },
                    {
                      id: 'incerta',
                      title: 'Mais incerta',
                      detail: 'Pesquisa com maior ruído e pareceres com faixa mais ampla e viés.',
                    },
                  ] as const
                ).map((option) => (
                  <OptionCard
                    key={option.id}
                    selected={(form.assistance?.informationClarity ?? 'padrao') === option.id}
                    disabled={locked}
                    onPress={() =>
                      update({ assistance: { ...(form.assistance ?? { hints: true }), informationClarity: option.id } })
                    }
                    accessibilityLabel={`${option.title}. ${option.detail}`}>
                    <Text variant="heading">{option.title}</Text>
                    <Text variant="caption" color="textSecondary">
                      {option.detail}
                    </Text>
                  </OptionCard>
                ))}
              </View>
              <Button
                label={
                  (form.assistance?.hints ?? true)
                    ? 'Dicas ligadas · tocar para desligar'
                    : 'Dicas desligadas · tocar para ligar'
                }
                variant="secondary"
                disabled={locked}
                onPress={() =>
                  update({
                    assistance: {
                      informationClarity: form.assistance?.informationClarity ?? 'padrao',
                      hints: !(form.assistance?.hints ?? true),
                    },
                  })
                }
                block
              />
            </Card>
          </Animated.View>

          <Animated.View entering={enterAt(2)} layout={LAYOUT}>
            <Card title="Regras institucionais" subtitle="A escolha vale para qualquer nível de desafio">
              <View style={styles.options} accessibilityRole="radiogroup">
                <OptionCard
                  selected={form.institutionalRules !== 'simplificadas'}
                  disabled={locked}
                  onPress={() => update({ institutionalRules: 'brasileiras' })}
                  accessibilityLabel="Regras brasileiras: calendário, vedação eleitoral e adesão dos estados são considerados.">
                  <Text variant="heading">Brasileiras</Text>
                  <Text variant="caption" color="textSecondary">
                    Considera calendário legislativo, vedação eleitoral e adesão dos estados.
                  </Text>
                </OptionCard>
                <OptionCard
                  selected={form.institutionalRules === 'simplificadas'}
                  disabled={locked}
                  onPress={() => update({ institutionalRules: 'simplificadas' })}
                  accessibilityLabel="Regras simplificadas: cenário ficcional com desvios institucionais.">
                  <Text variant="heading">Simplificadas · ficção</Text>
                  <Text variant="caption" color="textSecondary">
                    Remove essas restrições e simplifica regras financeiras de campanha; não representa o processo
                    brasileiro.
                  </Text>
                </OptionCard>
              </View>
            </Card>
          </Animated.View>

          <Animated.View entering={enterAt(2)} layout={LAYOUT}>
            <Card
              title="Ajustes de desafio"
              subtitle="O preset define os valores iniciais; ajuste cada um de 0 a 100. São hipóteses de jogo provisórias.">
              {CHALLENGE_CONTROLS.map((control) => {
                const value = form.challenge?.[control.key] ?? 0.5;
                const change = (delta: number) =>
                  update({
                    challenge: {
                      ...(form.challenge ?? CHALLENGE_PRESETS[form.difficulty]),
                      [control.key]: Math.max(0, Math.min(1, Math.round((value + delta) * 10) / 10)),
                    },
                  });
                return (
                  <View key={control.key} style={styles.effects}>
                    <Text variant="label">{`${control.label}: ${Math.round(value * 100)} de 100`}</Text>
                    <Text variant="caption" color="textSecondary">
                      {control.detail}
                    </Text>
                    <Button
                      label={`Diminuir ${control.label}`}
                      variant="secondary"
                      disabled={locked || value <= 0}
                      onPress={() => change(-0.1)}
                      block
                    />
                    <Button
                      label={`Aumentar ${control.label}`}
                      variant="secondary"
                      disabled={locked || value >= 1}
                      onPress={() => change(0.1)}
                      block
                    />
                  </View>
                );
              })}
            </Card>
          </Animated.View>

          <Animated.View entering={enterAt(2)} layout={LAYOUT}>
            <Card
              title="Perfil do governo"
              subtitle="Onde o governo começa nos eixos Estado ↔ mercado e progressista ↔ conservador">
              <View style={styles.options} accessibilityRole="radiogroup">
                {PROFILES.map((p) => (
                  <OptionCard
                    key={p.id}
                    selected={form.profileId === p.id}
                    disabled={locked}
                    onPress={() => update({ profileId: p.id })}
                    accessibilityLabel={`${p.name}, ${p.axes}. ${p.description}`}>
                    <View style={styles.optionTitle}>
                      <Text variant="heading" style={styles.flex}>
                        {p.name}
                      </Text>
                      <Badge label={p.axes} />
                    </View>
                    <Text variant="caption" color="textSecondary">
                      {p.description}
                    </Text>
                  </OptionCard>
                ))}
              </View>
              <Text variant="caption" color="textSecondary">
                {scenarioHasLean(selectedScenario)
                  ? 'O perfil muda com o que o governo decide e mexe na aprovação de cada estado e, pouco, na nacional. Nenhuma posição é premiada em si.'
                  : 'Este cenário não traz a inclinação política dos estados: o perfil é registrado, mas não muda a aprovação.'}
              </Text>
            </Card>
          </Animated.View>

          <Animated.View entering={enterAt(3)} layout={LAYOUT}>
            <Card
              title="Situação inicial"
              subtitle="Hipóteses fictícias para variar as condições econômicas da partida">
              <View style={styles.options} accessibilityRole="radiogroup">
                {START_SITUATIONS.map((situation) => (
                  <OptionCard
                    key={situation.id}
                    selected={(form.startSituationId ?? 'normal') === situation.id}
                    disabled={locked}
                    onPress={() => update({ startSituationId: situation.id })}
                    accessibilityLabel={`${situation.name}. ${situation.description}`}>
                    <Text variant="heading">{situation.name}</Text>
                    <Text variant="caption" color="textSecondary">
                      {situation.description}
                    </Text>
                  </OptionCard>
                ))}
              </View>
            </Card>
          </Animated.View>

          <Animated.View entering={enterAt(3)} layout={LAYOUT}>
            <Card title="Cenário" subtitle="Ponto de partida e conteúdo disponível">
              <View style={styles.options} accessibilityRole="radiogroup">
                {current.map((o) => (
                  <ScenarioOptionCard
                    key={o.id}
                    option={o}
                    selected={form.scenarioId === o.id}
                    disabled={locked}
                    onSelect={() => selectScenario(o.id)}
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
                        onSelect={() => selectScenario(o.id)}
                      />
                    ))}
                  </View>
                </Collapsible>
              )}
              {startPoints.length > 1 && (
                <>
                  <Text variant="label" color="textSecondary">
                    Ponto de partida
                  </Text>
                  <View style={styles.options} accessibilityRole="radiogroup">
                    {startPoints.map((p) => (
                      <OptionCard
                        key={p.id}
                        selected={(form.startPoint ?? 'posse') === p.id}
                        disabled={locked}
                        onPress={() => update({ startPoint: p.id, careerProfileId: undefined })}
                        accessibilityLabel={`${p.name}. ${p.description}`}>
                        <Text variant="heading">{p.name}</Text>
                        <Text variant="caption" color="textSecondary">
                          {p.description}
                        </Text>
                      </OptionCard>
                    ))}
                  </View>
                </>
              )}
              {form.startPoint !== 'posse' && careerProfiles.length > 0 && (
                <>
                  <Text variant="label" color="textSecondary">
                    Perfil do candidato
                  </Text>
                  <View style={styles.options} accessibilityRole="radiogroup">
                    {careerProfiles.map((p) => (
                      <OptionCard
                        key={p.id}
                        selected={(form.careerProfileId ?? careerProfiles[0].id) === p.id}
                        disabled={locked}
                        onPress={() => update({ careerProfileId: p.id })}
                        accessibilityLabel={`${p.name}. ${p.description}`}>
                        <Text variant="heading">{p.name}</Text>
                        <Text variant="caption" color="textSecondary">
                          {p.description}
                        </Text>
                      </OptionCard>
                    ))}
                  </View>
                </>
              )}
            </Card>
          </Animated.View>

          <Animated.View entering={enterAt(4)} layout={LAYOUT}>
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

          <Animated.View entering={enterAt(5)} layout={LAYOUT}>
            <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
              <Text variant="label" color="accent" style={styles.summaryTitle} accessibilityRole="header">
                RESUMO DA CAMPANHA
              </Text>
              <View style={[styles.rule, { backgroundColor: colors.border }]} />
              <SummaryRow label="Nome" value={summary.name ?? 'Sem nome'} muted={summary.name === null} />
              <SummaryRow label="Dificuldade" value={summary.difficulty} />
              <SummaryRow label="Ações de agenda" value={`${summary.actionsPerMonth} por mês`} />
              <SummaryRow label="Perfil inicial" value={summary.profile} />
              <SummaryRow label="Cenário" value={summary.scenario} />
              <SummaryRow label="Situação inicial" value={summary.startSituation} />
              <SummaryRow label="Desafio" value={summary.challenge} />
              <SummaryRow label="Regras" value={summary.institutionalRules} />
              <SummaryRow label="Assistência" value={summary.assistance} />
              <SummaryRow label="Ponto de partida" value={summary.startPoint} />
              {summary.careerProfile && <SummaryRow label="Candidato" value={summary.careerProfile} />}
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

          <Animated.View entering={enterAt(6)} layout={LAYOUT} style={styles.actions}>
            <PrimaryAction
              label={createActionLabel(form.startPoint, submitting)}
              onPress={onSubmit}
              disabled={!check.ok || busy}
              loading={submitting}
              hint="Cria a campanha e abre o Painel"
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
