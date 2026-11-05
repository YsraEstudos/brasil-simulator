import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ministryIcon } from '@/components/painel/HudBits';
import { Text } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { policyEffectForecast, type GameContent, type GameState } from '@/engine';
import { useTheme } from '@/hooks/use-theme';
import { useGame } from '@/store';

import { FigureChips } from './ChoiceOption';
import { DispatchCard } from './DispatchCard';
import { figuresA11y, policyFigures } from './effectFigures';
import { Badge, CostPips, Icon, ICONS, IconTile } from './GabineteBits';
import { PROPOSAL_STATUS_LABEL } from './labels';
import { POLICY_KIND_LABEL, shortByLabel, type CatalogEntry } from './policyCatalogModel';

export interface PolicyCatalogCardProps {
  entry: CatalogEntry;
  state: GameState;
  content: GameContent;
  expanded: boolean;
  actionsMax: number;
  canInclude: boolean;
  vedada: boolean;
  onExpand: (id: string | null) => void;
  onToggle: () => void;
  onToggleBypass: () => void;
}

/**
 * Uma decisão do catálogo: área, nome, resumo e selos (tipo, custo, situação, "faltam ações", teto ou piso). Tocar
 * abre a mesa de despacho logo abaixo. O que não cabe nas ações livres fica esmaecido, mas continua abrindo, para o
 * jogador poder ler e planejar o mês seguinte.
 */
export function PolicyCatalogCard({
  entry,
  state,
  content,
  expanded: expandedProp,
  actionsMax,
  canInclude,
  vedada,
  onExpand,
  onToggle,
  onToggleBypass,
}: PolicyCatalogCardProps) {
  const { colors } = useTheme();
  const { policy, kind, locked, inProgress, selected, shortBy, saturated, status } = entry;
  const expanded = !locked && expandedProp;
  const dimmed = locked || shortBy > 0;
  const kindLabel = POLICY_KIND_LABEL[kind];
  const unit = useGame((s) => s.prefs.fiscalUnit);
  // Números do cartão (H9/D3): os mesmos da mesa de despacho, exatos no Casual e em faixa nas outras dificuldades.
  const figures = useMemo(
    () =>
      locked || saturated
        ? []
        : policyFigures(
            policy.id,
            policyEffectForecast(state, policy.id, content),
            { difficulty: state.difficulty, seed: state.seed, monthIndex: state.monthIndex },
            unit,
          ),
    [locked, saturated, policy.id, state, content, unit],
  );

  const body = (
    <>
      <View style={styles.top}>
        <IconTile name={ministryIcon([policy.area])} color={dimmed ? 'textMuted' : 'accent'} />
        <View style={styles.title}>
          <Text variant="caption" color="textMuted" style={styles.area}>
            {entry.areaName.toUpperCase()}
          </Text>
          <Text variant="label" color={dimmed ? 'textSecondary' : 'text'}>
            {policy.name}
          </Text>
        </View>
        {locked ? (
          <Icon name={ICONS.locked} size={18} color="textMuted" />
        ) : selected ? (
          <Icon name={ICONS.check} size={22} />
        ) : (
          <Icon name={expanded ? ICONS.collapse : ICONS.expand} size={20} color="textSecondary" />
        )}
      </View>
      <Text variant="caption" color="textSecondary" numberOfLines={expanded ? undefined : 2}>
        {policy.summary}
      </Text>
      <FigureChips figures={figures} />
      <View style={styles.badges}>
        <Badge
          icon={kind === 'decreto' ? ICONS.executive : ICONS.congress}
          label={kindLabel.short}
          tone={kind === 'decreto' ? 'positive' : 'info'}
        />
        <CostPips cost={entry.cost} max={Math.min(actionsMax, 3)} />
        {status && (
          <Badge
            icon={inProgress ? ICONS.inProgress : undefined}
            label={PROPOSAL_STATUS_LABEL[status]}
            tone={inProgress ? 'warning' : 'textMuted'}
          />
        )}
        {!locked && shortBy > 0 && <Badge icon={ICONS.actions} label={shortByLabel(shortBy)} tone="warning" />}
        {saturated && <Badge icon={ICONS.warning} label="Teto ou piso atingido" tone="warning" />}
      </View>
      {saturated && (
        <Text variant="caption" color="textSecondary">
          Tudo o que esta decisão mexe já está no limite: o efeito não aparece enquanto continuar assim.
        </Text>
      )}
      {locked && (
        <Text variant="caption" color="textMuted">
          {inProgress
            ? 'Já está em andamento; não pode ser enviada de novo agora.'
            : 'Medida provisória rejeitada ou caducada: só pode ser reeditada no ano que vem (CF art. 62 §10).'}
        </Text>
      )}
    </>
  );

  const frame = [
    styles.card,
    {
      backgroundColor: colors.surface,
      borderColor: selected ? colors.accent : colors.border,
      borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth,
    },
    dimmed && !expanded && styles.dimmed,
  ];

  if (locked) return <View style={frame}>{body}</View>;

  const a11y = [
    policy.name,
    kindLabel.short,
    selected ? 'Na agenda' : shortBy > 0 ? shortByLabel(shortBy) : undefined,
    saturated ? 'Teto ou piso atingido' : undefined,
    figuresA11y(figures),
    expanded ? 'Fechar mesa de despacho' : 'Abrir mesa de despacho',
  ]
    .filter(Boolean)
    .join('. ');

  // A mesa de despacho fica fora do botão do cartão: botões não podem conter botões.
  return (
    <View style={frame}>
      <Pressable
        onPress={() => onExpand(expanded ? null : policy.id)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={a11y}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}>
        {body}
      </Pressable>
      {expanded && (
        <DispatchCard
          policy={policy}
          state={state}
          content={content}
          included={selected}
          canInclude={canInclude}
          vedacao={vedada}
          onToggle={onToggle}
          onToggleBypass={onToggleBypass}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.two },
  body: { gap: Spacing.two },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  title: { flex: 1 },
  area: { letterSpacing: 0.6 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  dimmed: { opacity: 0.6 },
  pressed: { opacity: 0.75 },
});
