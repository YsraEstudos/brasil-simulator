import { decisionLabel } from '@/components/campaign/agendaLabel';
import { isGraveEvent } from '@/components/campaign/eventGravity';
import { REJECTION_REASON_LABEL, shortMonthLabel } from '@/components/campaign/labels';
import { ENACTED_STATUSES, legacyProposals } from '@/components/campaign/legacyModel';
import { formatPercent } from '@/components/ui/format';
import type { DecisionRow, FiredEvent, MandateLog } from '@/database/campaignRepository';
import {
  APPOINT_ACTION_ID,
  formatEventText,
  inaugurationTurnIndex,
  ministriesOf,
  TECHNICAL_OCCUPANT,
  toCalendar,
  type DecisionRejection,
  type ElectionResult,
  type GameContent,
  type GameState,
  type Proposal,
} from '@/engine';

/**
 * Linha do tempo do mandato (PLANO_SAVES_HISTORICO.md, Fase H6, A40): leis aprovadas e rejeitadas (trilha das
 * propostas, com o mesmo critério do relatório de legado), eventos e respostas (tabela `events`), decisões
 * (`decisions`), eleições gerais (`election_results`) e trocas de ministro (nomeações aceitas e respostas que
 * demitem). O turno do banco vira mês do mandato pela posse; o que veio antes dela fica de fora. Puro.
 */

export type TimelineKind = 'lei' | 'evento' | 'decisao' | 'eleicao' | 'ministro';

export type TimelineTone = 'positive' | 'negative' | 'warning' | 'neutral';

export interface TimelineEntry {
  /** Identidade estável (lista e testes): `lei:<proposta>`, `evento:<turno>:<id>`… */
  id: string;
  monthIndex: number;
  kind: TimelineKind;
  /** Rótulo do tipo, escrito ao lado do símbolo (a cor nunca é o único sinal). */
  tag: string;
  symbol: string;
  title: string;
  detail?: string;
  /** Evento grave (escândalo, crise grave, desastre forte), como nas marcas do gráfico. */
  grave: boolean;
  tone: TimelineTone;
}

/** Mesmos símbolos das marcas do gráfico para lei aprovada (▲) e crise (◆). */
export const TIMELINE_SYMBOL = {
  leiAprovada: '▲',
  leiRejeitada: '▼',
  crise: '◆',
  evento: '●',
  resposta: '↳',
  decisao: '■',
  recusada: '✕',
  eleicao: '★',
  ministro: '⇄',
} as const;

type Content = GameContent;

function lawEntries(proposals: readonly Proposal[], content: Content): TimelineEntry[] {
  const { approved, rejected } = legacyProposals(proposals);
  const name = (p: Proposal) => content.policies[p.policyId]?.name ?? p.policyId;
  const entries: TimelineEntry[] = [];
  for (const p of approved) {
    const t = p.history.find((x) => ENACTED_STATUSES.has(x.status)) ?? p.history[p.history.length - 1];
    entries.push({
      id: `lei:${p.id}`,
      monthIndex: t?.monthIndex ?? p.createdMonth,
      kind: 'lei',
      tag: 'Lei aprovada',
      symbol: TIMELINE_SYMBOL.leiAprovada,
      title: name(p),
      detail: t?.detail || undefined,
      grave: false,
      tone: 'positive',
    });
  }
  for (const p of rejected) {
    const t = [...p.history].reverse().find((x) => x.status === 'rejeitada') ?? p.history[p.history.length - 1];
    entries.push({
      id: `lei:${p.id}`,
      monthIndex: t?.monthIndex ?? p.createdMonth,
      kind: 'lei',
      tag: 'Lei rejeitada',
      symbol: TIMELINE_SYMBOL.leiRejeitada,
      title: name(p),
      detail: t?.detail || undefined,
      grave: false,
      tone: 'negative',
    });
  }
  return entries;
}

function eventTitle(eventId: string, fired: FiredEvent | undefined, content: Content): string {
  const title = content.events.find((e) => e.id === eventId)?.title ?? eventId;
  return formatEventText(title, fired?.location, content);
}

