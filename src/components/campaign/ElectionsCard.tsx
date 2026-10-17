import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Text, formatPercent } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  AGENDA_ACTIONS,
  DECLARE_CANDIDACY_ACTION_ID,
  SUPPORT_CANDIDATE_ACTION_ID,
  TERM_MONTHS,
  monthOfTerm,
  termOf,
  validateActionTarget,
  type Decision,
  type GameContent,
  type GameState,
  type MonthReport,
} from '@/engine';
import { hasDecision, type AgendaDraft } from '@/store';

import { VOTING_INTENTION_META, monthLabel } from './labels';
import { WhyChanged } from './WhyChanged';

export interface ElectionsCardProps {
  state: GameState;
  content: GameContent;
  report: MonthReport | undefined;
  draft: AgendaDraft;
  /** Marca/desmarca a decisão no rascunho (quem chama confere se cabe nos pontos). */
  onToggle: (decision: Decision) => void;
  /** A decisão cabe nos pontos restantes do mês. */
  fitsDecision: (decision: Decision) => boolean;
}

/**
 * Cartão eleitoral (Fase 08, T7): intenção de voto com "Por que mudou?", calendário do mandato e as duas ações da
 * janela de declaração — declarar a reeleição e apoiar um bloco na sucessão (com escolha do bloco).
 */
export function ElectionsCard({ state, content, report, draft, onToggle, fitsDecision }: ElectionsCardProps) {
  const [whyOpen, setWhyOpen] = useState(false);
  const elections = content.scenario.elections;
  if (!elections) return null;

  const politics = state.politics;
  const termMonth = monthOfTerm(state.monthIndex);
  const inWindow = termMonth >= elections.janelaDeclaracao.inicio && termMonth <= elections.janelaDeclaracao.fim;
  const windowText = `A janela de declaração vai do mês ${elections.janelaDeclaracao.inicio + 1} ao ${elections.janelaDeclaracao.fim + 1} do mandato (agora, o ${termMonth + 1}º).`;

  const declareDecision: Decision = { policyId: DECLARE_CANDIDACY_ACTION_ID, agendaCost: 0 };
  const declareDraft = hasDecision(draft, declareDecision);
  const declareValid =
    validateActionTarget(AGENDA_ACTIONS[DECLARE_CANDIDACY_ACTION_ID], declareDecision, state, content) === null;
  const declared = politics?.declaracao ?? null;
  const declareHint = !elections.reeleicaoPermitida
    ? 'Este cenário não permite reeleição.'
    : termOf(state.monthIndex) !== 0
      ? 'A reeleição só pode ser disputada no primeiro mandato.'
      : windowText;

  const supportDecision = (blocId: string): Decision => ({
    policyId: SUPPORT_CANDIDATE_ACTION_ID,
    agendaCost: 1,
    params: { blocId },
  });
  const supportDraft = draft.decisions.find((d) => d.policyId === SUPPORT_CANDIDATE_ACTION_ID);
  const draftedBloc = typeof supportDraft?.params?.blocId === 'string' ? supportDraft.params.blocId : null;
  const apoiado = politics?.apoio ?? null;
  const blocName = (id: string) => content.scenario.blocs.find((b) => b.id === id)?.name ?? id;
  const candidateName = (blocId: string) => elections.candidatos?.find((c) => c.blocId === blocId)?.name;

  const municipal = politics?.eleicao_municipal;
  const general = politics?.eleicao_geral;

  return (
    <>
      <Card
        title="Eleições"
        subtitle={`Mandatos de ${TERM_MONTHS} meses. Pleito municipal no mês ${elections.mesEleicaoMunicipal + 1} e geral no mês ${elections.mesEleicaoGeral + 1}.`}>
        {politics ? (
          <>
            <View style={styles.row}>
              <Text variant="body">Intenção de voto do governo</Text>
              <Text variant="label" tabular>
                {formatPercent(politics.votingIntention, VOTING_INTENTION_META.decimals)}
              </Text>
            </View>
            <Text variant="caption" color="textSecondary">
              Pesquisa mensal: memória do eleitor (a aprovação recente, com peso maior nos últimos meses) mais os
              efeitos do calendário eleitoral.
            </Text>
            <Button
              label={whyOpen ? 'Fechar "Por que mudou?"' : 'Por que mudou na intenção de voto?'}
              variant="ghost"
              onPress={() => setWhyOpen((cur) => !cur)}
            />
          </>
        ) : (
          <Text variant="body" color="textSecondary">
            A primeira pesquisa de intenção de voto sai depois do primeiro mês encerrado.
          </Text>
        )}

        {declared !== null ? (
          <Text variant="caption" color="accent">
            ● Candidatura à reeleição declarada em {monthLabel(declared)}.
          </Text>
        ) : (
          <>
            <Button
              label={declareDraft ? 'Declarar candidatura (na agenda)' : 'Declarar candidatura à reeleição'}
              variant={declareDraft ? 'secondary' : 'primary'}
              disabled={!declareValid || !fitsDecision(declareDecision)}
              onPress={() => onToggle(declareDecision)}
              block
            />
            {!declareValid && (
              <Text variant="caption" color="textMuted">
                {declareHint}
              </Text>
            )}
          </>
        )}

        {apoiado !== null ? (
          <Text variant="caption" color="textSecondary">
            Apoio na sucessão anunciado: {blocName(apoiado)}.
          </Text>
        ) : (
          <>
            <Text variant="label">Sucessão: apoiar um bloco</Text>
            <View style={styles.filters}>
              {content.scenario.blocs.map((bloc) => {
                const decision = supportDecision(bloc.id);
                const valid =
                  validateActionTarget(AGENDA_ACTIONS[SUPPORT_CANDIDATE_ACTION_ID], decision, state, content) === null;
                const picked = draftedBloc === bloc.id;
                const candidate = candidateName(bloc.id);
                return (
                  <Button
                    key={bloc.id}
                    label={`${picked ? 'Retirar apoio a' : 'Apoiar'} ${bloc.name}${candidate ? ` (${candidate})` : ''}`}
                    variant={picked ? 'secondary' : 'ghost'}
                    disabled={!valid || !fitsDecision(decision)}
                    onPress={() => onToggle(decision)}
                  />
                );
              })}
            </View>
            {!inWindow && (
              <Text variant="caption" color="textMuted">
                {windowText} O apoio vale uma vez por campanha e sobe a relação com o bloco.
              </Text>
            )}
          </>
        )}

        {(municipal || general) && (
          <Text variant="caption" color="textSecondary">
            {municipal ? `Eleições municipais de ${monthLabel(municipal.monthIndex)} realizadas. ` : ''}
            {general
              ? `Eleição geral de ${monthLabel(general.monthIndex)}: ${
                  general.candidatura ? 'candidatura própria' : 'sucessor apoiado'
                }, ${general.venceu ? 'vitória' : 'derrota'}${general.turno2 ? ' no 2º turno' : ' no 1º turno'}.`
              : ''}
          </Text>
        )}
      </Card>
      {whyOpen && <WhyChanged indicator="votingIntention" report={report} />}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
});
