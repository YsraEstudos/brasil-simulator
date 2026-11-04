import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOutLeft, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Alert, Text } from '@/components/ui';
import { MaxContentWidth, MIN_TOUCH, Radius, Spacing } from '@/constants/theme';
import type { CampaignSummary } from '@/database/campaignRepository';
import { useTheme } from '@/hooks/use-theme';
import { gameStore, hasPendingChoices, isKnownScenario, useGame } from '@/store';
import { governmentsLabel } from '@/store/governments';
import { campaignMonths, SCENARIOS } from '@/store/scenarios';
import {
  SAVED_LIST_FILTERS,
  SAVED_LIST_SORTS,
  type SavedListFilter,
  type SavedListPrefs,
  type SavedListSort,
} from '@/store/savedListPrefs';

import { durationLabel, scenarioTitle } from './campaignSetupView';
import { CAREER_STAGE_LABEL, DIFFICULTY, shortMonthLabel } from './labels';
import { RenameCampaignSheet } from './RenameCampaignSheet';
import {
  deleteFinishedButtonLabel,
  deleteFinishedConfirmMessage,
  deletedResultMessage,
  emptyFilterLabel,
  finishedDeletionSummary,
  SAVED_LIST_FILTER_LABEL,
  SAVED_LIST_SORT_LABEL,
  savedListCountLabel,
  sortAndFilterCampaigns,
} from './savedList';
import { Badge, ConfirmSheet, enterAt, goBack, LAYOUT, PressScale, PrimaryAction, SetupHeader } from './SetupBits';
import { governmentSummaryLine, savedCardActivityLine } from './saveCardView';
import { pickSaveFileText, shareSaveFile } from './saveFiles';

type Pending =
  | { kind: 'carregar'; campaign: CampaignSummary }
  | { kind: 'recomecar'; campaign: CampaignSummary }
  | { kind: 'apagar'; campaign: CampaignSummary }
  | { kind: 'apagarEncerradas'; deletable: number; locked: number }
  | { kind: 'descartarRascunho'; campaign: CampaignSummary };

/** Ícones do cabeçalho do cartão: SF Symbols no iOS, Material Symbols no Android e na web. */
const ICON = {
  pin: { ios: 'pin.fill', android: 'push_pin', web: 'push_pin' },
  lockOn: { ios: 'lock.fill', android: 'lock', web: 'lock' },
  lockOff: { ios: 'lock.open', android: 'lock_open', web: 'lock_open' },
  rename: { ios: 'pencil', android: 'edit', web: 'edit' },
} satisfies Record<string, SymbolViewProps['name']>;

/**
 * CARREGAR JOGO (rota `/carregar-jogo`): só as partidas salvas, sem formulário de criação. Abrir esta tela não
 * fecha a campanha em andamento; trocar de partida com decisões pendentes pede confirmação.
 * A lista é filtrada e ordenada por `sortAndFilterCampaigns`; a escolha fica gravada (`savedListPrefs`).
 */
