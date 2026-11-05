import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { INSTRUMENT_LABEL, PROPOSAL_STATUS_LABEL, costText, shortMonthLabel } from '@/components/campaign/labels';
import { ProposalList, ProposalTrail } from '@/components/campaign/ProposalList';
import { requestDecision } from '@/components/campaign/gameConfirm';
import { policyKind } from '@/components/campaign/policyCatalogModel';
import { BaseScoreboard } from '@/components/congress/BaseScoreboard';
import { CongressHemicycle } from '@/components/congress/CongressHemicycle';
import {
  filterProposals,
  hasPendingVeto,
  houseScore,
  NO_PROPOSAL_FILTER,
  situationCounts,
  situationOf,
  weakestAlly,
  type ProposalFilter,
} from '@/components/congress/congressBoard';
import {
  amendmentsThisYear,
  mpDeadline,
  pautaLocks,
  scandalAlert,
  tenureText,
} from '@/components/congress/congressDeadlines';
import { ProposalFilterBar } from '@/components/congress/ProposalFilterBar';
import { VoteHistoryCard } from '@/components/congress/VoteHistoryCard';
import { VoteMeter } from '@/components/congress/VoteMeter';
import { Icon, ICONS } from '@/components/campaign/GabineteBits';
import { Alert, Button, Card, formatNumber, formatPercent, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { loadContent } from '@/content';
import {
  AGENDA_ACTIONS,
  AMENDMENTS_ACTION_ID,
  APPOINT_ACTION_ID,
  blocRelation,
  CONCEDE_ACTION_ID,
  currentHouse,
  housePresident,
  INTERESSE_EMENDAS,
  legislativeInstrument,
  ministriesOf,
  ministryOccupant,
  ministryScandalChance,
  ministrySince,
  NEGOTIATE_ACTION_ID,
  pautaOccupancy,
  predictVotes,
  sessionAt,
  toCalendar,
  URGENCY_ACTION_ID,
  validateActionTarget,
  voteEstimate,
  votingPlan,
  type Decision,
  type GameContent,
  type GameState,
  type House,
  type Proposal,
} from '@/engine';
import { useTheme } from '@/hooks/use-theme';
import { draftCost, findDecision, fits, hasDecision, useGame, type ActiveCampaign } from '@/store';
import { TECHNICAL_MINISTER, type Bloc, type Ministry } from '@/types/scenario';

import { signedInt } from './StatRow';

const HOUSES: readonly House[] = ['camara', 'senado'];
const HOUSE_LABEL: Record<House, string> = { camara: 'Câmara', senado: 'Senado' };
const PRESIDES_LABEL: Record<House, string> = { camara: 'a Câmara', senado: 'o Senado' };
const PAUTA_OF: Record<House, string> = { camara: 'da Câmara', senado: 'do Senado' };
/** Votos exigidos em cada Casa: maioria absoluta (PL, MP) e 3/5 (PEC), tirados do próprio plano de votação. */
const QUORUM_BY_HOUSE = {
  camara: { majority: votingPlan('projeto_lei')[0]!.required, pec: votingPlan('pec')[0]!.required },
  senado: { majority: votingPlan('projeto_lei')[1]!.required, pec: votingPlan('pec')[2]!.required },
};

/**
 * Subtela Congresso (POLITICAL_RULES.md §6): hemiciclo da Câmara com a base do governo, Mesas e pauta das Casas,
 * propostas por etapa com votos previstos e negociação (e as já encerradas, com histórico), blocos e ministérios. Negociar e nomear entram na
 * agenda do mês (mesmas ações do Gabinete).
 */
export function CongressPanel({ campaign }: { campaign: ActiveCampaign }) {
  const { state } = campaign;
  const content = useMemo(() => loadContent(state.scenarioId), [state.scenarioId]);
  const draft = useGame((s) => s.draft);
  const blocs = content.scenario.blocs;
  const actionsMax = state.resources.agendaActionsPerMonth;
  const actionsUsed = draftCost(draft, content);

  /** Ação com alvo: marcada, disponível (alvo válido) e cabendo nas ações. */
  const agenda = {
    included: (d: Decision) => hasDecision(draft, d),
    pending: (d: Decision) => findDecision(draft, d),
    available: (d: Decision) => {
      const action = AGENDA_ACTIONS[d.policyId];
      return action !== undefined && validateActionTarget(action, d, state, content) === null;
    },
    fits: (d: Decision) => fits(draft, d, content, actionsMax),
    toggle: (d: Decision) => requestDecision(d, content),
  };

  // Placar da base e elo mais fraco (Fase Q8).
  const relationOf = (bloc: Bloc) => blocRelation(state, bloc);
  const chamber = houseScore(blocs, relationOf, (b) => b.chamberSeats, QUORUM_BY_HOUSE.camara);
  const senate = houseScore(blocs, relationOf, (b) => b.senateSeats, QUORUM_BY_HOUSE.senado);
  const weakLink = weakestAlly(
    blocs,
    relationOf,
    (bloc) => ({
      ministries: ministriesOf(content).filter((m) => ministryOccupant(state, m) === bloc.id).length,
      demandsAmendments: bloc.interests.includes(INTERESSE_EMENDAS),
      presides: HOUSES.filter((h) => housePresident(content, h)?.id === bloc.id).map((h) => PRESIDES_LABEL[h]),
    }),
    chamber,
  );

  // Propostas: filtro por situação e tipo. Veto aos acréscimos de lei em execução conta como "no Congresso".
  const [filter, setFilter] = useState<ProposalFilter>(NO_PROPOSAL_FILTER);
  const kindOf = (policyId: string) => {
    const policy = content.policies[policyId];
    return policyKind(policy ? legislativeInstrument(policy) : null);
  };
  const counts = situationCounts(state.proposals, filter.kind, kindOf);
  const shown = filterProposals(state.proposals, filter, kindOf);
  const proposals = shown.filter((p) => situationOf(p) !== 'fora');
  const closed = shown.filter((p) => situationOf(p) === 'fora');
  const showInCongress = filter.situation !== 'fora';
  const showClosed = filter.situation === null || filter.situation === 'fora';

  // Prazos (Fase Q9): MPs que trancam a pauta e emendas liberadas no ano.
  const isMeasure = (proposalId: string) => {
    const p = state.proposals.find((x) => x.id === proposalId);
    const policy = p ? content.policies[p.policyId] : undefined;
    return policy !== undefined && legislativeInstrument(policy) === 'medida_provisoria';
  };
  const locks = pautaLocks(state.proposals, state.monthIndex, isMeasure, (proposalId) => {
    const p = state.proposals.find((x) => x.id === proposalId);
    return p ? currentHouse(p, content) : null;
  });
  const lockName = (proposalId: string) => {
    const p = state.proposals.find((x) => x.id === proposalId);
    return (p && content.policies[p.policyId]?.name) ?? 'medida provisória';
  };
  const amendments = amendmentsThisYear(state.proposals, state.monthIndex);

  return (
    <>
      {locks.map((lock) => (
        <Alert
          key={lock.proposalId}
          tone={lock.now ? 'warning' : 'info'}
          title={
            lock.now ? `Pauta ${PAUTA_OF[lock.house]} trancada` : `Pauta ${PAUTA_OF[lock.house]} tranca no mês que vem`
          }
          message={
            lock.now
              ? `A MP "${lockName(lock.proposalId)}" passou de 45 dias: as outras propostas ${PAUTA_OF[lock.house]} só são votadas depois dela.`
              : `A MP "${lockName(lock.proposalId)}" completa 45 dias no mês que vem. Se não for votada, as outras propostas ${PAUTA_OF[lock.house]} esperam.`
          }
        />
      ))}

      <CongressHemicycle state={state} content={content} actionsUsed={actionsUsed} actionsMax={actionsMax} />

      <BaseScoreboard chamber={chamber} senate={senate} weakLink={weakLink} />

      <Card
        title="Mesas e pauta"
        subtitle={`Emendas liberadas em ${toCalendar(state.monthIndex).year}: ${amendments} ${amendments === 1 ? 'vez' : 'vezes'}. O jogo não tem saldo de emendas: cada liberação vale para uma votação.`}>
        {HOUSES.map((house) => {
          const president = housePresident(content, house);
          const relation = president ? blocRelation(state, president) : 0;
          const occupied = pautaOccupancy(state.proposals, house, content);
          const unhappy = president !== null && relation < content.calibration.limiar_presidente_casa;
          return (
            <View key={house} style={styles.row}>
              <Text variant="label">{HOUSE_LABEL[house]}</Text>
              <Text variant="body">
                {`Presidência: bloco ${president?.name ?? '—'} (relação ${signedInt(relation)}) · pauta: ${occupied} de ${content.calibration.capacidade_pauta} vagas (PEC ocupa ${content.calibration.vagas_pec})`}
              </Text>
              {unhappy ? (
                <Text variant="caption" color="warning">
                  Presidência insatisfeita: pode deixar de pautar as propostas do governo.
                </Text>
              ) : null}
            </View>
          );
        })}
      </Card>

      {state.proposals.length > 0 ? (
        <Card
          title="Propostas"
          subtitle="Filtre por situação e tipo. O número em cada situação já respeita o tipo escolhido.">
          <ProposalFilterBar filter={filter} counts={counts} onChange={setFilter} />
        </Card>
      ) : null}

      {showInCongress ? (
        <Card title="Propostas no Congresso">
          {proposals.length === 0 ? (
            <Text variant="body" color="textSecondary">
              {state.proposals.length === 0 ? 'Nenhuma proposta em tramitação.' : 'Nenhuma proposta com esse filtro.'}
            </Text>
          ) : (
            proposals.map((p) => (
              <ProposalItem key={p.id} proposal={p} state={state} content={content} agenda={agenda} />
            ))
          )}
        </Card>
      ) : null}

      {showClosed && closed.length > 0 ? <ProposalList proposals={closed} content={content} /> : null}

      <VoteHistoryCard state={state} content={content} />

      {blocs.map((bloc) => (
        <BlocCard key={bloc.id} bloc={bloc} state={state} content={content} />
      ))}

      <MinistriesCard state={state} content={content} agenda={agenda} />
    </>
  );
}

interface AgendaHelpers {
  included: (d: Decision) => boolean;
  pending: (d: Decision) => Decision | undefined;
  available: (d: Decision) => boolean;
  fits: (d: Decision) => boolean;
  toggle: (d: Decision) => void;
}

function actionDecision(id: string, params: Record<string, string>): Decision {
  return { policyId: id, agendaCost: AGENDA_ACTIONS[id]?.agendaCost ?? 0, params };
}

/** Botão de ação com alvo: incluir ou retirar da agenda do mês. */
function ActionButton({ decision, label, agenda }: { decision: Decision; label: string; agenda: AgendaHelpers }) {
  const included = agenda.included(decision);
  const blocked = !included && !agenda.fits(decision);
  const cost = costText(decision.agendaCost);
  return (
    <Button
      label={included ? `Retirar: ${label}` : `${label} (${cost})`}
      variant={included ? 'secondary' : 'ghost'}
      disabled={blocked}
      accessibilityHint={blocked ? 'Ações de agenda insuficientes neste mês' : undefined}
      onPress={() => agenda.toggle(decision)}
      block
    />
  );
}

function stageText(p: Proposal, content: GameContent, blocName: (id: string | null) => string): string {
  const policy = content.policies[p.policyId];
  const instrument = policy ? legislativeInstrument(policy) : null;
  if (p.status !== 'apreciacao_veto' && hasPendingVeto(p)) {
    const when = p.voteMonth === null ? '' : `: sessão conjunta em ${shortMonthLabel(p.voteMonth)}`;
    return `Lei em vigor; veto aos acréscimos do relator em apreciação${when}.`;
  }
  if (p.status === 'apreciacao_veto') {
    return p.voteMonth === null
      ? 'Veto em apreciação.'
      : `Veto em apreciação: sessão conjunta em ${shortMonthLabel(p.voteMonth)}.`;
  }
  const session = instrument ? sessionAt(instrument, p.stage) : null;
  const house = currentHouse(p, content);
  const where = session === null ? '—' : house === null ? 'sessão conjunta' : HOUSE_LABEL[house];
  const turns = session && session.stages.length > 1 ? ' (dois turnos)' : '';
  if (p.status === 'parada') return `${where}${turns}: aguarda vaga na pauta.`;
  const date = p.voteMonth === null ? '' : ` · votação prevista em ${shortMonthLabel(p.voteMonth)}`;
  return `${where}${turns}${date} · relator: bloco ${blocName(p.rapporteur)}`;
}

function ProposalItem({
  proposal,
  state,
  content,
  agenda,
}: {
  proposal: Proposal;
  state: GameState;
  content: GameContent;
  agenda: AgendaHelpers;
}) {
  const [negotiating, setNegotiating] = useState(false);
  const [showTrail, setShowTrail] = useState(false);
  const policy = content.policies[proposal.policyId];
  const name = policy?.name ?? proposal.policyId;
  const instrument = policy ? legislativeInstrument(policy) : null;
  const blocName = (id: string | null) => content.scenario.blocs.find((b) => b.id === id)?.name ?? '—';
  // Etapas da sessão atual, com a mesma estimativa da mesa de despacho (faixa fora do Casual).
  const session = instrument && proposal.status === 'em_tramitacao' ? sessionAt(instrument, proposal.stage) : null;
  const estimates =
    policy && session
      ? predictVotes(state, policy, content, proposal)
          .slice(0, session.stages.length)
          .map((prediction) => voteEstimate(state, policy.id, prediction))
      : [];
  const n = proposal.negotiation;
  const negotiated = Object.entries(n.blocs)
    .filter(([, v]) => v > 0)
    .map(([id]) => blocName(id));
  const mpInForce =
    instrument === 'medida_provisoria' && (proposal.status === 'em_tramitacao' || proposal.status === 'parada');
  const deadline = mpInForce ? mpDeadline(proposal.createdMonth, state.monthIndex) : null;
  const facts = [
    mpInForce ? 'em vigor desde a edição (medida provisória)' : null,
    n.amendments ? 'emendas liberadas' : null,
    n.textConceded ? 'texto cedido' : null,
    n.urgency ? 'urgência' : null,
    proposal.textAltered ? 'texto alterado pelo relator' : null,
    proposal.rider > 0 ? 'acréscimos do relator' : null,
    negotiated.length > 0 ? `negociado com ${negotiated.join(', ')}` : null,
  ].filter((x): x is string => x !== null);

  const id = proposal.id;
  const actions = [
    { decision: actionDecision(AMENDMENTS_ACTION_ID, { proposalId: id }), label: 'Liberar emendas' },
    { decision: actionDecision(CONCEDE_ACTION_ID, { proposalId: id }), label: 'Ceder no texto' },
    { decision: actionDecision(URGENCY_ACTION_ID, { proposalId: id }), label: 'Pedir urgência' },
  ].filter((a) => agenda.included(a.decision) || agenda.available(a.decision));
  const blocActions = content.scenario.blocs
    .map((b) => ({
      decision: actionDecision(NEGOTIATE_ACTION_ID, { proposalId: id, blocId: b.id }),
      label: `Negociar com ${b.name}`,
    }))
    .filter((a) => agenda.included(a.decision) || agenda.available(a.decision));
  const negotiable = proposal.status === 'em_tramitacao' || proposal.status === 'parada';

  return (
    <Card
      title={name}
      subtitle={`${instrument ? INSTRUMENT_LABEL[instrument] : ''} · ${PROPOSAL_STATUS_LABEL[proposal.status]}`}
      style={styles.nested}>
      <Text variant="body">{stageText(proposal, content, blocName)}</Text>
      {deadline ? (
        <View style={styles.note}>
          <Icon name={ICONS.inProgress} size={14} color={deadline.tone} />
          <Text variant="caption" color={deadline.tone} style={styles.noteText}>
            {`${deadline.text} Último mês para votar: ${shortMonthLabel(deadline.lastMonth)}.`}
          </Text>
        </View>
      ) : null}
      {estimates.map((estimate) => (
        <VoteMeter key={estimate.label} estimate={estimate} />
      ))}
      {facts.length > 0 ? (
        <Text variant="caption" color="textSecondary">
          {facts.join(' · ')}
        </Text>
      ) : null}
      {showTrail ? <ProposalTrail proposal={proposal} /> : null}
      <Button
        label={showTrail ? 'Ocultar histórico' : 'Ver histórico'}
        variant="ghost"
        onPress={() => setShowTrail((v) => !v)}
        block
      />
      {negotiable ? (
        <View style={styles.actions}>
          {actions.map((a) => (
            <ActionButton key={a.label} decision={a.decision} label={a.label} agenda={agenda} />
          ))}
          <Button
            label={negotiating ? 'Fechar negociação com blocos' : 'Negociar com um bloco…'}
            variant="ghost"
            onPress={() => setNegotiating((v) => !v)}
            block
          />
          {negotiating
            ? blocActions.map((a) => (
                <ActionButton key={a.label} decision={a.decision} label={a.label} agenda={agenda} />
              ))
            : null}
        </View>
      ) : null}
    </Card>
  );
}

function BlocCard({ bloc, state, content }: { bloc: Bloc; state: GameState; content: GameContent }) {
  const relation = blocRelation(state, bloc);
  const held = ministriesOf(content)
    .filter((m) => ministryOccupant(state, m) === bloc.id)
    .map((m) => m.name);
  const presides = HOUSES.filter((h) => housePresident(content, h)?.id === bloc.id).map((h) => HOUSE_LABEL[h]);
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
        {`Coesão: ${formatPercent(bloc.cohesion, 0)}${presides.length > 0 ? ` · preside: ${presides.join(' e ')}` : ''}`}
      </Text>
      <Text variant="caption" color="textSecondary">
        {held.length > 0 ? `Pastas: ${held.join(', ')}` : 'Sem pastas no governo'}
      </Text>
    </Card>
  );
}

