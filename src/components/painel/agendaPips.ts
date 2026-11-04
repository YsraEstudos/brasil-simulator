/**
 * Bolinhas das ações de agenda no HUD (PLANO_QUICK_WINS.md, B56): `●●○` com as ações já usadas cheias, como as casas
 * do Gabinete. O texto para leitores de tela diz quantas foram usadas e quantas faltam. Função pura.
 */

/** `max` casas; as `used` primeiras são cheias (●) e o resto vazio (○). O uso nunca passa do total. */
export function agendaPips(max: number, used: number): string {
  const total = Math.max(0, Math.floor(max));
  const filled = Math.min(total, Math.max(0, Math.floor(used)));
  return '●'.repeat(filled) + '○'.repeat(total - filled);
}

/** Texto equivalente às bolinhas, para leitores de tela. */
export function agendaPipsLabel(max: number, used: number): string {
  const total = Math.max(0, Math.floor(max));
  const filled = Math.min(total, Math.max(0, Math.floor(used)));
  const left = total - filled;
  const free = left === 1 ? '1 ação livre' : `${left} ações livres`;
  return `${filled} de ${total} ações de agenda usadas, ${free}`;
}
