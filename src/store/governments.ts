/**
 * Contador de governos iniciados neste aparelho (PLANO_QUICK_WINS.md, D20 "Mandato nº X"). Conta cada partida criada
 * por NOVO JOGO ou RECOMEÇAR, inclusive as já apagadas, e fica em `settings` (fora do save). Não é preferência: não
 * entra em "Restaurar configurações padrão".
 */

export const GOVERNMENTS_KEY = 'governos_iniciados';

/** Valor lido do banco: só um inteiro não negativo vale; qualquer outra coisa conta como zero. */
export function resolveGovernmentCount(raw: unknown): number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? raw : 0;
}

/** Texto do contador na lista de saves; vazio antes do primeiro governo. */
export function governmentsLabel(count: number): string {
  if (count <= 0) return '';
  return `Seu ${count}º governo neste aparelho`;
}