function MinistriesCard({ state, content, agenda }: { state: GameState; content: GameContent; agenda: AgendaHelpers }) {
  const [open, setOpen] = useState<string | null>(null);
  const ministries = ministriesOf(content);
  if (ministries.length === 0) return null;
  const occupantName = (o: string) =>
    o === TECHNICAL_MINISTER
      ? 'quadro técnico'
      : `indicação: ${content.scenario.blocs.find((b) => b.id === o)?.name ?? o}`;

  return (
    <Card
      title="Ministérios"
      subtitle="Pasta entregue a um bloco rende apoio nas votações, mas executa pior, pode travar políticas contrárias ao bloco e acumula risco de escândalo. Demitir indicado custa capital e a relação com o bloco.">
      {ministries.map((m: Ministry) => {
        const occupant = ministryOccupant(state, m);
        const risk = ministryScandalChance(state, m, content.calibration);
        const alert = scandalAlert(risk, content.calibration.escandalo_max_mes);
        const tenure = tenureText(ministrySince(state, m), state.monthIndex, occupant === m.occupant);
        const pending = agenda.pending(actionDecision(APPOINT_ACTION_ID, { ministryId: m.id, occupant: '' }));
        const pendingOccupant = typeof pending?.params?.occupant === 'string' ? pending.params.occupant : null;
        const options = [TECHNICAL_MINISTER, ...content.scenario.blocs.map((b) => b.id)].filter((o) => o !== occupant);
        return (
          <View key={m.id} style={styles.row}>
            <Text variant="label">{m.name}</Text>
            <Text variant="body" color="textSecondary">
              {`${occupantName(occupant)} · peso ${formatPercent(m.weight, 0)}${risk > 0 ? ` · risco de escândalo ${formatPercent(risk, 1)} ao mês` : ''}`}
            </Text>
            <Text variant="caption" color="textMuted">
              {tenure}
            </Text>
            {alert ? (
              <View style={styles.note}>
                <Icon name={ICONS.warning} size={14} color="negative" />
                <Text variant="caption" color="negative" style={styles.noteText}>
                  Risco de escândalo perto do teto: o risco cresce com o tempo no cargo. Trocar o ocupante recomeça a
                  conta; um técnico não tem esse risco.
                </Text>
              </View>
            ) : null}
            {pendingOccupant ? (
              <Text variant="caption" color="accent">
                {`● Na agenda: ${occupantName(pendingOccupant)}`}
              </Text>
            ) : null}
            <Button
              label={open === m.id ? 'Fechar' : 'Trocar ocupante…'}
              variant="ghost"
              onPress={() => setOpen((cur) => (cur === m.id ? null : m.id))}
              block
            />
            {open === m.id
              ? options.map((o) => (
                  <ActionButton
                    key={o}
                    decision={actionDecision(APPOINT_ACTION_ID, { ministryId: m.id, occupant: o })}
                    label={
                      o === TECHNICAL_MINISTER
                        ? 'Nomear técnico'
                        : `Entregar ao bloco ${content.scenario.blocs.find((b) => b.id === o)?.name ?? o}`
                    }
                    agenda={agenda}
                  />
                ))
              : null}
          </View>
        );
      })}
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

const styles = StyleSheet.create({
  relationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  track: { height: 12, borderRadius: 6, overflow: 'hidden', marginVertical: Spacing.one },
  centerLine: { position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1 },
  fill: { position: 'absolute', top: 0, bottom: 0 },
  nested: { borderWidth: 0, paddingHorizontal: 0, paddingVertical: Spacing.one },
  row: { gap: Spacing.half, paddingVertical: Spacing.one },
  actions: { gap: Spacing.one },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.one },
  noteText: { flex: 1 },
});
