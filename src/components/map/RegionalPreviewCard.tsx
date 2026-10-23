import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { buildRegionalDecisionPreview, regionsOf, type GameContent, type GameState } from '@/engine';
import { useTheme } from '@/hooks/use-theme';

import { FlatBrazilMap } from './FlatBrazilMap';
import {
  adhesionLine,
  barredNote,
  DISCLAIMER,
  lagLine,
  NO_DIFFERENTIAL_TEXT,
  previewLegend,
  previewMapModel,
  previewModes,
  selectedUfText,
  topHeading,
  topUfs,
  uncertaintyChips,
  type PreviewMode,
} from './regionalPreviewView';

/**
 * Prévia regional de uma decisão (PLANO_GLOBO.md §5.2 e §7 PR 1): mini-mapa 2D leve, UFs de destaque, adesão, atraso
 * e incertezas, sempre como estimativa. Usa só o mapa SVG (nunca o Canvas 3D): o Gabinete é uma subtela e o globo
 * fica pausado por baixo. O toque numa UF mostra o valor dela em texto; nada aqui muda o estado do jogo.
 */

/** Altura do mini-mapa, em dp. */
const MAP_HEIGHT = 180;

const MODE_LABEL: Record<PreviewMode, string> = { impact: 'Por habitante', adhesion: 'Adesão' };

export interface RegionalPreviewCardProps {
  state: GameState;
  content: GameContent;
  policyId: string;
}

export function RegionalPreviewCard({ state, content, policyId }: RegionalPreviewCardProps) {
  const { colors } = useTheme();
  const preview = useMemo(() => buildRegionalDecisionPreview(state, content, policyId), [state, content, policyId]);
  const names = useMemo(() => Object.fromEntries(regionsOf(content).map((u) => [u.id, u.name])), [content]);
  const [chosenMode, setChosenMode] = useState<PreviewMode | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  if (!preview) return null;

  const modes = previewModes(preview);
  const mode = chosenMode && modes.includes(chosenMode) ? chosenMode : (modes[0] ?? null);
  const legend = mode ? previewLegend(preview, mode) : null;
  const top = topUfs(preview, names);
  const adhesion = adhesionLine(preview);
  const lag = lagLine(preview);
  const chips = uncertaintyChips(preview);
  const barred = barredNote(preview);
  const detail = mode && selected ? selectedUfText(preview, selected, mode, names) : null;

  return (
    <View
      style={[styles.root, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
      accessibilityLabel="Prévia regional da decisão">
      <Text variant="label">Prévia regional</Text>

      {mode && (
        <>
          {modes.length > 1 && (
            <View style={styles.modes}>
              {modes.map((m) => (
                <Button
                  key={m}
                  label={MODE_LABEL[m]}
                  variant={m === mode ? 'secondary' : 'ghost'}
                  onPress={() => setChosenMode(m)}
                  accessibilityHint={m === mode ? 'Mapa mostrado' : 'Pintar o mapa por este critério'}
                />
              ))}
            </View>
          )}
          <View style={styles.map}>
            <FlatBrazilMap
              viewModel={previewMapModel(preview, mode, selected)}
              onSelect={setSelected}
              variant="light"
            />
          </View>
          {legend && (
            <View accessibilityLabel={legend.title}>
              <Text variant="caption" color="textSecondary">
                {legend.title}
                {mode === 'impact'
                  ? preview.direction === 'cost'
                    ? ' · mais claro: pesa mais'
                    : ' · mais claro: chega mais'
                  : ''}
              </Text>
              <View style={styles.legendRow}>
                {legend.entries.map((entry) => (
                  <View key={entry.label} style={styles.legendItem}>
                    <View style={[styles.swatch, { backgroundColor: entry.color }]} />
                    <Text variant="caption" color="textSecondary" numberOfLines={1}>
                      {entry.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          <Text variant="caption" color={detail ? 'text' : 'textMuted'}>
            {detail ?? 'Toque num estado para ver o valor dele.'}
          </Text>
        </>
      )}

      {!preview.differential && <Text variant="body">{NO_DIFFERENTIAL_TEXT}</Text>}

      {top.length > 0 && (
        <View style={styles.block}>
          <Text variant="caption" color="textSecondary">
            {topHeading(preview)}
          </Text>
          {top.map((uf) => (
            <Text key={uf.id} variant="body" tabular>
              {uf.name}: {uf.text}
            </Text>
          ))}
        </View>
      )}

      {adhesion && <Text variant="body">{adhesion}</Text>}
      {lag && <Text variant="body">{lag}</Text>}

      {chips.length > 0 && (
        <View style={styles.chips}>
          {chips.map((chip) => (
            <View key={chip} style={[styles.chip, { borderColor: colors.warning }]}>
              <Text variant="caption" color="warning">
                {chip}
              </Text>
            </View>
          ))}
        </View>
      )}

      {barred && (
        <Text variant="caption" color="negative">
          {barred}
        </Text>
      )}

      <Text variant="caption" color="textMuted">
        {DISCLAIMER}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.sm, padding: Spacing.two, gap: Spacing.two },
  modes: { flexDirection: 'row', gap: Spacing.one },
  map: { height: MAP_HEIGHT, borderRadius: Radius.sm, overflow: 'hidden' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.two, rowGap: Spacing.half },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  block: { gap: Spacing.half },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: {
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
});
