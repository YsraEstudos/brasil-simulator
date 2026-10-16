/**
 * Formatação de números em pt-BR para o relatório e a mesa de despacho (GAME_DESIGN.md §12).
 * Sem `Intl`: vírgula decimal e sinal "−" (U+2212) são aplicados à mão, para o motor ficar igual em qualquer
 * plataforma.
 */

const MINUS_SIGN = '−';
const PERCENT_FACTOR = 100;
const MILLIONS_PER_BILLION = 1000;
/** Décimos usados em `billions` quando o valor não é inteiro. */
const BILLION_DECIMALS = 1;

/** Número com `decimals` casas, valor absoluto, vírgula decimal. */
function fixedPt(value: number, decimals: number): string {
  return Math.abs(value).toFixed(decimals).replace('.', ',');
}

/** Arredonda para `decimals` casas e diz se o resultado é zero (sem sinal para zero arredondado). */
function isZeroAfterRounding(value: number, decimals: number): boolean {
  return Number(value.toFixed(decimals)) === 0;
}

/** Fração → porcentagem em pt-BR: `pct(0.045)` → "4,5%", `pct(-0.004, 2)` → "−0,40%". */
export function pct(x: number, decimals = 1): string {
  const n = x * PERCENT_FACTOR;
  const sign = n < 0 && !isZeroAfterRounding(n, decimals) ? MINUS_SIGN : '';
  return `${sign}${fixedPt(n, decimals)}%`;
}

/** Fração → pontos percentuais com sinal: `pp(0.003)` → "+0,3 p.p.". */
export function pp(x: number, decimals = 1): string {
  const n = x * PERCENT_FACTOR;
  const zero = isZeroAfterRounding(n, decimals);
  const sign = zero ? '' : n < 0 ? MINUS_SIGN : '+';
  return `${sign}${fixedPt(n, decimals)} p.p.`;
}

/** R$ milhões → "R$ 15 bi" ou "R$ 1,5 bi": `billions(15000)`, `billions(1500)`. */
export function billions(millions: number): string {
  const bi = millions / MILLIONS_PER_BILLION;
  const rounded = Number(bi.toFixed(BILLION_DECIMALS));
  const decimals = Number.isInteger(rounded) ? 0 : BILLION_DECIMALS;
  const sign = bi < 0 && !isZeroAfterRounding(bi, decimals) ? MINUS_SIGN : '';
  return `${sign}R$ ${fixedPt(bi, decimals)} bi`;
}
