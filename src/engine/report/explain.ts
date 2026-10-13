import type { GameContent, IndicatorKey, MonthReport } from '../types';

import { pct } from './format';

/** Variações menores que isto (em valor absoluto) não aparecem no "Por que mudou?". */
const NEGLIGIBLE_DELTA = 1e-12;

/** Nomes curtos para causas conhecidas do motor, usados quando a contribuição não traz `label`. */
export const CAUSE_LABELS: Readonly<Record<string, string>> = {
  tendencia_potencial: 'Tendência de crescimento potencial',
  inercia_hiato: 'Inércia da atividade',
  juros_bc: 'Juros do Banco Central',
  flutuacoes: 'Flutuações aleatórias',
  tendencia_emprego: 'Tendência do emprego',
  expectativas: 'Expectativas de inflação',
  atividade: 'Atividade econômica',
  tendencia_fiscal: 'Tendência fiscal',
  ciclo_receita: 'Ciclo da receita',
  tendencia_aprovacao: 'Tendência da aprovação',
  inflacao: 'Inflação',
  desemprego: 'Desemprego',
  crescimento: 'Crescimento do PIB',
  saturacao: 'Limite de saturação',
};

/** Uma causa agregada para o "Por que mudou?" de um indicador. */
export interface CauseContribution {
  cause: string;
  label: string;
  delta: number;
}

/**
 * Decompõe a variação de um indicador no mês por causa (GAME_DESIGN.md §12). A soma dos `delta` devolvidos é
 * igual à soma das contribuições do indicador. Ordenado por |delta|, do maior para o menor.
 */
export function explainIndicator(report: MonthReport, key: IndicatorKey): CauseContribution[] {
  const byCause = new Map<string, CauseContribution>();
  for (const c of report.contributions) {
    if (c.indicator !== key) continue;
    const existing = byCause.get(c.cause);
    if (existing) {
      existing.delta += c.delta;
      if (existing.label === '' && c.label) existing.label = c.label;
    } else {
      byCause.set(c.cause, { cause: c.cause, label: c.label ?? '', delta: c.delta });
    }
  }
  return [...byCause.values()]
    .map((g) => ({ ...g, label: g.label || (CAUSE_LABELS[g.cause] ?? g.cause) }))
    .filter((g) => Math.abs(g.delta) >= NEGLIGIBLE_DELTA)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** Prefixo da notícia por status de proposta. */
const PROPOSAL_HEADLINE_PREFIX: Readonly<Record<string, string>> = {
  aprovada: 'Congresso aprova',
  rejeitada: 'Congresso rejeita',
  parada: 'Tramitação parada',
  concluida: 'Concluída',
  em_tramitacao: 'Em tramitação',
};

function copomHeadline(copom: NonNullable<MonthReport['copom']>): string {
  if (copom.next === copom.previous) return `Copom mantém a Selic em ${pct(copom.next, 2)}`;
  const verb = copom.next < copom.previous ? 'corta' : 'eleva';
  return `Copom ${verb} a Selic de ${pct(copom.previous, 2)} para ${pct(copom.next, 2)}`;
}

/**
 * Manchetes curtas em português para a aba Notícias, na ordem: Copom, propostas, eventos disparados e eventos
 * resolvidos automaticamente. Nomes fictícios; títulos vêm do conteúdo.
 */
export function headlines(report: MonthReport, content: GameContent): string[] {
  const lines: string[] = [];
  if (report.copom) lines.push(copomHeadline(report.copom));

  for (const change of report.proposalChanges) {
    const prefix = PROPOSAL_HEADLINE_PREFIX[change.transition.status];
    if (!prefix) continue;
    const name = content.policies[change.policyId]?.name ?? change.policyId;
    const detail = change.transition.detail ? ` (${change.transition.detail})` : '';
    lines.push(`${prefix}: ${name}${detail}`);
  }

  const titleOf = (eventId: string): string => content.events.find((e) => e.id === eventId)?.title ?? eventId;

  for (const eventId of report.eventsFired) lines.push(`Urgente: ${titleOf(eventId)}`);

  for (const resolved of report.eventsResolved) {
    if (resolved.automatic) lines.push(`Sem resposta do governo: ${titleOf(resolved.eventId)}`);
  }

  return lines;
}
