import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { INSTRUMENT_LABEL, PROPOSAL_STATUS_LABEL, costText, shortMonthLabel } from '@/components/campaign/labels';
import { ProposalList, ProposalTrail } from '@/components/campaign/ProposalList';
import { CongressHemicycle } from '@/components/congress/CongressHemicycle';
import { Button, Card, formatNumber, formatPercent, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { loadContent } from '@/content';
import {
  AGENDA_ACTIONS,
  AMENDMENTS_ACTION_ID,
  appointedJustices,
  courtVacancies,
  expectedNominationYes,
  NOMINATE_JUSTICE_ACTION_ID,
  NOMINEE_LABEL,
  type CourtNomineeProfile,
  APPOINT_ACTION_ID,
  blocRelation,
  CASE_STAGE_LABEL,
  caseRiskBand,
  caseSubjectHeld,
  CONCEDE_ACTION_ID,
  currentHouse,
  DEFEND_CASE_ACTION_ID,
  DRAWER_ACTION_ID,
  drawerEnabled,
  drawerRequests,
  drawerStance,
  isOpenCase,
  DIRECTORATE_ACTION_ID,
  directorateOccupant,
  directorateScandalChance,
  directoratesOf,
  isClosedGate,
  housePresident,
  legislativeInstrument,
  ministriesOf,
  ministryOccupant,
  ministryScandalChance,
  NEGOTIATE_ACTION_ID,
  pautaOccupancy,
  proposalForecast,
  sessionAt,
  URGENCY_ACTION_ID,
  validateActionTarget,
  type Decision,
  type GameContent,
  type GameState,
  type House,
  type Proposal,
} from '@/engine';
import { useTheme } from '@/hooks/use-theme';
import { draftCost, findDecision, fits, gameStore, hasDecision, useGame, type ActiveCampaign } from '@/store';
import { TECHNICAL_MINISTER, type Bloc, type Directorate, type Ministry } from '@/types/scenario';

import { signedInt } from './StatRow';

const HOUSES: readonly House[] = ['camara', 'senado'];
const HOUSE_LABEL: Record<House, string> = { camara: 'Câmara', senado: 'Senado' };
/** Situações mostradas em "Propostas no Congresso". */
const IN_CONGRESS = new Set(['em_tramitacao', 'parada', 'apreciacao_veto']);

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
    toggle: (d: Decision) => gameStore.getState().toggleDecision(d),
  };

  // Veto aos acréscimos de uma lei já em execução também aguarda sessão do Congresso.
  const inCongress = (p: Proposal) => IN_CONGRESS.has(p.status) || pendingVeto(p);
  const proposals = state.proposals.filter(inCongress);
  const closed = state.proposals.filter((p) => !inCongress(p));

  return (
    <>
      <CongressHemicycle state={state} content={content} actionsUsed={actionsUsed} actionsMax={actionsMax} />

      <Card title="Mesas e pauta">
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

      <Card title="Propostas no Congresso">
        {proposals.length === 0 ? (
          <Text variant="body" color="textSecondary">
            Nenhuma proposta em tramitação.
          </Text>
        ) : (
          proposals.map((p) => <ProposalItem key={p.id} proposal={p} state={state} content={content} agenda={agenda} />)
        )}
      </Card>

      {closed.length > 0 ? <ProposalList proposals={closed} content={content} /> : null}

      {blocs.map((bloc) => (
        <BlocCard key={bloc.id} bloc={bloc} state={state} content={content} />
      ))}

      <MinistriesCard state={state} content={content} agenda={agenda} />
      <CourtCard state={state} content={content} agenda={agenda} />
      <DirectoratesCard state={state} content={content} agenda={agenda} />
      <CasesCard state={state} content={content} agenda={agenda} />
      <DrawerCard state={state} content={content} agenda={agenda} />
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

function pendingVeto(p: Proposal): boolean {
  return p.veto !== null && p.veto.overridden === null;
}

function stageText(p: Proposal, content: GameContent, blocName: (id: string | null) => string): string {
  const policy = content.policies[p.policyId];
  const instrument = policy ? legislativeInstrument(policy) : null;
  if (p.status !== 'apreciacao_veto' && pendingVeto(p)) {
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
  const forecast = proposal.status === 'em_tramitacao' ? proposalForecast(state, proposal, content) : null;
  const n = proposal.negotiation;
  const negotiated = Object.entries(n.blocs)
    .filter(([, v]) => v > 0)
    .map(([id]) => blocName(id));
  const mpInForce =
    instrument === 'medida_provisoria' && (proposal.status === 'em_tramitacao' || proposal.status === 'parada');
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
      {forecast ? (
        <Text
          variant="body"
          color={
            forecast.tone === 'desfavoravel' ? 'negative' : forecast.tone === 'favoravel' ? 'positive' : 'textSecondary'
          }>
          {`Articulação: ${forecast.text}`}
        </Text>
      ) : null}
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
  const held = [
    ...ministriesOf(content)
      .filter((m) => ministryOccupant(state, m) === bloc.id)
      .map((m) => m.name),
    ...directoratesOf(content)
      .filter((d) => directorateOccupant(state, d) === bloc.id)
      .map((d) => d.name),
  ];
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
        const pending = agenda.pending(actionDecision(APPOINT_ACTION_ID, { ministryId: m.id, occupant: '' }));
        const pendingOccupant = typeof pending?.params?.occupant === 'string' ? pending.params.occupant : null;
        const options = [TECHNICAL_MINISTER, ...content.scenario.blocs.map((b) => b.id)].filter((o) => o !== occupant);
        return (
          <View key={m.id} style={styles.row}>
            <Text variant="label">{m.name}</Text>
            <Text variant="body" color="textSecondary">
              {`${occupantName(occupant)} · peso ${formatPercent(m.weight, 0)}${risk > 0 ? ` · risco de escândalo ${formatPercent(risk, 1)} ao mês` : ''}`}
            </Text>
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

/**
 * Diretorias de estatais (PLANO_CAMPANHA.md Fase C6a): mesmo desenho dos ministérios. Mostra o ministério ao qual
 * cada uma se vincula e avisa quando o mesmo bloco ocupa os dois ("porteira fechada"), que aumenta o risco.
 */
function DirectoratesCard({
  state,
  content,
  agenda,
}: {
  state: GameState;
  content: GameContent;
  agenda: AgendaHelpers;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const directorates = directoratesOf(content);
  if (directorates.length === 0) return null;
  const blocName = (o: string) => content.scenario.blocs.find((b) => b.id === o)?.name ?? o;
  const occupantName = (o: string) => (o === TECHNICAL_MINISTER ? 'quadro técnico' : `indicação: ${blocName(o)}`);
  const ministryName = (id: string) => ministriesOf(content).find((m) => m.id === id)?.name ?? id;

  return (
    <Card
      title="Diretorias de estatais"
      subtitle="Ficção: estatais e bancos públicos genéricos. Diretoria entregue a um bloco rende um pouco de apoio nas votações, mas acumula risco de escândalo, maior quando o mesmo bloco tem o ministério da área. Tirar o cargo de um bloco custa capital e a relação com ele.">
      {directorates.map((d: Directorate) => {
        const occupant = directorateOccupant(state, d);
        const risk = directorateScandalChance(state, content, d);
        const closed = isClosedGate(state, content, d);
        const pending = agenda.pending(actionDecision(DIRECTORATE_ACTION_ID, { directorateId: d.id, occupant: '' }));
        const pendingOccupant = typeof pending?.params?.occupant === 'string' ? pending.params.occupant : null;
        const options = [TECHNICAL_MINISTER, ...content.scenario.blocs.map((b) => b.id)].filter((o) => o !== occupant);
        return (
          <View key={d.id} style={styles.row}>
            <Text variant="label">{d.name}</Text>
            <Text variant="body" color="textSecondary">
              {`${occupantName(occupant)} · vinculada a ${ministryName(d.ministryId)} · peso ${formatPercent(d.weight, 0)}${risk > 0 ? ` · risco de escândalo ${formatPercent(risk, 1)} ao mês` : ''}`}
            </Text>
            {closed ? (
              <Text variant="caption" color="negative">
                O mesmo bloco ocupa o ministério da área: o risco de escândalo é maior.
              </Text>
            ) : null}
            {pendingOccupant ? (
              <Text variant="caption" color="accent">
                {`● Na agenda: ${occupantName(pendingOccupant)}`}
              </Text>
            ) : null}
            <Button
              label={open === d.id ? 'Fechar' : 'Trocar ocupante…'}
              variant="ghost"
              onPress={() => setOpen((cur) => (cur === d.id ? null : d.id))}
              block
            />
            {open === d.id
              ? options.map((o) => (
                  <ActionButton
                    key={o}
                    decision={actionDecision(DIRECTORATE_ACTION_ID, { directorateId: d.id, occupant: o })}
                    label={o === TECHNICAL_MINISTER ? 'Nomear técnico' : `Entregar ao bloco ${blocName(o)}`}
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

/**
 * Casos de escândalo (PLANO_CAMPANHA.md Fase C6b): etapa, tempo na etapa e faixa de risco atual de avançar, sem
 * número do motor. Os abertos vêm primeiro; defender entra na agenda do mês.
 */
function CasesCard({ state, content, agenda }: { state: GameState; content: GameContent; agenda: AgendaHelpers }) {
  const cases = [...(state.cases ?? [])].sort((a, b) => Number(isOpenCase(b)) - Number(isOpenCase(a)));
  if (cases.length === 0) return null;
  const directorateName = (id: string) => directoratesOf(content).find((d) => d.id === id)?.name ?? id;
  const blocName = (id: string) => content.scenario.blocs.find((b) => b.id === id)?.name ?? id;

  return (
    <Card
      title="Casos de escândalo"
      subtitle="Ficção. Um caso passa por investigação, acusação formal e, só depois da acusação, condenação; investigação não é condenação. A exposição cresce enquanto o bloco segue no cargo e cai quando o indicado sai; exposição baixa arquiva o caso.">
      {cases.map((c) => {
        const open = isOpenCase(c);
        const months = state.monthIndex - c.stageMonth;
        const held = caseSubjectHeld(state, content, c);
        return (
          <View key={c.id} style={styles.row}>
            <Text variant="label">{`${directorateName(c.subjectId)} · indicação do bloco ${blocName(c.blocId)}`}</Text>
            <Text variant="body" color="textSecondary">
              {open
                ? `${CASE_STAGE_LABEL[c.stage]} ${months === 0 ? 'desde este mês' : months === 1 ? 'há 1 mês' : `há ${months} meses`} · risco de avançar: ${caseRiskBand(c.exposure, content)}`
                : `${CASE_STAGE_LABEL[c.stage]} em ${shortMonthLabel(c.stageMonth)}`}
            </Text>
            {open && !held ? (
              <Text variant="caption" color="textSecondary">
                O bloco já não ocupa o cargo: a exposição cai a cada mês.
              </Text>
            ) : null}
            {open ? (
              <ActionButton
                decision={actionDecision(DEFEND_CASE_ACTION_ID, { caseId: c.id })}
                label="Defender o caso"
                agenda={agenda}
              />
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}

const DRAWER_STANCE_TEXT = {
  arquiva: 'A presidência da Câmara é aliada: arquiva os pedidos antigos.',
  segura: 'A presidência da Câmara segura os pedidos na gaveta, sem arquivar nem abrir.',
  ameaca: 'A presidência da Câmara é hostil: com a pressão alta, pode abrir um pedido.',
} as const;

/**
 * Gaveta do impeachment (PLANO_CAMPANHA.md Fase C6e): quantos pedidos esperam, a postura da presidência da Câmara e
 * a negociação. Abrir um pedido só leva ao 1º passo da cadeia de impeachment (admissibilidade).
 */
function DrawerCard({ state, content, agenda }: { state: GameState; content: GameContent; agenda: AgendaHelpers }) {
  if (!drawerEnabled(content)) return null;
  const requests = drawerRequests(state);
  const waiting = requests.filter((r) => r.status === 'na_gaveta');
  const archived = requests.filter((r) => r.status === 'arquivado').length;
  const opened = requests.filter((r) => r.status === 'aberto').length;
  const president = housePresident(content, 'camara');

  return (
    <Card
      title="Gaveta do impeachment"
      subtitle={`Pedidos protocolados na Câmara esperam a decisão de quem a preside${president ? ` (bloco ${president.name})` : ''}. Abrir um pedido só leva à admissibilidade; a cassação continua dependendo das votações na Câmara e no Senado.`}>
      <Text variant="body">{`Na gaveta: ${waiting.length} · arquivados: ${archived} · abertos: ${opened}`}</Text>
      <Text variant="body" color={drawerStance(state, content) === 'ameaca' ? 'negative' : 'textSecondary'}>
        {DRAWER_STANCE_TEXT[drawerStance(state, content)]}
      </Text>
      {waiting.length > 0 ? (
        <ActionButton
          decision={actionDecision(DRAWER_ACTION_ID, {})}
          label="Negociar o arquivamento do pedido mais antigo"
          agenda={agenda}
        />
      ) : null}
    </Card>
  );
}

const NOMINEE_PROFILES: readonly CourtNomineeProfile[] = ['jurista', 'aliado'];

/**
 * STF (PLANO_CAMPANHA.md Fase C6d): vagas do mandato, indicação com a previsão de votos no Senado (maioria absoluta)
 * e o resultado da última votação. Só aparece depois da primeira vaga.
 */
function CourtCard({ state, content, agenda }: { state: GameState; content: GameContent; agenda: AgendaHelpers }) {
  const vacancies = courtVacancies(state);
  if (vacancies.length === 0) return null;
  const appointed = appointedJustices(state);

  return (
    <Card
      title="Supremo Tribunal Federal"
      subtitle={`Vagas abertas no mandato: o presidente indica, o Senado sabatina e vota no mês seguinte e precisa de 41 dos 81 votos. Indicados por este governo: ${appointed}. As indicações não mudam as liminares contra as medidas do governo.`}>
      {vacancies.map((v, i) => {
        const vote = v.lastVote;
        const voteText = vote
          ? ` · última votação (${shortMonthLabel(vote.monthIndex)}): ${vote.yes} votos (${vote.required} necessários), ${vote.approved ? 'aprovada' : 'rejeitada'}`
          : '';
        const status =
          v.status === 'preenchida'
            ? `Preenchida por ${NOMINEE_LABEL[v.nominee ?? 'jurista']}`
            : v.status === 'em_sabatina'
              ? `Indicação de ${NOMINEE_LABEL[v.nominee ?? 'jurista']} em sabatina, votação em ${shortMonthLabel(v.hearingMonth ?? state.monthIndex)}`
              : 'Aberta, à espera da indicação';
        return (
          <View key={v.id} style={styles.row}>
            <Text variant="label">{`Vaga ${i + 1} · aberta em ${shortMonthLabel(v.openedMonth)}`}</Text>
            <Text variant="body" color="textSecondary">
              {`${status}${voteText}`}
            </Text>
            {v.status === 'aberta'
              ? NOMINEE_PROFILES.map((profile) => (
                  <ActionButton
                    key={profile}
                    decision={actionDecision(NOMINATE_JUSTICE_ACTION_ID, { vacancyId: v.id, profile })}
                    label={`Indicar ${NOMINEE_LABEL[profile]} (previsão: ${Math.round(expectedNominationYes(state, profile, content))} votos, 41 necessários)`}
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
});
