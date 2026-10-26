import type { SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { HudIcon } from '@/components/painel/HudBits';
import { Text } from '@/components/ui';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import {
  adviseEventChoice,
  locationAcronyms,
  type Opinion,
  type PendingEvent,
  type Proposal,
  type SanctionChoice,
} from '@/engine';
import { useTheme } from '@/hooks/use-theme';
import type { GameEvent } from '@/types/event';

import { ChoiceOption } from './ChoiceOption';
import { focusFirst } from './inboxModel';
import { characterHeading, standingBand, standingText, type CharacterBrief, type StandingBand } from './characterView';
import { monthLabel } from './labels';

export interface PendingItem {
  event: GameEvent;
  pending: PendingEvent;
}

/** Projeto aprovado à espera de sanção neste mês (POLITICAL_RULES.md §7). */
export interface SanctionItem {
  proposal: Proposal;
  name: string;
}

export interface EventInboxProps {
  items: readonly PendingItem[];
  /** Escolha marcada pelo jogador, por evento. */
  chosen: Readonly<Partial<Record<string, string>>>;
  /** Se a opção cabe nas ações de agenda restantes (a já marcada sempre pode ser desmarcada). */
  canChoose: (eventId: string, choiceId: string) => boolean;
  onChoose: (eventId: string, choiceId: string) => void;
  sanctions: readonly SanctionItem[];
  /** Decisão de sanção marcada, por proposta. */
  sanctionChosen: Readonly<Partial<Record<string, SanctionChoice>>>;
  onSanction: (proposalId: string, choice: SanctionChoice) => void;
  /** Personagens do cenário com prestígio atual; usado nos eventos com `characterId` (FASE_07.md). */
  characters?: readonly CharacterBrief[];
  /**
   * Evento aberto pelo marcador do mapa (`PendingEvent.instanceId`, PLANO_GLOBO.md §7, PR 11): sobe para o topo da
   * caixa de entrada e ganha o contorno de destaque. Ausente ou fora da lista = a ordem normal, sem destaque.
   */
  focusInstanceId?: string | null;
}

const SANCTION_OPTIONS: Record<SanctionChoice, { label: string; description: string }> = {
  sancionar: {
    label: 'Sancionar',
    description: 'A lei entra em vigor como o Congresso aprovou, com os acréscimos do relator, se houver.',
  },
  vetar_acrescimos: {
    label: 'Vetar os acréscimos',
    description:
      'Sanciona o projeto e veta só os acréscimos do relator. O Congresso aprecia o veto no mês seguinte e pode derrubá-lo por maioria absoluta de cada Casa.',
  },
  vetar_total: {
    label: 'Vetar o projeto inteiro',
    description:
      'A lei não entra em vigor, salvo se o Congresso derrubar o veto. Veto derrubado é derrota política; veto mantido rende um pouco de capital.',
  },
};

const SANCTION_ICON: SymbolViewProps['name'] = { ios: 'signature', android: 'draw', web: 'draw' };
const EVENT_ICON: SymbolViewProps['name'] = {
  ios: 'exclamationmark.bubble.fill',
  android: 'campaign',
  web: 'campaign',
};
const CLOCK_ICON: SymbolViewProps['name'] = { ios: 'clock', android: 'schedule', web: 'schedule' };
const DONE_ICON: SymbolViewProps['name'] = {
  ios: 'checkmark.circle.fill',
  android: 'check_circle',
  web: 'check_circle',
};

/** Tom dos selos da caixa (a palavra vai sempre escrita: a cor nunca é o único sinal). */
type TagTone = 'positive' | 'warning' | 'negative' | 'neutral';

/**
 * Caixa de entrada: projetos para sancionar e eventos que pedem resposta neste mês (GAME_DESIGN.md §4.2). Vive na
 * folha "Alertas e eventos" do Painel, que já dá o título. No topo, o placar do mês (quantos ainda sem resposta);
 * depois, sanções e eventos em seções próprias, cada um num cartão com faixa de estado (âmbar: sem resposta; verde:
 * respondido). Sem resposta, vale o padrão do evento ou a sanção tácita.
 */
export function EventInbox({
  items,
  chosen,
  canChoose,
  onChoose,
  sanctions,
  sanctionChosen,
  onSanction,
  characters = [],
  focusInstanceId,
}: EventInboxProps) {
  const total = items.length + sanctions.length;
  if (total === 0) {
    return (
      <Text variant="body" color="textSecondary">
        Nada pede resposta neste mês.
      </Text>
    );
  }
  // Mesma conta do selo do sino (inboxCount): resposta marcada no rascunho.
  const answered =
    items.filter(({ event }) => chosen[event.id] !== undefined).length +
    sanctions.filter(({ proposal }) => sanctionChosen[proposal.id] !== undefined).length;

  return (
    <View style={styles.root}>
      <InboxSummary answered={answered} total={total} />

      {sanctions.length > 0 && <SectionLabel text="Sanção ou veto" count={sanctions.length} />}
      {sanctions.map(({ proposal, name }) => {
        const options: SanctionChoice[] =
          proposal.rider > 0 ? ['sancionar', 'vetar_acrescimos', 'vetar_total'] : ['sancionar', 'vetar_total'];
        // Só a escolha marcada aparece selecionada; sem ela vale a sanção tácita, que o selo "padrão" indica.
        const selected = sanctionChosen[proposal.id];
        return (
          <InboxCard
            key={proposal.id}
            icon={SANCTION_ICON}
            kicker="Projeto aprovado"
            title={name}
            deadline="Sem resposta neste mês, vale a sanção tácita."
            answered={selected !== undefined}>
            <Text variant="label" color="textSecondary" style={styles.briefing}>
              {proposal.rider > 0
                ? 'O Congresso aprovou o projeto, e o relator incluiu acréscimos estranhos ao texto, com despesa extra.'
                : 'O Congresso aprovou o projeto. Decida se sanciona ou veta.'}
            </Text>
            {proposal.rider > 0 && <Tag tone="warning" text="Com acréscimos do relator" />}
            <View style={styles.options} accessibilityRole="radiogroup">
              {options.map((choice) => (
                <ChoiceOption
                  key={choice}
                  label={SANCTION_OPTIONS[choice].label}
                  description={SANCTION_OPTIONS[choice].description}
                  agendaCost={0}
                  selected={selected === choice}
                  isDefault={choice === 'sancionar'}
                  enabled
                  onPress={() => onSanction(proposal.id, choice)}
                />
              ))}
            </View>
          </InboxCard>
        );
      })}

      {items.length > 0 && <SectionLabel text="Eventos do gabinete" count={items.length} />}
      {focusFirst(items, focusInstanceId).map(({ event, pending }) => {
        const focused = pending.instanceId === focusInstanceId;
        const selectedId = chosen[event.id];
        // O padrão vale ao encerrar o mês em que o evento chegou à caixa (resolveEventsStep).
        const deadline = monthLabel(pending.monthIndex);
        const character = event.characterId ? characters.find((c) => c.id === event.characterId) : undefined;
        return (
          <InboxCard
            key={pending.instanceId}
            icon={EVENT_ICON}
            kicker="Evento"
            title={event.title}
            deadline={`Responda até o fim de ${deadline}; sem resposta, vale o padrão.`}
            answered={selectedId !== undefined}
            focused={focused}>
            {character && <CharacterChip character={character} />}
            {pending.location && (
              <Text variant="label" color="textSecondary" style={styles.briefing}>
                {`Atinge: ${locationAcronyms(pending.location)}`}
              </Text>
            )}
            <Text variant="label" color="textSecondary" style={styles.briefing}>
              {event.description}
            </Text>
            <View style={styles.options} accessibilityRole="radiogroup">
              {event.choices.map((choice) => {
                const isSelected = selectedId === choice.id;
                return (
                  <ChoiceOption
                    key={choice.id}
                    label={choice.label}
                    description={choice.description}
                    agendaCost={choice.agendaCost}
                    selected={isSelected}
                    isDefault={event.defaultChoice === choice.id}
                    enabled={isSelected || canChoose(event.id, choice.id)}
                    onPress={() => onChoose(event.id, choice.id)}
                  />
                );
              })}
            </View>
            <EventDispatch event={event} choiceId={selectedId ?? event.defaultChoice} />
          </InboxCard>
        );
      })}
    </View>
  );
}

/** Placar do mês: quantas respostas faltam, com barra de progresso (o número vem sempre escrito, não só na barra). */
function InboxSummary({ answered, total }: { answered: number; total: number }) {
  const { colors } = useTheme();
  const missing = total - answered;
  const done = missing === 0;
  const tone = done ? 'positive' : 'warning';
  return (
    <View style={[styles.summary, { borderColor: colors[tone] + '66', backgroundColor: colors[`${tone}Soft`] }]}>
      <View style={styles.summaryRow}>
        <HudIcon name={done ? DONE_ICON : EVENT_ICON} size={18} color={colors[tone]} />
        <View style={styles.summaryText}>
          <Text variant="label" color={tone}>
            {done ? 'Tudo respondido' : `${missing} ${missing === 1 ? 'pede' : 'pedem'} resposta`}
          </Text>
          <Text variant="caption" color="textSecondary">
            {done
              ? 'As respostas valem quando você encerrar o mês.'
              : 'O que ficar sem resposta segue o padrão ao encerrar o mês.'}
          </Text>
        </View>
        <Text variant="label" color="textSecondary" tabular accessibilityLabel={`${answered} de ${total} respondidos`}>
          {answered}/{total}
        </Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: colors.background }]}>
        <View style={[styles.progressFill, { width: `${(answered / total) * 100}%`, backgroundColor: colors[tone] }]} />
      </View>
    </View>
  );
}

