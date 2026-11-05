import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Text } from '@/components/ui';
import { MIN_TOUCH, Radius, SaveAccentColors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { gameStore, normalizeNotes } from '@/store';
import { CAMPAIGN_NOTES_MAX, type CampaignAccent } from '@/types/campaignIdentity';

import { ACCENT_OPTIONS, accentName, accentOptionLabel, notesCounter } from './saveIdentity';
import { PressScale } from './SetupBits';

/** Cores do campo de notas: o cartão usa o tema; a folha ☰ do Painel passa as do HUD (sempre escuro). */
export interface NotesFieldColors {
  text: string;
  muted: string;
  border: string;
  background: string;
  negative: string;
}

/**
 * Bloco de notas da campanha (PLANO_SAVES_HISTORICO.md H2, D31): grava ao sair do campo, sem esperar o fim do mês.
 * Só grava se o texto mudou; uma falha aparece embaixo do campo e o texto digitado fica.
 */
export function CampaignNotesField({
  campaignId,
  campaignName,
  notes,
  colors,
  fontSize = 14,
}: {
  campaignId: string;
  campaignName: string;
  notes: string;
  colors: NotesFieldColors;
  fontSize?: number;
}) {
  const [text, setText] = useState(notes);
  const [status, setStatus] = useState<'idle' | 'salvo' | 'falhou'>('idle');
  const saved = useRef(notes);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const save = async () => {
    const next = normalizeNotes(text);
    if (next === saved.current) return;
    const ok = await gameStore.getState().setCampaignNotes(campaignId, next);
    if (!alive.current) return;
    if (ok) {
      saved.current = next;
      setText(next);
    }
    setStatus(ok ? 'salvo' : 'falhou');
  };

  return (
    <View style={styles.notes}>
      <TextInput
        value={text}
        onChangeText={(t) => {
          setText(t);
          setStatus('idle');
        }}
        onBlur={() => void save()}
        multiline
        maxLength={CAMPAIGN_NOTES_MAX}
        placeholder="Metas, lembretes, o que fazer no próximo mês…"
        placeholderTextColor={colors.muted}
        accessibilityLabel={`Notas de ${campaignName}`}
        accessibilityHint={`Até ${CAMPAIGN_NOTES_MAX} caracteres. Grava ao sair do campo`}
        style={[
          styles.notesInput,
          { color: colors.text, borderColor: colors.border, backgroundColor: colors.background, fontSize },
        ]}
      />
      <View style={styles.notesFoot}>
        <Text
          style={{ color: status === 'falhou' ? colors.negative : colors.muted, fontSize: 12, flex: 1 }}
          accessibilityLiveRegion="polite">
          {status === 'salvo' ? 'Notas salvas' : status === 'falhou' ? 'Não foi possível salvar as notas' : ''}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{notesCounter(text)}</Text>
      </View>
    </View>
  );
}

/** Seletor da cor de destaque (D44): chips com o nome escrito e a amostra da cor; "Nenhuma" tira a cor. */
export function AccentPicker({
  campaignName,
  value,
  disabled,
  onChange,
}: {
  campaignName: string;
  value: CampaignAccent | null;
  disabled?: boolean;
  onChange: (accent: CampaignAccent | null) => void;
}) {
  const { colors, scheme } = useTheme();
  return (
    <View style={styles.chips} accessibilityRole="radiogroup">
      {ACCENT_OPTIONS.map((accent) => {
        const selected = accent === value;
        return (
          <PressScale
            key={accent ?? 'nenhuma'}
            onPress={() => onChange(accent)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityLabel={accentOptionLabel(accent, campaignName)}
            accessibilityState={{ selected }}
            style={[
              styles.chip,
              {
                borderColor: selected ? colors.accent : colors.border,
                backgroundColor: selected ? colors.surfaceRaised : colors.surface,
              },
            ]}>
            <View
              style={[
                styles.swatch,
                accent
                  ? { backgroundColor: SaveAccentColors[scheme][accent] }
                  : { borderWidth: 1.5, borderColor: colors.textMuted },
              ]}
            />
            <Text variant="caption" color={selected ? 'text' : 'textSecondary'} style={styles.chipText}>
              {accentName(accent)}
            </Text>
          </PressScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  notes: { gap: Spacing.one },
  notesInput: {
    minHeight: 88,
    maxHeight: 220,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    textAlignVertical: 'top',
  },
  notesFoot: { flexDirection: 'row', gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  swatch: { width: 14, height: 14, borderRadius: 7 },
  chipText: { fontWeight: '600' },
});
