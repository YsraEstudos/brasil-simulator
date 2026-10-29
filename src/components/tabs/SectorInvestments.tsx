import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import type { GameContent, GameState } from '@/engine';
import { sectorInvestments } from '@/engine';
import { useTheme } from '@/hooks/use-theme';

import { sectorPanelView, type SectorView, type StageBar } from './sectorInvestmentsView';

/**
 * Cartão "Investimentos por setor" da Economia (PLANO_EXPANSAO EX-31): leitura da carteira de obras por área, com o
 * dinheiro em estágios (anunciado → aprovado → contratado → desembolsado) e o detalhe de cada obra. Abrir ou filtrar
 * não toca na simulação.
 */

/** Barra de estágios: as camadas se sobrepõem (pago ⊂ contratado ⊂ aprovado); o anúncio vem depois, tracejado. */
function StageBarView({ bar }: { bar: StageBar }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: colors.surfaceRaised }]}>
      <View style={[styles.layer, { width: `${bar.approved * 100}%`, backgroundColor: colors.infoSoft }]} />
      <View
        style={[styles.layer, { width: `${bar.contracted * 100}%`, backgroundColor: colors.info, opacity: 0.45 }]}
      />
      <View style={[styles.layer, { width: `${bar.spent * 100}%`, backgroundColor: colors.info }]} />
      {bar.announced > 0 && (
        <View
          style={[
            styles.layer,
            styles.announced,
            { left: `${bar.approved * 100}%`, width: `${bar.announced * 100}%`, borderColor: colors.textSecondary },
          ]}
        />
      )}
    </View>
  );
}

function StageKey() {
  const { colors } = useTheme();
  const items = [
    { label: 'Desembolsado', style: { backgroundColor: colors.info } },
    { label: 'Contratado', style: { backgroundColor: colors.info, opacity: 0.45 } },
    { label: 'Aprovado', style: { backgroundColor: colors.infoSoft } },
    { label: 'Anunciado', style: [styles.announcedKey, { borderColor: colors.textSecondary }] },
  ];
  return (
    <View style={styles.keyRow} accessible accessibilityLabel="Legenda: desembolsado, contratado, aprovado e anunciado">
      {items.map((item) => (
        <View key={item.label} style={styles.keyItem}>
          <View style={[styles.keySwatch, item.style]} />
          <Text variant="caption" color="textSecondary">
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SectorRow({ sector, open, onToggle }: { sector: SectorView; open: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  const expandable = sector.projects.length + sector.announcements.length > 0;
  return (
    <View style={[styles.sector, { borderColor: open ? colors.accent : colors.border }]}>
      <Pressable
        onPress={expandable ? onToggle : undefined}
        disabled={!expandable}
        accessibilityRole={expandable ? 'button' : undefined}
        accessibilityState={expandable ? { expanded: open } : undefined}
        accessibilityLabel={sector.accessibilityLabel + (expandable ? (open ? '. Recolher obras' : '. Ver obras') : '')}
        style={({ pressed }) => [styles.sectorHead, pressed && { opacity: 0.8 }, sector.empty && { opacity: 0.55 }]}>
        <View style={styles.sectorTitle}>
          <Text variant="label" style={{ flex: 1 }}>
            {sector.label}
          </Text>
          {expandable && (
            <Text variant="caption" color="textSecondary">
              {open ? 'Recolher' : `${sector.projects.length + sector.announcements.length} obra(s) ›`}
            </Text>
          )}
        </View>
        <StageBarView bar={sector.bar} />
        <Text variant="caption">{sector.headline}</Text>
        {sector.detail ? (
          <Text variant="caption" color="textSecondary">
            {sector.detail}
          </Text>
        ) : null}
      </Pressable>
      {open && (
        <View style={[styles.projects, { borderTopColor: colors.border }]}>
          {sector.projects.map((p) => (
            <View
              key={p.key}
              style={styles.project}
              accessible
              accessibilityLabel={`${p.name}. ${p.phase}, ${Math.round(p.progress * 100)}% de avanço físico. ${p.money}. ${p.status}`}>
              <View style={styles.sectorTitle}>
                <Text variant="label" style={{ flex: 1 }} numberOfLines={2}>
                  {p.name}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {`${p.phase} · ${Math.round(p.progress * 100)}%`}
                </Text>
              </View>
              <View style={[styles.progressTrack, { backgroundColor: colors.surfaceRaised }]}>
                <View
                  style={[styles.progressFill, { width: `${p.progress * 100}%`, backgroundColor: colors.positive }]}
                />
              </View>
              <Text variant="caption">{p.money}</Text>
              <Text variant="caption" color="textSecondary">
                {p.status}
              </Text>
            </View>
          ))}
          {sector.announcements.map((a) => (
            <Text key={a.key} variant="caption" color="textSecondary">
              {`Anunciada: ${a.text}`}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

export function SectorInvestmentsCard({ state, content }: { state: GameState; content: GameContent }) {
  const view = sectorPanelView(sectorInvestments(state, content));
  const [open, setOpen] = useState<string | null>(null);
  const { colors } = useTheme();
  return (
    <Card
      title="Investimentos por setor"
      subtitle="Carteira de obras federais, valores nominais acumulados. É uma leitura da carteira, não um orçamento à parte.">
      <View style={styles.totals}>
        {view.totals.map((t) => (
          <View
            key={t.key}
            style={[styles.total, { backgroundColor: colors.surfaceRaised }]}
            accessible
            accessibilityLabel={`${t.label}: ${t.value}, ${t.hint}`}>
            <Text variant="caption" color="textSecondary">
              {t.label}
            </Text>
            <Text variant="label" tabular>
              {t.value}
            </Text>
            <Text variant="caption" color="textMuted" numberOfLines={2}>
              {t.hint}
            </Text>
          </View>
        ))}
      </View>
      <StageKey />
      {view.sectors.map((s) => (
        <SectorRow
          key={s.sector}
          sector={s}
          open={open === s.sector}
          onToggle={() => setOpen(open === s.sector ? null : s.sector)}
        />
      ))}
      <Text variant="caption" color="textSecondary">
        {view.reconciliation}
      </Text>
      <Text variant="caption" color="textMuted">
        O empenho não é modelado em separado. Gasto e resultado podem andar juntos sem que um prove o outro.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  totals: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  total: { flexGrow: 1, flexBasis: '45%', padding: Spacing.two, borderRadius: Radius.sm, gap: 2 },
  keyRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.three, rowGap: Spacing.half },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  keySwatch: { width: 12, height: 8, borderRadius: 2 },
  announcedKey: { borderWidth: 1, borderStyle: 'dashed' },
  sector: { borderWidth: 1, borderRadius: Radius.sm, overflow: 'hidden' },
  sectorHead: { gap: Spacing.half, padding: Spacing.two },
  sectorTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  track: { height: 10, borderRadius: 5, overflow: 'hidden', position: 'relative' },
  layer: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 5 },
  announced: { borderWidth: 1, borderStyle: 'dashed', backgroundColor: 'transparent' },
  projects: { gap: Spacing.two, padding: Spacing.two, borderTopWidth: 1 },
  project: { gap: 2 },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
});