function SectionLabel({ text, count }: { text: string; count: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text variant="caption" color="textMuted" style={styles.caps} accessibilityRole="header">
        {text}
      </Text>
      <View style={[styles.sectionCount, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        <Text variant="caption" color="textSecondary" tabular style={styles.bold}>
          {count}
        </Text>
      </View>
      <View style={[styles.sectionRule, { backgroundColor: colors.border + '66' }]} />
    </View>
  );
}

/** Cartão de um item da caixa: faixa de estado à esquerda, ícone, título, prazo e selo "respondido"/"sem resposta". */
function InboxCard({
  icon,
  kicker,
  title,
  deadline,
  answered,
  focused = false,
  children,
}: {
  icon: SymbolViewProps['name'];
  kicker: string;
  title: string;
  deadline: string;
  answered: boolean;
  /** Evento aberto pelo marcador do mapa: contorno de destaque (PLANO_GLOBO.md §7). */
  focused?: boolean;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const tone = answered ? 'positive' : 'warning';
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border + 'aa' },
        focused && { borderColor: colors.accent, borderWidth: 2 },
      ]}>
      <View style={[styles.stripe, { backgroundColor: colors[tone] }]} />
      <View style={styles.cardInner}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconBox, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
            <HudIcon name={icon} size={16} color={colors.accent} />
          </View>
          <View style={styles.cardTitle}>
            <Text variant="caption" color="accent" style={styles.caps}>
              {kicker}
            </Text>
            <Text variant="heading" accessibilityRole="header">
              {title}
            </Text>
          </View>
          <Tag tone={tone} text={answered ? 'Respondido' : 'Sem resposta'} />
        </View>
        <View style={styles.deadline}>
          <HudIcon name={CLOCK_ICON} size={12} color={colors.textMuted} />
          <Text variant="caption" color="textMuted" style={styles.deadlineText}>
            {deadline}
          </Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border + '55' }]} />
        {children}
      </View>
    </View>
  );
}

