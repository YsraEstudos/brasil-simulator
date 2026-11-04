import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, ZoomIn } from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { MIN_TOUCH, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CAMPAIGN_NAME_MAX, gameStore, validateCampaignName } from '@/store';

import { PressScale } from './SetupBits';

/**
 * Folha de renomear uma campanha salva (tela CARREGAR JOGO). O campo segue o de "Nome da campanha" do novo jogo: o
 * erro aparece ao vivo, o contador mostra n/60 e Salvar fica desligado enquanto o nome for inválido.
 */
export function RenameCampaignSheet({
  campaign,
  onClose,
}: {
  campaign: { id: string; name: string };
  onClose: () => void;
}) {
  const { colors, textScale } = useTheme();
  const [value, setValue] = useState(campaign.name);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    // Reativa ao remontar (StrictMode): sem isso o retorno do salvamento acharia que a folha já fechou.
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Android: o "voltar" do sistema fecha só a folha.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  const check = validateCampaignName(value);
  const error = check.ok ? null : check.error;
  const canSave = check.ok && !saving;

  const save = async () => {
    if (!check.ok || saving) return;
    // Mesmo nome: nada a gravar.
    if (check.value === campaign.name) {
      onClose();
      return;
    }
    setSaving(true);
    setSaveError(null);
    const ok = await gameStore.getState().renameCampaign(campaign.id, check.value);
    if (!alive.current) return;
    setSaving(false);
    if (ok) onClose();
    else setSaveError(gameStore.getState().error ?? 'Tente de novo em instantes.');
  };

  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={styles.backdrop}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityLabel="Cancelar"
        accessibilityRole="button"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
        style={styles.wrap}>
        <Animated.View
          entering={ZoomIn.springify().damping(17).stiffness(240)}
          accessibilityViewIsModal
          style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
          <Text variant="heading" color="accent" accessibilityRole="header">
            Renomear campanha
          </Text>
          <Text variant="label" color="textSecondary" nativeID="rename-campaign-label">
            Nome da campanha
          </Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            maxLength={CAMPAIGN_NAME_MAX}
            multiline={false}
            returnKeyType="done"
            autoCapitalize="sentences"
            autoFocus
            selectTextOnFocus
            editable={!saving}
            onSubmitEditing={() => void save()}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Nome da campanha"
            accessibilityLabelledBy="rename-campaign-label"
            accessibilityHint={`Obrigatório, até ${CAMPAIGN_NAME_MAX} caracteres`}
            style={[
              styles.input,
              {
                color: colors.text,
                backgroundColor: colors.background,
                fontSize: 16 * textScale,
                borderColor: error ? colors.negative : colors.border,
              },
            ]}
          />
          <View style={styles.foot}>
            <View style={styles.flex}>
              {/* A região fica sempre montada: leitores de tela só anunciam mudanças em regiões que já existem. */}
              <Text variant="caption" color="negative" accessibilityLiveRegion="polite" accessibilityRole="alert">
                {error ?? ''}
              </Text>
            </View>
            <Text
              variant="caption"
              color={value.length >= CAMPAIGN_NAME_MAX ? 'warning' : 'textMuted'}
              tabular
              accessibilityLabel={`${value.length} de ${CAMPAIGN_NAME_MAX} caracteres`}>
              {`${value.length}/${CAMPAIGN_NAME_MAX}`}
            </Text>
          </View>
          {saveError && (
            <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(120)}>
              <Text variant="caption" color="negative" accessibilityRole="alert">
                {saveError}
              </Text>
            </Animated.View>
          )}
          <View style={styles.actions}>
            <PressScale
              onPress={onClose}
              disabled={saving}
              accessibilityLabel="Cancelar"
              style={[styles.button, { borderColor: colors.border }]}>
              <Text variant="label" color="textSecondary">
                CANCELAR
              </Text>
            </PressScale>
            <PressScale
              onPress={() => void save()}
              disabled={!canSave}
              accessibilityLabel="Salvar nome"
              accessibilityHint={error ?? undefined}
              style={[styles.button, { backgroundColor: colors.accent, borderColor: colors.accent }]}>
              {saving ? (
                <ActivityIndicator color={colors.onAccent} accessibilityLabel="Salvando nome" />
              ) : (
                <Text variant="label" color="onAccent">
                  SALVAR
                </Text>
              )}
            </PressScale>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  sheet: {
    width: '100%',
    maxWidth: 460,
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  input: {
    minHeight: MIN_TOUCH,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
  },
  foot: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  flex: { flex: 1, flexShrink: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: Spacing.two },
  button: {
    minHeight: MIN_TOUCH,
    minWidth: 120,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