export function SavedCampaignsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const status = useGame((s) => s.status);
  const busy = useGame((s) => s.busy);
  const error = useGame((s) => s.error);
  const campaigns = useGame((s) => s.campaigns);
  const prefs = useGame((s) => s.savedListPrefs);
  const activeId = useGame((s) => s.active?.id ?? null);
  const draft = useGame((s) => s.draft);
  const hideSeed = useGame((s) => s.prefs.hideSeed);
  const governments = useGame((s) => s.governments);
  const [pending, setPending] = useState<Pending | null>(null);
  const [renaming, setRenaming] = useState<CampaignSummary | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [restartingId, setRestartingId] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  // Só erros das ações desta tela: o `error` global pode ser antigo (ex.: um mês que falhou ao encerrar).
  const [opError, setOpError] = useState<string | null>(null);
  // Resultado de um apagar em lote, lido em voz alta pelos leitores de tela.
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    // Reativa ao remontar (StrictMode e fast refresh desmontam e remontam os efeitos).
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const visible = useMemo(() => sortAndFilterCampaigns(campaigns, prefs), [campaigns, prefs]);
  const finished = useMemo(() => finishedDeletionSummary(campaigns), [campaigns]);
  const listBusy =
    busy || loadingId !== null || restartingId !== null || copyingId !== null || exportingId !== null || importing;

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

  /**
   * Descarta as decisões do mês ainda não confirmadas da partida aberta (PLANO_QUICK_WINS.md, B51). O rascunho vive só
   * na memória do app: descartar não mexe nos meses já gravados.
   */
  const discardDraft = () => {
    setPending(null);
    setOpError(null);
    gameStore.getState().clearDraft();
    setNotice('Decisões não confirmadas descartadas.');
  };

  const toggleSeed = () => void gameStore.getState().setPreference('hideSeed', !hideSeed);

  /** Recomeça a partida encerrada `c` com as mesmas opções: a nova fica ativa e o Painel abre (M4.3). */
  const restart = async (c: CampaignSummary) => {
    setPending(null);
    setOpError(null);
    setRestartingId(c.id);
    const result = await gameStore.getState().restartCampaign(c.id);
    if (!mounted.current) return;
    setRestartingId(null);
    if (result.ok) router.replace('/painel');
    else setOpError(result.error);
  };

  const requestRestart = (c: CampaignSummary) => {
    if (listBusy) return;
    // Recomeçar troca a partida ativa: se ela tem decisões do mês ainda não confirmadas, pede a mesma confirmação
    // de CARREGAR JOGO.
    const { active, draft } = gameStore.getState();
    if (active && !active.finished && hasPendingChoices(draft)) {
      setPending({ kind: 'recomecar', campaign: c });
      return;
    }
    void restart(c);
  };

  const remove = async (c: CampaignSummary) => {
    setPending(null);
    setOpError(null);
    const ok = await gameStore.getState().deleteCampaign(c.id);
    if (!ok && mounted.current) setOpError(gameStore.getState().error ?? 'Tente de novo em instantes.');
  };

  const choosePrefs = (next: SavedListPrefs) => {
    if (listBusy) return;
    void gameStore.getState().setSavedListPrefs(next);
  };

  const togglePinned = async (c: CampaignSummary) => {
    setOpError(null);
    const ok = await gameStore.getState().setCampaignPinned(c.id, !c.pinned);
    if (!ok && mounted.current) setOpError(gameStore.getState().error ?? 'Tente de novo em instantes.');
  };

  const toggleLocked = async (c: CampaignSummary) => {
    setOpError(null);
    const ok = await gameStore.getState().setCampaignLocked(c.id, !c.locked);
    if (!ok && mounted.current) setOpError(gameStore.getState().error ?? 'Tente de novo em instantes.');
  };

  const requestDeleteFinished = () => {
    if (listBusy || finished.deletable === 0) return;
    setNotice(null);
    setPending({ kind: 'apagarEncerradas', deletable: finished.deletable, locked: finished.locked });
  };

  const deleteFinished = async () => {
    setPending(null);
    setOpError(null);
    setNotice(null);
    const outcome = await gameStore.getState().deleteFinishedCampaigns();
    if (!mounted.current) return;
    if (outcome) setNotice(deletedResultMessage(outcome.deleted, outcome.keptLocked));
    else setOpError(gameStore.getState().error ?? 'Tente de novo em instantes.');
  };

  /** Duplica `c` ("Salvar como" da lista): a cópia aparece na lista com o nome "<nome> — cópia". */
  const duplicate = async (c: CampaignSummary) => {
    if (listBusy) return;
    setPending(null);
    setOpError(null);
    setNotice(null);
    setCopyingId(c.id);
    const copyId = await gameStore.getState().duplicateCampaign(c.id);
    if (!mounted.current) return;
    setCopyingId(null);
    if (copyId) {
      const copy = gameStore.getState().campaigns.find((x) => x.id === copyId);
      setNotice(copy ? `Cópia criada: ${copy.name}` : 'Cópia criada.');
    } else setOpError(gameStore.getState().error ?? 'Tente de novo em instantes.');
  };

  /** Exporta `c` como arquivo de save e abre o compartilhamento do sistema. */
  const exportOne = async (c: CampaignSummary) => {
    if (listBusy) return;
    setPending(null);
    setOpError(null);
    setNotice(null);
    setExportingId(c.id);
    let failure: string | null = null;
    try {
      const exported = await gameStore.getState().exportCampaign(c.id);
      if (exported) await shareSaveFile(exported.fileName, exported.json);
      else failure = gameStore.getState().error ?? 'Tente de novo em instantes.';
    } catch (e) {
      failure = e instanceof Error ? e.message : 'Não foi possível exportar este save.';
    }
    if (!mounted.current) return;
    setExportingId(null);
    if (failure) setOpError(failure);
  };

  /** Escolhe um arquivo de save e o importa como campanha nova (nunca sobrescreve uma existente). */
  const importSave = async () => {
    if (listBusy) return;
    setPending(null);
    setOpError(null);
    setNotice(null);
    setImporting(true);
    let importedId: string | null = null;
    let failure: string | null = null;
    try {
      const text = await pickSaveFileText();
      if (text !== null) {
        const result = await gameStore.getState().importCampaign(text);
        if (result.ok) importedId = result.campaignId;
        else failure = result.error;
      }
    } catch (e) {
      failure = e instanceof Error ? e.message : 'Não foi possível ler este arquivo.';
    }
    if (!mounted.current) return;
    setImporting(false);
    if (importedId) {
      const imported = gameStore.getState().campaigns.find((x) => x.id === importedId);
      setNotice(imported ? `Save importado: ${imported.name}` : 'Save importado.');
    } else if (failure) setOpError(failure);
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

        {governmentsLabel(governments) !== '' && (
          <Text variant="caption" color="textSecondary">
            {governmentsLabel(governments)}
          </Text>
        )}

        {opError && status === 'pronto' && (
          <Animated.View entering={FadeInDown.springify().damping(16)} layout={LAYOUT}>
            <Alert
              tone="negative"
              title="Algo deu errado ao carregar, editar, copiar, exportar, importar ou apagar"
              message={opError}
            />
          </Animated.View>
        )}

        {notice && status === 'pronto' && (
          <Animated.View entering={FadeInDown.springify().damping(16)} layout={LAYOUT}>
            <Alert tone="positive" title={notice} />
          </Animated.View>
        )}

        {status === 'pronto' && (
          <Animated.View entering={FadeIn.duration(300)} layout={LAYOUT}>
            <PressScale
              onPress={() => void importSave()}
              disabled={listBusy}
              accessibilityLabel="Importar save"
              accessibilityHint="Escolhe um arquivo de save exportado do jogo e cria uma campanha com ele"
              style={[styles.bulkButton, { borderColor: colors.accent }]}>
              {importing ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Text variant="label" color="accent" align="center">
                  Importar save
                </Text>
              )}
            </PressScale>
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
            <Animated.View entering={FadeIn.duration(300)} style={styles.controls}>
              <ChoiceRow<SavedListSort>
                label="Ordenar:"
                options={SAVED_LIST_SORTS}
                labels={SAVED_LIST_SORT_LABEL}
                value={prefs.sort}
                disabled={listBusy}
                onChange={(sort) => choosePrefs({ ...prefs, sort })}
              />
              <ChoiceRow<SavedListFilter>
                label="Mostrar:"
                options={SAVED_LIST_FILTERS}
                labels={SAVED_LIST_FILTER_LABEL}
                value={prefs.filter}
                disabled={listBusy}
                onChange={(filter) => choosePrefs({ ...prefs, filter })}
              />
            </Animated.View>

            <Animated.View entering={FadeIn.duration(300)}>
              <Text variant="caption" color="textSecondary">
                {savedListCountLabel(visible.length, campaigns.length, prefs.filter)}
              </Text>
            </Animated.View>

            {visible.length === 0 ? (
              <Animated.View
                entering={FadeIn.duration(250)}
                layout={LAYOUT}
                style={[styles.emptyFilter, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Text variant="body" color="textSecondary" align="center">
                  {emptyFilterLabel(prefs.filter)}
                </Text>
              </Animated.View>
            ) : (
              visible.map((c, i) => (
                <Animated.View key={c.id} entering={enterAt(i + 1)} exiting={FadeOutLeft.duration(220)} layout={LAYOUT}>
                  <SavedItem
                    campaign={c}
                    isOpen={c.id === activeId}
                    hasDraft={c.id === activeId && c.status !== 'encerrada' && hasPendingChoices(draft)}
                    seedHidden={hideSeed}
                    onToggleSeed={toggleSeed}
                    onDiscardDraft={() => setPending({ kind: 'descartarRascunho', campaign: c })}
                    loading={loadingId === c.id}
                    restarting={restartingId === c.id}
                    copying={copyingId === c.id}
                    exporting={exportingId === c.id}
                    disabled={listBusy}
                    onLoad={() => requestLoad(c)}
                    onRestart={() => requestRestart(c)}
                    onDuplicate={() => void duplicate(c)}
                    onExport={() => void exportOne(c)}
                    onDelete={() => setPending({ kind: 'apagar', campaign: c })}
                    onTogglePinned={() => void togglePinned(c)}
                    onToggleLocked={() => void toggleLocked(c)}
                    onRename={() => setRenaming(c)}
                  />
                </Animated.View>
              ))
            )}

            {prefs.filter === 'encerradas' && finished.deletable > 0 && (
              <Animated.View entering={enterAt(visible.length + 1)} layout={LAYOUT}>
                <PressScale
                  onPress={requestDeleteFinished}
                  disabled={listBusy}
                  accessibilityLabel={deleteFinishedButtonLabel(finished.deletable)}
                  style={[styles.bulkButton, { borderColor: colors.negative }]}>
                  <Text variant="label" color="negative" align="center">
                    {deleteFinishedButtonLabel(finished.deletable)}
                  </Text>
                </PressScale>
              </Animated.View>
            )}
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
      {pending?.kind === 'recomecar' && (
        <ConfirmSheet
          title="Recomeçar a partida?"
          message={`A campanha aberta continuará salva, mas as decisões ainda não confirmadas deste mês serão descartadas ao recomeçar “${pending.campaign.name}”.`}
          confirmLabel="RECOMEÇAR MESMO ASSIM"
          onConfirm={() => void restart(pending.campaign)}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === 'descartarRascunho' && (
        <ConfirmSheet
          danger
          title="Descartar as decisões deste mês?"
          message="As escolhas ainda não confirmadas deste mês são apagadas. Os meses já gravados não mudam."
          confirmLabel="DESCARTAR"
          onConfirm={discardDraft}
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
      {pending?.kind === 'apagarEncerradas' && (
        <ConfirmSheet
          danger
          title="Apagar campanhas encerradas?"
          message={deleteFinishedConfirmMessage(pending.deletable, pending.locked)}
          confirmLabel="APAGAR"
          onConfirm={() => void deleteFinished()}
          onCancel={() => setPending(null)}
        />
      )}
      {renaming && <RenameCampaignSheet key={renaming.id} campaign={renaming} onClose={() => setRenaming(null)} />}
    </View>
  );
}

/** Linha de escolha exclusiva (ordem ou filtro): rótulo à esquerda e chips com o selecionado em destaque. */
function ChoiceRow<T extends string>({
  label,
  options,
  labels,
  value,
  disabled,
  onChange,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  disabled: boolean;
  onChange: (next: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.choiceRow}>
      <Text variant="caption" color="textSecondary" style={styles.choiceLabel}>
        {label}
      </Text>
      <View style={styles.chips}>
        {options.map((option) => {
          const selected = option === value;
          return (
            <PressScale
              key={option}
              onPress={() => onChange(option)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityLabel={`${label} ${labels[option]}`}
              accessibilityState={{ selected }}
              style={[
                styles.chip,
                {
                  borderColor: selected ? colors.accent : colors.border,
                  backgroundColor: selected ? colors.accent : colors.surface,
                },
              ]}>
              <Text variant="caption" color={selected ? 'onAccent' : 'textSecondary'} style={styles.chipText}>
                {labels[option]}
              </Text>
            </PressScale>
          );
        })}
      </View>
    </View>
  );
}

/** Botão-ícone do cabeçalho do cartão (48 px de toque). `highlight` acende a cor quando fixada ou protegida. */
function CardIconButton({
  label,
  name,
  highlight,
  checked,
  disabled,
  onPress,
}: {
  label: string;
  name: SymbolViewProps['name'];
  highlight: boolean;
  /** Para alternadores (fixar, proteger): informa o estado ao leitor de tela. */
  checked?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityRole={checked === undefined ? 'button' : 'checkbox'}
      accessibilityState={checked === undefined ? undefined : { checked }}
      style={[
        styles.iconButton,
        {
          borderColor: highlight ? colors.accent : colors.border,
          backgroundColor: highlight ? colors.surfaceRaised : colors.surface,
        },
      ]}>
      <SymbolView name={name} size={22} tintColor={highlight ? colors.accent : colors.textSecondary} />
    </PressScale>
  );
}

function SavedItem({
  campaign: c,
  isOpen,
  hasDraft,
  seedHidden,
  onToggleSeed,
  onDiscardDraft,
  loading,
  restarting,
  copying,
  exporting,
  disabled,
  onLoad,
  onRestart,
  onDuplicate,
  onExport,
  onDelete,
  onTogglePinned,
  onToggleLocked,
  onRename,
}: {
  campaign: CampaignSummary;
  isOpen: boolean;
  /** Partida aberta com decisões do mês ainda não confirmadas (o rascunho). */
  hasDraft: boolean;
  seedHidden: boolean;
  onToggleSeed: () => void;
  onDiscardDraft: () => void;
  loading: boolean;
  restarting: boolean;
  copying: boolean;
  exporting: boolean;
  disabled: boolean;
  onLoad: () => void;
  onRestart: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
  onTogglePinned: () => void;
  onToggleLocked: () => void;
  onRename: () => void;
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
    : c.stage && c.stage !== 'governo'
      ? `${CAREER_STAGE_LABEL[c.stage]} · turno ${c.currentTurn + 1} · antes da posse`
      : `${shortMonthLabel(c.currentMonth)} · mês ${c.currentMonth + 1} de até ${months}`;
  const difficulty = DIFFICULTY[c.difficulty]?.name ?? c.difficulty;
  const summary = governmentSummaryLine(c.cardSummary, c.stage);
  const activity = savedCardActivityLine(c, new Date());

  return (
    <View
      style={[styles.item, { backgroundColor: colors.surface, borderColor: isOpen ? colors.accent : colors.border }]}>
      <View style={styles.itemHead}>
        <View style={styles.titleCol}>
          <Text variant="heading" numberOfLines={2}>
            {c.name}
          </Text>
          <View style={styles.badges}>
            {isOpen && <Badge label="Aberta agora" />}
            <Badge label={done ? 'Encerrada' : 'Ativa'} tone={done ? 'textSecondary' : 'positive'} />
          </View>
        </View>
        <View style={styles.iconRow}>
          <CardIconButton
            label={c.pinned ? 'Soltar do topo' : 'Fixar no topo'}
            name={ICON.pin}
            highlight={c.pinned}
            checked={c.pinned}
            disabled={disabled}
            onPress={onTogglePinned}
          />
          <CardIconButton
            label={c.locked ? 'Remover proteção' : 'Proteger contra exclusão'}
            name={c.locked ? ICON.lockOn : ICON.lockOff}
            highlight={c.locked}
            checked={c.locked}
            disabled={disabled}
            onPress={onToggleLocked}
          />
          <CardIconButton
            label={`Renomear ${c.name}`}
            name={ICON.rename}
            highlight={false}
            disabled={disabled}
            onPress={onRename}
          />
        </View>
      </View>
      <Text variant="caption" color="textSecondary">
        {scenarioText}
      </Text>
      <Text variant="caption" color="textSecondary">
        {`${difficulty} · ${where} · duração máxima de ${durationLabel(months)}`}
      </Text>
      {summary !== '' && (
        <Text variant="caption" color="textSecondary">
          {summary}
        </Text>
      )}
      {activity !== '' && (
        <Text variant="caption" color="textSecondary">
          {activity}
        </Text>
      )}
      <SeedRow seed={c.seed} hidden={seedHidden} onToggleHidden={onToggleSeed} />
      {hasDraft && (
        <PressScale
          onPress={onDiscardDraft}
          disabled={disabled}
          accessibilityLabel={`Descartar as decisões pendentes de ${c.name}`}
          accessibilityHint="Apaga as escolhas do mês que ainda não foram confirmadas"
          style={[styles.bulkButton, { borderColor: colors.negative }]}>
          <Text variant="label" color="negative" align="center">
            Descartar decisões pendentes
          </Text>
        </PressScale>
      )}
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
        {done && (
          <PressScale
            onPress={onRestart}
            disabled={disabled}
            accessibilityLabel={`Recomeçar ${c.name} com as mesmas opções`}
            style={[styles.itemButton, { borderColor: colors.accent }]}>
            {restarting ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text variant="label" color="accent">
                Recomeçar
              </Text>
            )}
          </PressScale>
        )}
        <PressScale
          onPress={onDuplicate}
          disabled={disabled}
          accessibilityLabel={`Duplicar ${c.name}`}
          style={[styles.itemButton, { borderColor: colors.accent }]}>
          {copying ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text variant="label" color="accent">
              Duplicar
            </Text>
          )}
        </PressScale>
        <PressScale
          onPress={onExport}
          disabled={disabled}
          accessibilityLabel={`Exportar ${c.name}`}
          style={[styles.itemButton, { borderColor: colors.accent }]}>
          {exporting ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text variant="label" color="accent">
              Exportar
            </Text>
          )}
        </PressScale>
        {c.locked ? (
          // Protegida: some o "Apagar" e fica um rótulo no lugar, para não parecer um botão desligado por engano.
          <View
            accessible
            accessibilityLabel={`${c.name} está protegida contra exclusão`}
            style={[styles.itemButton, styles.protectedTag, { borderColor: colors.border }]}>
            <SymbolView name={ICON.lockOn} size={16} tintColor={colors.textSecondary} />
            <Text variant="label" color="textSecondary">
              Protegida
            </Text>
          </View>
        ) : (
          <PressScale
            onPress={onDelete}
            disabled={disabled}
            accessibilityLabel={`Apagar ${c.name}`}
            style={[styles.itemButton, { borderColor: colors.border }]}>
            <Text variant="label" color="negative">
              Apagar
            </Text>
          </PressScale>
        )}
      </View>
    </View>
  );
}

type CopyStatus = 'idle' | 'copiada' | 'falhou';

/**
 * Semente em texto selecionável, com cópia em um toque; a confirmação some sozinha após 2 s. Oculta (D19): mostra só
 * pontos e não copia; o botão troca nos cartões todos de uma vez (preferência `hideSeed`).
 */
function SeedRow({ seed, hidden, onToggleHidden }: { seed: number; hidden: boolean; onToggleHidden: () => void }) {
  const { colors } = useTheme();
  const [status, setStatus] = useState<CopyStatus>('idle');
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Reativa ao remontar (StrictMode): sem isso a cópia em voo acharia que o cartão já saiu.
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = async () => {
    let next: CopyStatus;
    try {
      next = (await Clipboard.setStringAsync(String(seed))) ? 'copiada' : 'falhou';
    } catch {
      next = 'falhou';
    }
    if (!alive.current) return;
    setStatus(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus('idle'), 2000);
  };

  return (
    <View style={styles.seedRow}>
      <Text variant="caption" color="textMuted" selectable={!hidden} style={styles.seedText}>
        {hidden ? 'Semente: ••••••' : `Semente: ${seed}`}
      </Text>
      {!hidden && (
        <PressScale
          onPress={() => void copy()}
          accessibilityLabel={`Copiar semente ${seed}`}
          style={[styles.seedButton, { borderColor: colors.accent }]}>
          <Text variant="label" color="accent">
            Copiar
          </Text>
        </PressScale>
      )}
      <PressScale
        onPress={onToggleHidden}
        accessibilityLabel={hidden ? 'Mostrar a semente nos cartões' : 'Ocultar a semente nos cartões'}
        accessibilityHint="Vale para todas as partidas da lista e fica gravado neste aparelho"
        style={[styles.seedButton, { borderColor: colors.accent }]}>
        <Text variant="label" color="accent">
          {hidden ? 'Mostrar' : 'Ocultar'}
        </Text>
      </PressScale>
      {/* A região fica sempre montada: leitores de tela só anunciam mudanças em regiões que já existem. */}
      <Text
        variant="caption"
        color={status === 'falhou' ? 'negative' : 'positive'}
        accessibilityLiveRegion="polite"
        style={styles.seedText}>
        {status === 'copiada' ? 'Semente copiada' : status === 'falhou' ? 'Não foi possível copiar' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  seedRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.two },
  seedText: { flexShrink: 1 },
  seedButton: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  controls: { gap: Spacing.two },
  choiceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.two },
  choiceLabel: { minWidth: 76 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', flexShrink: 1, gap: Spacing.two },
  chip: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontWeight: '600' },
  emptyFilter: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    alignItems: 'stretch',
  },
  bulkButton: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  item: { borderWidth: 1.5, borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.one },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  titleCol: { flex: 1, flexShrink: 1, gap: Spacing.one },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  iconButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: MIN_TOUCH / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  protectedTag: { flexDirection: 'row', gap: Spacing.one },
});
