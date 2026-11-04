const QUOTES = [
  'Governar é escolher caminhos sem esquecer as pessoas.',
  'Um país se constrói ouvindo quem pensa diferente.',
  'O futuro começa nas decisões de cada mês.',
  'A confiança se conquista com trabalho e diálogo.',
] as const;

export function quoteForSeed(seed: number): string {
  return QUOTES[((Math.trunc(seed) % QUOTES.length) + QUOTES.length) % QUOTES.length];
}

export function nightKey(now: Date): string | null {
  return now.getHours() < 6 ? `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}` : null;
}

export function nextRailSheet<T extends string>(
  items: readonly T[],
  current: string,
  direction: -1 | 1,
  leftHanded: boolean,
): T | null {
  const index = items.indexOf(current as T);
  if (index < 0 || !items.length) return null;
  const step = leftHanded ? -direction : direction;
  return items[(index + step + items.length) % items.length];
}
