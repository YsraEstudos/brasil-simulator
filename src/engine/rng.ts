/**
 * Gerador pseudoaleatório com semente (sfc32), com estado serializável.
 *
 * O estado vive dentro do GameState, então salvar e retomar uma campanha continua exatamente a mesma
 * sequência de sorteios. Só usa operações inteiras de 32 bits e soma/divisão em ponto flutuante, que são
 * idênticas em qualquer motor JavaScript (Hermes no celular, V8 nos testes). Por isso não há Box-Muller:
 * Math.log/Math.cos podem diferir no último bit entre plataformas.
 */

/** Quatro palavras de 32 bits sem sinal. */
export type RngState = readonly [number, number, number, number];

export interface Rng {
  /** Inteiro uniforme em [0, 2^32). */
  nextUint32(): number;
  /** Uniforme em [0, 1). */
  float(): number;
  /** Inteiro uniforme em [min, max] (inclusivo). */
  int(min: number, max: number): number;
  /** Verdadeiro com probabilidade p. */
  chance(p: number): boolean;
  /** Aproximação da normal padrão (Irwin–Hall com 12 uniformes): média 0, desvio 1, limitada a ±6. */
  normal(): number;
  /** Estado atual, para gravar de volta no GameState. */
  state(): RngState;
}

const UINT32 = 0x1_0000_0000;

/** Finalizador do MurmurHash3 (avalanche de 32 bits): cada bit da entrada muda cerca de metade dos bits da saída. */
function mix32(value: number): number {
  let h = value >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Semente derivada de outra com um **sal** estável: `deriveSeed(seed, salt) = mix32(mix32(seed) ^ salt)`. Pura e
 * de 32 bits (só `Math.imul` e deslocamentos: idêntica no Hermes e no V8). Serve para dar a um subsistema (ex.: o
 * clima, PLANO_GLOBO.md §6.1) um PRNG próprio a partir da semente da campanha, sem consumir sorteios do PRNG
 * principal: sementes diferentes dão derivadas diferentes, e o mesmo sal em sementes iguais dá sempre o mesmo
 * resultado. Sais de sistemas diferentes devem ser constantes distintas e **nunca mudam** depois de publicadas
 * (mudar o sal muda o clima de todas as campanhas existentes). Como em `seedRng`, só os 32 bits baixos da semente
 * contam.
 */
export function deriveSeed(seed: number, salt: number): number {
  return mix32(mix32(seed) ^ (salt >>> 0));
}

/** Espalha a semente nas quatro palavras de estado (splitmix32) e descarta os primeiros valores. */
export function seedRng(seed: number): RngState {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  const rng = createRng([next(), next(), next(), next()]);
  for (let i = 0; i < 15; i++) rng.nextUint32();
  return rng.state();
}

export function createRng(initial: RngState): Rng {
  let [a, b, c, d] = initial;

  const nextUint32 = () => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t;
  };

  const float = () => nextUint32() / UINT32;

  return {
    nextUint32,
    float,
    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
        throw new RangeError(`intervalo inválido: [${min}, ${max}]`);
      }
      return min + Math.floor(float() * (max - min + 1));
    },
    chance(p) {
      return float() < p;
    },
    normal() {
      let sum = 0;
      for (let i = 0; i < 12; i++) sum += float();
      return sum - 6;
    },
    state: () => [a, b, c, d] as const,
  };
}

/** FNV-1a de 32 bits sobre o texto (só `Math.imul`: idêntico no Hermes e no V8). */
function hashText(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/**
 * Sorteio por chave (PLANO_CAMPANHA.md §4.1): uniforme em [0, 1) que depende só da semente da campanha, do sal do
 * sistema e da chave (ex.: `['pauta_bomba', mês]`). Não consome o PRNG principal, então ligar um sistema que sorteia
 * assim não muda os demais sorteios. Mesma semente, sal e chave → mesmo valor. Sais publicados nunca mudam.
 */
export function keyedFloat(seed: number, salt: number, key: readonly (string | number)[]): number {
  return createRng(seedRng(deriveSeed(seed, (salt ^ hashText(key.join('|'))) >>> 0))).float();
}