function Tag({ tone, text }: { tone: TagTone; text: string }) {
  const { colors } = useTheme();
  const color: ThemeColor = tone === 'neutral' ? 'textSecondary' : tone;
  const soft = tone === 'neutral' ? colors.surfaceRaised : colors[`${tone}Soft`];
  return (
    <View style={[styles.tag, { backgroundColor: soft, borderColor: colors[color] + '66' }]}>
      <Text variant="caption" color={color} style={styles.bold}>
        {text}
      </Text>
    </View>
  );
}

const BAND_TONE: Record<StandingBand, TagTone> = { boa: 'positive', neutra: 'neutral', ruim: 'negative' };

/** Iniciais do personagem para o avatar (duas primeiras palavras do nome). */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/** Personagem em destaque no evento (FASE_07.md): iniciais, nome, papel e relação com o governo (sempre escrita). */
function CharacterChip({ character }: { character: CharacterBrief }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.character, { backgroundColor: colors.surfaceRaised, borderColor: colors.border + '88' }]}
      accessible
      accessibilityLabel={`${characterHeading(character)}. ${standingText(character.standing)}`}>
      <View style={[styles.avatar, { borderColor: colors.accent, backgroundColor: colors.background }]}>
        <Text variant="caption" color="accent" style={styles.bold}>
          {initialsOf(character.name)}
        </Text>
      </View>
      <View style={styles.characterText}>
        <Text variant="label" numberOfLines={1}>
          {character.name}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {character.role}
        </Text>
      </View>
      <Tag tone={BAND_TONE[standingBand(character.standing)]} text={standingText(character.standing)} />
    </View>
  );
}

