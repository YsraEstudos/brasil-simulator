import { StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  adviseEventChoice,
  locationAcronyms,
  type Opinion,
  type PendingEvent,
  type Proposal,
  type SanctionChoice,
} from '@/engine';
import type { GameEvent } from '@/types/event';

import { ChoiceOption } from './ChoiceOption';
import { focusFirst } from './inboxModel';
import { characterHeading, standingText, type CharacterBrief } from './characterView';
import { monthLabel } from './labels';

export interface PendingItem {
  event: GameEvent;
  pending: PendingEvent;
}

/** Projeto aprovado à espera de sanção neste mês (POLITICAL_RULES.md §7). */
export interface SanctionItem {
  proposal: Proposal;
  name: string;
  /** Texto de origem quando o projeto não é do governo (pauta-bomba, PLANO_CAMPANHA.md Fase C6c). */
  context?: string;
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

/**
 * Caixa de entrada: projetos para sancionar e eventos que pedem resposta neste mês (GAME_DESIGN.md §4.2). Vive na
 * folha "Alertas e eventos" do Painel, que já dá o título.
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
  const { colors } = useTheme();
  return (
    <View style={styles.root}>
      {items.length === 0 && sanctions.length === 0 && (
        <Text variant="body" color="textSecondary">
          Nada pede resposta neste mês.
        </Text>
      )}
      {sanctions.map(({ proposal, name, context }) => {
        const options: SanctionChoice[] =
          proposal.rider > 0 ? ['sancionar', 'vetar_acrescimos', 'vetar_total'] : ['sancionar', 'vetar_total'];
        // Só a escolha marcada aparece selecionada; sem ela vale a sanção tácita, que o selo "padrão" indica.
        const selected = sanctionChosen[proposal.id];
        return (
          <Card key={proposal.id} title={`Sanção: ${name}`} subtitle="Sem resposta neste mês, vale a sanção tácita.">
            <Text variant="body">
              {context ??
                (proposal.rider > 0
                  ? 'O Congresso aprovou o projeto, e o relator incluiu acréscimos estranhos ao texto, com despesa extra.'
                  : 'O Congresso aprovou o projeto. Decida se sanciona ou veta.')}
            </Text>
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
          </Card>
        );
      })}
      {focusFirst(items, focusInstanceId).map(({ event, pending }) => {
        const focused = pending.instanceId === focusInstanceId;
        const selectedId = chosen[event.id];
        // O padrão vale ao encerrar o mês em que o evento chegou à caixa (resolveEventsStep).
        const deadline = monthLabel(pending.monthIndex);
        const character = event.characterId ? characters.find((c) => c.id === event.characterId) : undefined;
        return (
          <Card
            key={pending.instanceId}
            title={event.title}
            subtitle={`Sem resposta até o fim de ${deadline}, vale o padrão.`}
            style={focused ? { borderColor: colors.accent, borderWidth: 2 } : undefined}>
            {character && (
              <View style={styles.character}>
                <Text variant="label">{characterHeading(character)}</Text>
                <Text variant="caption" color="textSecondary">
                  {standingText(character.standing)}
                </Text>
              </View>
            )}
            {pending.location && (
              <Text variant="label" color="textSecondary">
                {`Atinge: ${locationAcronyms(pending.location)}`}
              </Text>
            )}
            <Text variant="body">{event.description}</Text>
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
          </Card>
        );
      })}
    </View>
  );
}

const TONE: Record<Opinion['tone'], { color: ThemeColor; word: string }> = {
  favoravel: { color: 'positive', word: 'favorável' },
  desfavoravel: { color: 'negative', word: 'desfavorável' },
  neutro: { color: 'textSecondary', word: 'neutro' },
};

/** Mesa de despacho da resposta (GAME_DESIGN.md §4.4): pareceres da escolha marcada, ou da padrão se nenhuma. */
function EventDispatch({ event, choiceId }: { event: GameEvent; choiceId: string }) {
  const advice = adviseEventChoice(event, choiceId);
  if (!advice) return null;
  const label = event.choices.find((c) => c.id === choiceId)?.label ?? '';
  const voices: [string, Opinion][] = [
    ['Fazenda', advice.fazenda],
    ['Articulação', advice.articulacao],
    ['Comunicação', advice.comunicacao],
  ];
  return (
    <View style={styles.dispatch}>
      <Text variant="label" color="textSecondary">
        Mesa de despacho · {label}
      </Text>
      {voices.map(([title, opinion]) => (
        <Text key={title} variant="caption">
          <Text variant="caption" color={TONE[opinion.tone].color}>
            {title} ({TONE[opinion.tone].word}):
          </Text>{' '}
          {opinion.text}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.two },
  options: { gap: Spacing.two },
  character: { gap: Spacing.half },
  dispatch: { gap: Spacing.half },
});
