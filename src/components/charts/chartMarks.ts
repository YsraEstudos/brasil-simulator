import { isGraveEvent } from '@/components/campaign/eventGravity';
import { shortMonthLabel } from '@/components/campaign/labels';
import type { FiredEvent } from '@/database/campaignRepository';
import {
  formatEventText,
  inaugurationTurnIndex,
  type EventLocation,
  type GameContent,
  type GameState,
  type Proposal,
  type ProposalStatus,
} from '@/engine';

/**
 * Marcas no gráfico do histórico (PLANO_SAVES_HISTORICO.md, Fase H5, A28): ▲ lei aprovada e ◆ crise (os mesmos
 * eventos graves da Q12). Cada marca fica no primeiro ponto da série que já mostra o efeito: o ponto `m` é o estado
 * no início do mês `m`, então o que aconteceu ao fechar o mês `m − 1` aparece no ponto `m`. Puro.
 */

export type ChartMarkKind = 'lei' | 'crise';

export interface ChartMark {
  monthIndex: number;
  kind: ChartMarkKind;
  label: string;
}

export const MARK_SYMBOL: Record<ChartMarkKind, string> = { lei: '▲', crise: '◆' };

/** Situações em que a proposta virou lei (as mesmas do relatório de legado). */
const ENACTED: ReadonlySet<ProposalStatus> = new Set<ProposalStatus>(['aprovada', 'em_execucao', 'concluida']);

/** Uma marca por lei: a primeira transição da trilha para aprovada, em execução ou concluída. */
export function lawMarks(
  proposals: readonly Pick<Proposal, 'policyId' | 'history'>[],
  policyName: (policyId: string) => string,
): ChartMark[] {
  const marks: ChartMark[] = [];
  for (const proposal of proposals) {
    const enacted = proposal.history.find((t) => ENACTED.has(t.status));
    if (enacted) marks.push({ monthIndex: enacted.monthIndex + 1, kind: 'lei', label: policyName(proposal.policyId) });
  }
  return marks;
}

export interface MarkedEvent {
  /** Mês do mandato em que o evento chegou à caixa de entrada (já é o ponto que mostra o disparo). */
  monthIndex: number;
  eventId: string;
  location?: EventLocation;
}

/** Uma marca por evento grave (escândalo, crise grave, desastre forte), como a "Edição extra" do jornal. */
export function crisisMarks(events: readonly MarkedEvent[], eventTitle: (event: MarkedEvent) => string): ChartMark[] {
  return events
    .filter((e) => isGraveEvent(e.eventId, e.location))
    .map((e) => ({ monthIndex: e.monthIndex, kind: 'crise' as const, label: eventTitle(e) }));
}

export interface MarkGroup {
  /** Mês onde o grupo é desenhado (o primeiro do grupo). */
  monthIndex: number;
  marks: ChartMark[];
  /** ▲, ◆ ou ● quando o grupo mistura leis e crises. */
  symbol: string;
  /** Texto curto do grupo ("Reforma tributária" ou "3 marcas"). */
  title: string;
  /** Texto completo, também para o leitor de tela. */
  description: string;
}

/**
 * Marcas dentro do recorte, agrupadas por mês. Com muitos meses, os grupos vizinhos se juntam em faixas de
 * `ceil(meses / maxGroups)` meses, para não sobrepor símbolos num gráfico estreito.
 */
export function groupMarks(
  marks: readonly ChartMark[],
  firstMonth: number,
  lastMonth: number,
  maxGroups = 12,
): MarkGroup[] {
  const span = Math.max(1, lastMonth - firstMonth + 1);
  const bucket = Math.max(1, Math.ceil(span / maxGroups));
  const byBucket = new Map<number, ChartMark[]>();
  const inRange = marks
    .filter((m) => m.monthIndex >= firstMonth && m.monthIndex <= lastMonth)
    .sort((a, b) => a.monthIndex - b.monthIndex || a.kind.localeCompare(b.kind));
  for (const mark of inRange) {
    const key = Math.floor((mark.monthIndex - firstMonth) / bucket);
    byBucket.set(key, [...(byBucket.get(key) ?? []), mark]);
  }
  return [...byBucket.values()].map((group) => {
    const kinds = new Set(group.map((m) => m.kind));
    const symbol = kinds.size > 1 ? '●' : MARK_SYMBOL[group[0].kind];
    const items = group.map((m) => `${MARK_SYMBOL[m.kind]} ${m.label} (${shortMonthLabel(m.monthIndex)})`);
    return {
      monthIndex: group[0].monthIndex,
      marks: group,
      symbol,
      title: group.length === 1 ? group[0].label : `${group.length} marcas`,
      description: items.join('; '),
    };
  });
}

/** Legenda das marcas, escrita abaixo do gráfico quando há alguma no recorte. */
export const MARKS_LEGEND = `${MARK_SYMBOL.lei} lei aprovada · ${MARK_SYMBOL.crise} crise · ● as duas`;

/**
 * Todas as marcas da partida: leis da trilha das propostas (estado) e crises dos eventos disparados (banco). O turno
 * do banco vira mês do mandato pela posse; eventos antes da posse ficam de fora (a série começa nela).
 */
export function campaignMarks(
  state: Pick<GameState, 'proposals' | 'monthIndex' | 'career'>,
  content: Pick<GameContent, 'policies' | 'events' | 'scenario'>,
  fired: readonly FiredEvent[] | null,
): ChartMark[] {
  const laws = lawMarks(state.proposals, (id) => content.policies[id]?.name ?? id);
  const offset = inaugurationTurnIndex(state);
  if (!fired || offset === null) return laws;
  const events = fired.map((e) => ({ ...e, monthIndex: e.turnIndex - offset })).filter((e) => e.monthIndex >= 0);
  const crises = crisisMarks(events, (e) =>
    formatEventText(content.events.find((x) => x.id === e.eventId)?.title ?? e.eventId, e.location, content),
  );
  return [...laws, ...crises];
}