const TONE: Record<Opinion['tone'], { tag: TagTone; dot: ThemeColor; word: string }> = {
  favoravel: { tag: 'positive', dot: 'positive', word: 'favorável' },
  desfavoravel: { tag: 'negative', dot: 'negative', word: 'desfavorável' },
  neutro: { tag: 'neutral', dot: 'textMuted', word: 'neutro' },
};

/** Mesa de despacho da resposta (GAME_DESIGN.md §4.4): pareceres da escolha marcada, ou da padrão se nenhuma. */
function EventDispatch({ event, choiceId }: { event: GameEvent; choiceId: string }) {
  const { colors } = useTheme();
  const advice = adviseEventChoice(event, choiceId);
  if (!advice) return null;
  const label = event.choices.find((c) => c.id === choiceId)?.label ?? '';
  const voices: [string, Opinion][] = [
    ['Fazenda', advice.fazenda],
    ['Articulação', advice.articulacao],
    ['Comunicação', advice.comunicacao],
  ];
  return (
    <View style={[styles.dispatch, { backgroundColor: colors.background, borderColor: colors.border + '66' }]}>
      <View style={styles.dispatchHeader}>
        <Text variant="caption" color="textMuted" style={styles.caps}>
          Mesa de despacho
        </Text>
        <Text variant="caption" color="accent" numberOfLines={1} style={styles.dispatchChoice}>
          {label}
        </Text>
      </View>
      {voices.map(([title, opinion]) => (
        <View key={title} style={styles.voice}>
          <View style={[styles.voiceDot, { backgroundColor: colors[TONE[opinion.tone].dot] }]} />
          <View style={styles.voiceBody}>
            <View style={styles.voiceTitle}>
              <Text variant="caption" style={styles.bold}>
                {title}
              </Text>
              <Tag tone={TONE[opinion.tone].tag} text={TONE[opinion.tone].word} />
            </View>
            <Text variant="caption" color="textSecondary">
              {opinion.text}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.two },
  options: { gap: Spacing.one },
  caps: { fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  bold: { fontWeight: '700' },
  briefing: { fontWeight: '400' },

  summary: { borderWidth: 1, borderRadius: Radius.sm, padding: Spacing.two, gap: Spacing.two },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  summaryText: { flex: 1, minWidth: 0 },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },

  section: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingTop: Spacing.one },
  sectionCount: { borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 6 },
  sectionRule: { flex: 1, height: StyleSheet.hairlineWidth },

  card: { flexDirection: 'row', borderWidth: 1, borderRadius: Radius.md, overflow: 'hidden' },
  stripe: { width: 3 },
  cardInner: { flex: 1, minWidth: 0, padding: Spacing.two + 2, gap: Spacing.two },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { flex: 1, minWidth: 0 },
  deadline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  deadlineText: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth },

  tag: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 1 },

  character: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: Spacing.one + 2,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  characterText: { flex: 1, minWidth: 0 },

  dispatch: { borderWidth: 1, borderRadius: Radius.sm, padding: Spacing.two, gap: Spacing.two },
  dispatchHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  dispatchChoice: { flex: 1, textAlign: 'right', fontWeight: '700' },
  voice: { flexDirection: 'row', gap: Spacing.two },
  voiceDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  voiceBody: { flex: 1, minWidth: 0, gap: 2 },
  voiceTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});
