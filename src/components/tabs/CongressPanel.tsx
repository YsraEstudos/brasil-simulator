import { StyleSheet, View } from 'react-native';

import { shortMonthLabel } from '@/components/campaign/labels';
import { Card, formatNumber, formatPercent, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { blocRelation } from '@/engine/congress/congress';
import { loadContent } from '@/content';
import { CHAMBER_SEATS, SENATE_SEATS, type Bloc } from '@/types/scenario';
import type { House, Proposal, VoteResult } from '@/engine';
import type { ActiveCampaign } from '@/store';

import { signedInt } from './StatRow';

/** Relação acima deste valor conta como base aproximada no painel (aproximação de interface). */
const ALLY_RELATION = 20;
/** Maioria de 3/5 para PEC, em cada turno de cada Casa (CF art. 60 §2º). */
const PEC_CHAMBER = Math.ceil((CHAMBER_SEATS * 3) / 5);
const PEC_SENATE = Math.ceil((SENATE_SEATS * 3) / 5);

const STATUS_LABEL: Partial<Record<Proposal['status'], string>> = {
  em_tramitacao: 'Em tramitação',
  parada: 'Parada',
};

const HOUSE_LABEL: Record<House, string> = { camara: 'Câmara', senado: 'Senado' };

/** Painel da aba Congresso (POLITICAL_RULES.md §6). Apoio é aproximado: não é contagem de votos. */
export function CongressPanel({ campaign }: { campaign: ActiveCampaign }) {
  const { state } = campaign;
  const content = loadContent(state.scenarioId);
  const blocs = content.scenario.blocs;

  const allies = blocs.filter((b) => blocRelation(state, b) > ALLY_RELATION);
  const allyChamber = allies.reduce((n, b) => n + b.chamberSeats, 0);
  const allySenate = allies.reduce((n, b) => n + b.senateSeats, 0);

  const proposals = state.proposals.filter((p) => p.status === 'em_tramitacao' || p.status === 'parada');

  return (
    <>
      <Card>
        <Text variant="heading">
          {`Base aproximada: ${formatNumber(allyChamber)} deputados, ${formatNumber(allySenate)} senadores (${PEC_CHAMBER}/${PEC_SENATE} para PEC)`}
        </Text>
      </Card>

      {blocs.map((bloc) => (
        <BlocCard key={bloc.id} bloc={bloc} relation={blocRelation(state, bloc)} />
      ))}

      <Card title="Propostas no Congresso">
        {proposals.length === 0 ? (
          <Text variant="body" color="textSecondary">
            Nenhuma proposta em tramitação.
          </Text>
        ) : (
          proposals.map((p) => (
            <ProposalItem key={p.id} proposal={p} name={content.policies[p.policyId]?.name ?? p.policyId} />
          ))
        )}
      </Card>
    </>
  );
}

function BlocCard({ bloc, relation }: { bloc: Bloc; relation: number }) {
  return (
    <Card
      title={bloc.name}
      subtitle={`Câmara: ${formatNumber(bloc.chamberSeats)} cadeiras · Senado: ${formatNumber(bloc.senateSeats)} cadeiras`}>
      <View style={styles.relationHeader}>
        <Text variant="label">Relação com o governo</Text>
        <Text variant="heading" tabular>
          {signedInt(relation)}
        </Text>
      </View>
      <RelationBar name={bloc.name} value={relation} />
      <Text variant="caption" color="textSecondary">
        {`Coesão: ${formatPercent(bloc.cohesion, 0)}`}
      </Text>
    </Card>
  );
}

/** Barra de −100 a +100 com o centro no zero. A cor reforça o sinal; o texto com o número é o sinal principal. */
function RelationBar({ name, value }: { name: string; value: number }) {
  const { colors } = useTheme();
  const width = `${Math.abs(value) / 2}%` as const;
  const positive = value >= 0;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: -100, max: 100, now: Math.round(value) }}
      accessibilityLabel={`Relação com o governo do bloco ${name}: ${signedInt(value)}, em uma escala de −100 a +100`}
      style={[styles.track, { backgroundColor: colors.surfaceRaised }]}>
      <View style={[styles.centerLine, { backgroundColor: colors.textMuted }]} />
      <View
        style={[
          styles.fill,
          positive
            ? { left: '50%', width, backgroundColor: colors.positive }
            : { right: '50%', width, backgroundColor: colors.negative },
        ]}
      />
    </View>
  );
}

function ProposalItem({ proposal, name }: { proposal: Proposal; name: string }) {
  const lastVote: VoteResult | undefined = proposal.votes[proposal.votes.length - 1];
  return (
    <Card title={name} subtitle={STATUS_LABEL[proposal.status]} style={styles.nested}>
      {proposal.voteMonth !== null ? (
        <Text variant="body">{`Votação prevista: ${shortMonthLabel(proposal.voteMonth)}`}</Text>
      ) : null}
      {lastVote ? <Text variant="body">{formatVote(lastVote)}</Text> : null}
    </Card>
  );
}

/** "Câmara: 301 sim × 212 não (exigidos 257)"; turnos após o primeiro são indicados. */
function formatVote(vote: VoteResult): string {
  const turn = vote.round > 1 ? ` (${vote.round}º turno)` : '';
  return `${HOUSE_LABEL[vote.house]}${turn}: ${formatNumber(vote.yes)} sim × ${formatNumber(vote.no)} não (exigidos ${formatNumber(vote.required)})`;
}

const styles = StyleSheet.create({
  relationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  track: { height: 12, borderRadius: 6, overflow: 'hidden', marginVertical: Spacing.one },
  centerLine: { position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1 },
  fill: { position: 'absolute', top: 0, bottom: 0 },
  nested: { borderWidth: 0, paddingHorizontal: 0, paddingVertical: Spacing.one },
});