function eventEntries(log: MandateLog, offset: number, content: Content): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const e of log.fired) {
    const monthIndex = e.turnIndex - offset;
    if (monthIndex < 0) continue;
    const grave = isGraveEvent(e.eventId, e.location);
    entries.push({
      id: `evento:${e.turnIndex}:${e.eventId}`,
      monthIndex,
      kind: 'evento',
      tag: grave ? 'Crise' : 'Evento',
      symbol: grave ? TIMELINE_SYMBOL.crise : TIMELINE_SYMBOL.evento,
      title: eventTitle(e.eventId, e, content),
      grave,
      tone: grave ? 'negative' : 'neutral',
    });
  }
  for (const c of log.choices) {
    const monthIndex = c.turnIndex - offset;
    if (monthIndex < 0) continue;
    // O disparo mais recente do mesmo evento até a resposta: dá o local congelado (e a gravidade).
    const fired = [...log.fired].reverse().find((f) => f.eventId === c.eventId && f.turnIndex <= c.turnIndex);
    const definition = content.events.find((e) => e.id === c.eventId);
    const choice = definition?.choices.find((x) => x.id === c.choiceId);
    const title = eventTitle(c.eventId, fired, content);
    entries.push({
      id: `resposta:${c.turnIndex}:${c.eventId}:${c.choiceId}`,
      monthIndex,
      kind: 'evento',
      tag: c.automatic ? 'Resposta automática' : 'Resposta',
      symbol: TIMELINE_SYMBOL.resposta,
      title: `${title}: ${choice?.label ?? c.choiceId}`,
      detail: c.automatic ? 'O prazo venceu e valeu a escolha padrão.' : undefined,
      grave: isGraveEvent(c.eventId, fired?.location),
      tone: 'neutral',
    });
    if (choice?.dismissMinister) {
      entries.push({
        id: `demissao:${c.turnIndex}:${c.eventId}`,
        monthIndex,
        kind: 'ministro',
        tag: 'Ministério',
        symbol: TIMELINE_SYMBOL.ministro,
        title: 'Demissão de ministro',
        detail: `Resposta a "${title}": sai o ministro de bloco há mais tempo no cargo (se havia algum) e entra um quadro técnico.`,
        grave: false,
        tone: 'warning',
      });
    }
  }
  return entries;
}

/** Troca os ids dos alvos (proposta, bloco, ministério) por nomes antes de montar o rótulo da decisão. */
function readableDecision(d: DecisionRow, proposals: readonly Proposal[], content: Content) {
  const params: Record<string, number | string | boolean> = { ...(d.params ?? {}) };
  const proposal = proposals.find((p) => p.id === params.proposalId);
  if (proposal) params.proposalId = content.policies[proposal.policyId]?.name ?? proposal.policyId;
  const bloc = content.scenario.blocs.find((b) => b.id === params.blocId);
  if (bloc) params.blocId = bloc.name;
  const ministry = ministriesOf(content).find((m) => m.id === params.ministryId);
  if (ministry) params.ministryId = ministry.name;
  return { policyId: d.policyId, agendaCost: 0, params };
}

function occupantText(occupant: unknown, content: Content): string {
  if (occupant === TECHNICAL_OCCUPANT || typeof occupant !== 'string') return 'quadro técnico';
  return `indicação do bloco ${content.scenario.blocs.find((b) => b.id === occupant)?.name ?? occupant}`;
}

function decisionEntries(log: MandateLog, offset: number, proposals: readonly Proposal[], content: Content) {
  const entries: TimelineEntry[] = [];
  log.decisions.forEach((d, i) => {
    const monthIndex = d.turnIndex - offset;
    if (monthIndex < 0) return;
    if (d.accepted && d.policyId === APPOINT_ACTION_ID) {
      const ministry = ministriesOf(content).find((m) => m.id === d.params?.ministryId);
      entries.push({
        id: `ministro:${d.turnIndex}:${i}`,
        monthIndex,
        kind: 'ministro',
        tag: 'Ministério',
        symbol: TIMELINE_SYMBOL.ministro,
        title: `${ministry?.name ?? 'Ministério'}: entra ${occupantText(d.params?.occupant, content)}`,
        grave: false,
        tone: 'neutral',
      });
      return;
    }
    const reason = d.rejectionReason
      ? (REJECTION_REASON_LABEL[d.rejectionReason as DecisionRejection] ?? d.rejectionReason)
      : null;
    entries.push({
      id: `decisao:${d.turnIndex}:${i}`,
      monthIndex,
      kind: 'decisao',
      tag: d.accepted ? 'Decisão' : 'Decisão recusada',
      symbol: d.accepted ? TIMELINE_SYMBOL.decisao : TIMELINE_SYMBOL.recusada,
      title: decisionLabel(readableDecision(d, proposals, content), content),
      detail: reason ? `Recusada: ${reason}.` : undefined,
      grave: false,
      tone: d.accepted ? 'neutral' : 'warning',
    });
  });
  return entries;
}

function electionEntry(e: ElectionResult): TimelineEntry {
  const rounds = e.rounds.map((r) => `${r.round}º turno: ${formatPercent(r.national, 1)} dos votos válidos`).join('; ');
  const governors =
    e.governorChanges.length === 0
      ? ''
      : ` ${e.governorChanges.length} ${e.governorChanges.length === 1 ? 'governo estadual mudou' : 'governos estaduais mudaram'} de dono.`;
  return {
    id: `eleicao:${e.monthIndex}`,
    monthIndex: e.monthIndex,
    kind: 'eleicao',
    tag: 'Eleição geral',
    symbol: TIMELINE_SYMBOL.eleicao,
    title: `${e.governmentWon ? 'Vitória' : 'Derrota'} da situação`,
    detail: `${rounds}.${governors}`,
    grave: false,
    tone: e.governmentWon ? 'positive' : 'negative',
  };
}

