import { shortMonthLabel } from '@/components/campaign/labels';
import { monthOfTerm, type GameState, type ScheduledImpulse } from '@/engine';

/**
 * O que vem por aí (PLANO_SAVES_HISTORICO.md, Fase H7): efeitos temporários em andamento (D6) e a esteira dos
 * próximos 12 meses (C2), a partir dos impulsos agendados do motor (`state.impulses`) e da lua de mel. Só datas e
 * nomes: os valores têm unidades diferentes por alvo e não aparecem aqui. Puro.
 */

/** Meses da esteira, contando o mês a jogar. */
export const TIMELINE_MONTHS = 12;
/** Linhas da esteira; o resto vira "e mais N". */
export const TIMELINE_ROWS = 10;

/** Um efeito na esteira: impulsos da mesma origem e com o mesmo nome contam como um só. */
export interface ImpulseSpan {
  key: string;
  label: string;
  startMonth: number;
  /** Último mês com efeito; `null` = permanente. */
  endMonth: number | null;
}

/** Junta os impulsos da mesma origem e nome (uma política mexe em vários alvos ao mesmo tempo). */
export function impulseSpans(impulses: readonly ScheduledImpulse[]): ImpulseSpan[] {
  const byKey = new Map<string, ImpulseSpan>();
  for (const i of impulses) {
    const key = `${i.sourceId}|${i.label}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { key, label: i.label, startMonth: i.startMonth, endMonth: i.endMonth });
      continue;
    }
    prev.startMonth = Math.min(prev.startMonth, i.startMonth);
    prev.endMonth = prev.endMonth === null || i.endMonth === null ? null : Math.max(prev.endMonth, i.endMonth);
  }
  return [...byKey.values()];
}

export interface ActiveEffect {
  key: string;
  label: string;
  /** Meses que faltam, contando o mês a jogar. */
  remaining: number;
  /** Texto curto ("resta 1 mês", "restam 3 meses"). */
  remainingText: string;
  detail?: string;
}

const remainingText = (n: number) => (n === 1 ? 'resta 1 mês' : `restam ${n} meses`);

/**
 * Efeitos temporários valendo no mês a jogar (D6), do que acaba antes ao que acaba depois. Os permanentes ficam de
 * fora: não "acabam". A lua de mel entra quando o mês do mandato ainda está nela (mesma regra do motor).
 */
export function activeEffects(
  state: Pick<GameState, 'monthIndex' | 'impulses'>,
  honeymoonMonths: number,
): ActiveEffect[] {
  const m = state.monthIndex;
  const effects: ActiveEffect[] = impulseSpans(state.impulses)
    .filter((s) => s.endMonth !== null && s.startMonth <= m && s.endMonth >= m)
    .map((s) => {
      const remaining = (s.endMonth as number) - m + 1;
      return { key: s.key, label: s.label, remaining, remainingText: remainingText(remaining) };
    });
  const term = monthOfTerm(m);
  if (term < honeymoonMonths) {
    const remaining = honeymoonMonths - term;
    effects.push({
      key: 'lua_de_mel',
      label: 'Lua de mel',
      remaining,
      remainingText: remainingText(remaining),
      detail: 'Perdas de aprovação pesam menos no começo do mandato.',
    });
  }
  return effects.sort((a, b) => a.remaining - b.remaining || a.label.localeCompare(b.label, 'pt-BR'));
}

export interface TimelineRow {
  key: string;
  label: string;
  /** Coluna inicial e final na régua (0 = mês a jogar), já cortadas à janela. */
  from: number;
  to: number;
  /** O efeito começa depois do mês a jogar (C2: "começa a valer"). */
  startsLater: boolean;
  /** O efeito acaba dentro da janela (C2: "acaba"); `false` = segue depois dela ou é permanente. */
  endsInside: boolean;
  /** Descrição para o leitor de tela e para a linha de texto. */
  text: string;
}

export interface Timeline {
  firstMonth: number;
  rows: TimelineRow[];
  /** Linhas que não couberam. */
  more: number;
}

/**
 * Esteira dos próximos 12 meses (C2): o que começa a valer ou acaba na janela. Efeitos permanentes que já valem não
 * entram (não mudam nada na janela); os que ainda vão começar entram, mesmo permanentes.
 */
export function impulseTimeline(
  state: Pick<GameState, 'monthIndex' | 'impulses'>,
  months = TIMELINE_MONTHS,
  maxRows = TIMELINE_ROWS,
): Timeline {
  const first = state.monthIndex;
  const last = first + months - 1;
  const rows = impulseSpans(state.impulses)
    .filter((s) => s.startMonth <= last && (s.endMonth === null ? s.startMonth > first : s.endMonth >= first))
    .map((s): TimelineRow => {
      const startsLater = s.startMonth > first;
      const endsInside = s.endMonth !== null && s.endMonth <= last;
      const from = Math.max(s.startMonth, first) - first;
      const to = (s.endMonth === null ? last : Math.min(s.endMonth, last)) - first;
      const parts = [
        startsLater ? `começa em ${shortMonthLabel(s.startMonth)}` : 'já vale',
        s.endMonth === null
          ? 'sem data para acabar'
          : endsInside
            ? `acaba em ${shortMonthLabel(s.endMonth)}`
            : `segue até ${shortMonthLabel(s.endMonth)}`,
      ];
      return { key: s.key, label: s.label, from, to, startsLater, endsInside, text: `${s.label}: ${parts.join(', ')}` };
    })
    .sort((a, b) => a.from - b.from || a.to - b.to || a.label.localeCompare(b.label, 'pt-BR'));
  return { firstMonth: first, rows: rows.slice(0, maxRows), more: Math.max(0, rows.length - maxRows) };
}
