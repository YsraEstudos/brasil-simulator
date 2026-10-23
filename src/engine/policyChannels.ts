import type { Policy } from '../types/policy';

/**
 * Famílias de canais de impacto das políticas, compartilhadas pelos pareceres da mesa de despacho
 * (`report/dispatch.ts`) e pela prévia regional (`regions/preview.ts`), para que as duas leiam o mesmo saldo
 * (ECONOMIC_MODEL.md §5.2 e §5.15). Funções puras.
 */

/** Gasto: o dinheiro sai do governo para quem recebe. */
export const SPENDING_CHANNELS: ReadonlySet<string> = new Set([
  'investimento_publico',
  'custeio',
  'transferencia_baixa_renda',
  'transferencia_alta_renda',
  'despesa_obrigatoria',
]);
/** Desoneração: alívio tributário (benefício para quem paga menos). */
export const RELIEF_CHANNELS: ReadonlySet<string> = new Set(['desoneracao_consumo', 'desoneracao_renda']);
/** Receita: tributo que sai de quem paga. */
export const REVENUE_CHANNELS: ReadonlySet<string> = new Set([
  'receita_tributaria',
  'receita_renda',
  'receita_consumo',
]);

/** Soma das magnitudes dos impactos da política nos canais indicados. */
export function sumMagnitude(policy: Policy, channels: ReadonlySet<string>): number {
  return policy.impacts.reduce((n, i) => (channels.has(i.channel) ? n + i.magnitude : n), 0);
}

/** Primeiro mês de efeito (defasagem) entre os impactos dos canais indicados; `null` se nenhum. */
export function firstLag(policy: Policy, channels: ReadonlySet<string>): number | null {
  const lags = policy.impacts.filter((i) => channels.has(i.channel) && i.magnitude !== 0).map((i) => i.lagMonths);
  return lags.length > 0 ? Math.min(...lags) : null;
}

/**
 * Para quem recebe, a política é benefício (saldo de gasto e desoneração, menos receita, não negativo) ou custo
 * (corte ou tributo). Saldo zero conta como benefício, como na frase regional dos pareceres.
 */
export function fiscalDirection(policy: Policy): 'benefit' | 'cost' {
  const net =
    sumMagnitude(policy, SPENDING_CHANNELS) +
    sumMagnitude(policy, RELIEF_CHANNELS) -
    sumMagnitude(policy, REVENUE_CHANNELS);
  return net >= 0 ? 'benefit' : 'cost';
}