const KIND_ORDER: Record<TimelineKind, number> = { eleicao: 0, lei: 1, evento: 2, ministro: 3, decisao: 4 };

/**
 * Todas as entradas da partida, em ordem de mês (no mesmo mês: eleição, leis, eventos, ministérios e decisões).
 * Sem o banco (`log` nulo), só as leis, que vêm do estado.
 */
export function buildTimeline(
  state: Pick<GameState, 'proposals' | 'monthIndex' | 'career'>,
  content: Content,
  log: MandateLog | null,
): TimelineEntry[] {
  const entries = lawEntries(state.proposals, content);
  const offset = inaugurationTurnIndex(state);
  if (log && offset !== null) {
    entries.push(...eventEntries(log, offset, content));
    entries.push(...decisionEntries(log, offset, state.proposals, content));
    entries.push(...log.elections.map(electionEntry));
  }
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) =>
        a.entry.monthIndex - b.entry.monthIndex ||
        KIND_ORDER[a.entry.kind] - KIND_ORDER[b.entry.kind] ||
        a.index - b.index,
    )
    .map((x) => x.entry);
}

// ---------------------------------------------------------------------------------------------------------------
// Filtros e agrupamento
// ---------------------------------------------------------------------------------------------------------------

/** Filtros por tipo; "Crises" é o recorte dos eventos graves. */
export type TimelineFilter = TimelineKind | 'crise';

export const TIMELINE_FILTERS: readonly { id: TimelineFilter; label: string; symbol: string }[] = [
  { id: 'lei', label: 'Leis', symbol: TIMELINE_SYMBOL.leiAprovada },
  { id: 'evento', label: 'Eventos', symbol: TIMELINE_SYMBOL.evento },
  { id: 'crise', label: 'Crises', symbol: TIMELINE_SYMBOL.crise },
  { id: 'decisao', label: 'Decisões', symbol: TIMELINE_SYMBOL.decisao },
  { id: 'eleicao', label: 'Eleições', symbol: TIMELINE_SYMBOL.eleicao },
  { id: 'ministro', label: 'Ministros', symbol: TIMELINE_SYMBOL.ministro },
];

export function matchesFilter(entry: TimelineEntry, filter: TimelineFilter | null): boolean {
  if (filter === null) return true;
  if (filter === 'crise') return entry.kind === 'evento' && entry.grave;
  return entry.kind === filter;
}

export function filterTimeline(entries: readonly TimelineEntry[], filter: TimelineFilter | null): TimelineEntry[] {
  return entries.filter((e) => matchesFilter(e, filter));
}

export function timelineCounts(entries: readonly TimelineEntry[]): Record<TimelineFilter, number> {
  const counts: Record<TimelineFilter, number> = { lei: 0, evento: 0, crise: 0, decisao: 0, eleicao: 0, ministro: 0 };
  for (const e of entries) for (const f of TIMELINE_FILTERS) if (matchesFilter(e, f.id)) counts[f.id] += 1;
  return counts;
}

export interface TimelineMonth {
  monthIndex: number;
  /** "mar/2028" */
  label: string;
  entries: TimelineEntry[];
}

export interface TimelineYear {
  year: number;
  months: TimelineMonth[];
  count: number;
}

/** Meses agrupados por ano, na ordem do mandato; só meses com alguma entrada. */
export function groupByYear(entries: readonly TimelineEntry[]): TimelineYear[] {
  const years: TimelineYear[] = [];
  for (const entry of entries) {
    const { year } = toCalendar(entry.monthIndex);
    let y = years[years.length - 1];
    if (!y || y.year !== year) {
      y = { year, months: [], count: 0 };
      years.push(y);
    }
    let m = y.months[y.months.length - 1];
    if (!m || m.monthIndex !== entry.monthIndex) {
      m = { monthIndex: entry.monthIndex, label: shortMonthLabel(entry.monthIndex), entries: [] };
      y.months.push(m);
    }
    m.entries.push(entry);
    y.count += 1;
  }
  return years;
}

/** Texto do leitor de tela de uma entrada: "mar/2028, Lei aprovada: Reforma tributária. Detalhe". */
export function entryAccessibilityLabel(entry: TimelineEntry): string {
  const detail = entry.detail ? ` ${entry.detail}` : '';
  return `${shortMonthLabel(entry.monthIndex)}, ${entry.tag}: ${entry.title}.${detail}`;
}
