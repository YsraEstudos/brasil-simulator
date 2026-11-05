import { formatPointsDelta, formatSignedPercent } from '@/components/ui/format';
import type { SocietyState } from '@/engine/society/types';
import type { TurnReading } from '@/store/recentTurns';

/**
 * Variação mensal de setores e quintis na aba Sociedade (PLANO_SAVES_HISTORICO.md H8, B41). Compara o estado atual
 * com a leitura do turno anterior guardada na store. Puro: devolve texto e direção; a tela só desenha.
 */

export type ChangeDirection = 'up' | 'down' | 'flat';

export interface MonthChange {
  /** Variação relativa do valor principal (produto do setor ou renda real do quintil), fração. */
  relative: number;
  /** Variação da participação (no PIB ou na renda), fração (0,001 = 0,1 p.p.). */
  shareDelta: number;
  direction: ChangeDirection;
  /** "▲ +0,3% no mês · participação +0,1 p.p." — a seta e o sinal dizem a direção; a cor só reforça. */
  text: string;
  /** Mesmo conteúdo, por extenso, para o leitor de tela. */
  accessibilityLabel: string;
}

/** Abaixo disto (0,05%), a variação conta como estável. */
export const FLAT_CHANGE = 0.0005;

const ARROW: Record<ChangeDirection, string> = { up: '▲', down: '▼', flat: '●' };
const WORD: Record<ChangeDirection, string> = { up: 'subiu', down: 'caiu', flat: 'ficou estável' };

function directionOf(relative: number): ChangeDirection {
  return relative > FLAT_CHANGE ? 'up' : relative < -FLAT_CHANGE ? 'down' : 'flat';
}

function change(now: number, before: number, shareNow: number, shareBefore: number, what: string): MonthChange | null {
  if (!(before > 0) || !Number.isFinite(now)) return null;
  const relative = now / before - 1;
  const shareDelta = shareNow - shareBefore;
  const direction = directionOf(relative);
  const pct = formatSignedPercent(relative, 1);
  const pp = formatPointsDelta(shareDelta, 1);
  return {
    relative,
    shareDelta,
    direction,
    text: `${ARROW[direction]} ${pct} no mês · participação ${pp}`,
    accessibilityLabel: `${what} ${WORD[direction]} ${pct.replace('±', '')} no mês; participação ${pp.replace('±', '')}`,
  };
}

export interface SocietyChanges {
  sectors: Record<string, MonthChange | null>;
  quintiles: Record<string, MonthChange | null>;
}

/**
 * Variação de cada setor (produto e participação no PIB) e de cada quintil (renda real e participação na renda)
 * contra o turno anterior. `null` se não houver turno anterior guardado: a tela diz isso em vez de inventar.
 */
export function societyChanges(society: SocietyState, previous: TurnReading | undefined): SocietyChanges | null {
  if (!previous) return null;
  const sectors: Record<string, MonthChange | null> = {};
  for (const s of society.sectors) {
    const p = previous.sectors[s.id];
    sectors[s.id] = p ? change(s.output, p.output, s.share, p.share, 'Produção do setor') : null;
  }
  const quintiles: Record<string, MonthChange | null> = {};
  for (const q of society.quintiles) {
    const p = previous.quintiles[q.id];
    quintiles[q.id] = p ? change(q.realIncome, p.realIncome, q.incomeShare, p.incomeShare, 'Renda real') : null;
  }
  return { sectors, quintiles };
}
