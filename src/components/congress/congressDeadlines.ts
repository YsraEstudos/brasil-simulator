import { MP_TRANCA_MESES, MP_VIGENCIA_MESES, toCalendar, type House, type Proposal } from '@/engine';

/**
 * Prazos e riscos do Congresso (PLANO_QUICK_WINS.md, Fase Q9): validade da MP, pauta trancada, risco de escândalo
 * nas pastas, tempo no cargo e emendas liberadas no ano. Puro: lê só números do estado e as regras exportadas do
 * motor (`MP_VIGENCIA_MESES`, `MP_TRANCA_MESES`), para o aviso nunca discordar do que o motor faz.
 */

export type DeadlineTone = 'textSecondary' | 'warning' | 'negative';

const months = (n: number) => `${n} ${n === 1 ? 'mês' : 'meses'}`;

// ---------------------------------------------------------------------------------------------------------------
// Validade da MP (B34)
// ---------------------------------------------------------------------------------------------------------------

export interface MpDeadline {
  /** Meses que ainda dá para votar, contando o atual (0 = já venceu). */
  remaining: number;
  /** Último mês em que a votação ainda conta. */
  lastMonth: number;
  text: string;
  tone: DeadlineTone;
}

/**
 * A MP vale 120 dias (4 meses no motor) desde a edição. Ao encerrar o mês em que completa esse prazo, ela perde a
 * eficácia antes da votação; por isso o último mês útil é `createdMonth + MP_VIGENCIA_MESES − 1`.
 */
export function mpDeadline(createdMonth: number, monthIndex: number): MpDeadline {
  const lastMonth = createdMonth + MP_VIGENCIA_MESES - 1;
  const remaining = Math.max(0, lastMonth - monthIndex + 1);
  if (remaining <= 1) {
    return {
      remaining,
      lastMonth,
      text: 'Último mês: se não for votada agora, perde a eficácia ao encerrar o mês.',
      tone: 'negative',
    };
  }
  return {
    remaining,
    lastMonth,
    text: `Perde a eficácia em ${months(remaining)} se não for votada.`,
    tone: remaining === 2 ? 'warning' : 'textSecondary',
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Pauta trancada (B66)
// ---------------------------------------------------------------------------------------------------------------

export interface PautaLock {
  house: House;
  proposalId: string;
  /** `true`: já tranca neste mês; `false`: passa a trancar no mês seguinte. */
  now: boolean;
}

/**
 * MPs em votação que trancam (ou vão trancar no mês que vem) a pauta da Casa em que estão: depois de 45 dias
 * (`MP_TRANCA_MESES`), as outras propostas daquela Casa não são votadas até a MP ser votada.
 */
export function pautaLocks(
  proposals: readonly Pick<Proposal, 'id' | 'status' | 'createdMonth'>[],
  monthIndex: number,
  isMeasure: (proposalId: string) => boolean,
  houseOf: (proposalId: string) => House | null,
): PautaLock[] {
  const locks: PautaLock[] = [];
  for (const p of proposals) {
    if (p.status !== 'em_tramitacao' || !isMeasure(p.id)) continue;
    const house = houseOf(p.id);
    if (house === null) continue;
    const age = monthIndex - p.createdMonth;
    if (age >= MP_TRANCA_MESES) locks.push({ house, proposalId: p.id, now: true });
    else if (age === MP_TRANCA_MESES - 1) locks.push({ house, proposalId: p.id, now: false });
  }
  return locks;
}

// ---------------------------------------------------------------------------------------------------------------
// Ministérios: escândalo e tempo no cargo (B68, B36)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Fração do teto mensal a partir da qual o risco de escândalo vira alerta. A chance do motor é mensal e tem teto
 * (`escandalo_max_mes`, hoje 3%): "70%" no plano quer dizer 70% desse teto, não 70% de chance.
 */
export const SCANDAL_ALERT_SHARE = 0.7;

export function scandalAlert(risk: number, ceiling: number): boolean {
  return ceiling > 0 && risk >= SCANDAL_ALERT_SHARE * ceiling;
}

/**
 * "No cargo desde o início do governo", "Nomeado neste mês", "No cargo há 1 ano e 3 meses". `original`: o ocupante
 * ainda é o do cenário (uma troca feita no mês 0 também grava `since = 0`).
 */
export function tenureText(since: number, monthIndex: number, original: boolean): string {
  if (original && since === 0) return 'No cargo desde o início do governo';
  const total = Math.max(0, monthIndex - since);
  if (total === 0) return 'Nomeado neste mês';
  const years = Math.floor(total / 12);
  const rest = total % 12;
  const parts = [years > 0 ? `${years} ${years === 1 ? 'ano' : 'anos'}` : '', rest > 0 ? months(rest) : ''];
  return `No cargo há ${parts.filter(Boolean).join(' e ')}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Emendas liberadas no ano (B69, D-Q1)
// ---------------------------------------------------------------------------------------------------------------

/** Causa gravada na trilha da proposta quando o governo libera emendas para a votação. */
export const AMENDMENTS_CAUSE = 'emendas_liberadas';

/** Quantas vezes o governo liberou emendas no ano civil de `monthIndex` (o motor não tem saldo de emendas). */
export function amendmentsThisYear(proposals: readonly Pick<Proposal, 'history'>[], monthIndex: number): number {
  const year = toCalendar(monthIndex).year;
  let count = 0;
  for (const p of proposals) {
    for (const t of p.history) if (t.cause === AMENDMENTS_CAUSE && toCalendar(t.monthIndex).year === year) count += 1;
  }
  return count;
}
